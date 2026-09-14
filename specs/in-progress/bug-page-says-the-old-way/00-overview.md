# Bug: the page still describes the workflow /spec-reviewed replaced

> **Type:** Bug
> **Name:** bug-page-says-the-old-way (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/review/page.html, packages/common/test/assets-review.test.js

## Symptom

After sending a verdict, the page says:

    Sent — tell Claude it is waiting. It should say code 608223

There is a command for this now. `/spec-reviewed` shipped hours earlier and is
the thing to type; the page instead describes the interim arrangement it
replaced, where the operator narrated that a pass existed and hoped the agent
would look.
