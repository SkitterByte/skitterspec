# Release Notes

What's new for users of skitterspec-linear. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

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
