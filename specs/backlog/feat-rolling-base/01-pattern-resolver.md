---
github_issue_id: "#114"
---

# Phase 1 — `baseBranchPattern` + resolver ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the base resolves to the newest pattern match from local remote-tracking
refs, and refuses when nothing matches — proven by pure resolver tests.

## Tasks

- [ ] Add `baseBranchPattern` (string, default `""`) to `DEFAULT_CONFIG` and the
      parser in `env/config.js`; reject a pattern containing whitespace or `..`
- [ ] `resolveBaseBranch`: after the explicit pin, when a pattern is set, read
      `for-each-ref --sort=-committerdate refs/remotes/<remote>/<pattern>` via
      the injected `git` and return the newest, remote prefix stripped
- [ ] No match → a structured refusal (`{ refused: 'no branch matches <pattern> — run spec-env base to fetch' }`), never a fall-through to origin/HEAD; thread it to the callers that already handle a resolve failure
- [ ] Comment the blind spot beside the check: unfetched refs look identical to
      "no rc exists" (`negative-checks.md` rule 2)
- [ ] Tests: pin beats pattern; newest-by-date wins over name order; one match;
      no match refuses; pattern unset → today's chain byte-identical (stays-silent);
      run `pnpm test` — green before done

## Notes

Sort by committer date, not name — chosen in grilling. Name order is wrong the
first time a team names an rc out of sequence.
