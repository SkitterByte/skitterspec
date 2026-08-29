# Phase 3 — Wire `/spec-push` to it, MCP preserved ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-push` uses the API path automatically when a key is present and
falls back to today's MCP steps otherwise, with both paths documented and the
transport always stated in the report.

## Tasks

- [x] Rewrite `SKILL.md` steps 3–5: get the plan, call `apply`, report. Keep the
      legacy-mirror stop and the deferred-phases relay, which are plan-level and
      transport-independent.
- [x] Keep the current steps 4, 4b and 5 as the documented **MCP fallback**,
      reached when `apply` reports no key or `--via mcp` was passed.
- [x] Skip the `--workspace-states` MCP fetch on the API path, where `apply`
      resolves states itself; keep it required for MCP.
- [x] Add `spec-sync states [--json]` — the transport decision, asked before any
      MCP work, and on the API path the state names themselves (see Notes).
- [x] Keep the interactive project picker in the skill for a first push, passing
      the result through as `--project`.
- [x] Say which transport was used in the report, every time.
- [x] Document `auth.keyEnv`, `apply.transport` and `--via` in the package README,
      including that the key is never written to the repo.
- [x] Add tests covering the skill contract the CLI must satisfy — the fallback
      instruction text, and that no key present leaves today's behaviour intact.
      Run the project's test command — green before the phase is done.

## Notes

**Deviation from the plan: one new verb, `spec-sync states`.** The skill had a
chicken-and-egg the spec did not anticipate — it cannot know the transport until
something tells it, but `push` refuses to run without `--workspace-states`, which
on the MCP path only an MCP call can supply. The alternatives were both worse:
routine `--skip-state-check` would hollow out a guard that exists because Linear
silently ignores an unknown state, and guessing from the environment would
duplicate the `auth.keyEnv` resolution the engine already owns. Asking the engine
first makes the skill linear, keeps the state gate intact on **both** paths, and
removes the state fetch from the model's work entirely on the API path.

The skill's MCP instructions are kept whole as steps 4a/4b/5 rather than trimmed:
someone whose only Linear access is their MCP session still needs the complete
set, and `--via mcp` reaches it deliberately.
