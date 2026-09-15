---
linear_identifier: "SKS-254"
linear_url: "https://linear.app/skitterbyte/issue/SKS-254/toolchain-pnpm-12-and-a-pinned-dev-node"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Toolchain: pnpm 12 and a pinned dev Node

> **Type:** Feature
> **Name:** feat-toolchain-pnpm-12 (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** package.json, pnpm-lock.yaml, .nvmrc, .github/workflows/ci.yml, scripts/workflows.test.js, scripts/toolchain.test.js, scripts/lib/engines.js
> **Stack:** worktree

## Problem

The workspace is pinned to `pnpm@11.11.0` while 12.4.1 is current, and nothing
in the repo pins Node — no `.nvmrc`, no `.node-version` — so the version this is
developed against is whatever each machine happens to have. Neither gap is
urgent alone. What makes them worth doing together is that pnpm 12 is a **Rust
rewrite**: the CLI is a native binary, so pnpm no longer runs on your Node and
no longer imposes a Node floor (`pnpm@11.11.0` declares `node >=22.13`; every
`pnpm@12.x` declares `>=18.*`).

`feat-staged-publish-pipeline` raised `engines.node` to `>=22.13` on the stated
grounds that *pnpm 11.11 requires it*. That spec is complete and the floor is in
all six manifests, so the **number** is settled — but the **reason** is now
recorded in two pieces of live code, `ci.yml`'s header and
`scripts/workflows.test.js`'s, and both will be false the moment pnpm 12 lands.
Neither `skitterspec@19.0.0` nor `skitterspec-linear@13.0.0` has shipped yet
(the packages sit at 18.0.0 / 12.0.0), so there is still time to correct the
rationale before `feat-prove-staged-publish` publishes a breaking release whose
headline is that very floor.

## Decisions

1. **pnpm 12.4.1, taking the major.** Rejected staying on the maintained 11 line
   (11.27.0), which would have kept the recorded rationale true — but preserving
   a rationale by declining an upgrade is the tail wagging the dog, and the risks
   that made 11 attractive turned out not to exist (see 6).
2. **The correction lands in the live comments, not in the completed spec's
   Decisions.** `ci.yml:11` ("pnpm's own Node floor (>= 22.13) is therefore the
   repo's floor too") and `scripts/workflows.test.js:6` ("The floor moved to
   >= 22.13 because pnpm 11.11 requires it") are what a future reader acts on,
   and both sit beside accusing checks — exactly where
   `.claude/rules/negative-checks.md` says the blind spot must be named
   correctly. `specs/complete/feat-staged-publish-pipeline` gets a dated
   **Changelog** line pointing here and keeps its Decision 3 verbatim: a
   completed spec records what was decided and why *at the time*, and rewriting
   that erases the audit trail the State log and Changelog exist to hold.
3. **The floor stays `>=22.13`, and no manifest changes.** It survives on new
   merits: 22 (Jod) is the oldest line still receiving fixes (18 EOL Apr 2025,
   20 EOL Apr 2026), and it is the lowest job in the CI matrix, so it is a floor
   CI genuinely tests — which was always the stronger half of the original
   argument. Rejected `>=20` (promises an unpatched line) and `>=24` (drops
   Node 22 consumers for no technical reason — the code uses nothing past
   Node 18).
4. **`.nvmrc`, not `devEngines.runtime`.** pnpm 12's `globalShims` would actually
   *enforce* a pinned runtime by downloading it, which `.nvmrc` cannot — but it
   is pnpm-specific, brand new in 12.0.0, and `actions/setup-node` cannot read
   it. Rejected doing both: two places a Node version lives. The pin is for local
   development; CI's floor is the matrix, and the two are deliberately not
   coupled.
5. **The lockfile is regenerated deliberately here.** Frozen installs consume an
   existing lockfile unchanged, so nothing forces it — but pnpm 12's canonical
   cycle-breaking re-keys peer variants on the first real re-resolve, and left
   alone that rewrite would land inside whichever unrelated spec next touches a
   dependency. Take it now, in the commit that explains it.
6. **Verified rather than assumed, from the packed `pnpm@12.4.1`:**
   `minimumReleaseAgeExclude` is still recognised and actively developed in 12.x;
   `--frozen-lockfile` installs (what every worktree's `env.config` → `setup`
   runs) consume existing lockfiles unchanged; and this lockfile is 78 lines over
   two real dependencies. These were the reasons to fear the major, and none
   held. The one risk that **is** real is new and untested: `ci.yml` uses
   `pnpm/action-setup@v6` reading `packageManager`, and pnpm 12 ships as a
   native binary behind an `install.js` shim rather than as JavaScript.
7. **Land before `feat-prove-staged-publish`.** That spec (SKS-257) ships
   19.0.0 / 13.0.0 announcing the Node floor as the breaking change. Not a hard
   dependency — but publishing that note while the repo's own comments give a
   reason that is no longer true is a cheap mistake to avoid.

## Solution overview

```
package.json     packageManager: pnpm@11.11.0 → pnpm@12.4.1
pnpm install     → commit whatever pnpm-lock.yaml pnpm 12 writes
                   (observe the lockfileVersion; do not assert one)
pnpm install --frozen-lockfile   → must pass from a clean checkout:
                   the command every spec worktree runs
ci.yml           pnpm/action-setup@v6 must provision pnpm 12's native binary
                 header comment: the floor's reason, corrected
workflows.test.js
                 header comment: same correction, beside the same check
.nvmrc           24.21.0
scripts/lib/engines.js
                 manifestEngines()/floorOf() extracted, shared by both tests
scripts/toolchain.test.js
                 .nvmrc satisfies the floor the manifests declare
```

pnpm 12 newly **hard-fails** on a `pnpm-workspace.yaml` setting it does not
recognise (`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`) when the project pins a
pnpm version the running pnpm satisfies — which this repo does. Ours declares
only `packages` and `minimumReleaseAgeExclude`, both recognised, so it should
pass; the check is new, so phase 1 proves it rather than assuming it.

**Out of scope:** `engines.node` itself and the release that ships it — the
floor is already in the manifests, and `feat-prove-staged-publish` owns the
publish.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `package.json` `packageManager` → `pnpm@12.4.1` |
| Lockfile | update | `pnpm-lock.yaml` regenerated under pnpm 12 |
| CI workflow | update | `ci.yml` — pnpm 12 provisioning; header rationale corrected |
| Test | update | `scripts/workflows.test.js` — header rationale corrected |
| Test | add | `scripts/toolchain.test.js`, `scripts/lib/engines.js` |
| Config file | add | `.nvmrc` (`24.21.0`) |
| Spec doc | update | `specs/complete/feat-staged-publish-pipeline` — Changelog line only |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Move the workspace and CI to pnpm 12.4.1, correcting the rationale it falsifies | ✅ | [01-pnpm-12.md](01-pnpm-12.md) |
| 2 | Pin the dev Node with `.nvmrc` and a guard test | ✅ | [02-node-pin.md](02-node-pin.md) |

## Open questions

- [ ] pnpm 12 ships batch `pnpm stage approve` (several staged packages, one
      OTP, workspace dependency order). `feat-staged-publish-pipeline`
      Decision 7 keeps registry commands on `npm` because `pnpm publish`'s OIDC
      exchange is unverified against a real trusted publisher — still true, and
      `feat-prove-staged-publish` is the run that will settle it. Deliberately
      not reopened here; worth revisiting once that pipeline has published once.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |
| 2026-09-15 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-15 — Spec created.
- 2026-09-15 — Rewritten before landing. The first draft was authored against a
  `main` that moved ~10 commits during the grill: `feat-staged-publish-pipeline`
  landed in full and completed, so `engines.node >=22.13` and both workflows
  already exist. The floor raise and `ci.yml` left this spec's scope, the
  rationale correction moved from a backlog document to two live code comments,
  and `pnpm/action-setup` with a native-binary pnpm became the upgrade's one
  genuinely untested risk.
- 2026-09-15 — Phase 1: the lockfileVersion did not move (still `9.0`), but the
  file gained a **second YAML document**. pnpm 12 self-pins in the lockfile —
  `packageManagerDependencies` plus an `@pnpm/exe.*` entry per platform, +158
  lines. Inert here (nothing parses the file), and it is what makes CI resolve
  the right binary. Anything that ever parses it must read both documents.
- 2026-09-15 — Phase 1: `pnpm/action-setup@v6` could only be verified by
  simulating its mechanism locally. The action has never run, because this
  repo's CI has never run at all — the remote has not seen a workflow file.
  The real answer comes with `feat-prove-staged-publish`.
- 2026-09-15 — Phase 2: the extraction took `cmpVersion` and `lowest` as well as
  `manifestEngines`/`floorOf`. `lowest` is built on `cmpVersion` and the new
  check needs `cmpVersion` too, so leaving them would have split the version
  arithmetic across two files — what the extraction existed to prevent.
- 2026-09-15 — Phase 2: the `.nvmrc` blind spot is sharper than "tolerate odd
  formats". A bare `22` resolves to the newest 22.x under nvm/fnm and so really
  does satisfy `>=22.13`; compared as `22.0.0` it would read as below the floor
  and fail a correct pin. The check therefore returns `ok`/`below`/`unknown`,
  and a pin less precise than the floor but agreeing on every part it states is
  `unknown`. Only `below` accuses.
- 2026-09-15 — Completed; both phases done, tests green (2401). Deferred by
  design: the Open question on pnpm 12's batch `pnpm stage approve`, which
  cannot be settled until `feat-prove-staged-publish` has published once. Also
  carried there: `pnpm/action-setup@v6` against pnpm 12 is verified only by
  simulating its mechanism, because this repo's CI has never run at all.
