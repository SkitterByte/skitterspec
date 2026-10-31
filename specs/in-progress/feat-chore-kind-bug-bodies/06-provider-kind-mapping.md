---
github_issue_id: "#81"
---

# Phase 6 — GitHub/Jira/Linear kind mapping + migration note ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every provider can mint a kind in its own idiom — label (GitHub,
Linear) or issue type (Jira) — falling back to its default when unmapped; and
consumers have a written migration path.

## Tasks

- [ ] GitHub: add `github.labelsByKind` (kind → label name) to
      `packages/github/src/config.js`; minting a spec applies the kind's
      label alongside the existing spec/phase markers. No mapping → no label,
      as today.
- [ ] Linear: add `linear.labelsByKind` with the same shape and fallback.
- [ ] Jira: add `jira.issueTypeByKind` (kind → issue type name); minting uses
      it over `jira.issueType`, falling back when unmapped.
- [ ] All three: validate only known kinds (`feature`/`feat`, `bug`,
      `hotfix`, `chore` — match each provider's existing kind vocabulary),
      dropping unknown keys the way Azure does.
- [ ] Update `docs/github.html`, `docs/jira.html`, `docs/linear.html` with
      the new keys; bump each page's `verified:` in the same commit.
- [ ] MIGRATION/changelog note: consumers must create any custom type (e.g.
      Azure `Chore`) and its states in their process **before** mapping it;
      configs without a mapping keep working unchanged; assets arrive via
      `skitterspec update`.
- [ ] Tests per provider: mapped kind mints the label/type; unmapped kind
      falls back (stays-silent — the payload is byte-identical to today).
      Typecheck + tests green.
