# Release Notes

What's new for users of skitterspec. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 19.0.0 — 15 Sep 2026

**Highlights:**
- skitterspec now requires Node 22.13 or newer.
- A review now ends in what it will do: Commit, or Commit & Continue, which commits and then builds the next phase so you never have to come back to the terminal to keep going. Request changes and Discuss first are unchanged.
- Spec skills now finish with a readable table — the ticket, the branch, what was built, the tests and the one thing to do next — instead of a block that looked like source code, with the offer to review the diff in it rather than lost underneath.
- Starting a spec in worktree mode now offers to build phase 1 there and then, instead of always stopping to hand off. Say no and you get exactly the old ending -- a provisioned worktree and its path -- so the choice is yours each time.

### Ci
- **New** — skitterspec now requires Node 22.13 or newer.

### Doctor
- **New** — Setup now offers to assign each spec's Linear issue to whoever is building it, and skitterspec doctor reports who it thinks you are. Projects that decline see nothing about any of it.

### Env
- **New** — Paste the review page's Copy output back into the chat and Claude picks it up: it says what you accepted, reads back your notes, and works only the files you commented on once you say go. Files you ticked off are left unopened, and what it did comes back on the page.
- **New** — A note you left on the review page now comes back answered: once Claude has acted on it, the next time you open the page the note is struck through with a one-line account of what changed, so you can check the fix rather than take it on trust.
- **New** — The review page is no longer read-only: you can tick files off as you read them, write notes against a line or a whole file, answer the questions a written review asks, and copy the whole pass out in one click to hand back to Claude. A tick remembers the file's content, so it lapses by itself when that file changes again.
- **New** — Typing /spec-connect with no argument now connects the spec you are on, where before it did the opposite and handed your ports back. Use /spec-connect main to disconnect -- that form is unchanged.
- **New** — Typing /spec-live with no argument now puts the spec you are on onto the running server, instead of only printing status -- and where it cannot tell which spec you meant, or something else holds the instance, it still shows you the report rather than guessing.
- **New** — The review page is now something you can actually read a diff in: unchanged code folds away into bands you expand as you need them, a file tree jumps you to any file, and it is legible in light and dark on a phone as well as a desktop.
- **New** — You can now see what a spec's worktree changed without leaving the terminal you are in: skitterspec spec-env review writes a self-contained page of the diff, whole-file context and new files included, that opens anywhere -- including on a phone.
- **Improved** — Starting a spec now does one thing -- build the branch and tell you where it is. Nothing tries to move your shell or open a window, so it behaves the same everywhere, including on a phone; use /spec-diff to read what a phase changed.
- **Fixed** — The review page now serves on Linux, so the link it offers is one you can actually open rather than a dead file:// path.
- **Fixed** — Starting a spec no longer claims to have left one of your files untouched when the file is one skitterspec had just created itself.
- **Fixed** — Starting a spec no longer refuses because another spec is sitting uncommitted beside it. A worktree carries nothing and the spec's commit names its own paths, so the other work is simply listed as left untouched and you carry on. Starting a spec in the one-checkout mode is unchanged, where uncommitted work really would follow you.
- **Fixed** — Re-attaching a spec that is already in flight no longer refuses with a claim that its spec is missing from the base branch. The message you get when a spec really is missing now names the branch that has it.
- **Fixed** — The review page now prints as a file:// link your terminal turns into something you can click, instead of a bare path you had to copy out by hand.
- **Fixed** — Escalating a spec to Docker by editing its Stack header in the worktree now actually brings the stack up, and spec-env reports the spec's real lifecycle bucket instead of the base branch's stale one.

### Install
- **New** — You can now ask which uncommitted files belong to a spec with `skitterspec spec-env stage`, so a commit can name them instead of staging the whole specs/ folder and sweeping up work another session was part-way through writing.
- **New** — skitterspec update --check now tells you what an update would change, including whether your CLAUDE.md spec section has drifted from the shipped one, without touching anything.
- **Fixed** — If you symlink your installed skills or rules back to their source files, update --force no longer follows those links and overwrites the source. It reports the linked paths and leaves them untouched.

