---
linear_issue_id: "SKS-169"
---

# Phase 2 — The page's verdict bar ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the page ends in a decision — three buttons, each copying the pass with
its verdict already set, and Approve visibly unavailable while a note is open.

## Tasks

- [x] Replace the single `Copy review` control with a verdict bar:
      **`✓ Approve`**, **`↺ Request changes`**, **`… Discuss first`**. Each builds
      the blob with its own verdict and copies it — one action per decision
      (Decision 7).
- [x] Disable Approve while any note is open, and **say why on the control**
      ("1 open note"), not in a tooltip nobody will hover on a phone. A disabled
      button with no stated reason reads as a broken page.
- [x] Re-enable it live as notes are removed or resolved, so the bar always
      describes the pass as it stands.
- [x] Keep the clipboard fallback for all three (`file://` is not a secure
      context everywhere), and keep the pending count visible so you can still see
      how much you are about to send.
- [x] Show the last decision from the sidecar's `decisions` log — "approved
      earlier · committed a1b2c3d" — as history beneath the bar. It explains why
      the page looks untouched after an approval.
- [x] Extend `assets-review.test.js`, driving the real page as phase 2 of
      `feat-review-round-trip` established: each button emits its verdict and the
      blob passes the **real** validator; Approve is disabled with an open note
      and enabled once it is gone; unaccepted files never disable it.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Nothing here is the guarantee — phase 1's engine refusal is. This phase is what
stops you making the mistake in the first place, which is a different job.
