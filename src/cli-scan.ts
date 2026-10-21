/**
 * `usa scan` — run the Tier-1 scanner adapters and write evidence artifacts.
 *
 * This command never merges scanner output into AUDIT.md and never changes a
 * rule verdict: it produces a run manifest plus evidence, which a rule consumes
 * later through the existing `oracle` check. `usa audit` semantics are untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { str, bool, list, dryRunWrites, type Args } from './cli-args.js';
import { ScannerRunner } from './scanner/run.js';
import { enabledAdapters, scanners } from './scanner/registry.js';
import { loadScannerConfig } from './scanner/config.js';
import type { ScanResult } from './scanner/types.js';

export const SCAN_HELP = `
usa scan [path]            Run scanner adapters, write a run manifest + evidence

options
  --out <file>             Evidence report path (default .usa/evidence/<id>.md)
  --scanner <id>           Run only this adapter (repeatable, or comma list)
  --network                Allow adapters that declare they need network
  --allow-build-commands   Permit build-requiring scanners (recorded, opt-in)
  --json                   Print the manifest and evidence as JSON
`;

export function cmdScan(args: Args): number {
  if (bool(args, 'help')) {
    console.log(SCAN_HELP);
    return 0;
  }
  // `_` includes the command word itself (scan .), so the path is index 1.
  const positional = (args._[1] as string | undefined) ?? '.';
  const root = path.resolve(positional);
  if (!fs.existsSync(root)) {
    console.error(`path not found: ${root}`);
    return 1;
  }
  const runner = new ScannerRunner(scanners);
  const only = parseScanners(args);

  const result: ScanResult = runner.run({
    target: root,
    adapters: only,
    config: loadScannerConfig(root),
    network: bool(args, 'network'),
    allowBuildCommands: bool(args, 'allow-build-commands'),
  });

  if (bool(args, 'json')) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  // Mirrors `usa audit --out`: a relative path resolves against the target the
  // operator named, so the artifact lands inside that project rather than
  // wherever the process happened to start.
  const outArg =
    str(args, 'out') ?? ['.usa', 'evidence', result.manifest.executionId + '.md'].join('/');
  const out = path.resolve(root, outArg);
  if (!dryRunWrites(args, [out])) return 0;
  writeEvidenceReport(out, result);
  reportToStdout(result, out);
  return 0;
}

/** `--scanner a,b` and repeated occurrences both work. */
export function parseScanners(args: Args): string[] | undefined {
  const raw = [...list(args, 'scanner'), ...list(args, 'scanners')];
  const ids = raw
    .flatMap((entry) => entry.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export function reportToStdout(result: ScanResult, out: string): void {
  const { manifest } = result;
  console.log(`scan ${manifest.target} @ ${manifest.repositoryRevision}`);
  for (const a of manifest.adapters) {
    if (a.status === 'ok') {
      console.log(`  ✅ ${a.id} ${a.version} → ${a.evidenceCount} evidence item(s)`);
    } else {
      console.log(`  ⚠️  ${a.id} ${a.status}: ${a.reason ?? 'no detail'}`);
    }
  }
  const findings = result.findings.length;
  console.log(`${result.evidence.length} evidence · ${findings} findings → ${out}`);
}

/** A markdown artifact a human can read and a rule pack can cite. */
export function writeEvidenceReport(out: string, result: ScanResult): void {
  const { manifest, evidence, findings } = result;
  const lines: string[] = [
    '# Scanner evidence',
    '',
    `- execution: \`${manifest.executionId}\``,
    `- target: \`${manifest.target}\``,
    `- revision: \`${manifest.repositoryRevision}\``,
    `- timestamp: ${manifest.timestamp}`,
    `- sandbox: ${manifest.environment.sandbox} · network ${manifest.environment.network}`,
    '',
    '## Coverage',
    '',
    '| Adapter | Version | Status | Evidence | Time |',
    '| --- | --- | --- | --- | --- |',
    ...manifest.adapters.map(
      (a) =>
        `| ${a.id} | ${a.version || '—'} | ${a.status}${a.reason ? ` (${a.reason})` : ''} | ${a.evidenceCount} | ${a.elapsedMs}ms |`,
    ),
    '',
    '## Evidence',
    '',
  ];
  for (const e of evidence) {
    const where = e.location
      ? `${e.location.file}${e.location.line ? `:${e.location.line}` : ''}`
      : '—';
    lines.push(
      `- \`${e.id}\` **${e.source.tool}** ${e.severity} · \`${e.source.identifier}\` — ${e.claim} (${where})`,
    );
  }
  if (findings.length > 0) {
    lines.push('', '## Findings', '');
    for (const f of findings) {
      lines.push(
        `- **${f.severity}** ${f.title} — ${f.remediation} [evidence: ${f.evidenceIds.join(', ')}]`,
      );
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, lines.join('\n') + '\n');
}

/** Exported for tests: which adapters a config enables by default. */
export function defaultEnabled(): string[] {
  return enabledAdapters({}).map((a) => a.id);
}
