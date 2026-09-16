# Migration guide

## `@skitterbyte/skitterspec` v20 → v21 (the gate installs, and asking implies waiting)

If you upgraded to v20 and the commit gate never once fired, this is why. Two
independent bugs, either of which alone made it a no-op.

### Breaking change

**The hook ships as `.claude/hooks/review-gate.cjs`**, renamed from
`review-gate.js`. The script is CommonJS and it is copied *into your* project,
where your `package.json` decides how node parses a `.js` — so in any
`"type": "module"` project it died on its own first `require`, printing a stack
trace on **every Bash tool call**. `.cjs` settles the parse mode at the file,
which is the only place independent of the one file skitterspec does not
control. An ESM rewrite would have inverted the same problem onto CommonJS
projects, which are still the default for anything with no `"type"` set.

The upgrade migrates you: your existing `PreToolUse` entry has its path
**rewritten in place** — so a wrapper, a flag or a different interpreter you
added all survive — and the retired `review-gate.js` is deleted. If you edited
that file yourself it is **kept**, with a warning, and left for you to remove.

**Check whether you already had a `review-gate.cjs` of your own.** `.cjs` is the
obvious way to work around the v20 crash, so anyone who fixed it by hand most
likely picked this exact filename — and this upgrade is the moment skitterspec
starts managing that path. A file already sitting there is **kept**, the real
hook is therefore never installed, and `review-gate.js` is pruned out from under
it. A hand-written shim that only `require`d the old script then fails open, so
the gate is silently absent under an update that reported success.

Two lines settle it:

```
head -3 .claude/hooks/review-gate.cjs        # ours opens with a 'use strict' + a doc comment
npx @skitterbyte/skitterspec update --check  # a line naming this path means yours was kept
```

If it is yours, take ours — `npx @skitterbyte/skitterspec update --force`, or
delete the file and re-run `update`. Later versions report this case in its own
words rather than as `your edit — kept`, but the manifest records the path after
the first upgrade, so that wording cannot reach anyone who has already run one.

### Bug fix

**`skitterspec update` now registers the hook.** v20's notes said `init` and
`update` both did; only `init` did. `update` copied the script, reported
`created: .claude/hooks/review-gate.js`, and wired nothing — so every project
that upgraded into v20 got a hook file and no hook, with nothing saying so.

### What to do

1. **Upgrade** — `npx @skitterbyte/skitterspec update`.
2. **Commit `.claude/settings.json` and `.claude/hooks/review-gate.cjs`**, and
   the deletion of `.claude/hooks/review-gate.js`. A hook only a fraction of the
   team has is a gate that holds for a fraction of the team.
3. **Check it is actually on** — the update reports
   `updated: .claude/settings.json (review-gate hook)` the first time, and
   `unchanged` afterwards. If it says neither, your settings file could not be
   parsed; it was left untouched and the hook is not registered.

### Behaviour change — a bug fix and a hotfix now owe a verdict

**`/spec-bug` and `/spec-hotfix` now arm the review gate**, as `/spec-next`
already did. Both render the page at the end of red→green work, and both now
wait for your verdict instead of finishing — so in that spec's worktree a
`git commit` is **refused** until one of two things happens:

- you send a verdict from the page (or `/spec-reviewed` picks up one already
  waiting), or
- you run `skitterspec spec-env review skip "<reason>"`, which records the
  decision to move on.

The gate is still only armed by work that **finished**, it still fails open on
every cannot-tell, and `review.required: false` in `specs/.core/env.config.json`
still turns it off for a project.

**Why.** Those two skills used to render the page, ask *"want a written review
before you commit?"* and finish with nothing watching. A verdict pressed on that
page sat in the holding area until someone typed `/spec-reviewed` — which they
had no reason to do, because the run had said the page was *ready* rather than
that it was *waiting*. Two verdicts were stranded that way on one spec, and the
second existed only because the first appeared to do nothing.

### New, and not breaking — the `Continue` verdict

**A page rendered part-way through a run offers `Continue`** — *I have read it,
carry on* — instead of the committing buttons, via
`spec-env review <spec> --buttons midrun`. The default is unchanged, so a caller
that passes nothing renders exactly the page it rendered before. `Continue` can
never clear an armed gate: that still takes a committing verdict or a recorded
skip.

Nothing else changes: `review.required` still defaults to `true`, and the engine
and `/spec-next` held the gate throughout regardless of the hook.

## `@skitterbyte/skitterspec-linear` v14 → v15 (the gate installs, and asking implies waiting)

The same change as `@skitterbyte/skitterspec` v20 → v21 above — this
distribution composes the same lifecycle skills. Read that entry; nothing here
is Linear-specific.

