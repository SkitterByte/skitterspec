# @skitterbyte/skitterspec

Spec-driven-development (SDD) workflow for [Claude Code](https://claude.com/claude-code),
packaged so you can drop the same spec lifecycle into any project.

It installs the **eight spec-lifecycle skills** plus a general **`/commit`**
skill, two governing rules, and the `specs/` folder structure. The lifecycle is
`backlog → in-progress → complete / cancelled`, with `.core` holding always-apply
project rules.

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
| `/commit` | Stage the task's files, run typecheck + tests, write a conventional commit (+ release-note footer) | — | (unchanged) |

## Install into a project

From the root of the target project:

```bash
npx @skitterbyte/skitterspec init
```

This is idempotent — it creates only what's missing and never clobbers
customised files. It writes:

```
.claude/skills/spec*/SKILL.md   # the 8 spec-lifecycle skills
.claude/skills/commit/SKILL.md  # the /commit skill
.claude/rules/spec-planning.md  # governing rule (the single source of truth)
.claude/rules/commit-messages.md # commit message + release-note grammar
specs/{.core,backlog,in-progress,complete,cancelled}/
specs/backlog/00-index.md            # live backlog view (skill-maintained)
specs/complete/00-index.md           # append-only completion log
CLAUDE.md                       # adds a "## Spec workflow" section (created if absent)
```

### Options

```bash
npx @skitterbyte/skitterspec init ./path/to/project   # target a dir (default: cwd)
npx @skitterbyte/skitterspec init --force             # overwrite existing skill/rule files
npx @skitterbyte/skitterspec init --no-claude-md      # don't touch CLAUDE.md
npx @skitterbyte/skitterspec update                   # re-copy skills + rule (overwrite), leave specs/ alone
```

`update` pulls newer skill/rule versions after upgrading the package, without
disturbing your specs. The CLAUDE.md section is wrapped in
`<!-- skitterspec:start -->`…`<!-- skitterspec:end -->` markers so `update` can refresh
it in place.

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

## After install — tailor it

The shipped skills are **stack-agnostic**. They say things like "run the
project's typecheck and test commands" and "honour the project's conventions".
Make those concrete once, in **`.claude/rules/spec-planning.md`** (the
*Project conventions* section): set your real typecheck/test/lint commands and
link your other `.claude/rules/*.md`. The skills point at that file, so you don't
edit seven files per project.

## How it's distributed

The skills and rule are plain Markdown assets under [`assets/`](./assets). The
CLI ([`bin/skitterspec.js`](./bin/skitterspec.js) → [`src/`](./src)) just copies them
into place and patches `CLAUDE.md` — no runtime dependencies, Node 18+.

Because the files are copied into the consumer repo (not symlinked), each project
pins its own version and can diverge. Re-run `update` to re-sync from a newer
package release.

## License

MIT
