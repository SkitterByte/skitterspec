# @skitterbyte/skitterspec

Spec-driven-development (SDD) workflow for [Claude Code](https://claude.com/claude-code),
packaged so you can drop the same spec lifecycle into any project.

It installs the **eight spec-lifecycle skills**, the governing
`spec-planning.md` rule, and the `specs/` folder structure. The lifecycle is
`backlog → in-progress → complete / cancelled`, with `.core` holding always-apply
project rules.

> **Commits, changelog & release notes** live in a separate package,
> [`@skitterbyte/skittership`](https://github.com/SkitterByte/skittership) — the
> `/commit` skill and the `CHANGELOG.md`/`RELEASES.md` generators. Adopt it
> alongside skitterspec (or on its own) with `npx @skitterbyte/skittership init`.

| Skill | Action | Status | Folder |
|-------|--------|--------|--------|
| `/spec` | (Feature) Grill to a shared understanding, then write a concise spec | `Draft` | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-ready` | Confirm the spec is groomed | `Ready` | `specs/backlog/` |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-go` | Implement the next phase (with tests) | `In Progress` | `specs/in-progress/` |
| `/spec-complete` | Verify all phases done + tests green | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason | `Cancelled` | `specs/cancelled/` |
| `/spec-init` | Bootstrap/repair the workflow (manual path) | — | — |

## Install into a project

From the root of the target project:

```bash
npx @skitterbyte/skitterspec init
```

On a terminal it runs an **interactive setup** (skip it with `--yes` or drive it
with the flags below). It's idempotent — it creates only what's missing and
never clobbers customised files. It writes:

```
.claude/skills/spec*/SKILL.md   # the 8 spec-lifecycle skills
.claude/rules/spec-planning.md  # governing rule (the single source of truth)
specs/{.core,backlog,in-progress,complete,cancelled}/
CLAUDE.md                       # adds a "## Spec workflow" section (created if absent)
```

### Options

```bash
npx @skitterbyte/skitterspec init ./path/to/project   # target a dir (default: cwd)
npx @skitterbyte/skitterspec init --yes               # accept defaults, skip the prompts
npx @skitterbyte/skitterspec init --force             # overwrite existing skill/rule files
npx @skitterbyte/skitterspec init --no-claude-md      # don't touch CLAUDE.md
npx @skitterbyte/skitterspec init --isolation         # adopt per-spec isolation (worktree per spec)
npx @skitterbyte/skitterspec update                   # re-copy skills + rule, leave specs/ alone
```

`update` pulls newer skill/rule versions after upgrading the package, without
disturbing your specs. The CLAUDE.md section is wrapped in
`<!-- skitterspec:start -->`…`<!-- skitterspec:end -->` markers so `update` can
refresh it in place. (If you upgrade from an older skitterspec that bundled the
commit/release tooling, `update` detects the leftovers and offers to remove them —
that tooling now lives in [`@skitterbyte/skittership`](https://github.com/SkitterByte/skittership).)

## Commits, changelog & release notes → skittership

The `/commit` skill and the `CHANGELOG.md`/`RELEASES.md` generators are a separate,
independently-adoptable package: **[`@skitterbyte/skittership`](https://github.com/SkitterByte/skittership)**.

```bash
npx @skitterbyte/skittership init   # installs /commit, the commit-message rule,
                                    # the generators, and skittership.config.json
```

It reads `Release-Note:` commit footers into user-facing release notes and commit
subjects into a dev-facing changelog, regenerated at `npm version`. See the
skittership README for the config, flags, and the automatic
`skitterspec.config.json → skittership.config.json` migration.

## Spec structure

Every spec is a **folder**, never a bare file:

```
specs/backlog/feat-<name>/
  00-overview.md     # dashboard: problem, decisions, solution, phase index, logs
  01-<phase-slug>.md # phase 1 — goal + task checkboxes (tests included)
  02-<phase-slug>.md # phase 2 …
```

`00-overview.md` is the index — it carries a **phase table** linking to each
phase file with its status (`⬜`/`🔄`/`✅`). **Each phase is its own file** so it's
easy to dive into one phase without wading through the whole spec. The lifecycle
skills keep the index and phase files in sync.

## Per-spec isolation — worktree by default, Docker on demand

Work several specs in parallel without them stepping on each other. **Adopt it
once** with `npx @skitterbyte/skitterspec init --isolation` (or copy
`specs/.core/env.config.json.example` → `specs/.core/env.config.json`; every field
is documented in `specs/.core/env.config.md`). While the config is absent the
feature is simply unused.

Once adopted it's the **default policy**, not a per-spec chore:

- **Worktree — automatic for every in-progress spec.** `/spec-go` gives each spec
  its own sibling git worktree on its own branch, so you never stash or rebuild to
  switch specs and `main` stays free for hotfixes. All housekeeping (the
  backlog→in-progress move, header edits, the code) happens on that branch and
  lands in one PR; `main` changes only when it merges.
- **Docker — a per-spec escalation.** `/spec` records `> **Stack:** worktree`
  (default) or `worktree + docker` when the spec touches the DB / stateful
  services. Only an escalated spec gets a **namespaced stack** — a per-spec
  `COMPOSE_PROJECT_NAME` isolates containers, networks, and **named volumes**, and
  a `PORT_OFFSET` reserves a distinct port block, so N stacks run at once with no
  clashes. A worktree-only spec takes **no** slot, port block, or `.env`.
- an optional **opener** — a single, editor/terminal-agnostic `open.command`
  (e.g. `code {worktreePath}`, a `tmux` command, or a `warp://` deeplink).

The machine-local slot registry and volume backups live under `/.spec-env/`
(gitignored). `docker.enabled` in the config is the project **master switch**
("is Docker escalation available?"), not "always run Docker".

`/spec-env` · `/spec-env-down` remain the **manual engine** behind the automation
— use them to escalate Docker onto an existing worktree, re-attach, or tear down:

```
/spec-env <spec>        # worktree (+ stack iff Stack: worktree + docker) + opener
                        #   (idempotent; re-run attaches)
/spec-env-down <spec>   # stop stack, drop volumes (backed up first), remove worktree,
                        #   free the slot. Guards refuse a dirty/unpushed worktree
                        #   unless --force; --keep-volumes preserves data.
```

Your `docker-compose.yml` must reference `${PORT_OFFSET}` on each published port
so services land in the spec's reserved block. Two adoption modes:

- **Standalone** (`linkLinear: false`) — plain `{type}/{slug}` branch names; pure
  worktree + Docker + opener. No Linear needed.
- **Linear-linked** (`linkLinear: true` + `specs/.core/linear.config.json`) —
  branch names follow Linear's pattern so pushing fires Linear's GitHub
  automation.

When a spec finishes, `/spec-complete` can **land the branch on your base branch**
in one flow — it rebases the spec's worktree branch onto `main` (or the configured
`baseBranch`; auto-detected from `origin/HEAD` otherwise), fast-forwards, and
re-runs the tests. A rebase conflict aborts and hands back; it never pushes. Once
landed, teardown reclaims the worktree **and deletes the branch** without needing
`--force` (a merged branch has nothing to lose, even with no remote).

`/spec-complete` and `/spec-cancel` will *offer* to integrate/tear down when the
config is present — never forced.

## Linear hybrid sync — git-like `/spec-status` · `/spec-pull` · `/spec-push`

Let **Linear own status and discussion** while the repo stays the **co-authoring
surface for spec content**. The sync is bidirectional but git-like: explicit
commands, a committed **base sidecar** for three-way merge, and no blind
overwrites. It's **opt-in** — everything below is inert until
`specs/.core/linear.config.json` exists (copy `linear.config.json.example` and
fill in your team / initiative IDs; every field is documented in
`specs/.core/linear.config.md`). Without it, `/spec`, `/spec-go`, and the CLI
behave exactly as before.

**Mapping** (config-driven): a spec folder → Linear **Project**; each phase
(`01-…`, `02-…`) → a **Milestone**; tasks → **Issues**; an optional **Initiative**
groups specs. When linked, `/spec` creates the project + a milestone per phase and
writes the linking frontmatter into `00-overview.md`.

**The git-like lifecycle:**

```
/spec-status          # read-only — per-field divergence (local-only / remote-only
                      #   / conflict / in-sync). Changes nothing.
/spec-pull [--force]  # Linear → repo. Applies remote-only fields; refuses to
                      #   clobber a conflicting local edit unless --force.
   …refine the spec locally (the repo is the co-authoring surface)…
/spec-push [--force]  # repo → Linear. Ownership-respecting, concurrency-checked;
                      #   refuses if Linear moved since base unless --force.
```

**Field ownership** collapses conflicts: each field is `both` (co-authored,
can conflict), `pull` (Linear owns it — e.g. status/priority/labels), or `push`
(the repo owns it). Only a `both` field that moved on **both** sides is a real
conflict. `--force` never destroys blindly — it backs up the losing side into
`sync.backupDir` (a local reflog) first, then wins. After any successful
pull/push the engine **rewrites the base** so the next compare starts clean.

`/spec-go` on a linked spec runs `/spec-pull` first, so you always build against
the current shared state. **Base sidecars** (`sync.baseDir`, default
`specs/.core/linear-base/`) are **committed** — each worktree carries its own
base. **Backups** (`sync.backupDir`, default `specs/.core/linear-backups/`) are
local recovery and **gitignored**.

This supersedes the earlier one-way `/spec-from-issue` intake design (cancelled):
because both sides author, the sync had to be bidirectional and three-way, not a
blind import.

## After install — tailor it

The shipped skills are **stack-agnostic**. They say things like "run the
project's typecheck and test commands" and "honour the project's conventions".
Make those concrete once, in **`.claude/rules/spec-planning.md`** (the
*Project conventions* section): set your real typecheck/test/lint commands and
link your other `.claude/rules/*.md`. The skills point at that file, so you don't
edit seven files per project.

## How it's distributed

The skills and rule are plain assets under [`assets/`](./assets). The CLI
([`bin/skitterspec.js`](./bin/skitterspec.js) → [`src/`](./src)) copies them into
place and patches `CLAUDE.md`. It needs Node 18+ and one runtime dependency,
[`prompts`](https://www.npmjs.com/package/prompts), used only for the interactive
`init`.

Because the files are copied into the consumer repo (not symlinked), each project
pins its own version and can diverge. Re-run `update` to re-sync from a newer
package release.

## License

MIT
