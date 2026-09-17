---
linear_issue_id: "SKS-311"
---

# Phase 1 — The published READMEs, and the guard ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the two READMEs that ship on npm describe the review loop and the
commands that actually exist, and a test fails if either drifts again.

## Tasks

- [x] **Write the guard first, and watch it fail.** It should name all six
      discrepancies that exist today — `/spec-env`, `/spec-env-down`,
      `/spec-go`, `/spec-ready` documented but dead; `/spec-reviewed` and
      `/spec-to-main` shipped but absent — before a word of prose is fixed.
- [x] **Positive half: compare sets, not strings.** Read the shipped skill names
      from `packages/common/assets/skills/` and the provider's from
      `packages/linear/assets/skills/`, add the commands in
      `assets/commands/`, and assert the `/spec-*` names in each published
      README are exactly that set. A list of known-bad names would only catch
      the mistakes someone already made.
- [x] **Deviation: the set is read from a MARKED REGION, not the whole file.**
      Scanning the prose was tried first and it accuses correct writing in two
      ways. The base README names `/spec-push` and `/spec-status` while
      explaining what the *superset* adds — true, and not a claim that the base
      ships them. And its version history records that v3 *removed*
      `/spec-env`, `/spec-env-down` and `/spec-ready` — an accurate changelog,
      read by a whole-file scan as three dead commands still being documented,
      where the "fix" would be to delete the history. A set comparison needs a
      defined set on the document side, so each README now carries a
      `<!-- commands:start -->` … `<!-- commands:end -->` table. Decision 3
      stands; what it lacked was a boundary.
- [x] **Positive half, config: every `review.*` key is documented.** Read them
      from `DEFAULT_CONFIG.review` in `packages/common/src/env/config.js` so a
      new key fails this until it is written up.
- [x] **Negative half: removed behaviour, with a reason each.** An explicit list
      — starting with `want a written review before you commit?` — because the
      stale `Review` row is prose and no set comparison can see it. Each entry
      carries why it is banned, so the next reader can tell a live phrase from a
      dead one.
- [x] Fix `packages/skitterspec/README.md`: correct the command table, and
      rewrite its review section to cover the page, the four verdicts, the gate
      (`review.required`), `/spec-reviewed` for a pass sent outside a wait, and
      the `review.*` keys including `serve`.
- [x] Fix `packages/skitterspec-linear/README.md` the same way, adding
      `/spec-claim` and `/spec-list` to its command table if they are absent.
- [x] **Do not restate the mechanism.** The serve token, the claim window and
      why `/spec-reviewed` is user-only stay in `.claude/rules/` — link, do not
      copy (decision 6).
- [x] **Stays-silent test** (rule 3): the guard must pass on a README that
      documents the correct set, and must not fire on a `/spec-*` name appearing
      inside a fenced example or a URL — both are ordinary and neither is a
      command reference.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

Both files are **hand-maintained and committed** — `build-dist.js` leaves each
package's `package.json` and `README` untouched, so there is no generator to fix
instead.

The guard is what makes this phase worth more than the edit. The prose can be
rewritten in an afternoon; what let it rot was that
`assets-offer-last.test.js` guards the skill's copy of that question and nothing
guards the README's.

**What the guard actually found, versus what the spec predicted.** The spec named
six discrepancies. The real set was different and the difference is the argument
for comparing sets rather than looking for names: **`/spec-remote-review` was
added the same day** and no hand-written list could have known about it, while
four of the six predicted ones turned out to be *version history* doing its job.
The three genuinely missing from the base README were `/spec-reviewed`,
`/spec-to-main` and `/spec-remote-review`; the superset's region was missing
eleven, because its prose said "on top of the base skills" and left a reader who
installs only the superset with no list of what they have.

**The `review.*` half earned itself immediately.** Three of the seven keys
(`serve`, `allowNetwork`, `allowRemote`) were added in the days before this ran,
and all three were undocumented — which is exactly the failure a list kept by
hand cannot catch, because whoever keeps it is the person who forgot.
