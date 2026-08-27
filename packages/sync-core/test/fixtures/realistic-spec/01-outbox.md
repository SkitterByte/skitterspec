---
linear_milestone_id: m1
---

# Phase 1 — Durable outbox ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a durable place to put a cross-boundary event with a hard-remove-
after-ack policy, and one way to write it. Inert — nothing enqueues yet.

## Tasks

- [x] Add `DbProcessEventOutbox` to `prisma/schema.prisma`, modelled on
      `DbNotificationOutbox`: status, attempts, `nextAttemptAt`, plus the event
      payload. Slot it into the models-created-
      only audit bucket in `src/config/database.ts`. (SKI-1)
- [ ] Add `idempotencyKey` with a unique index so a duplicate enqueue collapses
      to one row. This is the **first-class dedup guarantee that spans the whole
      enqueue path** and must be covered end to end.
- [ ] Guard the writer against a state-entry-with-
      assignment being split, and keep `apps/**` globs verbatim in a
      ```
      config block that **should not
      wrap** at all
      ```
      when rendered.
