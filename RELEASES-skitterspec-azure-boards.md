# Release Notes

What's new for users of skitterspec-azure-boards. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 2.0.0 — 29 Oct 2026

### Sync
- **Action required** — spec-status no longer reports a ticket whose status was moved on the tracker. Skitterspec tells the tracker about its own changes and leaves everything else on the tracker alone.
- **Action required** — spec-sync no longer moves tickets through a deployment ladder. The stage command and the release.stages setting are gone; list a release's tickets with `spec-sync released <range> --json`.
- **Action required** — spec-sync no longer creates releases or writes deploy state. Use `spec-sync released <range> --json` to list a release's tickets and set what you need with your tracker's own tools.
- **New** — spec-sync released now names the spec and ticket url behind every ref in a range, so a CI script can act on a release without a second lookup.
- **New** — /spec-list now shows each ticket's spec status beside its board state, flags where they disagree, lists the top of the backlog in the board's own order with --next, and takes --state in-progress.
- **New** — /spec-list on Azure Boards and GitHub now shows who each ticket is assigned to, marks tickets no spec has adopted, and takes --mine or --by <person> to see one person's work.
- **New** — A lifecycle state can now map to several board states, so a ticket in Blocked or Released reads as in progress or complete rather than unmapped, and finished states drop out of the live listing.
- **Fixed** — spec-sync status no longer accuses a ticket in a state skitterspec does not map (such as Blocked) of drifting, and no longer claims the next push will move a ticket back when it will not.

## 1.3.0 — 28 Oct 2026

### Azure Boards
- **New** — Azure Boards stories can now show which environment their release is deployed to, so the board tells you at a glance what is on test, on demo or live.
- **New** — Azure Boards stories now carry their release as a tag, so you can see on the card which release shipped them and filter the board by release.

### Review
- **Fixed** — The review banner and Review row now carry the Tailscale `also:` link under the network tier, so you can open a review from your phone while away from your home network.

## 1.2.1 — 27 Oct 2026

### Review
- **Fixed** — The review page now offers a Tailscale link, so you can open a review from your phone while away from your home network.

## 1.2.0 — 26 Oct 2026

### Azure Boards
- **Fixed** — Azure Boards sync no longer flags intact work items as edited on every push, assigns work items reliably from a fresh machine, routes Bug-type items to /spec-bug and mints bugs as your process's Bug type, and commits a spec's sync snapshot alongside it without hand-editing env.config.json.

## 1.1.0 — 26 Oct 2026

### Env
- **New** — afterLand commands in env.config.json can now run only when a land changes the files they depend on, e.g. regenerate the Prisma client when the schema changed or reinstall when the lockfile did, so the main checkout no longer goes red after a land.

## 1.0.0 — 26 Oct 2026

**Highlights:**
- spec-env hotfix land now runs the land itself, and hotfix.releaseWith lets a project's own release command (such as skittership's release-hotfix) cut the version commit and tag.
- Fixing a bug or shipping a hotfix now waits for your review verdict instead of finishing without one, so a button you press on the page always carries the work on. A commit in that spec's worktree is held until you send a verdict or record a reason for moving on.
- skitterspec now requires Node 22.13 or newer.
- A review now ends in what it will do: Commit, or Commit & Continue, which commits and then builds the next phase so you never have to come back to the terminal to keep going. Request changes and Discuss first are unchanged.
- Spec skills now finish with a readable table — the ticket, the branch, what was built, the tests and the one thing to do next — instead of a block that looked like source code, with the offer to review the diff in it rather than lost underneath.
- Starting a spec in worktree mode now offers to build phase 1 there and then, instead of always stopping to hand off. Say no and you get exactly the old ending -- a provisioned worktree and its path -- so the choice is yours each time.
- Starting a spec is one command again. In worktree mode /spec-start provisions the spec, promotes it and opens a session in its worktree — no /spec-live in the middle and no second run to finish the job — and your main checkout stays free for other work.
- /spec-go is replaced by /spec-start (begin a spec on your checkout) and /spec-next (build the next phase). One checkout holds one spec in flight, so starting a second refuses instead of moving your unfinished work. See MIGRATION.md.
- Phases can now be mirrored as sections of a spec's own Linear issue instead of separate sub-issues, and the choice is made per lifecycle bucket — so finished specs can push as one readable issue while active work keeps the assignable sub-issues agents pick up.
- spec-push now refuses to push when your configured Linear state names have not been checked against the workspace, and when one is wrong it tells you which states you actually have and offers to fix your config. Previously Linear silently ignored an unknown state, so the push looked clean and the issue never moved. Pushing via the CLI directly now needs --workspace-states or --skip-state-check.
- You can now start a spec straight from a Linear issue — `/spec SKI-123` to adopt one by id, or `/spec --from-issue` to browse issues filed by the web app and pick one. The issue becomes the spec's own issue, so the reporter's thread, comments and links all stay put.
- Linear sync is now one-way — the repo is the single source of truth and Linear is a generated mirror. Content is never read back or merged, so the round-trip corruption class is gone. Issues get a short first-sentence title with the full task text as the description.
- Spec sync no longer corrupts bold, italic, or link text that wraps across a line break when it round-trips through the tracker, and a new spec-sanitise command repairs any spec files already affected.
- New /spec-hotfix workflow for production hotfixes. Give it the tag prod is running (e.g. /spec-hotfix v33.16.4 login-crash) and it builds the fix on that exact released version in its own worktree, test-first. /spec-complete then tags a new patch release for your CI/CD to deploy (you push it) and cherry-picks the fix back onto main for the next release — with --also <tag> to patch extra lines like test or demo.
- Test a spec on your already-running dev server with /spec-live — it switches your main checkout to the spec's branch so the running app hot-reloads it at the normal URL, with no second dev stack or proxy. One spec is live at a time; /spec-live main hands the instance back and /spec-complete lands the work.
- Linear hybrid-sync now works against the real Linear API: /spec-pull brings status, priority and labels down and /spec-push sends spec content up, staying in sync across Linear's markdown formatting. See specs/.core/SETUP.md to set it up.
- The everyday surface is now five commands — spec, go, connect, commit, complete. Provisioning folds into /spec-go and teardown into /spec-complete/-cancel, so /spec-env, /spec-env-down and /spec-ready are removed; grooming is part of /spec. New /spec-connect points your normal localhost URL at a spec's dev servers to test a worktree live.
- skitterspec now ships as two packages — install @skitterbyte/skitterspec for the tracker-free base, or @skitterbyte/skitterspec-linear for the same workflow plus Linear hybrid-sync. Pick one; the Linear package is a strict superset.

