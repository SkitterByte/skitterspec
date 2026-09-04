---
linear_issue_id: "SKS-67"
---

# Phase 1 — Commit selection and package attribution ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Given a package and a version, produce the exact list of
`Release-Note:`-carrying commits that belong to it — correct tag series, correct
path attribution. Proven by unit tests over a scaffolded git repo.

## Tasks

- [ ] Run `skittership update .` to install `scripts/generate-releases.cjs`,
      `generate-changelog.cjs` and `scripts/lib/`. Commit them as managed files,
      unmodified (Decision 4). Confirm `pnpm test` still passes with them present.
- [ ] Add `scripts/release-notes.js` with `previousTagFor(pkg, tags)`: filter
      `<pkg>@*`, sort by semver (not lexically — `16.8.0` sorts below `8.3.0` as a
      string, which is exactly how the npm version list misled us earlier today),
      and return the highest below the target.
- [ ] Add `packagesFor(changedPaths)` deriving attribution from the build:
      `packages/common/**` → both distributions; `packages/linear/**` and
      `packages/sync-core/**` → superset only; `packages/skitterspec{,-linear}/**`
      → neither (generated, gitignored).
- [ ] Add `notesInRange(pkg, from, to)` combining the two: `git log --no-merges
      --name-only`, keep commits with a `Release-Note:` footer, then keep those
      whose paths attribute to `pkg`.
- [ ] Name the blind spot beside the attribution: it reads **changed paths**, so a
      commit that is user-facing but touches only `docs/` or `scripts/` attributes
      to no package and is dropped. That is deliberate — such a commit should not
      carry a `Release-Note:` — but it is the case to check first when a note goes
      missing.
- [ ] Add tests over a scaffolded git repo: two interleaved tag series resolve
      independently; a `packages/common` commit appears for both packages; a
      `packages/linear` commit appears only for the superset; a commit with no
      footer is excluded; semver ordering beats lexical.
- [ ] Add a **stays-silent** test (`.claude/rules/negative-checks.md` rule 3): a
      package with **no** prior tag resolves to the empty range and returns every
      footer-carrying commit, rather than erroring or returning nothing.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

`git log --name-only` interleaves paths with the commit body, so the parser has
to separate them; the generator's own `lib/git-commits.cjs` uses NUL-delimited
`--pretty` for exactly this reason and is worth copying rather than reinventing.
