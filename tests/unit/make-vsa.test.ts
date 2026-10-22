import { describe, it, expect } from 'vitest';
import { buildVSA } from '../../scripts/make-vsa.mjs';

/**
 * The VSA builder (SUP-023). These tests pin the document shape against the
 * SLSA v1.1 verification_summary schema and the fail-closed rule: every
 * field must derive from the run, never default to empty.
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

describe('make-vsa (SUP-023)', () => {
  it('emits a spec-shaped VSA with every field derived from the run', () => {
    const vsa = buildVSA(env);
    expect(vsa._type).toBe('https://in-toto.io/Statement/v1');
    expect(vsa.predicateType).toBe('https://slsa.dev/verification_summary/v1');
    expect(vsa.subject).toEqual([
      { name: 'xenos1996-usa-9.9.9.tgz', digest: { sha256: 'a'.repeat(64) } },
    ]);
    expect(vsa.predicate.verificationResult).toBe('PASSED');
    expect(vsa.predicate.verifiedLevels).toEqual(['SLSA_BUILD_LEVEL_2']);
    expect(vsa.predicate.resourceUri).toContain('usa-9.9.9.tgz');
    expect(vsa.predicate.policy.uri).toContain('publish.yml');
    expect(vsa.predicate.policy.digest.sha256).toBe('d'.repeat(64));
    expect(vsa.predicate.inputAttestations).toHaveLength(1);
    expect(vsa.predicate.inputAttestations[0].digest.sha256).toBe('e'.repeat(64));
    expect(vsa.predicate.inputAttestations[0].attestations[0].digest.sha256).toBe('b'.repeat(64));
    expect(vsa.predicate.verifier.id).toContain('publish.yml');
    expect(vsa.predicate.timeVerified).toBe('2026-09-14T00:00:00Z');
    expect(vsa.predicate.slsaVersion).toBe('1.1');
  });

  it('fails closed on any missing input rather than shipping empty digests', () => {
    expect(() => buildVSA({ ...env, VSA_BUNDLE_DIGEST: '' })).toThrow(/missing env/);
    expect(() => buildVSA({})).toThrow(/missing env/);
  });
});