### Assets
- **Fixed** — The spec-workflow section that init writes into your CLAUDE.md is up to date again — it no longer describes /spec-connect as a skill, and lists every spec-env command rather than half of them.

### Azure
- **New** — The Azure Boards provider gains a full docs page, and every sync command now accepts AB#n identifiers wherever a numeric work item id works.

### Ci
- **New** — skitterspec now requires Node 22.13 or newer.

### Dist
- **New** — skitterspec now ships as two packages — install @skitterbyte/skitterspec for the tracker-free base, or @skitterbyte/skitterspec-linear for the same workflow plus Linear hybrid-sync. Pick one; the Linear package is a strict superset.

### Doctor
- **New** — Setup now offers to assign each spec's Linear issue to whoever is building it, and skitterspec doctor reports who it thinks you are. Projects that decline see nothing about any of it.

### Env
- **Action required** — spec-env up now prints a single bootstrap command in place of the worktree shell steps, so there is no .env path to copy.
- **New** — spec-env hotfix finish removes a hotfix's worktree and branch once its release tag is at HEAD and the branch is on origin, so a failed deploy keeps the branch to cut the next hotfix from.
- **New** — A hotfix's carry to main now leaves out its version commit and anything main already has, and works when main is not checked out; a dirty main is refused with the command to run later.
- **New** — spec-env hotfix land --push now publishes the hotfix branch and then its deploy tag before carrying the fix to main; without --push it stops before the carry and prints the push commands.
- **New** — spec-env hotfix land now runs the land itself, and hotfix.releaseWith lets a project's own release command (such as skittership's release-hotfix) cut the version commit and tag.
- **New** — Setting hotfix.bump to "hotfix-suffix" now cuts hotfixes as X.Y.Z-hotfix.N, continuing from a hotfix base, and a later patch release no longer blocks the land.
- **New** — A new spec-env bootstrap command seeds, configures and sets up a spec's worktree in one call, with no .env path in the command for a secrets guard to refuse.
- **New** — A new afterLand setting in env.config.json lists commands, such as a data migration, to run in your main checkout after a spec lands, so local state catches up with what was just merged.
- **New** — Review waits now ride your harness's persistent monitor where one exists and restart themselves after a harness kill, so a verdict pressed after a long idle is picked up without retyping anything.
- **New** — A phase waiting on your verdict no longer quietly stops watching. The wait proves it is alive while it waits, is restarted on the same window if it dies, and after twelve hours says plainly that you need to send the verdict yourself rather than claiming to still be holding.
- **New** — Your base branch is now protected from accidental edits. Claude is refused when it tries to write there and is pointed at /no-spec or /spec-start instead, so ad-hoc work stops landing on main unreviewed. Only you can lift the guard, with /allow-main.
- **New** — A worktree can now be provisioned just to write a spec in, skipping the dependency install and the Docker stack that only exist to make a tree runnable.
- **New** — A key in `env.config.json` that skitterspec does not read is now named on every `spec-env` command instead of being dropped in silence — so a typo like `docker.portbase` tells you why the setting had no effect. It is advisory only: nothing refuses and nothing changes.
- **New** — Paste the review page's Copy output back into the chat and Claude picks it up: it says what you accepted, reads back your notes, and works only the files you commented on once you say go. Files you ticked off are left unopened, and what it did comes back on the page.
- **New** — A note you left on the review page now comes back answered: once Claude has acted on it, the next time you open the page the note is struck through with a one-line account of what changed, so you can check the fix rather than take it on trust.
- **New** — The review page is no longer read-only: you can tick files off as you read them, write notes against a line or a whole file, answer the questions a written review asks, and copy the whole pass out in one click to hand back to Claude. A tick remembers the file's content, so it lapses by itself when that file changes again.
- **New** — Typing /spec-connect with no argument now connects the spec you are on, where before it did the opposite and handed your ports back. Use /spec-connect main to disconnect -- that form is unchanged.
- **New** — Typing /spec-live with no argument now puts the spec you are on onto the running server, instead of only printing status -- and where it cannot tell which spec you meant, or something else holds the instance, it still shows you the report rather than guessing.
- **New** — The review page is now something you can actually read a diff in: unchanged code folds away into bands you expand as you need them, a file tree jumps you to any file, and it is legible in light and dark on a phone as well as a desktop.
- **New** — You can now see what a spec's worktree changed without leaving the terminal you are in: skitterspec spec-env review writes a self-contained page of the diff, whole-file context and new files included, that opens anywhere -- including on a phone.
- **New** — The worktree opener now only runs when Claude could not move your session into the spec's worktree itself, so a normal start no longer opens a window you did not ask for.
- **New** — Starting a spec you just wrote no longer stops to make you commit it first. /spec-start commits the spec itself, along with its tracker snapshot, and still refuses to touch anything else you have left uncommitted.
- **New** — Starting a spec while another is in flight now tells you which spec holds your checkout and the three ways to free it, instead of naming only the branch and only the park option.
- **New** — Taking a spec live now tells you when a rebase could not start and why, instead of reporting every failure as a merge conflict, and refuses up front when the spec's worktree has uncommitted changes.
- **New** — Projects that set mode to checkout now build each spec on its branch in the checkout you are already in — no second terminal session and no hand-off. Worktree mode stays the default and is unchanged.
- **New** — Tearing down a finished spec now offers to delete the branch it pushed to the remote, so completed specs stop piling up merged branches there. It only offers this once the work has landed, always asks first, and never touches the remote for an unfinished spec — set `teardown.deleteRemoteBranch` to "always" or "never" to skip the question.
- **New** — Finishing or cancelling a spec now offers to clear leftover per-spec test-database volumes from earlier specs, so orphaned DBs get swept up as you go instead of piling up on disk.
- **New** — New `skitterspec spec-env prune` command finds and clears orphaned per-spec test-database volumes left behind by torn-down or abandoned specs, so they stop piling up and eating disk.
- **New** — Fresh spec worktrees now automatically get your gitignored files (.env, local secret/config overrides) via a new seedFiles setting, so setup steps and git hooks that depend on them no longer fail in a new worktree. Symlink them (kept in sync with your main checkout) or copy them, configured in env.config.json.
- **New** — When you start a spec, its worktree can now bootstrap itself automatically — configure a setup command (e.g. install dependencies) and spec-env runs it right after creating the worktree, so hooks, typechecks and tests work immediately instead of failing on missing dependencies.
- **New** — You can now point your normal localhost URL at a spec's dev servers with `spec-connect <spec>` (and `spec-connect main` to switch back), to test a worktree's UI/API changes without changing any URL.
- **New** — You can now start and stop a spec's host dev servers on their own reserved port block with `spec-env dev up` / `spec-env dev down`, so a UI/API feature runs isolated from your main checkout.
- **Improved** — Starting a spec now does one thing -- build the branch and tell you where it is. Nothing tries to move your shell or open a window, so it behaves the same everywhere, including on a phone; use /spec-diff to read what a phase changed.
- **Fixed** — spec-env live take now finds a dev server listening on every address (such as Vite with host: true) on macOS, and spec-env connect no longer takes over localhost while that server still answers on the network.
- **Fixed** — Landing a hotfix whose base is already a hotfix tag now cuts the next hotfix on that line (v36.2.3-hotfix.4 to -hotfix.5) instead of taking the mainline's next patch, and a tag collision now names the free tag rather than suggesting you delete one.
- **Fixed** — spec-env bootstrap now seeds the gitignored files into a /no-spec worktree before running setup, so a setup that needs .env works.
- **Fixed** — The main-branch guard no longer blocks writes outside the repo, such as a scratch file, and now catches a write into the primary checkout made from a worktree.
- **Fixed** — Specs with their own Docker stack now start it isolated: spec-env up brings the stack up last, from the spec's worktree, after setup has run, and docker.envFile can name any file. If your project seeds that env file as a symlink, the env-file step now refuses rather than writing into your main checkout's file; point docker.envFile at a file of its own.
- **Fixed** — /spec-hotfix now provisions its worktree from the release tag before it writes anything, so it no longer seeds a spec on the base branch or moves the folder across by hand.
- **Fixed** — Starting a new spec now provisions its worktree before a line is written, so authoring never touches your base branch and the spec page is ready for review the moment it exists.
- **Fixed** — Pressing the live button on a review page now actually puts the work live. The button says it commits first, a mid-phase page offers the command instead of a press it could not honour, and a phase waiting on a verdict can be moved past with /spec-skip "<reason>".
- **Fixed** — A spec you have just written is now reviewed on a page that offers Commit & Start, not Commit & Continue. Since specs began being authored in their own worktree, the served page had been offering to build a next phase that a backlog spec does not have.
- **Fixed** — Your docker.composeFile setting is now actually used — a project whose compose file is not at the default name has it passed to docker on both setup and teardown. A spec with no Stack header only brings a stack up where there is really one to bring.
- **Fixed** — A /no-spec branch's review page now opens. It rendered fine but the server could not find it, so every link the skill handed you returned "not found" — and the branch was missing from the index too. Specless branches are resolved from the registry now, and a page provisioned after the server started is reachable without restarting it.
- **Fixed** — Disowning a review pass now works when its spec has finished and its worktree is gone — which is the state nearly every stranded pass is in. The hint that `review waiting` prints could not previously be followed for any pass it listed. A refusal with a pass waiting now points at that command instead of telling you to start the spec up again.
- **Fixed** — The review page now serves on Linux, so the link it offers is one you can actually open rather than a dead file:// path.
- **Fixed** — Starting a spec no longer claims to have left one of your files untouched when the file is one skitterspec had just created itself.
- **Fixed** — Starting a spec no longer refuses because another spec is sitting uncommitted beside it. A worktree carries nothing and the spec's commit names its own paths, so the other work is simply listed as left untouched and you carry on. Starting a spec in the one-checkout mode is unchanged, where uncommitted work really would follow you.
- **Fixed** — Re-attaching a spec that is already in flight no longer refuses with a claim that its spec is missing from the base branch. The message you get when a spec really is missing now names the branch that has it.
- **Fixed** — The review page now prints as a file:// link your terminal turns into something you can click, instead of a bare path you had to copy out by hand.
- **Fixed** — Escalating a spec to Docker by editing its Stack header in the worktree now actually brings the stack up, and spec-env reports the spec's real lifecycle bucket instead of the base branch's stale one.
- **Fixed** — `/spec-live <spec>` and `/spec-live main` now do what every guide says they do. Both used to print a usage line and nothing else, so the only way to put a spec on your running dev server was an undocumented `/spec-live take <spec>`. The command's hint now also shows that a bare `/spec-live take` picks up the spec you are already working on.
- **Fixed** — spec-env dev, up, down, connect and resolve now find a spec that /spec-go moved into in-progress on its own branch, so starting a spec's dev servers works from the worktree or from main instead of failing with "spec not found".
- **Fixed** — Tearing down a finished spec now deletes its branch instead of refusing it. Completing a spec left the branch behind whenever work was committed after it was first pushed, which is the normal case.
- **Fixed** — spec-env integrate now lands a spec that was authored entirely on its own branch, instead of failing with "spec not found".

