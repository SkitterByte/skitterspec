# Phase 2 — Modernise the link fragment to `apply` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** linking a spec takes the same fast path `/spec-push` does, so `/spec`
stops creating issues by hand — and the fragment is correct before phase 3
reuses it in two more skills.

## Tasks

- [ ] Rewrite `seams/spec-tracker-link.md` to link via the engine: ask
      `spec-sync states` for the transport, get the plan, then one
      `spec-sync apply` — mirroring what `/spec-push` step 4 now does.
- [ ] Keep the project picker as the interactive step it has to be, passing the
      result through as `--project <id>`.
- [ ] Keep the MCP path documented as the fallback for anyone without a key, the
      same way `/spec-push` does — this is not a deprecation.
- [ ] Drop the hand-stamping instructions the engine now does itself, and check
      no step still tells the agent to edit frontmatter directly.
- [ ] Re-check `seams/spec-project-picker.md` for the same drift and update it if
      it assumes the MCP-only flow.
- [ ] Add tests: the link fragment names `spec-sync apply` and no longer tells the
      agent to create the issue itself; it still names the picker; the MCP
      fallback survives. Run the project's typecheck and test commands — green
      before the phase is done.

## Notes

This is a pre-existing drift, not new breakage: `spec-tracker-link` was written
before the API path existed and was missed when `/spec-push` was rewritten. It is
sequenced before phase 3 so the fix is not copied into `/spec-bug` and
`/spec-hotfix` along with the fragment.