## `@skitterbyte/skitterspec` v19 → v20 (a phase owes a verdict)

### Breaking change

**A phase that has ended now refuses to go further until you send a verdict.**
`/spec-next` **arms** a gate when it finishes a phase and renders its review
page. While it is armed, two things refuse:

- `/spec-next` will not build the next phase.
- `git commit` inside **that spec's own worktree** is blocked by a harness hook
  — which is what covers a bare `git commit`, a chained command, and
  skittership's `/commit` without skitterspec editing any of them.

Exactly two things clear it, and both are one command:

```
# press Commit or Commit & Continue on the review page — or:
skitterspec spec-env review skip "none: additive, nothing to revert"
```

The skip is deliberately not silent: the reason goes into the review outcome
log, on the same reasoning as the `Gating:` header — a reason is a decision a
reviewer can argue with, where silence is an oversight.

**It is on by default** wherever isolation is configured (`env.config.json`
present). To turn it off for a project, add to `specs/.core/env.config.json`:

```json
{ "review": { "required": false } }
```

Three things keep it a push rather than a wall, and they are worth knowing
before you reach for that setting. It is armed **only by a phase ending**, so a
mid-phase `/spec-diff` owes nothing. The exit is always one command. And it
accuses only on a positive signal — no engine, an unreadable payload, a commit
on the base branch or in another spec's tree, a repo with no isolation: every
cannot-tell lets the commit through.

### Breaking change

**`.claude/settings.json` is now written by the installer.** `skitterspec init`
and `skitterspec update` copy the hook script and register it as a `PreToolUse`
hook in your project's **committed** settings file. (In v20 `update` copied
without registering, and the script was named `review-gate.js` — both fixed in
v21; read that entry above if you are landing on the current release.) That is a
tracked file in most repos, so expect it in `git status` after upgrading — and
commit it, because a hook only a fraction of the team has is a gate that holds
for a fraction of the team.

A settings file that cannot be parsed is **reported and left alone**, never
rewritten. The hook is an extra layer: the engine and `/spec-next` hold the gate
without it.

### The review page can now reach your session — deliberately

This inverts an invariant the docs used to state outright: *a device that
reaches your page cannot reach your conversation*. It no longer holds, and the
change is the point. `/spec-next` now ends a phase by rendering the page and
**waiting** on it, so the button you press is what carries the work on — there
is no command to remember.

What replaced the old guard is two mechanisms and one rule:

- **The serve token** — 48 random bits in the URL path, minted per server —
  decides who can POST at all.
- **The wait window** — only a pass that arrives *while the session is waiting*
  is claimed for you, and two arrivals refuse rather than pick one.
- Outside that window nothing is claimed unasked. `/spec-reviewed`, or
  `/spec-reviewed 324199` to name one exactly, is still how a pass sent when
  nobody was waiting gets picked up — and it is still user-only, so the model
  cannot claim a pass on its own.

A `file://` page has no server to talk to, so it copies and you paste, exactly
as before.

### What to do

1. **Upgrade** — `npx @skitterbyte/skitterspec update`.
2. **Commit `.claude/settings.json` and the hook script.** Both are new in your
   working tree after the update.
3. **Nothing else to configure.** `review.required` defaults to `true` and
   `review.commitWith` defaults to `/commit`; neither needs adding unless you
   are changing it.

## `@skitterbyte/skitterspec-linear` v13 → v14 (a phase owes a verdict)

The same change as `@skitterbyte/skitterspec` v19 → v20 above — this
distribution composes the same lifecycle skills. Read that entry; nothing here
is Linear-specific.

## `@skitterbyte/skitterspec` v18 → v19 (starting a spec offers phase 1)

### Breaking change

**skitterspec now requires Node 22.13 or newer.** `engines.node` was `>=18`, and
that floor was a claim nobody was testing: the test suite cannot run without an
install, and pnpm 11.11 — the package manager this repo pins — itself requires
22.13. A floor CI cannot exercise is a promise rather than a guarantee, so it was
raised to the version the toolchain actually needs.

On Node 18 or 20, `npm install` now warns — or fails, under `engine-strict`.
Upgrade Node, or stay on v18 of skitterspec. Nothing in your config changes
either way.

### Releases now carry provenance

Every release from v19 onwards is built and signed by GitHub Actions through npm
Trusted Publishing, so no publish token exists anywhere to be leaked. Each
published version carries a signed attestation you can verify back to the commit
it was built from:

```
npm view @skitterbyte/skitterspec@19.0.0 dist.attestations
```

Nothing to do — it is a property of the package you receive.