### Gating
- **New** — You can now turn on release gating when you install skitterspec — npx @skitterbyte/skitterspec init --gating, or answer the setup prompt. Upgrading an existing project never switches it on by itself, and a config you have edited survives a resync.
- **New** — With release gating on, /spec-review, /spec-start and /spec-complete now tell you when a spec has no flag decision recorded, so the question cannot quietly go unanswered. They only ever report it — none of them will refuse to start, review or complete your work.
- **New** — Turn on release gating and /spec, /spec-bug and /spec-hotfix now ask whether the change should ship behind a feature flag, recording the answer on the spec — a flag name, or a one-line reason for not using one. Skitterspec never touches your flag system; it asks the question and points at your own documentation. Projects that do not configure it see no change at all.

### Install
- **New** — Slash commands installed into your project now call the skitterspec CLI in a way that actually works — whether it is a local dependency or installed globally — and say so plainly when it cannot be found at all, instead of writing four commands that fail the first time you use them.
- **New** — `skitterspec --help` now lists the `spec-env live` and `spec-env stage` subcommands. Both have worked all along, but an undocumented command reads as a removed one.
- **New** — `skitterspec update` no longer reports a file as "your edit" when it is really a path skitterspec has only just started managing. That case now says so in its own words, so you can tell a file you wrote from one you customized and decide whether to take ours.
- **New** — You can now ask which uncommitted files belong to a spec with `skitterspec spec-env stage`, so a commit can name them instead of staging the whole specs/ folder and sweeping up work another session was part-way through writing.
- **New** — skitterspec update --check now tells you what an update would change, including whether your CLAUDE.md spec section has drifted from the shipped one, without touching anything.
- **New** — Spec environment commands now work without naming the spec when you run them from inside that spec's worktree, so having several worktrees open at once no longer means retyping the name.
- **New** — Spec environment commands no longer need the spec name when only one spec has a worktree — run them bare and the right spec is used, with a list offered when there is more than one.
- **New** — Every project you run skitterspec init or update in now gets a negative-checks rule beside spec-planning — a short guide to writing checks that accuse (ones that delete, exit non-zero, or call your repo broken) without misfiring on healthy input.
- **New** — skitterspec update now tells you what each of your customized files declined — a +added -removed summary per file, and --diff to see the upstream changes in full before you decide whether to re-apply your edits.
- **New** — Re-running init on a repo that already has skitterspec set up is now safe: it detects the existing setup and offers to resync (update managed files while keeping your edits), start again, or leave it alone — instead of silently skipping or overwriting. update keeps your customizations too.
- **Fixed** — If you symlink your installed skills or rules back to their source files, update --force no longer follows those links and overwrites the source. It reports the linked paths and leaves them untouched.
- **Fixed** — `/spec-bug` and `/spec-hotfix` no longer send you to a "Picking the Linear Project" section that was never there. Both told you to run the picker and neither shipped it, so linking a bug or hotfix to Linear dead-ended at that step.
- **Fixed** — `spec-env status` now lists every spec with a worktree. It previously reported none at all in projects that do not use Docker, however many specs were in flight.
- **Fixed** — Running init or update from a checkout of the skitterspec repo itself now stops with a clear message instead of installing skills full of unreplaced template markers.
- **Fixed** — skitterspec doctor --check-remote no longer reports your project as broken when it simply could not reach Linear. Being offline or rate-limited is now reported as a check that did not run, so it stops failing the skills that branch on doctor's exit code, while a key Linear actually rejects still does. The key row also tells you when a keyCommand failed, instead of saying you never set a key.
- **Fixed** — skitterspec init now tells you tracker sync is already set up, instead of pointing you at the setup skill on a project that has configured it.
- **Fixed** — The Linear distribution's --help now lists spec-sync and spec-sanitise, and the base distribution points you at the package that ships them instead of reporting an unknown command.
- **Fixed** — update no longer freezes a specs/.core or skill file out of upstream changes when its recorded hash goes stale — restoring the file from the package is now enough to get updates flowing again.
- **Fixed** — Upgrading to the one-way release now removes the retired /spec-pull command instead of leaving it behind, and spec-sanitise no longer touches skitterspec's own managed docs under specs/.core.
- **Fixed** — init no longer crashes when a file it scaffolds is a broken symlink (e.g. left over from a moved directory) — it replaces the dead link with a fresh file instead of erroring out.

