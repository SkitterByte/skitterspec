---
linear_issue_id: "SKS-231"
---

# Phase 1 — The command, bare ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** typing `/spec-reviewed` picks up the pass you just approved on your
phone — offered by code, claimed on your word, routed on its verdict — and the
model cannot type it.

## Tasks

- [x] Write `packages/common/assets/skills/spec-reviewed/SKILL.md`. Skills install
      by **discovery from the bundled tree** (`src/init.js`), so there is no list
      to add it to and no code change to make — the folder is the installation.
- [x] Mark it **`disable-model-invocation`**, and say in the body *why*: this is
      the enforcement of `feat-claim-by-confirmation`'s central rule. The model
      cannot invoke it, so a pass is only ever picked up because a person typed
      the command — which is the one channel a device on the network lacks.
- [x] Resolve bare exactly as every other bare command does: the worktree you are
      standing in, else the sole provisioned spec; several is a refusal that names
      them. Point at `spec-planning.md` rather than restating the rule.
- [x] Read what is waiting from `skitterspec spec-env review <spec>` — code,
      verdict, age. **Never open `.spec-env/reviews/<spec>.pending.json`**, for
      the reason `/spec-diff` step 0 gives at length.
- [x] Offer by **naming the code** and wait: *"an approval is waiting, code
      792969, sent 2 minutes ago — yours?"* Two or more waiting is a refusal to
      guess — name them all and ask which.
- [x] On a yes, claim it (`--claim <code>`) and route on the verdict exactly as
      `/spec-diff` §2 does — `approve` to §2a's hand-off, `changes` as the
      go-ahead, `discuss` reports and stops. **Do not restate that routing here:**
      point at it, so the two cannot drift.
- [x] On a no, leave it and offer `--drop <code>`.
- [x] Nothing waiting is an ordinary answer, not a problem: say so, mention that a
      `file://` page copies to the clipboard instead, and stop.
- [x] End with the report block (`.claude/rules/spec-reports.md`) and declare its
      fields, as every lifecycle skill does.
- [x] Update `spec-init`'s list of the lifecycle skills it ships, the
      `spec-planning.md` skill table (marking it user-only beside `/spec-status`
      and the rest), the CLAUDE.md section, and the docs site.
- [x] Keep the description inside the 500-char budget, with triggers that route
      the things an operator actually types — "I approved it", "I've reviewed it",
      "pick up my review".
- [x] Tests: the existing per-skill guards cover it once it ships (description
      present, within budget, report contract). Add: it is marked user-only; the
      prose forbids opening the pending store; it points at `/spec-diff`'s routing
      rather than restating it.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The description matters more than usual here. The operator's natural move after
pressing a button is to *say they pressed it* — "I approved it" — so that has to
route to this skill rather than to a conversation about approving.
