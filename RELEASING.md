# Releasing

This is a pnpm-workspaces monorepo. The **private root**
(`skitterspec-monorepo`) is never published — it exists only to host the
workspaces. Two distributions publish independently, each on its own cadence:

| Package | npm name | Dir |
|---------|----------|-----|
| `skitterspec` | `@skitterbyte/skitterspec` | `packages/skitterspec` |
| `skitterspec-linear` | `@skitterbyte/skitterspec-linear` | `packages/skitterspec-linear` |

All releasing goes through **`scripts/release.js`**. Do **not** version the root
package directly — it bumps the private root package (it once misfired
`0.0.0 → 1.0.0`), so a `preversion` guard now refuses it. The tool bumps a
package's version by editing its `package.json` in place (pnpm has no
workspace-scoped `version` verb), then commits and tags.

## Prerequisites

Planning and the local `--yes` steps need nothing special — no npm login, no
token. Publishing is CI's, and it authenticates by OIDC.

Two things are set up once, and one is needed each time you approve:

- **A trusted publisher per package**, configured on the npm website under
  Settings → Trusted Publisher → GitHub Actions. Every field is exact and
  **case-sensitive**: Organization `SkitterByte`, Repository `skitterspec`
  (the bare name), Workflow `release.yml` (the filename — renaming that file
  breaks every publish), Environment **blank**. A lowercase org here produces
  `ENEEDAUTH`.
- **`repository.url` matching the org's case** in every manifest. npm validates
  the sigstore provenance bundle against it case-sensitively, and a mismatch
  fails the publish at the very last step with
  `422 … Failed to validate repository information`.
  `scripts/package-metadata.test.js` guards it.
- **An authenticated, 2FA-capable session to approve** — `npm login`, and npm
  >= 11.15.0 locally (`npm stage` does not exist before that). An `E401` from
  `npm stage list` means you are not logged in, not that the release failed.

## The flow

```
node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes]
git push && git push origin <package>@<version>
npm run approve <package> <version>
```

The tool escalates by flag — **a bare run changes nothing**:

- **(no flag) — plan.** Prints the ordered steps and exact commands, touches
  nothing. Always start here and read the plan.
- **`--yes` — local.** Bumps the version, writes `RELEASES-<package>.md`,
  commits, and tags `name@version`. It never pushes and **never publishes**.

**Pushing the tag is what releases.** `.github/workflows/release.yml` triggers on
`<package>@*`, checks the tag agrees with the manifest, runs the suite, and then
`npm stage publish` — staging the build on npm without any token, by OIDC. The
package's `prepack` runs `build-dist.js` to assemble the self-contained tree, so
the workflow packs from the package directory.

**Staged is not published.** A staged build waits for a human to approve it with
2FA:

```
npm run approve skitterspec 19.0.0
npm run approve skitterspec --reject     # discard it instead
```

`npm stage approve` takes a **stage-id** (a UUID), never a package spec — only
`npm stage list` accepts a spec — so the helper resolves the version to an id
through the listing first. Pass a stage-id directly if you have one.

**Why the tag now comes before the publish.** This tool used to publish first and
tag afterwards, so a failed publish could not leave a tag asserting a release npm
did not have — `skitterspec@16.3.1` was tagged, committed, never published, and
found from outside. Staging inverts that trade: nothing is consumed on npm until
an approval, so a tag whose staging failed costs a `git tag -d` and a re-push
rather than a burnt version. In exchange **CI is the only publisher**, which is
what makes provenance a property of every release rather than of the ones that
happened to go through it. There is no `--publish` flag any more.

**Recovery.** If a tag is already pushed and the run needs repeating, use the
workflow's `workflow_dispatch` trigger with the package and version — no second
tag needed.

**Don't trust a green workflow.** Staging is not publishing. After approving:

```
npm view @skitterbyte/skitterspec dist-tags
npm view @skitterbyte/skitterspec@19.0.0 dist.attestations
```

## Tag scheme

Tags are `name@version` (short, unscoped): `skitterspec@2.0.1`,
`skitterspec-linear@1.1.0`. The constant `@skitterbyte/` scope carries no
information and is omitted. Legacy flat `v*` tags stay as history.

They are **annotated** (`git tag -a … -m "<name> <version>"`), and that is
load-bearing rather than cosmetic. `git push --follow-tags` — how a tag normally
travels with the branch it belongs to, and what most push aliases wrap — sends
annotated tags and nothing else. A lightweight release tag stays local while the
push reports success, which is how seven tags for published versions accumulated
unpushed across five releases. Annotation also records who cut the release and
when.

The follow-up commands the tool prints still name the tag explicitly, so they
work either way.

