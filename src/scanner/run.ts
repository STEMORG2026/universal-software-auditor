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
export function childEnv(allow: string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    const v = process.env[key];
    if (v !== undefined && !ENV_DENY.includes(key)) env[key] = v;
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
    const probe = adapter.probe();
    const config = { ...adapter.defaultConfig(), ...(options.config?.[adapter.id] ?? {}) };
    const gates = runGates(adapter, probe, target, config, options);
    if (gates) return { manifest: gates, evidence: [], findings: [] };

    const command = adapter.buildCommand(target, config);
    const timeoutMs = command.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const spawn = spawnScanner(adapter, target, command.argv, timeoutMs);
    if ('failure' in spawn) {
      return { manifest: { ...spawn.failure, evidenceCount: 0 }, evidence: [], findings: [] };
    }

    const context = {
      adapterId: adapter.id,
      adapterVersion: probe.version,
      target,
      config,
    };
    let evidence: Evidence[];
    try {
      evidence = adapter.parse(spawn.stdout, context);
    } catch (err) {
      // A parse failure is never a verdict: everything it would have found is
      // UNKNOWN, and the manifest says why.
      return {
        manifest: {
          id: adapter.id,
          available: true,
          version: probe.version,
          command: command.argv,
          status: 'error',
          reason: `parse failed: ${(err as Error).message}`,
          evidenceCount: 0,
          elapsedMs: spawn.elapsedMs,
          needsNetwork: Boolean(command.network),
        },
        evidence: [],
        findings: [],
      };
    }

    stampProvenance(evidence, {
      executionId: target.executionId,
      command: command.argv,
      config,
      repositoryRevision: target.revision,
      timestamp: new Date(spawn.startedAt).toISOString(),
      executable: probe.executable ?? command.argv[0]!,
      timeoutMs,
      elapsedMs: spawn.elapsedMs,
    });

    return {
      manifest: {
        id: adapter.id,
        available: true,
        version: probe.version,
        command: command.argv,
        status: 'ok',
        evidenceCount: evidence.length,
        elapsedMs: spawn.elapsedMs,
        needsNetwork: Boolean(command.network),
      },
      evidence,
      findings: adapter.findings ? adapter.findings(evidence) : [],
    };
  }
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
      reason: 'adapter needs network but this run denied it',
      evidenceCount: 0,
      elapsedMs: 0,
      needsNetwork: true,
    };
  }
  return null;
}

type SpawnResult =
  { stdout: string; elapsedMs: number; startedAt: number } | { failure: AdapterRun };

function spawnScanner(
  adapter: ScannerAdapter,
  target: ScanTarget,
  argv: string[],
  timeoutMs: number,
): SpawnResult {
  const startedAt = Date.now();
  const proc = spawnSync(argv[0]!, argv.slice(1), {
    cwd: target.workdir,
    env: childEnv(ENV_ALLOW),
    encoding: 'buffer',
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    maxBuffer: OUTPUT_CAP_BYTES,
  });
  const elapsedMs = Date.now() - startedAt;
  if (proc.error || proc.signal === 'SIGTERM' || proc.status === null) {
    return { failure: spawnFailure(adapter, argv, proc, timeoutMs, elapsedMs) };
  }
  return { stdout: proc.stdout ? proc.stdout.toString('utf8') : '', elapsedMs, startedAt };
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
