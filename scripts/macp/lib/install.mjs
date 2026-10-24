/**
 * Onboarding: a repository, and a harness, in one command each.
 *
 * The defect this replaces is ten Markdown files and four `.mjs` scripts copied
 * by hand into every repository. Copies diverge, and a protocol whose copies
 * diverge is a protocol that means different things in different places.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { macpHome, repoRoot, writeText } from './repo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_SRC = path.resolve(HERE, '..', 'hooks');

const HARNESSES = Object.freeze(['claude', 'opencode', 'hermes', 'dsh']);

const REGISTRY_TEMPLATE = `# REGISTRY.md — Agent Registry

## Active Agents

**None.** No session is open on this repository.

A session is opened by the owner, not by an agent. See \`docs/macp.md\` §4C.

## File Ownership Rules

1. If another **ACTIVE** agent owns files you need → STOP, coordinate via its session file
2. A **sealed** session owns nothing. Its files are free, and its record is immutable.
`;

const INDEX_TEMPLATE = `# INDEX.md — Session Log

One row per session, generated from the session file. \`scripts/check-sessions.mjs\`
fails when this table disagrees with a file's own \`**Status:**\`.

| ID | Date | Agent | Harness | Branch | Task | Status | File |
| -- | ---- | ----- | ------- | ------ | ---- | ------ | ---- |
`;

const CONTINUATION_TEMPLATE = `# Continuation — the handoff

> **This file is the canonical handoff for this repository.** It is read at
> session start by \`macp start\`, which prints the sections below into the
> agent's context window. Do not create a competing \`HANDOFF.md\`.

## READ THIS FIRST

Nothing yet — the first session fills this in.

## 13. Next steps

1. Run \`macp start\` to open the first session.
`;

export function initRepo(options) {
  const root = options.cwd ? path.resolve(options.cwd) : repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };

  const created = [];
  for (const dir of ['state/sessions', 'state/plans', 'state/macp/handoff']) {
    const target = path.join(root, dir);
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
      created.push(`${dir}/`);
    }
  }

  const files = [
    ['state/REGISTRY.md', REGISTRY_TEMPLATE],
    ['state/INDEX.md', INDEX_TEMPLATE],
    ['state/CONTINUATION.md', CONTINUATION_TEMPLATE],
    ['state/macp/queue.md', '# MACP queue\n\n## Open\n\n## Done\n'],
  ];
  for (const [rel, body] of files) {
    const target = path.join(root, rel);
    if (existsSync(target) && !options.force) continue;
    writeText(target, body);
    created.push(rel);
  }

  const hooksDir = path.join(macpHome(), 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  copyFileSync(path.join(HOOKS_SRC, 'pretool.mjs'), path.join(hooksDir, 'pretool.mjs'));

  return {
    code: 0,
    out:
      `init-repo: ${created.length === 0 ? 'already initialised' : `created ${created.join(', ')}`}\n` +
      `  guard: ${path.join(hooksDir, 'pretool.mjs')}\n` +
      '  next:  macp start --agent <ID> --harness <name> --task "…" --authorized-by "…"\n' +
      '         macp install-hooks --harness <claude|opencode|hermes|dsh>',
  };
}

function claudeSnippet(hookPath) {
  return JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: `node ${hookPath}` }],
          },
        ],
      },
    },
    null,
    2,
  );
}

/** Append the guard to `~/.claude/settings.json` without disturbing anything else. */
function mergeClaudeSettings(settingsPath, hookPath) {
  const existing = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
  const hooks = (existing.hooks ??= {});
  const pre = (hooks.PreToolUse ??= []);
  const command = `node ${hookPath}`;
  const already = pre.some((entry) => (entry.hooks ?? []).some((hook) => hook.command === command));
  if (!already) pre.push({ matcher: '*', hooks: [{ type: 'command', command }] });
  writeText(settingsPath, `${JSON.stringify(existing, null, 2)}\n`);
  return !already;
}

export function installHooks(options) {
  const harness = options.harness;
  if (!HARNESSES.includes(harness)) {
    return { code: 2, out: `--harness must be one of ${HARNESSES.join(', ')}` };
  }

  const hooksDir = path.join(macpHome(), 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const guardPath = path.join(hooksDir, 'pretool.mjs');
  copyFileSync(path.join(HOOKS_SRC, 'pretool.mjs'), guardPath);

  const home = options.home ?? homedir();
  const lines = [`install-hooks: guard at ${guardPath}`];

  if (harness === 'opencode') {
    const dir = path.join(home, '.config', 'opencode', 'plugins');
    mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, 'macp-guard.ts');
    copyFileSync(path.join(HOOKS_SRC, 'adapters', 'opencode-plugin.ts'), dest);
    lines.push(`  adapter: ${dest} (OpenCode loads plugins/ automatically — no config edit)`);
  }

  if (harness === 'hermes') {
    const dir = path.join(home, '.hermes', 'plugins', 'macp-guard');
    mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, '__init__.py');
    copyFileSync(path.join(HOOKS_SRC, 'adapters', 'hermes_plugin.py'), dest);
    lines.push(`  adapter: ${dest} (registers pre_tool_call; restart Hermes to load it)`);
  }

  if (harness === 'dsh') {
    const dest = path.join(hooksDir, 'dsh-guard.sh');
    writeText(
      dest,
      [
        '#!/bin/sh',
        '# DSH adapter for the MACP pre-work guard.',
        "# Call before a mutating tool: `sh ~/.macp/hooks/dsh-guard.sh <tool> '<json-args>'`.",
        '# Exit 0 = allow, 2 = block (the reason is on stderr).',
        `exec node "${guardPath}"`,
        '',
      ].join('\n'),
    );
    lines.push(`  adapter: ${dest} — wire it into the DSH tool hook, passing JSON on stdin`);
  }

  if (harness === 'claude') {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    lines.push(
      '',
      'Add this to ~/.claude/settings.json (merge, do not replace):',
      claudeSnippet(guardPath),
    );
    if (options.write) {
      mkdirSync(path.dirname(settingsPath), { recursive: true });
      const added = mergeClaudeSettings(settingsPath, guardPath);
      lines.push('', added ? `  wrote ${settingsPath}` : `  ${settingsPath} already has the guard`);
    } else {
      lines.push('', '  re-run with --write to merge it automatically');
    }
  }

  return { code: 0, out: lines.join('\n') };
}
