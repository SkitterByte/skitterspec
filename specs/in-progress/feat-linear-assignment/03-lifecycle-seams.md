---
linear_issue_id: "SKS-112"
---

# Phase 3 — Stamp the assignee from the lifecycle skills ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** starting a spec assigns its Linear issue to whoever started it, without
a question in the common case and without ever failing the start.

## Tasks

- [ ] Add `packages/linear/assets/seams/spec-tracker-assign.md`. It must state:
      only when `linear.config.json` exists, the spec carries a
      `linear_identifier`, **and** `sync.fieldOwnership.assignee` is set;
      resolve identity via `spec-sync whoami`; on `transport = mcp` call
      `get_user "me"` and cache with `whoami --set`; if unresolved **and** Linear
      is reachable **and** the session is interactive, offer a user search
      (`spec-sync users <query>` / `list_users`) and offer to cache the pick;
      otherwise say assignment was skipped in one line and carry on.
- [ ] In that seam, stamp via `spec-sync assign <spec> --to <id> --name <n>`
      (added in phase 4) rather than hand-editing frontmatter, and set
      `> **Developer:**` to the Linear display name when resolved, falling back to
      `git config user.name`.
- [ ] Place the seam marker in `packages/common/assets/skills/spec-start/SKILL.md`
      step 4, immediately after the "Set **Developer**" bullet — before the commit,
      so the stamp is swept up by the spec's own commit rather than left dirty.
- [ ] Rewrite spec-start's "Why there is no tracker seam here" section: the claim
      about *linking* stays true (this skill mints nothing), and it now has to say
      why an **assignment** seam is nonetheless correct here — the branch is
      provisioned and the developer is known at exactly this moment, and in
      `worktree` mode `/spec-next` may not run for some time.
- [ ] Place the same seam in `/spec-bug` and `/spec-hotfix` where each sets
      **Developer** immediately, so a test-first spec assigns on the same terms.
- [ ] Extend `spec-next-start.md`: unassigned + identity resolves → stamp it
      silently and let the push already described carry it; assigned to someone
      else → one line (`assigned to <name> — /spec-claim to take it`) and change
      nothing; never prompt.
- [ ] Keep the `Developer:` header on completion — `/spec-complete` and
      `/spec-cancel` need no change, since the bucket move clears the assignee
      through the push they already run. Add a line to `spec-tracker-sync.md`
      saying so, so a reader does not go looking for a missing unassign step.
- [ ] Verify every touched skill still composes: `npm run build`, then confirm no
      `<!-- seam:… -->` marker survives in the built dists (the composed-assets
      guard in `packages/common/src/init.js` enforces this).
- [ ] Add tests: seam-placement assertions in `packages/common/test/assets.test.js`
      alongside the existing ones (the assign seam sits *after* the Developer
      bullet and *before* the commit step); the base distribution composes with the
      seam empty and no assignment prose. Run `npm test` — green.

## Notes

Placement is load-bearing here for the same reason it was for `spec-next-start`:
stamping after the commit leaves `specs/` dirty and can make `spec-env integrate`
refuse to land the branch.
