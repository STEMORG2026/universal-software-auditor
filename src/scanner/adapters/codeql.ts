/**
 * CodeQL — Tier 1, opt-in and heavyweight.
 *
 * Two-step by nature: `database create` then `database analyze`. Both are
 * constructed here and parsed through the shared SARIF normaliser.
 *
 * Security boundary, enforced and not aspirational: **the engine never runs a
 * build command**. CodeQL's `--command` is arbitrary project code; the adapter
 * will only emit it when the project config sets
 * `allowBuildCommands: true`, which the runner refuses unless the audit opts in.
 * Enforced twice, on purpose: once here, once in the tests.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { AdapterProbe, Evidence, ScannerAdapter, ScannerConfig } from '../types.js';
import { evidenceFromSarif } from '../sarif.js';

export const codeqlAdapter: ScannerAdapter = {
  id: 'codeql',
  name: 'CodeQL data-flow analysis (opt-in)',
  needsNetwork: true,

  defaultConfig() {
    return { language: 'javascript-typescript', packs: '', allowBuildCommands: false };
  },

  probe(): AdapterProbe {
    const executable = which('codeql');
    if (!executable) {
      return {
        available: false,
        version: '',
        reason: 'codeql executable not found on PATH (download from github/codeql-action)',
      };
    }
    return { available: true, version: versionOf(executable), executable };
  },

  buildCommand(target, config: ScannerConfig) {
    const language = String(config.language ?? 'javascript-typescript');
    if (config.allowBuildCommands) {
      throw new Error(
        'allowBuildCommands must be granted by the audit, not by an adapter: the runner refuses build steps by default',
      );
    }
    return {
      argv: [
        'codeql',
        'database',
        'create',
        path.join(target.workdir, 'codeql-db'),
        '--language',
        language,
        '--source-root',
        target.path,
        '--no-run-unnecessary-builds',
      ],
      timeoutMs: 900_000,
      network: true,
    };
  },

  parse(raw: string, context): Evidence[] {
    return evidenceFromSarif(raw, {
      tool: 'codeql',
      kind: 'dataflow-finding',
      adapterVersion: context.adapterVersion,
      confidence: 1.0,
    });
  },
};

/** The analyze leg, exposed so tests and callers can build it without running create. */
export function codeqlAnalyzeCommand(db: string, packs: string, out: string): string[] {
  return ['codeql', 'database', 'analyze', db, packs, '--format=sarif-latest', `--output=${out}`];
}

function which(binary: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function versionOf(executable: string): string {
  const proc = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 30_000 });
  const match = /([\d.]+)/.exec(String(proc.stdout ?? ''));
  return match?.[1] ?? 'unknown';
}
