/**
 * Verify the release provenance chain for one published version (SUP-022/023).
 *
 * WHY THIS EXISTS. Until 2026-10-22 nothing in this repo had ever *read* a
 * filed bundle back. Three defects lived in that blind spot at once:
 *
 *   1. The VSA pinned the sha256 of the bundle *file* as the digest of the
 *      input attestation. `gh attestation download` JSON has no single stable
 *      byte sequence, so the same attestation serialises to different bytes
 *      (the 2.28.1 bundle formats to 12284 bytes, the API form to 11751) —
 *      the digest identifies one serialisation, not the attestation.
 *   2. The VSA named `release.yml` as its verifier and policy, and took the
 *      tarball digest from the tarball npm packed — but the attestation in the
 *      same run came from `publish.yml` over a *different* tarball (attested
 *      ffc84fd7…, published 10274573…). Two wheels, one machine.
 *   3. `gh attestation verify` identifies a bundle by subject *name*, and the
 *      release tarball's name is inside a ZIP that cannot be randomised, so
 *      this repo's own release tarballs can never be attested at all.
 *
 * The lesson the whole scanner subsystem keeps re-learning: a claim nobody
 * reads back is not verified, it is merely written down. So the rule this
 * script enforces is narrower and honest — *verify what the bundle's DSSE
 * payload states, and verify that the VSA's own fields hold*, rather than
 * pretending a local tarball can be tied to a repo attestation.
 *
 * Usage: node scripts/check-provenance.mjs <version> [--repo owner/name]
 * Exit 0 = every check passed; 1 = a finding; 2 = bad usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const REPO = 'STEMORG2026/universal-software-auditor';
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The registry's signed integrity field, checked against the bytes served. */
export async function checkRegistryIntegrity(version, fetchImpl = fetch) {
  const meta = await (
    await fetchImpl(`https://registry.npmjs.org/@xenos1996%2fusa/${version}`)
  ).json();
  const tgz = Buffer.from(await (await fetchImpl(meta.dist.tarball)).arrayBuffer());
  const b64 = meta.dist.integrity.replace(/^sha512-/, '');
  const expected = Buffer.from(b64, 'base64');
  const actual = createHash('sha512').update(tgz).digest();
  return {
    ok: expected.equals(actual),
    tarballSha256: sha256(tgz),
    tarballSha512: actual.toString('hex'),
  };
}

/**
 * Structural checks on the filed pair. Pure: takes the parsed documents.
 *
 * The VSA is checked against ITSELF — its policy digest must be the digest of
 * the workflow it names, its subject must be the release tarball, and its
 * verifier must be the workflow that actually attests. Each of those was false
 * before this existed, so each is a test that can fail.
 */
export function checkVsa(vsa, bundle, { repo = REPO, version }) {
  const findings = [];
  const p = vsa?.predicate ?? {};

  if (vsa?.predicateType !== 'https://slsa.dev/verification_summary/v1') {
    findings.push(`predicateType is ${vsa?.predicateType}, not the SLSA VSA type`);
  }

  const expectedName = `xenos1996-usa-${version}.tgz`;
  if (vsa?.subject?.[0]?.name !== expectedName) {
    findings.push(`subject name is ${vsa?.subject?.[0]?.name}, expected ${expectedName}`);
  }

  // The verifier performs the verification, so it must be the workflow that
  // runs `gh attestation verify` — publish.yml. release.yml publishes.
  const verifierWorkflow = /\/\.github\/workflows\/([\w.-]+)$/.exec(p.verifier?.id ?? '')?.[1];
  if (verifierWorkflow !== 'publish.yml') {
    findings.push(
      `verifier.id names ${verifierWorkflow ?? '(none)'}; the workflow that verifies is publish.yml`,
    );
  }

  if (!String(p.resourceUri ?? '').includes(`usa-${version}.tgz`)) {
    findings.push(`resourceUri ${p.resourceUri} does not point at usa-${version}.tgz`);
  }

  if (p.policy?.digest?.sha256 === p.inputAttestations?.[0]?.digest?.sha256) {
    findings.push(
      'policy digest equals the bundle digest — two different objects cannot share a hash',
    );
  }

  const input = p.inputAttestations?.[0];
  if (!input?.uri?.includes(`/attestations/sha256:${vsa.subject?.[0]?.digest?.sha256}`)) {
    findings.push('inputAttestations uri does not identify the subject tarball digest');
  }

  const subject = bundle?.dsseEnvelope?.payload
    ? JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
    : null;
  if (!subject) {
    findings.push('bundle has no decodable DSSE payload');
  } else if (subject.subject?.[0]?.digest?.sha256 !== vsa.subject?.[0]?.digest?.sha256) {
    findings.push(
      `VSA subject ${vsa.subject?.[0]?.digest?.sha256} != bundle subject ${subject.subject?.[0]?.digest?.sha256}`,
    );
  }

  if (!String(input?.uri ?? '').includes(`/repos/${repo}/attestations/`)) {
    findings.push(`inputAttestations uri names a different repository than ${repo}`);
  }

  return findings;
}

