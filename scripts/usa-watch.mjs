/**
 * Watch loop driver for continuous ingestion (ADR-0042, slice 1).
 *
 * One pass over a declarative source list: fetch (git) or reuse (local path),
 * skip unchanged snapshots, then `audit` + `evolve --all-gaps --propose` per
 * changed target. Stateless cron/systemd invokes it repeatedly; it is NOT a
 * daemon itself — a pass runs once and exits. Pass `--interval <s>` for a
 * foreground repeat loop instead.
 *
 * What this script deliberately does NOT do:
 * - never mutates `rules/` (ACCEPTs become promotion candidates in the
 *   summary manifest for human review — propose, never self-trust);
 * - never executes target code (reads only; git runs with hooks disabled);
 * - never propagates an audit gate (exit 1 = findings) as a watcher failure.
 *
 * Usage:
 *   node scripts/usa-watch.mjs --sources examples/watch.example.yaml --dry-run
 *   node scripts/usa-watch.mjs --sources .usa/sources.yaml --store .usa/watch/store
 *   node scripts/usa-watch.mjs --sources <f> --interval 3600 --max-passes 24
 *
 * Sources file (YAML subset or JSON — `{ repos: [...] }`):
 *   repos:
 *     - git: https://github.com/org/repo   # cloned under --work-root
 *       ref: main                           # branch or tag (default: remote HEAD)
 *       depth: standard                     # quick|standard|deep (default standard)
 *       shallow: true                       # opt-in: faster, but maturity signals degrade
 *     - path: ./examples/demo-app           # local dir, used read-only as-is
 *       depth: quick
 *
 * Exit codes: 0 pass complete (per-source failures are recorded, not fatal),
 * 1 a source errored or lock is held-exhausted, 2 usage/config error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST_CLI = path.join(ROOT, 'dist', 'cli.js');
const DEPTHS = ['quick', 'standard', 'deep'];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  const help = await fs.promises.readFile(fileURLToPath(import.meta.url), 'utf8');
  console.log(help.split('*/')[0].split('/**')[1].trim());
  process.exit(0);
}

function str(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

function flag(name) {
  return args.includes(name);
}

const SOURCES = str('--sources', null);
const WORK_ROOT = path.resolve(str('--work-root', '.usa/watch/work'));
const STORE = path.resolve(str('--store', '.usa/watch/store'));
const REPORTS = path.resolve(str('--reports-dir', '.usa/watch/reports'));
const BENCH_DIR = str('--bench-dir', null);
const DEFAULT_DEPTH = str('--depth', 'standard');
const ALLOW_COMMANDS = flag('--allow-commands');
const DRY_RUN = flag('--dry-run');
const INTERVAL = Number(str('--interval', '0'));
const MAX_PASSES = Number(str('--max-passes', '0'));

function fail(message) {
  console.error(`usa-watch: ${message}`);
  process.exit(2);
}

if (!SOURCES) fail('missing required --sources <file>');
if (!DEPTHS.includes(DEFAULT_DEPTH)) fail(`--depth must be one of ${DEPTHS.join('|')}`);
if (!fs.existsSync(DIST_CLI)) fail('dist/cli.js missing — run `pnpm run build` first');
if (!(INTERVAL >= 0)) fail('--interval must be a non-negative number of seconds');
if (!(MAX_PASSES >= 0)) fail('--max-passes must be a non-negative number');

/** Resolve `candidate` under `root`; throw instead of escaping (SEC-010). */
function inside(root, candidate) {
  const resolved = path.resolve(root, candidate);
  if (path.relative(root, resolved).startsWith('..')) {
    throw new Error(`path escapes its root: ${candidate}`);
  }
  return resolved;
}

function slugify(raw) {
  const base = path.basename(raw.replace(/\/+$/, '').replace(/\.git$/, ''));
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`cannot slugify source: ${raw}`);
  return slug;
}

/**
 * Minimal parser for the documented sources shape. Accepts JSON outright;
 * otherwise a strict `repos:` list of `key: value` scalars (`#` comments,
 * 2-space indent). Anything outside the shape fails closed — a source list
 * that cannot be read exactly must never be guessed at.
 */
function loadSources(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    fail(`sources file not found or unreadable: ${file}`);
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return normalizeSources(JSON.parse(trimmed), file);
  return normalizeSources(parseSubsetYaml(text, file), file);
}

