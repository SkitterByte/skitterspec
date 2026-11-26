---
name: spec-pr
description: Share a spec's branch as a pull request — a DRAFT PR mid-spec (repeatable), a ready PR once every phase is done, after the disposition pass. /spec-complete finishes after the host merges. The PR route under land.strategy "pr", or per spec with --strategy pr. Use when the user says "/spec-pr", "open a PR", "push this as a draft", "ready the PR", or "put this up for review".
---

# /spec-pr — share the branch as a pull request

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

In PR mode the base branch moves when the **host** merges, never from this
machine. So the lifecycle has two verbs where trunk mode has one:

| Verb | When | Does |
|------|------|------|
| **`/spec-pr`** | any time the work should be seen | push the branch; **draft** PR while phases remain, **ready** PR once all are done |
| **`/spec-complete`** | after the host merged | catch the base up, `afterLand`, file the spec under `complete/`, tear down |

`/spec-complete` before the merge refuses and names this skill. Nothing here
lands anything: a ready PR is not a merged one.

## 0. Preconditions

- **This skill IS the PR route, whatever the config says.** Where
  `land.strategy` is `"pr"`, nothing extra is passed. Anywhere else — a team
  that lands most features directly but some by PR — add `--strategy pr` to
  every `spec-env integrate` below, and carry it into `Next`
  (`/spec-complete --strategy pr`), so the finish after the merge takes the
  same route.
- **Isolation on, spec provisioned** (`/spec-start` gave it a worktree, or its
  branch in the checkout). Without it there is no branch to share — `⏸`.
- **Feature / Bug / Chore / Issue specs.** A Hotfix lands by its own route —
  `⏸`, naming `/spec-complete` (which runs `hotfix land`).

## 1. Identify the spec

Use the name argument, else the spec in flight exactly as `/spec-next` §1
resolves it (the worktree you stand in, else the sole provisioned spec via
`skitterspec spec-env resolve --json`). Several in flight and none named →
`⏸`, listing the candidates. Never the spec "in context".

## 2. Which PR — draft or ready

Read the phase index in `00-overview.md`.
**Every phase `✅` (or `➖`) → the ready path (§4). Anything else → the draft path (§3).**
The phase state is
the whole decision; there is no flag to override it, because a PR readied
over unfinished phases is one anyone can merge.

## 3. Draft path — the work so far, unmergeable

1. **Clean tree.** Uncommitted work → offer `/commit` and stop `⏸`. Never
   commit it yourself.
2. **Tests green in the worktree** — the project's typecheck and test
   commands. Red → `⏸`; a draft exists for CI to try the work, not to carry
   a known failure.
3. **Plan.** `skitterspec spec-env integrate <name> --draft`. It prints a
   fetch, a rebase onto `<remote>/<base>`, and — under `with your consent` —
   the push and the PR create (or `pr: … already draft — the push updates
   it`, the repeatable case).
4. **Ask once, plainly**, naming the remote and that the PR opens as a draft.
   On a yes, re-run with `--draft --push` and run the single printed list in
   order. On a no, run the fetch and rebase only, and report `held — not
   pushed` with the held commands: the work is rebased and ready to publish.
5. A **rebase conflict** → `git -C <worktree> rebase --abort`, relay it, stop
   `❌`. Nothing was pushed.

No after-land commands run and base is not re-tested: base has not moved.
CI on the draft is the check this push exists for.

## 4. Ready path — the last control point

Once the PR is ready, anyone can merge it from the host UI and the tracker's
automations act. Everything that needs a person happens here, in this order.

1. **Verify, as `/spec-complete` §2 does** — read and apply that section
   (`.claude/skills/spec-complete/SKILL.md`, *Double-check progress*): every
   phase file read, tests green, a Bug's failing test now passing, blockers
   reported, no stray uncommitted work, `spec-env checks <name>` relayed into
   `Notes`. Anything genuinely unfinished → stop `⏸`.
2. **Disposition pass — mandatory, before anything is pushed.** Run
   `skitterspec spec-env disposition <name> --json`. For every unticked task,
   non-✅ phase and surfaced follow-up it lists, the user disposes it:
   **tick** (it was done — name the evidence) · **spin off** (a follow-on
   ticket minted now and linked — offer `/spec` or the provider's mint) ·
   **drop** (a dated Changelog line with the reason). Batch the asking; never
   decide for them, never auto-create.
   **Refuse to ready the PR while anything is undisposed.** `clean` proceeds
   with nothing asked.
3. **Update the spec, as `/spec-complete` §3 does** — ticks, every phase ✅,
   the Changelog line. Under `land.specDocs: "branch"` also do §4's move to
   `specs/complete/` **here**, with the tracker step holding the state
   (`--hold-state`), and commit the owned paths (`skitterspec spec-env stage
   <name>`; pathspec on both halves) so they ride the PR. Under `"trunk"` the
   move waits for `/spec-complete` after the merge; commit only the §3 edits.
4. **Consent, naming the target.** Ask once: *"push `<branch>` and open the PR
   into `<base>` on `<remote>`, ready for merge?"* — the base is named so a
   spec that outlived a release roll is caught by the person reading a stale
   rc name. On a no, stop with the held commands relayed.
   **An autonomous run that ends on `pr` has already consented**: the
   operator named `pr` by flag, config or the final page's `Open PR` button.
   Say the target in `Landed` instead of asking.
5. **Run the plan.** `skitterspec spec-env integrate <name> --push` and run
   what it prints in order: fetch, rebase onto `<remote>/<base>`, push, and
   the PR create — or, where a draft exists, the flip to ready. A rebase
   conflict aborts and stops `❌`, exactly as §3.
   **Where `skitterspec spec-env run status <name> --json` returns a record**,
   the spec was built by an autonomous run: add one line per phase to the PR
   body — number, title from the phase index, commit from the record — with
   the host's PR-edit command (`gh pr edit <n> --body-file`, or
   `az repos pr update --description`).
6. **Stop, keeping the worktree.** No afterLand, no teardown, the tracker's
   Done untouched: the merge is the host's act and `/spec-complete` follows it.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the branch is pushed and the PR is open: a draft (§3) or ready (§4).
- `⚠️` — pushed, with something worth knowing: a completion check that
  failed, a tracker refresh that did not go through, or `held — not pushed`
  after a declined consent (a true outcome, not a failure).
- `❌` — the rebase conflicted, or the push or PR command failed part-way.
- `⏸` — no spec in flight, a dirty tree, red tests, unfinished
  phases on the ready path, or an undisposed item. Nothing moved.

**Fields:** `Tracker` · `Branch` · `Spec` · `Tests` · `Notes` · `Landed` ·
`Follow-ups` · `Next`

`Landed` names the host, never the base: `PR #14 (draft) opened` ·
`PR #14 (draft) updated` · `PR #14 ready → 2026/Q4` · `held — not pushed`.

`Next` after a draft is `/spec-next` (or `/spec-pr` again once more is
committed); after a ready PR it is *merge PR #N on the host, then
`/spec-complete`* (with `--strategy pr` where the config is not PR mode).
