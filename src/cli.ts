#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { VERSION, bool, parseArgs, type Args } from './cli-args.js';
import { HELP } from './cli-help.js';
import { loadEnvFile } from './util/env.js';
import { cmdAudit } from './cli-audit.js';
import { cmdDocs } from './cli-docs.js';
import { cmdDetect, cmdRules, cmdExplain, cmdStandards, cmdCategories } from './cli-query.js';
import { cmdFoundation, cmdLive, cmdModels } from './cli-session.js';
import { cmdDiff, cmdVerifyReport } from './cli-reports.js';
import { cmdBootstrap, cmdInit, cmdLearn } from './cli-scaffold.js';
import { cmdEvolve } from './cli-evolve.js';
import { cmdServe } from './cli-serve.js';
import { cmdScan } from './cli-scan.js';

/** Dispatch only: every command lives in its own cli-*.ts module. */
/* -------------------------------------------------------------------- main -- */

const COMMANDS: Record<string, (args: Args) => number | Promise<number>> = {
  audit: cmdAudit,
  docs: cmdDocs,
  detect: cmdDetect,
  rules: cmdRules,
  explain: cmdExplain,
  diff: cmdDiff,
  'verify-report': cmdVerifyReport,
  init: cmdInit,
  bootstrap: cmdBootstrap,
  learn: cmdLearn,
  evolve: cmdEvolve,
  standards: cmdStandards,
  foundation: cmdFoundation,
  categories: cmdCategories,
  live: cmdLive,
  models: cmdModels,
  serve: cmdServe,
  scan: cmdScan,
};

/** Global --help/--version, resolved before dispatch. Returns null to continue. */
function handleTopLevelFlags(args: Args, cmd: string): number | Promise<number> | null {
  if (bool(args, 'help')) {
    // A subcommand's own help wins over the top-level text — `usa live --help`
    // used to print the generic help, orphaning LIVE_HELP_TEXT entirely.
    if (cmd === 'live') return cmdLive(args);
    if (cmd === 'docs') return cmdDocs(args);
    console.log(HELP);
    return 0;
  }
  if (bool(args, 'version')) {
    console.log(`usa ${VERSION}`);
    return 0;
  }
  return null;
}

export function main(argv: string[]): number | Promise<number> {
  // `.env` sits beside the invocation (never committed — see .gitignore), so
  // provider keys work without exporting them into every shell first. The real
  // environment always wins; this only fills gaps. No values are ever logged.
  loadEnvFile(process.cwd());
  const args = parseArgs(argv);
  const cmd = (args._[0] ?? 'audit') as string;
  const handled = handleTopLevelFlags(args, cmd);
  if (handled !== null) return handled;

  const run = COMMANDS[cmd];
  if (run) return run(args);
  switch (cmd) {
    case 'version':
    case '--version':
      console.log(`usa ${VERSION}`);
      return 0;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(HELP);
      return 2;
  }
}

/* ------------------------------------------------------------------ audit -- */

/** Resolves the report format from an explicit flag, else the --out suffix. */

function isEntryPoint(
  argv1: string | undefined = process.argv[1],
  thisUrl: string = import.meta.url,
): boolean {
  if (!argv1) return false;
  try {
    return thisUrl === pathToFileURL(fs.realpathSync(argv1)).href;
  } catch {
    return false;
  }
}

export { isEntryPoint };

if (isEntryPoint()) {
  const out = main(process.argv.slice(2));
  if (typeof out === 'number') {
    process.exit(out);
  } else {
    // Static text: an async rejection can carry provider internals (env var
    // names, endpoints, HTTP snippets) from the agent layer, and this sink
    // must never paraphrase them into logs — see the cmdLive catch above.
    // Only `live` runs async today, and it already reports its own failures.
    out.then(
      (code) => process.exit(code),
      () => {
        console.error('usa: async command failed unexpectedly (exit 2).');
        process.exit(2);
      },
    );
  }
}
