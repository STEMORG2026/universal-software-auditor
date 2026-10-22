/**
 * The one place a scanner process is started.
 *
 * Every execution policy — timeout, output bound, scratch working directory,
 * environment deny-list, network policy, refusal to run build commands — lives
 * here and nowhere else. Adapters describe *what* to run; the runner decides
 * whether and how it may run.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  ScanOptions,
  ScanResult,
  ScannerAdapter,
  ParseContext,
  ScannerCommand,
  ScannerConfig,
  ScannerFinding,
  Evidence,
  AdapterProbe,
  AdapterRun,
  ScanTarget,
} from './types.js';

export const DEFAULT_TIMEOUT_MS = 300_000;
export const OUTPUT_CAP_BYTES = 20 * 1024 * 1024;

/** Env vars stripped from every scanner child process (no credential leakage). */
const ENV_ALLOW = ['HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'https_proxy', 'http_proxy'];

const ENV_DENY = [
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'NPM_CONFIG_REGISTRY',
  'NPM_CONFIG_USERCONFIG',
  'SEMGREP_APP_TOKEN',
  'SNYK_TOKEN',
  'GPR_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
];

/**
 * The environment a scanner child inherits: an allow-list, then a deny-list
 * applied over it. A scanner gets PATH and TMPDIR and nothing that carries a
 * credential — that is the whole point of the deny list existing.
 */
export function childEnv(allow: string[], prependToPath: string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    const v = process.env[key];
    if (v !== undefined && !ENV_DENY.includes(key)) env[key] = v;
  }
  if (prependToPath.length > 0) {
    const existing = env.PATH ?? '';
    env.PATH = [...prependToPath, existing].filter(Boolean).join(path.delimiter);
  }
  return env;
}

export class ScannerRunner {
  constructor(private readonly adapters: ScannerAdapter[]) {}

  /**
   * Run the selected adapters and return the manifest plus what they found.
   * `options.adapters` filters the registry; an unknown id is a loud error
   * rather than an empty run, because "0 evidence" must never be mistaken for
   * "nothing wrong".
   */
  run(options: ScanOptions): ScanResult {
    const selected = this.select(options.adapters);
    const started = new Date();
    const executionId = randomUUID();
    const resolved = path.resolve(options.target);
    // A missing target is a loud error, not an empty scan: the CLI also guards
    // this, but a library caller deserves the same honesty.
    if (!fs.existsSync(resolved)) throw new Error(`scan target not found: ${resolved}`);
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-scan-'));
    const target = {
      path: resolved,
      workdir,
      revision: detectRevision(path.resolve(options.target)),
      executionId,
    };
    const manifests: AdapterRun[] = [];
    const evidence: Evidence[] = [];
    const findings: ScannerFinding[] = [];

    try {
      copyTreeForScan(target.path, workdir);
      for (const adapter of selected) {
        const outcome = this.runAdapter(adapter, target, options);
        manifests.push(outcome.manifest);
        evidence.push(...outcome.evidence);
        findings.push(...outcome.findings);
      }
    } finally {
      fs.rmSync(workdir, { recursive: true, force: true });
    }

    const elapsed = (options.now ? options.now() : new Date()).getTime() - started.getTime();
    void elapsed; // manifest timestamps carry per-adapter timing
    return {
      manifest: {
        executionId,
        target: target.path,
        repositoryRevision: target.revision,
        timestamp: started.toISOString(),
        adapters: manifests,
        environment: {
          sandbox: 'subprocess-scratch-copy',
          network: options.network ? 'allowed' : 'denied',
          outputCapBytes: OUTPUT_CAP_BYTES,
        },
      },
      evidence,
      findings,
    };
  }

  private select(only: string[] | undefined): ScannerAdapter[] {
    if (!only || only.length === 0) return this.adapters;
    const known = new Set(this.adapters.map((a) => a.id));
    for (const id of only) {
      if (!known.has(id))
        throw new Error(`unknown scanner: ${id} (known: ${[...known].join(', ')})`);
    }
    return this.adapters.filter((a) => only.includes(a.id));
  }