### Linear
- **Fixed** — Linear hybrid-sync now works against the real Linear API: /spec-pull brings status, priority and labels down and /spec-push sends spec content up, staying in sync across Linear's markdown formatting. See specs/.core/SETUP.md to set it up.

### Linear sync
- **Fixed** — A fresh Linear install now treats a spec's own Linear snapshot as part of that spec, so /spec-start and /spec-complete commit it with the spec instead of reporting it as someone else's file. Before this, every install had to be corrected by hand or the leftover snapshot would block the branch from landing.

### Live
- **New** — Test a spec on your already-running dev server with /spec-live — it switches your main checkout to the spec's branch so the running app hot-reloads it at the normal URL, with no second dev stack or proxy. One spec is live at a time; /spec-live main hands the instance back and /spec-complete lands the work.

### Per-spec isolation
- **Fixed** — spec-env commands (up, down, status, resolve, integrate) now work correctly when run from inside a worktree, instead of mis-resolving and reporting a provisioned spec as "not provisioned".

### Review
- **New** — After you send a verdict the review page now tells you it is waiting to hear back, rather than telling you to run a recovery command it takes back a moment later — and once Claude has picked the review up, the tab closes itself.
- **New** — The review page's file list now highlights whichever file you are currently reading, and scrolls itself to keep that row in view — so a long diff stops being a map with no "you are here".
- **New** — The review page for a bug or hotfix fix no longer offers "Commit & Continue" when there is no next phase to build, so pressing it can no longer reach a /spec-next with nothing to do.
- **New** — A phase now ends with your configured reviewer's findings already on the review page, so there is nothing to remember and nothing to run. Mid-phase reads reuse them instead of spending another review, and /spec-diff --reviewers asks for a fresh one when you want it.
- **New** — Adding { "use": "coderabbit" } to review.reviewers is now the whole setup for CodeRabbit's free CLI — skitterspec knows its flags and reads its output. If it cannot run because you are not signed in or have hit the hourly limit, the review page says so rather than showing a clean review nobody did.
- **New** — Point skitterspec at a code reviewer that runs from your terminal and its findings now appear on the review page beside your own notes, each one badged with the tool that found it and linked to the line it is about. They never block a commit — reply to one and your reply does, because then a person has asked for something. A reviewer that could not run says so on the page rather than passing as clean.
- **New** — Each line of a rendered review now names the command that changes it — /spec-live to put the change live, /spec-live main to give the instance back, /spec-remote-review to allow reviewing from off your network. That last one is new and toggles, so you no longer have to remember which way round it was.
- **New** — The review page now has a line above the verdicts for putting the change live, so you can use it as well as read it — and one press takes it down again. A review surface that is switched off shows a button to turn it on instead of a command to go and type.
- **New** — A rendered review now tells you whether the spec is also running live, and where — so you can judge a change by using it as well as by reading it. A spec held live by someone else says so, and names the way to free it.
- **New** — A rendered review now lists every way you could open the page — local, network and remote — each labelled and in the same order, with the one command that turns on whichever is off. No more guessing which link works from where you are reading.
- **New** — You can now say which review surfaces a project allows instead of the tool guessing where you are reading, so a link that works on your phone no longer depends on it guessing right. Network reviews are on by default, which means the review server listens on your local network.
- **New** — The review server no longer keeps answering from an older build of the same version, which made a fixed page look broken and a broken one look fixed.
- **New** — Pressing a verdict on a spec's review page no longer makes that page disappear — reload it and the spec is still there, marked as committed.
- **New** — A review link keeps the same address whether you are reading on this machine or another, so it cannot change shape between one render and the next.
- **New** — A review link now keeps working across a restart, a crash and a reboot, so a page open on your phone does not stop answering for reasons you cannot see.
- **New** — When the review page cannot be served it now says why, naming the port to free rather than quietly handing back a file:// link.
- **New** — The review page is now always served over http, so its verdict buttons work wherever you read it — including a spec you have only just written, which previously had no page the server would answer for.
- **New** — Re-validating a spec now ends on the same review page, showing what drifted and what was rewritten, so a refreshed spec is read before it is committed.
- **New** — A spec can now be reviewed on the same page as everything else, before any work starts — including one still in the backlog with no branch of its own. The page shows the spec's own documents and nobody else's, even when several specs are being written in the same checkout.
- **New** — When a verdict cannot be delivered, the review page now says so where you are looking rather than in a grey footnote — and tells you which failure it was: a server that has moved, a pass the engine refused, or a request that never arrived. Your verdict is not lost: the box hands you the command that carries it, and the buttons stay live.
- **New** — Two repos on one machine no longer compete for the review server's port. Each gets its own, derived from its path and the same on every run, so a review link you handed out yesterday still opens today. Pin review.servePort to a number if you want a fixed one.
- **New** — The review page header now names the phase you are reviewing and lists its tasks — ticked and unticked — with the tracker ticket linked from the title, so a mid-phase diff shows what is and is not covered. On a page opened from a file, the buttons that need a server are hidden and the copyable commands line up in one place.
- **New** — One command now answers "is any review waiting anywhere?" — "skitterspec spec-env status", or "spec-env review waiting" on its own. It finds passes for specs you already finished and tore down, which is where they hid: a verdict you sent while nothing was listening used to be invisible unless you re-rendered that one spec. Starting or continuing a spec reports them too. Nothing is ever picked up on your behalf; each is listed with its code so you can claim it or disown it.
- **New** — Waiting for you to press a verdict is now one command the engine owns, instead of a watcher improvised for each run. Those improvisations failed silently — one could never match at all and spun for five minutes looking exactly like patience — so a verdict you sent could go unheard until you asked about it. The wait also says out loud that it has started, and by default lasts as long as your session rather than giving up after an hour.
- **New** — Reading a review as a local file now gives you a runnable command per verdict — "/spec-reviewed commit", labelled with the same "Commit & Continue" wording the buttons use — each with its own Copy button, instead of a button that only puts a wall of JSON on your clipboard. Tick an accept or write a note and it goes back to handing over the full pass, because a command line cannot carry your notes and it tells you so rather than dropping them.
- **New** — A review page rendered part-way through a run now offers Continue - "I have read it, carry on" - instead of a Commit button that would be the wrong verb for unfinished work. It can never clear the gate a finished phase arms, so a phase that ended still owes you a verdict.
- **New** — When a phase is waiting on you, the terminal now says so in a banner you cannot scroll past instead of a row in a table. Sending a verdict closes the review page and tells you what you chose — the same message is there if you come back to it, with the buttons safely shut and the diff one click away.
- **New** — You can now review from a phone that is nowhere near your
- **New** — A phase waiting on your verdict now holds against a plain git commit as well as the spec commands, so the review is hard to walk past by accident. It never blocks work on another branch or another spec, and anything it cannot determine lets the commit through.
- **New** — Finishing a phase now hands you the diff and waits — press a verdict on the page and the work carries on from there, with no command to remember. Reviewing from a phone keeps your ticks between refreshes, and the history line says what actually happened rather than calling every decision a discussion.
- **New** — A phase that has ended now owes you a verdict before its work is committed, so reading the diff becomes the normal way out of a phase rather than something to remember. Moving on without one is still one command away, and records the reason.
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
- **Fixed** — Turning on remote review from a worktree no longer edits the shared config on your main branch. It applies only to that spec, and if a review is waiting it publishes the page and shows you the remote link straight away.
- **Fixed** — On the review page the diff panes are now laid out in the same order as the file list beside them, so the highlight marking the file you are reading walks steadily down the list instead of jumping about.
- **Fixed** — An armed review gate can now be cleared from anywhere with `spec-env review skip <spec> "<reason>"`. Previously the gate's own documented exit was unreachable for a spec whose worktree had been removed, leaving an armed gate nothing shipped could clear.
- **Fixed** — The review page's "Commit & put it live" button works again. It was offered only at the end of a phase, where the review gate refused the very commit it depends on, so every press ended in a refusal. The phase still owes you a verdict afterwards.
- **Fixed** — Writing a note on the review page now wraps inside the pane instead of running off to the right, and pressing a verdict while text is still sitting unadded in the box warns you rather than silently throwing it away.
- **Fixed** — A review page opened for a freshly written spec now shows the spec on it. A tracker snapshot sitting beside the spec used to flip the page to the phase view, where every file is bookkeeping — so the page loaded with an empty main column and the wrong verdict buttons. A change that is nothing but spec documents now opens too, rather than folding all of itself away.
- **Fixed** — The review server's index page no longer fails to render in a project that names its companion files by tracker id.
- **Fixed** — A review page you send from your phone now tells you what actually happened to it. When Claude picks the pass up — which is the normal case while a phase is waiting — the page says so and asks nothing of you. The "/spec-reviewed" command only appears when the pass really is still sitting there unclaimed, and it now sits inside the "You chose" box as a green call-to-action rather than a grey line under a bar that has just closed. The command is plain text with a Copy button, so tapping it no longer raises your keyboard.
- **Fixed** — The commit review gate now installs when you upgrade an existing project, not only on a fresh init, and its hook no longer crashes in projects that use ES modules.
- **Fixed** — A waiting review now gives you one link — the page you can actually open — instead of two that behave differently. Publishing is kept for when your machine cannot be reached at all.
- **Fixed** — When a review page is published for reading elsewhere, the report now tells you the verdict needs picking up with /spec-reviewed rather than implying it will be noticed on its own.
- **Fixed** — A review page drawn from a working copy now says it is an unreleased build instead of reporting a version number that was never released.
- **Fixed** — A finished review no longer leaves an empty input box under the verdict buttons.
- **Fixed** — Finishing a review now leaves one clear statement of what you chose, instead of the same fact repeated in four places with a Copy button for a command you were about to type anyway.
- **Fixed** — After sending a review from the page, it now tells you to run /spec-reviewed rather than asking you to mention the review yourself.
- **Fixed** — skitterspec no longer hands you a review URL when the server failed to start. A port held by something else is detected before launch, and a daemon that dies on startup is reported instead of being mistaken for a working one.
- **Fixed** — The review page link now matches where the server is actually listening. If it is only reachable on this machine it says so and tells you how to open it up, instead of handing you a network address your phone cannot reach.
- **Fixed** — The review page no longer breaks after you finish a spec. The server that renders it is now owned by your main checkout, so tearing down a worktree can't leave it serving errors for every spec.
- **Fixed** — When you tear down the last spec, Claude now tells you the local diff server is still running and how to stop it, so a server it started for you does not quietly outlive the work it was serving.
- **Fixed** — The diff link you get when reading remotely now points at your real network address rather than whichever adapter happened to be listed first, so it opens on your phone even with a VM or VPN running. Any other addresses are listed underneath in case the guess is wrong.
- **Fixed** — When you are reading from your phone or over ssh, the diff link now opens — Claude stands the local review server up for you and hands you a URL that works, instead of a file path on a machine you are not sitting at.

