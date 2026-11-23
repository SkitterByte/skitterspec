# Kind routing — any door, the right spec

Every entry skill watches its grill for signals of another kind, and proposes a
hand-off **the moment one appears**, not at the end of the grill.

| In | Watches for | Hands to |
|----|-------------|----------|
| `/spec` | defect · defect on a released version · live outage | `/spec-bug` · `/spec-hotfix` · `/spec-incident` |
| `/spec-bug` | on a released version · live outage · not a defect | `/spec-hotfix` · `/spec-incident` · `/spec` |
| `/spec-hotfix` | live outage · not on a released version · not a defect | `/spec-incident` · `/spec-bug` · `/spec` |
| `/spec-incident` | no live outage to record | defect → `/spec-bug` (on a released version → `/spec-hotfix`), else `/spec` |

Feature, chore and issue all go to `/spec`, whose kind proposal picks between
them. Weigh signals in context; do not match keywords:

- A **defect** is behaviour that differs from what was intended.
- **On a released version** means the defect is in what is deployed ("in prod",
  "since v2.1").
- A **live outage** is a service down or degraded right now.
- **Not a defect** is a request for new behaviour.

The same three rules apply in every skill:

- **Always confirm; never switch silently.** Name the signal in the user's own
  words and propose the destination with a one-line reason. A decline ends it:
  the grill carries on and the signal is not raised again. A signal is a
  question, never a verdict.
- **Precedence: incident > hotfix > bug.** Propose the most specific
  destination.
- **Hand off in the same session and carry the context.** Invoke the
  destination skill with everything the grill has established, so it grills
  only what is still missing.

This is judgment, not configuration. A provider's intake label routing is a
separate, earlier check.
