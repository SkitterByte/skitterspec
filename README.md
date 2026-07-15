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

## Releasing

Releases go through `scripts/release.js`, one package at a time — **never
version the root package directly** (a `preversion` guard blocks it). See
**[RELEASING.md](RELEASING.md)** for the full flow: the `name@version` tag
scheme, plan-by-default → `--publish`, prerequisites, and the first-release
handoff.

```sh
node scripts/release.js <package> <patch|minor|major|x.y.z> [--publish]
```
