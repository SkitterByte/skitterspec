---
linear_issue_id: "SKS-311"
---

# Phase 1 — The published READMEs, and the guard ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the two READMEs that ship on npm describe the review loop and the
commands that actually exist, and a test fails if either drifts again.

## Tasks

- [ ] **Write the guard first, and watch it fail.** It should name all six
      discrepancies that exist today — `/spec-env`, `/spec-env-down`,
      `/spec-go`, `/spec-ready` documented but dead; `/spec-reviewed` and
      `/spec-to-main` shipped but absent — before a word of prose is fixed.
- [ ] **Positive half: compare sets, not strings.** Read the shipped skill names
      from `packages/common/assets/skills/` and the provider's from
      `packages/linear/assets/skills/`, add the two commands in
      `.claude/commands/`, and assert the `/spec-*` names in each published
      README are exactly that set. A list of known-bad names would only catch
      the mistakes someone already made.
- [ ] **Positive half, config: every `review.*` key is documented.** Read them
      from `DEFAULT_CONFIG.review` in `packages/common/src/env/config.js` so a
      new key fails this until it is written up.
- [ ] **Negative half: removed behaviour, with a reason each.** An explicit list
      — starting with `want a written review before you commit?` — because the
      stale `Review` row is prose and no set comparison can see it. Each entry
      carries why it is banned, so the next reader can tell a live phrase from a
      dead one.
- [ ] Fix `packages/skitterspec/README.md`: correct the command table, and
      rewrite its review section to cover the page, the four verdicts, the gate
      (`review.required`), `/spec-reviewed` for a pass sent outside a wait, and
      the `review.*` keys including `serve`.
- [ ] Fix `packages/skitterspec-linear/README.md` the same way, adding
      `/spec-claim` and `/spec-list` to its command table if they are absent.
- [ ] **Do not restate the mechanism.** The serve token, the claim window and
      why `/spec-reviewed` is user-only stay in `.claude/rules/` — link, do not
      copy (decision 6).
- [ ] **Stays-silent test** (rule 3): the guard must pass on a README that
      documents the correct set, and must not fire on a `/spec-*` name appearing
      inside a fenced example or a URL — both are ordinary and neither is a
      command reference.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

Both files are **hand-maintained and committed** — `build-dist.js` leaves each
package's `package.json` and `README` untouched, so there is no generator to fix
instead.

The guard is what makes this phase worth more than the edit. The prose can be
rewritten in an afternoon; what let it rot was that
`assets-offer-last.test.js` guards the skill's copy of that question and nothing
guards the README's.
