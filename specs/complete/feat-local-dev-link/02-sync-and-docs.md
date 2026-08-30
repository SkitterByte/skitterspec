# Phase 2 — The round-trip: dev:sync and the documented recipe ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** one command pushes a local change into a linked consumer, and the
README explains the loop well enough that someone hitting the stale-skills
symptom knows why.

## Tasks

- [x] Add `scripts/dev-sync.js` and a `dev:sync` npm script taking a consumer
      directory: run the build here, then run that consumer's `skitterspec
      update` (via its own linked bin, so it exercises the real path).
- [x] Fail clearly when the target is not a skitterspec consumer (no
      `specs/.core/`) or does not actually link back to this repo — a silent
      no-op against the wrong directory is the failure worth preventing.
- [x] Relay `update`'s own report rather than swallowing it: it distinguishes
      created / updated / skipped / **customized** files, and a consumer whose
      skill was customised needs to see that its change was declined.
- [x] Add a README section: the `link:` install, the edit→`dev:sync` loop, and
      the two footguns by name — an unbuilt link target, and skills being copied
      so the CLI updates while the skills do not until `update` runs.
- [x] State that `update` needs no `--force` for pristine files, and what
      `--force` would cost (it overwrites consumer customisations).
- [x] Add tests: `dev-sync` rejects a directory with no `specs/.core/`; rejects
      one not linked to this repo; the README documents the recipe. Run
      `node --test` — green before the phase is done.
- [x] **Added mid-phase — the docs were incomplete.** Document the *first* link
      into a project that has never used skitterspec: it needs
      `skitterspec init`, not `update`, and `dev:sync` refuses until it has one.
- [x] **Added mid-phase.** `pnpm add …@link:` writes an **absolute machine-local
      path** into the consumer's `package.json`. Committing that breaks the
      project for everyone else and for CI, and when the link points at a spec
      *worktree* it dangles as soon as `/spec-complete` removes it. Warn on link,
      and document it.
- [x] **Added mid-phase.** Add `npm run dev:unlink <consumer>` to put a project
      back on the published package, so undoing is a command rather than a
      remembered incantation.

## Notes

Deliberately not a watcher. Watch mode would only automate the build half — the
consumer still needs `update` — so it would halve a two-step loop rather than
remove it, while adding a process to leave running. Revisit if `dev:sync` turns
out to be run constantly.

**Verified end to end, not just unit-tested.** Built a real consumer in a
throwaway dir: `dev:link` → `skitterspec init` → edited
`packages/common/assets/skills/spec-go/SKILL.md` here → `dev:sync` → confirmed
the marker appeared in the consumer's copied `.claude/skills/spec-go/SKILL.md`.
That round trip is the whole feature and no unit test covers it.

**The link check resolves real paths**, rather than testing for the presence of
`node_modules/@skitterbyte/<dist>`. A consumer on the *published* package has
that directory too — syncing it would rebuild here, update there, report success,
and change nothing. That is the most confusing outcome available, since every
command succeeds, so it gets its own refusal and its own test.

**Which distribution is detected, not asked.** The consumer already declared it
by linking one; a `[dist]` argument could disagree with reality and would only
ever be a way to get it wrong. (`dev:link` still takes one, because at link time
nothing has been declared yet.)

## The docs were incomplete — what a review found

Asked whether setup was documented, three gaps turned up. The third is the one
that mattered:

1. **The first link was undocumented.** A project that has never used skitterspec
   needs `skitterspec init`, not `update`, and `dev:sync` refuses until it has
   one. `dev-link`'s runtime output said so; the README jumped from link
   straight to sync.
2. **Undoing was undocumented**, and was not a command at all. Added
   `npm run dev:unlink`.
3. **`dev:link` now refuses to run from a spec worktree.** The link is an
   absolute path, and `/spec-complete` removes the worktree when the spec lands —
   so the consumer would point at a deleted directory at exactly the moment the
   work became available. No override: the primary checkout is always available
   and strictly better, and the refusal prints its path. Detection is the `.git`
   **file** a linked worktree carries versus the `.git` *directory* a primary
   checkout has — no git subprocess. Tested against fixtures rather than the
   running repo, which would otherwise invert every time this work moved between
   a worktree and `main`.
4. **`pnpm add …@link:` writes an absolute machine-local path into the
   consumer's `package.json`** — `"link:/Users/…/packages/skitterspec-linear"`.
   Committing it breaks the project for every other machine and for CI, and when
   the link points at a spec *worktree* it dangles as soon as `/spec-complete`
   removes it. Now warned at link time and called out in the README.

**A bug in `dev-unlink`, found by running it.** `pnpm add <name>` sees the
dependency already satisfied by the link, no-ops, and leaves `link:` in
package.json **while reporting success** — worse than failing, since it tells you
the link is gone when it is not. It now removes before adding, verified to turn
`link:/Users/…` back into `^10.1.0`, with the ordering pinned by a test.
