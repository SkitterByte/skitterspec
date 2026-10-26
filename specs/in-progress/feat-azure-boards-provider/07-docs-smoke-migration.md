---
linear_issue_id: "SKS-424"
github_issue_id: "#16"
---

# Phase 7 — Docs, live smoke, ereqs migration path 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** the provider is documented, smoke-tested live against the throwaway
org end to end, and ereqs has a written migration path off Linear — the last
blocker to cancelling the subscription is the client running it.

## Tasks

- [x] `docs/azure-boards.html` + docs index links; config reference doc
      (`azure-boards.config.md`) finalised.
- [x] Setup skill walk: interview to a valid `azure-boards.config.json`
      against the throwaway org (types, states, tags validated live —
      `init-config` refused a bad state with the live suggestion, wrote the
      defaults clean).
- [x] Live smoke on the throwaway org: link a spec, push phases, move states
      through the lifecycle, claim, intake-adopt a hand-filed item
      (original preserved as a comment), `release create/deployed/complete`
      dry-run then `--apply`.
- [x] Migration doc for ereqs: install the dist, run setup, push open specs
      (backlog + in-progress link by ordinary push; complete/cancelled keep
      `linear_*` stamps), set `refs.foreignPatterns` to the Linear team key,
      swap CI release calls — ending at "Linear can be cancelled"
      (MIGRATION.md's azure-boards section, shipped in every dist).
- [ ] First release: cut `skitterspec-azure-boards@1.0.0` via the normal tag
      push + `npm run approve` flow.
- [x] Tests green: full workspace suite (`pnpm test`); smoke results recorded
      in this file's notes.

## Notes

Smoke ran 2026-10-26 against the throwaway `rjgreaves/spike` (Basic process),
work items AB#4–AB#7:

- doctor --check-remote: all ok; identity row WARNS on the spike PAT (no
  Identity (Read)) exactly as designed.
- mint (AB#4 + child AB#5), update, closed loop to "in sync"; whoami derived
  from the PAT and cached; assign stamped and pushed.
- intake: hand-filed HTML item AB#6 stamped (verified live), preserve posted
  the reduced text and was idempotent.
- released: AB#n counted, an SKS-n trailer counted historical.
- release verbs: dry run wrote nothing; --apply minted AB#7 titled v0.2.0 with
  AB#4 Related-linked + commented; retry said "already noted"; deployed moved
  the item Doing → Done through the envs; complete closed it.
- Two live fixes came out of the smoke: `connectionData` needs
  `api-version=7.1-preview.1` (plain 7.1 refused), and every adapter op now
  accepts `AB#n` as well as the bare number — the kit hands back whatever was
  stamped.

The first release waits on the spec landing (the tag is cut from main) and on
the operator consenting to the tag push — tag pushes publish via CI.