### Rules
- **New** — Every spec skill now ends with the same short report block — a verdict, the fields that matter, and a Follow-ups line that is always present — so you can tell at a glance whether a run worked, half-worked, or refused before touching anything.

### Sanitise
- **Fixed** — spec-sanitise no longer corrupts blockquotes or tables, and now refuses to write a file if a reflow would alter its structure.

### Serve
- **Fixed** — A review page opened over http now offers the same verdicts as the page on disk. Work with no spec offered "Commit & Start" — putting a spec in flight that does not exist — and a page rendered mid-phase offered to commit unfinished work.

### Skills
- **Action required** — Starting a spec is one command again. In worktree mode /spec-start provisions the spec, promotes it and opens a session in its worktree — no /spec-live in the middle and no second run to finish the job — and your main checkout stays free for other work.
- **Action required** — /spec-go is replaced by /spec-start (begin a spec on your checkout) and /spec-next (build the next phase). One checkout holds one spec in flight, so starting a second refuses instead of moving your unfinished work. See MIGRATION.md.
- **Action required** — The everyday surface is now five commands — spec, go, connect, commit, complete. Provisioning folds into /spec-go and teardown into /spec-complete/-cancel, so /spec-env, /spec-env-down and /spec-ready are removed; grooming is part of /spec. New /spec-connect points your normal localhost URL at a spec's dev servers to test a worktree live.
- **New** — Starting a spec, a bug or a hotfix no longer stalls on a secrets guard: the skills set the worktree up with one engine call that names no .env file.
- **New** — /spec-complete, /spec-to-main and /no-spec now run your afterLand commands once a land succeeds, so a pending data migration runs on your dev database instead of being forgotten.
- **New** — Fixing a bug or shipping a hotfix now waits for your review verdict instead of finishing without one, so a button you press on the page always carries the work on. A commit in that spec's worktree is held until you send a verdict or record a reason for moving on.
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
- **New** — Completing or cancelling a spec from inside its own worktree now returns your session to the main checkout first, instead of leaving it in a directory that no longer exists.
- **New** — Starting a spec no longer opens a second terminal — the session you type /spec-start into becomes the spec's worktree, so you carry straight on with /spec-next in the same tab.
- **New** — A new /spec-start puts one spec in flight on your checkout and builds its first phase. It refuses while another spec is in flight rather than moving your unfinished work, and tells you how to free the workbench.
- **New** — A new /spec-next builds the next phase of whichever spec is in flight on your checkout, and says so plainly when none is, rather than guessing from the conversation.
- **New** — Starting a spec now opens the worktree session for you instead of printing a path to copy, when your project configures an opener. You still re-run /spec-go there, and an empty opener setting keeps the old printed-path behaviour.
- **New** — Claude no longer offers to run the Linear sync and land commands on its own — you type them when you want them, which also frees up context in every session.
- **New** — /spec-connect and /spec-live now run their command directly instead of going through Claude first, so they respond faster and cost far fewer tokens. Both are commands you type yourself.
- **Improved** — Writing or reviewing a spec no longer costs a round trip per question. /spec and /spec-review now put independent questions to you together, and only ask one at a time when an answer genuinely changes what comes next.
- **Improved** — Skill descriptions and the CLAUDE.md section skitterspec installs are much leaner, so every session spends less of its context on the spec workflow before you have asked for anything.
- **Fixed** — /spec-bug now provisions its own worktree before it writes anything, so a project with the main guard installed no longer has the skill denied on its own first step.
- **Fixed** — The last line of a spec report now tells you to commit before the step it names. Skills that deliberately leave your work uncommitted were pointing straight at commands that refuse a dirty tree.
- **Fixed** — When /spec-diff acts on your review notes for a spec whose worktree you are not sitting in, the fixes are now proven to have landed in that worktree rather than on your base branch.
- **Fixed** — Building a phase with a bare /spec-next from outside the spec's worktree now takes the same safeguards as passing the worktree path explicitly, so a stray edit can no longer land on your base branch unnoticed.
- **Fixed** — Completing or cancelling a spec now commits only that spec's own files. Running two sessions side by side no longer risks sweeping a spec you are part-way through writing into someone else's commit, under someone else's ticket.
- **Fixed** — Claude now hands you the working diff link directly when you are reading remotely, rather than telling you to start a server yourself. Publishing is still only ever done when you ask for it.
- **Fixed** — /spec-next now picks up the single spec you have in flight from anywhere in the repo — after clearing the context, from a new terminal tab, or the next morning — instead of refusing until you move into its worktree. With several specs provisioned it still names them and refuses rather than guessing.
- **Fixed** — Completing or cancelling a spec from inside its own worktree no longer strands the session on a deleted directory, where every command after teardown failed.
- **Fixed** — The /spec-init skill no longer tells you to verify a skill that was removed in 3.0 — it lists the nine lifecycle skills that actually ship, so repairing a project's setup stops hunting for one that cannot resolve.
- **Fixed** — Starting a spec now hands you into its worktree instead of driving it from the main checkout, so your terminal's uncommitted- changes view follows the spec you are building rather than reporting a clean main for the whole spec.

