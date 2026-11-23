# Checks That Accuse

A check **accuses** when being wrong costs something: it deletes, it exits
non-zero, or it tells the user their code is broken. Most accusations start
from an **absence** (a name not in a list, a directory not on disk). An absence
is evidence only once you have established that the lookup could have seen the
thing.

## 1. Prefer a positive signal to an absence

Assert something that must be **present**, not something that must not be
missing. Where no positive signal exists, widen the lookup until an absence
means something (include archived rows, ask for the one id rather than scanning
a page), or draw no conclusion.

## 2. Name the blind spot beside the check

Write a comment saying what could make this lookup lie. Describe what would
fool the check, not what the code does:

```js
// A LIFECYCLE FOLDER IS NOT CHECKED, deliberately. git does not track empty
// directories, so it disappears whenever the bucket empties.
```

## 3. Pair every accusation with a stays-silent test

Give each accusing check a test that feeds it a **healthy but unusual** input
(an empty bucket, an archived record, a just-published version, a file edited on
purpose) and asserts that it says nothing.

## 4. Bias the unknown case toward inaction

There are three states: yes, no and *cannot tell*. Route *cannot tell* to the
harmless branch (skip, warn, keep, retry), never to the destructive one. For
example, a file whose hash the manifest does not recognise is treated as
`customized` and kept, never as stale.

---

The incidents behind these rules:
[docs/rationale/negative-checks.md](https://github.com/SkitterByte/skitterspec/blob/main/docs/rationale/negative-checks.md).
