---
name: spec-bug
description: Investigate a bug, capture it as a Bug-type spec, and drive it red→green. ALWAYS starts by reproducing the bug with a failing test, then writes the spec and works the test to green. Creates specs/in-progress/bug-<name>/00-overview.md. Use when the user reports a bug, says "/spec-bug", "investigate this bug", "this is broken — find and fix it", or pastes an error/stack trace.
---

# /spec-bug — investigate a bug, prove it with a failing test, fix it

This is the **bug** counterpart to `/spec` (which is for **features**, plan-only).
Unlike `/spec`, this skill is hands-on and test-first: it reproduces the bug as a
**failing test (RED)**, captures a lean Bug spec, then works the test to **GREEN**.

Spec type convention (see `.claude/rules/spec-planning.md`):
- Bug specs are named `bug-<kebab-name>`; feature specs `feat-<kebab-name>`.
- Every spec header carries `> **Type:** Bug` (or `Feature`).

## 1. Reproduce & isolate (light investigation)

Bugs are concrete — confirm, don't over-grill. Establish:

- **Repro:** exact steps / input that triggers it. Ask only if you can't derive it.
- **Expected vs actual:** what *should* happen vs what does.
- **Scope & blast radius:** which module(s)/endpoint(s)/package; one tenant or all.
- **Root cause:** read the code, trace it to `file:line`. Compare a working path
  against the broken one (the bug usually lives in the differential). Do NOT
  patch a symptom before you understand the cause.

## 2. Write the failing test FIRST (RED) — mandatory

Encode the **correct** (expected) behaviour as a test, then run it and confirm it
**fails for the right reason**:

- Put it where the suite already covers that area. Reuse existing test helpers /
  factories; follow the project's test rules (see `.claude/rules/`). Never
  hardcode dates — compute them relative to now.
- Run it with the project's test command. Quote the red output. A test that
  passes before the fix proves nothing — keep refining the assertion until it
  genuinely captures the bug.

## 3. Write the Bug spec

Create the spec **folder** `specs/in-progress/bug-<kebab-name>/` with its entry
point `00-overview.md` (every spec is a folder — never a bare file). A bug is
usually a single-pass fix, so the `## Fix` block can live directly in
`00-overview.md`. **If the fix needs phasing** (large/uncertain root cause),
split it into phase files (`01-<slug>.md`, `02-…`) with a phase index in
`00-overview.md`, exactly like a feature spec. It starts in `in-progress`
because work is already underway. Keep it lean:

```markdown
# Bug: <short title>

> **Type:** Bug
> **Status:** In Progress — fixing (red test added)
> **Author:** <git user.name — who reported/captured it>
> **Developer:** <git user.name — you, since you're fixing it now>
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <files/modules>

## Symptom

<observed wrong behaviour + repro steps; paste the error/stack if any>

## Root cause

<the actual cause, at `file:line`. One paragraph — be specific.>

## Failing test (red)

<test name + path; what it asserts. How to run it. Paste the red failure line.>

## Fix

- [ ] <the minimal change that addresses the root cause, not the symptom>
- [ ] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [ ] <any follow-up hardening, or "None">

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | In Progress | in-progress | <developer> |

## Changelog

- <YYYY-MM-DD> — Bug reproduced; failing test added (red).
```

The **State log** is the folder/status audit trail; later transitions
(`/spec-complete`, `/spec-cancel`) append a row. The **Changelog** is for the
fix narrative and decisions — keep them separate.

## 4. Drive to GREEN

- Implement the **minimal, root-cause** fix. Match surrounding code; honour all
  project rules (see `.claude/rules/`).
- Re-run the failing test → it must pass. Then run the project's typecheck and
  test commands to confirm no regressions. Quote results.
- Tick the Fix tasks, add a Changelog line (`- <date> — Fixed: <one line>; test green`).

If the root cause is large/uncertain and can't be fixed in one pass: keep the red
test, split the fix into phase files (`01-<slug>.md` …) with a phase index in
`00-overview.md`, and leave the spec in `in-progress` for `/spec-go` to continue.
Say so explicitly — don't fake green.

## 5. Report

Summarise: root cause, the failing→passing test, the fix, and the full test
result. The spec stays in `in-progress`; suggest `/spec-complete` to verify and
archive it. Do **not** `git commit` unless the user asks.
