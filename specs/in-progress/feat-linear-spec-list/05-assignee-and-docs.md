---
linear_issue_id: "SKS-120"
---

# Phase 5 — `--mine` / `--by <user>`, and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the listing filters by assignee on both transports, reusing the identity
`feat-linear-assignment` resolves, and the feature is documented.

> **Depends on `feat-linear-assignment` (SKS-109) phase 1** — `spec-sync whoami`
> and `spec-sync users`. Do not build a second identity resolver here
> (decision 9). Until assignment ships, nothing assigns spec issues, so these
> filters have nothing to find.

## Tasks

- [ ] Add `--mine`: resolve the caller through `spec-sync whoami` and pass the id
      as `assigneeId`. On the MCP path use Linear's `assignee: "me"` directly — no
      identity needed there.
- [ ] Add `--by <user>`: resolve the named person through `spec-sync users`
      (name/email search), never a hand-typed id. An ambiguous match asks; an
      unmatched one says so and lists nothing rather than falling back to the
      whole team.
- [ ] Route unresolved identity to inaction, matching decision 4 of the assignment
      spec: `--mine` with no resolvable identity prints one line explaining that
      and exits 0 — it never prompts inside a listing and never silently drops the
      filter (which would show the whole team's work under a `--mine` heading).
- [ ] Combine cleanly with the existing scope flags, so
      `--in-progress --by "Jane Dev"` and `--next 5 --mine` both read naturally.
- [ ] Teach `/spec-list` the phrasings — "assigned to me", "what am I working on",
      "what is Jane on" — and which of them need identity.
- [ ] Document the verb and the skill in `assets/core/linear.config.md` and
      `assets/core/SETUP.md`, and add `/spec-list` to the skill table in the root
      `CLAUDE.md` and `packages/common/assets/rules/spec-planning.md`.
- [ ] Extend `test/cli-list.test.js`: `--mine` with a cached identity; `--mine`
      with identity unresolved printing the skip line and **not** listing the
      team; `--by` resolving one user; `--by` unmatched listing nothing; and the
      MCP path using `assignee: "me"` without touching `whoami`.
- [ ] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done.

## Notes

The `--mine`-drops-the-filter case is the accusation-shaped bug here: showing
everyone's work under a heading that promises only yours is worse than showing
nothing. Keep it in the stays-silent family of tests
(`.claude/rules/negative-checks.md`).
