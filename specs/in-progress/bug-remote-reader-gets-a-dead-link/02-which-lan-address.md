---
linear_issue_id: "SKS-199"
---

# Phase 2 — Offer a LAN address that routes ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the address on the `open:` line is the one the reader's phone can
reach. Without this, phase 1 can hand out a fresh dead link and call it fixed.

`lanAddresses()` (`packages/common/src/cli.js:1804`) returns every non-internal
IPv4 address in `os.networkInterfaces()` order. On the machine this bug was found
on that is three: `192.168.0.241` (real wifi) and two Parallels adapters,
`10.211.55.2` and `10.37.129.2`. Interface order is not preference order, so
"the first one" is a coin toss between a working link and the bug again.

- [ ] Rank the addresses rather than taking the first. Prefer an interface whose
      name looks physical (`en*`, `eth*`, `wl*`) over one that looks virtual, and
      within that prefer a private range a phone plausibly shares.
- [ ] **Name the blind spot beside the check** (rule 2): the virtual-adapter
      patterns (`vmnet`, `vnic`, `bridge`, `utun`, `docker`, `tap`, `tun`) are a
      heuristic over interface *names*, and a VPN or a renamed adapter will fool
      it. That is why the alternates are printed rather than discarded.
- [ ] Print the runners-up on an `also:` line when there is more than one
      candidate, so a wrong guess costs a glance rather than a support round-trip.
- [ ] Ranking is a pure function taking the interface map as an argument — never
      reading `os.networkInterfaces()` itself — so tests state the machine they
      describe, exactly as `detectReader` takes its environment.

## Tests

- [ ] The three-adapter map from this machine ranks `192.168.0.241` first.
- [ ] A machine with only virtual adapters still offers **something**, and lists
      it — an unrankable set is not an excuse to print nothing.
- [ ] No non-internal address at all → fall back to phase 1's `file://` path with
      its marker, rather than an `http://` URL bound to nothing reachable.
- [ ] A single address produces no `also:` line.
- [ ] Ranking does not reorder within a tie, so output is stable between runs.
