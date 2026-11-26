---
github_identifier: "#335"
github_url: "https://github.com/SkitterByte/skitterspec/issues/335"
---

# Bug: review tab no longer closes on pickup

> **Type:** Bug
> **Name:** bug-review-tab-late-claim
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/335
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Area:** `packages/common/assets/review/page.html`
> **Docs:** none: review.html does not describe the page's close or its poll timing

## Symptom

Pressing a verdict on a served review page no longer closes the tab, even
though the waiting session picks the pass up. The page ends on "It is still
waiting to be picked up" with `/spec-reviewed <code>` under it.

## Root cause

The page closes only on a confirmed `claimed` from `?pass=`, and asks just 8
times, 900ms apart (`page.html` `PASS_POLL_MS`/`PASS_POLL_ROUNDS`), then
settles on `picked: false` and never asks again. The constants assume "a claim
is a file-watch waking a session", but `review wait` claims nothing
(`env/review.js` `waitForPass`). The claim is the woken session's next model
turn (`--claim-since`), routinely past seven seconds, and the extra reading
since the rules split (`ed23d29f`) made the miss the norm.

## Failing test (red)

`packages/common/test/assets-review.test.js` — *a claim that lands after the
quick poll still closes the tab*: eleven `waiting` answers, then `claimed`;
expects the picked-up ending and one close.
`node --test packages/common/test/assets-review.test.js`

```
✖ a claim that lands after the quick poll still closes the tab
  actual: '… It is still waiting to be picked up.'
  expected: /picked (it|this) up/i
```

## Fix

- [x] After the quick poll hands over the command, keep asking quietly
      (`watchLate`: every 5s, 60 rounds); only `claimed` changes the ending,
      to the picked-up one, which closes the tab
- [x] Failing test now passes (GREEN); `pnpm build` and `pnpm test` green
- [x] Stays-silent tests: a pass nobody claims stops being asked about and
      keeps the tab; a late `unknown` never closes it

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Route/UI | update | review page: bounded late `?pass=` poll after the quick one |

## Changelog

- 2026-11-26 — Bug reproduced; failing test added (red).
- 2026-11-26 — Fixed: bounded late poll closes the tab on a late claim; test green.
