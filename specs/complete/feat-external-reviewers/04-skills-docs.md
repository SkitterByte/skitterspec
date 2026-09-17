---
linear_issue_id: "SKS-338"
---

# Phase 4 — Skills, config docs, and the offer ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a phase ending in a project that configured a reviewer renders a page
with its findings already on it, without anyone typing anything — and a project
that configured none sees no change at all, anywhere.

## Tasks

- [x] `/spec-next` — in the render step, run reviewers before rendering:
      `skitterspec spec-env review <spec> --run-reviewers`. Say what it costs
      (the reviewer's latency, once, after tests are green) and that the diff
      still never passes through the model — findings come back as JSON, the
      patch does not.
- [x] `/spec-next` report section — the banner's count line gains
      `· <n> flagged by <reviewer>` where any reviewer found something, and the
      outcome strip is the page's business rather than the block's. No new row,
      no new line: the counts slot already exists.
- [x] `/spec-diff` — add `--reviewers` as the opt-in mid-phase run, and say
      plainly that it spends a review against whatever rate limit the reviewer
      has. Bare `/spec-diff` must not fire reviewers.
- [x] `/spec` Phase C2 (`--docs` renders) — assert reviewers do **not** fire on a
      spec-document page. A prose diff is not what these tools read, and spending
      a review on one is waste. Add a test.
- [x] ~~`specs/.core/env.config.md` — document `review.reviewers`~~ — **done in
      phase 1.** `assets-published-docs.test.js` reads the `review.*` keys off
      `DEFAULT_CONFIG` and fails every claimant document until each is written
      up, so the key could not land without it. `env.config.md`,
      `env.config.json.example` and the base README all carry it, privacy
      paragraph included.
- [x] Re-read that documentation once the page exists (phase 2) and the adapter
      ships (phase 3) — it describes behaviour those phases implement, and a
      doc written ahead of its code is the one most likely to drift.
- [x] `.claude/rules/spec-planning.md` — a paragraph in the `/spec-diff` section:
      the page takes findings from configured reviewers as **checks**, they never
      gate, a reply promotes one to a comment which does, and the list is empty
      by default.
- [x] `CLAUDE.md` — one or two sentences in the spec-workflow section, matching
      the existing voice.
- [x] Confirm `skitterspec init` and `skitterspec update` add no reviewer and
      change no existing project's behaviour — a test asserting a freshly
      initialised project renders exactly as it does today.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**The absent-reviewer case is the one to test hardest.** Every project that
exists today has `reviewers: []`, so the whole feature's first obligation is to
be invisible: no outcome strip, no extra latency, no changed page bytes, no new
line in any report. A golden test over a rendered page with no reviewers
configured is the cheapest way to hold that.

## What this phase found

**`/spec-diff`'s description was already near its 500-character budget**, and
`scripts/skill-budget.test.js` refused the addition at 556. The fix was to fold
`--reviewers` into an existing clause rather than append a sentence, which cost
the trigger phrase *"wants to read a worktree's changes away from the
terminal"* — covered well enough by *"show me the diff"*. The budget is a real
constraint on this surface, not a formality: every description is loaded every
session.

**The prose rules caught a `**bold**` span across a line break** in
`spec-planning.md` — the one shipped-prose rule that is enforced rather than
asked for.

**This repo's own `CLAUDE.md` is stale against the shipped asset.** The section
was updated in `assets/claude-md-section.md`, which is what `init`/`update`
patch into a project — but the repo's own copy is several specs behind it
(missing `commit-start`, the `▶ Put it live` line, and the tier stack). It was
left alone deliberately: re-syncing it here would sweep three other specs' text
into this spec's commit, under this spec's ticket. Recorded as a follow-up.

**One full-suite run failed on `env-review-reader.test.js`'s daemon-replacement
test and passed on every run since**, including three in isolation. It stands a
real server up on a real port, so it is load-sensitive rather than broken by
anything here — recorded as a follow-up rather than chased, since nothing this
phase touched can reach it.
