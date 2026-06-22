---
name: spec-cancel
description: Cancel a spec — capture the reason, record final progress, stamp the reason on the spec header, then move it into specs/cancelled/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-cancel", "drop this spec", "we're not doing this spec", or "shelve <spec>".
---

# /spec-cancel — record, stamp a reason, archive a spec

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate it under `specs/` (any bucket — `backlog/`, `in-progress/`, …). Entry point
  is its `00-overview.md` (legacy specs may be a bare `<name>.md`).

## 2. Ask for the cancellation reason — required

Ask the user **why** it's being cancelled (e.g. superseded by X, descoped, no
longer needed, blocked indefinitely). Do not proceed without a reason; capture
it verbatim/condensed for the header.

## 3. Double-check and record progress

- Read the spec and reconcile task state with reality: tick anything that was
  actually completed before cancelling so the record is honest about what landed.
- Note any partial/abandoned work so it isn't mistaken for unstarted.

## 4. Stamp the spec

Update the **Status** header in the entry point so the reason is visible at the
top:

```
> **Status:** Cancelled (<YYYY-MM-DD>) — <reason>
```

Append a **State log** row:
`| <YYYY-MM-DD> | Cancelled | cancelled | <git user.name> |`.

Add a **Changelog** entry:
`- <YYYY-MM-DD> — Cancelled: <reason>.`

## 5. Move to cancelled

`mkdir -p specs/cancelled` then **`git mv`** the file or folder:
`git mv "specs/<bucket>/<name>" "specs/cancelled/<name>"` (preserve history;
move the whole folder).

If the spec was in `backlog`, **remove its row from `specs/backlog/00-index.md`**
(it has left the backlog). There is no index for `cancelled`.

## 6. Report

Confirm the cancellation, the reason recorded, and the new location. Do **not**
`git commit` unless the user asks.
