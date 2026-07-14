# @skitterbyte/skitterspec-linear

Spec-driven development for [Claude Code](https://claude.com/claude-code), **with
Linear hybrid-sync**. A strict **superset** of
[`@skitterbyte/skitterspec`](https://www.npmjs.com/package/@skitterbyte/skitterspec):
everything in the base filesystem workflow, plus git-like sync between a spec and
its linked Linear project.

```sh
npx @skitterbyte/skitterspec-linear init
```

Install **this OR the base**, never both — this package contains the entire base.

## What the superset adds

On top of the base skills (`/spec`, `/spec-go`, isolation, …):

- **`/spec-status`** — read-only, per-field divergence (local-only / remote-only /
  conflict / in-sync). Changes nothing.
- **`/spec-pull [--force]`** — Linear → repo. Applies remote-only fields; refuses
  to clobber a conflicting local edit unless `--force`.
- **`/spec-push [--force]`** — repo → Linear. Ownership-respecting,
  concurrency-checked; refuses if Linear moved since base unless `--force`.
- **`spec-sync` CLI** (`skitterspec-linear spec-sync …`) — the deterministic
  engine behind the skills, for CI / local runs.

The shared `/spec` and `/spec-go` skills come composed with the Linear steps
filled in: `/spec` links a new spec to a Linear Project (a Milestone per phase),
and `/spec-go` pulls first so you build against the current shared state.

## Opt-in

Linear sync is inert until `specs/.core/linear.config.json` exists — copy the
scaffolded `linear.config.json.example` and fill in your team / initiative IDs
(every field is documented in `specs/.core/linear.config.md`). Without it, this
behaves exactly like the base.

**Mapping** (config-driven): spec folder → Linear **Project**; each phase → a
**Milestone**; tasks → **Issues**; an optional **Initiative** groups specs.
**Field ownership** (`both` / `pull` / `push`) collapses conflicts — only a `both`
field that moved on both sides is a real conflict, and `--force` backs up the
losing side before winning. **Base sidecars** (`specs/.core/linear-base/`) are
committed; **backups** (`specs/.core/linear-backups/`) are gitignored.

Branch naming that embeds the Linear id lives in the isolation config
(`env.config.json` → `branch.pattern` with `{identifier}`, `branch.identifierField:
"linear_identifier"`), not in `linear.config.json`.

## Migrating from `@skitterbyte/skitterspec` v1

If you used Linear sync on the old base, switch here and re-run `init` — see
[MIGRATION.md](../../MIGRATION.md). Your `specs/.core/linear.config.json` path is
unchanged.

MIT © Reuben Greaves
