import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The scheduled read-back job has three properties that are design decisions
 * rather than implementation details, and each is cheap to lose by accident:
 *
 *   1. it never runs on a pull request — it needs the npm registry and the
 *      cosign trust root, and a network check on every PR is a check people
 *      learn to ignore;
 *   2. its floor is 2.28.3 — the first version filed by the verified path.
 *      Bundles at or below 2.28.2 carry three known findings and are left as
 *      filed, so lowering the floor turns the job permanently red and raising
 *      it silently stops reading the newest evidence;
 *   3. cosign is installed — `check-provenance.mjs` treats a missing verifier
 *      as FAIL, because SKIP is not PASS.
 */
const WORKFLOW = fs.readFileSync(
  path.join(process.cwd(), '.github', 'workflows', 'provenance-check.yml'),
  'utf8',
);

/** Everything before the first job, i.e. the trigger and permissions block. */
const header = WORKFLOW.slice(0, WORKFLOW.indexOf('\njobs:'));

describe('provenance-check.yml reads the chain back without becoming a PR check', () => {
  it('is scheduled and dispatchable, never triggered by a pull request or a push', () => {
    expect(header).toMatch(/schedule:/);
    expect(header).toMatch(/workflow_dispatch:/);
    expect(header).not.toMatch(/pull_request/);
    expect(header).not.toMatch(/^\s+push:/m);
  });

  it('reads every bundle at or above 2.28.3, and nothing below it', () => {
    expect(WORKFLOW).toMatch(/FLOOR="2\.28\.3"/);
    // The enumeration must key on the VSA, not the bundle: a .sigstore.json
    // without a .vsa.json is an unfiled bundle and has no fields to check.
    expect(WORKFLOW).toMatch(/\\\.vsa\\\.json\$/);
  });

  it('installs cosign, pinned to a commit sha', () => {
    expect(WORKFLOW).toMatch(/uses: sigstore\/cosign-installer@[0-9a-f]{40} # v\d/);
  });

  /**
   * A pinned action is not a pinned tool. Without `cosign-release` the installer
   * defaults to v2.5.2, whose `verify-blob-attestation` has no `--digest` flag,
   * so every bundle failed with `unknown flag: --digest` (run 40073426157) while
   * the identical call passed in publish.yml under v2.6.5.
   *
   * The two workflows verify the same bundles, so they must agree on the
   * verifier. Asserting equality rather than a literal keeps them free to move
   * together and catches the one-sided bump.
   */
  it('pins the same cosign version as publish.yml', () => {
    const publish = fs.readFileSync(
      path.join(process.cwd(), '.github', 'workflows', 'publish.yml'),
      'utf8',
    );
    const here = WORKFLOW.match(/cosign-release:\s*'([^']+)'/)?.[1];
    const there = publish.match(/cosign-release:\s*'([^']+)'/)?.[1];
    expect(here, 'provenance-check.yml must set cosign-release').toBeTruthy();
    expect(there, 'publish.yml must set cosign-release').toBeTruthy();
    expect(here).toBe(there);
  });
});