### Review
- **New** — The review page now opens with what the change is for -- the problem it solves, the surfaces it touches, and the goal and tasks of the phase you are looking at -- before the first filename.
- **New** — After sending a review from the page, it now hands you the exact command to run — one tap to copy where your browser allows it, and ready-selected text where it does not.
- **New** — On the last phase of a spec, the review page's Commit & Continue button now says there is no phase left instead of offering to build one that does not exist.
- **New** — A review now ends in what it will do: Commit, or Commit & Continue, which commits and then builds the next phase so you never have to come back to the terminal to keep going. Request changes and Discuss first are unchanged.
- **New** — A review you approve on your phone is held by skitterspec until you confirm it in the session. Claude tells you the code it sees and you check it against your screen, so an approval from anyone else on your network cannot reach your review.
- **New** — Reading a review on your phone no longer means pasting a wall of JSON back. A served page sends the pass to skitterspec itself and shows you a six-digit code; read the code out and Claude picks it up, so your marks and notes never pass through the model at all. Opening the page as a local file still copies to your clipboard as before.
- **New** — A review server left running across an upgrade is now replaced automatically, so you stop reading pages drawn by the old version. The link you already have open keeps working.
- **New** — A review page now says which version of skitterspec drew it, so a page served by a server left running across an upgrade is recognisable instead of silently out of date.
- **New** — A review page now ends in a decision instead of a copy button. Approve commits the work through your own commit skill, Request changes sends it straight back to be worked, and Discuss first reports and waits. Approve is unavailable while a comment is still unresolved — you asked for something, so it cannot also be fine — and files you never ticked never block it.
- **New** — Tearing down a spec now tells you when it published a page that will outlive it, with the link and where to delete it, instead of leaving one up with nothing to find it by.
- **New** — When you are reading from somewhere other than the machine holding the page, skitterspec now says so instead of handing you a link that cannot open, and points at the local server instead.
- **New** — Publishing a diff page no longer needs it taken apart by hand first. `--publish-copy` writes a copy shaped for an artifact host, and gets it right even when the diff itself contains HTML.
- **New** — You can now read every spec's diff from one local server with `skitterspec spec-env review serve`, rendered fresh on each request so it is never out of date. Serving on your network with --host 0.0.0.0 prints a URL your phone can open, guarded by an unguessable path.
- **New** — Fixing a bug or a hotfix now ends the same way a phase does, with the diff page rendered and offered. A hotfix's diff is also measured from the release tag it was forked from rather than from the main branch, so it no longer shows commits the fix never touched.
- **New** — Reading a phase's diff no longer goes blank the moment you commit it. With nothing uncommitted, the page shows everything the spec has changed since the base branch and tells you that is what you are looking at, so there is no flag to remember after a commit.
- **Fixed** — After sending a review from the page, it now tells you to run /spec-reviewed rather than asking you to mention the review yourself.
- **Fixed** — skitterspec no longer hands you a review URL when the server failed to start. A port held by something else is detected before launch, and a daemon that dies on startup is reported instead of being mistaken for a working one.
- **Fixed** — The review page link now matches where the server is actually listening. If it is only reachable on this machine it says so and tells you how to open it up, instead of handing you a network address your phone cannot reach.
- **Fixed** — The review page no longer breaks after you finish a spec. The server that renders it is now owned by your main checkout, so tearing down a worktree can't leave it serving errors for every spec.
- **Fixed** — When you tear down the last spec, Claude now tells you the local diff server is still running and how to stop it, so a server it started for you does not quietly outlive the work it was serving.
- **Fixed** — The diff link you get when reading remotely now points at your real network address rather than whichever adapter happened to be listed first, so it opens on your phone even with a VM or VPN running. Any other addresses are listed underneath in case the guess is wrong.
- **Fixed** — When you are reading from your phone or over ssh, the diff link now opens — Claude stands the local review server up for you and hands you a URL that works, instead of a file path on a machine you are not sitting at.

### Rules
- **New** — Every spec skill now ends with the same short report block — a verdict, the fields that matter, and a Follow-ups line that is always present — so you can tell at a glance whether a run worked, half-worked, or refused before touching anything.

