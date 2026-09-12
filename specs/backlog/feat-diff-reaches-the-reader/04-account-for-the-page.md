---
linear_issue_id: "SKS-189"
---

# Phase 4 — Account for what publishing leaves behind ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a published page is never a silent survivor — teardown names it and
says where it is deleted, and nothing pretends to remove it.

## Tasks

- [ ] Teach `spec-env down` to read the spec's `.url` sidecar (through
      `readReviewUrl`, never by constructing the path) and, when one exists,
      print a dedicated section: the URL, that this tooling **cannot** remove it,
      and where it can be removed.
- [ ] **Delete nothing.** The local page, its `.notes.json` and its `.url` all
      survive teardown: the `.url` is the only record of what there is to delete,
      and the notes are the review record.
- [ ] Do not make it a confirmation or a refusal. It is a report — teardown still
      runs unattended, because an unremovable side effect must not gate a step
      that is otherwise automatic.
- [ ] Add the same one line to `/spec-diff` §6 where it reports a URL: this is
      yours now, skitterspec cannot remove it, and here is where it goes. Said
      once, at the moment the decision is being made.
- [ ] Tests (`packages/common/test/env-teardown-published.test.js`): a spec with
      a `.url` gets the section, with the URL in it; the plan's own commands are
      unchanged by its presence; and the sidecar files still exist after the
      printed commands run.
- [ ] **Stays-silent tests:** a spec that was never published gets **no** mention
      of publishing anywhere in the plan — an absence explained is noise, and
      most specs are never published; and the section never appears in the
      `run these:` batch, since there is no command to run.
- [ ] Run the project's test command — green before the phase is done.

## Notes

The evidence for this phase: when `feat-review-offer-lands` completed, its
worktree, branch and tracker assignment were all reclaimed and reported, while
its published page stayed up unmentioned — the only survivor nobody named. Its
`.url` is still in `.spec-env/reviews/` for a spec that exists nowhere else.
