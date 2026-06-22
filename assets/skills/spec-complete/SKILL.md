---
name: spec-complete
description: Finish a spec — verify all phases are genuinely done, update progress, then move it into specs/complete/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-complete", "mark this spec done", or "this spec is complete".
---

# /spec-complete — verify, finalise, archive a spec

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/` (usually `specs/in-progress/`). Entry
  point is its `00-overview.md` (legacy specs may be a bare
  `<name>.md`).

## 2. Double-check progress — don't rubber-stamp

Before marking complete, confirm the work is actually finished:

- Read every phase. For each **unchecked** task, check whether it is in fact
  done in the code — tick it (`- [x]`) if so, or surface it if not.
- Run the project's typecheck and test commands. The suite must be **green** to
  call a spec complete.
- For a **Bug** spec (`Type: Bug`), confirm the originally-failing test named in
  the spec now passes — that test is the proof the bug is fixed.
- If genuinely incomplete work remains, **stop and tell the user** rather than
  forcing completion. Offer to finish it (`/spec-go`) or to complete with the
  remaining items explicitly listed as deferred.

## 3. Update the spec

- Tick all completed tasks; flip every finished phase heading to `✅`.
- Set the **Status** header in the entry point:
  `> **Status:** Complete (<YYYY-MM-DD>)`.
- Append a **State log** row:
  `| <YYYY-MM-DD> | Complete | complete | <git user.name> |`.
- Add a **Changelog** entry:
  `- <YYYY-MM-DD> — Completed; all phases done, tests green.`
  (Note any consciously-deferred items here too.)

## 4. Move to complete

`mkdir -p specs/complete` then **`git mv`** the file or folder:
`git mv "specs/in-progress/<name>" "specs/complete/<name>"` (preserve history;
move the whole folder).

Then **prepend a row to `specs/complete/00-index.md`** (newest first — directly under
the table header, above existing rows):

```
| <YYYY-MM-DD> | <name> | Feature|Bug |
```

This is the append-only completion log used to find the latest completed specs.

## 5. Report

Confirm the move, the final test result, and list anything deferred. Do **not**
`git commit` unless the user asks.
