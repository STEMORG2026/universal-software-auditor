# STRATEGIC QUESTIONS

All 27, answered from evidence in this audit rather than from intent.

## Product identity

**1. What is USA actually good at today?**
Three things, each verified: (a) **reproducible verdicts** — two runs of the same tree are
byte-identical except the timestamp; (b) **applicability** — 236 detectors decide which of
315 rules apply, with no code change per stack, and it correctly classified this repo as
`cli, docs, library, monorepo` over four languages; (c) **honesty about mechanism** — malformed
config refuses, expired waivers reactivate, unmatched waivers warn, absent scanners are named
as blind spots. The plumbing that decides _whether a rule applies_ is the best part of the
product.

**2. What does it claim to do that it cannot reliably do?**
Four claims fail:

- _"Score reflects assurance."_ It reflects the subset of checks the engine could answer, minus
  whatever the project waived. 100/100 at 66% coverage; 92 without waivers.
- _"The report is graded to the lifecycle stage."_ Dampening never moves the score.
- _"Scanners add evidence to the audit."_ No adapter maps findings; the evidence goes nowhere.
- _"Sandboxed, network-denied scanning."_ Neither is enforced, and a repo's own binary runs.

**3. What should its precise product positioning be?**
**A reproducible applicability-and-evidence engine for software assurance, with an honest
coverage statement.** Not "685 checks", not "a score", not "a security scanner". The thing no
competitor does well is deciding _which_ requirements apply to _this_ project and showing the
working. Lead with that.

**4. What should the boundaries of "universal" mean in practice?**
Universal in **detection and applicability** (already true: 20 languages, 42 framework
signals). Curated in **rule depth** (17 stack packs, uneven). Explicitly **not** universal in
analysis depth — that is CodeQL's and Semgrep's job, and the `oracle` kind exists to ingest
their answers. "Universal" should mean "no project is refused", not "every project is
analysed equally deeply".

## Architecture

**5. Which components are architecturally sound and worth preserving?**
`types.ts` (the Severity/Status split), `engine/{loader,evaluate-packs,audit,sections}.ts`,
`util/glob.ts` (13/13 adversarial cases), the reporter boundary (renderers take a report and
return a string, no I/O), `scanner/identity.ts`, `report/signature.ts`. Roughly 3 000 lines
carry the thesis and none of them needs redesign.

**6. Which are weakest?**
`scanner/run.ts` (executes foreign code, asserts isolation it lacks), `engine/score.ts` (three
calibration defects in 197 lines), `util/project.ts` (ReDoS, gitignore asymmetry, 736 lines
doing five jobs), `engine/gate.ts` (inherits whatever maturity says).

**7. Which abstractions are missing?**

- **A fact-provenance type.** `Facts.flags` is a `Set<string>`: an asserted fact and a
  detected fact are the same object. Every "can this be gamed" question reduces to this.
- **A rule-execution record.** A rule that does not apply leaves no trace, so "not applicable"
  and "does not exist" are the same state (USA-AUD-024).
- **A warning in the report.** Warnings exist as a side channel.

**8. Which abstractions are unnecessary?**
`ScannerFinding` (declared, never implemented — USA-AUD-023); `ENV_DENY` (unreachable);
`oracle` and `invariant` kinds (shipped, used by zero bundled rules); the synthetic
`Rule` constructed for documentation findings so that a second engine can be scored by the
first.

**9. Which components should be redesigned?**
`score.ts` (semantics, not arithmetic), `scanner/run.ts` (execution boundary),
`docs-*` (extract from the scoring loop). Three components, ~2 400 lines.

**10. Which responsibilities should move to existing external tools?**
Vulnerability matching (Trivy/ORT — already integrated), deep dataflow (CodeQL), semantic
pattern matching (Semgrep), signature verification (cosign — already delegated). The
temptation to build a resolver or a taint engine is the one to resist; ADR-0011 already says so
and the audit agrees with it.

**11. What must remain inside the deterministic core?**
Applicability, status assignment, scoring, suppression, the gate, and the trailer. Those five
are what make a verdict reproducible, and every one of them is currently inside the core.
Nothing about them should move to an LLM or a scanner.

## Trustworthiness

**12. What is the greatest threat to USA's credibility?**
Not a bug — the **headline number**. A tool that prints 100/100 while a third of its checks
are unresolved, and 92 once its own waivers are removed, teaches its users to distrust the one
artefact it produces. Everything else in this audit is fixable in weeks; this is the one that
decides whether the product is believed.

**13. Can incorrect facts or applicability produce misleading audit results?**
Yes. A user fact overrides detection with no warning (B04), and a rule skipped for lack of a
fact is indistinguishable from a rule that does not exist (USA-AUD-024). Both change the score
without changing the project.

**14. Can the score be inflated without genuine improvements?**
Yes, four ways, all measured: waive findings (+8 points on this repo), leave checks
unresolved (UNKNOWN is excluded), declare a permissive maturity (moves the gate, not the
score), or disable rules (they become NOT_APPLICABLE and vanish).