### Spec
- **New** — A refusal now offers the way out of itself. A spec whose worktree has uncommitted work offers to commit it and go live, and a phase still awaiting a verdict offers to commit without reading the diff — recorded as such, and asked only once.
- **New** — Completing or cancelling a spec now tells you when a review pass is still waiting for it, before the worktree goes. Nothing is lost either way — a pass can still be disowned afterwards — but this is the last point at which a commit verdict can actually be acted on.
- **New** — Mechanical work that does not warrant a spec — a version bump, a lockfile refresh, a rename — now has its own lane. /no-spec gives it a branch, a worktree and a review page like any phase, so it never has to be done on your base branch.
- **New** — Writing a spec no longer leaves your base branch dirty while you read the review page. The spec is authored on its own branch in its own worktree and lands as one commit when you send a verdict, so you can cut a release in the middle of grilling a new spec.
- **New** — Writing a spec now ends on the same review page as everything else, with buttons that commit it — or commit it and put it straight in flight. A spec no longer reaches /spec-start uncommitted.
- **New** — You can now start a spec straight from a Linear issue — `/spec SKI-123` to adopt one by id, or `/spec --from-issue` to browse issues filed by the web app and pick one. The issue becomes the spec's own issue, so the reporter's thread, comments and links all stay put.
- **New** — Every spec now shows its Name in the header -- the exact handle you paste into /spec-go and the other lifecycle commands, so you no longer have to hunt for the folder name.
- **New** — New specs now carry a scannable Impact map on their overview — a Surface/Change/Detail table naming the endpoints, schemas, DB tables, domain objects, routes and business rules a change touches, so you can eyeball where a spec got something wrong without reading prose. /spec-review re-checks it against the code.
- **Fixed** — Starting a hotfix no longer risks silently mislaying the new spec's files one folder too high. The worktree's spec bucket is now created before the stub is moved into it, which matters most for a hotfix, since it forks from an old release tag where that folder is usually absent.
- **Fixed** — /spec-review now tells you that a phase's status lives in its heading emoji, and to carry each phase's real status across when it splits a legacy spec into phase files. Previously a finished phase could be written up so that only the file itself knew, and your tracker mirrored it as not-started.
- **Fixed** — /spec-complete and /spec-cancel now commit the bookkeeping edits they make themselves, so finishing a spec lands the branch in one go instead of stopping to ask you to commit first. Work you had already left uncommitted still halts them, which is what that check was for.

