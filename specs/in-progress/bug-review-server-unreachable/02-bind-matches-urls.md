---
linear_issue_id: "SKS-208"
---

# Phase 2 — The bind and the URLs never disagree ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the address `spec-env review` prints is one the server is actually
reachable at, and a restart never narrows the bind behind your back.

## Tasks

- [x] `specEnvReview` reads `up.loopback` before printing LAN URLs
      (`cli.js:1680`). A loopback-bound server gets the `127.0.0.1` URL and a
      line naming how to widen it — never a LAN address it will refuse.
- [x] Do **not** silently restart to widen it. Reuse is load-bearing: a restart
      mints a fresh token and kills the URL already open on someone's phone.
      Say what is true and name the command.
- [x] `review serve --restart` keeps the **running** server's host when no
      `--host` is given, rather than defaulting back to `127.0.0.1`
      (`cli.js:2064`). An explicit `--host` still wins.
- [x] The unknown case — a restart with no running server and no `--host` —
      keeps today's loopback default. Widening a bind by inference is the one
      direction that must never happen by accident.
- [x] Tests: a loopback server + a remote reader prints no LAN URL and names the
      widening command; a `0.0.0.0` server still prints its LAN URLs; a
      `--restart` after `--host 0.0.0.0` stays wide; `--restart --host 127.0.0.1`
      narrows deliberately; a first start with no flags is loopback
      (stays-silent).
- [x] Run `pnpm test` in `packages/common` and at the repo root.

## Notes

Neither half is wrong on its own — `review` asking for `0.0.0.0` is right, and
adoption declining to restart is right. The defect is that nothing reconciles
them, so the output describes the server it asked for rather than the one it got.
