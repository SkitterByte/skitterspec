---
github_issue_id: "#44"
---

# Phase 5 — stage claims the snapshot ✅

> **Status:** Done

**Goal:** a spec's own `specs/.core/azure-base/AB#n.base.json` is `owned`, not
`foreign`, without hand-editing `env.config.json` — and where it still can't
be, the engine says so at the moment it writes the file.

- [x] The superset binary threads the provider's `ENV_CONFIG_DEFAULTS` into
      the env engine as runtime defaults (beneath the project's
      `env.config.json`), so a fresh adoption needs no hand edit.
- [x] `apply` prints a one-line note when the snapshot it just wrote is not
      covered by the effective `spec.companionPaths` (positive signals only:
      isolation configured, config parsed; every cannot-tell stays silent —
      a project with no isolation sees nothing).
- [x] Tests green: `apply warns when env.config.json does not claim the
      snapshot it wrote`, and the stays-silent pair.
