---
linear_issue_id: "SKS-47"
---

# Phase 1 — Zero-arg spec resolution from the worktree list ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-env <verb>` works with no spec argument — resolving
the worktree it is run from, else the sole spec that has one — so no skill has to
make the model find the spec first. Proven by unit tests over every outcome.

## Tasks

- [x] ~~Add a `listRegisteredSpecs` helper to the registry~~ — **abandoned.** The
      slot registry covers Docker specs only (`specEnvUp` allocates a slot solely
      when `wantsDocker`), so it is permanently empty in a `docker.enabled: false`
      project. See the Changelog entry and Decision 1 as revised.
- [x] Add `soleProvisionedSpec(dir, config)` to `packages/common/src/cli.js`,
      resolving the sole spec that owns a git worktree via the existing
      `liveWorktreePaths` + `allSpecs` helpers.
- [x] Throw a listing error when several specs have worktrees — a numbered list of
      names — and a distinct error naming `/spec-go` when none does. Both exit
      non-zero via `bin/skitterspec.js`.
- [x] Name the blind spot in a comment beside the lookup: why the registry and the
      `specs/in-progress/` bucket are both rejected as sources, and that a worktree
      removed behind git's back over-reports (an ambiguity error) rather than
      resolving the wrong spec.
- [x] Resolve the name at the head of `resolveSpecWithWorktree`
      (`packages/common/src/cli.js`) — it calls `path.basename(specArg)`
      immediately, so a falsy argument threw a `TypeError` there.
- [x] Drop the `if (!specArg) { usage; return }` guard from exactly the seven
      subcommands named in Decision 8 (`up`, `down`, `dev`, `integrate`,
      `hotfix land`, `resolve`, `live take`) so the resolution is reached. Left
      `connect` (missing arg means `main`) and `live status` (repo-wide report)
      untouched.
- [x] Update the `spec-env` usage string to show `[spec]` as optional, say what
      omitting it does, and name the two subcommands that keep their own meaning.
- [x] Add a regression test that `spec-env connect` with no argument still
      **disconnects** and `spec-env live status` with no argument still prints the
      repo-wide report — the two meanings Decision 8 protects.
- [x] Add tests: sole-provisioned resolves; several → throws listing every name;
      none → throws naming `/spec-go`; an explicit arg still wins; a bucketed spec
      with no worktree is not counted.
- [x] Add the **stays-silent** tests required by
      `.claude/rules/negative-checks.md`: a docker-less project with an empty
      registry resolves cleanly, and a spec authored on its branch with **no**
      `specs/in-progress/` directory in the primary checkout resolves cleanly.
- [x] Run the project's test command — 1110 tests green, and `pnpm build`
      composes both distributions.

### Amendment — resolve from the cwd first

- [x] Resolve **the worktree the command is run from** ahead of the sole-worktree
      rule, deepest match winning, so a nested worktree is not shadowed. Several
      worktrees at once is the normal shape of this workflow, so "the only one"
      rarely fires on its own.
- [x] Fall through to the sole-worktree rule and then the listing errors when the
      cwd is the primary checkout or outside every worktree.
- [x] Add tests: resolves from inside a worktree despite an ambiguous set; resolves
      from a nested subdirectory; the primary checkout still refuses.
- [x] Re-run `pnpm test` — 1113 green.

## Notes

Removing those seven usage guards also changes their exit code on an
unresolvable argument from 0 (print usage, return) to non-zero (throw). That is
the intended behaviour per Decision 2 and is called out in the Impact table.

The project has no `typecheck` or `lint` script — `pnpm test` (node --test) is
the whole gate, with `pnpm build` proving both distributions still compose.
Phases 2–4 should say `pnpm test` rather than "the project's typecheck and test
commands".

This phase is independently useful and ships alone: it removes the "identify the
target" lookup from *every* engine skill, whether or not the later phases land.

Resolution deliberately does not fall back to scanning spec buckets when the
registry is empty. A spec with no slot has no worktree, so there is nothing for
`connect`, `live` or `integrate` to act on — an unresolvable case, not one to
guess at.
