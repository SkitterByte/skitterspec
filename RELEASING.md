# Releasing

This is an npm-workspaces monorepo. The **private root**
(`skitterspec-monorepo`) is never published — it exists only to host the
workspaces. Two distributions publish independently, each on its own cadence:

| Package | npm name | Dir |
|---------|----------|-----|
| `skitterspec` | `@skitterbyte/skitterspec` | `packages/skitterspec` |
| `skitterspec-linear` | `@skitterbyte/skitterspec-linear` | `packages/skitterspec-linear` |

All releasing goes through **`scripts/release.js`**. Do **not** run
`npm version` at the root — it bumps the private root package (it once misfired
`0.0.0 → 1.0.0`), so a `preversion` guard now refuses it.

## The flow

```
node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes] [--publish]
```

The tool escalates by flag — **a bare run changes nothing**:

- **(no flag) — plan.** Prints the ordered steps and exact commands, touches
  nothing. Always start here and read the plan.
- **`--yes` — local.** Bumps the version, commits, and tags `name@version`.
- **`--publish` — publish.** Local steps + `npm publish` (implies `--yes`). The
  package's `prepack` runs `build-dist.js` to assemble the self-contained tree.

It **never runs `git push`**. When it's done it prints the push commands for you
to run when ready — see below.

## Tag scheme

Tags are `name@version` (short, unscoped): `skitterspec@2.0.1`,
`skitterspec-linear@1.1.0`. The constant `@skitterbyte/` scope carries no
information and is omitted. Legacy flat `v*` tags stay as history.

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
`--access public` or npm defaults it to a (paid) private package — the tool
always passes `--access public`.

## Push tags yourself

The tool never pushes. After a local/publish run, push the branch and the tag:

```
git push
git push origin <name>@<version>
```

or push all tags at once with `git push --tags`.

## First releases

The move to the `name@version` scheme means the first releases tag versions
already written to `package.json` (no bump). Verify the plan first, then the
operator publishes:

```
node scripts/release.js skitterspec 2.0.0 --publish        # tags skitterspec@2.0.0, publishes over npm 1.0.1
node scripts/release.js skitterspec-linear 1.0.0 --publish # first-ever publish, --access public
git push --tags
```

## Not covered here

Automated **CHANGELOG / release-note generation** is deferred to a later spec —
the single-package-era root scripts that did this have been removed. For now the
release process is versioning, tagging, and publishing only.