### Breaking change

**`/spec-start` no longer pushes the spec's branch.** It provisions the worktree
and commits the spec's move to `in-progress/` exactly as before, and then stops.
Publishing is yours to do, whenever you want the work somewhere other than your
machine:

```
git -C <worktreePath> push -u origin <branch>
```

Two things change for you, and neither is in your config:

- **Spec branches stop appearing on the remote.** Nothing is lost — the branch
  and its commits are in the worktree — but a branch you have not pushed is on
  one machine only, and that is now the default rather than something the
  tooling quietly undid.
- **Cancelling a spec with unpublished work now refuses.** `/spec-cancel` has
  always respected `guards.refuseTeardownIfUnpushed`, but the guard could never
  fire while provisioning published every branch. It fires now, at the one moment
  it was written for: the work really is about to be destroyed, and the worktree
  is the only copy. `/spec-cancel` names both ways out — publish the branch and
  re-run, or `spec-env down <name> --force` accepting the loss. Nothing was
  removed from your config and nothing needs adding to it.

The justification for the old behaviour does not survive reading, which is why
it went rather than becoming a setting: it claimed to fire the tracker's branch
automation, and that needs `{identifier}` in `branch.pattern`, which the shipped
default does not carry. `/spec-bug` never pushed and `/spec-hotfix` forbids it,
so this also makes the three consistent.

**The `open.command` config key is gone.** It was the editor/terminal-agnostic
opener — `code {worktreePath}`, a `tmux` command, a `warp://` deeplink — that
`/spec-start` ran when it could not move your session into the worktree.

**Leaving it in `env.config.json` is harmless and silent** — which is the part
to watch. The config merge copies known keys only, so a leftover `open` block is
ignored rather than rejected: nothing errors, and your editor simply stops
opening. If you set it deliberately, that absence is the only signal you get.

**`/spec-start` no longer moves your session into the worktree either.** It
provisions the worktree, does the housekeeping there, prints the path, and stops.
This **supersedes the "opens a session in it" half of v17 → v18 below** — the
branch still never leaves its worktree, but nothing tries to relocate your shell
to reach it.

| v18 | v19 |
|-----|-----|
| Three paths through `/spec-start`: enter the session, or fall back two ways | **One path.** Provision, bootstrap, print the path. |
| Reaching the work meant getting a shell or a window into the worktree | **`/spec-diff`** renders the worktree's diff as a page you read anywhere |
| `open.command` opened an editor on the fallback path | Removed. Nothing opens anything. |

### What replaced it

**`/spec-diff`** — a new skill, and the reason the opener had nothing left to do.
A phase is built in its own worktree, so `git diff` in your terminal answers
about the base branch. `/spec-diff` collects that worktree's changes with
`git -C` and writes a self-contained HTML page: whole-file context that folds
away, a file tree, untracked files included. Open it locally, or publish it and
read it on a phone.

The page lands in `.spec-env/reviews/<spec>.html` (gitignored), and
**the diff never passes through the model** — so it costs no context tokens
however large it is. The optional *written* review is the part that costs, and it
is offered rather than assumed. `/spec-next` writes the page at the end of every
phase. Beneath it, `skitterspec spec-env review <spec> [--branch]` is the engine.

### `/spec-start` lands you in the worktree, and offers phase 1

Two changes to the same moment. In `worktree` mode `/spec-start` used to
provision the branch, print the path and leave your session where it was; opening
a session in the worktree was then yours to do. It now
**moves your session into the worktree** as part of bootstrapping it, and asks
whether to build phase 1:

```
worktree ready — this session is now in it:
  ../myrepo-wt/sort-inbox

build phase 1 now?
  yes -> carries on into /spec-next
  no  -> you are already there; type /spec-next whenever you like
```

**Your shell will not be where it was.** A session that was on `main` in the
primary checkout is standing in the spec's worktree afterwards, on the spec's
branch — so the next command you type runs there. That is the point of it, and it
is still a real change to plan for. The move is a plain `cd`: nothing prompts you
for approval, nothing opens a new terminal or window, and your primary checkout
is untouched and still on the base branch.

**`/spec-next` needs no argument now.** Say **yes** and `/spec-start` carries on
into a bare `/spec-next`; say **no** and typing `/spec-next` an hour later does
the same thing, because you are already standing in the right place. Neither is
assumed, because provisioning is cheap and reversible while a phase build is
neither.

**This is not a loosened refusal.** A bare `/spec-next` still refuses to build a
spec it is not standing in, exactly as before — what changed is where you are
standing, not how weakly the rule reads. `--worktree <path>` survives beside it as
the explicit way to build a spec you are *not* in, and a path you pass is still
not a path anything guessed.

