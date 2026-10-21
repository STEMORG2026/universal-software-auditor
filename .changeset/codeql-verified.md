---
'@xenos1996/usa': patch
---

Verify the CodeQL adapter against the real toolchain, and fix three bugs a run found.

CodeQL 2.27.3 (the `codeql-bundle-linux64` release) now runs end-to-end on
`fixtures/insecure-app`: `database create` → `database analyze` → SARIF read
from the file the tool writes. The adapter was previously `[UNVERIFIED]`, and
running it was the only way to find out that it could not have worked:

- **The default `packs: ''` was fatal.** The query specifier is positional, so
  an empty string is one empty _specifier_: CodeQL dies with `Invalid package
specification:` and writes no SARIF. The argument is now omitted when unset,
  which runs the language's default code-scanning suite.
- **`codeql --version` prints a sentence** (`… release 2.27.3.`), so a `[\d.]+`
  class recorded `2.27.3.` in every manifest.

And one bug in the shared SARIF normaliser, which affected every SARIF producer
that omits `result.level`:

- **An absent result level now inherits the rule's `defaultConfiguration.level`**
  (SARIF 3.27.10). CodeQL omits `level` on every result, so reading only
  `result.level` reported **every** finding as INFO — an error-severity
  certificate check and a warning-severity key-size check were indistinguishable.
- Claims now lead with the rule's `shortDescription.text` rather than `name`,
  which is the rule id and was repeating the identifier the source field already
  carries.

`tests/fixtures/scanners/codeql.sarif.json` is now a real capture (trimmed to
the fields the normaliser reads) instead of a synthetic `js/insecure-eval` log
that no current CodeQL version emits. `fixtures/insecure-app` gained two planted
defects that the pattern scanners cannot see, so the e2e test has named ids to
assert; it skips loudly where `codeql` is not installed.
