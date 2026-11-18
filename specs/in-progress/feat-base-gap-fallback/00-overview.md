---
github_identifier: "#230"
github_url: "https://github.com/SkitterByte/skitterspec/issues/230"
---

# Base-branch gap: offer the fallback instead of refusing flat

> **Type:** Feature
> **Name:** feat-base-gap-fallback
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/230
> **Author:** Reuben Greaves
> **Raised:** 2026-11-18
> **Area:** packages/common/src/env/resolve.js, packages/common/src/env/config.js, packages/common/src/cli.js (`spec-env base` and every `resolveBaseBranch` caller), packages/common/src/ideacmd.js, packages/common/assets/rules/offered-unblocks.md, packages/common/assets/core/env.config.md, packages/common/assets/skills/{spec-start,spec-to-main,spec-complete,spec-diff,no-spec,spec-idea}/SKILL.md, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Summary

When a project picks its base from a rolling release branch (`baseBranchPattern`,
e.g. `20??/Q?`) and the current one has merged without the next being cut,
skitterspec now offers a one-press fix: use the fallback branch (master, or a
configured one) as the base until the next release branch appears. Today every
command refuses flat, including the review page.

## Problem

`baseBranchPattern` refuses whenever no remote branch matches, by design: forking
or landing onto the default branch by accident is exactly what it exists to
stop. But between quarters there is a real gap — `2026/Q4` merged to master,
`2027/Q1` not yet cut — and in it everything refuses, with no way through except
hand-editing `baseBranch` into the committed config. That bit in practice: a
`/no-spec` upgrade built fine and then its review was blocked
(`review blocked until there's a base branch — bump-skitterspec-2-14`). A refusal
with no reachable exit gets worked around rather than answered.

## Acceptance criteria

- With a pattern that matches nothing, a command that needs the base refuses
  **and offers** "Use master as the base for now" (or the configured fallback),
  following `offered-unblocks.md` as a `satisfy` offer.
- Taking the offer writes a local, gitignored pin; every command — read or
  write — then resolves to the fallback, and says so with a line like
  `base: master — no 20??/Q? branch on origin (pinned for the gap)`.
- Once a branch matches the pattern again, the pin is ignored and removed; the
  newest match is the base, with nothing typed.
- `baseBranchFallback` in `env.config.json` names the fallback; unset, it is
  `origin/HEAD`; neither readable → a plain refusal with no offer.
- The main-guard hook, the served epic page and the dashboard stay cannot-tell
  until someone has picked; after the pick they use the pinned base (so writes
  on master in the primary checkout are refused).
- Nothing changes for a project without `baseBranchPattern`, or for one whose
  pattern matches.

## Decisions

1. **Refuse with an offer, not a silent fallback, for every command that can
   ask — reads included.** Chosen over "reads fall back silently": a review page
   compared against the wrong base is still a wrong page, and the person should
   choose that once. The cost (the first read blocks on a question) is bounded:
   one pick covers everything after it.
2. **One pin covers every command** until a match appears. Rejected: separate
   read and write picks — the second question asks the same thing again.
3. **The offer is `satisfy`, not `bypass`.** It gives the guard what it asked for
   (a base), it does not step past it. So it is not recorded and not limited to
   once — but it is still never pre-selected, and Cancel is always the other
   option (`offered-unblocks.md`).
4. **The pin is local** — `.spec-env/base-pin.json` in the primary checkout,
   gitignored with the rest of `.spec-env/`. Rejected: writing `baseBranch` into
   `env.config.json`, which changes everyone's config and never undoes itself.
   The pin records the pattern it was made under; a pin for a different pattern
   is ignored.
5. **The pin clears itself.** The resolver ignores a pin whenever the pattern
   has a match; the CLI deletes the file the first time it sees that. A pin can
   therefore never outlive the gap and quietly hold the base on master.
6. **Fallback chain: `baseBranchFallback` → `origin/HEAD` → no offer.** A team
   that releases from a test branch names it. Rejected: reusing
   `hotfix.releaseBranch` — it means the release line for hotfixes, a different
   concept that happens to be master in one project.
