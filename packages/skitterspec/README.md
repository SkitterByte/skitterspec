# @skitterbyte/skitterspec

Spec-driven development for [Claude Code](https://claude.com/claude-code) — a
**tracker-free** filesystem workflow. The everyday loop is five verbs:

```
/spec  →  /spec-start  →  /spec-next  →  /commit  →  /spec-complete
 plan      build it     test it live      save it     finish + land
                          ↳ /spec-diff — read what the phase changed
```

Ships per-spec **isolation** — a git worktree per in-progress spec, Docker on
demand, host dev servers on reserved ports — and everything below.

<!-- commands:start -->
| | |
|---|---|
| `/spec` | Grill to a shared understanding, then write a groomed spec |
| `/spec-bug` | Reproduce with a failing test, then drive it red→green |
| `/spec-hotfix` | Fix the released version: fork from a tag, land by tag + cherry-pick |
| `/spec-review` | Re-validate a spec against the code; refresh what drifted |
| `/spec-start` | Put a spec in flight — provision its branch, then build phase 1 |
| `/spec-next` | Build the next phase of the spec in flight |
| `/spec-diff` | Read what a phase changed, on a page you can mark up |
| `/spec-reviewed` | Pick up a verdict pressed when nothing was waiting for it |
| `/spec-to-main` | Land the branch mid-spec, without finishing it |
| `/spec-complete` | Verify, land, tear down |
| `/spec-cancel` | Record why, stamp the header, tear down |
| `/spec-init` | Bootstrap or repair the workflow in a project |
| `/spec-connect` | Point your canonical `localhost` ports at one spec's stack |
| `/spec-live` | Check one spec out in the primary checkout, so your running server reloads it |
| `/spec-remote-review` | Permit (or forbid) reviewing from off your network |
<!-- commands:end -->

The last three are **slash commands** rather than skills: each pre-executes one
`skitterspec spec-env` verb and relays it, so only you can run them.

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

### The page takes a verdict back, and the phase waits for it

Reading is half of it. The page also takes marks — tick `✓ accept` per file as
you read, write a note against a line or a whole file, answer the questions a
written review asked — and then **ends in a decision**:

| Button | Does |
|--------|------|
| `✓ Commit` | commits the phase, and stops |
| `✓ Commit & Continue` | commits, then builds the next phase — and stops there |
| `✓ Commit & Start` | on a freshly written spec: commits it and puts it in flight. The `commit && /spec-start` you would otherwise type |
| `↺ Request changes` | sends your notes straight back to be worked |
| `… Discuss first` | reports what you wrote and asks what's up |

The last one appears only on a spec's own page — a spec with no phase in flight
has nothing to continue — and `▶ Put it live` sits above them all, which is not
a verdict: it commits the phase, checks the branch out where your dev server can
see it, and hands you back the same page. It clears no gate.

**`/spec-next` ends a phase by rendering the page and then watching for that press**,
so the button is what carries the work on — there is no command to
remember. A press on a page the engine served reaches it directly; a `file://`
page has no server to talk to, so it copies the pass and you paste it.

**A verdict sent when nothing was watching is not lost.** Type
**`/spec-reviewed`** to pick it up — bare when one is waiting, or
`/spec-reviewed 324199` to name one exactly, which matters only when two are.
It is the only path the harness itself enforces: the model cannot run it, so a
pass picked up that way is only ever picked up because a person asked.

Fixes come back as **resolutions**, so the next render shows each note struck
through with a one-line account of what changed — you verify the fix rather than
trusting it. An accept remembers the file's content, so it lapses by itself when
that file changes again, announced rather than silent.
**The marks are information, never a gate**:
nothing counts them, and the verdict is the one thing you choose, once.

### A phase that ended owes an answer

The **gate** is armed when a phase ends and its page is rendered, and exactly two
things clear it: a committing verdict, or
`skitterspec spec-env review skip "<reason>"`. While it is armed `/spec-next`
refuses to build the next phase, and — where the hook is installed —
`git commit` refuses in that worktree. Mid-phase renders arm nothing, every
cannot-tell exits 0 and says nothing, and `review.required: false` turns it off
for a project. The exit is always one command, and one of them is *"I am moving
on"* with the reason on the record.

### Where the page can be read

Every render prints one line per surface, labelled, so you pick the one that
reaches you rather than the engine guessing:

```
local:   http://127.0.0.1:7760/7e9e123e7540/feat-orders
network: http://192.168.0.136:7760/7e9e123e7540/feat-orders
remote:  off — turn on with: /spec-remote-review
live:    off — /spec-live to put it live
```

`local` and `network` are two doors into one room — the same server, the same
waiting verdict — so the wait covers both. `remote` is a published page, which
is a separate store: a verdict there needs `/spec-reviewed`, and it is off until
you type `/spec-remote-review`. The `live:` line is the other way to judge a
change: whether it is also **running**, and the page has a button to put it
there.

The random-looking segment in the URL is a **serve token** — 48 bits minted per
server, and the only thing deciding who can POST a verdict at all. That, and why
`/spec-reviewed` is user-only, are written up in
`.claude/rules/spec-reports.md` and `.claude/rules/spec-planning.md`, which
`init` installs into your project.

### The `review.*` config keys

All optional, in `specs/.core/env.config.json`:

| Key | Default | Does |
|-----|---------|------|
| `review.serve` | `"always"` | whether a render stands the local server up. `"never"` gives you a `file://` page, whose buttons copy a command instead of sending |
| `review.allowNetwork` | `true` | whether that server binds every interface, so the page opens on your phone |
| `review.allowRemote` | `false` | whether publishing is permitted at all. `/spec-remote-review` toggles it; it permits publishing, it does not publish |
| `review.required` | `true` | whether a finished phase owes a verdict |
| `review.commitWith` | `"/commit"` | the skill a committing verdict hands off to |
| `review.reader` | `"detect"` | where you are reading — `local`, `remote`, or detect it |
| `review.servePort` | derived | the port, normally derived from the repo's path |

`/spec-next` writes the page at the end of every phase. Nothing about it depends
on where your shell is.

## One ending, every skill — `.claude/rules/spec-reports.md`

Every skill finishes with the same block, and says nothing while it runs beyond
a question it cannot answer itself or a failure at the moment it happens:

✅ **Phase 2 built** — `feat-orders`, 2 of 4

| | |
|---|---|
| **Branch** | `spec/feat-orders` · 3 commits, clean |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 128 passed · npm test |
| **Review** | 7 files, +212 −18 · **local** [http://127.0.0.1:7760/…](http://127.0.0.1:7760/…) · **network** [http://192.168.0.136:7760/…](http://192.168.0.136:7760/…) · **remote** off |
| **Follow-ups** | none |
| **Next** | `/spec-next` → phase 3 (Auth) |

Four verdicts, and the last two are different facts about your repo: `✅` done ·
`⚠️` done with caveats · `❌` failed part-way, so there is a mess to clear ·
`⏸` refused before acting, so nothing changed.
**A refusal emits the block too**, so "nothing happened" is a reported outcome
rather than an absent one.

Fields come from a fixed vocabulary in a fixed order, and a skill emits only the
ones it declares — `Next` is last because it is the only row you act on. (A `Tracker` row leads the
table once a ticketing provider is installed; the base has none, so it never
appears.)
`Follow-ups` is always there: a recorded `none` is a decision where a missing
line is an oversight. The block covers **that run only** — what else is in
flight is a different question, and answering it here leaves you unable to tell
what followed from the run you just watched.

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
