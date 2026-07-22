# @skitterbyte/skitterspec

Spec-driven development for [Claude Code](https://claude.com/claude-code) — a
**tracker-free** filesystem workflow. The everyday loop is five verbs:

```
/spec  →  /spec-go  →  /spec-connect  →  /commit  →  /spec-complete
 plan      build it     test it live      save it     finish + land
```

Ships the spec-lifecycle skills (`/spec`, `/spec-go`, `/spec-complete`,
`/spec-cancel`, `/spec-bug`, `/spec-review`, `/spec-init`) plus per-spec
**isolation** — a git worktree per in-progress spec, Docker on demand, host dev
servers on reserved ports, and `/spec-connect` to test a worktree at your normal
`localhost` URL.

```sh
npx @skitterbyte/skitterspec init
```

This installs the skills + rules into `.claude/`, scaffolds `specs/`, and patches
`CLAUDE.md`. See `.claude/rules/spec-planning.md` after install to set your
project's typecheck/test/lint commands.

## Pick one distribution

Ticketing sync is a **separate superset you install instead of this one**:

| Install | You get |
|---------|---------|
| `@skitterbyte/skitterspec` | The base filesystem workflow. No tracker. |
| `@skitterbyte/skitterspec-linear` | Everything here **plus** Linear hybrid-sync (`/spec-status` · `/spec-pull` · `/spec-push`, the `spec-sync` CLI). |

Install exactly one — the superset is a strict superset of this package.

## Testing UI/API worktrees — `/spec-connect`

When your app runs from `main` on `localhost`, a worktree's changes are
unreachable. Add a `dev` block to `specs/.core/env.config.json` listing your host
dev servers (each `{ name, command, portVar, health?, frontPort? }`); `/spec-go`
starts them on the spec's reserved ports, and **`/spec-connect <name>`** points
your canonical `localhost` ports at that spec (via a small bundled reverse proxy —
no external install), so you test at the exact URL you always use.
`/spec-connect main` hands the ports back. Exclusive: one spec at a time. See
`specs/.core/env.config.md` for the `dev`/`proxy` config.

## v3 — slimmer surface + `/spec-connect`

**3.0** folds provisioning into `/spec-go`, teardown into
`/spec-complete`·`/spec-cancel`, and grooming into `/spec` — removing the
`/spec-env`, `/spec-env-down`, and `/spec-ready` skills (the `skitterspec
spec-env` CLI engine stays). It adds `/spec-connect` and the `dev`/`proxy` config
blocks. See [MIGRATION.md](../../MIGRATION.md).

## v2 — Linear removed from the base

`@skitterbyte/skitterspec` **2.0** is tracker-free: the Linear sync skills, the
`spec-sync` CLI, and the `linear.config.*` templates moved to
`@skitterbyte/skitterspec-linear`. If you used Linear sync on v1, see
[MIGRATION.md](../../MIGRATION.md) — switching is one install + re-`init`.

## How it's built

This distribution is composed from the private workspace packages by
`scripts/build-dist.js`: the base fills the shared skills' provider seams with
nothing, so it's self-contained and depends only on
[`prompts`](https://www.npmjs.com/package/prompts) (for interactive `init`).

MIT © Reuben Greaves