### Spec Cancel
- **New** — Cancelling a spec whose work was never published now tells you the worktree is the only copy and offers to publish the branch first, instead of only mentioning the flag that throws the work away.

### Spec Complete
- **New** — Completing a spec now tears down its worktree and branch on its own once the work has landed and the tests are green, instead of stopping to ask. Pass --keep-env to hold on to the worktree.

### Spec Env
- **New** — Continuing a spec you'd taken live with /spec-live now just works — /spec-go keeps building on the running instance instead of sending your edits into a stale worktree where commits could go missing.
- **Fixed** — `spec-env up` no longer reports success for a worktree it has not created. It now states plainly that its plan created nothing, and each command it prints steps into the worktree first — so a step run from the wrong place fails loudly instead of quietly acting on your main checkout and leaving you to commit on main.
- **Fixed** — Completing a spec you'd taken live no longer risks silently dropping your commits — if work would be lost, the tool now stops with a clear message and recovery steps instead of finishing as though nothing was left to land.

### Spec Hotfix
- **New** — New /spec-hotfix workflow for production hotfixes. Give it the tag prod is running (e.g. /spec-hotfix v33.16.4 login-crash) and it builds the fix on that exact released version in its own worktree, test-first. /spec-complete then tags a new patch release for your CI/CD to deploy (you push it) and cherry-picks the fix back onto main for the next release — with --also <tag> to patch extra lines like test or demo.

### Spec Next
- **New** — At the end of a phase you are now asked, in plain words and as the last thing you read, whether you want a written review of the diff page — instead of a link quoted in the middle of a long report.

### Spec Start
- **New** — Starting a spec now leaves you in its worktree, so you can build its first phase by typing /spec-next with no arguments instead of opening a second session.
- **New** — Starting a spec no longer pushes its branch to the remote. The branch and its commits stay on your machine until you publish them yourself, and the command to do that is printed when you want it.

### Spec To Main
- **New** — You can now land an in-progress spec's branch onto main without completing it, using /spec-to-main. It rebases and fast-forwards your work onto the base branch so you can run it in CI or a shared test environment mid-spec, then keep going and land again as you add commits, while the worktree and spec stay in place.

### Spec workflow
- **New** — /spec-bug now runs the failing test and fix on the bug's own worktree branch when per-spec isolation is enabled, keeping main clean and landing each fix as one reviewable PR — pass --no-worktree to fix in place.

