# Phase 3 — Wire `/spec-push` to it, MCP preserved ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-push` uses the API path automatically when a key is present and
falls back to today's MCP steps otherwise, with both paths documented and the
transport always stated in the report.

## Tasks

- [ ] Rewrite `SKILL.md` steps 3–5: get the plan, call `apply`, report. Keep the
      legacy-mirror stop and the deferred-phases relay, which are plan-level and
      transport-independent.
- [ ] Keep the current steps 4, 4b and 5 as the documented **MCP fallback**,
      reached when `apply` reports no key or `--via mcp` was passed.
- [ ] Skip the `--workspace-states` MCP fetch on the API path, where `apply`
      resolves states itself; keep it required for MCP.
- [ ] Keep the interactive project picker in the skill for a first push, passing
      the result through as `--project`.
- [ ] Say which transport was used in the report, every time.
- [ ] Document `auth.keyEnv`, `apply.transport` and `--via` in the package README,
      including that the key is never written to the repo.
- [ ] Add tests covering the skill contract the CLI must satisfy — the fallback
      instruction text, and that no key present leaves today's behaviour intact.
      Run the project's test command — green before the phase is done.
