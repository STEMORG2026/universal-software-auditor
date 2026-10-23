import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The publish workflow's provenance step has now failed twice in CI, for
 * reasons that were *knowledge*, not code: the first run passed an empty
 * literal where `$GITHUB_ENV` had not yet been written; the second called
 * `gh attestation download` with a `name@sha256:<digest>` argument that the
 * CLI does not accept (its positional argument is a local file path).
 *
 * Both were fixed in the workflow and neither was pinned by a test, so the
 * next edit could reintroduce them and only a release run would notice. These
 * assertions read the workflow source and state each constraint as a fact
 * about the file. They are coarse on purpose — they check the shape that
 * caused the failure, not the whole step.
 */
const WORKFLOW = fs.readFileSync(
  path.join(process.cwd(), '.github', 'workflows', 'publish.yml'),
  'utf8',
);

/** The provenance step's `run:` body, isolated from the rest of the workflow. */
const provenanceStep = (() => {
  const start = WORKFLOW.indexOf('name: File provenance bundle');
  if (start === -1) throw new Error('provenance step not found in publish.yml');
  const rest = WORKFLOW.slice(start);
  const end = rest.indexOf('\n      - name:', 1);
  return end === -1 ? rest : rest.slice(0, end);
})();

describe('publish.yml files provenance it has actually verified', () => {
  it('does not address attestations by a name@digest positional argument', () => {
    // `gh attestation download <file-path>`: the whole argument is a filename.
    // Measured on the 2.28.3 dispatch: "failed to open local artifact:
    // open usa-release-2.28.3.tgz@sha256:71e5278c...: no such file".
    expect(provenanceStep).not.toMatch(/gh attestation download\s+"?[^\s"]*@sha256:/);
  });

  it('fetches the attestation by digest over the REST API, with retries', () => {
    // The endpoint intermittently returns 502/504; a release step must not
    // die on that, and a single attempt was how one release was lost.
    expect(provenanceStep).toMatch(/attestations\/sha256:\$\{TARBALL_SHA256\}/);
    expect(provenanceStep).toMatch(/for attempt in 1 2 3 4 5; do/);
  });

  it('only promotes the API response after a successful call', () => {
    // `gh api` can print a JSON error body on stdout, so redirecting straight
    // into the file the parser reads would let an error body masquerade as a
    // response. The response is written to a scratch path and moved on zero exit.
    expect(provenanceStep).toMatch(/attestations\.try\.json/);
    expect(provenanceStep).toMatch(/mv \/tmp\/attestations\.try\.json \/tmp\/attestations\.json/);
  });

  it('selects the provenance built from the release tag, not merely the first', () => {
    // A re-dispatch for the same version accumulates a second provenance with
    // the same subject; `-L 1` returned whichever the server listed first.
    expect(provenanceStep).toMatch(/refs\/tags\/@xenos1996\/usa@\$\{VERSION\}/);
    expect(provenanceStep).toMatch(/matches\.push\(a\.bundle\)/);
  });

  it('verifies the signature against the subject digest, not a payload blob', () => {
    // verify-blob-attestation hashes the blob it is handed and requires that
    // digest to be the statement's subject. Handing it the DSSE payload can
    // never pass: verified by hand, it exits 1 with "provided artifact digests
    // do not match digests in statement".
    expect(provenanceStep).toMatch(/--digest "\$TARBALL_SHA256"/);
    expect(provenanceStep).toMatch(/--digestAlg sha256/);
    // The cosign invocation must take its subject from --digest, not from a
    // positional blob path. Scope the slice to the cosign command itself: the
    // node assertion that follows legitimately reads the payload file.
    const cosignStart = provenanceStep.indexOf('cosign verify-blob-attestation');
    const cosignEnd = provenanceStep.indexOf('--digestAlg sha256', cosignStart);
    expect(cosignStart).toBeGreaterThan(-1);
    expect(cosignEnd).toBeGreaterThan(cosignStart);
    const cosignInvocation = provenanceStep.slice(cosignStart, cosignEnd);
    expect(cosignInvocation).not.toMatch(/\/tmp\/payload\.intoto\.json/);
  });

  it('writes the bundle to the repo only after verification', () => {
    const copyAt = provenanceStep.indexOf('cp /tmp/official.bundle.json');
    const verifyAt = provenanceStep.indexOf('cosign verify-blob-attestation');
    expect(copyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(-1);
    expect(copyAt).toBeGreaterThan(verifyAt);
  });

  it('never hashes a $GITHUB_ENV value in the step that writes it', () => {
    // $GITHUB_ENV is visible to *later* steps only. The 2.28.3 pack step did
    // `sha256sum "${TARBALL}"` after only `echo >> $GITHUB_ENV`, so it hashed
    // the empty string, and a trailing `echo` swallowed the failure into a
    // green step.
    const packStep = WORKFLOW.slice(
      WORKFLOW.indexOf('name: Pack release tarball'),
      WORKFLOW.indexOf('name: Attest release tarball'),
    );
    expect(packStep.length).toBeGreaterThan(0);
    expect(/TARBALL="\$\(npm pack/.test(packStep)).toBe(true);
    expect(packStep).toMatch(/set -euo pipefail/);
  });
});
