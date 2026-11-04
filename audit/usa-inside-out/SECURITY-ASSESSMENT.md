# SECURITY ASSESSMENT

Two questions, kept separate: **is USA secure**, and **is it safe to point USA at an
untrusted repository**. The second is the one that matters, because that is the product.

## Threat model

| Adversary                                         | Capability                                                                                         | Realistic goal                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A1 Repository author (untrusted repo under audit) | Controls every file in the target, including `node_modules/`, `.gitignore`, `.env`, `package.json` | Code execution on the auditor's machine; forge evidence so the audit looks clean |
| A2 Rule-pack author (third-party `--rules-dir`)   | Controls rule YAML: patterns, `command` runs, severity                                             | Hang the audit; execute shell (needs `--allow-commands`); suppress by omission   |
| A3 Local process / browser page                   | Can reach `127.0.0.1:<port>`                                                                       | Read or start audits without the token                                           |
| A4 Insider with repo write access                 | Can edit `.usa.yaml` suppressions                                                                  | Waive findings to raise the score                                                |
| A5 Supply chain                                   | npm package, GitHub Action, 16 devDeps                                                             | Compromise published artefact                                                    |

A1 is the adversary the architecture is least prepared for. A2 is explicitly acknowledged
("review third-party packs like production dependencies") and is defensible as a documented
opt-in. A3 is handled well. A4 is handled socially, not mechanically. A5 is handled better
than most projects this size.

## Confirmed vulnerabilities

### S-1 (CRITICAL) — Project-controlled binary execution

`scanner/run.ts:442` prepends `<target>/node_modules/.bin` to the scanner PATH while the
probe resolves the binary through the auditor's own PATH. A repository that ships
`node_modules/.bin/trivy` (committed, or created by any install step the user runs) has its
own code executed as the auditor, and the manifest attributes the output to the real tool
version. Full reproduction and evidence in `FINDINGS.md` USA-AUD-001.

Precondition, stated plainly: a real scanner must be on the auditor's PATH for the probe to
pass. In the documented CI setup scanners are installed, so this is the normal path.

**What an attacker gets**: `uid`, `$HOME`, the whole filesystem the user can read
(`~/.ssh`, `~/.aws`, `~/.npmrc`, other projects), and the ability to emit any evidence the
parser accepts — including a clean result.

### S-2 (CRITICAL) — Asserted isolation that does not exist

The manifest records `network: 'denied'` and `sandbox: 'subprocess-scratch-copy'`. Nothing
denies network; nothing sandboxes. See USA-AUD-002. This is a security defect in the
_evidence_, which for an audit tool is a security defect in the product.

### S-3 (HIGH) — Unbounded regex execution

95 s for a 41-byte line (USA-AUD-004). Reachable through `--rules-dir` and through generated
packs. Availability, not confidentiality.

### S-4 (MEDIUM) — `.env` from the audited directory

USA-AUD-008. Reaches the LLM provider configuration, not the deterministic engine.

## What is genuinely well built

Worth recording because a security review that only lists failures is not a review:

- **No signer.** `report/signature.ts` deliberately cannot mint a signature; ADR-0011 is
  enforced in code and the comment says why. Most projects would have added one.
- **No ambient authority in the server.** Bearer token, `timingSafeEqual`, length checked
  before comparison, no cookies, no CORS headers, loopback hard-coded with no flag to
  change it, 64 KB body cap, hex-only job ids, `realpath` containment on targets and on
  persisted job paths.
- **Path containment on artifacts.** `readArtifact` resolves and proves the artifact is
  inside the scratch dir before reading it.
- **Symlinks are never followed** in the index or in the scratch copy — a circular or
  escaping link cannot hang or exfiltrate.
- **Fail-closed predicates.** Unknown operator, malformed shape, invalid regex → rule does
  not apply. A pack author's mistake cannot silently apply a rule to every repository.
- **`command` checks are opt-in** and documented as arbitrary shell.
- **The LLM cannot write a verdict.** `runAudit` is the only producer of findings; the agent
  layer produces text. Verified by reading the write paths, not by trusting the README.
- **Trusted publishing + provenance + SBOM** on release; actions pinned; Scorecard run.

## Attack surface inventory

| Surface                | Input                                          | Reaches                  | Guard                                 |
| ---------------------- | ---------------------------------------------- | ------------------------ | ------------------------------------- |
| Filesystem walk        | filenames, symlinks, huge files                | `Project`                | caps, symlink skip, binary sniff      |
| `.gitignore`           | patterns                                       | index membership         | **none** (no counter, no warning)     |
| `.usa.yaml`            | suppressions, disables, facts, section weights | score, gate              | reason required; unused warned        |
| `.usa/foundation.yaml` | asserted facts, maturity                       | applicability, gate      | invalid file fails safe               |
| Rule packs             | regex, `sh -c`, severity, weights              | engine, shell            | loader validation; `--allow-commands` |
| `.env`                 | arbitrary keys                                 | `process.env`            | **none** (only "unset wins")          |
| Scanner binaries       | argv, PATH                                     | OS                       | **none that holds** (S-1)             |
| Scanner output         | JSON/SARIF                                     | parsers                  | try/catch, `unknown` on parse failure |
| HTTP                   | JSON body, target path                         | engine                   | token, allow-roots, body cap          |
| LLM response           | text                                           | narrative only           | cannot write findings                 |
| Report trailer         | YAML                                           | `usa diff`, `--baseline` | quoted keys, last-fence parsing       |
| Signature sidecar      | JSON + base64                                  | cosign                   | schema + hash check                   |

## Network policy, stated precisely

| Path                             | Network?                        | Enforced how                                                                                                |
| -------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `usa audit` (deterministic core) | No calls                        | No `fetch`/`http` in engine or reporters                                                                    |
| `usa scan`                       | Depends on adapter              | Adapters declaring `network: true` are skipped unless `--network`; **nothing stops a non-declaring binary** |
| `usa live` / `usa models`        | Yes, to the configured provider | User-supplied endpoint                                                                                      |
| `usa serve`                      | Loopback only                   | Hard-coded bind                                                                                             |
| `usa verify-report`              | No                              | Local `cosign verify-blob`                                                                                  |
| `usa evolve`                     | No                              | Local only                                                                                                  |

The README's "offline by default" is true of the core and false as a blanket statement about
`usa scan`. The distinction is documented in `docs/scanners.md`; the marketing line is not
qualified. Report as an overclaim, not a vulnerability.

## Residual security risk after the proposed fixes

Even with USA-AUD-001/002/009/012 fixed, a scanner is a native binary parsing hostile input
in the same user namespace. Without OS-level isolation (container, `bwrap`, seatbelt) a
scanner vulnerability is still the auditor's compromise. The honest posture is: _do not run
`usa scan` against code you would not run yourself_, and say so where the flag is documented.