## Release from `main`, not from a spec branch

**Cut release tags on the base branch, or land the branch before tagging.** A
rebase after tagging leaves the published provenance pointing at commits that are
no longer in `main`'s history.

It happened on the first real release. `skitterspec@19.0.0` and
`skitterspec-linear@13.0.0` were tagged on a spec branch, pushed, staged and
approved — and the branch was then rebased onto a `main` that had moved, which
replayed every commit at a new sha. The result:

- `main` carries `chore(release): skitterspec@19.0.0` at one sha;
- the tag, and the attestation npm published, name a different one;
- that commit is **not an ancestor of `main`**.

Nothing was corrupted. Annotated tags keep their commits alive, so
`refs/tags/skitterspec@19.0.0` still dereferences to exactly the commit the
attestation names and verification still succeeds. But two things degrade:

- **Every future `<tag>..HEAD` range is wider than it should be**, because the
  tag is off the history line — so the changelog and release-note generators scan
  commits that already shipped. They produced no duplicates that time only
  because none of the re-scanned commits yielded a note.
- **`git log main` no longer shows the release commit** the registry was built
  from, which is the audit trail anyone would reach for first.

**Do not "fix" it by moving the tag.** Re-pointing a release tag at the rebased
commit makes the attestation's `gitCommit` disagree with what its `ref` resolves
to, which breaks the one property provenance exists to provide. A published
attestation is immutable; local history is not, and the mismatch is the cheaper
of the two.

## Guards

Before mutating anything, the tool fails closed on:

- a **dirty working tree** — commit or stash first;
- an **already-existing tag** — that release is already cut;
- an **unknown package** — only the two above are valid;
- a **downgrade** — a target older than the current version. An **equal** target
  is allowed (for a first release of a version already written to
  `package.json`); the bump/commit are skipped and the existing commit is tagged.

## Publish order

Versioning is independent — **publish only what changed.** When both go out
together, publish **base before linear** by convention (linear is a superset
built from the same common assets).

## Scoped packages

Both are scoped (`@skitterbyte/…`). The first publish of a scoped package needs
`--access public` or the registry defaults it to a (paid) private package — the
tool always passes `--access public`.

## Releases that would ship nothing

A release is **refused** when no input to the package's tarball has changed since
its last tag:

```
nothing to ship: no tarball input for skitterspec-linear changed since
skitterspec-linear@9.1.0 — this release would be byte-identical apart from the
version. Pass --allow-empty if you mean it (a deliberate version alignment).
```

This exists because `skitterspec-linear@9.1.0` shipped nothing: across every
input the only change was the version string, and a consumer had to unpack both
published tarballs to find that out. A minor bump is supposed to signal new
functionality.

The inputs are the **composing source packages** plus each distribution's own
committed files — `packages/common` for the base, plus `packages/linear` and
`packages/sync-core` for the superset. They are deliberately *not*
`packages/<dist>/{src,assets,bin}`: those are gitignored and composed at prepack,
so a diff over them is empty for every release and the check would never fire.
The version bump in the package's own `package.json` is excluded too, or every
release would look substantive.

Pass `--allow-empty` for a deliberate version-alignment bump. Doing so records
the intent in the invocation rather than leaving it to be reverse-engineered
later.

## Push tags yourself

The tool never pushes. After a local/publish run, push the branch and the tag:

```
git push
git push origin <name>@<version>
```

or push all tags at once with `git push --tags`.

## Published so far

Both distributions are live on npm, each tagged `name@version` (confirm the
latest anytime with `git tag | sort -V`). A later release picks the next version
and follows the flow above — verify the plan first, then tag, push and approve:

```
node scripts/release.js skitterspec major --yes             # plan says 18 → 19
node scripts/release.js skitterspec-linear major --yes      # plan says 12 → 13
git push --tags
npm run approve skitterspec 19.0.0
npm run approve skitterspec-linear 13.0.0
```

Neither version is hardcoded here on purpose — the plan prints the real current
version, and a number written into prose goes stale the next time anyone
releases.

Every release so far has been a **major** bump — use `patch`/`minor` (or an
explicit `x.y.z`) if a given release is smaller. There are no wrapper scripts:
the single `node scripts/release.js` command above is the whole surface, so
there's no pinned version to keep in sync.

## Not covered here

Automated **CHANGELOG generation**. Per-package user-facing release notes ARE
generated — `scripts/release-notes.js` writes `RELEASES-<package>.md` from the
`Release-Note:` footers of the commits in the tag range, and `release.js` runs it
as a local step so the notes are committed in the tree the tag points at. A
`Release-Note:` on the version commit itself would be the one place the generator
cannot see it.
