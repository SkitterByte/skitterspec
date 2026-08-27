# Phase 2 — One-sided push engine: last-pushed snapshot + machine-readable plan ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `push` computes exactly what to create/update in Linear from the local
projection and a committed **last-pushed snapshot**, with **no remote content
read and no three-way merge**, and emits a machine-readable plan the skill applies
verbatim. Proven with a fake adapter + the realistic fixture.

## Tasks

- [ ] Repurpose `base.js` into a **last-pushed snapshot**: per-object records
      `{ kind, id, hash }` (project, each milestone, each issue) capturing the
      projection we last pushed. Keep the committed-sidecar location; simplify the
      read/write API. Unit-test round-trip.
- [ ] Replace `compare.js` three-way `classify` with a one-sided
      `planChanges(localProjection, snapshot)`: per object → `create` (no id /
      not in snapshot), `update` (id present, hash differs), or `unchanged`
      (hash matches). Drop ownership/conflict/remote-signature logic. Unit-test
      create/update/unchanged and id-stamped convergence.
- [ ] Rewrite `push.js` one-sided: build the local projection (Phase 1), call
      `planChanges`, and return a **plan** object —
      `{ project?: {description}, milestones: {create[],update[]},
      issues: {create[],update[]} }` — where each issue create/update carries
      `{title, description, done, milestoneRef}` and each milestone `{name, goal}`.
      No `readProject`, no `moved`/`--force`/pre-write re-read. On apply-confirm
      from the skill, advance the snapshot. Unit-test with a fake adapter.
- [ ] `spec-sync push`: emit the plan as JSON (default machine-readable; `--json`
      explicit; keep a terse human summary on a tty). Remove the old
      `issuesPush/milestonesPush` count-only output and the merged-projection
      `--out`. Update `cli-sync` tests.
- [ ] Push-side id writeback stays: after the skill creates objects it stamps
      milestone ids into phase frontmatter and issue ids into task lines
      (`stampMilestoneId`, `stampIssueId`, `writeFrontmatter`) — keep and test
      these; they are the only files `push` touches.
- [ ] Add/extend tests: full push over the realistic fixture with a fake adapter
      → correct plan; a second push with an unchanged snapshot → empty plan
      (idempotent); a task edit → single issue `update`. Run `node --test` — green.

## Notes

The snapshot replaces both the three-way base *and* the remote read: "has our
side changed since we last pushed?" is all the engine needs to decide create vs
update vs skip. A drifted Linear mirror (someone hand-edited it) is intentionally
ignored — the next push from a spec change overwrites it; a `--force`/full
re-push (ignore snapshot) is a thin option if we want it later.
