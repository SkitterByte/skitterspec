---
github_issue_id: "#156"
---

# Phase 3 — Area clashes and the start warning ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** members that edit the same files are named as never-together, and
starting one beside its pair warns.

## Tasks

- [ ] Intersect members' `Area:` paths/globs pairwise (brace expansion as the
      headers already write it); list the shared paths per pair
- [ ] `epic status` shows clashes; `--json` carries them
- [ ] `/spec-start` on a member: warn once when a wait is unmet or a clashing
      member is in flight; never refuse (decision 4)
- [ ] Tests: overlapping globs; brace-expanded areas; no `Area:` → no clash
      claimed (cannot-tell, silent)