function parseSubsetYaml(text, file) {
  const repos = [];
  let current = null;
  let seenRepos = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0].replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^repos:\s*$/.test(line)) {
      seenRepos = true;
      continue;
    }
    const item = /^ {2}- (\S[^:]*):\s*(.+)\s*$/.exec(line);
    const field = /^ {4}(\S[^:]*):\s*(.+)\s*$/.exec(line);
    if (item) {
      current = { [item[1]]: unquote(item[2]) };
      repos.push(current);
    } else if (field && current) {
      current[field[1]] = unquote(field[2]);
    } else {
      fail(
        `sources file ${file}: unsupported line (only \`repos:\` + \`key: value\`): ${rawLine.trim()}`,
      );
    }
  }
  if (!seenRepos) fail(`sources file ${file}: missing top-level \`repos:\``);
  return { repos };
}

function unquote(value) {
  const m = /^(['"])(.*)\1$/.exec(value.trim());
  const inner = m ? m[2] : value.trim();
  if (inner === 'true') return true;
  if (inner === 'false') return false;
  return inner;
}

function normalizeSources(doc, file) {
  if (!doc || !Array.isArray(doc.repos) || doc.repos.length === 0) {
    fail(`sources file ${file}: expected \`{ repos: [...] }\` with at least one entry`);
  }
  return doc.repos.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) fail(`sources[${i}]: must be a mapping`);
    const { git, path: localPath, ref, depth, shallow } = entry;
    if ((git && localPath) || (!git && !localPath)) {
      fail(`sources[${i}]: exactly one of \`git:\` or \`path:\` is required`);
    }
    const entryDepth = depth ?? DEFAULT_DEPTH;
    if (!DEPTHS.includes(entryDepth))
      fail(`sources[${i}]: depth must be one of ${DEPTHS.join('|')}`);
    return { git, path: localPath, ref: ref ?? null, depth: entryDepth, shallow: shallow === true };
  });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(STORE, 'watch-state.json'), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  const file = path.join(STORE, 'watch-state.json');
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** Single-flight guard: one pass at a time. Stale locks (dead pid) are taken over loudly. */
function acquireLock() {
  const file = path.join(STORE, 'watch.lock');
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    existing = null;
  }
  if (existing && Number.isInteger(existing.pid)) {
    try {
      process.kill(existing.pid, 0);
      console.error(`usa-watch: another pass is running (pid ${existing.pid}) — exiting 0`);
      process.exit(0);
    } catch {
      console.error(`warning: taking over stale lock from dead pid ${existing.pid}`);
    }
  }
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return () => {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Best effort: a leftover lock is reaped as stale on the next pass.
    }
  };
}

function gitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
}

