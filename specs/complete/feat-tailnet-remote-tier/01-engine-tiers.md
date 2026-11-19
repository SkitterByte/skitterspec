---
github_issue_id: "#251"
---

# Phase 1 — Engine: tailnet is the `remote` tier ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env review` and `--json` print `local` / `network` / `remote`
by address, the wait covers every served door shown, and nothing in the engine
reads `allowRemote` or a published URL. Tier tests prove it.

## Tasks

- [x] `reviewTierStack` (`packages/common/src/env/review.js`): drop
      `publishedUrl`, and build `remote` from the tailnet alternates. Use the
      first as `url` with `label: 'tailnet'` and keep the rest as its
      `alternates`. Keep only the non-tailnet alternates under `network`.
- [x] `remote` is off with `network`'s `enable`/`widen` when `allowNetwork` is
      false or the bind is loopback, and unavailable with
      `no tailnet address on this machine` when there is no tailnet address.
- [x] `reviewTierLine`: print a tier's `label` as `(tailnet)` after its URL.
- [x] `waitCovers`: return every shown tier that has a URL (loopback, LAN,
      tailnet). Update the holding-line wording wherever it is composed.
- [x] `serve.js` page tiers (~l.380): drop the `remote` / `allowRemote` entry.
- [x] `config.js`: stop defaulting and validating `review.allowRemote`, and
      accept it silently when present. Leave a comment naming why it is
      tolerated.
- [x] `review.js` / `cli.js`: remove the per-spec remote sidecar
      (`reviewRemotePath`, the allow-remote store and its config overlay) and
      the `.publish.html` writer. Make `spec-env review allow remote` refuse
      with a line pointing at `remote:`. Keep `readReviewUrl` and
      `publishedPageNotice` for teardown.
- [x] Remove `allow-remote` from `ACTIONS` and from the action-to-tier mapping.
- [x] `epicpage.js`: check its door resolution against the new tier shape.
- [x] Tests: update `env-review-tiers`, `env-review-reader`,
      `env-review-actions`, `cli-review-remote-command`,
      `env-review-remote-per-spec`, `env-review-wait-reshow` and
      `env-epic-links-reach-phone`. Add a stays-silent test for a config still
      setting `allowRemote: true`, and one for a machine with no tailnet.
- [x] Run `pnpm typecheck` and `pnpm test`, and get both green.

## Notes

- The publish fragment renderer (`fragmentTemplate`, `renderReviewFragment`)
  and `--publish-copy` were publish-only, so they went too, along with
  `env-review-publish-copy.test.js`. `cli-review-allow.test.js` replaces
  `cli-review-remote-command.test.js` and `env-review-remote-per-spec.test.js`.
- `env.config.json.example` and the `review.*` part of
  `packages/skitterspec/README.md` were done here rather than in phases 3 and
  4, because `assets-spec-start-one-path` and `docs-claims` check them.
