---
linear_identifier: "SKS-329"
linear_url: "https://linear.app/skitterbyte/issue/SKS-329/preserve-the-original-report-and-notice-when-it-is-edited"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Preserve the original report, and notice when it is edited

> **Type:** Feature
> **Name:** feat-preserve-original-report (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-17)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-17
> **Area:** packages/linear/src/api.js, packages/linear/src/cli-sync.js, packages/linear/src/config.js, packages/sync-core/src/compare.js, packages/common/assets/skills/spec, packages/common/assets/skills/spec-bug, packages/common/assets/skills/spec-hotfix, packages/linear/assets/skills/spec-status, packages/linear/assets/skills/spec-push
> **Stack:** worktree

## Problem

When `/spec` adopts an existing Linear issue — one a PM or colleague filed, never
spec'd — the linking push **replaces** that issue's description with the spec's
generated prose (`buildDescription`, `normalize.js`). The reporter's own words
are gone from the issue, and the only thing standing between them and oblivion is
a line of skill prose asking the model to quote them in `## Problem`. Nothing
enforces it, nothing structures it, and the `/spec` skill's reassurance that
"Linear keeps the original in the issue's history" points at a diff viewer nobody
opens.

The mirror image is worse because it is silent. Once a spec is linked, a PM who
edits that issue's description — adding the detail the interrogation missed — has
their text overwritten on the next push with **no warning at all**.
`spec-sync status --remote` reports drift for `workflowState` and `assignee` and
says nothing about the description, so the loss is invisible until someone asks
why their paragraph vanished.

## Decisions

1. **The verbatim original is preserved as a Linear comment, posted once at adoption**,
   immediately before the linking push replaces the description. Chosen over a
   repo sidecar because a comment is non-destructive, is attributed and
   timestamped by Linear itself, and sits **outside the sync projection** —
   comments are already excluded from `sync.fieldOwnership` as Linear-native
   triage, so preserving one opens no sync loop and can never be clobbered by a
   later push.
2. **The repo stores no verbatim copy.** `## Problem` quotes the reporter as the
   skill already instructs, and that quote is pushed as part of the generated
   description, so the reporter's words are on the ticket and round-trip for
   free. Rejected: a `00-report.md` sidecar and a `linear_original` frontmatter
   block — both add a second copy of text that then needs its own drift story.
3. **No trailing `## Original report` section in the pushed description.** It was
   considered and dropped: the description is regenerated from the repo on every
   push, so a section with no repo source would appear on the linking push and
   vanish on the next one. Decision 2 puts the same words on the ticket through a
   mechanism that already round-trips.
4. **A description edited on Linear is detected, reported, and never blocked.**
   One-way sync's rule is about authority, and this reads to *check*, exactly as
   `verify.js` already does — it merges nothing and writes nothing back. The
   repo still wins on the next push; you simply stop losing text silently.
5. **Detection compares a `stream` hash, not the description hash.** Linear
   reserialises markdown on save (bullets rewritten, lists renumbered, table
   separators collapsed), so comparing `hashField(description)` against a
   read-back would accuse **every intact mirror**. `verify.js` `stream()` already
   reduces text to its word characters and discards precisely those transforms,
   so the snapshot gains `issueFields.descriptionStream` and the check compares
   that. No description text is stored and none reaches the conversation.
6. **The readout is hash-level.** The drift line says the description was edited
   and links the issue; it never pulls the text in. Same rule the diff page
   follows — you read it on Linear and decide.
7. **Every spec issue, not just adopted ones.** The overwrite is equally silent
   on a minted issue a PM later edits, and the check is one code path either way.
   No "how the link began" flag is recorded.
8. **A missing `descriptionStream` means _cannot tell_, and says nothing.** Every
   snapshot written before this spec lacks the field, so a check that read its
   absence as evidence would accuse every spec in every repo on the first run
   after upgrade. Same for a `--remote` file with no `description` key, and for a
   `description` that is not a string — the blind spot `compareStored` already
   documents. (`.claude/rules/negative-checks.md`.)
9. **Preserving ships on, with an opt-out** — `intake.preserveOriginal: false` in
   `linear.config.json`. Opt-in was rejected for the reason the `assignee`
   default records: a repo that never added the line would look identical to one
   that did not want the feature, and the only signal would be noticing a lost
   report weeks later.
10. **Idempotent by marker, not by counting.** The comment carries
    `skitterspec:original-report`; preserve lists the issue's comments, finds the
    marker, and does nothing. Re-running `/spec` on an adopted issue must not
    post a second copy.
