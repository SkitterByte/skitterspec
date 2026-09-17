---
linear_issue_id: "SKS-338"
---

# Phase 4 — Skills, config docs, and the offer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a phase ending in a project that configured a reviewer renders a page
with its findings already on it, without anyone typing anything — and a project
that configured none sees no change at all, anywhere.

## Tasks

- [ ] `/spec-next` — in the render step, run reviewers before rendering:
      `skitterspec spec-env review <spec> --run-reviewers`. Say what it costs
      (the reviewer's latency, once, after tests are green) and that the diff
      still never passes through the model — findings come back as JSON, the
      patch does not.
- [ ] `/spec-next` report section — the banner's count line gains
      `· <n> flagged by <reviewer>` where any reviewer found something, and the
      outcome strip is the page's business rather than the block's. No new row,
      no new line: the counts slot already exists.
- [ ] `/spec-diff` — add `--reviewers` as the opt-in mid-phase run, and say
      plainly that it spends a review against whatever rate limit the reviewer
      has. Bare `/spec-diff` must not fire reviewers.
- [ ] `/spec` Phase C2 (`--docs` renders) — assert reviewers do **not** fire on a
      spec-document page. A prose diff is not what these tools read, and spending
      a review on one is waste. Add a test.
- [x] ~~`specs/.core/env.config.md` — document `review.reviewers`~~ — **done in
      phase 1.** `assets-published-docs.test.js` reads the `review.*` keys off
      `DEFAULT_CONFIG` and fails every claimant document until each is written
      up, so the key could not land without it. `env.config.md`,
      `env.config.json.example` and the base README all carry it, privacy
      paragraph included.
- [ ] Re-read that documentation once the page exists (phase 2) and the adapter
      ships (phase 3) — it describes behaviour those phases implement, and a
      doc written ahead of its code is the one most likely to drift.
- [ ] `.claude/rules/spec-planning.md` — a paragraph in the `/spec-diff` section:
      the page takes findings from configured reviewers as **checks**, they never
      gate, a reply promotes one to a comment which does, and the list is empty
      by default.
- [ ] `CLAUDE.md` — one or two sentences in the spec-workflow section, matching
      the existing voice.
- [ ] Confirm `skitterspec init` and `skitterspec update` add no reviewer and
      change no existing project's behaviour — a test asserting a freshly
      initialised project renders exactly as it does today.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**The absent-reviewer case is the one to test hardest.** Every project that
exists today has `reviewers: []`, so the whole feature's first obligation is to
be invisible: no outcome strip, no extra latency, no changed page bytes, no new
line in any report. A golden test over a rendered page with no reviewers
configured is the cheapest way to hold that.
