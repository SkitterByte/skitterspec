---
linear_issue_id: "SKS-189"
---

# Phase 4 — Account for what publishing leaves behind ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a published page is never a silent survivor — teardown names it and
says where it is deleted, and nothing pretends to remove it.

## Tasks

- [x] Teach `spec-env down` to read the spec's `.url` sidecar (through
      `readReviewUrl`, never by constructing the path) and, when one exists,
      print a dedicated section: the URL, that this tooling **cannot** remove it,
      and where it can be removed.
- [x] **Delete nothing.** The local page, its `.notes.json` and its `.url` all
      survive teardown: the `.url` is the only record of what there is to delete,
      and the notes are the review record.
- [x] Do not make it a confirmation or a refusal. It is a report — teardown still
      runs unattended, because an unremovable side effect must not gate a step
      that is otherwise automatic.
- [x] Add the same one line to `/spec-diff` §6 where it reports a URL: this is
      yours now, skitterspec cannot remove it, and here is where it goes. Said
      once, at the moment the decision is being made.
- [x] Tests (`packages/common/test/env-teardown-published.test.js`): a spec with
      a `.url` gets the section, with the URL in it; the plan's own commands are
      unchanged by its presence; and the sidecar files still exist after the
      printed commands run.
- [x] **Stays-silent tests:** a spec that was never published gets **no** mention
      of publishing anywhere in the plan — an absence explained is noise, and
      most specs are never published; and the section never appears in the
      `run these:` batch, since there is no command to run.
- [x] Run the project's test command — green before the phase is done.

## Notes

The evidence for this phase: when `feat-review-offer-lands` completed, its
worktree, branch and tracker assignment were all reclaimed and reported, while
its published page stayed up unmentioned — the only survivor nobody named. Its
`.url` is still in `.spec-env/reviews/` for a spec that exists nowhere else.

## Outcome

Nine tests, all green (7 in `env-teardown-published.test.js`, 2 appended to
`assets-spec-diff.test.js`); full suite **1976 pass, 0 fail**.

`publishedPageNotice(url)` is pure — url in, lines out, `[]` when there is no
url — and both teardown paths push it: the worktree plan and the checkout plan,
because a published page outlives either and the two modes must not disagree
about what is left behind.

**Three properties, each with its own test.** It is reported *after* the
commands and never among them, since there is no command to run — removal is a
person opening `/artifacts`. It deletes nothing, because the `.url` is the only
record of what there is to delete. And the commands are byte-identical whether
or not a page was published, asserted by diffing the two plans rather than by
reading the code.

**Four of the nine are stays-silent**, which is the right proportion: most specs
are never published, and a teardown that explains publishing to all of them is
worse than one that says nothing.

`/spec-diff` §6 also gained the `--publish-copy` rule from phase 2, so the skill
stops describing a hand transform — with the reason attached, since a rendered
page of *this* project contains `<!doctype html>` as patch text.

**Still true in this repo:** `.spec-env/reviews/feat-review-offer-lands.url`
points at a live page for a spec whose worktree, branch and in-progress folder
are all gone. Its teardown said nothing. The next one will.
