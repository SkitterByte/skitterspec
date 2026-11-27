---
github_identifier: "#337"
github_url: "https://github.com/SkitterByte/skitterspec/issues/337"
---

# Report an issue to skitterspec from any session

> **Type:** Feature
> **Name:** feat-report-issue (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/337
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Area:** packages/common/src/report-issue.js (new), packages/common/src/cli.js, packages/common/assets/skills/spec-report-issue/SKILL.md (new), packages/common/assets/rules/spec-planning.md, packages/common/assets/claude-md-section.md, .github/ISSUE_TEMPLATE/ (new), specs/.core/github.config.json, docs/index.html, docs/reference.html
> **Stack:** worktree
> **Docs:** index, reference

## Summary

A `/spec-report-issue` skill lets anyone using skitterspec, in their own
project, send a bug or feature request straight to skitterspec's GitHub issues.
Claude drafts the report and the user sees exactly what will be posted, then
submits it in their browser. It arrives labelled for triage, ready for
`/spec #N`.

## Problem

When a session in someone else's project hits a skitterspec defect or a gap,
Claude writes a scratch file or a prompt, and the user has to carry it into a
skitterspec session and paste it. That is a lot of effort, so most reports
never arrive, and the ones that do skip the issue tracker, so nothing is
triaged before it becomes a spec. Our repo is public, so a report must never
carry the reporter's private project details unless they choose to include
them.

## Acceptance criteria

- In a project using skitterspec, `/spec-report-issue` drafts a report, shows
  the exact title and body, and on a yes opens a prefilled GitHub new-issue
  page for SkitterByte/skitterspec. Nothing is filed until the user presses
  Submit.
- A filed report carries the `triage` label plus `bug` or `enhancement`, even
  when the reporter has no write access to the repo.
- The body includes the skitterspec and provider versions, OS and Node. Home
  and project paths, the project's name and its remote URL are redacted.
- Likely duplicates among open issues are listed before submission. When the
  search fails, the report still proceeds.
- An over-long report is trimmed to fit the URL, and the full body is printed
  so the user can paste it in.
- Inside the skitterspec repo itself, the skill points to `/spec`, `/spec-bug`
  or `/spec-idea` and opens nothing.
- `/spec --from-issue` in this repo lists the reports that arrive.

## Decisions

1. **Prefilled issue-form URL, never an API post.** The user submits it in their
   browser, signed in as themselves. It needs no token, which most users lack,
   and nothing outward-facing happens without a person pressing a button.
   Rejected: API/MCP posting (a dead end without credentials), and API with a
   URL fallback (two paths for little gain).
2. **Issue forms apply the labels.** A `labels=` query parameter is ignored for
   reporters without write access, but a form's own `labels:` always applies.
   So `bug.yml` and `feature.yml` carry `triage` plus `bug` or `enhancement`.
3. **An allowlist for the body, and the user always sees a preview.** The body
   contains only the user's description, the skill that misbehaved, the engine
   command and its output, versions, OS and Node. Code, file contents, spec
   text and remotes go in only when the user adds them. Rejected: letting
   Claude choose what is relevant, which risks leaking a private project into
   a public tracker.
4. **An engine verb, `skitterspec report-issue`, does the mechanics.** It
   finds the target, collects the environment, redacts, enforces the cap,
   checks for duplicates and opens the browser. Claude only writes the prose,
   so the parts that guard privacy are tested with `node --test` rather than
   left to judgement. Rejected: assembling the URL inside the skill.
5. **The target comes from the installed package's `repository.url`.** It is a
   positive signal, already shipped, and needs no new configuration. A
   missing or non-GitHub value is cannot-tell, so the verb refuses rather than
   guessing a repo (`.claude/rules/negative-checks.md`).
6. **Preview, then open, as two calls.** `report-issue` with no flag prints the
   redacted title, body, URL and duplicates. `--open` opens the browser. The
   skill asks between them, so the user's yes always covers exactly what they
   saw.
7. **The duplicate check is anonymous and best-effort.** It runs the public
   search API with no token. Anonymous calls are limited to 60 an hour, so a
   limit hit, an error or no network prints `duplicates: cannot tell` and
   lets the report proceed. A real match is offered as a link, so the user
   can comment there instead.
8. **Over the cap, the body is trimmed and printed in full.** The URL is held
   to 8,000 characters. The longest field is trimmed with a marker, and the
   untrimmed body is printed for pasting.
9. **The skill is model-invocable and offers itself.** When a session hits what
   looks like a skitterspec defect, Claude offers `/spec-report-issue` instead
   of writing a scratch file. Submission stays the user's.
10. **In the target repo itself, the skill redirects.** When the session's
    `origin` is the target, the verb refuses and names `/spec`, `/spec-bug` and
    `/spec-idea`, because filing to yourself through a browser is a detour.
11. **Triage uses the existing intake.** `intake.label: "triage"` in our
    `github.config.json` makes `/spec --from-issue` list waiting reports, and
    the existing `bugLabels: ["bug"]` routes bugs to `/spec-bug`.

## Solution overview

```
skitterspec report-issue --kind bug|feature --title "<t>" --body-file <f> [--skill <name>] [--open]
```

- Reads `repository.url` from the installed skitterspec package. A non-GitHub
  or missing value means it refuses.
- Compares the target to `git remote get-url origin`. A match means it
  redirects to `/spec` and opens nothing.
- Adds an Environment section: the skitterspec version, the provider package
  and its version, the OS, Node, and the skill.
- Redacts `$HOME` → `~`, the repo root → `<project>`, and the repo name and
  remote URL → `<project>`, in the title and every field.
- Builds `https://github.com/<o>/<r>/issues/new?template=<kind>.yml&title=…&<field>=…`.
- Searches `repo:<o>/<r> is:issue is:open <title terms>` and lists up to
  five matches, or prints `cannot tell`.
- With `--open`, it opens the URL with `open`, `xdg-open` or `start`. If
  that fails it prints the URL, which works just as well.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec report-issue` |
| Skill/rule | add | `/spec-report-issue` (common, all distributions) |
| Skill/rule | update | spec-planning.md skill table, claude-md-section.md |
| Config key | update | this repo's `github.config.json` gets `intake.label: "triage"` |
| Repo config | add | `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done · ➖ cancelled.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine verb: target, redaction, URL, duplicates | ⬜ | [01-engine-verb.md](01-engine-verb.md) |
| 2 | Skill, issue forms and triage wiring | ⬜ | [02-skill-and-triage.md](02-skill-and-triage.md) |

## Open questions

- None

## Changelog

- 2026-11-27 — Spec created.
