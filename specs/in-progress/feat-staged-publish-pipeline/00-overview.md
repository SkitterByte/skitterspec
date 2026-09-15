---
linear_identifier: "SKS-248"
linear_url: "https://linear.app/skitterbyte/issue/SKS-248/staged-publish-pipeline-on-trusted-publishing"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Staged publish pipeline on Trusted Publishing

> **Type:** Feature
> **Name:** feat-staged-publish-pipeline (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** .github/workflows/, scripts/release.js, scripts/approve-release.cjs, packages/*/package.json, RELEASING.md, CLAUDE.md
> **Stack:** worktree

## Problem

Both distributions are published by hand from a laptop with a long-lived npm
token, and neither carries a provenance attestation. There is no CI at all — no
`.github/` — so nothing but local discipline stops an untested release. Worse,
`repository.url` says `github.com/skitterbyte/skitterspec` while the org is
`SkitterByte`; npm validates the sigstore bundle against that field
case-sensitively, so the first provenance-signed publish would die at the last
step with a 422. The fix is a tag-triggered workflow that authenticates by OIDC,
stages the build on npm, and waits for a human 2FA approval — no token anywhere.

## Decisions

1. **Tag push is the trigger, reversing `release.js`'s publish-before-tag
   ordering.** That comment exists because `skitterspec@16.3.1` was tagged and
   committed but never published, silently superseded by 16.3.2 — a tag
   asserting a release npm did not have. Staging defuses it: nothing is consumed
   on npm until approval, so a tag whose staging failed is deletable and
   re-pushable. Rejected dispatch-triggered-then-tag, which would move tag
   creation off the operator's machine for no gain once staging is recoverable.
2. **A tag stages only its own package.** Tags are already per-package
   (`skitterspec@18.0.0`, `skitterspec-linear@12.0.0`, 79 across two series), and
   `assertShippableChange` already refuses a byte-identical release — staging
   both every time would manufacture exactly that.
3. **`engines.node` rises to `>=22.13`, shipped as a major on each package.**
   pnpm 11.11 requires it, and the suite cannot run without an install (verified:
   a clean checkout discovers 1825 tests against 2353 and fails 41, because the
   workspace-name requires resolve only through pnpm's symlinks). So skittership's
   no-install engines matrix cannot be copied here, and a floor CI cannot test is
   a promise nobody is keeping. Rejected a silent minor: consumers on 18 deserve
   the semver signal.
4. **The repository fix ships in that same major.** It must precede the first
   staged publish or that publish 422s, so 19.0.0 / 13.0.0 each carry the
   metadata correction and the floor raise together.
5. **`release.yml`, not `publish.yml`** — it stages rather than publishes, and
   the name is accurate. It diverges from skittership deliberately; the npm website's
   trusted-publisher **Workflow** field must therefore read `release.yml`, and the
   filename can never be renamed without breaking every publish.
6. **CI is the only publisher — `release.js --publish` is removed.** One path to
   npm means provenance on every release and no way to publish unsigned from a
   laptop. `--yes` (bump, commit, tag) stays; `workflow_dispatch` is the recovery
   path.
7. **Registry commands stay on `npm`, not `pnpm`.** `npm stage publish` is the
   path proven on skittership, and npm ships with Node. `pnpm publish` does
   perform the OIDC exchange, but it is unverified against a real trusted
   publisher and a release pipeline is the wrong place to find out.
8. **An explicit test step in `release.yml`.** Neither published package has a
   `prepublishOnly`, so the gotcha that makes a separate test step redundant does
   not apply here — without one, CI would stage untested code.

## Solution overview

```
release.js <pkg> <bump> --yes   bump, write RELEASES-<pkg>.md, commit, tag
git push --follow-tags          →  release.yml fires on <pkg>@<version>
                                   assert tag version == package.json version
                                   pnpm install --frozen-lockfile && pnpm test
                                   npm stage publish   (prepack composes dist)
npm run approve <pkg> <version>  resolve stage-id, approve with 2FA
```

`ci.yml` runs the suite on push and PR across Node 22.13 and 24.

The OIDC exchange only happens when npm finds **no** credentials, so
`actions/setup-node` is used **without** `registry-url` — that option writes an
`.npmrc` whose empty `_authToken` makes npm treat the registry as
token-authenticated and skip OIDC entirely, producing a 404 on the PUT. npm is
upgraded before publishing (`npm install -g npm@latest`) because Node 22 bundles
npm 10.x, while trusted publishing needs >= 11.5.1 and staged publishing
>= 11.15.0.

The `bin`/`src`/`assets` of both dist packages are gitignored and composed at
`prepack` by `build-dist.js`, so the publish step must run from the package
directory and let `prepack` fire, or it ships an empty tarball.

**Out of scope:** the Linear deployment ladder (`specs/.core/ci-stages.md`).
`linear.config.json` declares no `release.stages`, so `spec-sync stage` refuses
and there is nothing for a pipeline to move.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CI workflow | add | `.github/workflows/ci.yml`, `release.yml` |
| npm script | add | `approve` → `scripts/approve-release.cjs` |
| CLI command | remove | `release.js --publish` (and its publish-phase step) |
| Config key | update | `engines.node` `>=18` → `>=22.13`, all 5 packages |
| Config key | update | `repository.url` → `SkitterByte` case; `+directory`, all packages |
| Package metadata | add | `repository` on `packages/linear`, `packages/sync-core` |
| Docs | update | `RELEASING.md`, `CLAUDE.md` release section |
| Release | add | `skitterspec@19.0.0`, `skitterspec-linear@13.0.0` (breaking: Node floor) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Correct the publish metadata, guarded by a test | ⬜ | [01-publish-metadata.md](01-publish-metadata.md) |
| 2 | Raise the Node floor and add ci.yml | ⬜ | [02-ci-and-node-floor.md](02-ci-and-node-floor.md) |
| 3 | release.yml — OIDC staging on a tag push | ⬜ | [03-release-workflow.md](03-release-workflow.md) |
| 4 | Approve helper; CI becomes the only publisher | ⬜ | [04-approve-and-handover.md](04-approve-and-handover.md) |
| 5 | Configure trusted publishers and prove it end-to-end | ⬜ | [05-prove-it.md](05-prove-it.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-15 — Spec created.
