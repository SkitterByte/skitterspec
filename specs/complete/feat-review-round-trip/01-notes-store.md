---
linear_issue_id: "SKS-158"
---

# Phase 1 — Notes store, content hashing and the lapse rule ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine can hash each changed file, ingest a page blob, merge it
into a versioned notes file, and report accepted / lapsed / commented state — with
no page change yet, proven entirely through the CLI.

## Tasks

- [x] Add `fileHashes(git, files)` to `env/review.js`: one batched
      `git hash-object -- <paths…>` per render, mapped back onto each file as
      `hash`. A deleted file records the sentinel `"(deleted)"`; a rename is a new
      path and therefore a new key (an accept does not follow a rename).
- [x] Add `reviewNotesPath(outPath)` beside `reviewUrlPath`, plus
      `readNotes`/`writeNotes`. Absent file → an empty `version: 1` document, not
      an error: no notes is the ordinary state.
- [x] Add `mergeNotes(existing, blob, now)` — a pure function. Accepts overwrite
      that path's `acceptedHash`/`acceptedAt`; comments are appended **by id** so
      a re-pasted blob is idempotent; everything not mentioned in the blob is
      carried through untouched (Decision 5).
- [x] Add `validateNotesBlob(raw)` — reject wrong `version`, a `spec` naming a
      different spec, or a malformed `accepted`/`comments` shape, with a message
      that says which. It refuses **wholesale**: a half-merged notes file is worse
      than a rejected paste.
- [x] Compute per-file review state in `collectReview`: `accepted` is `true` when
      the stored `acceptedHash` equals the file's current hash, `'lapsed'` when it
      differs, `false` when there is none. Attach that file's open and resolved
      comments.
- [x] Wire `--notes <file>` into `specEnvReview` and the `spec-env` flag parser,
      and into the usage line. It merges, then re-renders in the same call.
- [x] Surface it in `--json`: top-level `notesFile` and a `notes` total
      (`accepted`/`open`/`resolved`), and per file `hash`, `accepted`, `comments`.
      This is the agent's whole intake — it must be complete enough that reading
      the diff is never necessary (Decision 10).
- [x] Splice `hash`, `accepted` and `comments` into the page's data island so
      phase 2 has them (the page ignores them for now).
- [x] Add tests in `test/env-review.test.js` (or a sibling
      `env-review-notes.test.js`) covering: merge idempotence on a re-paste; an
      accept **surviving** a commit that moves the ref and a `working`→`branch`
      switch (Decision 2 — the regression this whole design exists to avoid); a
      lapse when content changes; an accept whose hash matches nothing recorded
      as given and rendered lapsed, not rejected; a malformed blob refused with
      nothing written.
- [x] Add the **stays-silent** case: a spec with no notes file renders and
      reports exactly as it does today — byte-identical `--json` but for the new
      keys, and no accusation anywhere (`.claude/rules/negative-checks.md`).
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

`git hash-object` is the hash rather than a crypto import: git already computes
it, it is stable across platforms, and it is the same identity git itself uses
for content. It reads the **working tree**, which is what an accept is about.

Three things were added that the task list did not name, each because building
it surfaced the gap:

- **`unaccepted` in the blob.** Un-ticking a file could not be expressed at all:
  merge-never-replace means absence from `accepted` reads as "not mentioned", so
  withdrawing an accept has to be its own explicit list.
- **A corrupt sidecar is a third state.** Rendering ignores it and says so;
  `--notes` **refuses**. Reading it as "no notes" and merging over it would
  destroy a whole review pass, which is exactly the asymmetry
  `.claude/rules/negative-checks.md` rule 4 is about.
- **The totals key is `unresolved`, not `open`.** `assets-spec-start-one-path`
  guards the CLI source against `\.open\b` (the removed opener), and `n.open`
  tripped it. `unresolved` pairs with `resolved` and is the better name anyway.
