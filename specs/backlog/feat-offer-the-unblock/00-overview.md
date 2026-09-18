# Offer the unblock instead of a bare refusal

> **Type:** Feature
> **Name:** feat-offer-the-unblock (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/live.js`, `packages/common/src/env/review.js`, `packages/common/src/cli.js`, `packages/common/assets/rules/`, `packages/common/assets/skills/spec-diff/`
> **Stack:** worktree

## Problem

A refusal is a dead end. `/spec-live` on a worktree with uncommitted work prints
what is wrong and stops; a commit refused by an armed review gate does the same.
Both are correct and both leave the operator holding a command they now have to
reconstruct — and the second one, met in the wild, produced an immediate request
for a `--force` flag. That is the failure mode `spec-planning.md` already names:
**a gate whose exit nobody can reach gets switched off wholesale instead of
answered.**

The refusals are right. What is missing is the next step.
