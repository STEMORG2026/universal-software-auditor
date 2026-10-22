import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildVSA, DEFAULT_REPO, VERIFIER_WORKFLOW } from '../../scripts/make-vsa.mjs';
import { checkVsa } from '../../scripts/check-provenance.mjs';

/**
 * The VSA is a claim about a verification, and until 2026-10-22 it was read
 * back by nothing. Four releases shipped a VSA that named the publishing
 * workflow as its verifier, pinned the bundle's *serialisation* rather than
 * the attestation, and pointed at the pre-migration org. Every assertion here
 * is one of those defects, stated as a test.
 */
const env = {
  VSA_TARBALL_NAME: 'xenos1996-usa-9.9.9.tgz',
  VSA_TARBALL_DIGEST: 'a'.repeat(64),
  VSA_BUNDLE_DIGEST: 'b'.repeat(64),
  VSA_BUNDLE_PAYLOAD_DIGEST: 'e'.repeat(64),
  VSA_VERSION: '9.9.9',
  VSA_SHA: 'c'.repeat(40),
  VSA_POLICY_DIGEST: 'd'.repeat(64),
  VSA_TIME: '2026-09-14T00:00:00Z',
  VSA_GH_VERSION: '2.0.0',
};

const bundleFor = (subjectDigest) => ({
  dsseEnvelope: {
    payload: Buffer.from(
      JSON.stringify({
        _type: 'https://in-toto.io/Statement/v1',
        subject: [{ name: 'xenos1996-usa-9.9.9.tgz', digest: { sha256: subjectDigest } }],
        predicateType: 'https://slsa.dev/provenance/v1',
      }),
    ).toString('base64'),
  },
});

describe('VSA names the workflow that verifies (regression: filed VSAs named release.yml)', () => {
  it('identifies publish.yml as verifier and policy, on the canonical repo', () => {
    const vsa = buildVSA(env);
    expect(vsa.predicate.verifier.id).toBe(
      `https://github.com/${DEFAULT_REPO}/.github/workflows/${VERIFIER_WORKFLOW}`,
    );
    expect(vsa.predicate.policy.uri).toBe(
      `https://github.com/${DEFAULT_REPO}/blob/${env.VSA_SHA}/.github/workflows/${VERIFIER_WORKFLOW}`,
    );
  });

  it('never names the publishing workflow as the verifier', () => {
    expect(buildVSA(env).predicate.verifier.id).not.toContain('release.yml');
  });

  it('takes the repository from the run, not from a hard-coded org', () => {
    const vsa = buildVSA({ ...env, VSA_REPO: 'example-org/example-repo' });
    expect(vsa.predicate.verifier.id).toContain('example-org/example-repo');
    expect(vsa.predicate.inputAttestations[0].uri).toContain('example-org/example-repo');
  });
});

describe('VSA distinguishes the attestation from one serialisation of it', () => {
  it('records both the payload digest and the file digest, on the right fields', () => {
    const vsa = buildVSA(env);
    const input = vsa.predicate.inputAttestations[0];
    // The stable identifier of the attestation is its signed statement.
    expect(input.digest.sha256).toBe(env.VSA_BUNDLE_PAYLOAD_DIGEST);
    // The file digest is still recorded — as provenance, not as identity.
    expect(input.attestations[0].digest.sha256).toBe(env.VSA_BUNDLE_DIGEST);
    expect(input.digest.sha256).not.toBe(input.attestations[0].digest.sha256);
  });

  it('fails closed without the payload digest rather than silently reusing the file digest', () => {
    const without: Record<string, string> = { ...env };
    delete without.VSA_BUNDLE_PAYLOAD_DIGEST;
    expect(() => buildVSA(without)).toThrow(/VSA_BUNDLE_PAYLOAD_DIGEST/);
  });
});

describe('check-provenance reads the VSA back (the gap that let all of this ship)', () => {
  const vsa = buildVSA(env);
  const bundle = bundleFor(env.VSA_TARBALL_DIGEST);

  it('passes a VSA the builder produced', () => {
    expect(checkVsa(vsa, bundle, { version: '9.9.9' })).toEqual([]);
  });

  it('catches a VSA that names release.yml as the verifier', () => {
    const bad = structuredClone(vsa);
    bad.predicate.verifier.id = bad.predicate.verifier.id.replace('publish.yml', 'release.yml');
    expect(checkVsa(bad, bundle, { version: '9.9.9' })).toContainEqual(
      expect.stringContaining('the workflow that verifies is publish.yml'),
    );
  });

  it('catches a subject digest that disagrees with the bundle statement', () => {
    const bad = structuredClone(vsa);
    bad.subject[0].digest.sha256 = 'f'.repeat(64);
    expect(checkVsa(bad, bundle, { version: '9.9.9' })).toContainEqual(
      expect.stringContaining('!= bundle subject'),
    );
  });

  it('catches the pre-migration org in the attestation URI', () => {
    const bad = structuredClone(vsa);
    bad.predicate.inputAttestations[0].uri = bad.predicate.inputAttestations[0].uri.replace(
      DEFAULT_REPO,
      'Er-Sajan-PLG/universal-software-auditor',
    );
    expect(checkVsa(bad, bundle, { version: '9.9.9' })).toContainEqual(
      expect.stringContaining('different repository'),
    );
  });

  it('catches a policy digest that is the bundle digest again', () => {
    const bad = structuredClone(vsa);
    bad.predicate.policy.digest.sha256 = bad.predicate.inputAttestations[0].digest.sha256;
    expect(checkVsa(bad, bundle, { version: '9.9.9' })).toContainEqual(
      expect.stringContaining('policy digest equals the bundle digest'),
    );
  });

  it('reports the wrong release tarball name', () => {
    const bad = structuredClone(vsa);
    bad.subject[0].name = 'usa-9.9.9.tgz';
    expect(checkVsa(bad, bundle, { version: '9.9.9' }).join('\n')).toMatch(
      /expected xenos1996-usa/,
    );
  });
});

describe('make-vsa writes a file the checker accepts', () => {
  it('round-trips through disk unchanged', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usa-vsa-'));
    const out = path.join(dir, 'vsa.json');
    const script = path.resolve('scripts/make-vsa.mjs');
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [script], {
      env: { ...env, VSA_OUT: out },
      stdio: 'pipe',
    });
    const written = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(written).toEqual(buildVSA(env));
    expect(checkVsa(written, bundleFor(env.VSA_TARBALL_DIGEST), { version: '9.9.9' })).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