**Leaving is a `cd` too.** `/spec-complete` and `/spec-cancel` delete the
worktree, which is now the directory you are standing in, so both tell you to `cd`
to the primary checkout first. `git worktree remove` **succeeds** on the tree you
occupy rather than refusing — the teardown looks fine and every command after it
dies with `Unable to read current working directory`.

**The `--worktree` build checks itself.** On that path, `/spec-next` first records
what your primary checkout looked like, and afterwards reports anything that
appeared in it — the signature of a relative path that missed the worktree. It
reports rather than accuses: it cannot know who wrote a file, so it names both
readings and deletes nothing.
`skitterspec spec-env resolve <spec> --record-primary` and
`--assert-primary-clean` are the engine underneath, usable on their own.

### What to do

1. **Upgrade** — `npx @skitterbyte/skitterspec update`.
2. **Delete the `open` block from `specs/.core/env.config.json`**, if you have
   one. Optional — it is ignored either way — but leaving it implies a setting
   that no longer does anything.
3. **Answer the question `/spec-start` now asks.** In `worktree` mode it offers
   phase 1 before it finishes. Take the offer and it is built there and then;
   decline and you are left standing in the provisioned worktree, free to type
   `/spec-next` whenever you like. Both endings are fully supported — decline when
   the phase is a big one and you would rather spend a fresh context on it.
4. **Expect your shell to move, whichever you answer.** Anything you had queued
   for the primary checkout — a `git` command, a script, a relative path — now
   runs in the worktree instead. `cd` back when you want the base branch, and note
   that `/spec-complete` and `/spec-cancel` require exactly that before they tear
   the worktree down.
5. **Use `/spec-diff` to read the work** rather than reaching for a terminal in
   the worktree. It is gated on nothing — half a phase, a hand edit, or a
   colleague's branch are all ordinary inputs.

`checkout` mode is unchanged.

## `@skitterbyte/skitterspec-linear` v12 → v13 (starting a spec offers phase 1)

The same change as `@skitterbyte/skitterspec` v18 → v19 above — this
distribution composes the same lifecycle skills. Read that entry first.

### Breaking change

**`spec-sync push` is now `spec-sync plan`.** The verb computes a create/update
plan and performs no network I/O; `spec-sync apply` is what writes to Linear.
Calling it `push` put three unrelated things behind one word — this verb, the
`/spec-push` skill, and `git push` — and it was the one that pushes nothing.

```
skitterspec spec-sync plan <spec> --workspace-states <file> --json > plan.json
skitterspec spec-sync apply <spec> --plan plan.json
```

The old name is **not** aliased. It is recognised and exits 1 naming its
replacement, so a script that calls it fails loudly with the fix in the message
rather than drifting on a name that will be removed later.

**Your `linear.config.json` needs no change.** The `"push"` values under
`sync.fieldOwnership` — `assignee: "push"`, `description: "push"`,
`workflowState: "push"` — are a different vocabulary: they name a direction of
ownership, not a subcommand. They are untouched and still mean what they meant.
Do not search-and-replace `push` in your config.

### What else is here

**One thing here is Linear-specific.** `/spec-start` now pushes to Linear itself,
right after it commits the spec's move to `in-progress/`. It used to push nothing
and leave the mirror to the refresh `/spec-next` runs — immediate in `checkout`
mode, but in `worktree` mode hours away or never. Until it came, the issue sat in
its old workflow state with nobody assigned while the repo read `in-progress`
with a developer on it. Expect one more Linear call per `/spec-start`, and expect
the issue to be current the moment the spec is in flight. Nothing else changes:
sync is still one-way, and an unlinked spec is still skipped rather than minted.

## `@skitterbyte/skitterspec` v17 → v18 (a spec is built in its own worktree)

### Breaking change

**`/spec-start` no longer moves the branch into your checkout.** In `worktree`
mode it provisions the spec's worktree, does the housekeeping there, opens a
session in it, and stops. The spec is built where it was provisioned — which is
what worktrees are for, and why `main` stays free.

This **supersedes the "one checkout holds one spec in flight" rule** described
under v16 → v17 below. That rule was a consequence of moving the branch into the
primary checkout; with the move gone, so is the restriction:

| v17 | v18 |
|-----|-----|
| `/spec-start` refused while another spec held your checkout | In `worktree` mode it only requires a **clean tree**. Several specs in flight is what the mode is for. |
| Starting a spec took two invocations, with a `/spec-live <name>` you typed in between | **One invocation.** No hand-off command, no re-run. |
| `/spec-live main` was one of the ways out of the gate | The ways out are `/spec-complete` and `/spec-cancel`. Parking to free a workbench is a one-workbench answer, and only `checkout` mode holds one spec now. |

