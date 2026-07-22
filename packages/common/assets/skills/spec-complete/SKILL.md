---
name: spec-complete
description: Finish a spec — verify all phases are genuinely done, update progress, then move it into specs/complete/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-complete", "mark this spec done", or "this spec is complete".
---

# /spec-complete — verify, finalise, archive a spec

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/` (usually `specs/in-progress/`). Entry
  point is its `00-overview.md`; phases are separate files (`01-<slug>.md`, `02-…`)
  listed in its phase index (legacy specs may be a bare `<name>.md`).

## 2. Double-check progress — don't rubber-stamp

Before marking complete, confirm the work is actually finished:

- Read every phase file. For each **unchecked** task, check whether it is in fact
  done in the code — tick it (`- [x]`) if so, or surface it if not.
- Run the project's typecheck and test commands. The suite must be **green** to
  call a spec complete.
- For a **Bug** spec (`Type: Bug`), confirm the originally-failing test named in
  the spec now passes — that test is the proof the bug is fixed.
- If genuinely incomplete work remains, **stop and tell the user** rather than
  forcing completion. Offer to finish it (`/spec-go`) or to complete with the
  remaining items explicitly listed as deferred.

## 3. Update the spec

- Tick all completed tasks in the phase files; flip every finished phase-file
  heading **and** every row in the `00-overview.md` phase index to `✅`.
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
move the whole folder). The `specs/complete/` folder is the record of finished
specs — `git log`/the per-spec State log give the completion order.

## 5. Report

Confirm the move, the final test result, and list anything deferred. Do **not**
`git commit` unless the user asks.

## 6. Integrate onto the base branch (opt-in, only if isolated)

**Only when `specs/.core/env.config.json` exists and the spec is on a worktree**
(it was provisioned by `/spec-go`). Otherwise skip this entirely — a non-isolated
spec has nothing to land, and `/spec-complete` behaves exactly as before. When it
applies, offer to land the finished branch on the base branch so the work reaches
`main` (or your configured `baseBranch`) in one flow:

1. **Require a clean worktree.** The completion edits (status flip, the
   `git mv` to `complete/`) must be committed first — integrate refuses a dirty
   tree. If it's dirty, offer `/commit` and **stop**; don't auto-commit.
2. **Plan + execute.** Run `skitterspec spec-env integrate <name>` and run the
   printed commands **in order**:
   - `git -C <worktree> rebase <base>` — replay the branch onto base.
   - `git -C <mainRepoPath> merge --ff-only <branch>` — fast-forward base.
   On a **rebase conflict** (non-zero exit), run
   `git -C <worktree> rebase --abort`, relay the conflict, and **stop** — leave it
   to the user; do not offer teardown.
   On a **no-op** ("already landed"), just say so and continue.
3. **Re-test on base.** Run the project's test command from the primary checkout;
   it must be **green** before you call the landing done.
4. **Report** the landing (base branch, fast-forward result). It **never pushes** —
   mention the user can `git push` the base branch themselves.

## 7. Tear down the environment (opt-in, only if configured)

**Only when `specs/.core/env.config.json` exists**, offer — don't force — to
reclaim the finished spec's environment. On confirmation, run the `spec-env` CLI
directly (the old `/spec-env-down` skill is gone — teardown is folded in here):

1. **Disconnect the proxy if this spec is connected.** If `.spec-env/connected`
   names this spec, run `skitterspec spec-env connect main` first so the
   canonical ports go back to the primary checkout.
2. **Stop its host dev servers:** `skitterspec spec-env dev down <name>` (a
   no-op when none are running / configured).
3. **Remove worktree + stack + slot:** run `skitterspec spec-env down <name>`
   and execute the commands it prints, in order. Post-integrate the branch is
   merged into base, so teardown needs **no `--force`** and deletes the branch
   (`git branch -d`) as part of the plan. It still respects the guards (won't
   destroy a dirty or unpushed-and-unmerged worktree without `--force`).

If `env.config.json` is absent, skip this entirely — behave exactly as before.
