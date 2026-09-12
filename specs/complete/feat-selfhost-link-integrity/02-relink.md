---
linear_issue_id: "SKS-132"
---

# Phase 2 — One command to relink ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `node scripts/claude-relink.js` restores the symlink convention for
anything shipped-but-copied, and says what it changed.

## Tasks

- [x] Add `scripts/claude-relink.js`, zero-dependency like every script here.
      For each shipped skill and rule not currently linked under `.claude/`,
      replace it with a symlink to the same target its siblings use
      (`../../packages/skitterspec-linear/assets/skills/<name>` for skills;
      rules point at their **source** package).
- [x] Read the target convention from the **existing links** rather than
      hardcoding a path — the two trees differ (skills point at the built dist,
      rules at source packages), and a hardcoded guess would silently link a rule
      to a directory that does not exist.
- [x] **Never touch `.claude/commands/`** — decision 3.
- [x] **Refuse to replace a file whose content differs from its target.** A copy
      that matches the asset is a link waiting to happen; one that does not is
      somebody's edit, and replacing it destroys work. Report those and change
      nothing (`.claude/rules/negative-checks.md` rule 4).
- [x] Add `--dry-run` printing what would change, and default to it if that is
      cheaper to reason about than a flag people forget.
- [x] Wire an npm script (`relink`) so it is discoverable beside `dev:link`,
      and mention it in the phase 1 failure message.
- [x] Add `scripts/claude-relink.test.js` over a temp fixture tree: a copy is
      relinked; an already-correct link is left alone; a command is untouched; an
      edited copy is refused and reported, not replaced.
- [x] **Decided:** applies by default, with `--dry-run` to preview — not the
      reverse. The usual case for preview-first is that a mistake is expensive;
      here it cannot be, because the only thing replaced is a file already
      byte-identical to its target, and everything with anything to lose is
      refused. Exits non-zero when it refuses, so a refusal is not silently
      scrolled past.
- [x] **Discovered:** the guard now *imports* the expected set and target
      resolver from `claude-relink.js` rather than defining its own. Two copies
      would drift, and the failure mode is a repo that still fails the very check
      that told you to run the fixer.
- [x] Run `pnpm test` at the repo root — green before the phase is done.

## Notes

Operates on a fixture directory in tests, never on the real `.claude/` — a test
that relinks the repo it is running in would rewrite the developer's checkout as
a side effect of `pnpm test`.
