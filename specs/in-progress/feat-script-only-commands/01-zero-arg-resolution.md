---
linear_issue_id: "SKS-47"
---

# Phase 1 — Zero-arg spec resolution from the registry ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env <verb>` works with no spec argument, resolving
from the slot registry — so no skill has to make the model find the spec first.
Proven by unit tests over the three cases (one, several, none).

## Tasks

- [ ] Add a `listRegisteredSpecs(rootDir, config)` helper to
      `packages/skitterspec/src/env/registry.js` returning the registered spec
      names in slot order (missing registry file → `[]`, matching `readRegistry`'s
      existing tolerance).
- [ ] Extend `resolveSpec` (`packages/skitterspec/src/env/resolve.js:219`) to
      accept a falsy `specArg`: consult the registry, and resolve the sole
      registered name as if it had been passed.
- [ ] Throw a listing error when several specs are registered — a numbered list of
      names plus the verb to re-run — and a distinct error naming `/spec-go` when
      none is. Both exit non-zero via the existing CLI error path.
- [ ] Name the blind spot in a comment beside the registry lookup: the registry is
      machine-local and gitignored, so it is empty on a fresh clone and after a
      manual `.spec-env/` wipe — which means "no specs registered", never "no specs
      exist". Cite why the `specs/in-progress/` bucket is deliberately not
      consulted (git drops empty directories).
- [ ] Confirm `resolveSpecWithWorktree` (`packages/skitterspec/src/cli.js:495`)
      passes a missing arg straight through, so every `spec-env` subcommand
      inherits the behaviour without per-verb changes.
- [ ] Update the `spec-env` usage string (`packages/skitterspec/src/cli.js:1332`)
      to show `[spec]` as genuinely optional and say what omitting it does.
- [ ] Add tests: sole-registered resolves; several → non-zero with every name
      listed; none → non-zero naming `/spec-go`; an explicit arg still wins over a
      registry with several entries.
- [ ] Add the **stays-silent** test required by `.claude/rules/negative-checks.md`:
      a healthy repo with exactly one registered spec and **no** `specs/in-progress/`
      directory on disk must resolve cleanly and emit no warning — the empty-bucket
      case that motivated Decision 1.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

This phase is independently useful and ships alone: it removes the "identify the
target" lookup from *every* engine skill, whether or not the later phases land.

Resolution deliberately does not fall back to scanning spec buckets when the
registry is empty. A spec with no slot has no worktree, so there is nothing for
`connect`, `live` or `integrate` to act on — an unresolvable case, not one to
guess at.
