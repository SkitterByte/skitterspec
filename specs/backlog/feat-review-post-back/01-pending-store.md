---
linear_issue_id: "SKS-218"
---

# Phase 1 — The pending store and the claim ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a pass can be held, coded and claimed entirely through the CLI, with no
server and no page change — so the mechanism is provable before anything can
reach it over the wire.

## Tasks

- [ ] Add the pending sidecar beside the notes one:
      `.spec-env/reviews/<spec>.pending.json`, same gitignored home, same
      versioned shape. It holds a list of `{ code, blob, at, render }`.
- [ ] Write `mintCode(pending)` — unique **among the currently pending**, not
      drawn and hoped for (Decision 6). Six digits, and say in a comment that it
      is on screen by design and is not a secret.
- [ ] Write `claimPending(pending, code)` as a **pure** function returning the
      matched entry and the remaining list, so the consume rule is testable
      without touching disk.
- [ ] Supersede on the same render: a new pass from the same `render` replaces
      the unclaimed one it came from, so the code on screen is always the pass on
      screen (Decision 5). Passes from a *different* render stand alongside it.
- [ ] Add `spec-env review <spec> --claim <code>`: match, merge the blob through
      the existing `mergeNotes`, drop the entry, then re-render. Claiming is the
      only thing that writes the notes sidecar.
- [ ] A wrong or missing code **refuses, writes nothing, and names nothing** — no
      fallback to "the only one", no listing the pending codes
      (`.claude/rules/negative-checks.md` rule 4). Report the count and no more.
- [ ] Tests: a claim merges exactly the blob it names; a wrong code changes
      nothing and lists nothing; a second pass from one render supersedes rather
      than piling up; two renders coexist; a claimed code cannot be claimed twice.
- [ ] **Stays silent:** a spec with no pending file at all renders byte-identically
      to how it does today, and `--claim` on it says so without accusing anyone
      (`.claude/rules/negative-checks.md` rule 3).
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Nothing here is reachable from outside the machine yet. That is deliberate: the
consume rule and the refusal are the load-bearing parts, and they are easier to
get right — and much easier to test — before there is a socket involved.
