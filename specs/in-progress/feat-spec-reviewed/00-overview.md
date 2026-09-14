---
linear_identifier: "SKS-230"
linear_url: "https://linear.app/skitterbyte/issue/SKS-230/spec-reviewed-pick-up-the-review-you-just-approved"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# /spec-reviewed — pick up the review you just approved

> **Type:** Feature
> **Name:** feat-spec-reviewed (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/skills/spec-reviewed, packages/common/assets/skills/spec-init, packages/common/assets/rules/spec-planning.md, packages/common/assets/claude-md-section.md, packages/common/test, docs/index.html
> **Stack:** worktree

## Problem

`feat-claim-by-confirmation` left the round-trip one step short, and the operator
found it by using it: they pressed **✓ Approve** on their phone, came back to a
silent terminal, and had to *narrate* that they had approved before anything
happened. Twice. Their reading was blunt and correct — *"if it's NEVER going to
push back, that all feels pointless."*

Nothing pushes, and that stays true: a server that could reach into the session
is a far larger thing than the code was avoiding. But the offer currently only
arrives when something happens to render, so the operator's move is to describe
an action they already took — which is the worst of both worlds. They have done
the work and still have to explain themselves.

## Decisions

1. **A command of its own, not a check bolted onto `/spec-next`.** Folding it in
   would force the commit at a moment the operator did not choose — they may want
   another phase built before anything is committed, and `/spec-next` must keep
   doing exactly what it does. Their call, and the better one.
2. **User-only (`disable-model-invocation`), and that is the security
   mechanism.** `feat-claim-by-confirmation` made "never claim unasked" a rule in
   prose because nothing enforced it — and it had already been broken once. Here
   the harness enforces it: the model cannot invoke this skill, so the only way a
   pass gets picked up is that a person typed the command. Typing it **is** the
   human signal, and a device on the network cannot type.
3. **Bare resolves as every other bare command does** — the worktree you are
   standing in, else the sole provisioned spec. No new rule to learn.
4. **A name or a tracker id targets one spec** — `/spec-reviewed feat-orders`,
   `/spec-reviewed SKS-227`. The id form is a **provider seam**: the base knows
   nothing about tracker ids, and resolves one only when a provider's `linked`
   listing is there to answer.
5. **Targeting another spec from inside a worktree relocates, with permission.**
   The claim is harmless anywhere — the sidecar lives in the primary checkout —
   but what follows is not: an `approve` commits, and `changes` edits files, and
   both must happen in **that spec's** worktree. Rejected: *refusing unless you
   are on `main`*, which bans a legitimate case without removing the need to be
   in the right tree; and *acting remotely with `cd "<worktree>" &&` prefixes*,
   which is the two-trees pattern `/spec-next` needed `--record-primary` and
   `--assert-primary-clean` to make safe. Moving the session is simpler, is what
   `/spec-start` already does, and is reversible.
6. **An honoured `approve` commits**, through `review.commitWith` exactly as
   `/spec-diff` §2a does. That is what approve has meant since
   `feat-review-verdict` Decision 2, and one command taking you from "I approved
   on my phone" to a commit is the point. *(The one decision made without the
   operator answering — Decision 1's freedom is about building another phase
   before committing, which is a different question from committing a review you
   have already approved.)*
7. **Nothing waiting is an ordinary answer.** Say so and stop; do not treat an
   empty holding area as a problem, and do not go looking anywhere else.

## Solution overview

```
  phone ──Approve──▶ engine holds it

  you:  /spec-reviewed                 (bare — this worktree's spec)
        /spec-reviewed feat-orders     (by name)
        /spec-reviewed SKS-227         (by tracker id, if a provider is installed)

        ▶ 792969 · approve · 2 min ago
        ▶ "an approval is waiting, code 792969 — yours?"
        yes  ▶ claimed ▶ approve routes to review.commitWith ▶ outcome recorded
        no   ▶ left, and --drop offered

  naming a spec whose worktree is not where you stand:
        ▶ "feat-orders lives in ../repo-wt/orders — move there to carry on?"
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | add | `spec-reviewed` — user-only, bundled like every other |
| Skill | update | `spec-init` — name it among the lifecycle skills it ships |
| Rule/docs | update | `spec-planning.md` skill table, the CLAUDE.md section, the docs site |

_No engine change: `spec-env review` already lists what is waiting and claims by
code, and a provider's `linked` listing already answers id → spec._

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The command, bare | ⬜ | [01-the-command.md](01-the-command.md) |
| 2 | Targeting, and the relocation guard | ⬜ | [02-targeting.md](02-targeting.md) |

## Non-goals

- **Pushing.** Still. Nothing reaches into the session, and this spec is the
  answer to why that is liveable rather than an argument for changing it.
- **Claiming without confirmation.** "Exactly one waiting, so take it" is unsafe
  precisely when the operator sent nothing and the only pass is someone else's.
  The command is the go-ahead to *look*; the code is the go-ahead to *act*.
- **A second way to review.** This claims a pass that already exists. Rendering,
  marking and the written review all stay `/spec-diff`'s.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Spec created. The shape is the operator's: a command of its own
  rather than a check inside `/spec-next`, so a follow-up phase before committing
  stays possible. The user-only marking turned out to be load-bearing rather
  than cosmetic — it is what makes `feat-claim-by-confirmation`'s central rule
  enforced by the harness instead of by prose an agent has to remember.
