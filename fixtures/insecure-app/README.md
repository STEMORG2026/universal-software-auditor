# insecure-app

A deliberately weak fixture project: it exists so `usa scan` can be shown
producing real evidence from a real scanner.

- `package-lock.json` pins `lodash@4.17.4`, a version with 10 known CVEs, so the
  dependency-vulnerability scanner has something to find.
- `app.js` evaluates `process.argv[2]`, the classic dynamic-eval sink.

Expected `usa scan` result: ≥1 vulnerability evidence item (10 with trivy
0.75.0), each carrying its CVE id, its fixed version and the lockfile location.

`fixtures/secure-app` is the same shape with no lockfile and no eval — the
negative case, which must produce _fewer_ finding kinds, not the same ones.
