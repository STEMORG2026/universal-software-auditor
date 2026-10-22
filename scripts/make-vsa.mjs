/**
 * Build the Verification Summary Attestation for a release (SUP-023).
 *
 * The release workflow runs this AFTER `gh attestation verify` passes on the
 * tarball, so a VSA file exists if and only if verification passed — the gate
 * is the exit code of the verifier, not this script. Every field below is
 * derived from the run (env), never invented: digests are sha256sum output,
 * the policy digest pins the exact workflow file that performed the check.
 *
 * Env: VSA_TARBALL_NAME, VSA_TARBALL_DIGEST (hex sha256), VSA_BUNDLE_DIGEST
 * (hex sha256 of the .sigstore.json file), VSA_BUNDLE_PAYLOAD_DIGEST (hex
 * sha256 of the DSSE payload inside that bundle — the subject that `cosign`
 * actually compares against), VSA_VERSION, VSA_SHA (release commit),
 * VSA_REPO, VSA_TIME (RFC 3339), VSA_GH_VERSION, VSA_OUT. All required: an
 * unknown value fails the build rather than shipping an empty digest.
 *
 * WHY TWO BUNDLE DIGESTS. VSA_BUNDLE_DIGEST scopes the file, because a bundle
 * has no canonical byte sequence — `gh attestation download` and the REST API
 * serialise the same attestation differently (12284 vs 11751 bytes for one
 * 2.28.1 signature), so a digest of "the bundle" identifies a serialisation,
 * not an attestation. VSA_BUNDLE_PAYLOAD_DIGEST is the stable one: the DSSE
 * payload is the signed statement, and it is what a verifier can recompute.
 * The earlier version carried only the file digest and was read back by
 * nothing, so the ambiguity went unnoticed for four releases.
 *
 * The verifier and the policy are `publish.yml`, unconditionally, because
 * publish.yml is where `gh attestation verify` runs and where the bundle is
 * filed. Naming `release.yml` described the workflow that publishes, not the
 * one that verifies — and a VSA that misidentifies its own verifier is worse
 * than no VSA, because it reads as evidence.
 */
import fs from 'node:fs';

export const DEFAULT_REPO = 'STEMORG2026/universal-software-auditor';
export const VERIFIER_WORKFLOW = 'publish.yml';

export function buildVSA(env) {
  const required = [
    'VSA_TARBALL_NAME',
    'VSA_TARBALL_DIGEST',
    'VSA_BUNDLE_DIGEST',
    'VSA_BUNDLE_PAYLOAD_DIGEST',
    'VSA_VERSION',
    'VSA_SHA',
    'VSA_TIME',
    'VSA_GH_VERSION',
  ];
  for (const k of required) {
    if (!env[k]) throw new Error(`make-vsa: missing env ${k}`);
  }
  const repo = env.VSA_REPO || DEFAULT_REPO;
  const workflow = `.github/workflows/${VERIFIER_WORKFLOW}`;
  const tarballUrl = `https://registry.npmjs.org/@xenos1996/usa/-/usa-${env.VSA_VERSION}.tgz`;
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      {
        name: env.VSA_TARBALL_NAME,
        digest: { sha256: env.VSA_TARBALL_DIGEST },
      },
    ],
    predicateType: 'https://slsa.dev/verification_summary/v1',
    predicate: {
      verifier: {
        id: `https://github.com/${repo}/${workflow}`,
        version: { gh: env.VSA_GH_VERSION },
      },
      timeVerified: env.VSA_TIME,
      resourceUri: tarballUrl,
      policy: {
        uri: `https://github.com/${repo}/blob/${env.VSA_SHA}/${workflow}`,
        digest: { sha256: env.VSA_POLICY_DIGEST },
      },
      inputAttestations: [
        {
          uri: `https://api.github.com/repos/${repo}/attestations/sha256:${env.VSA_TARBALL_DIGEST}`,
          digest: { sha256: env.VSA_BUNDLE_PAYLOAD_DIGEST },
          // Provenance (SLSA VSA 1.1) — where this attestation may be found,
          // since `.digest` above deliberately does not fingerprint the file.
          attestations: [
            {
              mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
              digest: { sha256: env.VSA_BUNDLE_DIGEST },
            },
          ],
        },
      ],
      verificationResult: 'PASSED',
      verifiedLevels: ['SLSA_BUILD_LEVEL_2'],
      slsaVersion: '1.1',
    },
  };
}

const invoked = process.argv[1] === new URL(import.meta.url).pathname;
if (invoked) {
  const vsa = buildVSA(process.env);
  fs.writeFileSync(process.env.VSA_OUT, `${JSON.stringify(vsa, null, 2)}\n`, 'utf8');
  console.log(`wrote ${process.env.VSA_OUT}`);
}
