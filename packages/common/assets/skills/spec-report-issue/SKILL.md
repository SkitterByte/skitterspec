---
name: spec-report-issue
description: Report a bug or feature request about skitterspec itself to its own GitHub issues, not this project's tracker, through a prefilled form the user submits. Use when the user says "/spec-report-issue", "report this to skitterspec", "file a skitterspec bug", or when a session hits what looks like a skitterspec defect, offering it instead of writing a scratch file or a prompt to paste elsewhere.
---

# /spec-report-issue — send it upstream

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

This files to **skitterspec's** repository, the one in the installed package's
`repository.url`. It is not for this project's own bugs: those are `/spec-bug`,
and this project's ideas are `/spec-idea`.

**Nothing is filed by you.** The engine builds a prefilled GitHub form and the
reader presses Submit in their own browser, signed in as themselves. That repo
is **public**, so the reader always sees the exact text before the form opens.

## When to offer it unasked

When a session in any project hits what looks like a skitterspec defect,
offer this skill **once**, in one line, instead of writing a scratch file or a
prompt for someone to paste into another session. Examples: an engine command
crashing, a skill contradicting a rule, or a guard refusing a healthy tree.
Do not offer it for the project's own bugs, and do not offer it again after a
decline.

## 1. Pick the kind

`bug` for behaviour that differs from what a skill or the docs say, and
`feature` for something missing. Take it from the invocation or the
conversation. Ask only when it is genuinely unclear.

## 2. Draft from the allowlist

Write a title (one line, under 80 characters) and a description in Markdown.
For a feature, say what the reader wanted to do and what got in the way. For a
bug, say what happened, what was expected and the steps that led there.

**Only these may go in:**

- the reader's own description of the problem, in their words where they gave
  them;
- the skitterspec skill or command that misbehaved;
- the engine command that was run and its output, trimmed to the lines that
  show the fault.

**These stay out unless the reader adds them:** the project's code, file
contents, spec text, ticket numbers, branch names, client or product names,
and anything from the project's tracker. The engine redacts paths, the
project's name and its remote, but it cannot recognise a client name in prose,
so the draft must not carry one.

Write the description to a scratch file. The engine adds the environment
(versions, provider, OS, Node) itself, so do not write it yourself.

## 3. Preview

```
skitterspec report-issue --kind <bug|feature> --title "<title>" --body-file <file> --skill <skill-name>
```

Drop `--skill` when no particular skill was involved.

- **A refusal** (a bad kind, no `repository.url`) opens nothing. Relay it and stop.
- **A redirect** means this session is in skitterspec's own repo. Relay it and
  hand off: `/spec-bug` for a bug, `/spec` or `/spec-idea` for a feature,
  carrying the draft as its seed. Confirm first, and never switch silently.

Otherwise show the reader the title, description and environment
**exactly as the engine printed them**. That redacted text is what the form will hold, so
never paraphrase it. List any `possible duplicates` with their links. When it
says `duplicates: cannot tell`, mention that once and carry on.

Then ask, with a picker:

- **Open the form**: the report is right as shown.
- **Comment on #N instead**: only when a duplicate was listed. Give the link
  and open nothing. The reader adds their case there.
- **Change it**: take their edits, rewrite the scratch file, preview again.
- **Cancel**: open nothing.

## 4. Open

On **Open the form**, run the same command with `--open` added. Give the
reader the `url:` line either way, because a browser that did not open leaves
the link as the way in. Where the engine reports the description was trimmed
to fit the link, tell the reader to paste the full body it printed into the
form's description before submitting.

Say plainly that **nothing is filed until they press Submit**. You cannot
see whether they did, so never report the issue as filed.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅`: the form was opened (or its link given) for the reader to submit, or
  the reader chose to comment on an existing issue.
- `⏸`: the engine refused or redirected, or the reader cancelled. Nothing was
  opened.
- Handing off to `/spec-bug`, `/spec` or `/spec-idea` emits no block here:
  that skill ends with its own.

**Fields:** `Built` · `Notes` · `Follow-ups` · `Next`

`Built` is the kind, the title and the target repo. `Notes` carries a trimmed
description or a duplicate search that could not tell. `Next` is
`press Submit on the form` with the link, or the duplicate's link.

**`Follow-ups` is always `none` here.** The report is the follow-up.
