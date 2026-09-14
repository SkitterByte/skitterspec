---
linear_issue_id: "SKS-224"
---

# Phase 2 — Restart it, and say so ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a render that finds a stale server replaces it and reports what it did,
in one line, having lost nothing.

## Tasks

- [ ] On `stale`, stop and restart the server before rendering, so the URL that
      comes back is served by the current engine.
- [ ] **Keep the URL stable across the restart** where the token allows it — the
      operator is often holding the old link, and a silent token change reads as
      the page having gone. If the token must change, say so on the same line.
- [ ] Say it in one line: `the server was running engine 9.2.0; restarted on
      9.3.1`. Not a prompt, not a warning block — an action taken on someone's
      behalf, reported (Decision 2).
- [ ] **Carry pending passes across the restart.** They live on disk
      (`feat-review-post-back`, Decision 4), so this should already hold — assert
      it rather than assume it, and if that spec has not landed, record the
      constraint in its place.
- [ ] Never fatal: a restart that fails falls back to serving from the old
      process and says both things — that it is stale, and that it could not be
      replaced. A broken restart must not cost the reader the page.
- [ ] Do nothing on `current` and on `unknown` — no line, no action. The ordinary
      case must read exactly as it does today.
- [ ] Tests: a stale server is replaced and the new process reports the new
      engine; a failed restart leaves the old one serving and says so; `current`
      and `unknown` both change nothing and print nothing; a pending pass written
      before the restart is claimable after it.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The restart is cheap and the page is self-contained, so a reader mid-page loses
nothing — only a reload landing inside the restart window sees a gap. That is the
trade the operator accepted deliberately over a warning; it is recorded here so a
later reader does not mistake it for an oversight.
