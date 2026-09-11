---
linear_issue_id: "SKS-137"
---

# Phase 3 — put it on the record: the rule, and doctor ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** someone who commits outside Claude can find out the hook exists, tell
whether it is installed here, and knows the one case where they must type the ref
themselves.

## Tasks

- [ ] Add a short section to `packages/linear/assets/rules/commit-trailers.md`:
      the hook fills `Refs:` when a message has none, so a commit made in lazygit
      or with `git commit -m` carries it without anyone typing an id — and a ref
      you write yourself is never overwritten.
- [ ] Tie it to the rule already there: the hook knows only the **branch**, so
      the documented disagreement case (authoring a backlog spec part-way through
      another spec) is still resolved by writing `Refs:` from
      `spec-sync ref <spec>` yourself. The hook makes the common case free; it
      does not change what the ref means.
- [ ] Say plainly that it is **opt-in** — `spec-sync hook install`, once per repo
      — and that nothing installs it for you.
- [ ] Report it in `spec-sync doctor` (`packages/linear/src/doctor.js`) as one
      line: installed / not installed / a foreign hook is in the way. Advisory
      only — doctor must not start failing a repo that has deliberately not
      installed it.
- [ ] Update the assets install manifest / any skill-asset test that counts the
      shipped rules files, and the docs site's Linear page if it lists the
      `spec-sync` verbs.
- [ ] Add coverage: a `packages/linear/test` case asserting the rule file
      documents the hook and still says a typed ref wins, and a doctor test
      asserting the report appears in both states **and exits 0 either way**.
- [ ] Run `pnpm test` in `packages/linear` and at the repo root — green before
      the phase is done.

## Notes

`spec-sync doctor` is where someone looks when the trailer did not appear, so the
line is worth more than its size — without it the only way to tell is to read
`.git/hooks`. Keep it a report: an opt-in feature that makes doctor unhappy when
you decline it is a feature that nags.
