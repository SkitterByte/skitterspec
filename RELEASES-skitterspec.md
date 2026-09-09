# Release Notes

What's new for users of skitterspec. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 17.0.0 — 9 Sep 2026

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

## 16.10.0 — 8 Sep 2026

### Env
- **Fixed** — `/spec-live <spec>` and `/spec-live main` now do what every guide says they do. Both used to print a usage line and nothing else, so the only way to put a spec on your running dev server was an undocumented `/spec-live take <spec>`. The command's hint now also shows that a bare `/spec-live take` picks up the spec you are already working on.

### Install
- **Fixed** — `/spec-bug` and `/spec-hotfix` no longer send you to a "Picking the Linear Project" section that was never there. Both told you to run the picker and neither shipped it, so linking a bug or hotfix to Linear dead-ended at that step.

## 16.9.0 — 8 Sep 2026

### Env
- **Fixed** — `/spec-live <spec>` and `/spec-live main` now do what every guide says they do. Both used to print a usage line and nothing else, so the only way to put a spec on your running dev server was an undocumented `/spec-live take <spec>`. The command's hint now also shows that a bare `/spec-live take` picks up the spec you are already working on.

### Install
- **Fixed** — `/spec-bug` and `/spec-hotfix` no longer send you to a "Picking the Linear Project" section that was never there. Both told you to run the picker and neither shipped it, so linking a bug or hotfix to Linear dead-ended at that step.

## 16.8.0 — 4 Sep 2026

### Assets
- **Fixed** — The spec-workflow section that init writes into your CLAUDE.md is up to date again — it no longer describes /spec-connect as a skill, and lists every spec-env command rather than half of them.

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
- **Fixed** — `spec-sync ref` now takes a spec name, so a commit belonging to a different spec than the branch you are standing on — a backlog spec written part-way through another — can be stamped with the right ticket instead of the branch's. A misspelt spec name now fails outright rather than quietly handing back the branch's ref.
