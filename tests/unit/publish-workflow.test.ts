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

  it('puts every variable a node block reads into the environment, not just a shell variable', () => {
    // A shell assignment is not an environment entry: `EXPECTED_REF="…"` on
    // its own line is invisible to `node -e`, which then reads `undefined`.
    // Measured on the 2.28.3 dispatch (run 39943859454) — three attestations
    // in the response, one of them from the release tag, and the selector
    // rejected all of them:
    //   no provenance for 71e5278c… built from undefined (saw 3)
    // The digest was correct; only the expected ref was invisible. This is the
    // third defect in this step of the same shape, so it is checked by
    // derivation rather than by naming EXPECTED_REF.
    const body = provenanceStep;
    const logical = body.replace(/\\\n\s*/g, ' '); // join shell continuations
    const header = body.slice(0, body.indexOf('run: |'));
    const declaredInStepEnv = new Set(
      [...header.matchAll(/^\s+([A-Z0-9_]+):/gm)].map((m) => m[1] as string),
    );
    // Values a previous step exported, which later steps do receive.
    const writtenToGithubEnv = new Set(
      [...WORKFLOW.matchAll(/echo\s+"([A-Z0-9_]+)=[^"]*"\s*>>\s*"\$GITHUB_ENV"/g)].map(
        (m) => m[1] as string,
      ),
    );
    // Inline prefix form: `NAME=… node scripts/x.mjs`, including the
    // multi-line variant that joins into one logical line.
    const inlinePrefix = new Set<string>();
    for (const line of logical.split('\n')) {
      const nodeAt = line.search(/\bnode\s/);
      if (nodeAt === -1) continue;
      for (const m of line.slice(0, nodeAt).matchAll(/([A-Z0-9_]+)=/g)) {
        inlinePrefix.add(m[1] as string);
      }
    }
    const used = new Set(
      [...body.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1] as string),
    );
    expect(used.size).toBeGreaterThan(0);
    const unresolved = [...used].filter((name) => {
      if (/^(GITHUB|RUNNER)_/.test(name)) return false;
      if (writtenToGithubEnv.has(name)) return false;
      if (declaredInStepEnv.has(name)) return false;
      if (inlinePrefix.has(name)) return false;
      return !new RegExp(`export ${name}=`).test(body);
    });
    expect(unresolved).toEqual([]);
  });
});

/**
 * The fifth failure, and the first that was not about knowledge.
 *
 * The provenance step shells out to `cosign verify-blob-attestation`, and
 * nothing in the workflow installed cosign. Four earlier runs died a line
 * earlier — before the call — so the missing tool was never reached. Run
 * 39956868762 got past selection and died with `cosign: command not found`,
 * exit 127.
 *
 * A tool a step calls has to be installed *before* that step, in the same job.
 * Both halves are asserted, because an installer placed after the step is
 * exactly as broken as no installer at all.
 */
describe('the provenance step has the tools it calls', () => {
  it('calls cosign', () => {
    // If this ever stops being true, the two assertions below are moot and
    // should be deleted with it rather than left to pass vacuously.
    expect(provenanceStep).toMatch(/\bcosign\s+verify-blob-attestation\b/);
  });

  it('installs cosign, pinned to a commit', () => {
    expect(WORKFLOW).toMatch(/uses:\s*sigstore\/cosign-installer@[0-9a-f]{40}\b/);
  });

  it('installs cosign before the step that calls it', () => {
    const installedAt = WORKFLOW.indexOf('sigstore/cosign-installer@');
    const stepAt = WORKFLOW.indexOf('name: File provenance bundle');
    expect(installedAt).toBeGreaterThan(-1);
    expect(stepAt).toBeGreaterThan(-1);
    expect(installedAt).toBeLessThan(stepAt);
  });

  it('pins the cosign version instead of inheriting the installer default', () => {
    // The installer commit we pin defaults to cosign v2.5.2. The flag surface
    // of the call below was verified against v3.1.3 locally, so letting the
    // default decide means the version that runs is not the version that was
    // checked — the exact failure mode this whole PR is about.
    const at = WORKFLOW.indexOf('name: Install cosign');
    expect(at).toBeGreaterThan(-1);
    const step = WORKFLOW.slice(at);
    const next = step.indexOf('\n      - name:', 1);
    const body = next === -1 ? step : step.slice(0, next);
    expect(body).toMatch(/cosign-release:\s*'?v\d+\.\d+\.\d+'?/);
  });

  /**
   * The VSA summarises the attestation, so it must name the artefact the
   * attestation names. It did not: `VSA_TARBALL_NAME` was `$TARBALL`, which is
   * `npm pack`'s own filename, while `subject-name` above renames the subject.
   * Measured 2026-10-24 — 2.28.4 and 2.28.5 both filed a VSA saying
   * `xenos1996-usa-X.tgz` against a statement saying `usa-release-X.tgz`.
   */
  it('builds the VSA with the name the attestation gives the subject', () => {
    const subjectName = WORKFLOW.match(/subject-name:\s*(.+)$/m)?.[1]?.trim();
    const vsaName = WORKFLOW.match(/VSA_TARBALL_NAME="([^"]+)"/)?.[1];
    expect(subjectName).toBeTruthy();
    expect(vsaName).toBeTruthy();
    // `$TARBALL` is npm pack's filename, and it is not what gets attested.
    expect(vsaName).not.toContain('TARBALL');
    // Same artefact, modulo the two placeholder syntaxes.
    expect(subjectName!.replace('${{ env.VERSION }}', 'V')).toBe(
      vsaName!.replace('${VERSION}', 'V'),
    );
  });
});