  private runAdapter(
    adapter: ScannerAdapter,
    target: ScanTarget,
    options: ScanOptions,
  ): { manifest: AdapterRun; evidence: Evidence[]; findings: ScannerFinding[] } {
    // The target, so an adapter can find a scanner installed as this project's
    // own devDependency. A global binary is the fallback, not the preference.
    const probe = adapter.probe(target);
    const config = mergeConfig(adapter, options);
    const gates = runGates(adapter, probe, target, config, options);
    if (gates) return { manifest: gates, evidence: [], findings: [] };

    const command = adapter.buildCommand(target, config);
    const timeoutMs = commandTimeout(command, options);

    // Upstream stages first: a pipeline tool's evidence command reads what the
    // earlier stages wrote. A failed stage is a blind spot, not a verdict.
    const prep = runPrepare(adapter, target, command, probe.version, timeoutMs);
    if ('manifest' in prep) return { manifest: prep.manifest, evidence: [], findings: [] };
    const prepared = prep.prepared;

    const spawn = spawnScanner(adapter, target, command.argv, timeoutMs);
    if ('failure' in spawn) {
      return {
        manifest: { ...spawn.failure, prepare: prepared, evidenceCount: 0 },
        evidence: [],
        findings: [],
      };
    }

    const base: AdapterRun = {
      id: adapter.id,
      available: true,
      version: probe.version,
      command: command.argv,
      ...(prepared.length > 0 ? { prepare: prepared } : {}),
      status: 'ok',
      exitCode: spawn.exitCode,
      evidenceCount: 0,
      elapsedMs: spawn.elapsedMs,
      needsNetwork: Boolean(command.network),
    };

    const output = resolveOutput(spawn, command, target.workdir);
    if (!output.ok) {
      return {
        manifest: { ...base, status: 'error', reason: output.reason },
        evidence: [],
        findings: [],
      };
    }

    const parsed = parseSafely(adapter, output.raw, {
      adapterId: adapter.id,
      adapterVersion: probe.version,
      target,
      config,
    });
    if (!parsed.ok) {
      return {
        manifest: { ...base, status: 'error', reason: `parse failed: ${parsed.reason}` },
        evidence: [],
        findings: [],
      };
    }
    const evidence = annotateFailure(parsed.evidence, spawn);

    stampProvenance(evidence, {
      executionId: target.executionId,
      command: command.argv,
      ...(prepared.length > 0 ? { preparedBy: prepared } : {}),
      config,
      repositoryRevision: target.revision,
      timestamp: new Date(spawn.startedAt).toISOString(),
      executable: probe.executable ?? command.argv[0]!,
      timeoutMs,
      elapsedMs: spawn.elapsedMs,
    });

    return {
      manifest: {
        ...base,
        ...(output.artifact ? { artifact: output.artifact } : {}),
        evidenceCount: evidence.length,
      },
      evidence,
      findings: findingsOf(adapter, evidence),
    };
  }
}

/** Adapters opt into path (2); the default is no findings. */
function findingsOf(adapter: ScannerAdapter, evidence: Evidence[]): ScannerFinding[] {
  return adapter.findings ? adapter.findings(evidence) : [];
}

/**
 * A tool that exited non-zero left the reason on stderr, and that reason is the
 * whole diagnosis. "output was not valid JSON" is true of every failure and
 * useful for none — depcruise pointed at a project with no `src/` writes
 * `ERROR: Can't open 'src' for reading. Does it exist?` and the adapter reported
 * `Unexpected end of JSON input`.
 *
 * Only UNKNOWN rows are annotated, and only when the process actually failed:
 * a FAIL is a verdict and must stay exactly what the parser produced, and a
 * zero-exit UNKNOWN means nothing failed. The last non-empty line is taken
 * because tools print their warnings first and their error last.
 */
function annotateFailure(evidence: Evidence[], spawn: SpawnSuccess): Evidence[] {
  if (spawn.exitCode === 0) return evidence;
  const line = lastStderrLine(spawn.stderr);
  if (!line) return evidence;
  return evidence.map((item) =>
    item.status === 'UNKNOWN'
      ? { ...item, claim: `${item.claim} (exit ${spawn.exitCode}: ${line})` }
      : item,
  );
}