### Skills
- **New** — A finished phase can now end in a set of options -- pick up your review, commit, commit and continue, or discuss -- instead of a line to retype. Reports also gain a short note of what the run hit on the way.
- **New** — Typing /spec-reviewed now picks up your waiting review and acts on it straight away. You are only asked which one when two are waiting, and the six-digit code is there to tell them apart.
- **New** — You can now paste the six-digit code from a review page straight into /spec-reviewed to pick up that exact review pass.
- **New** — /spec-reviewed can now pick up a review for a spec you are not currently working in — name the spec or its ticket, and it offers to move you to that spec's worktree first, since committing the review has to happen there.
- **New** — After approving a review on your phone, type /spec-reviewed and Claude picks it up — no need to mention that you approved it, and no six-digit code to type unless more than one review is waiting.
- **New** — Questions a spec skill asks you now read as questions rather than as code samples, so an offer is answerable instead of something to scroll past.
- **New** — Spec skills no longer narrate their way through a run — they work quietly and tell you what happened at the end.
- **New** — Starting a spec now brings the review page server up for you, from your main checkout, so the page is ready to open on your phone before the first phase is built.
- **New** — Spec skills now finish with a readable table — the ticket, the branch, what was built, the tests and the one thing to do next — instead of a block that looked like source code, with the offer to review the diff in it rather than lost underneath.
- **New** — Every spec skill now finishes the same way — a verdict, the fields that matter for that skill, and a Follow-ups line that is always there — instead of a differently-shaped paragraph each run.
- **New** — The skills now offer whichever way of reading a diff will actually work where you are — the local file, or the server — instead of always handing over a file:// link.
- **New** — Starting a spec in worktree mode now offers to build phase 1 there and then, instead of always stopping to hand off. Say no and you get exactly the old ending -- a provisioned worktree and its path -- so the choice is yours each time.
- **New** — You can now build a phase in a worktree your session is not sitting in, with /spec-next --worktree <path>. The build checks afterwards that nothing was written into your main checkout by mistake, and says so before you commit.
- **New** — Starting a spec now updates its tracker issue straight away. The workflow state and the assignee no longer wait for the first phase to begin, which in worktree mode could be hours later or never.
- **New** — Finishing a phase now leaves the page already written and tells you where it is, with the written review offered rather than assumed -- so looking at what was built is one line away instead of something you have to remember to ask for.
- **New** — /spec-diff now writes a review of a spec's diff onto the page alongside the code -- a short read plus flagged, confirm and good notes against the files they are about -- and can publish it so you can read the whole thing on a phone.
- **New** — Starting a spec now records who is building it, and its Linear issue is assigned to them on the next push. Nothing is asked when your API key already says who you are, and a start never fails over it.
- **Fixed** — The last line of a spec report now tells you to commit before the step it names. Skills that deliberately leave your work uncommitted were pointing straight at commands that refuse a dirty tree.
- **Fixed** — When /spec-diff acts on your review notes for a spec whose worktree you are not sitting in, the fixes are now proven to have landed in that worktree rather than on your base branch.
- **Fixed** — Building a phase with a bare /spec-next from outside the spec's worktree now takes the same safeguards as passing the worktree path explicitly, so a stray edit can no longer land on your base branch unnoticed.
- **Fixed** — Completing or cancelling a spec now commits only that spec's own files. Running two sessions side by side no longer risks sweeping a spec you are part-way through writing into someone else's commit, under someone else's ticket.
- **Fixed** — Claude now hands you the working diff link directly when you are reading remotely, rather than telling you to start a server yourself. Publishing is still only ever done when you ask for it.
- **Fixed** — /spec-next now picks up the single spec you have in flight from anywhere in the repo — after clearing the context, from a new terminal tab, or the next morning — instead of refusing until you move into its worktree. With several specs provisioned it still names them and refuses rather than guessing.

### Spec Cancel
- **New** — Cancelling a spec whose work was never published now tells you the worktree is the only copy and offers to publish the branch first, instead of only mentioning the flag that throws the work away.

### Spec Next
- **New** — At the end of a phase you are now asked, in plain words and as the last thing you read, whether you want a written review of the diff page — instead of a link quoted in the middle of a long report.

### Spec Start
- **New** — Starting a spec now leaves you in its worktree, so you can build its first phase by typing /spec-next with no arguments instead of opening a second session.
- **New** — Starting a spec no longer pushes its branch to the remote. The branch and its commits stay on your machine until you publish them yourself, and the command to do that is printed when you want it.

### Sync
- **New** — You can now ask the spec listing for just your own work, or a teammate's, and filter it to what is in progress — and it tells you plainly when it cannot work out who you are instead of quietly showing you everyone's.

## 18.0.0 — 9 Sep 2026

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
