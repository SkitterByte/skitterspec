---
linear_issue_id: "SKS-253"
---

# Phase 5 — Hand the pipeline over ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the pipeline is complete and everything the first real release needs is
written down — the operator steps, the exact field values, and how to tell a
staged build from a published one.

## Tasks

- [x] Record that the proving run cannot happen inside this spec. Local `main`
      was **158 commits ahead of `origin/main`** (last pushed 2026-09-11) and the
      remote had no `.github/` at all, so no tag could trigger anything until
      this branch landed and `main` was pushed. Landing is the first
      outward-facing act, not the tag push the spec originally assumed.
- [x] Record the trusted-publisher values (below) — every field exact and
      case-sensitive.
- [x] Record the verification commands (below), and the npm baseline they are
      measured against: at the time of writing neither package carried any
      `dist.attestations`, and `dist-tags.latest` was `18.0.0` / `12.0.0`.
- [x] Verify both release plans dry-run correctly: `18.0.0 → 19.0.0` and
      `12.0.0 → 13.0.0`, no publish step in either, `npm run approve` printed in
      the follow-up.
- [x] Carry the actual release into its own spec — `feat-prove-staged-publish`
      in `specs/backlog/` — since it needs a landed `main` this spec is what
      produces.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## The operator steps, for whoever runs the first release

**Configure a trusted publisher for each package** on the npm website:
Settings → Trusted Publisher → GitHub Actions. Every field is exact and
case-sensitive.

| Field | Value |
|-------|-------|
| Organization | `SkitterByte` — capital S and B; a lowercase org produces `ENEEDAUTH` |
| Repository | `skitterspec` — the bare name, not `SkitterByte/skitterspec` |
| Workflow | `release.yml` — the filename only; renaming that file breaks every publish |
| Environment | blank — the job declares no `environment:` |

**Then release, push, and approve:**

```
node scripts/release.js skitterspec major --yes
git push --follow-tags
npm run approve skitterspec 19.0.0
```

**A green workflow is not a release.** Staging is not publishing, so confirm:

```
npm view @skitterbyte/skitterspec dist-tags
npm view @skitterbyte/skitterspec@19.0.0 dist.attestations
```

The attestation should record the commit the tag points at. Neither package had
any attestation before this pipeline, so its presence is the proof.

## Notes

Release `skitterspec` first: it is the smaller composition
(`packages/common` plus its own dist), so a pipeline fault surfaces against the
simpler tarball before `skitterspec-linear`, which composes four source packages.

If staging fails after the tag is pushed, the tag is recoverable — delete it
locally and on the remote, fix, re-push. No version is consumed on npm until an
approval, which is the whole reason decision 1 was safe to take.
