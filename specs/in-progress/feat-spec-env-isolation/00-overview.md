# Per-spec isolation — `/spec-env` (up) · `/spec-env-down` (teardown)

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-07-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-08
> **Area:** `src/env/` (new), `src/cli.js`, `src/init.js`, `assets/skills/` (new `spec-env`, `spec-env-down`; opt-in touches to `spec`, `spec-complete`, `spec-cancel`), `specs/.core/env.config.json` (new, opt-in), `.gitignore`, `README.md`, `assets/rules/`, `test/`

## Problem

Only one spec can be "live" at a time: switching specs means stashing, checking
out a branch, and rebuilding whatever stack was running — while `main` is
hostage to whatever is checked out for hotfixes. There is no isolation between
concurrent specs' running services or their stateful data, so two specs cannot
be worked in parallel without port clashes and shared volumes. We want each
in-progress spec to have its own **worktree + namespaced Docker stack + Warp
tab**, so N specs run side by side, each physically separate, and `main` stays
clean.

## Decisions

1. **Three stacked isolation layers.** (a) a **git worktree** per spec — the real
   unlock: N sibling directories, each on its own branch, sharing one `.git`, no
   stashing; (b) **Docker** per worktree — a per-spec `COMPOSE_PROJECT_NAME`
   namespaces containers, networks, and **named volumes** so each stack and its
   state are isolated and individually snapshottable; (c) a **Warp Tab Config**
   per worktree that opens the dir, brings the stack up, and drops into an agent
   pane. Rejected doing only worktrees (leaves stacks/state colliding).
2. **Deterministic engine in code, thin skills.** Registry, port math, config
   load, spec/branch resolution, `.env` + Warp `.toml` generation are pure,
   side-effect-free functions in `src/env/` behind a
   `skitterspec spec-env <up|down|status>` CLI seam, unit-tested with no live
   git/docker. Mirrors the repo's `spec-sync` seam pattern (Linear spec, decision
   #3). Rejected putting this logic in skill prose (non-deterministic, untestable).
3. **Engine plans, skill executes side effects.** `spec-env up/down` allocate/free
   the slot, write `.env` + `.toml`, and **print the exact `git worktree` /
   `docker compose` / `warp://` commands + a summary**; the thin skills run those
   git/docker/warp commands. Keeps the engine deterministic and testable. Rejected
   the engine shelling out to git/docker itself (side effects → hard to test).
4. **Registry is the single source of truth.** `{registry}` (default
   `.spec-env/registry.json`) maps each active spec → a **slot index**. It lives
   at the **primary checkout root** (shared by all worktrees, machine-local,
   **gitignored**). Allocate the lowest free slot on provision; a spec's port
   block is `portBase + slot * portsPerSpec`. Free the slot on teardown. `up`
   reads it to be idempotent (existing slot → attach, don't reallocate).
5. **Config drives everything, opt-in.** All paths/patterns/toggles come from
   `specs/.core/env.config.json` (+ committed `.example.json`), following the
   `.core` convention. Loader merges over documented defaults and returns a
   `present` flag; absent = the feature is simply unused. Another project adopts
   it by editing values.
6. **Linear seam is optional, branch-only.** If `specs/.core/linear.config.json`
   exists and `linkLinear` is on, derive the branch from its `branch.pattern` +
   the spec's `linear_identifier` (frontmatter) so pushing fires Linear's GitHub
   automation. Otherwise fall back to `{type}/{slug}`. Nothing else depends on
   Linear.
7. **Slug/type from the folder name.** With no frontmatter, the spec folder name
   is the identifier; split its `feat-`/`bug-` prefix → `type` + `slug` (folder
   `feat-linear-hybrid-sync` → type `feat`, slug `linear-hybrid-sync`, branch
   `feat/linear-hybrid-sync`, worktree dir `linear-hybrid-sync`). Frontmatter
   (once Linear sync ships) overrides.
8. **Teardown guards + recoverable destruction.** Refuse teardown on a dirty
   worktree (`refuseTeardownIfDirty`) or unpushed commits
   (`refuseTeardownIfUnpushed`) unless `--force`. Volumes are the only destructive
   part: drop them unless `--keep-volumes`, but first run an optional config-driven
   `docker.backupCommand` (e.g. `pg_dump`) into `.spec-env/backups/` when set —
   skip with a clear message when unset. Idempotent: tearing down a gone spec is a
   clean no-op.

## Solution overview

**Config — `specs/.core/env.config.json`** (+ committed `.example.json`):

```json
{
  "worktree": { "root": "../{repo}-wt", "folderPattern": "{slug}" },
  "docker": {
    "enabled": true,
    "composeFile": "docker-compose.yml",
    "projectNamePattern": "{repoSlug}_{slug}",
    "portBase": 3000,
    "portsPerSpec": 10,
    "envFile": ".env",
    "backupCommand": ""
  },
  "warp": { "enabled": true, "tabConfigDir": "~/.warp/tab_configs", "openAgentPane": true },
  "registry": ".spec-env/registry.json",
  "linkLinear": true,
  "guards": { "refuseTeardownIfDirty": true, "refuseTeardownIfUnpushed": true }
}
```

**Registry — `.spec-env/registry.json`** (primary checkout root, gitignored):

```json
{ "slots": { "linear-hybrid-sync": 0, "spec-env-isolation": 1 } }
```

Slot `n` → `PORT_OFFSET = portBase + n * portsPerSpec`. Each service in the
consumer's `docker-compose.yml` references `${PORT_OFFSET}` so its ports land in
the spec's reserved block; `COMPOSE_PROJECT_NAME` (in the worktree's `.env`)
namespaces containers/networks/volumes automatically.