**15. Can a malicious repository compromise the scanner execution environment?**
Yes — demonstrated. `node_modules/.bin/trivy` ran as the auditing user with `$HOME` readable,
and the manifest attributed the output to Trivy 0.75.0.

**16. Does the evidence model justify the confidence USA communicates?**
The evidence model is good: content-addressed identity, provenance stamped centrally so no
adapter can invent it, `UNKNOWN` on parse failure, blind spots named. The _confidence figure_
is a different thing — it is resolved/applicable, which measures automation coverage, not
evidential strength. Calling it "confidence" overstates what it is.

**17. Is its self-audit meaningful?**
Partially. It is a real run of the real engine on the real tree, and it found nothing wrong
because there is nothing wrong with the code it can see. It is not independent: the project
wrote the rules, waived 14 findings, and reads its own score. It is a regression test, not
assurance.

**18. Can its self-evolution process be trusted?**
The mechanism, yes: candidates are inert until registered, the registry is never touched
automatically, and the gate refuses without evidence. The _quality claim_, no: precision 1.0
over three self-authored cases is a plumbing check.

## Missing capabilities

**19. What essential assurance capabilities are missing?**
A score with defined semantics; a coverage statement in the headline; warnings in every
format; a rule-execution record so skipped rules are visible; OS isolation for scanners;
a held-out benchmark.

**20. What would substantially differentiate USA?**
**Per-project applicability reasoning made visible.** No competitor shows _why_ a requirement
applies or does not. USA already computes it and then throws the answer away (166 of the 315
rules absent from the report). Publishing that — "these 166 of the 315 rules were considered and
here is why
each was skipped" — would be a genuinely novel artefact and it needs no new analysis engine.

**21. What should be integrated instead of implemented?**
Vulnerability data (Trivy/OSV via ORT), semantic analysis (Semgrep/CodeQL), sandboxing
(`bwrap`/`sandbox-exec`/containers), signing (cosign), SBOM (CycloneDX), policy (O PA /
Conftest, if ever needed).

**22. What should explicitly remain out of scope?**
CVE database, resolver, reachability, interprocedural taint, DAST, fuzzing, penetration
testing, compliance certification, a plugin host, a second renderer ecosystem.

## Roadmap

**23. What are the next five highest-value initiatives?**

1. USA-R01 — scanner executes only the auditor's binary (P0, security).
2. USA-R03 — a score that cannot be inflated (P1, credibility).
3. USA-R16 — record every rule's disposition so nothing is invisible (P1, differentiator).
4. USA-R04 — decide what maturity means (P1, coherence).
5. USA-R19 — invalid regex must not pass (P1, false assurance in rule packs).

**24. What must be fixed before USA is trustworthy for its intended use?**
R01 (it executes untrusted code), R03 (the number), R16 (the invisibility), R19 (a broken rule
reports a pass). Four items, roughly 300 lines plus tests.

**25. What existing roadmap commitments should be abandoned or deferred?**
Nothing shipped should be abandoned. The _forward_ commitments should be deferred: no new
stack packs, no new adapters, no evolution expansion until the five above land. The
"deliberately not planned" list needs one correction (HTML ships) and otherwise stands.

**26. What should be built over the next development phases?**
NOW: R01, R02, R03, R04, R16, R19. NEXT: warnings in every format (R07), diff fail-closed
(R17), signature breadth (R09), server off the event loop (R08). LATER: held-out benchmark
(R12), per-rule precision from adjudications, monorepo scoring.

**27. What measurable evidence will demonstrate that USA has actually improved?**
Six numbers, all currently absent or wrong: (a) score cannot rise by waiving — property test;
(b) every rendered score carries its coverage; (c) zero project binaries executed under the
hijack fixture; (d) every rule appears in the report with a disposition; (e) 205/205
two-sided fixtures; (f) precision/recall measured on a corpus the candidate author did not
write.

## The ultimate decision

**If USA were being designed today, knowing what this audit found:**

**Preserve** — the linear pipeline; the Severity/Status split; data-driven applicability with
fail-closed predicates; the per-rule fixture gate; the evidence model with central provenance;
verify-only signatures; the refusal to build a resolver or a taint engine.

**Redesign** — the score (state its semantics in one ADR, make waiver and coverage part of the
number); the scanner boundary (absolute executable, honest manifest, optional OS isolation);
the report (warnings and rule dispositions are part of it, not beside it).

**Add** — a fact-provenance type; a rule-execution record; a held-out benchmark; per-rule
precision from real adjudications.

**Eliminate** — `ScannerFinding` and its dead mapper contract; `ENV_DENY` as a control;
the "network denied" claim; the documentation universe's presence inside the scoring loop.

**Order** — (1) stop executing project code; (2) stop the number lying; (3) stop rules
disappearing; (4) stop broken rules passing; (5) then, and only then, grow the catalogue.

The single sentence: **USA's problem is not that it checks too little — it is that it reports
less than it knows.** It computes which rules apply, why they were skipped, which facts were
asserted rather than detected, and which evidence was unavailable. Almost none of that reaches
the reader. Fixing the reporting is cheaper than any new analysis and worth more than all of
it.
