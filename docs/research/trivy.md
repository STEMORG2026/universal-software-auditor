# Trivy

## Purpose

Scans an artifact for four kinds of risk in one pass: vulnerable dependencies,
committed secrets, insecure configuration, and license obligations. It targets a
filesystem, a repository, a container image, or an SBOM.

## Architecture

A single Go binary that dispatches to per-scanner engines over one artifact
walker. The walker classifies files (lockfiles, IaC, source) and each scanner
reads the subset it understands. Vulnerability data comes from a downloaded
database; secret rules and misconfiguration checks come from bundled policy
packs (Rego) refreshed independently. One JSON report aggregates the results of
every scanner that ran.

## Relevant APIs/CLI

**[VERIFIED-RUN]** on this machine, Trivy 0.75.0:

```bash
trivy fs --format json --scanners vuln,secret,misconfig .
trivy fs --format json --scanners secret .        # no DB download needed
trivy repo https://github.com/<org>/<repo>        # clone-and-scan
trivy image <ref>                                 # container image
```

Useful flags: `--format json|sarif|cyclonedx|spdx`, `--output <file>`,
`--scanners vuln,secret,misconfig,license`, `--severity HIGH,CRITICAL`,
`--ignore-unfixed`, `--exit-code <n>`, `--skip-db-update`, `--offline-scan`.

**Exit codes:** `0` when nothing is found; with `--exit-code N`, exits `N` when
findings exist. Without that flag a scan with findings still exits `0` — an
adapter must never treat exit status as the verdict. **[VERIFIED-RUN]** for the
`0` case; the `--exit-code` behaviour is **[UNVERIFIED]** here.

## Output formats

JSON (schema `SchemaVersion: 2`), SARIF, table, CycloneDX, SPDX.

**[VERIFIED-RUN]** top level of `--format json`:

```json
{
  "SchemaVersion": 2,
  "Trivy": { "Version": "0.75.0" },
  "ReportID": "…",
  "CreatedAt": "…",
  "ArtifactName": ".",
  "ArtifactType": "filesystem"
}
```

`Results[]` is present only when something was found; each entry carries
`Target`, `Class`, `Type`, and one or more of `Vulnerabilities[]`
(`VulnerabilityID`, `PkgName`, `InstalledVersion`, `FixedVersion`, `Severity`,
`Title`, `PrimaryURL`), `Secrets[]` (`RuleID`, `Severity`, `Title`,
`StartLine`, `EndLine`), `Misconfigurations[]` (`ID`, `Severity`, `Title`,
`Description`, `Message`, `CauseMetadata`).

## License

Apache-2.0. **[VERIFIED-SOURCE]** — GitHub API `license.spdx_id`.

## Integration method

**CLI_ADAPTER.** Invoke `trivy fs` with `--format json`, parse the report, map
each result to evidence. No server, no daemon, no database to host.

## Useful capabilities

- CVE findings carry the **fixed version**, which turns "you are vulnerable"
  into "upgrade X to Y" without any LLM involvement.
- Secret findings carry the rule id and a line span, so a finding can point at
  the exact line rather than the file.
- SBOM output (CycloneDX/SPDX) is a by-product, not a separate integration.

## Limitations

- **[VERIFIED-RUN]** A scan of a directory with no lockfile and no IaC reports
  `Results` absent entirely — "no results" and "nothing scanned" look identical
  in the JSON unless you also read the log. The adapter must record which
  scanners actually ran.
- Vulnerability scanning needs a database download (hundreds of MB) on first
  run. An offline audit must either ship a cached DB or report `UNAVAILABLE`
  rather than "no vulnerabilities".
- The AWS documentation example key is allowlisted, so it is a poor test
  fixture.

## Security considerations

Trivy reads files and, for `trivy repo`, clones a remote. It does not execute
project code. Run it with the network disabled when the vulnerability DB is
already cached; the secret and misconfig scanners work fully offline.

## Recommended use in our auditor

Tier 1, first adapter: it is the cheapest real evidence we can produce
(vulnerabilities, secrets, misconfig) with one binary and no build step. Its
findings are the natural fixture for the evidence model because each one already
carries an identifier, a severity, a location, and often a remediation.
