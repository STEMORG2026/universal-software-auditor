/**
 * OpenCode adapter for the MACP pre-work guard.
 *
 * OpenCode calls `tool.execute.before` with `{tool, args, callID}`; throwing
 * from that hook cancels the call and shows the message to the model. The
 * decision itself is not made here — this file only translates.
 *
 * Install: `macp install-hooks --harness opencode`, which copies this file to
 * `~/.config/opencode/plugins/macp-guard.ts`. OpenCode loads every file in
 * `plugins/`, so no config edit is needed.
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const GUARD = join(homedir(), '.macp', 'hooks', 'pretool.mjs');

type ToolInput = { tool: string; args?: Record<string, unknown>; callID?: string };

export const MacpGuard = async () => ({
  'tool.execute.before': async (input: ToolInput) => {
    const result = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool: input.tool, args: input.args ?? {}, cwd: process.cwd() }),
      encoding: 'utf8',
    });
    // 2 = blocked with a reason; 1 = the guard itself failed, which fails closed.
    if (result.status === 2 || result.status === 1) {
      throw new Error(result.stderr?.trim() || 'macp-guard refused this tool call');
    }
  },
});

export default MacpGuard;
