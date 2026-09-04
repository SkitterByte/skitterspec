# Wiring a deploy pipeline to Linear

How a CI/CD pipeline moves a release's tickets along the ladder declared in
`linear.config.json` → `release.stages`. Read `linear.config.md` → "The
deployment ladder" first for the config itself; this page is the pipeline half.

Nothing here applies until a ladder is declared. Without one, `spec-sync stage`
refuses and every other command behaves as it always has.

## The model

A spec's lifecycle ends at `complete`. Everything after that is a fact about an
**environment**, which no folder under `specs/` can derive — so the repo hands
off. The handoff point is one-way and automatic:

```
/spec-complete          →  states.complete      (the repo's last word on state)
CI: spec-sync stage test →  release.stages test  (the pipeline's, from here on)
CI: spec-sync stage prod →  release.stages prod
```

Once a spec is complete, pushes stop re-asserting its workflow state, so the
pipeline is the only writer. Editing a finished spec's prose still updates the
mirror's description; it will not drag the ticket back out of the pipeline.

## What a stage step runs

```sh
skitterspec spec-sync stage <key> <previous-tag>..<this-tag> --apply
```

- **Pass the range explicitly.** With no range it defaults to
  `git describe --tags --abbrev=0`..HEAD, which is a developer convenience — a
  pipeline knows exactly which tag it is deploying, and should say so. The
  resolved range is printed on every run either way.
- **Drop `--apply` to dry-run.** Same output, no writes. Worth running in a
  pre-deploy job.
- **`--json`** for a machine-readable result: the moves, the skips by category,
  and the commit counts.
- **Exit code is 0 unless a write failed**, so a failed move fails the stage.
  A range with nothing to move is a success, not a failure.

The tickets come from `Refs:` trailers on the commits in the range (see the
`commit-trailers` rule). A commit with no trailer is counted and reported, never
guessed at.

## Setup

1. **A ladder in `linear.config.json`** — via `/spec-linear-setup`, or
   `spec-sync init-config --stage test="On Test" --stage prod="Done"`.
2. **An API key as a pipeline secret**, exposed as the env var named by
   `auth.keyEnv` (default `LINEAR_API_KEY`). The config names the *variable*,
   never the key. `--apply` needs the API transport and refuses over MCP.
3. **Full history for the range** (CI: `fetch-depth: 0`). Fetching tags is not
   enough on its own: it makes the tag *resolve* without deepening the history,
   so `git log <tag>..HEAD` would return only the commits the clone happens to
   hold. `stage` and `released` check this and **refuse** rather than report a
   partial range, so a shallow checkout fails the step loudly instead of
   deploying a release that quietly leaves tickets behind.
4. **Run `spec-sync doctor --check-remote` once** after setup. It reports the
   ladder's rungs against the workspace and warns if the last rung never closes
   an issue.

### Azure Pipelines

```yaml
- task: Bash@3
  displayName: Mark tickets as deployed to test
  env:
    LINEAR_API_KEY: $(LinearApiKey)   # a secret variable, not inline
  inputs:
    targetType: inline
    script: |
      set -euo pipefail
      npx skitterspec spec-sync stage test "$(PreviousTag)..$(Build.SourceBranchName)" --apply
```

Repeat per environment with a different `<key>`: a post-deploy step on the test
stage runs `stage test`, the demo approval gate runs `stage demo`, the production
deploy runs `stage prod`.

## Why not call the API directly

A hand-rolled `curl` to Linear's GraphQL endpoint loses three things this command
has, and the loss is silent in all three cases:

- **State-name validation.** Linear **silently ignores** an unknown workflow
  state: the mutation succeeds, and the issue never moves. `stage` resolves the
  target state before its first write and refuses if the workspace lacks it.
- **The skip rules.** A range carries refs that must not be moved — another
  team's, ones no spec claims, and specs that have not finished. A blanket loop
  over every ref in the log moves all of them.
- **Retries and error classification.** The adapter retries transient failures;
  a bare `curl` reports a 500 as success if you forget to check.

## What it will not move, and why

Every skipped ref is named in the output with its reason — a silent exclusion and
a successful move look identical in a pipeline log.

| Skipped | Reason |
|---|---|
| another team's ref | not `linear.teamKey`; writing to an unconfigured team is the worst failure available here |
| no spec claims it | tracker-only work, or a typo in a trailer — nothing here can tell which |
| spec not complete | it landed via `/spec-to-main`; push still owns its state and would bounce it back |
| unreadable | Linear did not return the issue; dropped rather than guessed at |

A move that runs against the declared order — backwards, or skipping a rung —
**warns and proceeds**. A rollback from test and a hotfix going straight to prod
are both legitimate, and refusing either would be wrong on healthy input.
