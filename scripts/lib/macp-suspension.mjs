/**
 * Owner-declared suspension of MACP.
 *
 * WHY THIS EXISTS. MACP is under active development and is not in use in this
 * repository or any other. Rather than bypass the gates with `--no-verify` —
 * which leaves no trace and is forbidden by AGENTS.md — the owner suspends the
 * protocol with a tracked file, `.macp/SUSPENDED`, which must say who suspended
 * it, when, and why. Every gate that enforces the protocol reads it, prints the
 * reason, and exits 0. Deleting the file restores enforcement with no other
 * change, so lifting the suspension is one `git rm`.
 *
 * A marker that is missing any of those three fields is REFUSED rather than
 * honoured: the point of the file is that the suspension is on the record, and
 * an anonymous bypass is exactly what `--no-verify` already is.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SUSPENSION_PATH = path.join('.macp', 'SUSPENDED');

const REQUIRED_FIELDS = ['owner', 'since', 'reason'];

/**
 * Read the suspension marker.
 *
 * Returns `null` when no marker exists, `{ valid: false, message }` when one
 * exists but does not state all three required fields, and
 * `{ valid: true, owner, since, reason, message }` otherwise.
 */
export function suspensionStatus(root) {
  const file = path.join(root, SUSPENSION_PATH);
  if (!existsSync(file)) return null;

  const text = readFileSync(file, 'utf8');
  const read = (name) => {
    const match = text.match(new RegExp(`^${name}:\\s*(\\S.*)$`, 'im'));
    return match ? match[1].trim() : null;
  };
  const fields = Object.fromEntries(REQUIRED_FIELDS.map((name) => [name, read(name)]));
  const missing = REQUIRED_FIELDS.filter((name) => !fields[name]);

  if (missing.length > 0) {
    return {
      valid: false,
      message:
        `${SUSPENSION_PATH} is missing ${missing.join(', ')} — state who suspended ` +
        'MACP and why, or delete the file to restore enforcement.',
    };
  }

  return {
    valid: true,
    ...fields,
    message:
      `MACP is suspended (${fields.owner}, since ${fields.since}): ${fields.reason}. ` +
      'No session, plan, registry row or lease is required while this stands.',
  };
}
