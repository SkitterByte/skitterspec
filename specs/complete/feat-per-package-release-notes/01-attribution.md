---
linear_issue_id: "SKS-67"
---

# Phase 1 — Commit selection and package attribution ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Given a package and a version, produce the exact list of
`Release-Note:`-carrying commits that belong to it — correct tag series, correct
path attribution. Proven by unit tests over a scaffolded git repo.

## Tasks

- [x] Run `skittership update .` to install `scripts/generate-releases.cjs`,
      `generate-changelog.cjs` and `scripts/lib/`, committed unmodified
      (Decision 4). **It also wired five npm scripts and a `version` hook** —
      removed, see the note below.
- [x] Add `scripts/release-notes.js` with `previousTagFor(pkg, version, tags)`,
      sorting by **semver** rather than lexically.
- [x] Add `packagesFor(changedPaths)`: `packages/common/**` → both;
      `packages/sync-core/**` and `packages/linear/**` → superset only; the
      generated dist dirs → nothing.
- [x] Add `notesInRange(from, to)` keeping only `Release-Note:`-carrying commits,
      with their changed paths, and `notesFor(pkg, version)` combining the two.
- [x] Name the blind spot beside the attribution: it reads changed paths, so a
      user-facing commit touching only `docs/` or `scripts/` attributes to no
      package and is dropped.
- [x] Add tests over a scaffolded git repo: footerless commits excluded; a common
      change reaches both packages and a provider change only one; the range
      starts at the package's own series tag, not the other's; a wrapped
      multi-line body parses.
- [x] Add **stays-silent** tests: a package with no prior tag resolves to no lower
      bound and returns every footer-carrying commit; malformed tag versions are
      ignored rather than throwing.
- [x] Add a guard that `FEEDS` stays in step with `build-dist.js`'s vendor list —
      attribution is only correct while those two agree.
- [x] Run `pnpm test` — **1295 green** (15 new).

### Verified against the real range

`notesFor` over `skitterspec@16.7.0..HEAD` returns **10** notes for the base and
**15** for the superset — the same ten plus five provider-only changes (`sync`,
`doctor` scopes). That is Decision 2 working on real data rather than fixtures.

## Notes

### Deviation — the installer wired more than the generators

`skittership update` also added a `version` npm hook plus `changelog`/`releases`
scripts, and re-encoded the root `description`. All were reverted:

- The `version` hook could never fire — `release.js` edits `package.json`
  directly, and the root's `preversion` guard **refuses** root versioning outright.
- `npm run releases` would have run the single-series generator, which is exactly
  what Decision 5 says is wrong here. Leaving it would have offered a command that
  silently produces the wrong answer.

The generator files themselves are kept unmodified, as Decision 4 requires. The
`skittership:start` section it appended to `CLAUDE.md` is kept — this repo does
use skittership for commits.

### Finding — three footers attribute to nothing

Of 18 footer-carrying commits in the range, **3** attribute to no package:

| Commit | Touches |
|--------|---------|
| `fix(release): cut annotated tags…` | `scripts/`, `RELEASING.md` |
| `docs(site): document every spec-sync verb…` | `docs/` |
| `docs(site): document the spec-env engine…` | `docs/` |

None ships in either distribution, so none should have carried a `Release-Note:`
footer — the rule reserves it for changes an end user of the *package* notices.
Two are website updates and one is this repo's own release tooling; the first was
written by me earlier today and is simply a mistake.

Dropping them is correct, but doing so **silently** is not: that is the blind spot
in `packagesFor`, and it is indistinguishable from a real note being lost. Phase 2
should **report** orphans rather than swallow them.

`git log --name-only` interleaves paths with the commit body, so the parser has
to separate them; the generator's own `lib/git-commits.cjs` uses NUL-delimited
`--pretty` for exactly this reason and is worth copying rather than reinventing.