/** The last non-empty stderr line, trimmed and capped — errors come last. */
function lastStderrLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const line = lines[lines.length - 1] ?? '';
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

/** Default config under the project's, so a config file overrides one key. */
function mergeConfig(adapter: ScannerAdapter, options: ScanOptions): ScannerConfig {
  return { ...adapter.defaultConfig(), ...(options.config?.[adapter.id] ?? {}) };
}

/** Adapter, then run, then global default. */
function commandTimeout(command: ScannerCommand, options: ScanOptions): number {
  return command.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

/** A parse failure is never a verdict: everything it would have found is UNKNOWN. */
function parseSafely(
  adapter: ScannerAdapter,
  raw: string,
  context: ParseContext,
): { ok: true; evidence: Evidence[] } | { ok: false; reason: string } {
  try {
    return { ok: true, evidence: adapter.parse(raw, context) };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

type ArtifactRead = { ok: true; path: string; content: string } | { ok: false; reason: string };

/**
 * Run the stages a pipeline tool needs before its evidence command.
 *
 * A prepare stage produces no payload to judge, so its exit status is the only
 * signal it has. Using it to *stop* is not a verdict about the project — the
 * adapter is reported as a blind spot, never as a finding.
 */
export function runPrepare(
  adapter: ScannerAdapter,
  target: ScanTarget,
  command: ScannerCommand,
  version: string,
  timeoutMs: number,
): { prepared: string[][] } | { manifest: AdapterRun } {
  const prepared: string[][] = [];
  for (const stage of command.prepare ?? []) {
    const step = spawnScanner(adapter, target, stage.argv, stage.timeoutMs ?? timeoutMs);
    const failure =
      'failure' in step
        ? step.failure
        : step.exitCode === 0
          ? null
          : {
              id: adapter.id,
              available: true,
              version,
              command: stage.argv,
              status: 'error' as const,
              reason: `prepare stage exited with status ${step.exitCode}`,
              exitCode: step.exitCode,
              evidenceCount: 0,
              elapsedMs: step.elapsedMs,
              needsNetwork: Boolean(command.network),
            };
    if (failure) {
      return {
        manifest: { ...failure, prepare: prepared, reason: `prepare stage: ${failure.reason}` },
      };
    }
    prepared.push(stage.argv);
  }
  return { prepared };
}

/** The bytes to parse: the declared artifact if the tool writes one, else stdout. */
export function resolveOutput(
  spawn: SpawnSuccess,
  command: ScannerCommand,
  workdir: string,
): { ok: true; raw: string; artifact?: string } | { ok: false; reason: string } {
  if (!command.artifacts || command.artifacts.length === 0) {
    return { ok: true, raw: spawn.stdout };
  }
  const read = readArtifact(workdir, command.artifacts);
  if (!read.ok) return { ok: false, reason: read.reason };
  return { ok: true, raw: read.content, artifact: read.path };
}

/**
 * Read the first declared artifact that exists.
 *
 * A declared artifact that is missing is an `error` with a reason, never an
 * empty result: "the tool produced no file" and "the policy passed" are
 * different sentences and only one of them is usually true.
 */
export function readArtifact(workdir: string, declared: string[]): ArtifactRead {
  const root = path.resolve(workdir);
  for (const rel of declared) {
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      return { ok: false, reason: `artifact ${rel} resolves outside the scan workdir` };
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > OUTPUT_CAP_BYTES) {
      return {
        ok: false,
        reason: `artifact ${rel} is ${stat.size} bytes, over the output cap of ${OUTPUT_CAP_BYTES}`,
      };
    }
    return { ok: true, path: path.relative(root, abs), content: fs.readFileSync(abs, 'utf8') };
  }
  return { ok: false, reason: `declared artifact not produced: ${declared.join(', ')}` };
}

/** The two checks that can refuse a run before a process exists. */
function runGates(
  adapter: ScannerAdapter,
  probe: AdapterProbe,
  target: ScanTarget,
  config: ScannerConfig,
  options: ScanOptions,
): AdapterRun | null {
  if (!probe.available) {
    return {
      id: adapter.id,
      available: false,
      version: '',
      command: [],
      status: 'unavailable',
      reason: probe.reason ?? 'executable not found',
      evidenceCount: 0,
      elapsedMs: 0,
      needsNetwork: Boolean(adapter.needsNetwork),
    };
  }
  const command = adapter.buildCommand(target, config);
  if (command.network && !options.network) {
    return {
      id: adapter.id,
      available: true,
      version: probe.version,
      command: command.argv,
      status: 'unavailable',
      reason: adapter.networkConfigKey
        ? `needs network unless configured offline — set ${adapter.networkConfigKey}`
        : 'adapter needs network but this run denied it',
      evidenceCount: 0,
      elapsedMs: 0,
      needsNetwork: true,
    };
  }
  return null;
}

type SpawnSuccess = {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
  startedAt: number;
};
type SpawnResult = SpawnSuccess | { failure: AdapterRun };

function spawnScanner(
  adapter: ScannerAdapter,
  target: ScanTarget,
  argv: string[],
  timeoutMs: number,
): SpawnResult {
  const startedAt = Date.now();
  const proc = spawnSync(argv[0]!, argv.slice(1), {
    cwd: target.workdir,
    // The project's own bin directory first: a scanner installed as a
    // devDependency resolves the project's dependencies, a global one often
    // cannot (measured on this repo — global depcruise cruised 0 modules, the
    // devDependency cruised 108). PATH is still there for the global fallback.
    env: childEnv(ENV_ALLOW, [path.join(target.path, 'node_modules', '.bin')]),
    encoding: 'buffer',
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    maxBuffer: OUTPUT_CAP_BYTES,
  });
  const elapsedMs = Date.now() - startedAt;
  if (proc.error || proc.signal === 'SIGTERM' || proc.status === null) {
    return { failure: spawnFailure(adapter, argv, proc, timeoutMs, elapsedMs) };
  }
  return {
    stdout: proc.stdout ? proc.stdout.toString('utf8') : '',
    stderr: proc.stderr ? proc.stderr.toString('utf8') : '',
    exitCode: proc.status,
    elapsedMs,
    startedAt,
  };
}

/** A process that died (including by timeout) is a blind spot, not a verdict. */
function spawnFailure(
  adapter: ScannerAdapter,
  argv: string[],
  proc: { error?: unknown; signal?: NodeJS.Signals | null },
  timeoutMs: number,
  elapsedMs: number,
): AdapterRun {
  const timedOut =
    (proc.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT' ||
    proc.signal === 'SIGTERM';
  return {
    id: adapter.id,
    available: true,
    version: '',
    command: argv,
    status: timedOut ? 'timeout' : 'error',
    reason: timedOut
      ? `timed out after ${timeoutMs}ms`
      : `failed to start: ${(proc.error as Error | undefined)?.message ?? 'unknown error'}`,
    evidenceCount: 0,
    elapsedMs,
    needsNetwork: false,
  };
}

/** The runner owns provenance, so no adapter can invent one. */
function stampProvenance(evidence: Evidence[], provenance: Evidence['provenance']): void {
  for (const item of evidence) item.provenance = provenance;
}

/**
 * Copy the target into the scratch directory so no scanner ever runs against,
 * or writes into, the checkout.
 *
 * Skips VCS and installed dependencies: a scanner that reads `node_modules`
 * produces findings about vendored code, not about the project. The skip list
 * is deliberately short and explicit — an unexpected large tree costs time, an
 * unexpected *silent* miss costs an audit.
 */
const COPY_SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.usa']);

export function copyTreeForScan(from: string, into: string): void {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (COPY_SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(into, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTreeForScan(src, dest);
    } else if (entry.isSymbolicLink()) {
      continue;
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

/** The commit the checkout points at, or `unversioned` — never blank. */
export function detectRevision(dir: string): string {
  const head = path.join(dir, '.git', 'HEAD');
  try {
    if (fs.existsSync(head)) {
      const ref = fs.readFileSync(head, 'utf8').trim();
      if (ref.startsWith('ref:')) {
        const p = path.join(dir, '.git', ref.slice(5).trim());
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim().slice(0, 40);
      }
      return ref.slice(0, 40);
    }
  } catch {
    /* fall through */
  }
  return 'unversioned';
}
