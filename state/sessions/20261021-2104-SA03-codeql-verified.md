**Agent:** SA03 (Sathi / WorkBuddy)
**Branch:** feat/codeql-verified
**Started:** 2026-10-21T21:04+05:45
**Status:** COMPLETED
**Base commit:** eab1186 (fix/scanner-artifact-contract, PR #199)

# Session SA03 — CodeQL, actually run

## Objective

Gap 1 of the SA02 handoff: "CodeQL is wired but unrun." The adapter had been
written from documentation, marked `[UNVERIFIED]`, and shipped — the exact
pattern that produced a dead ORT adapter and a dead CodeQL adapter before it.

## Method

Downloaded the real toolchain (CodeQL 2.27.3, `codeql-bundle-linux64`, 695 MB
from `github/codeql-action` releases) and ran both stages on
`fixtures/insecure-app`. No documentation reading; every claim below is a
measurement.

## Four bugs, none of which a fixture test could have found

1. **The default `packs: ''` was fatal.** The query specifier is a _positional_
   argument, so an empty string is one empty specifier:
   `A fatal error occurred: Invalid package specification:` — exit 2, no SARIF,
   every run. Omitting the argument runs the language's default code-scanning
   suite (87 queries) and exits 0.
2. **`result.level` does not exist.** CodeQL writes the level only in
   `tool.driver.rules[].defaultConfiguration.level`. SARIF 3.27.10 says an
   absent result level inherits the rule default, so the normaliser's reading of
   `result.level` alone reported **every** finding as INFO — an `error`-severity
   certificate check and a `warning`-severity key-size check became identical.
   Fixed in the shared normaliser, so every SARIF producer benefits.
3. **`rule.name` is the rule id**, so claims read `js/insufficient-key-size: …`,
   repeating the identifier the source field already carries. `shortDescription`
   is the title; claims now lead with it.
4. **`codeql --version` prints a sentence** (`… release 2.27.3.`), so `[\d.]+`
   recorded `2.27.3.` in the manifest.

## Evidence

End-to-end through `usa scan`, twice — once before the fixes, once after:

```
| codeql | 2.27.3 | ok | 2 | 37277ms | `codeql-results.sarif` |

- MEDIUM · js/insufficient-key-size — Use of a weak cryptographic key: Creation
  of an asymmetric RSA key uses 1024 bits, which is below 2048 … (app.js:10)
- HIGH · js/disabling-certificate-validation — Disabling certificate validation:
  Disabling certificate validation is strongly discouraged. (app.js:6)
```

`fixtures/insecure-app` gained the two planted defects that produce those
findings — both invisible to the pattern scanners, which is why CodeQL is worth
its cost. `tests/fixtures/scanners/codeql.sarif.json` is now a real capture
(trimmed to the fields the normaliser reads); the previous one asserted
`js/insecure-eval`, a query no current CodeQL version emits.

## Verification

| Gate        | Result                    |
| ----------- | ------------------------- |
| `typecheck` | pass                      |
| `lint`      | pass, 0 warnings          |
| `test`      | 1439 passed, 1 skipped    |
| `docs:all`  | pass (6 gates)            |
| self-audit  | 100/100, no open findings |

Five new tests were proven able to fail before being trusted: restoring the
empty specifier, dropping the rule-level fallback, restoring `[\d.]+`, restoring
`name` as the title, and (from SA02) the artifact path. Each produced a named
failure and was restored.