**`/spec-live` is for testing only** — reusing your running dev server to reach a
spec at the canonical URL. It was never meant to be how work gets started, and no
lifecycle skill calls it.

`checkout` mode is unchanged: the branch is built in the primary checkout, the
gate still requires the workbench free, and `/spec-start` carries straight on
into phase 1 in the same session.

### What to do

1. **Upgrade** — `npx @skitterbyte/skitterspec update`.
2. **Expect a session, not a swap.** After `/spec-start` in `worktree` mode, run
   `/spec-next` from the session it opens in the worktree. `/spec-next` builds
   the spec it is *standing in* and refuses to build one from elsewhere.
3. **Nothing to configure.** `spec.companionPaths` in `env.config.json` is new
   and optional — it names paths that belong to a spec alongside its own folder
   (a tracker's per-spec snapshot), so `/spec-start` can commit them together.
   Empty by default; `/spec-linear-setup` sets it for you.

## `@skitterbyte/skitterspec-linear` v11 → v12 (a spec is built in its own worktree)

The same change as `@skitterbyte/skitterspec` v17 → v18 above — this
distribution composes the same lifecycle skills. Read that entry; nothing here
is Linear-specific.

## `@skitterbyte/skitterspec` v16 → v17 (`/spec-go` splits in two)

### Breaking change

**`/spec-go` is removed.** It did two jobs — set an environment up, and build a
phase — and the seam between them is where the worktree hand-off hurt: you ran
the same command twice, once to provision and once, from another session, to
build. They are now two commands with one job each:

| Removed | Use instead |
|---------|-------------|
| `/spec-go <name>` (first run — start a spec) | **`/spec-start <name>`** — puts the spec in flight on this checkout, moves it to `in-progress`, then builds phase 1. |
| `/spec-go` (later runs — build the next phase) | **`/spec-next`** — builds the next phase of whichever spec is in flight. Re-run it per phase. |
| `/spec-go --here` | **Nothing — `/spec-start` *is* here.** It puts the branch in the checkout you are in, which is what the flag was reaching for. |

**One checkout holds one spec in flight.** `/spec-start` refuses while another
spec holds your checkout, naming it and the three ways to free the workbench
(`/spec-complete`, `/spec-cancel`, or `/spec-live main` to park it). It will not
stash, commit or switch on your behalf — moving unfinished work is a decision,
not a side effect.

**`/spec-next` refuses when nothing is in flight** rather than guessing a spec
from the conversation. It writes real code; a wrong guess produces commits on a
branch nobody asked for.

### What to do

1. **Upgrade** — `npx @skitterbyte/skitterspec update` removes the retired
   `/spec-go` skill and installs the two replacements. A `/spec-go` you edited
   yourself is kept with a warning rather than deleted; remove it by hand.
2. **Retrain the muscle memory** — `/spec-start <name>` to begin, `/spec-next` to
   carry on, unchanged `/spec-complete` to finish.
3. **Providers**: the `spec-go-start` seam is now **`spec-next-start`**. A
   provider distribution must rename its fragment file to match, or the build
   fails on an orphaned seam.

## `@skitterbyte/skitterspec-linear` v10 → v11 (`/spec-go` splits in two)

The same change as `@skitterbyte/skitterspec` v16 → v17 above — this
distribution composes the same lifecycle skills, so `/spec-go` is removed here
too and replaced by `/spec-start` + `/spec-next`. Read that entry; nothing here
is Linear-specific. (Backfilled: the base entry was written when the change
landed and this one was missed.)

## `@skitterbyte/skitterspec-linear` v9 → v10 (`push` validates your issue states)

**`spec-sync push` now refuses to run until the configured `states` names have been checked against your Linear workspace.** The check itself is not new — it
already existed on `spec-sync status --workspace-states` — but it was advisory,
and skipping it sent a state name Linear **silently ignores**: the description
lands, the issue never moves, and nothing errors. The base
`@skitterbyte/skitterspec` is unaffected.

### Breaking change

| | v9 | v10 |
|---|-----|-----|
| `spec-sync push <spec>` | runs | **exits 1** unless `--workspace-states <file>` or `--skip-state-check` is passed |
| A configured state absent from the workspace | pushed, silently no-op | **exits 1**, naming the workspace's real states |

`/spec-push` handles this for you — it fetches the workspace's issue
workflow-state names over MCP and passes them on. **Nothing changes if you drive sync through the skill.** Only a direct CLI caller needs updating.

### What to do

1. **Using `/spec-push`?** Nothing. Run `update` and carry on.
2. **Calling `spec-sync push` from CI or a script?** Supply the workspace's issue
   workflow-state names as a JSON array and pass the file:

   ```sh
   # names come from your Linear workspace, e.g. via the MCP server or the API
   echo '["Backlog","Todo","In Progress","Done","Canceled"]' > states.json
   skitterspec spec-sync push my-spec --workspace-states states.json --json
   ```

   Or opt out deliberately with `--skip-state-check`. Don't reach for it to get
   past a *failing* check — that check is the only thing standing between you and
   a push that moves nothing.
3. **If the check refuses,** it tells you what your workspace actually has and,
   where the lifecycle bucket makes it unambiguous, which name to use:

   ```
   spec-sync push: refusing — configured state name(s) not in the workspace

     states.complete: "Done" is not an issue state in this workspace
       use "Completed" instead

     available: Backlog, Todo, In Progress, Completed, Canceled
   ```

   Fix `specs/.core/linear.config.json` → `states`. `/spec-push` will offer to
   apply the fix for you.

### Also in v10 (not breaking)

- **A pre-9.0 mirror is detected before it can be orphaned.** A spec still
  carrying `linear_project_id` / `linear_milestone_id` reads as unlinked to v9+,
  so `push` would emit an all-creates plan and abandon the live mirror. The plan
  now carries a `legacy` field naming how many objects that would strand, and
  `/spec-push` stops. **If you skipped the v8 → v9 migration below, read it now** —
  this is the guard that catches you, not a substitute for it.
- **`update` says what it skipped** — each `customized (kept)` file now reports
  `+added −removed`, with `--diff` to see the upstream changes you declined.
- **This guide now ships inside the package** (it wasn't in the published tarball
  before v10 — `files` listed only `bin`/`src`/`assets`).

## `@skitterbyte/skitterspec-linear` v8 → v9 (a spec is an Issue, phases are sub-issues)

**v9 remaps the Linear mirror.** A spec is now a Linear **issue** (not a Project),
each phase a **sub-issue** (not a Milestone), and **tasks are no longer synced**
(they stay in the repo phase files). This collapses a large spec from ~1 project +
N milestones + dozens of task-issues down to **one issue + one sub-issue per phase**. The base `@skitterbyte/skitterspec` is unaffected (still v15).

### Breaking changes

| Area | v8 | v9 |
|------|-----|-----|
| `linear.config.json` → `mapping` | `{specFolder:"project", phases:"milestone", tasks:"issue"}` | `{specFolder:"issue", phases:"subissue", tasks:"none"}` |
| `linear.config.json` → `linear` | `initiativeId` | `projectId` (the project picker's default) |
| `linear.config.json` → `states` | Linear **Project** statuses (e.g. `Completed`) | Linear **issue** workflow states (e.g. `Done`) |
| `linear.config.json` → `sync.fieldOwnership` | `{description, milestones, tasks, workflowState}` | `{description, subIssues, workflowState}` |
| Phase frontmatter | `linear_milestone_id` | `linear_issue_id` (the sub-issue id) |
| Overview frontmatter | `linear_project_id` + `linear_identifier` | `linear_identifier` (the spec issue) |
| Last-pushed snapshot | `{project, milestones, issues}` | `{issue, subIssues}` |

### What to do

1. **Upgrade and re-run `update`:** `npx @skitterbyte/skitterspec-linear update`.
   It refreshes the skills, the `linear.config.md` / `SETUP.md` docs, and the
   config example.
2. **Edit `specs/.core/linear.config.json`** to the new keys above (or delete it
   and re-copy `linear.config.json.example`). Point `states` at your workspace's
   **issue** states; set `linear.projectId` if most specs belong to one Project —
   it pre-selects the picker's default rather than fixing every spec there.
3. **Optionally add `intake`** to start specs from issues someone else filed:

   ```jsonc
   "intake": {
     "label": "web-app",      // the inbox `/spec --from-issue` browses
     "bugLabels": ["bug"]     // issues with these route to /spec-bug
   }
   ```

   Without it, `/spec SKI-123` still adopts an issue by id; only the browsable
   inbox and the bug routing need the labels.
4. **Existing pushed specs:** the snapshot format changed, so the first
   `/spec-push` after upgrading **re-creates** the mirror (a fresh issue +
   sub-issues). Delete any stale `specs/.core/linear-base/*.base.json` and the old
   `linear_project_id` / `linear_milestone_id` frontmatter first. If you were
   pre-first-push, there's nothing to reconcile.
5. **Task-level issues** created under v8 are no longer managed by the sync —
   close or repurpose them in Linear by hand.

## `@skitterbyte/skitterspec-linear` v7 → v8 (sync goes one-way; `/spec-pull` removed)

**v8 made sync one-way.** The repo became the sole source of truth and Linear a
**generated mirror**: content is pushed up, never read back or merged. The
three-way merge engine and everything that fed it were retired.

### Breaking changes

| Area | v7 | v8 |
|------|-----|-----|
| Skills | `/spec-status`, `/spec-push`, **`/spec-pull`** | `/spec-status`, `/spec-push` |
| `spec-sync` subcommands | `normalize`, `push`, `status`, **`pull`** | `normalize`, `push`, `status`, **`record`** |
| Sidecar | a three-way merge base | the **last-pushed snapshot** (`record` writes it) |
| `sync.fieldOwnership` | `pull` / `both` values were load-bearing | still parsed; nothing is pulled |

### What to do

1. **Drop `/spec-pull` from any workflow that calls it.** There is no
   replacement: editing the mirror in Linear is no longer an input. A person
   editing the issue will see it overwritten by the next push.
2. **Replace `spec-sync pull` in scripts with `spec-sync record`** — it writes the
   snapshot from the current repo files after a push is applied.
3. **Delete stale merge-base sidecars** under `sync.baseDir`; the first push after
   upgrading writes the new snapshot format.

## `@skitterbyte/skitterspec-linear` v1 → v7 (no breaking changes)

Every major in this range was a **routine version bump**, not a breaking
contract. The skills (`/spec-status`, `/spec-push`, `/spec-pull`) and the
`spec-sync` subcommands (`normalize`, `push`, `pull`, `status`) were identical at
v1 and at v7. Upgrading anywhere inside this range needs **no action** beyond
re-running `update`.

One thing did change quietly, at **v4**: `sync.fieldOwnership` lost its
`milestones`, `phaseBodies`, `acceptanceCriteria` and `taskBreakdown` entries when
that detail moved inside `description`. A config still listing them does not
error — unknown keys merge in and *join the compared set* — so remove them if
you have them, or they will be compared against fields that no longer exist.

## `@skitterbyte/skitterspec` v3 → v16 (no breaking changes)

**Nothing in this range requires action.** Thirteen majors sounds like thirteen
migrations; it was one habit. Every release in this period was cut as a major
bump regardless of size (see `RELEASING.md`), and the base package's contract
never broke: **no skill was ever removed and no CLI flag was ever removed** — the
surface only grew. The spec folder layout
(`.core`/`backlog`/`in-progress`/`complete`/`cancelled`) is unchanged throughout.

The `feat(sync)!` commits that appear in this window changed
`@skitterbyte/skitterspec-linear`, which ships separately; the base was bumped
alongside it in lockstep. If you are on the **superset**, read the provider
entries above — those are the ones with work in them.

What each major actually added, so you can see what you gain by upgrading:

| Major | What landed |
|-------|-------------|
| v4 | `setup` commands bootstrap a fresh worktree's dependencies |
| v5, v6 | version bumps only |
| v7 | release docs refreshed; stale scripts dropped |
| v8 | version bump only |
| v9 | released alongside the provider's Linear body round-trip |
| v10, v11 | version bumps only |
| v12 | install manifest + `update --resync` / `--reset`; **`/spec-live`** overlay |
| v13 | **`/spec-hotfix`**, **`/spec-to-main`**, `spec-env prune` for orphaned test DBs |
| v14 | **Impact map** in the spec templates; live-aware `/spec-go`; the docs site |
| v15 | released alongside the provider's one-way sync switch |
| v16 | spec `Name:` handle; `/spec-complete` · `/spec-cancel` commit their own edits |

**Spec files written under an older version still read.** The template grew
(the Impact map at v14, the `Name:` header at v16) but the lifecycle skills treat
both as optional — `/spec-review` adds them if you want them.

## `@skitterbyte/skitterspec` v2 → v3 (slimmer surface + local traffic diversion)

**v3 shrinks the everyday command surface to five verbs — `spec → go → connect → commit → complete` — by folding provisioning, teardown, and grooming into the lifecycle skills, and adds `/spec-connect` for testing a worktree at your normal `localhost` URL.** (`@skitterbyte/skitterspec-linear` moves to v2.0.0 in lockstep.)

### Removed skills (breaking) → where they went

| Removed skill | Replaced by |
|---------------|-------------|
| `/spec-env` | **Automatic in `/spec-go`** — it provisions the worktree and (with your OK) starts the spec's dev servers. Escalate Docker later with the CLI: `skitterspec spec-env up <name>`. |
| `/spec-env-down` | **Folded into `/spec-complete` and `/spec-cancel`** — they tear the environment down (dev servers, worktree, stack, slot) as part of finishing/abandoning a spec. |
| `/spec-ready` | **Folded into `/spec`** — grilling now writes a `Ready` spec directly (or `Draft` if you deliberately leave open questions). Go straight to `/spec-go`. |

The **`skitterspec spec-env` CLI engine stays** (`up`, `down`, `dev`, `connect`,
`integrate`, `status`, `resolve`) — only the three *skills* were removed. Anything
that scripted those CLI verbs keeps working.

### New — `/spec-connect` and two config blocks

- **`/spec-connect <name>`** points your canonical `localhost` ports at a spec's
  running dev servers (so you can test a worktree's UI/API at the normal URL);
  `/spec-connect main` hands the ports back. It's a small bundled Node reverse
  proxy — no external install. Exclusive: one spec exposed at a time.
- **`env.config.json` gains `dev` and `proxy` blocks.** `dev` lists the host dev
  servers `/spec-go` starts (`{ name, command, portVar, health?, frontPort? }`);
  `proxy` configures the front-door proxy (`{ enabled, host }`). Both default to
  off/empty, so existing projects are unaffected until you fill `dev` in.

### What to do

1. **Upgrade and re-run `init`** (or `update`): `npx @skitterbyte/skitterspec
   update`. It stops installing the three removed skills, installs `/spec-connect`,
   and refreshes the CLAUDE.md section + `spec-planning` rule. Your specs and
   `env.config.json` are untouched.
2. **Remove muscle memory for the old commands** — use `/spec-go` to bring a spec
   up, `/spec-complete`/`/spec-cancel` to tear it down, and `/spec` (no separate
   `/spec-ready`) to reach a Ready spec.
3. **To test UI/API worktrees:** add a `dev` block to `env.config.json` (see
   `specs/.core/env.config.md`), then `/spec-go` → `/spec-connect <name>`.

## `@skitterbyte/skitterspec` v1 → v2 (tracker-free base)

**v2 of the base package is tracker-free.** The Linear sync feature — the
`/spec-status`, `/spec-push` skills, the `spec-sync` CLI, the
Linear-aware steps of `/spec` and `/spec-go`, and the `linear.config.*`
templates — moved out of `@skitterbyte/skitterspec` into a separate **superset**
distribution, `@skitterbyte/skitterspec-linear`. You now install exactly one:

| If you… | Install |
|---------|---------|
| don't sync specs to a tracker | `@skitterbyte/skitterspec` (v2) |
| use (or want) Linear sync | `@skitterbyte/skitterspec-linear` |

Everything else — the spec lifecycle and per-spec isolation — is unchanged and
present in **both**.

### If you did NOT use Linear sync

Nothing to do. Upgrade to v2 and re-run `init` (or `update`) as usual. The base
never installed the Linear skills for you, so there's nothing to remove.

### If you DID use Linear sync

Switching is one install plus a re-`init`:

1. **Install the superset** (in place of the base):

   ```sh
   npm rm @skitterbyte/skitterspec        # if it was a dependency
   npx @skitterbyte/skitterspec-linear init
   ```

2. **Re-run `init`.** It re-installs the shared skills (now composed with the
   Linear steps) and the three sync skills, and re-scaffolds the config
   templates. Your existing files are preserved — `init` never overwrites without
   `--force`.

3. **Your config is unchanged.** The live config path is still
   `specs/.core/linear.config.json`, and the committed base sidecars under
   `specs/.core/linear-base/` are read as-is. No re-linking, no re-sync.

That's it — `/spec-status`, `/spec-push`, and `skitterspec-linear
spec-sync …` work exactly as before.

### One config note — branch naming

Embedding the Linear identifier in a worktree branch name is now configured in the
**isolation** config, not the Linear config. In `specs/.core/env.config.json` set:

```jsonc
"branch": { "pattern": "{identifier}-{slug}", "identifierField": "linear_identifier" }
```

If you don't need the id in branch names, leave the default `{type}/{slug}` — the
old implicit Linear-branch behaviour is off unless you opt in this way. (This is
the only behavioural change beyond the package split.)

## Why the split

The base couldn't ship without a specific tracker's fingerprints baked into shared
skills and a `src/sync/` engine. Extracting the provider makes the base a clean,
tracker-free workflow and lets a new provider (e.g. Jira) ship as another superset
over the same base — without re-patching the base. See
`specs/complete/feat-extract-ticketing-provider/` for the full rationale.
