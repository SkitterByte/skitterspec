# Release Notes

What's new for users of skitterspec-linear. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 12.0.0 — 9 Sep 2026

**Highlights:** Starting a spec is one command again. In worktree mode /spec-start provisions the spec, promotes it and opens a session in its worktree — no /spec-live in the middle and no second run to finish the job — and your main checkout stays free for other work.

### Env
- **New** — The worktree opener now only runs when Claude could not move your session into the spec's worktree itself, so a normal start no longer opens a window you did not ask for.
- **New** — Starting a spec you just wrote no longer stops to make you commit it first. /spec-start commits the spec itself, along with its tracker snapshot, and still refuses to touch anything else you have left uncommitted.

### Gating
- **New** — You can now turn on release gating when you install skitterspec — npx @skitterbyte/skitterspec init --gating, or answer the setup prompt. Upgrading an existing project never switches it on by itself, and a config you have edited survives a resync.
- **New** — With release gating on, /spec-review, /spec-start and /spec-complete now tell you when a spec has no flag decision recorded, so the question cannot quietly go unanswered. They only ever report it — none of them will refuse to start, review or complete your work.
- **New** — Turn on release gating and /spec, /spec-bug and /spec-hotfix now ask whether the change should ship behind a feature flag, recording the answer on the spec — a flag name, or a one-line reason for not using one. Skitterspec never touches your flag system; it asks the question and points at your own documentation. Projects that do not configure it see no change at all.

### Skills
- **Action required** — Starting a spec is one command again. In worktree mode /spec-start provisions the spec, promotes it and opens a session in its worktree — no /spec-live in the middle and no second run to finish the job — and your main checkout stays free for other work.
- **New** — Completing or cancelling a spec from inside its own worktree now returns your session to the main checkout first, instead of leaving it in a directory that no longer exists.
- **New** — Starting a spec no longer opens a second terminal — the session you type /spec-start into becomes the spec's worktree, so you carry straight on with /spec-next in the same tab.

### Sync
- **Fixed** — A phase file that loses its Linear id — to a hand edit, a bad merge, or a tool that rewrites the file — no longer gets a second sub-issue created for it. The push says which phase lost its stamp and which issue it belonged to, so you can put it back.

## 11.0.0 — 9 Sep 2026

**Highlights:** /spec-go is replaced by /spec-start (begin a spec on your checkout) and /spec-next (build the next phase). One checkout holds one spec in flight, so starting a second refuses instead of moving your unfinished work. See MIGRATION.md.

### Env
- **New** — Starting a spec while another is in flight now tells you which spec holds your checkout and the three ways to free it, instead of naming only the branch and only the park option.
- **New** — Taking a spec live now tells you when a rebase could not start and why, instead of reporting every failure as a merge conflict, and refuses up front when the spec's worktree has uncommitted changes.
- **New** — Projects that set mode to checkout now build each spec on its branch in the checkout you are already in — no second terminal session and no hand-off. Worktree mode stays the default and is unchanged.

### Skills
- **Action required** — /spec-go is replaced by /spec-start (begin a spec on your checkout) and /spec-next (build the next phase). One checkout holds one spec in flight, so starting a second refuses instead of moving your unfinished work. See MIGRATION.md.
- **New** — A new /spec-start puts one spec in flight on your checkout and builds its first phase. It refuses while another spec is in flight rather than moving your unfinished work, and tells you how to free the workbench.
- **New** — A new /spec-next builds the next phase of whichever spec is in flight on your checkout, and says so plainly when none is, rather than guessing from the conversation.
- **New** — Starting a spec now opens the worktree session for you instead of printing a path to copy, when your project configures an opener. You still re-run /spec-go there, and an empty opener setting keeps the old printed-path behaviour.
- **Improved** — Writing or reviewing a spec no longer costs a round trip per question. /spec and /spec-review now put independent questions to you together, and only ask one at a time when an answer genuinely changes what comes next.
- **Improved** — Skill descriptions and the CLAUDE.md section skitterspec installs are much leaner, so every session spends less of its context on the spec workflow before you have asked for anything.
- **Fixed** — Completing or cancelling a spec from inside its own worktree no longer strands the session on a deleted directory, where every command after teardown failed.
- **Fixed** — The /spec-init skill no longer tells you to verify a skill that was removed in 3.0 — it lists the nine lifecycle skills that actually ship, so repairing a project's setup stops hunting for one that cannot resolve.
- **Fixed** — Starting a spec now hands you into its worktree instead of driving it from the main checkout, so your terminal's uncommitted- changes view follows the spec you are building rather than reporting a clean main for the whole spec.

