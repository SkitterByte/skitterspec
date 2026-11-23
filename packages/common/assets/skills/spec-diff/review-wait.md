# The review banner and the wait

Read this before rendering a review banner or waiting for a verdict, from any
skill. The report block itself is in `.claude/rules/spec-reports.md`.

## The banner

Use it only where the run is **waiting** on a verdict. It follows the block, and
the block then has no `Review` row:

---

## ⏸ Review ready — 7 files, +212 −18

- **local** — [http://127.0.0.1:7760/7e9e123e7540/feat-orders](http://127.0.0.1:7760/7e9e123e7540/feat-orders)
- **network** — [http://192.168.0.136:7760/7e9e123e7540/feat-orders](http://192.168.0.136:7760/7e9e123e7540/feat-orders)
- **remote** — [http://100.126.111.34:7760/7e9e123e7540/feat-orders](http://100.126.111.34:7760/7e9e123e7540/feat-orders) (tailnet)

live: off — /spec-live to put it live

I'm holding here until you send a verdict — the wait covers local, network and remote.

`/spec-reviewed` picks it up · `spec-env review skip "<reason>"` moves on

---

It has a rule above and below, a heading with the state and the size, the
stack, the `live:` line, one holding line, and the exits. Nothing else, and no
explanatory paragraph. A skill may name different exits (`/spec`'s page offers
`Commit & Start` · `Commit`).

## The stack: copy it, never compose it

`spec-env review` prints one line per tier, and `--json` carries the same lines
as `tiers`. **Three tiers, always all three, in this order**, named by address,
never by where the reader is:

| Tier | Is | Off when |
|------|----|----------|
| `local` | the loopback URL on this machine | never. With nothing served it is the `file://` page, which cannot send a verdict |
| `network` | the LAN URL, for a phone on the same wifi | `review.allowNetwork` is false, or the machine has no network address |
| `remote` | the tailnet URL, labelled `(tailnet)` | whenever `network` is off; or the machine has no tailnet address |

A tier that is off **keeps its line**, naming the one command that turns it on,
or why nothing can. **One link per door, each labelled, all into one store**:
the page POSTs to its own URL, so every tier reaches the same server and the
same pending store. **Still forbidden**: links into **different** stores
without saying which one the wait is watching, and two unlabelled links.

**The one exception is the engine's, not yours.** It hides `local` when the
reader is on another machine (`SKITTERSPEC_READER=remote`, `review.reader`,
ssh, or a Windows session with no `SESSIONNAME`), and only when `network` has a
URL to take its place. A tier marked `hidden` in `--json` is absent from the
printed stack, so leave it out too.

An `also:` line under a tier is an alternate address. Relay it as an indented
sub-bullet under that tier, with its label. Never pick one link for the reader,
and never relay the bare `page:` path.

The same applies whenever you relay engine output that carries a stack, inside
a skill or not (`epic status`, `resolve`).

**`live:`** is the engine's line, copied as printed: `on` (with a URL where
configured), `off` or `held` (naming the holder). When the engine prints none,
leave it out.

**The holding line** names the tiers the engine's `covers` lists. All tiers
reach one server and one pending store, so one wait covers them all.

**The findings count**, where a reviewer reported findings, joins the heading's
counts (`7 files, +212 −18, 3 flagged by coderabbit`). Nothing else about
reviewers goes in the banner.

## The wait

**The wait is the engine's command. Do not write one.**

1. Note the moment you start waiting, as an ISO timestamp.
2. Run `skitterspec spec-env review wait <spec> --since <timestamp>` under the
   harness's persistent watch primitive where it has one (Claude Code:
   `Monitor` with `persistent: true`, stopped by `TaskStop`), otherwise in the
   background. **Pass no timeout.** Then end the turn.
3. On waking, run
   `skitterspec spec-env review <spec> --claim-since <timestamp> --json`. It
   claims the one pass that arrived in the window, acts on nothing when none
   did, and refuses to choose when two did.
4. Route on the verdict as the skill describes.

**Only promise a wait the transport can deliver:**

- **A served page**: *"I'm holding here until you send a verdict."* It is
  only true for as long as the wait is actually running.
- **A `file://` page**: there is no server, so start no watch. The turn ending
  is the wait: *"I'm holding here — paste the pass when you have it."*
- **A harness with no background watch**: the turn ending is the wait. You still
  wait.

## A watch that dies

If the wait ends **without a verdict** and the operator did not stop it,
re-arm it on the **same** `--since`. A pass that arrived during the gap is still
in the window. A deliberate stop has positive evidence: this session called
TaskStop, or the operator said to stop. A bare killed-task notification is a
death, not a stop.

- **Say as little as possible.** Where the harness requires visible text, write
  only `Still waiting for the verdict.`. Answer the wait's own start line the
  same way.
- **Every fifth re-arm**, the wait prints `re-show: banner (re-arm N)` and the
  stack. Relay the run's verdict line (copied if still in context, dropped if
  not) and then the banner in its current state, with the stack from the
  `re-show:` lines. Do not repeat the table.
- **Stop re-arming once the window is 12 hours old.** From then on the holding
  line becomes: *press a verdict, then type `/spec-reviewed` — I cannot see it
  until you do.*

## Mid-run renders: `Continue`

A page rendered part-way through a run (`--buttons midrun`) offers `Continue`
in place of the committing verdicts. Its banner keeps the same heading and
stack, and these exits:

`Continue` carries on · `Request changes` works them now

`Continue` resumes the run and never commits. It never clears a gate that a
finished phase armed: only a committing verdict or a recorded skip clears one.
A mid-run render waits without arming anything.

## The `Review` row, when not waiting

A render the run is not held on (a mid-phase `/spec-diff`, a page produced
alongside other work) gets the `Review` row instead: the counts and every tier,
and no question. Never use both the row and the banner.
