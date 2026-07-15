# Release Notes

> **⚠️ Historical — no longer maintained.** This file records the
> single-package-era `skitterspec 1.0.x`. The generator was removed when the
> repo became a monorepo; releases now run per package via `scripts/release.js`
> (see [RELEASING.md](RELEASING.md)). Per-package release-note generation is a
> later deferred spec — until then this is history, not the current record.

What's new for users of skitterspec. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 1.0.0 — 9 Jul 2026

**Highlights:**
- Adopt per-spec isolation and every spec now gets its own git
- Work several specs at once — /spec-env gives each spec its own git worktree and a namespaced Docker stack (isolated volumes and a reserved port block), and /spec-env-down tears it down safely (backs up volumes, refuses to destroy dirty or unpushed work). Opt in by copying specs/.core/env.config.json.example to env.config.json.

### Env
- **New** — Work several specs at once — /spec-env gives each spec its own git worktree and a namespaced Docker stack (isolated volumes and a reserved port block), and /spec-env-down tears it down safely (backs up volumes, refuses to destroy dirty or unpushed work). Opt in by copying specs/.core/env.config.json.example to env.config.json.

### Isolation
- **New** — Adopt per-spec isolation and every spec now gets its own git

### Setup
- **New** — skitterspec init can now enable per-spec isolation for you

### Specs
- **Improved** — The spec workflow no longer keeps specs/backlog and specs/complete index files — the folder buckets, spec headers, and State logs are the source of truth. Running skitterspec update removes any left behind.

### Sync
- **New** — When Linear sync is enabled, /spec now creates the matching Linear project and a milestone per phase and links the spec, while /spec-go pulls the latest from Linear before you build. Without Linear configured, both commands behave exactly as before.
- **New** — New /spec-status, /spec-pull, and /spec-push commands sync a spec with its linked Linear project — git-style. Status shows per-field divergence; pull and push apply changes with conflict refusal and a --force escape hatch that backs up the losing side.

## 0.1.0 — 30 Jun 2026

**Highlights:** skitterspec init now guides you through enabling changelog and release-note generation — choose the filenames and product name, and it wires the npm version hook so both regenerate on every release.

### Install
- **New** — skitterspec init now guides you through enabling changelog and release-note generation — choose the filenames and product name, and it wires the npm version hook so both regenerate on every release.
