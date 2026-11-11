---
github_issue_id: "#156"
---

# Phase 3 — Area clashes and the start warning ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** members that edit the same files are named as never-together, and
starting one beside its pair warns.

## Tasks

- [x] Intersect members' `Area:` paths/globs pairwise (brace expansion as the
      headers already write it); list the shared paths per pair
- [x] `epic status` shows clashes; `--json` carries them
- [x] `skitterspec epic check <spec>`: warns when a clashing member is in
      flight, silent otherwise; `/spec-start` relays it once and never refuses
      (decision 4). The unmet-wait half moved to phase 4, where `epic check`
      gains the bypass offer (decision 8)
- [x] Tests: overlapping globs; brace-expanded areas; no `Area:` → no clash
      claimed (cannot-tell, silent)

## Notes

- `Area:` entries that do not read as a path (prose, `skills (spec, …)`) are
  dropped: they name no file, so they claim no clash. A pattern that ends first
  is read as a directory holding the other, and a bare filename matches the
  other's last segment — both err towards naming a clash, which only warns.
