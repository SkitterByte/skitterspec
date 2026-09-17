---
linear_issue_id: "SKS-337"
---

# Phase 3 — The CodeRabbit adapter ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `{ "use": "coderabbit" }` is the whole configuration — the engine
builds the command line for both scopes, parses the `--agent` event stream, and
tells an auth or rate-limit refusal apart from a clean review.

## Tasks

- [ ] Add `packages/common/src/env/reviewers/coderabbit.js` exporting
      `{ command(ctx), parse(stdout, { exitCode, stderr }) }` — the shape a
      bundled adapter fulfils, so a second one is a file rather than a
      refactor.
- [ ] Build the command line per scope: `working` →
      `cr review --agent --uncommitted --include-untracked`; `branch` →
      `cr review --agent --base ${base}`. The two match the render's own two
      modes, so what the page shows is what was reviewed.
- [ ] Parse the JSONL event stream: one JSON object per line, dispatched by
      `type`. `review_context` and `status` are context, `heartbeat` is ignored
      (and resets the timeout — pass a "saw output" signal back to the runner so
      a long review is not killed as a hang), `complete` ends it, `error` is an
      outcome rather than a finding.
- [ ] Map a finding to a check: prefer `codegenInstructions` where present, fall
      back to `comment`; take file and line from the finding's location; map its
      severity through `levelFor`.
- [ ] **Recognise the refusals by name** — not authenticated, rate limited, no
      network, unsupported platform — and return `did not run: <what>` rather
      than `clean`. This is the positive signal that keeps Decision 6 honest:
      the generic runner cannot tell these apart, and the adapter can.
- [ ] Wire `use: "coderabbit"` through `runReviewer` so a `use` entry needs no
      `command` or `format`, and a `use` naming an unknown adapter is reported as
      a config error at merge time rather than as a failed run later.
- [ ] Record fixture streams under `packages/common/test/fixtures/coderabbit/` —
      a review with findings, a clean review, an auth failure, a rate-limit
      failure, a stream cut off mid-way — and test `parse` against each. Fixtures
      rather than a live `cr`: the test suite must not need an account, a network
      or a rate-limit budget.
- [ ] Add a stays-silent test for a truncated stream: findings seen before the
      cut are kept, the outcome is `failed`, nothing throws.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The `--agent` stream's schema is additive by design — unknown event types and
unknown fields on a known event both mean "a newer CLI than this adapter". Both
are **ignored, never fatal**: dropping an unrecognised event is right, and
refusing the whole review because one line had a field we had not seen would
turn every CodeRabbit release into a broken adapter.

Verify the exact field names against `docs.coderabbit.ai/cli/reference` when
building this — the spec deliberately does not pin them, because they are
someone else's and they will move.
