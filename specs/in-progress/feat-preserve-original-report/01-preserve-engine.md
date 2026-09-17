---
linear_issue_id: "SKS-330"
---

# Phase 1 — Preserve the original as a Linear comment ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync preserve` posts the issue's current description as a marked,
idempotent comment — proven by tests that cover the API path, the MCP path, the
already-preserved re-run, and the opt-out.

## Tasks

- [ ] Add `createComment(issueId, body)` and `listComments(issueId)` to the API
      adapter in `packages/linear/src/api.js` (`commentCreate` mutation; a
      `comments { nodes { id body } }` selection on the issue query), following
      the existing `unwrap` and retry conventions.
- [ ] Add `intake.preserveOriginal` to `DEFAULT_CONFIG` and `defaults()` in
      `packages/linear/src/config.js`, defaulting to `true`, parsed as a boolean.
- [ ] Write the comment composer as a pure function — the marker
      `<!-- skitterspec:original-report -->`, the lead-in naming the spec folder,
      and the verbatim description — so it is testable without a network.
- [ ] Add `specSyncPreserve` to `packages/linear/src/cli-sync.js` and route
      `preserve` in the subcommand table, with `--text <file>`, `--json` and the
      usage line the no-args listing prints.
- [ ] API path: resolve the issue, list its comments, return early when the
      marker is present, otherwise read the description and post the comment.
- [ ] MCP path: print the composed body and the instruction to check
      `list_comments` for the marker before calling `save_comment`, writing
      nothing. Accept `--text <file>` as the description source on this path.
- [ ] Refuse nothing and exit 0 on every cannot-tell: `preserveOriginal` off, an
      issue that cannot be resolved, a description that is absent or not a
      string. Name each blind spot in a comment beside the check
      (`.claude/rules/negative-checks.md` rules 2 and 4).
- [ ] Warn — do not refuse — when `readBase` finds a snapshot for this
      identifier: the description is already the generated mirror, so what would
      be captured is the spec rather than the original.
- [ ] Add `packages/linear/test/cli-preserve.test.js` covering: posts the comment
      on the API path; the body carries the marker and the verbatim text; a
      second run with the marker already present posts nothing and exits 0; the
      MCP path writes nothing and prints a body; `preserveOriginal: false` does
      nothing and says nothing; a missing or non-string description stays silent.
- [ ] Extend `packages/linear/test/cli-help.test.js` so `preserve` is asserted in
      the subcommand listing — routing and documentation land in the same edit.
- [ ] Run `node --test` from the repo root — green before the phase is done.

## Notes

The marker is an HTML comment because it should not be visible in the rendered
comment. **Verify it survives Linear's save** during this phase; if Linear strips
it, fall back to matching the literal `**Original report**` lead-in and record
the change in the Changelog. It is a real unknown with a cheap answer, so it is a
task rather than an open question.
