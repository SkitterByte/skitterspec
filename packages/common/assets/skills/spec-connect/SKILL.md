---
name: spec-connect
description: Point your local canonical origin (localhost:3000/:8080) at a spec's running dev servers so you can test a worktree's UI/API changes at the normal URL — or `spec-connect main` to hand the ports back to your main checkout. Runs `skitterspec spec-env connect` (a small bundled reverse proxy). Opt-in — needs specs/.core/env.config.json with a `dev` block. Use when the user says "/spec-connect", "test <spec> locally", "point local at <spec>", or "connect to <spec>".
---

# /spec-connect — expose one spec on the canonical ports

Make `http://localhost:<frontPort>` serve a **spec's** warm dev servers instead of
your main checkout's, so you can test a worktree's UI/API at the exact URL you
always use — no bookmark, base-URL, or OAuth-callback changes. **Exclusive:** one
spec is exposed at a time. `spec-connect main` stops the proxy and hands the ports
back to your primary checkout.

This skill is **opt-in**: it needs `specs/.core/env.config.json` with a `dev`
block (host dev servers + their `frontPort`s). If isolation or `dev` is absent,
say so and stop.

## 1. Identify the target

- Use the spec named as an argument. The literal `main` means **disconnect**
  (hand the ports back to the primary checkout). Else use the spec **currently in
  context**; if unclear, ask.

## 2. Make sure the spec's dev servers are running

`connect` proxies to a spec's dev servers on its reserved port block — it does
**not** start them. If they aren't up yet, start them first:

```
skitterspec spec-env dev up <spec>
```

(This is automatic under `/spec-go`; run it by hand only when connecting a spec
whose servers you stopped.)

## 3. Connect (or disconnect)

```
skitterspec spec-env connect <spec>     # expose <spec> on the canonical ports
skitterspec spec-env connect main       # stop the proxy — main owns the ports
```

The engine (re)starts a small bundled Node reverse proxy and **prints** the
canonical URL → spec-port mapping. **If it reports a canonical port is in use**,
your **main dev server still holds it** — stop main on that port, then re-run
(the proxy can't share a port main is bound to). Relay the printed message.

## 4. Report

Echo which spec is now on the canonical ports (and the URLs), or that the proxy
was stopped and main owns them again. Switching to a different spec is just
`spec-connect <other>` — the dev servers stay warm, so it's a near-instant
re-point.
