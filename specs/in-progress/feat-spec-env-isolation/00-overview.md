# Per-spec isolation — `/spec-env` (up) · `/spec-env-down` (teardown)

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-07-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-08
> **Area:** `src/env/` (new), `src/cli.js`, `src/init.js`, `assets/skills/` (new `spec-env`, `spec-env-down`; opt-in touches to `spec`, `spec-complete`, `spec-cancel`), `specs/.core/env.config.json` (new, opt-in), `.gitignore`, `README.md`, `assets/rules/`, `test/`
>
> **Note:** the Warp-specific opener layer was dropped 2026-07-08 for a generic
> `open.command` — see Decision #1 and the changelog.

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

1. **Two isolation layers + an optional opener.** (a) a **git worktree** per spec
   — the real unlock: N sibling directories, each on its own branch, sharing one
   `.git`, no stashing; (b) **Docker** per worktree — a per-spec
   `COMPOSE_PROJECT_NAME` namespaces containers, networks, and **named volumes** so
   each stack and its state are isolated and individually snapshottable; (c) an
   **optional, editor/terminal-agnostic `open.command`** template — one config
   knob (`code {worktreePath}`, a `tmux new-window …`, a `warp://` deeplink, or
   empty for none). Rejected doing only worktrees (leaves stacks/state colliding).
   Rejected a **Warp-specific Tab Config** subsystem (2026-07-08): the value is in
   worktree+Docker (both terminal-agnostic); Warp's format is mid-transition
   (Launch Configs → Tab Configs, no on-disk examples to verify), its `warp://`
   deeplink silently drops `commands:` (Warp bug #9007), and CLI Tab Config opening
   is unshipped (#12343) — not worth owning a proprietary format in a
   general-purpose scaffold. A `warp://` deeplink is still usable *via*
   `open.command` for those who want it.
2. **Deterministic engine in code, thin skills.** Registry, port math, config
   load, spec/branch resolution, `.env` + Warp `.toml` generation are pure,
   side-effect-free functions in `src/env/` behind a
   `skitterspec spec-env <up|down|status>` CLI seam, unit-tested with no live
   git/docker. Mirrors the repo's `spec-sync` seam pattern (Linear spec, decision
   #3). Rejected putting this logic in skill prose (non-deterministic, untestable).
3. **Engine plans, skill executes side effects.** `spec-env up/down` allocate/free
   the slot, write the worktree `.env`, and **print the exact `git worktree` /
   `docker compose` commands, the expanded `open.command`, and a summary**; the
   thin skills run those git/docker/open commands. Keeps the engine deterministic
   and testable. Rejected the engine shelling out to git/docker itself (side
   effects → hard to test).
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
  "open": { "command": "" },
  "registry": ".spec-env/registry.json",
  "linkLinear": true,
  "guards": { "refuseTeardownIfDirty": true, "refuseTeardownIfUnpushed": true }
}
```

**Registry — `.spec-env/registry.json`** (primary checkout root, gitignored):

```json
{ "slots": { "feat-linear-hybrid-sync": 0, "feat-spec-env-isolation": 1 } }
```

Keyed by the **spec folder name** (not the bare slug) so a `feat-foo`/`bug-foo`
pair can't collide on one slot.

Slot `n` → `PORT_OFFSET = portBase + n * portsPerSpec`. Each service in the
consumer's `docker-compose.yml` references `${PORT_OFFSET}` so its ports land in
the spec's reserved block; `COMPOSE_PROJECT_NAME` (in the worktree's `.env`)
namespaces containers/networks/volumes automatically.

`open.command` is an optional, editor/terminal-agnostic template expanded with
`{worktreePath}`/`{slug}`/`{branch}`/`{projectName}`/`{portOffset}` — e.g.
`code {worktreePath}`, `tmux new-window -c {worktreePath}`, or a `warp://`
deeplink. Empty (default) → nothing is opened, the path is just printed.

**CLI seam:** `skitterspec spec-env up|down|status <spec> [flags]`.
- `up` — resolve spec → slug/type/branch; allocate slot; write worktree `.env`
  (`COMPOSE_PROJECT_NAME`, `PORT_OFFSET`); **print** the `git worktree add` /
  `docker compose up` commands, the expanded `open.command` (when set), and a
  port/summary block. Idempotent (existing slot → attach).
- `down` — evaluate guards; **print** the `docker compose down` (+ volume
  handling + optional pre-drop backup) and `git worktree remove` commands; free
  the slot. Idempotent no-op when already gone.
- `status` — read-only; list provisioned specs, slots, port blocks from the
  registry.

**Skills:** thin `/spec-env` and `/spec-env-down` wrappers that call the CLI and
run the printed git/docker/open commands, plus **documented opt-in** hooks from
`/spec` (provision on create), `/spec-complete` / `/spec-cancel` (teardown on
finish) — gated by config, never hard-wired.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config + registry + resolve engine (the seam) | ✅ | [01-config-registry-resolve.md](01-config-registry-resolve.md) |
| 2 | Provision — `spec-env up` + `/spec-env` skill | ✅ | [02-provision-spec-env.md](02-provision-spec-env.md) |
| 3 | Teardown — `spec-env down` + `/spec-env-down` skill | ⬜ | [03-teardown-spec-env-down.md](03-teardown-spec-env-down.md) |
| 4 | Wire-in + docs + opt-in hooks | ⬜ | [04-wire-in-and-docs.md](04-wire-in-and-docs.md) |

## Open questions

- [x] ~~Warp Tab Config `.toml` schema~~ — **resolved 2026-07-08 by dropping the
      Warp-specific layer** in favour of a generic `open.command` template (see
      Decision #1 and the 2026-07-08 changelog entry). No proprietary format to
      verify or freeze.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-08 | Draft | backlog | Reuben Greaves |
| 2026-07-08 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-08 — Phase 2 done. Added `src/env/{provision,render}.js` (pure
  `planUp` + `renderEnvFile`/`expandOpenCommand`), wired `spec-env up`, wrote the
  `/spec-env` skill (+ symlink), 11 new tests (99 total, all green). Deviations:
  (a) the engine's **only write is the registry** — the worktree doesn't exist
  until the skill's `git worktree add`, so the engine renders the `.env` and
  *prints* it; the skill writes it post-add (truer to "engine plans, skill
  executes"). (b) `planUp(spec, { slot, attached }, config)` — the CLI allocates
  and passes `{ slot, attached }` rather than a raw registry. (c) The registry is
  **keyed by spec folder name** (e.g. `feat-demo`), not the bare slug, to avoid a
  `feat-foo`/`bug-foo` collision.
- 2026-07-08 — **Dropped the Warp Tab Config layer** for a generic, optional
  `open.command` template (editor/terminal-agnostic). Rationale: the isolation
  value is entirely worktree+Docker (both terminal-agnostic); Warp's config format
  is mid-transition with no on-disk examples to verify, its `warp://` deeplink
  silently drops commands (bug #9007), and CLI Tab Config opening is unshipped
  (#12343) — not worth owning a proprietary format in a general-purpose scaffold.
  Config `warp` block → `open: { command }`; this dissolves the Phase 2 Open
  question. Phase 1's shipped config schema updated to match (was already merged;
  the change is pre-functional, no consumer impact).
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
