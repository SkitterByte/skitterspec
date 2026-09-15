---
linear_issue_id: "SKS-260"
---

# Phase 3 — Release and verify `skitterspec-linear` 13.0.0 ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `@skitterbyte/skitterspec-linear@13.0.0` is live and verified the same
way, proving the pipeline handles the larger composition too.

## Tasks

- [x] **Operator step — tell Reuben, do not attempt it.** Configure a trusted
      publisher for `@skitterbyte/skitterspec-linear`, with the same four field
      values as phase 2. It is a per-package setting, so phase 2's does not carry
      over.
- [x] Verify the plan: `node scripts/release.js skitterspec-linear major` should
      read `12.0.0 → 13.0.0`.
- [x] **Ask before cutting and pushing the tag.** Then release it the same way,
      and approve with `npm run approve skitterspec-linear 13.0.0`.
- [x] Verify `dist-tags` moved and `dist.attestations` exists, as in phase 2.
- [x] **Check the composition specifically.** This package is built from four
      source packages (`common`, `linear`, `sync-core` and its own dist), so
      unpack the published tarball and confirm the provider's own assets are in
      it — `npm pack @skitterbyte/skitterspec-linear@13.0.0` and list the
      contents. A base-only tarball would pass every other check in this spec.
- [x] Confirm both packages now report the corrected `repository.url` on the
      registry, in the org's real case — the lowercase spelling is what would
      have failed the provenance validation.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

With both packages released the pipeline is proven end to end and there is
nothing left of the original brief outstanding. The tag scheme, the approve
helper and the guards all stay as they are; the next release is an ordinary one.

## The composition held

84 files, against 12.0.0's 75 and the base's 51. All four source packages are in
the tarball, which is the one thing a base-only publish would have failed while
passing every other check in this spec:

```
src/vendor/linear/      10 files   the Linear provider
src/vendor/sync-core/   12 files   the one-way sync engine
src/env/, src/cli.js               common's, shared with the base
assets/skills/          spec-push, spec-status, spec-sync, spec-claim,
                        spec-list, spec-linear-setup — provider-only
bin/                    skitterspec-linear AND skitterspec, the superset
                        alias the provider contract requires
```

Composed code lands at `src/vendor/<pkg>/`, not `src/<pkg>/` — worth knowing
before writing a check against it.

## Provenance

```
subject:  pkg:npm/%40skitterbyte/skitterspec-linear@13.0.0
workflow: .github/workflows/release.yml
ref:      refs/tags/skitterspec-linear@13.0.0
commit:   8e55fc8755bebcabba3920c3ab39b915fcecde83
```

That is the commit the tag points at.

## The repository correction, as the registry now holds it

| version | `repository.url` |
|---------|------------------|
| `skitterspec@18.0.0` | `github.com/skitterbyte/…` — the lowercase that would 422 |
| `skitterspec@19.0.0` | `github.com/SkitterByte/…` |
| `skitterspec-linear@12.0.0` | `github.com/skitterbyte/…` |
| `skitterspec-linear@13.0.0` | `github.com/SkitterByte/…` |

## One thing that got in the way

The GitHub Actions API started returning **403** part-way through: unauthenticated
polling has a low hourly budget and two monitors exhausted it, so neither release
run ever reported a conclusion. It did not matter — `npm stage list` is the
authoritative answer to "did it stage", and the registry is the authoritative
answer to "did it publish". A workflow's exit code is neither. Anything watching
these runs should either authenticate or ask npm.
