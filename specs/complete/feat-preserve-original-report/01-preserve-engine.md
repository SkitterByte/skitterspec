---
linear_issue_id: "SKS-330"
---

# Phase 1 — Preserve the original as a Linear comment ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync preserve` posts the issue's current description as a marked,
idempotent comment — proven by tests that cover the API path, the MCP path, the
already-preserved re-run, and the opt-out.

## Tasks

- [x] Add `createComment(issueId, body)` and `listComments(issueId)` to the API
      adapter in `packages/linear/src/api.js` (`commentCreate` mutation; a
      `comments { nodes { id body } }` selection on the issue query), following
      the existing `unwrap` and retry conventions.
- [x] Add `intake.preserveOriginal` to `DEFAULT_CONFIG` and `defaults()` in
      `packages/linear/src/config.js`, defaulting to `true`, parsed as a boolean.
- [x] Write the comment composer as a pure function — the marker
      `<!-- skitterspec:original-report -->`, the lead-in naming the spec folder,
      and the verbatim description — so it is testable without a network.
- [x] Add `specSyncPreserve` to `packages/linear/src/cli-sync.js` and route
      `preserve` in the subcommand table, with `--text <file>`, `--json` and the
      usage line the no-args listing prints.
- [x] API path: resolve the issue, list its comments, return early when the
      marker is present, otherwise read the description and post the comment.
- [x] MCP path: print the composed body and the instruction to check
      `list_comments` for the marker before calling `save_comment`, writing
      nothing. Accept `--text <file>` as the description source on this path.
- [x] Refuse nothing and exit 0 on every cannot-tell: `preserveOriginal` off, an
      issue that cannot be resolved, a description that is absent or not a
      string. Name each blind spot in a comment beside the check
      (`.claude/rules/negative-checks.md` rules 2 and 4).
- [x] Warn — do not refuse — when `readBase` finds a snapshot for this
      identifier: the description is already the generated mirror, so what would
      be captured is the spec rather than the original.
- [x] Add `packages/linear/test/cli-preserve.test.js` covering: posts the comment
      on the API path; the body carries the marker and the verbatim text; a
      second run with the marker already present posts nothing and exits 0; the
      MCP path writes nothing and prints a body; `preserveOriginal: false` does
      nothing and says nothing; a missing or non-string description stays silent.
- [x] Extend `packages/linear/test/cli-help.test.js` so `preserve` is asserted in
      the subcommand listing — routing and documentation land in the same edit.
- [x] Run `node --test` from the repo root — green before the phase is done.

## Notes

The marker is an HTML comment because it should not be visible in the rendered
comment. **Verified against real Linear** on 2026-09-17 — posted on SKS-329,
listed back byte-for-byte, then deleted. Linear reserialises markdown on save
but leaves an HTML comment alone, so no fallback was needed.

The visible lead-in is kept as a second signal regardless: `originalPreserved`
matches either, so a Linear that starts stripping HTML comments degrades to a
duplicate comment rather than to a lost original.
