---
'@xenos1996/usa': patch
---

Bump the dev-dependencies group. No shipped code changes.

- `@commitlint/cli` and `@commitlint/config-conventional` → 21.2.4
- `@types/node` → 26.6.5
- `eslint` → 10.13.0
- `lint-staged` → 17.6.0
- `prettier` → 3.9.10
- `typescript-eslint` → 8.72.0

Replaces #180, which dependabot can no longer rebase (a human commit landed on
its branch, so the bot refuses to touch it). Versions are the latest their
ranges resolve to against current `master`, which already carries the `vite`
security pin from #190.
