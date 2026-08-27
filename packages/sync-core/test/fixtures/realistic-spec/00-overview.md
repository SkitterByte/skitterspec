---
spec_status: in-progress
priority: 2
labels: ["sync", "engine"]
---

# Realistic outbox spec

## Problem

The event outbox must survive a crash and re-deliver exactly once. Today a
state-entry-with-
assignment is treated as one event, but the writer declares-rather-than-
strips the payload, so a **retry that crosses a
process boundary** double-applies. Files matched by `apps/**` are in scope.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| DB | add | `DbProcessEventOutbox` |
| Service | update | `enqueue()` idempotency |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | In Progress | in-progress | Dev |
