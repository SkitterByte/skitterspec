# skitterspec (monorepo)

Spec-driven development for [Claude Code](https://claude.com/claude-code). This
is a pnpm-workspaces monorepo: a private root (`skitterspec-monorepo`, never
published) hosting the workspaces under `packages/`, plus a shared build that
composes two publishable distributions.

## Published distributions

Install exactly **one** — the Linear package is a strict superset of the base.

| Package | What you get | README |
|---------|--------------|--------|
| [`@skitterbyte/skitterspec`](packages/skitterspec/README.md) | The base, tracker-free filesystem workflow. | [readme](packages/skitterspec/README.md) |
| [`@skitterbyte/skitterspec-linear`](packages/skitterspec-linear/README.md) | Everything in the base **plus** Linear hybrid-sync. | [readme](packages/skitterspec-linear/README.md) |

`packages/common` is private shared source, vendored into each distribution at
build time — not published on its own.

## Develop

This repo uses **pnpm** (`pnpm-workspace.yaml`; `packageManager` is pinned).

```sh
pnpm install      # sets up workspace symlinks
pnpm build        # compose both distributions (scripts/build-dist.js)
pnpm test         # node --test across the workspaces
```

### Using a change in another project, without publishing

Link a distribution into a consuming project and iterate against it:

```sh
npm run dev:link ../my-project              # build, then link (defaults to skitterspec-linear)
npm run dev:link ../my-project skitterspec  # the base distribution instead

# first time only, in that project — dev:sync refuses until it has been set up:
cd ../my-project && npx skitterspec init

# then, after every change here:
npm run dev:sync ../my-project              # rebuild, then run its skitterspec update

npm run dev:unlink ../my-project            # put it back on the published package
```

> **Never commit the linked `package.json`.** `pnpm add …@link:` writes an
> **absolute path** for this machine — `"link:/Users/you/code/skitterspec/…"` —
> which resolves nowhere else and breaks the project for everyone and for CI.
> `npm run dev:unlink` restores the published dependency.
>
> `dev:link` **refuses to run from a spec worktree** — `/spec-complete` removes
> the worktree when the spec lands, so the link would dangle at exactly the
> moment the work became available. Run it from the primary checkout; the
> refusal prints the path.

Two more things make this less obvious than it looks, and both produce a change
that appears to do nothing:

- **A distribution must be built before it is linked.** `bin/`, `src/` and
  `assets/` are composed by `build-dist.js` and gitignored, and pnpm does **not**
  run `prepare` for a `link:` dependency. Link an unbuilt package and there is no
  bin shim at all — the consumer just gets `command not found`. `dev:link` builds
  first, which is the entire reason it exists over a bare `pnpm add`.
- **Only the CLI is live; skills are copies.** The link makes the consumer run
  this working tree's `src/` directly, but `init` *copies* skills into its
  `.claude/skills/`, so an edited `SKILL.md` reaches it only when `update`
  re-copies. `dev:sync` does both halves.

`update` is a resync, not an overwrite: it refreshes managed files the consumer
has not touched and **reports** ones it has, listing the upstream change it
declined rather than applying it. So it needs no `--force` — and passing `--force`
would clobber that project's customisations, which is rarely what you want while
testing.

## Releasing

Releases go through `scripts/release.js`, one package at a time — **never
version the root package directly** (a `preversion` guard blocks it). See
**[RELEASING.md](RELEASING.md)** for the full flow: the `name@version` tag
scheme, plan-by-default → `--publish`, prerequisites, and the first-release
handoff.

```sh
node scripts/release.js <package> <patch|minor|major|x.y.z> [--publish]
```
