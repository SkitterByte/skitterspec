---
linear_issue_id: "SKS-113"
---

# Phase 4 — `/spec-claim` — take, release, hand over ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a spec's ownership can be taken, handed back, or given to a named
teammate in one command, with the repo and Linear agreeing afterwards.

## Tasks

- [ ] Add `spec-sync assign <spec> [--to <id> --name <n>] [--release] [--json]` to
      `cli-sync.js`: stamps or clears `linear_assignee_id` /
      `linear_assignee_name` in the overview frontmatter, mirroring how
      `spec-sync stamp` writes ids. It writes the repo only — pushing is the
      skill's next step, not this verb's.
- [ ] Refuse cleanly rather than guessing: an unknown spec name, a spec with no
      `linear_identifier`, or `--to` without a resolvable id each exit non-zero
      with a one-line reason and write nothing.
- [ ] Add the `/spec-claim` skill at
      `packages/linear/assets/skills/spec-claim/SKILL.md`, with
      `disable-model-invocation` (user-only, like `/spec-push` and
      `/spec-status`). Keep the description under the 500-char budget enforced by
      `scripts/skill-budget.test.js`, and make sure it carries the trigger
      phrasings ("claim this spec", "take ownership", "hand this back") and not
      engine mechanics.
- [ ] Skill body — three modes on `/spec-claim [<spec>]`, defaulting to the spec
      in flight for this session:
      - **take** — resolve identity (phase 1), stamp, then `/spec-push`.
        Taking a spec already assigned to someone else **confirms first**, naming
        them.
      - **`--release`** — clear the stamp and push; the Linear issue is
        unassigned. Leaves `> **Developer:**` alone (the record of who actioned
        it) and adds a dated Changelog line.
      - **`--to <user>`** — resolve the target through `spec-sync users` /
        `list_users` and confirm the match before stamping; never accept a
        hand-typed id as a match. Sets `Developer:` to that person's display name.
- [ ] Every mode adds a dated **Changelog** entry to `00-overview.md` — ownership
      changes are course-corrections, not state transitions, so they belong there
      and not in the State log.
- [ ] Degrade, never block: if the push fails the stamp still stands in the repo,
      and the skill says so — the mirror is disposable and the next push repairs it.
- [ ] Add tests: `assign` stamps, clears, and refuses each bad input; the skill
      file exists, is user-only, and stays inside the description budget; a claim
      on an unlinked spec is refused rather than silently local. Run `npm test`.

## Notes

`--to` is the one path where the repo writes into another person's Linear inbox
(decision 11). That is why the target is always resolved through a search and
confirmed — a mistyped id would assign a stranger and nothing downstream would
notice.
