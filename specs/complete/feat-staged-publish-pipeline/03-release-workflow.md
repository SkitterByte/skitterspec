---
linear_issue_id: "SKS-251"
---

# Phase 3 — release.yml — OIDC staging on a tag push ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** pushing `<package>@<version>` stages that package on npm by OIDC, with
no token anywhere, and the workflow's auth-critical invariants are test-guarded.

## Tasks

- [x] Add `.github/workflows/release.yml` triggering on `push` tags
      `skitterspec@*` and `skitterspec-linear@*`, plus `workflow_dispatch` with
      `package` and `version` inputs for recovery.
- [x] Declare `permissions: { contents: read, id-token: write }` at workflow
      level — `id-token: write` is what makes the OIDC token available.
- [x] Use `actions/setup-node` **without `registry-url`**. Add a comment naming
      why: it writes an `.npmrc` with an empty `_authToken`, npm then treats the
      registry as token-authenticated, skips the OIDC exchange entirely, and the
      anonymous PUT comes back **404** (not 403 — npm hides package existence).
- [x] Add `npm install -g npm@latest` plus a diagnostic step echoing
      `npm --version` and `node --version`, so the next auth failure is readable
      from the log alone. Node 22 bundles npm 10.x, while trusted publishing
      needs npm >= 11.5.1 and staged publishing needs npm >= 11.15.0.
- [x] Derive the package from the tag by splitting on the last `@`, and map it to
      its workspace directory; on `workflow_dispatch` take it from the input.
- [x] Assert the tag's version equals that package's `package.json` version, and
      fail loudly when they disagree — that means the version commit and the tag
      came apart.
- [x] Run `pnpm install --frozen-lockfile` then `pnpm test` before staging.
      Neither published package has a `prepublishOnly`, so nothing else runs the
      suite.
- [x] Stage with `npm stage publish --access public`, run from the package
      directory so `prepack` composes the gitignored `bin`/`src`/`assets`.
      Verify against a real run whether provenance is implicit under trusted
      publishing or needs `--provenance`; record the answer in the workflow as a
      comment.
- [x] Add tests over `release.yml`'s text asserting: no `registry-url` anywhere;
      `id-token: write` present; the command is `npm stage publish` and never a
      bare `npm publish`; both tag patterns are listed. These are cheap locally
      and expensive in CI.
- [x] Run the project's test command — green before the phase is done.

## Notes

`npm stage publish`, not `npm publish`: trusted-publisher configs created after
2026-09-03 default to **stage-only**, and a direct publish is rejected with
`403 … OIDC permission denied for this action` — the identity is accepted, the
action is not. Staged is the better default here regardless: CI stages without
2FA, a human approves with it.

If a run shows `Signed provenance statement …` and then a 403/404, that is
**not** a signing problem. Signing is client-side; the registry validates the
identity afterwards on the PUT, so a successful signature says nothing about
whether the trusted-publisher config is right.

Nothing in this phase is outward-facing — the trusted publishers do not exist
yet, so a tag pushed now would fail at the staging step. Phase 5 configures them
and does the first real run.

**Decided while building:** `--provenance` is **not** passed. Provenance is
implicit once npm sees the OIDC token, and the workflow says so in a comment —
phase 5's real run is what confirms it, and the comment is where the answer gets
recorded either way.

**Added beyond the plan:** the tag is untrusted input — whoever pushes it chooses
the string — so it is read through `env:` and checked against an allow-list
before it is used as a path. `packages/${{ github.ref_name }}` would be a
directory traversal in a release workflow, and a test asserts no `run:` script
interpolates `github.ref_name` at all.

`scripts/ci-workflow.test.js` became `scripts/workflows.test.js`, since it now
guards both workflows and they share the comment-stripping helper. Defining that
helper twice is how two guards come to disagree.
