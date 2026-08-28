# Bug: Linear drops leading characters from tables nested in list items

> **Type:** Bug
> **Name:** bug-linear-nested-table-corruption (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-08-28)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-28
> **Area:** packages/sync-core (normalize, new tables + verify modules), packages/linear (cli-sync, spec-push skill)
> **Stack:** worktree

## Symptom

A markdown table nested inside a list item reaches Linear with characters
missing from every **data** cell. The header row is untouched. Nothing errors,
and the push reports success.

Reported from `ereqs` against 10.0.1, on a security-relevant table: the auth
header `X-Extraction-Key` was stored as `Extraction-Key`, and
`shared secret, from Key Vault` as `red secret, from Key Vault`. A reader
working from the mirror would send the wrong HTTP header.

## Root cause — measured, not assumed

Not skitterspec. The engine passes the table through **byte-identically**;
confirmed by running the reporter's exact input through `normalizeLocal` and
diffing the table lines. The corruption is in Linear's markdown parser, and
skitterspec is simply the thing feeding it.

The reporter's hypothesis — chars lost equals the *source* indent — is
**falsified**. Probe SKI-28 pushed the same 2-column table at several indents
and read it back:

| Source indent | Container | Stored at | Chars lost per data cell |
|---------------|-----------|-----------|--------------------------|
| 0 | none | 0 | 0 |
| 2 | ordered list | 0 | 0 |
| 3 | ordered list | 3 | 3 |
| 4 | ordered list | 3 | 3 |
| 6 | ordered list | 3 | 3 |
| 2 | bullet list | 2 | 2 |
| 4 | bullet list × 2 | 4 | 4 |

**Loss equals the list-content indent Linear renders at** — 3 per ordered-list
level, 2 per bullet level, whatever indent the source used. Each data cell loses
that many leading characters. A table at
source indent 2 inside an ordered list is *safe*, because CommonMark does not
place it inside the item and Linear emits it at column 0. Column-0 tables never
corrupt. Column count is irrelevant — a 3-column table loses 3 from all three
cells.

## Decisions

1. **Transform in the projection, never on disk.** `push` stays a pure
   generator: the repo's markdown is valid and renders correctly everywhere
   else, so no spec file is rewritten. The transform applies only to what is
   sent.
2. **2-column tables become a bullet list; everything else is fenced.** Both
   shapes were verified intact under nesting on SKI-28 — a bullet list at indent
   3 and a fenced block at indent 3 both round-tripped byte-identically. The
   2-column case is the key/value shape the reporter hit and the one they
   hand-repaired; a fence is character-exact for the rest at the cost of table
   rendering.
3. **The header row becomes the first bullet, bolded.** Dropping it would lose
   content and inventing a caption line would invent content. `| Header | Value |`
   → `* **Header** — **Value**`.
4. **Transform every indented table, safe ones included.** A source indent of 2
   inside an ordered list survives only by accident
   of CommonMark dedenting it out of the item. Depending on that accident to
   decide whether content is preserved is not a property worth having; being
   conservative costs table rendering on a few tables and never costs a
   character.
5. **Verification is the durable half, and it belongs in the skill.** The engine
   is offline by design, so `/spec-push` does the read-back over MCP and the
   engine supplies a pure comparator — the same split `--workspace-states`
   already uses. This catches the next parser quirk too, which the transform in
   Decision 2 cannot.
6. **Read-back to verify does not breach one-way sync.** "Never read remote
   content" is about *authority*: Linear must never influence repo content. The
   comparator reads to check and warn, merges nothing, and writes nothing back.
   Stated explicitly in the code so a later reader does not mistake it for a
   pull.
7. **Compare alphanumerics, but normalise list markers first.** The reporter's
   proposed "strip to alphanumerics and compare" would fire on their own listed
   benign reformat: Linear renumbers ordered lists, and digits are alphanumeric.
   Ordered markers are normalised to a placeholder so any number matches any
   number, while digits elsewhere — ports, versions, key lengths — stay
   significant. Checkbox marks are case-normalised specifically rather than
   lowercasing everything.
8. **Warn, never fail.** A corrupted round-trip is reported with the diverging
   text; the push still completes. The mirror is generated and disposable, and a
   hard failure mid-apply would leave it half-written.

## Impact map

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | add | `tables.js` — `flattenNestedTables(md)` in the projection |
| Engine | add | `verify.js` — pure sent-vs-stored comparator |
| Domain object | update | descriptions/goals containing a nested table change hash once |
| CLI | add | `spec-sync verify <spec> --stored <file>` |
| Skill | change | `/spec-push` reads back after apply and relays divergence |
| Docs | update | `linear.config.md`, `spec-push` skill, dist README |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Flatten nested tables in the projection | ✅ | [01-flatten-tables.md](01-flatten-tables.md) |
| 2 | Read-back verification | ✅ | [02-verify-round-trip.md](02-verify-round-trip.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-28 | In Progress | in-progress | Reuben Greaves |
| 2026-08-28 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-08-28 — Raised from an `ereqs` handoff. Confirmed the engine is not
  implicated (byte-identical passthrough) before treating it as ours to fix.
- 2026-08-28 — Probe SKI-28 falsified the reported indent-width hypothesis and
  established the container-indent rule in Root cause. The transform is
  unaffected by the correction; the reporter's proposed *detection* rule was
  the part that depended on it.
- 2026-08-28 — Dedent-to-column-0 is also loss-free and keeps table rendering,
  and the probe did not reproduce the ordered-list renumbering that argued
  against it. Not taken: it moves the table out of its list item, and the
  bullet form is what the reporter verified in production.
- 2026-08-28 — Phase 2: the reporter's proposed detection rule (reduce to
  alphanumerics and compare) was corrected — Linear renumbers ordered lists and
  digits are alphanumeric, so their own listed benign reformat would have fired
  the warning on every push. Ordered markers are normalised first; a regression
  test asserts renumbering stays quiet while a lost digit elsewhere does not.
- 2026-08-28 — Completed; both phases done, **631 tests green** (614 after
  Phase 1, 605 before). Verified both guards bite: disabling the flatten turns 5
  red, and reverting the comparator to the reporter's rule turns the renumbering
  test red. Nothing deferred.
