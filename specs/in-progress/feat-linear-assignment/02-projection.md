---
linear_issue_id: "SKS-111"
---

# Phase 2 — Push the assignee as a projection field ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** with `sync.fieldOwnership.assignee: "push"` set, a spec carrying
`linear_assignee_id` assigns its Linear issue while live and releases it at
complete/cancelled — and every spec without one is left exactly as it is.

## Tasks

- [ ] `config.js`: allow `assignee` in `sync.fieldOwnership` (the loader already
      merges unknown keys forward; add the doc comment and the `both|pull|push`
      validation coverage). Leave it **out** of `DEFAULT_CONFIG` — absent is the
      opt-out and the default.
- [ ] `normalize.js`: read `linear_assignee_id` and `linear_assignee_name` from
      the overview frontmatter into the local snapshot, beside `linear_identifier`.
- [ ] `push.js` `projectionOf`: add `assignee`, derived from the bucket — the
      recorded id in `backlog`/`in-progress`, `null` in `complete`/`cancelled`.
      Gate the whole field on `fieldOwnership.assignee` being present; with it
      absent the projection must not carry the key at all.
- [ ] `compare.js`: add `assignee` to `specIssueFieldHashes` and emit an assignee
      op **only** when there is a value to assert or a previously-pushed assignee
      to retract. A snapshot with **no** `assignee` key is "never pushed", not
      "was null" — see the comment task below.
- [ ] Write the blind-spot comment beside that check, naming what would fool it:
      every spec linked before this feature has a snapshot with no `assignee`
      key, and reading that absence as `null` emits a clear against all of them.
- [ ] `api.js`: send `assigneeId` on `issueUpdate` (and `issueCreate` where the
      plan carries one); `null` clears. `mcp.js` / the apply path: same field on
      `save_issue`.
- [ ] `cli-sync.js` `apply`: carry the assignee op through to whichever adapter
      is in play, and include it in the read-back verify.
- [ ] `spec-sync status`: add one drift line when Linear's assignee differs from
      the spec's — phrased like the existing workflow-state line ("repo wins on
      next push"), and omitted entirely when the field is not opted in.
- [ ] Add tests: assign on an in-progress spec; clear on `complete` and
      `cancelled`; the op is idempotent (second push is empty); `--json` plan
      shape; the API and MCP apply paths both send the field; status drift line
      present and absent.
- [ ] **Stays-silent tests**, one per way this could accuse the innocent: (a) an
      existing linked spec with a pre-feature snapshot and no recorded assignee
      pushes an **empty** plan; (b) with `fieldOwnership.assignee` absent, a spec
      that *does* carry `linear_assignee_id` still pushes nothing; (c) a backlog
      issue assigned by a PM in Linear, on a spec with no recorded assignee, is
      not cleared and is not reported as drift.
- [ ] Run `npm test` — green before the phase is done.

## Notes

`specIssueFieldHashes` splits `description` from `state` precisely so the two can
have different owners once a spec finishes. Assignee is a third such field with a
third owner story, so it belongs there rather than welded into the combined
`specIssueHash` — which stays untouched for snapshots written by older CLIs.
