---
linear_identifier: "SKS-285"
linear_url: "https://linear.app/skitterbyte/issue/SKS-285/assignment-on-by-default-and-an-ownership-value-that-can-decline"
---

# Assignment on by default, and an ownership value that can decline

> **Type:** Feature
> **Name:** feat-assignment-on-by-default (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-16
> **Area:** packages/linear/src/config.js, packages/linear/src/cli-sync.js, packages/linear/src/doctor.js, packages/sync-core/src/normalize.js, packages/linear/assets/, MIGRATION.md
> **Stack:** worktree

## Problem

Assignment is opt-in via `sync.fieldOwnership.assignee`, and the cost of it
being off is silent. Three of this author's own repos are configured; one opted
in. `ereqs` ran for months with `identity skipped — assignment not enabled`
visible only to anyone who happened to run `spec-sync doctor`, and the gap was
noticed by wondering why a Linear issue had nobody on it.

Underneath that, `spec-sync assign` makes a claim that is not true. It does not
check `fieldOwnership` at all: in an un-opted-in repo it stamps
`linear_assignee_id` into the frontmatter and prints
`next: push it, so Linear agrees` — and the push then drops the field, because
`toFieldSet` (`normalize.js:495`) only copies keys the config lists. `/spec-claim`
guards this in prose; the engine beneath it asserts the opposite. That is the
shape `.claude/rules/negative-checks.md` exists for, inverted: not a check that
accuses wrongly, but an assertion that quietly fails.

Turning the default on fixes the first half and sharpens the second — a
default-on field needs a way to say no, and `OWNERSHIP` (`config.js:39`) is
`both|pull|push` with no value meaning "not owned".

## Decisions

1. **One spec, three phases**, because the two halves are coupled through the
   opt-out. Today the guard's question is *"is `assignee` a key in
   `fieldOwnership`?"*; after the flip the key is always present and the
   **value** decides. Writing the guard first against the old shape would mean
   rewriting it.
2. **`none` joins the `OWNERSHIP` enum** — `"assignee": "none"` means the repo
   does not own the field. *Rejected:* a dedicated `sync.assign: false`, which
   invents a second place ownership is decided and is what
   `feat-linear-assignment` decision 8 already rejected for this field;
   *rejected:* `"assignee": null` as a delete, since null-as-delete is invisible
   in the enum and a typo (`"nul"`) throws rather than opting out.
3. **The test is the value, never the key's presence.** `toFieldSet` skips a
   `none` field, so `projection.assignee` stays `undefined` — which every
   downstream reader already treats as "not in play" (`compare.js:71`,
   `cli-sync.js:621`). That is what makes this one change rather than five.
4. **`none` is general, not assignee-specific.** Any field may decline
   ownership. Costs nothing: it falls out of decision 3.
5. **`spec-sync assign` refuses when the field is not owned**, joining the
   existing `problems` list in `specSyncAssign` so the refusal shape, wording
   and exit code are the ones already there. A positive signal replaces an
   assertion that silently fails.
6. **`--release` refuses too, uniformly.** *Rejected:* allowing it as the
   cleanup direction — it would leave one command in this function acting on a
   field the repo declares it does not own, and the stale stamp it would clear
   is inert anyway. The message names the opt-out, so the exit is one config
   line.
7. **The default flips to `assignee: 'push'`**, and it is safe by construction.
   `feat-linear-assignment` decision 6 (an unset stamp sends nothing) means no
   existing Linear assignment is clobbered; decision 9 (an absent snapshot key
   means "never pushed") means no upgrade emits a clear. Only specs started
   **after** the upgrade are assigned.
8. **`--assign` is removed and `--no-assign` replaces it.** A flag whose meaning
   the flip inverts, kept as a silent no-op, is the record-and-do-nothing shape
   this project is against — and `cli-unknown-flag.test.js` shows an unknown
   flag already fails loudly, so removal is a clear error rather than a quiet
   one.
9. **`/spec-linear-setup` step 7b inverts** — it asks whether to turn assignment
   *off*, and writes only when the answer is yes.
10. **MIGRATION.md is the whole announcement**, under a `v15 → v16` heading.
    *Rejected:* a one-time runtime advisory, which needs persistent
    already-told-you state (the `flushManifest` seed trick from SKS-277) — real
    machinery for a cosmetic field; *rejected:* naming the off switch on every
    assign, which is a line of noise forever.
11. **An explicit `"assignee": "push"` in an existing config stays valid and is
    never rewritten.** It becomes redundant, and the config file is the user's.
12. **Every phase carries a stays-silent test** (`.claude/rules/negative-checks.md`
    rule 3): a healthy, unusual-but-fine input that must produce no refusal and
    no output.

## Solution overview

* `config.js` — `OWNERSHIP` gains `'none'`; `DEFAULT_CONFIG.sync.fieldOwnership`
  gains `assignee: 'push'`. `mergeFieldOwnership` needs no change — it validates
  against the enum and assigns.
* `normalize.js` — `toFieldSet` skips any field whose ownership is `none`, so
  the projection omits the key entirely rather than carrying a null.
* `cli-sync.js` — `specSyncAssign` gains an ownership check in its `problems`
  list, covering both `--to` and `--release`; the doctor state-gather at
  `cli-sync.js:1027` keys on the value; `init-config` swaps `--assign` for
  `--no-assign`.
* `doctor.js` — the `identity` row's skip reason names the value, not the
  missing key.
* Assets — `/spec-claim`'s opt-in paragraph, the three assignment seams, and
  `linear.config.md` / `SETUP.md` / `linear.config.json.example`.

This is a breaking change to `@skitterbyte/skitterspec-linear`: **v15 → v16**.
All code lives in `packages/linear/` and `packages/sync-core/`;
`packages/skitterspec-linear/src/` is gitignored build output and is never
edited by hand.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `sync.fieldOwnership.<field>: "none"` |
| Config key | update | `sync.fieldOwnership.assignee` now defaults to `push` |
| CLI command | update | `spec-sync assign` refuses when assignee is not owned |
| CLI command | update | `spec-sync init-config`: `--assign` removed, `--no-assign` added |
| CLI output | update | `doctor` identity row's skip reason names the value |
| Module API | update | `toFieldSet` omits fields owned `none` |
| Skill/rule | update | `/spec-linear-setup` 7b inverts; `/spec-claim` opt-in wording; 3 seams |
| Docs | update | MIGRATION.md `v15 → v16`; `linear.config.md`, `SETUP.md`, the example config |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `none` is a first-class ownership value | ⬜ | [01-ownership-none.md](01-ownership-none.md) |
| 2 | `spec-sync assign` refuses what it cannot push | ⬜ | [02-assign-guard.md](02-assign-guard.md) |
| 3 | Flip the default, invert the setup, write the migration | ⬜ | [03-flip-the-default.md](03-flip-the-default.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created.
