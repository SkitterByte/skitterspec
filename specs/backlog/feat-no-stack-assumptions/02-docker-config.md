---
linear_issue_id: "SKS-351"
---

# Phase 2 — Honour the docker config instead of assuming it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `docker.composeFile` is actually used, and a spec with no `Stack:`
header only inherits `docker.enabled` where there is a compose file to bring up.

## Tasks

- [ ] Pass `-f <composeFile>` to the `docker compose … up -d` line in
      `packages/common/src/env/provision.js` and the `docker compose … down`
      line in `packages/common/src/env/teardown.js`, resolved against the
      worktree.
- [ ] Gate the no-header fallback in `provision.js` on the configured compose
      file existing, so `spec.stack` absent + `docker.enabled: true` +
      no compose file resolves to `worktree`.
- [ ] Name the blind spot beside it: the check reads the compose file's path
      from config, so a project whose compose file is generated at setup time
      would be misread — and the answer there is an explicit `Stack:` header.
- [ ] Add tests: `-f` appears in both plans; a no-header spec with a compose
      file present still plans docker; the same spec without one plans
      `worktree`; and a stays-silent test that an explicit
      `Stack: worktree + docker` is never downgraded by a missing compose file.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Both plan builders are pure — they return command lists and perform no side
effects — so all of this is testable without docker installed.

The compose-file check is the first code that reads `docker.composeFile`, which
is why the `-f` fix belongs in this phase rather than beside it: the key has to
mean something before it can gate anything.