7. **Surfaces that cannot ask stay cannot-tell until a pick exists.** The
   main-guard hook, the served epic page and the dashboard keep today's
   behaviour (hook fails open, pages say cannot tell) before the pin; after it,
   they resolve to the pinned base like everything else. Rejected: having them
   fall back unasked — the only places that act on an unasked fallback would be
   the ones nobody is looking at.
8. **`/spec-idea` is a write.** It commits onto the base branch, so it gets the
   same refusal-with-offer; an idea quietly landed on master would never reach
   the next release branch.
9. **The engine declares the offer; skills only relay it.** `describeBaseBranch`
   returns the offer as data, `--json` refusals carry it as `offer`, and text
   output prints the command. No skill infers a fallback from the reason text.

## Solution overview

- **Resolver** (`env/resolve.js`): `describeBaseBranch(config, git, pin)` gains
  two outcomes under a pattern with no match — `how: 'gap-pin'` when a valid pin
  exists (base = pinned branch), else the existing refusal plus
  `offer: { kind: 'satisfy', label: 'Use <fallback> as the base for now',
  command: 'skitterspec spec-env base --use-fallback' }` when a fallback
  resolves, and no offer when it does not. `BaseUnresolvedError` carries the
  offer. The resolver stays pure and synchronous; the pin is read by the CLI
  and passed in.
- **Pin store**: `.spec-env/base-pin.json` — `{ base, pattern, pinnedAt }`.
  `spec-env base --use-fallback` writes it (refusing if the pattern matches or no
  fallback resolves); `spec-env base --unpin` removes it; `spec-env base` reports
  it. Any resolution that finds a match deletes a stale pin.
- **Config**: `baseBranchFallback` (string, validated like the pattern: no
  whitespace, no `..`, unusable = unset). Only consulted under a pattern.
- **Callers**: every `resolveBaseBranch` caller reads the pin through one helper,
  and every refusal path prints the offer (text) / carries it (`--json`). The
  base line on the review page, `review`, `status`, `resolve` and `base` shows
  `(pinned for the gap)` when `how === 'gap-pin'`.
- **Skills**: `offered-unblocks.md` gains the base-gap offer as its worked
  `satisfy` example; skills that relay a base refusal (`/spec-start`,
  `/spec-to-main`, `/spec-complete`, `/spec-diff`, `/no-spec`, `/spec-idea`)
  relay first, then put the offer's label and Cancel to the operator, then retry.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `baseBranchFallback` (env.config.json) |
| Local state | add | `.spec-env/base-pin.json` `{ base, pattern, pinnedAt }` |
| CLI command | update | `spec-env base` + `--use-fallback`, `--unpin`; reports the pin |
| Domain object | update | `describeBaseBranch` → `how: 'gap-pin'`, refusal `offer` |
| CLI output | update | base refusals print/carry the offer; `(pinned for the gap)` on the base line |
| Business rule | update | main guard / epic page / dashboard resolve via the pin once it exists |
| Skill/rule | update | `offered-unblocks.md`; spec-start, spec-to-main, spec-complete, spec-diff, no-spec, spec-idea relay the offer |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Resolver, pin store and `spec-env base` verbs | ✅ | [01-resolver-and-pin.md](01-resolver-and-pin.md) |
| 2 | Every caller honours the pin and carries the offer | ✅ | [02-callers-and-offer.md](02-callers-and-offer.md) |
| 3 | Skills relay the offer; docs | ⬜ | [03-skills-and-docs.md](03-skills-and-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-18 — Spec created, from a `/no-spec` review blocked in the gap
  between `2026/Q4` merging and `2027/Q1` being cut.
- 2026-11-18 — Phase 1: `--use-fallback` refuses on a failed fetch (cannot
  tell a gap from an unfetched remote); a named `baseBranchFallback` must
  exist locally or on the remote, else no offer. The `env.config.md` key
  entry landed here; the rolling-base passage is still phase 3's.
- 2026-11-18 — Phase 2: the pin reaches callers as `config.gapPin`, a
  non-enumerable getter `loadEnvConfig` attaches, rather than a helper at
  each call site — the review server loads config once and lives for days,
  so the pin is re-read on every resolve. The `spec-env` dispatcher retires a
  stale pin and turns `BaseUnresolvedError` into the refusal + offer. The gap
  line goes on review (text, JSON `baseGap`, page), `status` and integrate
  plans; `resolve` never reads the base, so it gets none.
