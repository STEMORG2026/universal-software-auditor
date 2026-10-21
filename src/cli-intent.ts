/**
 * `usa intent` — read a declared threat model and compare it with observed
 * evidence.
 *
 * Two questions, both deterministic:
 *   1. Which declared threats did any scanner actually observe?
 *   2. Which CWEs did the scanners observe that the model never declared?
 *
 * The second is the more useful one: it is the gap between the design the team
 * wrote down and the weaknesses the tools found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { bool, str, type Args } from './cli-args.js';
import { parseOtm, IntentFormatError } from './intent/otm.js';
import { evidenceFromScanJson, matchThreats } from './intent/match.js';
import type { IntentReport } from './intent/types.js';

export const INTENT_HELP = `
usa intent <model.json>      Read a declared threat model (OTM / Threat Dragon export)

options
  --evidence <file>        A \`usa scan --json\` payload to join against the model
  --json                   Print the report as JSON
`;

export function cmdIntent(args: Args): number {
  if (bool(args, 'help')) {
    console.log(INTENT_HELP);
    return 0;
  }
  const file = (args._[1] as string | undefined) ?? '';
  if (!file) {
    console.error('usage: usa intent <model.json> [--evidence <scan.json>]');
    return 1;
  }
  const modelPath = path.resolve(file);
  if (!fs.existsSync(modelPath)) {
    console.error(`model not found: ${modelPath}`);
    return 1;
  }

  let report: IntentReport;
  try {
    const model = parseOtm(fs.readFileSync(modelPath, 'utf8'));
    const evidencePath = str(args, 'evidence');
    const evidence = evidencePath ? readEvidence(path.resolve(evidencePath)) : [];
    report = matchThreats(model, evidence);
  } catch (err) {
    // A model that cannot be read is a usage error, not a crash.
    console.error(
      err instanceof IntentFormatError ? `intent: ${err.message}` : `${(err as Error).message}`,
    );
    return 1;
  }

  if (bool(args, 'json')) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  printReport(report, Boolean(str(args, 'evidence')));
  return 0;
}

function readEvidence(file: string): ReturnType<typeof evidenceFromScanJson> {
  if (!fs.existsSync(file)) throw new Error(`evidence not found: ${file}`);
  return evidenceFromScanJson(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function printReport(report: IntentReport, joined: boolean): void {
  printHeader(report);
  if (!joined) {
    console.log('\nNo --evidence given: the model is read but nothing is compared.');
    console.log('Run `usa scan . --json > scan.json` and pass it with --evidence.');
    return;
  }
  printMatches(report);
  printUnmodelled(report);
}

function printHeader(report: IntentReport): void {
  const { model } = report;
  console.log(`${model.project.name || 'untitled model'} (OTM ${model.version})`);
  console.log(
    `  ${model.assets.length} assets · ${model.components.length} components · ` +
      `${model.dataFlows.length} flows · ${model.trustZones.length} trust zones · ` +
      `${model.threats.length} threats · ${model.mitigations.length} mitigations`,
  );
  if (model.unrecognised.length > 0) {
    console.log(`  not modelled: ${model.unrecognised.join(', ')}`);
  }
}

function printMatches(report: IntentReport): void {
  const { matches } = report;
  const observed = matches.filter((m) => m.verdict === 'OBSERVED');
  const notObserved = matches.filter((m) => m.verdict === 'NOT_OBSERVED');
  const unknown = matches.filter((m) => m.verdict === 'UNKNOWN');
  console.log(
    `\nThreats: ${observed.length} observed · ${notObserved.length} not observed · ${unknown.length} unknown`,
  );
  for (const m of observed)
    console.log(`  ✅ ${m.threat.name} — ${m.reason} [${m.evidenceIds.join(', ')}]`);
  for (const m of notObserved) console.log(`  ⚠️  ${m.threat.name} — ${m.reason}`);
  for (const m of unknown) console.log(`  ❓ ${m.threat.name} — ${m.reason}`);
}

function printUnmodelled(report: IntentReport): void {
  if (report.unmodeled.length > 0) {
    console.log(`\nObserved but not declared in the model (${report.unmodeled.length}):`);
    for (const u of report.unmodeled)
      console.log(`  • ${u.cwe} — ${u.evidenceIds.length} evidence item(s)`);
  }
  if (report.emptyTrustZones.length > 0) {
    console.log(`\nDeclared trust zones with no component (${report.emptyTrustZones.length}):`);
    for (const z of report.emptyTrustZones)
      console.log(`  • ${z.name || z.id} (${z.type || 'untyped'})`);
  }
}
