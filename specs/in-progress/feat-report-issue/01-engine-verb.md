---
github_issue_id: "#338"
---

# Phase 1 — Engine verb: target, redaction, URL, duplicates ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec report-issue` prints a redacted preview, a capped
issue-form URL and possible duplicates, and opens the URL on `--open`. Each
rule is proven by unit tests on a pure planner.

## Tasks

- [x] Add `packages/common/src/report-issue.js` with a pure
      `planReport({ kind, title, body, skill, pkg, origin, home, root, env })`.
      It returns `{ refused?, redirect?, title, fields, url, truncated, fullBody }`
- [x] Resolve the target from `repository.url`. A missing or non-GitHub value
      refuses with the reason
- [x] Redirect when `origin` normalises to the target (https, ssh, `.git`)
- [x] Redact `$HOME`, the repo root, the repo name and the remote URL in the
      title and every field. Leave a word that only contains the repo name as
      a substring alone
- [x] Build the issue-form URL with field ids matching phase 2's forms. Cap it
      at 8,000 characters by trimming the longest field with a marker, and
      return the full body
- [x] Add a best-effort duplicate search (anonymous `fetch`, 5s timeout). Any
      failure gives `cannot tell`, never "none found"
- [x] Wire `report-issue` into `packages/common/src/cli.js`, with text and
      `--json` output, plus `--open` through the platform opener, falling
      back to printing the URL
- [x] Add `packages/common/test/report-issue.test.js` covering: the target
      from https and ssh `repository.url`, a missing url refusing, the
      self-repo redirect, each redaction, the substring stays-silent case,
      the cap trimming with the full body returned, the duplicate search
      giving `cannot tell` on a failed fetch, and a healthy short report
      left untouched
- [x] Run `pnpm build` and `pnpm test` until green

## Notes

Keep the network call and the opener out of `planReport` so that every test is
offline. The field ids are a contract with `.github/ISSUE_TEMPLATE/*.yml`.
Define them once as exported constants, which phase 2's test asserts against.
