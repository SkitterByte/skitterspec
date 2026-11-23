# Offered Unblocks

A refusal says what is wrong. Where the engine also declares what would fix it,
a skill may offer that fix instead of leaving the operator at a dead end. This
file is the whole contract.

## The engine declares; the skill relays

An offer is a field on a refusal:

```json
{
  "blocked": true,
  "reason": "feat-x's worktree has uncommitted changes — commit or stash them…",
  "offer": { "kind": "satisfy", "label": "Commit first, then go live", "command": "/commit" }
}
```

Text output carries the same offer as an `offer:` line under the refusal.

**Absent stays absent.** Most refusals carry no offer. Then relay the refusal
and stop. **Never infer one.** If the engine did not declare an offer, there is
none, however obvious the fix looks.
Work that is not the operator's is never offered up: a live workbench another
spec holds declares nothing.

## Two kinds

| `kind` | Means | Recorded |
|--------|-------|----------|
| `satisfy` | do what the guard asked for | no — nothing was weakened |
| `bypass` | step past a guard still unsatisfied | **yes** |

## Relay first, then offer

Relay the refusal first, never instead of it. Then, only where `offer` is
present, put **two** options to the operator: the offer's `label`, shown
verbatim, and Cancel. Never reword it, never pre-select it,
and never add a third option.

- **`satisfy`**: run the command, then retry the original operation.
- **`bypass`**: run the command, then carry on.
- **Cancel**: stop, and record nothing.

### A worked `satisfy`: the gap between release branches

Under `baseBranchPattern`, the gap between release branches refuses with:

```json
{
  "blocked": true,
  "reason": "no branch matches 20??/Q? — run spec-env base to fetch",
  "offer": { "kind": "satisfy", "label": "Use master as the base for now", "command": "skitterspec spec-env base --use-fallback" }
}
```

Run the command, then retry the command that refused.

## A bypass is offered once per obligation

Spend the offer by recording it **when you raise the picker**, for example
`skitterspec spec-env review gate <spec> --offered`. After that the engine
declares no offer for the same arming. It counts as spent once it is raised,
even if declined. **Do not spend it by reading**: `review gate --json` on every
`/spec-next` run spends nothing.

## What this is not

- **Not a `--force`.** A reasonless lift was rejected, because it is
  indistinguishable from nobody having looked.
- **Not a replacement for the refusal.** It is a
  layer on top of a guard and never the guard itself. The engine and the hooks
  keep refusing regardless.

A bypass survives the rule that Claude must not lift a guard aimed at Claude
only because three things hold together:

1. **The operator answers.** Claude may raise the question but never answer it.
2. **The choice is recorded.**
3. **It is offered once.**

Remove any one of those and the objection returns.

---

Rationale and the rejected alternatives:
[docs/rationale/offered-unblocks.md](https://github.com/SkitterByte/skitterspec/blob/main/docs/rationale/offered-unblocks.md).
