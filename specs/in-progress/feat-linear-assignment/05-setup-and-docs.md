---
linear_issue_id: "SKS-114"
---

# Phase 5 — Setup, doctor and docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the feature is discoverable — offered at setup, checked by doctor, and
documented where someone configuring Linear sync will actually read it.

## Tasks

- [x] `/spec-linear-setup`: add an interview step offering assignment ("assign the
      Linear issue to whoever is working the spec?"). On yes, write
      `sync.fieldOwnership.assignee: "push"` and resolve + cache the operator's
      identity there and then, so `/spec-start` never has to ask. On a re-run,
      report the current setting and the cached identity rather than re-asking.
- [x] `doctor.js`: add an identity check following the existing check shape — the
      resolved identity and its source, or a one-line fix
      (`skitterspec spec-sync whoami --set …`). It **reports**; it does not fail
      the doctor run, and it stays silent when `fieldOwnership.assignee` is absent
      (that project opted out, which is not a fault).
- [x] Document `sync.fieldOwnership.assignee` in
      `packages/linear/assets/core/linear.config.md`: what it opts into, that
      absent is the default and inert, that unset-on-a-spec means "don't touch",
      and that the terminal buckets clear it.
- [x] Update `packages/linear/assets/core/SETUP.md` with the identity step and
      `/spec-claim`.
- [x] Update the ticketing-provider paragraph in
      `packages/common/assets/rules/spec-planning.md` to mention `/spec-claim`
      alongside `/spec-push` and `/spec-status` — provider-agnostic prose, as that
      paragraph already is.
- [x] Update the repo's own `specs/.core/linear.config.json` — adopted here.
      **The example config was deliberately left alone**: it is strict JSON (no
      room for an explanatory comment) and is copied verbatim into every new
      project, so shipping the key there would opt everyone in by default and
      contradict decision 8. It is documented in `linear.config.md` instead,
      which says why it is absent.
- [x] Refresh the skill-count comment in `scripts/skill-budget.test.js` — it says
      "13 skills stay affordable" and the Linear distribution now ships 15. The
      budget itself is a deliberate decision; only the count is stale.
- [x] Add a `Release-Note:` to the user-facing commits for this spec — the
      benefit is "your Linear issue now shows who is building it, and hands itself
      back when the spec completes".
- [x] Add tests: doctor reports identity and stays silent when the field is not
      opted in; the config example parses and round-trips through the loader; the
      docs-claims test (`scripts/docs-claims.test.js`) still passes with the new
      prose. Run `npm test` — green.

## Notes

Doctor is an accusing check by construction, so the silent-when-opted-out task is
not a nicety: a project that never enabled assignment must not be told it is
missing an identity it has no use for.
