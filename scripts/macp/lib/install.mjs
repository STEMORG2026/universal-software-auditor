/**
 * Onboarding: a repository, and a harness, in one command each.
 *
 * The defect this replaces is ten Markdown files and four `.mjs` scripts copied
 * by hand into every repository. Copies diverge, and a protocol whose copies
 * diverge is a protocol that means different things in different places.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { macpHome, repoRoot, writeText } from './repo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// This repository vendors the runtime at `scripts/macp/`, so the guard lives at
// `scripts/macp/hooks/` rather than the standalone layout's `src/hooks/`.
const HOOKS_SRC = path.resolve(HERE, '..', 'hooks');

const HARNESSES = Object.freeze(['claude', 'opencode', 'hermes', 'dsh']);

const REGISTRY_TEMPLATE = `# REGISTRY.md — Agent Registry

## Active Agents

**None.** No session is open on this repository.

A session is opened by the owner, not by an agent. See \`docs/PROTOCOL.md\` §4C.

## File Ownership Rules

1. If another **ACTIVE** agent owns files you need → STOP, coordinate via its session file
2. A **sealed** session owns nothing. Its files are free, and its record is immutable.
`;

const INDEX_TEMPLATE = `# INDEX.md — Session Log

One row per session, generated from the session file. The sessions gate
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

const STARTUP_TEMPLATE = `# STARTUP.md — the startup sequence, in short

> The full protocol is MACP's \`docs/PROTOCOL.md\`. \`macp start\` performs
> this sequence for you and prints the brief; this file is the checklist it
> follows, for humans reading the state directory.

1. \`git status\` / \`git log\` — know the tree and the branch.
2. \`state/\` exists? If not: \`macp init-repo\` (bootstrap).
3. Read \`state/CONTINUATION.md\` — the handoff from the last session.
4. Read \`state/REGISTRY.md\` — who is active, which files are owned.
5. Register: \`macp start\` writes the session file, the plan, the registry
   entry, and the local lease.
6. Only then begin work. Mid-session: \`macp log\`. Finish: \`macp submit\`.
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
    ['state/STARTUP.md', STARTUP_TEMPLATE],
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

/** The five principals, and the public-key file each one is read from. */
const AUTHORITY_KEYS = Object.freeze([
  ['macp-close', 'macp_close.pub'],
  ['macp-seal', 'macp_seal.pub'],
  ['macp-reopen', 'macp_reopen.pub'],
  ['macp-destroy', 'macp_destroy.pub'],
  ['macp-ack', 'macp_ack.pub'],
]);

/**
 * Write `state/macp/allowed_signers` from five public keys — one per act.
 *
 * This is the only way the authority is created, and it refuses to overwrite an
 * existing file without `--force`. The audit's F-20 was a `seal` that silently
 * rewrote the anchor; making rotation an explicit, separate command is the fix.
 */
export function initAuthority(options) {
  const root = options.cwd ? path.resolve(options.cwd) : repoRoot();
  if (!root) return { code: 2, out: 'not inside a git repository' };
  const dir = options.dir ? path.resolve(options.dir) : path.join(homedir(), '.ssh');
  const target = path.join(root, 'state', 'macp', 'allowed_signers');

  if (existsSync(target) && !options.force) {
    return {
      code: 1,
      out:
        'state/macp/allowed_signers already exists — refusing to rewrite the authority. ' +
        'Rotating keys is a deliberate act: re-run with --force, and expect every existing ' +
        'signature made by the old principals to stop verifying.',
    };
  }

  const lines = [];
  const missing = [];
  for (const [principal, file] of AUTHORITY_KEYS) {
    const pub = path.join(dir, file);
    if (!existsSync(pub)) {
      missing.push(file);
      continue;
    }
    const key = readFileSync(pub, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
    lines.push(`${principal} ${key}`);
  }
  if (missing.length > 0) {
    return {
      code: 1,
      out:
        `missing public key(s) in ${dir}: ${missing.join(', ')}\n` +
        'Create one per act with ssh-keygen, then re-run. Each must have its own passphrase.',
    };
  }

  // Each act must require the owner's passphrase. A key with no passphrase is a
  // key any process on this account can use, which defeats the whole model.
  const unprotected = [];
  for (const [, file] of AUTHORITY_KEYS) {
    const priv = path.join(dir, file.replace(/\.pub$/, ''));
    if (!existsSync(priv)) continue;
    try {
      execFileSync('ssh-keygen', ['-y', '-P', '', '-f', priv], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      unprotected.push(file.replace(/\.pub$/, ''));
    } catch {
      // A non-zero exit here means the key is encrypted. That is the good case.
    }
  }
  if (unprotected.length > 0) {
    return {
      code: 1,
      out:
        `these keys have no passphrase: ${unprotected.join(', ')}\n` +
        'Each act must require you to type a passphrase, so an unprotected key is refused. ' +
        'Set one with `ssh-keygen -p -f <key>`, then re-run.',
    };
  }

  writeText(target, `${lines.join('\n')}\n`);
  return {
    code: 0,
    out:
      `authority written: ${path.relative(root, target)}\n` +
      `  principals: ${AUTHORITY_KEYS.map(([principal]) => principal).join(', ')}\n` +
      '  commit it — this file is the list of keys allowed to act, and it is public.',
  };
}