/** Sync a git source into an owned workdir. Workdirs are scratch: reset --hard is safe here. */
function syncGit(source, workdir) {
  const hookOff = ['-c', 'core.hooksPath=/dev/null'];
  if (!fs.existsSync(workdir)) {
    const cloneArgs = source.shallow ? ['clone', '--depth', '1'] : ['clone'];
    if (source.ref) cloneArgs.push('--branch', source.ref);
    execFileSync('git', [...hookOff, ...cloneArgs, source.git, workdir], {
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });
  } else {
    execFileSync('git', [...hookOff, '-C', workdir, 'fetch', 'origin'], {
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    const ref = source.ref ?? 'HEAD';
    execFileSync('git', [...hookOff, '-C', workdir, 'checkout', ref], {
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('git', [...hookOff, '-C', workdir, 'reset', '--hard', `origin/${ref}`], {
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return execFileSync('git', [...hookOff, '-C', workdir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

/** Run a node CLI; audit exit 1 (findings) is data, only exit 2 is a hard error. */
function runCli(cliArgs) {
  const child = spawnSync(process.execPath, cliArgs, { encoding: 'utf8' });
  return { code: child.status ?? 2, out: `${child.stdout ?? ''}${child.stderr ?? ''}` };
}

function parseAuditScore(out) {
  const m = /usa (\d+(?:\.\d+)?)\/100 \(([\w /-]+)\)/.exec(out);
  return m ? { score: Number(m[1]), maturity: m[2] } : { score: null, maturity: null };
}

function parseEvolve(out) {
  const accepted = /release decision: ACCEPT/.test(out);
  const m = /(\d+) attempted · (\d+) released · (\d+) rejected/.exec(out);
  return {
    accepted,
    attempted: m ? Number(m[1]) : null,
    released: m ? Number(m[2]) : null,
    rejected: m ? Number(m[3]) : null,
  };
}

function auditAndEvolve(slug, target, source, stamp) {
  const report = path.join(REPORTS, `${slug}-${stamp}.md`);
  const auditArgs = [DIST_CLI, 'audit', target, '--out', report, '--depth', source.depth];
  if (ALLOW_COMMANDS) auditArgs.push('--allow-commands');
  const audit = runCli(auditArgs);
  if (audit.code === 2) return { error: 'audit failed (exit 2)', audit, report: null };
  const evolveArgs = [
    DIST_CLI,
    'evolve',
    target,
    '--all-gaps',
    '--propose',
    '--store',
    path.join(STORE, 'evolve', slug),
  ];
  if (BENCH_DIR) evolveArgs.push('--bench-dir', BENCH_DIR);
  const evolve = runCli(evolveArgs);
  return {
    audit: { code: audit.code, ...parseAuditScore(audit.out) },
    evolve: { code: evolve.code, ...parseEvolve(evolve.out) },
    report,
    raw: {
      auditTail: audit.out.trim().split('\n').slice(-3),
      evolveTail: evolve.out.trim().split('\n').slice(-6),
    },
  };
}

function processSource(source, state) {
  const id = source.git ?? source.path;
  const slug = slugify(String(id));
  let target;
  let changeKey;
  if (source.git) {
    const workdir = inside(WORK_ROOT, slug);
    if (DRY_RUN) return { slug, source: id, dryRun: `would sync ${source.git} → ${workdir}` };
    syncGit(source, workdir);
    target = workdir;
    changeKey = execFileSync('git', ['-C', workdir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } else {
    target = path.resolve(String(source.path));
    if (!fs.existsSync(target)) throw new Error(`local path does not exist: ${target}`);
    if (DRY_RUN) return { slug, source: id, dryRun: `would audit ${target}` };
    // Local trees have no commit to key on, so they always re-run: content
    // may have changed under us, and an audit costs seconds.
    changeKey = `local-${Date.now()}`;
  }
  if (state[slug]?.key === changeKey) return { slug, source: id, skipped: true, key: changeKey };
  const stamp = source.git ? changeKey.slice(0, 12) : new Date().toISOString().slice(0, 10);
  const result = auditAndEvolve(slug, target, source, stamp);
  if (!result.error)
    state[slug] = { key: changeKey, at: new Date().toISOString(), report: result.report };
  return { slug, source: id, key: changeKey, ...result };
}

function runPass(sources, state) {
  const results = [];
  for (const source of sources) {
    try {
      results.push(processSource(source, state));
    } catch (err) {
      results.push({
        slug: null,
        source: source.git ?? source.path,
        error: String(err.message ?? err),
      });
    }
  }
  return results;
}

function summarize(results) {
  const summary = {
    at: new Date().toISOString(),
    sources: results.length,
    audited: results.filter((r) => r.audit && !r.error).length,
    skipped: results.filter((r) => r.skipped).length,
    errored: results.filter((r) => r.error).length,
    promotions: results
      .filter((r) => r.evolve?.accepted)
      .map((r) => ({ slug: r.slug, report: r.report })),
    results,
  };
  const file = path.join(REPORTS, `watch-summary-${summary.at.replace(/[:.]/g, '-')}.json`);
  if (!DRY_RUN) fs.writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  for (const r of results) {
    if (r.dryRun) console.log(`- ${r.slug}: ${r.dryRun}`);
    else if (r.skipped)
      console.log(`- ${r.slug}: unchanged (${r.key?.slice(0, 12) ?? 'local'}), skipped`);
    else if (r.error) console.log(`- ${r.slug ?? '?'}: ERROR ${r.error}`);
    else
      console.log(
        `- ${r.slug}: audit ${r.audit.score ?? '?'}/100${r.evolve.accepted ? ' · PROMOTION CANDIDATE' : ''} → ${r.report}`,
      );
  }
  if (summary.promotions.length) {
    console.log(
      `promotions: ${summary.promotions.length} candidate(s) need human review — rules/ untouched`,
    );
  }
  if (!DRY_RUN) console.log(`summary → ${file}`);
  return summary.errored > 0 ? 1 : 0;
}

async function main() {
  const sources = loadSources(path.resolve(String(SOURCES)));
  if (!DRY_RUN) {
    for (const dir of [WORK_ROOT, STORE, REPORTS]) fs.mkdirSync(dir, { recursive: true });
  } else {
    console.log(`dry-run: would use work-root ${WORK_ROOT}, store ${STORE}, reports ${REPORTS}`);
  }
  let passes = 0;
  for (;;) {
    passes += 1;
    if (!DRY_RUN) {
      const release = acquireLock();
      try {
        const state = readState();
        const code = summarize(runPass(sources, state));
        writeState(state);
        if (code !== 0) process.exitCode = 1;
      } finally {
        release();
      }
    } else {
      summarize(runPass(sources, {}));
    }
    if (!INTERVAL || (MAX_PASSES && passes >= MAX_PASSES)) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL * 1000));
  }
}

await main();
