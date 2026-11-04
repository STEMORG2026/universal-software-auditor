# RULE AND DETECTOR SEMANTIC AUDIT

The brief asked for all 315 rules to be accounted for and not to claim full semantic
verification. This document does three things in that spirit:

1. **All 315 are accounted for** — mechanically, with the checks in
   `inventories/rules-semantic.csv`.
2. **All 23 CRITICAL rules are read** — the tier where a wrong rule costs the most.
3. **A verdict per rule** is recorded, and the number genuinely verified is stated plainly.

## Coverage statement, up front

| Achievement                                                                                       |                             Count |
| ------------------------------------------------------------------------------------------------- | --------------------------------: |
| Rules inventoried (id, pack, section, kind, severity, class, automatability, fixture, references) |                               315 |
| Rules with a machine-checkable structural pass                                                    |                               315 |
| Rules with a two-sided fixture                                                                    |                               192 |
| Rules **read and judged** by a human (this audit)                                                 |            23 (the CRITICAL tier) |
| Rules with a **behavioural** proof they fire and do not misfire on their fixture                  | 205 (the fixture suite, executed) |
| Rules whose pattern was **adversarially probed** with a hand-written false-positive input         |                                 4 |
| Rules **semantically verified** in the full sense the brief describes                             |                             **0** |

Zero is the honest number. A rule is semantically verified when someone has established that
its pattern matches the real-world condition its title claims, that it does not match the
legitimate near-misses, and that its severity and remediation are right. The fixture suite
proves a rule fires on _the fixture the rule's author wrote_. That is not the same claim, and
the difference is exactly what this section quantifies.

## Structural pass — what the 315 have in common

| Check                                                    | Result                                            |
| -------------------------------------------------------- | ------------------------------------------------- |
| Unique rule ids                                          | 315 / 315, **0 duplicates**                       |
| Severity in the canonical enum                           | 315 / 315                                         |
| Class in the canonical enum                              | 315 / 315                                         |
| Check kind declared in `types.ts`                        | 315 / 315                                         |
| Has `remediation`                                        | 315 / 315                                         |
| Has `why`                                                | 315 / 315                                         |
| Has at least one `references` entry                      | 309 / 315 (6 have none)                           |
| Maps to a standards catalogue                            | 213 / 315 (68%) — matches `usa standards` exactly |
| Duplicate check payloads (same kind + pattern + include) | **0**                                             |
| `applies_when` references a fact **nothing can produce** | **8**                                             |

The zero-duplicate result is worth stating: I expected overlap between `testing` and
`testing-assurance`, and at the _payload_ level there is none — the rules ask different
questions even where the titles are close. S16's "double counting" concern is therefore not
supported at the mechanical level; it remains a semantic question I did not settle.

### The eight rules that cannot fire by default

| Fact              | Rules gated on it                    |
| ----------------- | ------------------------------------ |
| `has:crypto`      | SEC-011                              |
| `has:file-upload` | SEC-022                              |
| `has:pii`         | SEC-023, SEC-024, COMP-006, COMP-007 |
| `has:payments`    | DEP-008, COMP-008                    |

No detector in `rules/detectors.yaml` produces these four facts (236 detectors checked).
They can only become true if a project **declares** them — via `.usa.yaml` `facts:` or the
foundation interview. That may be the intent (a scanner cannot tell whether an app handles
payments), but the consequence is that eight rules, one of them CRITICAL, are dead for every
project that does not know to assert a fact. Nothing in the report says "this rule needed a
fact you did not declare"; the rule simply is not there. See USA-AUD-024.

## The 23 CRITICAL rules, read

Verdict vocabulary: **SOUND** (pattern, severity and remediation agree), **NARROW** (fires
correctly but misses obvious cases), **BROAD** (fires on legitimate code — false positive),
**INERT** (cannot fail, so cannot gate), **DEAD** (cannot apply).