11. **Sub-issue descriptions are out of scope.** Phase sub-issue bodies are
    generated from phase files and nobody edits them by hand; the spec issue is
    where a PM writes. Extending the stream hash to `subIssues` is a later
    decision, not a gap this spec leaves by accident.

## Solution overview

**Preserving.** A new engine verb
`spec-sync preserve <spec|ISSUE-REF> [--text <file>] [--json]`:

- On the **API** path it reads the issue itself (`readIssue`), so the original
  never passes through the model on this call.
- On the **MCP** path the engine is offline, so it composes and prints the
  comment body and the skill posts it with `save_comment` — the same split
  `--workspace-states` and `--stored` already use. `--text <file>` supplies the
  description the skill already read at intake.
- Either way it first looks for the marker among the issue's comments and exits
  saying it already ran.

The comment:

```
**Original report** — preserved before this issue became a spec.

The description below is now a generated mirror of `specs/backlog/<name>`.
Edit the spec, not this issue. This is what was filed:

---

<the description, verbatim>

<!-- skitterspec:original-report -->
```

**Detecting.** `snapshotOf` records one more per-field hash,
`issueFields.descriptionStream = hashField(stream(description))`. With a
`--remote` file carrying a string `description`,
`spec-sync status` compares `hashField(stream(remote.description))` against it
and emits one line:

```
  drift: SKS-41's description was edited on Linear since the last push
    (repo wins on next push — read it before pushing)
    https://linear.app/…/SKS-41
```

`apply` on the API path reads the issue before it writes anyway, so it emits the
same warning there and carries on. Neither blocks.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync preserve <spec\|REF> [--text <file>] [--json]` |
| CLI command | update | `spec-sync status --remote` gains a description-drift line |
| CLI command | update | `spec-sync apply` warns on a remotely-edited description (API path) |
| API adapter | add | `createComment(issueId, body)`, `listComments(issueId)` |
| Config key | add | `intake.preserveOriginal` (default `true`) |
| Snapshot | add | `issueFields.descriptionStream` in `*.base.json` |
| Skill/rule | update | `/spec`, `/spec-bug`, `/spec-hotfix` — preserve step in adoption |
| Skill/rule | update | `/spec-status`, `/spec-push` — pass `--remote`, relay the line |
| Skill/rule | update | CLAUDE.md, `spec-planning.md`, `linear.config.md` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Preserve the original as a Linear comment | ✅ | [01-preserve-engine.md](01-preserve-engine.md) |
| 2 | Wire preserve into the three adoption paths | ✅ | [02-adoption-skills.md](02-adoption-skills.md) |
| 3 | Detect a description edited on Linear | ✅ | [03-drift-detection.md](03-drift-detection.md) |
| 4 | Report the drift, and correct the docs | ⬜ | [04-report-and-docs.md](04-report-and-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created.
- 2026-09-17 — Phase 1: the HTML-comment marker was verified against real
  Linear (posted on SKS-329, read back unaltered, deleted) — it survives, so
  the visible-lead-in fallback stays as a second signal rather than becoming
  the primary one.
- 2026-09-17 — Phase 1 added an invariant the spec did not plan for: a test
  deriving every `spec-sync` subcommand from the dispatch and asserting the
  usage names it, with retired names allowlisted. The repo's own
  `docs-claims` test already demanded the same of `docs/linear.html`, so
  `preserve` was documented there in this phase rather than in phase 4.
- 2026-09-17 — Phase 2 corrected two assumptions in its own plan. The adoption
  prose is **one seam fragment** (`packages/linear/assets/seams/spec-tracker-intake.md`),
  not three skill files — `packages/skitterspec-linear/assets/` is a gitignored
  build output — so the three-file edit was one edit.
- 2026-09-17 — Phase 2: the "Linear keeps the original in the issue's history"
  claim had a second copy in `assets/core/linear.config.md`. An existing asset
  test pinned it, so removing it from the seam turned that test red; both copies
  are now replaced and the test asserts the new answer.
- 2026-09-17 — Phase 3: the drift helper landed in `compare.js` rather than
  `verify.js` — it asks a question about the snapshot, which `compare.js` owns —
  importing `stream` from `verify.js` instead of reimplementing the reduction.
  An empty description records a stream hash rather than omitting the key, so a
  pre-upgrade snapshot stays the only thing an absent key can mean.