### Sync
- **Action required** — spec-push now refuses to push when your configured Linear state names have not been checked against the workspace, and when one is wrong it tells you which states you actually have and offers to fix your config. Previously Linear silently ignored an unknown state, so the push looked clean and the issue never moved. Pushing via the CLI directly now needs --workspace-states or --skip-state-check.
- **Action required** — The Linear provider now ships one-way: /spec-push sends a create/update plan up and /spec-status is a read-only drift report; /spec-pull is removed. spec-sanitise is optional (with a new --exclude).
- **Action required** — Linear sync is now one-way — the repo is the single source of truth and Linear is a generated mirror. Content is never read back or merged, so the round-trip corruption class is gone. Issues get a short first-sentence title with the full task text as the description.
- **New** — If someone edits a spec's ticket description in Linear, /spec-status and /spec-push now tell you before the next push replaces it, with a link to go and read what they wrote. The push still goes ahead — the repo stays the source of truth — it just no longer happens silently.
- **New** — A project can now tell skitterspec it does not own a synced field, with "none" in sync.fieldOwnership — the field is left alone in the tracker rather than written or cleared.
- **New** — You can now ask the spec listing for just your own work, or a teammate's, and filter it to what is in progress — and it tells you plainly when it cannot work out who you are instead of quietly showing you everyone's.
- **New** — A spec that is in progress now shows which phase is live and who holds it, so "what is Jane on" is answered by the listing itself rather than by opening the issue.
- **New** — A spec's Linear issue can now be assigned to whoever is building it, and hands itself back when the spec completes. Turn it on with "assignee": "push" in linear.config.json; without it nothing changes. An issue somebody assigned in Linear is never overwritten.
- **New** — A new spec-sync stage command moves the tickets a release contains onto one of your declared deployment stages, so a pipeline can mark work as reaching test, demo or production. It reports what it will do and changes nothing until you pass --apply, and it names every ticket it declines to move along with the reason, so nothing is skipped silently.
- **New** — Projects can now declare their own deployment ladder in linear.config.json — the stages a ticket moves through after its spec is complete, such as on test, ready for demo and live. The stage names are checked against your Linear workspace alongside the lifecycle states, so a renamed column is caught instead of silently moving nothing, and spec-sync states now prints the whole configured vocabulary.
- **New** — A bug fixed start-to-finish in /spec-bug or /spec-hotfix now shows up in Linear with its tasks ticked, instead of staying open there until someone pushed by hand.
- **New** — Linear now follows your phases as you work. A phase sub-issue moves to In Progress when the phase starts and to Done when it finishes, instead of sitting in Backlog until the whole spec completes.
- **New** — After installing, skitterspec now tells you how to set up tracker sync, and the setup guide leads with `/spec-linear-setup` — with the by-hand walkthrough kept for anyone not using Claude Code.
- **New** — /spec-push and /spec-status now name which phase mode a spec resolved to and the bucket that decided it, so an issue that mirrors without sub-issues reads as deliberate rather than as phase files that failed to parse.
- **New** — Phases can now be mirrored as sections of a spec's own Linear issue instead of separate sub-issues, and the choice is made per lifecycle bucket — so finished specs can push as one readable issue while active work keeps the assignable sub-issues agents pick up.
- **New** — You can now start a hotfix straight from the issue that reported it — /spec-hotfix v33.16.4 SKI-123, or /spec-hotfix SKI-123 to be asked which version production is running. The issue becomes the hotfix's own issue rather than a second one, and any version the report mentions is offered as a suggestion when picking the release to patch.
- **New** — Bug and hotfix specs are now linked to Linear when they are created, so a spec written mid-incident no longer stays invisible in the tracker, and reviewing a spec refreshes what it changed. Together with completing and cancelling, every command that moves a spec through its lifecycle keeps the mirror current on its own.
- **New** — Completing or cancelling a spec now updates its Linear issue as part of the same command, so a finished spec no longer sits in the tracker as In Progress until someone remembers to push. Specs that were never linked are left alone, and a failed push is reported without stopping the spec from completing.
- **New** — Adopting Linear sync on a long backlog no longer costs a call for every phase of every unstarted spec. Set mapping.phases to "deferred" and a spec in the backlog mirrors as the issue alone, keeping its phase list in the description; its sub-issues are created when you start the work.
- **New** — Pushing a spec that was linked under the pre-9.0 Linear model now stops with a warning naming how many live objects would be abandoned, instead of silently creating a second mirror.
- **New** — Pushing a spec no longer hand-edits ids into each file — one spec-sync stamp call writes them all, and refuses outright if any id or phase reference is wrong, so a typo can no longer leave a spec half linked and mint a duplicate issue on the next push. This also fixes the CLI silently reporting success on failure: a bad workflow-state name in your config now stops the push, as it was always meant to.
- **New** — A phase's task list now appears inside its sub-issue in Linear as a read-only checklist, so a sub-issue is more than a title and a single line. Ticking a box in Linear changes nothing — the repo stays the source of truth and the next push overwrites it. Set mapping.tasks to "none" for the old behaviour. Your first push after upgrading reports every existing sub-issue as an update; they update in place and no duplicate issues are created.
- **New** — A phase whose heading is missing its status emoji, or whose heading disagrees with its Status line or the overview phase index, now warns when you run spec-sync. Previously a finished phase could mirror to your tracker as not-started with nothing looking wrong anywhere. Nothing is blocked and no exit code changes — the warning only makes the mismatch visible.
- **New** — When a spec's Linear issue is first created you now choose which Linear Project it belongs to, from a searchable list of your team's projects with an explicit "None" option. The choice is applied once and never stored in the spec, so re-homing the issue in Linear later is not undone by the next push.
- **New** — A new `skitterspec spec-sync linked` command lists every spec alongside the Linear issue it is linked to, so you can see at a glance which specs have been pushed up and which have not.
- **New** — Long tasks get a cleaner Linear issue title — cut at a natural clause boundary instead of mid-phrase, with the full text still in the issue description.
- **New** — Task text that wraps at a hyphen (state-entry-with-assignment) no longer gains a space when synced, and Linear project statuses now use the correct names so status changes actually take effect.
- **Fixed** — Cancelling a spec now closes its unfinished phase tickets too, instead of leaving them open in the backlog.
- **Fixed** — A push now warns when a phase ticket was edited in the tracker since the last push, before it replaces that edit, as it already did for the spec ticket.
- **Fixed** — A phase file that loses its Linear id — to a hand edit, a bad merge, or a tool that rewrites the file — no longer gets a second sub-issue created for it. The push says which phase lost its stamp and which issue it belonged to, so you can put it back.
- **Fixed** — `spec-sync ref` now takes a spec name, so a commit belonging to a different spec than the branch you are standing on — a backlog spec written part-way through another — can be stamped with the right ticket instead of the branch's. A misspelt spec name now fails outright rather than quietly handing back the branch's ref.
- **Fixed** — Editing a finished spec no longer pushes its workflow state back to Linear, so a ticket a deploy pipeline has moved on stays where it is instead of being dragged back. A spec sitting on one of your declared release stages is now reported as being at that stage rather than as drifting from the repo.
- **Fixed** — The phase-status lint no longer warns about a spec whose overview writes a phase status in words rather than the status emoji. It used to read the unrecognised cell as not-started and report the overview disagreeing with a value nobody had written, on every push and status read of a perfectly healthy spec.
- **Fixed** — Pushing a spec whose phases already exist in Linear no longer reports every one of them as a possible stale reference. That warning fired on every push after the first, and its own advice to re-push simply reproduced it; a genuine mismatch is still reported.
- **Fixed** — Phase sub-issues in Linear now mirror the whole phase file instead of only its goal line and checkboxes. Prose, extra sections, and the tables or code blocks written underneath a task all reach the mirror, and task markers your project uses beyond [ ] and [x] — such as [~] — survive as written. Previously all of that was dropped silently and the push still reported success.
- **Fixed** — /spec-push now checks that Linear stored what it was sent and warns you if any text was lost, instead of reporting success on a mirror that quietly dropped characters. It compares the words and ignores the reformatting Linear normally applies, so it only speaks up when something is genuinely missing.
- **Fixed** — Tables written inside a numbered or bulleted list no longer lose characters when pushed to Linear. Linear's parser drops the first few characters of every data cell in a nested table, so they are now sent as a bullet list (or a code block when they have more than two columns), which Linear stores exactly as written. Your spec files are not changed.
- **Fixed** — Notes and sub-lists written under a task now appear in the Linear mirror as the bullets you wrote, never as extra tasks.
- **Fixed** — Notes written underneath a task in a spec phase no longer vanish from the Linear mirror — sub-bullets nested under a task are mirrored alongside it.
- **Fixed** — A task written with a numbered bold label like "**1. Schema additions**" now pushes to the tracker with a clean plain-text title instead of a broken "**1".
- **Fixed** — A checklist or heading shown as an example inside a code block in a spec is no longer mistaken for real content, so pushing to the tracker no longer creates phantom issues or mis-scoped descriptions.
- **Fixed** — Nested sub-tasks written under a task in a spec are no longer folded into their parent, so pushing to the tracker keeps every sub-task as its own issue instead of orphaning them or duplicating the parent.
- **Fixed** — A task whose wrapped text continues onto a line starting with -, *, + or a number is no longer truncated, so pushing it updates the existing Linear issue instead of creating a duplicate.
- **Fixed** — A bold, italic, or link span that wraps across two blockquote lines no longer pushes a stray `>` into the Linear project description.
- **Fixed** — Pushing a spec no longer overwrites a Linear project's priority or labels, and the phase list no longer appears twice in the mirror (once as prose, once as milestones).
- **Fixed** — Spec sync no longer corrupts bold, italic, or link text that wraps across a line break when it round-trips through the tracker, and a new spec-sanitise command repairs any spec files already affected.
- **Fixed** — Task bullets and phase goals that wrap across several lines now sync to Linear in full — issue titles and milestone descriptions no longer stop mid-sentence at the first line break, and pulling an edit back rewrites the whole bullet instead of stranding its continuation lines.
