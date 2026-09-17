---
linear_issue_id: "SKS-336"
---

# Phase 2 — Findings on the page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env review <spec> --run-reviewers` renders a page whose checks
carry a source badge and a line anchor, with one outcome line per configured
reviewer — and a committing verdict is still available with a hundred findings
on it.

## Tasks

- [ ] Extend the check object to `{level, file, line, note, source}`. `line` and
      `source` are both optional — a written review supplies neither, and its
      checks must render exactly as they do today.
- [ ] Update `renderReviewBlock` — a `source` renders as a badge on the check, a
      `line` renders as `file:line` and anchors to that line in the file's diff
      (the file panels already carry `data-file`; reuse that machinery rather
      than inventing a second one).
- [ ] Add the **reviewer-outcome strip** above the checks list: one line per
      configured reviewer, `<name> — 12 findings` · `clean` · `cached` ·
      `did not run: <detail>`. It is present whenever any reviewer is
      configured, including when every one of them found nothing — that is the
      whole point (Decision 6).
- [ ] Add `--run-reviewers` to `spec-env review` in `packages/common/src/cli.js`:
      collect the diff, compute its hash, consult the cache, run what is missing,
      write the cache, pass checks and outcomes into the render.
- [ ] Merge check sources rather than letting one win: `--review <json>` checks
      first (a person's read leads), then machine checks grouped by reviewer.
      Add a test that both appear on one page.
- [ ] Assert the gate is untouched: a test rendering with N machine checks and
      zero comments, then sending `verdict: "commit"`, and asserting
      `judgeVerdict` returns `honoured: true`. This is the load-bearing
      guarantee of the whole spec and deserves its own named test.
- [ ] Assert the promotion path: replying to a machine check produces a comment
      carrying `check: <id>`, and *that* makes a committing verdict refuse until
      it is resolved.
- [ ] Add `--run-reviewers` to the usage block and the `spec-env` flag list.
- [ ] Extend `--json` output with `reviewers: [{name, state, detail, count}]`, so
      a skill can report outcomes without parsing the page.
- [ ] Add tests: the outcome strip renders for a reviewer that found nothing; a
      check with a `line` anchors; a check with no `source` renders unchanged
      (golden-test the existing written-review output so this phase cannot
      regress it).
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**Check ids stay positional** (`k0`, `k1`, …) and stay per-render. That is
already true and already correct: a check travels back in the same blob the page
was built from, so the id only has to be stable for this render. Machine findings
change that in one respect worth watching — a re-render after a cache miss
renumbers them, so a reply drafted against an old page and sent against a new one
would land on the wrong check. The page already sends the whole blob it was built
from, so this is not new; note it beside the id logic rather than fixing it here.

**The report contract is not being amended.** The banner's heading already
carries counts (`7 files, +212 −18`); adding `· 3 flagged by coderabbit` fills
the existing counts slot rather than adding a line, which
`.claude/rules/spec-reports.md` explicitly warns a third amendment would have to
argue hard for. Phase 4 makes that wording change in the skills; nothing in the
rule file changes.
