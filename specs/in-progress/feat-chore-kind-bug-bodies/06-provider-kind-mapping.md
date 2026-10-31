---
github_issue_id: "#81"
---

# Phase 6 — GitHub/Jira/Linear kind mapping + migration note ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every provider can mint a kind in its own idiom — label (GitHub,
Linear) or issue type (Jira) — falling back to its default when unmapped; and
consumers have a written migration path.

## Tasks

- [x] GitHub: add `github.labelsByKind` (kind → label name) to
      `packages/github/src/config.js`; minting a spec applies the kind's
      label alongside the existing spec/phase markers. No mapping → no label,
      as today. (Kind read off the folder prefix via `specKindOf`, threaded
      into `applyOps`.)
- [x] Linear: add `linear.labelsByKind` with the same shape and fallback.
      (New `listLabels(teamId)` adapter op resolves name → id once per apply;
      a label the team lacks is a one-line note and an unlabelled mint, never
      a failed push.)
- [x] Jira: add `jira.issueTypeByKind` (kind → issue type name); minting uses
      it over `jira.issueType`, falling back when unmapped.
- [x] All three: validate only known kinds (`feature`, `bug`, `hotfix`,
      `chore` — the kind vocabulary all providers share), dropping unknown
      keys the way Azure does.
- [x] Update `docs/github.html`, `docs/jira.html`, `docs/linear.html` with
      the new keys; bump each page's `verified:` in the same commit. (The
      GitHub and Linear pages' "sync never pushes labels" claims gained the
      kind-label exception; key references live in each provider's
      `*.config.md` + json example.)
- [x] MIGRATION/changelog note: consumers must create any custom type (e.g.
      Azure `Chore`) and its states in their process **before** mapping it;
      configs without a mapping keep working unchanged; assets arrive via
      `skitterspec update`. (New top section in `MIGRATION.md`.)
- [x] Tests per provider: mapped kind mints the label/type; unmapped kind
      falls back (stays-silent — the payload is byte-identical to today).
      Typecheck + tests green. (GitHub 120, Jira 114, Linear 822; whole
      monorepo green.)
