# Tracker releases: create the release, attach its tickets, follow its deploys

> **Type:** Feature
> **Name:** feat-tracker-releases (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-10-21
> **Area:** packages/provider-kit/src/{adapter,released,releases}.js, packages/linear/src/{api,config,cli-sync,doctor}.js, packages/linear/assets/skills/spec-linear-setup/SKILL.md, packages/linear/assets/core/{linear.config.md,ci-stages.md}, .github/workflows/release.yml, scripts/approve-release.cjs, specs/.core/linear.config.json
> **Stack:** worktree

## Problem

A release today is a git tag and nothing more. `spec-sync released <range>`
already knows exactly which tickets a tag contains, but nothing writes that down
anywhere a PM looks. The only way to track a deploy is the stage ladder, which
moves each **ticket's** workflow state, so dev-task cards double as deployment
markers.

Linear (Business plan) now has first-class **Releases**. A release lives in a
pipeline, carries its issues, and moves through stages such as test → demo →
prod. This workspace now has that licence. Skitterspec should create the
release, decide its contents, and let the host project's CI report where it is
deployed, so nobody drags cards around to say "this shipped".

## Decisions

1. **Skitterspec decides a release's contents, not Linear.** The ticket set is
   `ticketsInRange` + `partitionStageMoves`. That means the `Refs:` trailer, with
   `specs/` bookkeeping commits ignored and foreign refs excluded. Linear's
   `linear-release` CLI scans commits by its own rules, which would be a second
   definition of "what shipped". Phase 1 checks it anyway, as asked, and records
   why it was or wasn't adopted.
2. **CI creates the release, triggered by the tag push.** The tag is the release
   event here, and the tracker key is a CI secret, never on a laptop. Creating it
   locally in `release.js --yes` was rejected: a release would exist in Linear
   before CI had built it.
3. **Four engine verbs that a host's CI calls**, all dry-run unless `--apply`
   (the `stage` precedent):
   - `release create <tag>` works out the range, creates or updates the release,
     attaches its tickets, and adds notes and links.
   - `release deployed <version> <env>` moves the release to that env's stage.
   - `release complete <version>` finishes it.
   - Notes and links are flags on `create`: the `RELEASES-*.md` text, the CI run
     URL, and the package page.
4. **Idempotent by lookup, not by memory.** `create` finds the release by
   pipeline + version first and updates it if found. A CI retry on the same tag
   must never mint a duplicate. A failed lookup is *cannot tell*, so it refuses
   rather than creating (negative-checks rule 4).
5. **Range = previous tag in the same series → this tag.** It is resolved with
   `git describe --tags --abbrev=0 --match '<prefix>*' <tag>^`, so a hotfix tag
   (`feat-hotfix-release`) ranges from its base tag. A first release with no
   previous tag is reported as "no previous release: N commits from root" and
   never fails silently. CI needs `fetch-depth: 0`, and the engine says so when
   the history is shallow.
6. **Which tickets are attached:** `movable` + `unfinished` (code really in the
   release that landed via `/spec-to-main`). `foreign` and `unlinked` are
   reported, not attached. Attaching never touches workflow state: push still
   owns state up to `complete`.
7. **Environments are keys in config, not Linear stage names.** CI says
   `deployed 1.4.0 test`, the same reasoning as the ladder's stage keys. A
   rename is one config edit, and every stage name is validated against the
   pipeline. A backwards move warns and never refuses (`stageOrderWarning`).
8. **A provider-neutral seam in provider-kit, implemented for Linear only.**
   The release ops (`releaseFind`, `releaseCreate`, `releaseAttach`,
   `releaseStage`, `releaseComplete`) are optional adapter ops, feature-detected
   like the other extras. A provider without them makes the verbs refuse with
   one line. Jira (fix versions) is a follow-up, not this spec.
9. **Pipelines are created by a person in Linear's UI. Setup links them.**
   `/spec-linear-setup` lists the pipelines and maps each one to a tag prefix
   (and its env→stage map). This holds whether or not the API can create
   pipelines, and a pipeline is the PM's surface just as projects are.
10. **Setup gains a Releases step, and re-running setup is how a connected repo
    adopts it.** On an existing config it offers just this step instead of the
    whole interview. That is this repo's case. It offers the CI step as a diff
    and writes it only on a yes. It names the secret to add, and the key is never
    handled by chat.
11. **The stage ladder stays as the fallback.** It is for workspaces without
    Releases. Setup offers Releases where the workspace has them and the ladder
    otherwise, and doctor warns when both are configured.
12. **This repo dogfoods it:** one pipeline per package (`skitterspec@`,
    `skitterspec-linear@`), stages `staged → published`. `release.yml` creates
    the release at `staged`, and `npm run approve` completes it as `published`.
    That completion runs locally with the user's personal key, if Phase 1 shows a
    personal key can write releases. Otherwise approve prints the CI dispatch to
    run instead.

## Solution overview

```jsonc
// linear.config.json
"releases": {
  "keyEnv": "LINEAR_RELEASE_KEY",          // CI secret name; never the value
  "pipelines": [
    { "tagPrefix": "skitterspec@", "pipelineId": "<uuid>",
      "envs": { "staged": "Staged", "published": "Published" } }
  ]
}
```

```sh
# host CI, on tag push
skitterspec spec-sync release create "$TAG" --notes RELEASES-x.md --link "$RUN_URL" --apply
# host CI, after each deploy
skitterspec spec-sync release deployed 1.4.0 test --apply
skitterspec spec-sync release complete 1.4.0 --apply
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync release create\|deployed\|complete` (`--apply`, `--json`) |
| Domain object | add | provider-kit release seam: optional `release*` adapter ops |
| Config key | add | `linear.config.json` → `releases.{keyEnv,pipelines[]}` |
| Service | update | Linear API adapter: release GraphQL ops |
| CLI command | update | `spec-sync doctor`: pipelines exist, stage names valid, ladder + releases both set |
| CLI command | update | `spec-sync init-config`: `--release-pipeline` flags |
| Skill/rule | update | `/spec-linear-setup`: Releases step, re-run offers it alone, CI diff offer |
| Config | update | this repo: `.github/workflows/release.yml`, `scripts/approve-release.cjs`, `linear.config.json` |
| Docs | update | `linear.config.md`, `ci-stages.md` (Releases vs ladder) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Spike Linear's release API and linear-release | ⬜ | [01-spike-release-api.md](01-spike-release-api.md) |
| 2 | Release seam + config + Linear adapter ops | ⬜ | [02-seam-and-config.md](02-seam-and-config.md) |
| 3 | `release create <tag>` | ⬜ | [03-release-create.md](03-release-create.md) |
| 4 | `release deployed` / `release complete` | ⬜ | [04-deployed-complete.md](04-deployed-complete.md) |
| 5 | Setup step, CI wiring offer, doctor | ⬜ | [05-setup-and-doctor.md](05-setup-and-doctor.md) |
| 6 | Dogfood in this repo | ⬜ | [06-dogfood.md](06-dogfood.md) |

## Open questions

- [ ] Can a personal API key write releases, or only a pipeline access key?
      Phase 1 answers this, and Decision 12's approve path follows from it.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-21 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-10-21 — Spec created.
