# @skitterbyte/skitterspec

Spec-driven development for [Claude Code](https://claude.com/claude-code) — a
**tracker-free** filesystem workflow. The everyday loop is five verbs:

```
/spec  →  /spec-start  →  /spec-next  →  /commit  →  /spec-complete
 plan      build it     test it live      save it     finish + land
                          ↳ /spec-diff — read what the phase changed
```

Ships the spec-lifecycle skills (`/spec`, `/spec-start`, `/spec-next`, `/spec-complete`,
`/spec-cancel`, `/spec-bug`, `/spec-hotfix`, `/spec-review`, `/spec-diff`,
`/spec-init`) plus per-spec **isolation** — a git worktree per in-progress spec,
Docker on demand, host dev servers on reserved ports, and `/spec-connect` to test
a worktree at your normal `localhost` URL.

```sh
npx @skitterbyte/skitterspec init
```

This installs the skills + rules into `.claude/`, scaffolds `specs/`, and patches
`CLAUDE.md`. See `.claude/rules/spec-planning.md` after install to set your
project's typecheck/test/lint commands.

## Upgrading

```sh
npx @skitterbyte/skitterspec update
```

`update` refreshes the files it manages (skills, rules, `specs/.core` docs) and
**keeps anything you edited**. A file it kept is listed under
`customized (kept)` with the change it declined summarised as `+added −removed`:

```
customized (kept):
  .claude/rules/spec-planning.md  +34 −13
```

Add `--diff` to see those changes as a unified diff before deciding whether to
re-apply your edits on top, or `--force` to take the package version and lose
them. Your `specs/` content and live `.core` config are never touched.

## Pick one distribution

Ticketing sync is a **separate superset you install instead of this one**:

| Install | You get |
|---------|---------|
| `@skitterbyte/skitterspec` | The base filesystem workflow. No tracker. |
| `@skitterbyte/skitterspec-linear` | Everything here **plus** one-way Linear sync (`/spec-status` · `/spec-push`, the `spec-sync` CLI) — repo canonical, Linear a generated mirror. |

Install exactly one — the superset is a strict superset of this package.

## Testing UI/API worktrees — `/spec-connect`

When your app runs from `main` on `localhost`, a worktree's changes are
unreachable. Add a `dev` block to `specs/.core/env.config.json` listing your host
dev servers (each `{ name, command, portVar, health?, frontPort? }`); `/spec-start`
starts them on the spec's reserved ports, and **`/spec-connect <name>`** points
your canonical `localhost` ports at that spec (via a small bundled reverse proxy —
no external install), so you test at the exact URL you always use.
`/spec-connect main` hands the ports back. Exclusive: one spec at a time. See
`specs/.core/env.config.md` for the `dev`/`proxy` config.

## Reading the diff — `/spec-diff`

A phase is built in its own worktree, so `git diff` in your terminal answers
about the base branch — and a 350-line diff read as terminal text is scrolling,
not review. **`/spec-diff`** collects the worktree's changes with `git -C` and
writes a self-contained HTML page: whole-file context that folds away, a file
tree, new files included. Open it locally, or publish it and read it on a phone.

The page lands in `.spec-env/reviews/<spec>.html`, which is gitignored — so
reviewing a branch leaves no change in the branch you are reviewing. **The diff never passes through the model**, so it costs no context tokens however large it
is; the optional *written* review (a short read plus `flag`/`confirm`/`good`
notes) is the part that costs, and it is offered rather than assumed. Publishing
is always opt-in, and one page per spec — later phases update the same link.

`/spec-next` writes the page at the end of every phase. Nothing about it depends
on where your shell is.

## Production hotfixes — `/spec-hotfix`

When prod is on a tagged release, a fix must be built on **that** version, not
`main`. `/spec-hotfix <tag> <name>` forks a worktree from the tag, then works
test-first like `/spec-bug`. `/spec-complete` lands it by patch-bumping the tag
and tagging the branch (your CI/CD deploys the tag — you push it) and
cherry-picking the fix onto `main`; `--also <tag>` patches extra release lines
(test/demo). Hotfixes refuse `/spec-live` (their old-tag branch could break the
running instance) — test them with `/spec-connect`. Tune the `hotfix` block in
`specs/.core/env.config.md`.

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