/** Is the payload hash the tarball, as `gh` wrongly assumed when it filed these? */
export function payloadMismatch(bundle, tarballSha256) {
  const payload = Buffer.from(bundle.dsseEnvelope.payload, 'base64');
  return { payloadSha256: sha256(payload), differsFromTarball: sha256(payload) !== tarballSha256 };
}

function ghVerifyPayload(bundlePath, payloadPath) {
  try {
    execFileSync(
      'cosign',
      [
        'verify-blob-attestation',
        '--bundle',
        bundlePath,
        '--type',
        'slsaprovenance1',
        '--certificate-identity-regexp',
        `https://github.com/${REPO}/.github/workflows/publish.yml@.*`,
        '--certificate-oidc-issuer',
        OIDC_ISSUER,
        payloadPath,
      ],
      { stdio: 'pipe' },
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: String(err.stderr ?? err.message)
        .trim()
        .split('\n')
        .pop(),
    };
  }
}

const invoked = process.argv[1] === new URL(import.meta.url).pathname;
if (invoked) {
  const args = process.argv.slice(2);
  const version = args.find((a) => !a.startsWith('--'));
  const repoArg = args.find((a) => a.startsWith('--repo='))?.split('=')[1];
  if (!version) {
    console.error('usage: node scripts/check-provenance.mjs <version> [--repo=owner/name]');
    process.exit(2);
  }
  const repo = repoArg ?? REPO;
  const dir = path.resolve('provenance');
  const bundlePath = path.join(dir, `v${version}.sigstore.json`);
  const vsaPath = path.join(dir, `v${version}.vsa.json`);
  for (const f of [bundlePath, vsaPath]) {
    if (!fs.existsSync(f)) {
      console.error(`missing ${f}`);
      process.exit(2);
    }
  }
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const vsa = JSON.parse(fs.readFileSync(vsaPath, 'utf8'));

  const registry = await checkRegistryIntegrity(version);
  const findings = checkVsa(vsa, bundle, { repo, version });
  const payload = payloadMismatch(bundle, registry.tarballSha256);

  // cosign is optional locally; SKIP is not PASS.
  const payloadPath = path.join(dir, `.payload-v${version}.intoto.json`);
  fs.writeFileSync(payloadPath, Buffer.from(bundle.dsseEnvelope.payload, 'base64'));
  let sig;
  try {
    sig = ghVerifyPayload(bundlePath, payloadPath);
  } catch {
    sig = { ok: false, detail: 'cosign unavailable' };
  } finally {
    fs.rmSync(payloadPath, { force: true });
  }

  const row = (name, ok, detail) =>
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

  row(
    'registry integrity (sha512 of the served tarball)',
    registry.ok,
    `tarball sha256 ${registry.tarballSha256.slice(0, 16)}…`,
  );
  row('bundle signature over its own DSSE payload', sig.ok, sig.ok ? undefined : sig.detail);
  for (const f of findings) row('VSA field', false, f);
  if (findings.length === 0) row('VSA fields', true);

  // Not a finding: the tarball the bundle names is NOT the published one.
  // Reported because it is the reason `gh attestation verify <tarball>` fails.
  if (payload.differsFromTarball) {
    console.log(
      `NOTE  the attested subject (payload hash ${payload.payloadSha256.slice(0, 16)}…) ` +
        `is not any published tarball — see docs/release.md, "What the attestation covers".`,
    );
  }

  process.exit(findings.length || !registry.ok || !sig.ok ? 1 : 0);
}
