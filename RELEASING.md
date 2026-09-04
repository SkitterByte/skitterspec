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

## Prerequisites (before `--publish`)

Planning and the local `--yes` steps need nothing special. Before you publish:

- **Logged in to the npm registry** — `pnpm whoami` should print your username.
  If not, `pnpm login` (auth is shared with npm via `~/.npmrc`; the registry is
  still npmjs.org).
- **Publish rights to the `@skitterbyte` scope** — your account must be a member
  of the org/scope with publish access, or the publish is rejected.
- **2FA / OTP** — if your account enforces two-factor auth at publish time,
  pnpm will prompt for a one-time code (or pass `--otp=<code>`); the release tool
  runs `pnpm publish` interactively so the prompt reaches you.

## The flow

```
node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes] [--publish]
```

The tool escalates by flag — **a bare run changes nothing**:

- **(no flag) — plan.** Prints the ordered steps and exact commands, touches
  nothing. Always start here and read the plan.
- **`--yes` — local.** Bumps the version, commits, and tags `name@version`.
- **`--publish` — publish.** Local steps + `pnpm publish --filter <pkg>` (implies
  `--yes`; `--no-git-checks` since the tool runs its own guards). The package's
  `prepack` runs `build-dist.js` to assemble the self-contained tree.

**The tag is cut last, after the publish succeeds.** A failed publish therefore
leaves no tag, so the tag list only ever claims releases that reached npm. The
inverse failure — a publish that succeeds and then fails to tag — is the
deliberate trade: you are left with a real published version to tag by hand,
which is visible and recoverable, whereas a tag pointing at a version npm does
not have is discovered by a consumer hitting `ETARGET`. (That is not theoretical:
`skitterspec@16.3.1` was tagged, committed and never published, and was found
from outside.) Under `--yes` alone the tag still runs — it is the last local step
either way.

It **never runs `git push`**. When it's done it prints the push commands for you
to run when ready — see below.

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

Both distributions are live on npm: `@skitterbyte/skitterspec@6.0.0` and
`@skitterbyte/skitterspec-linear@2.0.0`, each tagged `name@version` (confirm the
latest anytime with `git tag | sort -V`). A later release just picks the next
version and follows the flow above — verify the plan first, then publish:

```
node scripts/release.js skitterspec major --publish         # 6.0.0 → 7.0.0
node scripts/release.js skitterspec-linear major --publish  # 2.0.0 → 3.0.0
git push --tags
```

Every release so far has been a **major** bump — use `patch`/`minor` (or an
explicit `x.y.z`) if a given release is smaller. There are no wrapper scripts:
the single `node scripts/release.js` command above is the whole surface, so
there's no pinned version to keep in sync.

## Not covered here

Automated **CHANGELOG / release-note generation** is deferred to a later spec —
the single-package-era root scripts that did this have been removed. For now the
release process is versioning, tagging, and publishing only.
