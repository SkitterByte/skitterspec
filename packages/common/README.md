# @skitterbyte/skitterspec

Spec-driven-development (SDD) workflow for [Claude Code](https://claude.com/claude-code),
packaged so you can drop the same spec lifecycle into any project.

It installs the spec-lifecycle **skills**,
the three `/spec-*` **slash commands**,
the governing `spec-planning.md` rule, and the `specs/` folder structure. The lifecycle is `backlog → in-progress → complete / cancelled`, with
`.core` holding always-apply project rules.

> **Commits, changelog & release notes** live in a separate package,
> [`@skitterbyte/skittership`](https://github.com/SkitterByte/skittership) — the
> `/commit` skill and the `CHANGELOG.md`/`RELEASES.md` generators. Adopt it
> alongside skitterspec (or on its own) with `npx @skitterbyte/skittership init`.

<!-- commands:start -->

| Skill | Action | Status | Folder |
|-------|--------|--------|--------|
| `/spec` | (Feature) Grill to a shared understanding, then write a groomed spec | `Ready` (or `Draft`) | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-start` | Put a spec in flight — provision its branch, then build phase 1 | `In Progress` | `specs/in-progress/` |
| `/spec-next` | Build the next phase of the spec in flight (re-run per phase) | `In Progress` (unchanged) | (unchanged) |
| `/spec-complete` | Verify all phases done + tests green; land + tear down | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason; tear down | `Cancelled` | `specs/cancelled/` |
| `/spec-hotfix` | (Hotfix) Fork a worktree from a release tag, red→green, land by tag | `In Progress` | `specs/in-progress/` |
| `/no-spec` | Work with no spec — a bump, a rename — on its own branch and page | `—` | (none) |
| `/spec-to-main` | Land the branch on the base mid-spec, without finishing | (unchanged) | (unchanged) |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |
| `/spec-diff` | Read what changed, on a page you can mark up and hand back | `—` | (unchanged) |
| `/spec-reviewed` | Pick up a verdict pressed when nothing was waiting for it | (unchanged) | (unchanged) |

Three of them are **slash commands** (`.claude/commands/`) rather than skills:
each pre-executes one `skitterspec spec-env` verb and relays it, so there is no
judgment to apply — and they are marked `disable-model-invocation`, meaning only
the operator can run them.

| Command | Action |
|---------|--------|
| `/spec-connect` | Point the canonical `localhost` ports at one spec's stack |
| `/spec-live` | Check one spec out in the primary checkout, so a running dev server reloads it |
| `/spec-remote-review` | Permit (or forbid) publishing a review for a reader off the network |

<!-- commands:end -->

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
.claude/rules/negative-checks.md # writing checks that accuse safely
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
npx @skitterbyte/skitterspec init --gating            # adopt release gating (flag decision per spec)
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

## One ending, every skill — `.claude/rules/spec-reports.md`

Every skill finishes with the same block, and says nothing while it runs beyond
a question it cannot answer itself or a failure at the moment it happens:

✅ **Phase 2 built** — `feat-orders`, 2 of 4

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-orders` · phase 2 moved |
| **Branch** | `spec/feat-orders` · 3 commits, clean |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 128 passed · npm test |
| **Review** | 7 files, +212 −18 · **local** `http://127.0.0.1:7760/…` · **network** `http://192.168.0.136:7760/…` · **remote** off |
| **Follow-ups** | none |
| **Next** | `/spec-next` → phase 3 (Auth) |

Four verdicts, and the last two are different facts about your repo: `✅` done ·
`⚠️` done with caveats · `❌` failed part-way, so there is a mess to clear ·
`⏸` refused before acting, so nothing changed.
**A refusal emits the block too**, so "nothing happened" is a reported outcome
rather than an absent one.

Fields come from a fixed vocabulary in a fixed order, and a skill emits only the
ones it declares — `Tracker` first because the id is how you address the work
outside the repo, `Next` last because it is the only row you act on.
`Follow-ups` is always there: a recorded `none` is a decision where a missing
line is an oversight. The block covers **that run only** — what else is in
flight is a different question, and answering it here leaves you unable to tell
what followed from the run you just watched.

## The review engine — what owns what

A contributor changing any of this meets four surfaces, and the split is worth
knowing before touching one:

| Surface | Owns |
|---------|------|
| `.claude/rules/` | **the mechanism** — the report contract, the negative-check discipline, why `/spec-reviewed` is user-only. Installed into a project, not published as marketing |
| `assets/skills/` | **the judgment** — when to render, when to arm, how to route a verdict. `/spec-diff` §2 owns the routing and every other skill points at it |
| `src/env/review.js` | **the page and the pass** — the payload, the verdict and action vocabularies, the sidecars |
| `src/env/serve.js` | **the wait** — one server, one token, one write path |

`skitterspec spec-env review` is the whole surface:

```
review [spec]                 # render the page for the uncommitted work
review [spec] --branch        # …or everything since the base branch
review [spec] --docs          # …or the spec's own documents, for a spec with no worktree
review serve --host 0.0.0.0   # one daemon, every provisioned spec, token in the URL
review wait <spec> --since T  # block until a pass arrives inside that window
review <spec> --claim-since T # claim the one pass that did; refuse if two did
review arm <spec> --phase N   # a phase ended: it now owes a verdict
review gate [spec] --check    # is one owed? non-zero if so — what the commit hook asks
review skip "<reason>"        # move on without one, on the record
review waiting                # passes nobody claimed, across every spec
review allow <tier> --set     # permit a tier; empty toggles (this is /spec-remote-review)
```

Three files sit beside the page in `.spec-env/reviews/`, all gitignored:
`<spec>.html` is the render, `<spec>.notes.json` holds the accepts, comments,
resolutions and the outcome log, and `<spec>.pending.json` is the holding area a
POST writes into. **A POST can only reach the holding area**; the notes sidecar
is written by a *claim*, which is the containment that lets the endpoint be open
to the network at all.

**The wait is the engine's, never one composed per run.** `review wait` is
written once and tested against a store that gains a pass mid-flight. Three
hand-written watchers failed in two days — the worst was valid bash and a syntax
error in zsh, a predicate that could never be true, spinning for five minutes
under a report claiming the run was holding. A watcher that cannot fire and one
patiently working look identical from outside, which is what made it expensive.

## Release gating — record whether it ships behind a flag

A spec can go from `/spec` through implementation to `/spec-complete` with no
feature flag and no mention of one — and that is indistinguishable from "we
considered it and decided against". **Adopt it once** with
`npx @skitterbyte/skitterspec init --gating` (or copy
`specs/.core/gating.config.json.example` → `gating.config.json`; fields are
documented in `specs/.core/gating.config.md`). While the config is absent the
feature is entirely unused, which is read as "this project does not use flags".

Once adopted, `/spec`, `/spec-bug` and `/spec-hotfix` ask the question and record
the answer on the spec:

```
> **Gating:** search-ranking-v2
> **Gating:** none: additive, nothing to revert
```

A flag name, or `none: <reason>` — and the reason half is the point, because a
bare `none` is a shrug and a missing line is an oversight.
`skitterspec gating check` reports specs with no decision and **always exits 0**;
`/spec-review`, `/spec-start` and `/spec-complete` surface it and carry on. It
reads only `backlog/` and `in-progress/`, so specs finished before you adopted
gating are out of range by construction.

**It bakes in the offer, never the mechanism.** Skitterspec never reads your flag
code; it asks, cites the doc you point it at, and records what you say.

## Per-spec isolation — worktree by default, Docker on demand

Work several specs in parallel without them stepping on each other. **Adopt it once** with `npx @skitterbyte/skitterspec init --isolation` (or copy
`specs/.core/env.config.json.example` → `specs/.core/env.config.json`; every field
is documented in `specs/.core/env.config.md`). While the config is absent the
feature is simply unused.

Once adopted it's the **default policy**, not a per-spec chore:

- **Worktree — automatic for every in-progress spec.** `/spec-start` gives each spec
  its own sibling git worktree on its own branch, so you never stash or rebuild to
  switch specs and `main` stays free for hotfixes.
  **It builds the branch there and moves your session into it** — a plain `cd`, so
  nothing prompts and no window opens. It then offers phase 1: say yes and it
  carries on into a bare `/spec-next`; say no and you are already there, so
  `/spec-next` typed later does the same thing. Reading what a phase changed does
  not need a session there at all: `/spec-diff` renders the worktree's diff as a
  page from wherever you are. All housekeeping (the backlog→in-progress move,
  header edits, the code) happens on that branch and lands in one PR; `main`
  changes only when it merges.
- **Docker — a per-spec escalation.** `/spec` records `> **Stack:** worktree`
  (default) or `worktree + docker` when the spec touches the DB / stateful
  services. Only an escalated spec gets a **namespaced stack** — a per-spec
  `COMPOSE_PROJECT_NAME` isolates containers, networks, and **named volumes**, and
  a `PORT_OFFSET` reserves a distinct port block, so N stacks run at once with no
  clashes. A worktree-only spec takes **no** slot, port block, or `.env`.

The machine-local slot registry and volume backups live under `/.spec-env/`
(gitignored). `docker.enabled` in the config is the project **master switch**
("is Docker escalation available?"), not "always run Docker".

**`skitterspec spec-env <verb>` is the engine** underneath all of it — the
skills are what exercise judgment about when to run which verb. Use it directly
to escalate Docker onto an existing worktree, re-attach, or tear down:

```
skitterspec spec-env up <spec>     # worktree (+ stack iff Stack: worktree + docker)
                                   #   a PLANNER: it prints the commands, you run them
skitterspec spec-env down <spec>   # stop stack, drop volumes (backed up first), remove
                                   #   worktree, free the slot. Guards refuse a dirty or
                                   #   unpushed-and-unlanded worktree unless --force;
                                   #   --keep-volumes preserves data
skitterspec spec-env resolve       # which spec is this tree, and where is its worktree
skitterspec spec-env stage [spec]  # which uncommitted paths are this spec's, and which
                                   #   are not — so a commit never sweeps up a sibling
```

The `/spec-env` and `/spec-env-down` **skills** were removed in v3: provisioning
folded into `/spec-start` and teardown into `/spec-complete` · `/spec-cancel`.
The CLI engine above is what stayed. <!-- history -->

Your `docker-compose.yml` must reference `${PORT_OFFSET}` on each published port
so services land in the spec's reserved block. Two adoption modes:

- **Standalone** (`linkLinear: false`) — plain `{type}/{slug}` branch names; pure
  worktree + Docker. No Linear needed.
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

## One-way Linear sync — `/spec-status` · `/spec-push`

The **repo is the source of truth**; Linear is a **generated mirror**. Sync is
**one-way**: content is pushed up and never read back or merged. It's **opt-in** —
everything below is inert until `specs/.core/linear.config.json` exists (copy
`linear.config.json.example` and fill in your team id; every field is documented
in `specs/.core/linear.config.md`). Without it, `/spec`, `/spec-start`, and the CLI
behave exactly as before.

**Mapping** (config-driven): a spec → a Linear **issue** (the spec body as its
description); each phase (`01-…`, `02-…`) → a **sub-issue** (phase name, `Goal:`,
phase-emoji state, and the phase's tasks as a read-only checklist in its
description — no issue is created per task). When linked, `/spec` creates the
issue + a sub-issue per phase and writes the linking frontmatter into
`00-overview.md`.

**Which Project** the spec issue belongs to is asked once, when the issue is first
created: a filterable list of the team's projects, defaulting to
`linear.projectId`, always offering *None*. It's sent on the create call only and
never stored — so moving a spec issue between projects in Linear sticks, and never
reads as drift.

**Starting from an issue** (opt-in via `intake`): `/spec SKI-123` adopts an
existing Linear issue, and `/spec --from-issue [query]` browses the ones labelled
`intake.label` — what a web app or feedback form files. The issue *becomes* the
spec's issue, so the reporter's thread survives and nothing is duplicated;
`intake.bugLabels` route a report to `/spec-bug`, which adopts it the same way.

**The lifecycle:**

```
/spec-status          # read-only drift report — what the next push would create /
                      #   update, plus any workflow-state drift. Changes nothing.
   …author & refine the spec locally (the repo is the source of truth)…
/spec-push            # repo → Linear, one way. Diffs against a committed last-
                      #   pushed snapshot and applies only what changed; stamps ids.
```

**Who owns what:** the repo owns the spec — description, phases, tasks, completion
and the workflow state — and pushes it. Priority, labels, cycles and comments are
**Linear-native triage**, the PM's to set in Linear; one-way sync neither pushes
nor reads them, so a PM's triage is never clobbered. A workflow-state moved in
Linear is surfaced by `/spec-status` as drift and overwritten on the next push —
there's nothing to reconcile.

**Last-pushed snapshots** (`sync.baseDir`, default `specs/.core/linear-base/`) are
**committed** content hashes of the last push — each worktree carries its own, so
push knows what changed without reading Linear back. There is no pull: `/spec-next`
on a linked spec just builds (the repo is already canonical).

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
