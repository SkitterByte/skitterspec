---
github_issue_id: "#285"
---

# Phase 3 — Trim the small rules and the CLAUDE.md section ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the remaining always-loaded files carry their rules without the
narrative, so every distribution's total fits the 30k budget.

## Tasks

- [x] `negative-checks.md`: keep the four rules, one short example each. The
      incident table and bills go to `docs/rationale/negative-checks.md`.
- [x] `offered-unblocks.md`: keep the offer contract (fields, kinds, relay
      then offer, once per obligation). Its worked `satisfy` and "what this is
      not" go to rationale. Consider making it a supporting file of the skills
      that relay offers if those turn out to be few.
- [x] `commit-trailers.md` in all four providers: keep the trailer grammar
      and the rules. Merge styles and "why it exists" go to rationale. Keep the
      four copies identical apart from provider names.
- [x] `claude-md-section.md`: keep the everyday loop and a pointer per topic.
      Paragraphs that duplicate `spec-planning.md` go.
- [x] Use `alwaysLoaded` to print each distribution's total and record it in
      the Changelog. If any is over 30k, keep trimming.
- [x] Rebuild (`pnpm build`) and run `pnpm typecheck && pnpm test`, green
      before the phase is done.
