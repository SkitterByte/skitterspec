# Commit Messages

## Format

`type(scope): subject` — [Conventional Commits](https://www.conventionalcommits.org/)

## Strict length limits (commitlint enforced)

- **Subject line:** 50 characters max
- **Body lines:** 72 characters max

## Template

```
type(scope): subject

- Bullet point 1
- Bullet point 2
```

## Types

`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`

## Rules

- Start bullets with a verb (Add, Fix, Refactor, Remove, Update)
- Be specific about what changed (file, module, feature)
- No emojis, no trailing punctuation
- No **authorship** trailers — `Co-authored-by`, `Signed-off-by`, etc.
  (The `Release-Note:` footers below are the one permitted exception — they
  carry content, not attribution.)
- Use plain `git commit -m "message"` only
- Output ONLY the commit message — no explanations before or after

## Release notes footer (user-facing changes)

When a change is **user-visible** (a feature, fix, or improvement an end user
would notice), add a `Release-Note:` footer. The terse subject feeds the
dev-facing `CHANGELOG.md`; the footer feeds the user-facing `RELEASES.md`
(`scripts/generate-releases.ts`, run on `pnpm version`). Both are generated
from the same commit.

```
feat(tasks): explicit state/created dates + sort-by

- Add stateEnteredAt column, sortBy param

Release-Note: You can now sort your task inbox by when an item entered its
current state or when it was created, with both dates shown on every row.
```

Grammar:

- `Release-Note: <text>` — a plain-English, benefit-framed sentence aimed at
  users (not "add column X" — say what they can now do). Multi-line is fine;
  wrap continuation lines at 72 like the body.
- `Release-Note!: <text>` — same, but also promoted into the release's
  **Highlights** line. Use for the headline change of a release.
- `Release-Area: <name>` — optional. Overrides the scope→area mapping when the
  dev scope isn't a user area (e.g. scope `engine` but area `Approvals`).
- `Release-Note: none` — explicit "not user-facing" marker (same effect as
  omitting it; documents the decision).

Rules:

- **Opt-in.** Omit the footer for internal/dev-only changes (`chore`, `test`,
  `docs`, `style`, refactors with no user effect, plumbing). Only commits with a
  footer appear in `RELEASES.md`.
- Put a **blank line before** the footer (commitlint `footer-leading-blank`).
- `feat`→New, `fix`→Fixed, `perf`/`refactor`→Improved, breaking→Action required
  — the bucket is derived from the commit type, so just write the note.

## Abbreviations

`reqId`, `corrId`, `config`, `util`, `ctx`, `impl`, `org`, `BU`

Full guidelines: `specs/.core/COMMIT_MESSAGES.md`.
