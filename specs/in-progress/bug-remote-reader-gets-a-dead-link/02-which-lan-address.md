---
linear_issue_id: "SKS-199"
---

# Phase 2 — Offer a LAN address that routes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the address on the `open:` line is the one the reader's phone can
reach. Without this, phase 1 can hand out a fresh dead link and call it fixed.

`lanAddresses()` (`packages/common/src/cli.js:1804`) returns every non-internal
IPv4 address in `os.networkInterfaces()` order. On the machine this bug was found
on that is three: `192.168.0.241` (real wifi) and two Parallels adapters,
`10.211.55.2` and `10.37.129.2`. Interface order is not preference order, so
"the first one" is a coin toss between a working link and the bug again.

- [x] Rank the addresses rather than taking the first. Prefer an interface whose
      name looks physical (`en*`, `eth*`, `wl*`) over one that looks virtual, and
      within that prefer a private range a phone plausibly shares.
- [x] **Name the blind spot beside the check** (rule 2): the virtual-adapter
      patterns (`vmnet`, `vnic`, `bridge`, `utun`, `docker`, `tap`, `tun`) are a
      heuristic over interface *names*, and a VPN or a renamed adapter will fool
      it. That is why the alternates are printed rather than discarded.
- [x] Print the runners-up on an `also:` line when there is more than one
      candidate, so a wrong guess costs a glance rather than a support round-trip.
- [x] Ranking is a pure function taking the interface map as an argument — never
      reading `os.networkInterfaces()` itself — so tests state the machine they
      describe, exactly as `detectReader` takes its environment.

## Tests

- [x] The three-adapter map from this machine ranks `192.168.0.241` first.
- [x] A machine with only virtual adapters still offers **something**, and lists
      it — an unrankable set is not an excuse to print nothing.
- [x] No non-internal address at all → fall back to phase 1's `file://` path with
      its marker, rather than an `http://` URL bound to nothing reachable.
- [x] A single address produces no `also:` line.
- [x] Ranking does not reorder within a tie, so output is stable between runs.

## Outcome

Green — 2029 pass, 0 fail. Verified against the real machine as well as the
fixtures: `en0 192.168.0.241` now ranks above `bridge100`/`bridge101`, and the
engine prints the wifi URL on `open:` with both Parallels addresses on `also:`.

Two of the planned tests are pinned differently from how they were written, and
it is worth being exact about it:

- **"no non-internal address at all"** is tested on the pure function (it ranks
  to `[]`) rather than through the CLI, which would need the interface map
  injected into `specEnvReview`. The CLI's `served === null` fallback — the same
  branch an empty ranking reaches — is exercised by phase 1's busy-port test.
- **"a single address produces no `also:` line"** is pinned by the alternates
  test asserting `also` count equals `served.alternates.length`. That holds on
  any machine, including a single-address one where both are zero, so it does
  not quietly depend on the developer having a VM installed.

`lanAddresses()` now returns ranked order, so `spec-env review serve` lists its
LAN URLs best-first too. Not planned, but it reads from the same function and
leaving it unranked would have had the two commands disagree about which address
to try first.
