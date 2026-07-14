# @skitterbyte/skitterspec

Spec-driven development for [Claude Code](https://claude.com/claude-code) — a
**tracker-free** filesystem workflow. Ships the spec-lifecycle skills (`/spec`,
`/spec-ready`, `/spec-go`, `/spec-complete`, `/spec-cancel`, `/spec-bug`,
`/spec-init`) and per-spec **isolation** (a git worktree per in-progress spec,
Docker on demand).

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
