---
github_issue_id: "#280"
---

# Phase 2 — `update --all` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** One command updates every local-scope project on the machine with
its own distribution, and lists the rest with what to do (proven by tests over
fake project dirs and a fake Claude projects root).

## Tasks

- [x] Discover projects: `knownDirs` from the Claude projects root, kept only
      where `specs/.core/.skitterspec-manifest.json` exists (decision 7).
- [x] Resolve each project's distribution from the manifest, else infer it
      from `specs/.core/<provider>.config.json`, else the base (decision 8).
- [x] Dispatch: local scope → run `<distribution bin> update` in the project
      folder; team → listed; disabled → listed; bin missing → skipped with the
      `npm i -g` line.
- [x] Print one line per project (decision 9); exit 1 only when an update
      failed.
- [x] Add `--all` to `update`'s help and to `docs/reference.html`.
- [x] Tests: a local project is updated by its own distribution; a team
      project is listed and untouched (`git status` clean); a missing bin is
      skipped with the install line; a folder with no manifest is ignored
      (stays silent); a failed update exits 1 and the others still run.
- [x] Run `pnpm test`, green.
