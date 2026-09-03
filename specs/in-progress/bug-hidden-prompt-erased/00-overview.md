# Bug: credentials set writes a prompt, then erases it and waits

> **Type:** Bug
> **Name:** bug-hidden-prompt-erased (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-03
> **Area:** packages/linear/src/cli-sync.js
> **Stack:** worktree

## Symptom

In a consumer project (`skitterload`, on `@skitterbyte/skitterspec-linear@10.5.0`):

```
npx skitterspec spec-sync credentials set --stdin     # hangs, no output
npx skitterspec spec-sync credentials set             # hangs, no prompt
```

Both sit forever printing nothing. The reporter's read was "it already has a key
— maybe the wrong one", but `set` never reads the stored key: it dispatches
straight to the prompt (`cli-sync.js:1619`). Two independent defects, both
presenting as a silent hang:

1. **No `--stdin`** — the prompt is written and then wiped, so the terminal shows
   a blank line with the process waiting on a key nobody knows to type.
2. **With `--stdin`** — nothing was piped, so it waits for an end-of-input a
   terminal never sends.

## Root cause

**1. The prompt (`promptHidden`, `cli-sync.js:1783`).** It wrote the question
itself and then handed readline an empty one:

```js
const rl = readline.createInterface({ input, output: process.stdout, terminal: true })
out.write(question)
rl.question('', …)
```

`readline` in terminal mode clears from the cursor to the end of the screen
before every redraw, and its first redraw happens on `question()` — after our
write. Captured off a real pty, unfixed:

```
Linear personal API key … (hidden): ESC[1G ESC[0J
```

prompt, then *cursor-to-column-1* + *clear-to-end-of-screen*. The prompt is
erased the instant it appears. `rl._writeToOutput = () => {}` was also assigned
*after* `question()`, so it could not have redrawn it either.

The same line carries the reason the suite never saw this: readline was given
`process.stdout` while the prompt went to `out`. In production they are one
stream, so they collide; under test they are two, so a fake output captures a
prompt nothing ever clears. **The split hid the bug from the only test that could
have caught it.**

**2. `--stdin` (`credentialsSet`).** `readAllStdin` resolves on `end`. On a TTY
with no pipe there is no `end` until Ctrl-D, so it blocks with no output.

Neither path had a test. `--stdin` with a pipe and the not-a-terminal refusal
were both covered; the interactive prompt — the path the docs tell a human to run
— was covered by nothing.

## Failing test (red)

`packages/linear/test/cli-credentials-prompt.test.js` — *the prompt is still on
screen while it waits for the key*. It captures the **real** `process.stdout` for
the duration, because production wires `out` and readline's output to that one
stream; folding the escape sequences gives what is actually visible. Red:

```
the prompt was erased — the user sees a blank line and a process that looks hung.
  raw:     "Linear personal API key for T1 (SKL) (hidden): ESC[1G ESC[0J ESC[1G"
  visible: " ESC[1G"
```

## Fix

- [x] `promptHidden`: let **readline own the prompt** (`rl.question(question, …)`),
      give it `out` rather than a hardcoded `process.stdout`, and assign
      `_writeToOutput` **before** the question so it re-writes the prompt — and
      only the prompt — on every redraw. The key stays hidden; the prompt stops
      vanishing.
- [x] `credentialsSet`: refuse `--stdin` when stdin is a TTY, naming both working
      forms. A TTY is positive evidence that nothing was piped.
- [x] Add the stdin injection seam (`io.input`), without which only the non-TTY
      half of either branch can ever be exercised.
- [x] Failing test now passes; `pnpm test` green (1028), no regressions.
- [x] Verified end to end on a real pty: the clear now precedes the prompt, and
      the cursor parks after it.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync credentials set` — prompt renders; `--stdin` on a TTY refuses |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-03 — Bug reproduced off a pty; failing test added (red).
- 2026-09-03 — Fixed: readline owns the prompt and redraws it; `--stdin` refuses
  on a TTY. The test blind spot was `promptHidden` writing to `out` while
  readline cleared `process.stdout` — the two are one stream in production.