| Rule      | Title                                          | Kind             | Verdict            | Note                                                                                                                                                                                                                                                                      |
| --------- | ---------------------------------------------- | ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REPO-001  | .gitignore is present                          | file_exists      | **OVERSTATED**     | A missing `.gitignore` is hygiene, not CRITICAL. Severity inflation: it is the most common CRITICAL in any new repo and the least dangerous.                                                                                                                              |
| REPO-002  | No env/secret files committed                  | tracked_absent   | **BROAD**          | Bans `.npmrc` categorically. This repository had to waive it for itself (`.usa.yaml` REPO-002) — a rule that its own author must suppress is a rule with a known false positive built in.                                                                                 |
| REPO-003  | No secrets in git history                      | command (assist) | **INERT + NARROW** | `command` kind ⇒ UNKNOWN unless `--allow-commands`. A CRITICAL that never gates. The pipeline also scans the entire history on every run.                                                                                                                                 |
| SEC-001   | No hardcoded credentials in source             | grep_absent      | SOUND              | 12+ char quoted literal after a credential name is a defensible heuristic; misses 8-char literals and `=`-free forms.                                                                                                                                                     |
| SEC-005   | SQL not built by concatenation                 | grep_wrong       | SOUND              | Gated on `has:database`, which a detector does produce.                                                                                                                                                                                                                   |
| SEC-007   | Shell commands not built from user input       | grep_wrong       | SOUND              | Same-line heuristic; multiline concatenation escapes it.                                                                                                                                                                                                                  |
| SEC-011   | Passwords use a modern adaptive hash           | grep_absent      | **DEAD + BROAD**   | Gated on `has:crypto`, which nothing produces (dead). The pattern also bans `createHash('sha256')` outright — verified to match a file checksum: `crypto.createHash("sha256").update(buf)` → MATCH. A project using SHA-256 for integrity fails a CRITICAL password rule. |
| SUP-011   | No secrets in CI configuration                 | grep_absent      | SOUND              | 16+ char literal after a credential name; `${{ secrets.X }}` correctly excluded.                                                                                                                                                                                          |
| NODE-004  | No private registry credentials                | grep_absent      | SOUND              | Narrow by design; this repo relies on it as the backstop for its waived `.npmrc`.                                                                                                                                                                                         |
| PY-006    | No unsafe deserialisation                      | grep_absent      | **BROAD**          | `yaml.load\s*\((?!.*Safe)` cannot see a `SafeLoader` on the next line (no `s` flag). Verified: a multiline `yaml.load(` matches regardless of the loader.                                                                                                                 |
| PY-008    | Debug mode not enabled                         | grep_absent      | SOUND              |                                                                                                                                                                                                                                                                           |
| GO-007    | SQL is parameterised                           | grep_absent      | **BROAD**          | `Exec\(\s*.*\+` fires on any `Exec(` with a `+` later on the line, including a log concatenation.                                                                                                                                                                         |
| JVM-002   | No hardcoded credentials in config             | grep_absent      | SOUND              | `${…}` / `#{…}` / `{{…}}` correctly excluded.                                                                                                                                                                                                                             |
| JVM-004   | Parameterised SQL / JPA                        | grep_absent      | SOUND              |                                                                                                                                                                                                                                                                           |
| WEB-007   | No secrets in client bundles                   | grep_wrong       | **BROAD**          | `NEXT_PUBLIC_.*(SECRET\|KEY\|TOKEN\|PASSWORD)` — verified to match `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, which is _designed_ to be public. A legitimate front-end fails this CRITICAL.                                                                                    |
| MOB-002   | No hardcoded API secrets in bundles            | grep_absent      | SOUND              |                                                                                                                                                                                                                                                                           |
| CTNR-005  | No secrets baked into the image                | grep_absent      | SOUND              |                                                                                                                                                                                                                                                                           |
| IAC-001   | No public exposure of buckets/databases        | grep_wrong       | **BROAD**          | `0.0.0.0/0` anywhere fires on a security group that allows 443 from the internet — normal for any public service.                                                                                                                                                         |
| SOLID-001 | Reentrancy protection                          | manual           | **INERT**          | Always UNKNOWN ⇒ excluded from the score, never gates.                                                                                                                                                                                                                    |
| SOLID-003 | Explicit access control                        | manual           | **INERT**          | Same.                                                                                                                                                                                                                                                                     |
| SOLID-004 | tx.origin not used for auth                    | grep_absent      | SOUND              |                                                                                                                                                                                                                                                                           |
| AI-001    | Untrusted content cannot override instructions | manual           | **INERT**          | Same, and it is the AI-era flagship.                                                                                                                                                                                                                                      |
| AI-002    | Model output validated before execution        | grep_wrong       | NARROW             | Reasonable, but only catches `exec(`/`eval(` whose argument is literally named `completion`/`response`/….                                                                                                                                                                 |

**Tally: 12 SOUND, 2 NARROW, 6 BROAD, 3 INERT, 1 DEAD, 1 OVERSTATED** (some rules carry two
labels; 23 of the 315 rules, 25 labels).

### What that means for the CRITICAL tier

- **4 of 23 CRITICAL rules can never fail a build** (3 `manual`, 1 `command`-without-flag).
  The severity says "this matters most"; the mechanics say "this cannot gate". A reader who
  filters on CRITICAL gets a list where one in six entries is decorative.
- **6 of 23 fire on legitimate code.** Every one of them is a CRITICAL, so each false
  positive is maximally expensive: it blocks a release or forces a waiver. Two are verified
  by direct regex probe (SEC-011, WEB-007); one more (PY-006) by probe; three by reading.
- **1 of 23 cannot apply at all** (SEC-011, dead fact).

That is the semantic state of the tier that matters most, and it is the reason "315 rules"
is not a quality statement.

## Detectors

236 primitives, all inventoried in `inventories/detectors.csv` with fact, category, title and
match primitives. Distribution: framework 42, platform 38, language 20, pm 20, tooling 18,
test 14, ci 12, doc 12, orm 11, type 11, db 10, auth 9, ai 7, obs 6, api 4, has 2.

Observed properties, verified statically:

- Match primitives are declarative (`any_file`, `file_exists`, `dir_exists`, `content`,
  `manifest`, `metric`, `any_of`/`all_of`, `implies`) — no code execution in detection.
- Facts are **presence-only**; only `metric:` facts carry a value. `eq`/`neq` on a flag fact
  compare `present === Boolean(value)`, which is a coercion trap a pack author can trip
  (`op: eq, value: 'typescript'` evaluates `present === true`).
- 20 language detectors cover TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Swift,
  Ruby, PHP, C#, C/C++, Scala, Dart, Elixir, Lua, Zig, Solidity and more — the "universal"
  claim is real at the detection layer even where no pack follows.
- The header comment advertises `project:`, `infra:`, `practice:`, `maturity:` namespaces;
  `maturity:*` is produced, the others are not (categories are the 16 listed above). Minor
  documentation drift inside the data file.

## Verification designs for the rules that need one

For each BROAD verdict, the fixture that would settle it (positive = must fire, negative =
must not):

| Rule     | Negative fixture (must PASS)                                                                       | Positive fixture (must fire)                |
| -------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| SEC-011  | `crypto.createHash('sha256').update(buf)` for a checksum, in a project with a bcrypt password path | `crypto.createHash('md5').update(password)` |
| WEB-007  | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`                                                     | `NEXT_PUBLIC_STRIPE_SECRET_KEY=sk_live_…`   |
| PY-006   | `yaml.load(f,\n  Loader=yaml.SafeLoader)` across two lines                                         | `yaml.load(f)`                              |
| GO-007   | `db.Exec(q)` preceded by an unrelated `log.Printf("x" + id)` on another line                       | `db.Exec("SELECT … " + id)`                 |
| IAC-001  | a security group allowing 443 from `0.0.0.0/0`                                                     | a bucket with `acl = "public-read"`         |
| REPO-002 | `.npmrc` with only a scope mapping                                                                 | `.npmrc` with `//registry/:_authToken=…`    |

Each of these is a two-line YAML file in the existing fixture format. Six fixtures would
convert six CRITICAL false-positive risks into tested behaviour; that is the cheapest
quality work available to this project.