## 10.8.0 — 8 Sep 2026

### Env
- **Fixed** — `/spec-live <spec>` and `/spec-live main` now do what every guide says they do. Both used to print a usage line and nothing else, so the only way to put a spec on your running dev server was an undocumented `/spec-live take <spec>`. The command's hint now also shows that a bare `/spec-live take` picks up the spec you are already working on.

### Install
- **Fixed** — `/spec-bug` and `/spec-hotfix` no longer send you to a "Picking the Linear Project" section that was never there. Both told you to run the picker and neither shipped it, so linking a bug or hotfix to Linear dead-ended at that step.

### Release tooling
- **Fixed** — `spec-sync released` and `spec-sync stage` no longer count a spec's own bookkeeping commits as shipped work. A `chore(spec): complete` commit lands after the tag that shipped the code it describes, so its ticket used to be reported in two consecutive releases — and a deployment ladder could drag an already-released ticket backwards. Set `release.ignorePaths` to name your own paperwork directories, or `[]` to switch the filter off.

## 10.7.0 — 4 Sep 2026

### Assets
- **Fixed** — The spec-workflow section that init writes into your CLAUDE.md is up to date again — it no longer describes /spec-connect as a skill, and lists every spec-env command rather than half of them.

### Doctor
- **New** — skitterspec doctor now checks your deployment ladder: it reports a stage name your Linear workspace does not have, and warns when the last stage leaves tickets short of a completed state. Setting the ladder up is part of the guided Linear setup rather than a hand edit, and a new guide covers wiring a deploy pipeline to it.

### Env
- **New** — Tearing down a finished spec now offers to delete the branch it pushed to the remote, so completed specs stop piling up merged branches there. It only offers this once the work has landed, always asks first, and never touches the remote for an unfinished spec — set `teardown.deleteRemoteBranch` to "always" or "never" to skip the question.

### Install
- **New** — Spec environment commands now work without naming the spec when you run them from inside that spec's worktree, so having several worktrees open at once no longer means retyping the name.
- **New** — Spec environment commands no longer need the spec name when only one spec has a worktree — run them bare and the right spec is used, with a list offered when there is more than one.
- **Fixed** — `spec-env status` now lists every spec with a worktree. It previously reported none at all in projects that do not use Docker, however many specs were in flight.
- **Fixed** — Running init or update from a checkout of the skitterspec repo itself now stops with a clear message instead of installing skills full of unreplaced template markers.

### Skills
- **New** — Claude no longer offers to run the Linear sync and land commands on its own — you type them when you want them, which also frees up context in every session.
- **New** — /spec-connect and /spec-live now run their command directly instead of going through Claude first, so they respond faster and cost far fewer tokens. Both are commands you type yourself.

### Spec
- **Fixed** — Starting a hotfix no longer risks silently mislaying the new spec's files one folder too high. The worktree's spec bucket is now created before the stub is moved into it, which matters most for a hotfix, since it forks from an old release tag where that folder is usually absent.

### Sync
- **New** — A new spec-sync stage command moves the tickets a release contains onto one of your declared deployment stages, so a pipeline can mark work as reaching test, demo or production. It reports what it will do and changes nothing until you pass --apply, and it names every ticket it declines to move along with the reason, so nothing is skipped silently.
- **New** — Projects can now declare their own deployment ladder in linear.config.json — the stages a ticket moves through after its spec is complete, such as on test, ready for demo and live. The stage names are checked against your Linear workspace alongside the lifecycle states, so a renamed column is caught instead of silently moving nothing, and spec-sync states now prints the whole configured vocabulary.
- **Fixed** — Reporting or staging a release from a shallow clone no longer silently leaves tickets out. Fetching tags makes a tag resolve without deepening history, so the range could quietly return fewer commits than it contained; both commands now refuse and explain, instead of deploying a release that looks complete. A shallow clone that does hold the whole range keeps working as before.
- **Fixed** — `spec-sync ref` now takes a spec name, so a commit belonging to a different spec than the branch you are standing on — a backlog spec written part-way through another — can be stamped with the right ticket instead of the branch's. A misspelt spec name now fails outright rather than quietly handing back the branch's ref.
- **Fixed** — Editing a finished spec no longer pushes its workflow state back to Linear, so a ticket a deploy pipeline has moved on stays where it is instead of being dragged back. A spec sitting on one of your declared release stages is now reported as being at that stage rather than as drifting from the repo.
