# Phase 2 — The round-trip: dev:sync and the documented recipe ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** one command pushes a local change into a linked consumer, and the
README explains the loop well enough that someone hitting the stale-skills
symptom knows why.

## Tasks

- [ ] Add `scripts/dev-sync.js` and a `dev:sync` npm script taking a consumer
      directory: run the build here, then run that consumer's `skitterspec
      update` (via its own linked bin, so it exercises the real path).
- [ ] Fail clearly when the target is not a skitterspec consumer (no
      `specs/.core/`) or does not actually link back to this repo — a silent
      no-op against the wrong directory is the failure worth preventing.
- [ ] Relay `update`'s own report rather than swallowing it: it distinguishes
      created / updated / skipped / **customized** files, and a consumer whose
      skill was customised needs to see that its change was declined.
- [ ] Add a README section: the `link:` install, the edit→`dev:sync` loop, and
      the two footguns by name — an unbuilt link target, and skills being copied
      so the CLI updates while the skills do not until `update` runs.
- [ ] State that `update` needs no `--force` for pristine files, and what
      `--force` would cost (it overwrites consumer customisations).
- [ ] Add tests: `dev-sync` rejects a directory with no `specs/.core/`; rejects
      one not linked to this repo; the README documents the recipe. Run
      `node --test` — green before the phase is done.

## Notes

Deliberately not a watcher. Watch mode would only automate the build half — the
consumer still needs `update` — so it would halve a two-step loop rather than
remove it, while adding a process to leave running. Revisit if `dev:sync` turns
out to be run constantly.
