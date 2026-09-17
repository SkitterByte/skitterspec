---
linear_issue_id: "SKS-337"
---

# Phase 3 — The CodeRabbit adapter ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `{ "use": "coderabbit" }` is the whole configuration — the engine
builds the command line for both scopes, parses the `--agent` event stream, and
tells an auth or rate-limit refusal apart from a clean review.

## Tasks

- [x] Add `packages/common/src/env/reviewers/coderabbit.js` exporting
      `{ command(ctx), parse(stdout, { exitCode, stderr }) }` — the shape a
      bundled adapter fulfils, so a second one is a file rather than a
      refactor.
- [x] Build the command line per scope: `working` →
      `cr review --agent --uncommitted --include-untracked`; `branch` →
      `cr review --agent --base ${base}`. The two match the render's own two
      modes, so what the page shows is what was reviewed.
- [x] Parse the JSONL event stream: one JSON object per line, dispatched by
      `type`. `review_context` and `status` are context, `heartbeat` is ignored
      (and resets the timeout — pass a "saw output" signal back to the runner so
      a long review is not killed as a hang), `complete` ends it, `error` is an
      outcome rather than a finding.
- [x] Map a finding to a check: prefer `codegenInstructions` where present, fall
      back to `comment`; take file and line from the finding's location; map its
      severity through `levelFor`.
- [x] **Recognise the refusals by name** — not authenticated, rate limited, no
      network, unsupported platform — and return `did not run: <what>` rather
      than `clean`. This is the positive signal that keeps Decision 6 honest:
      the generic runner cannot tell these apart, and the adapter can.
- [x] Wire `use: "coderabbit"` through `runReviewer` so a `use` entry needs no
      `command` or `format`, and a `use` naming an unknown adapter is reported as
      a config error at merge time rather than as a failed run later.
- [x] Record fixture streams under `packages/common/test/fixtures/coderabbit/` —
      a review with findings, a clean review, an auth failure, a rate-limit
      failure, a stream cut off mid-way — and test `parse` against each. Fixtures
      rather than a live `cr`: the test suite must not need an account, a network
      or a rate-limit budget.
- [x] Add a stays-silent test for a truncated stream: findings seen before the
      cut are kept, the outcome is `failed`, nothing throws.
- [x] Run the project's typecheck and test commands — green before the phase is
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

## What this phase found

**The documented finding shape has no line number.** It is
`{type, severity, fileName, codegenInstructions, suggestions, comment}` — and
nothing else. So `lineOf` reads every plausible spelling (`range.start.line`,
`line`, `startLine`, `lineNumber`, `start_line`) and a finding with none is
**kept**: it loses its jump button, not its place on the page. Dropping it
would throw away the finding to punish a field we may simply not know the name
of.

**`severity` is `critical|major|minor|trivial|info|none`** — no `error`, which
the generic `levelFor` keys on. The adapter maps `critical`/`major` → `error` →
`flag` and everything else, including a severity this build has never seen, to
`confirm`. An unknown severity landing on `confirm` is deliberate: a page where
everything shouts is a page nobody reads.

**Auth and rate-limit failures are not a documented surface**, so `NOT_RUN`
matches on the CLI's own wording — which will change. That is acceptable
because of where the patterns run: only on output the generic rules have
already decided was a failure, or on an `error` event. A pattern that stops
matching costs the sharper sentence and nothing more; it can never turn a clean
review into an accusation.

**The task said the adapter should "recognise its refusals", which needed a
contract change the plan did not name.** `parse` had no way to influence the
outcome — the runner computed it from the exit code alone. It now returns
`said`, an outcome the adapter is sure of, and `reconcile` folds it in under one
rule: **an adapter may sharpen or downgrade, never upgrade a failure to clean.**
A timeout and a failed spawn are never overridden at all, because no amount of
parsing tells you anything about a process that was killed or never started.
That asymmetry is asserted directly — this is the layer where a vendor-specific
guess could produce the false clean the whole feature exists against.

**The unknown-`use` advisory lives in `cli.js`, not `config.js`.** The config
module knows shapes and the runner knows the registry; putting the check where
both are visible keeps `readReviewer` free of a dependency on the adapter list,
which is what its comment promised.
