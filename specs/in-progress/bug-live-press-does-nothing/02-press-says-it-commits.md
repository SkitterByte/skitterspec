---
linear_issue_id: "SKS-347"
---

# Phase 2 — Say that the press commits ✅

> **Status:** Done

**Goal.** The live press performs a commit, so the button says so — and a page
where it cannot commit does not offer the button at all.

## Tasks

- [x] `ACTION_LABEL['live-on']` becomes `▶ Commit & put it live`
      (`packages/common/assets/review/page.html`). Matches `✓ Commit &
      Continue` in the verdict bar, and keeps the strip's `▶` prefix.
- [x] `surfacesFor` withholds the `live-on` action on a **midrun** button set:
      the row keeps its state and gets `command: '/spec-live'` instead, which is
      the same trade the strip already makes on a `file://` page
      (`packages/common/src/env/review.js`).
- [x] The midrun page therefore shows `live off /spec-live` — a command, no
      press — rather than a button guaranteed to be declined.
- [x] Sync into the two shipping packages (`npm run build`).
- [x] Tests: extend `packages/common/test/env-review-actions.test.js` — the
      default button set still offers the press; `midrun` offers the command and
      no action; the label asserted from the asset, as the other asset tests do.
- [x] Full suite + build green.

## Notes

**Why hide rather than refuse.** `/spec-diff` §2b is explicit that a mid-phase
page does not get the commit — half a phase split across two commits is a mess
nobody asked for. A control that can only ever be declined teaches the reader
that the buttons are decorative, which is the failure
`.claude/rules/spec-reports.md` records for the un-watched offer.

**The other two actions are untouched.** `allow-network` and `allow-remote`
write a config file and commit nothing, so they are as valid mid-phase as at the
end of one.