**CLI seam:** `skitterspec spec-env up|down|status <spec> [flags]`.
- `up` — resolve spec → slug/type/branch; allocate slot; write worktree `.env`
  (`COMPOSE_PROJECT_NAME`, `PORT_OFFSET`); generate a Warp Tab Config `.toml` +
  `warp://` deeplink; **print** the `git worktree add` / `docker compose up` /
  deeplink + a port/summary block. Idempotent (existing slot → attach).
- `down` — evaluate guards; **print** the `docker compose down` (+ volume
  handling + optional pre-drop backup), `git worktree remove`, and Warp-archive
  commands; free the slot. Idempotent no-op when already gone.
- `status` — read-only; list provisioned specs, slots, port blocks from the
  registry.

**Skills:** thin `/spec-env` and `/spec-env-down` wrappers that call the CLI and
run the printed git/docker/warp commands, plus **documented opt-in** hooks from
`/spec` (provision on create), `/spec-complete` / `/spec-cancel` (teardown on
finish) — gated by config, never hard-wired.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config + registry + resolve engine (the seam) | ✅ | [01-config-registry-resolve.md](01-config-registry-resolve.md) |
| 2 | Provision — `spec-env up` + `/spec-env` skill | ⬜ | [02-provision-spec-env.md](02-provision-spec-env.md) |
| 3 | Teardown — `spec-env down` + `/spec-env-down` skill | ⬜ | [03-teardown-spec-env-down.md](03-teardown-spec-env-down.md) |
| 4 | Wire-in + docs + opt-in hooks | ⬜ | [04-wire-in-and-docs.md](04-wire-in-and-docs.md) |

## Open questions

- [ ] Warp Tab Config `.toml` schema — verify the current Tab Config format
      against a live Warp install in Phase 2 before freezing the generator
      (must not emit the legacy YAML launch-config format).

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-08 | Draft | backlog | Reuben Greaves |
| 2026-07-08 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-08 — Phase 1 done. Shipped `src/env/{config,registry,resolve}.js` + a
  `spec-env status|resolve` CLI seam, 30 unit tests (all green, 88 total).
  Deviations: (a) JSON can't hold comments, so field docs live in an **adjacent
  `specs/.core/env.config.md`** doc block beside the valid-JSON
  `env.config.json.example` (satisfies "adjacent doc block"). (b) `allocateSlot`
  / `freeSlot` are **pure transforms over a registry object** (`(registry, name)
  → new registry`) rather than `(name)` mutators, with `readRegistry` /
  `writeRegistry` as the IO seam — keeps allocation unit-testable with no fs.
  (c) Unprefixed spec folders default `type` to `feat` (slug = whole folder).
- 2026-07-08 — Spec created. Decisions set via chat grill: three stacked
  isolation layers (worktree + namespaced Docker + Warp Tab Config); deterministic
  `src/env/` engine behind a `spec-env` CLI seam with thin skills; engine plans /
  skill executes side effects; slot registry at the primary checkout root
  (gitignored) as idempotency source of truth; `COMPOSE_PROJECT_NAME` for volume
  isolation; slug/type split from the folder-name prefix; optional Linear seam for
  branch naming (degrades to `{type}/{slug}`); teardown guards with config-driven
  pre-drop backup.
