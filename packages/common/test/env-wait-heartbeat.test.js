'use strict'

/**
 * A BACKGROUNDED WAIT THAT SAYS NOTHING GETS KILLED.
 *
 * `spec-env review wait` printed one line when it started and then nothing at
 * all until a pass arrived. Over a long idle it did not survive: three separate
 * sessions lost their wait across one lunch break, and two in another session
 * were killed after 43 and 30 minutes. Ruled out at the time — machine sleep
 * (no `pmset` events), a broad process reap (the detached serve daemon lived
 * through both), a fixed timeout (the two durations differ), and a deliberate
 * stop. The one wait that survived was the one that found a pass in nine
 * minutes and printed something.
 *
 * WHETHER THE TRIGGER IS PROCESS SILENCE OR SESSION IDLENESS WAS NEVER
 * ESTABLISHED, and that is why this is only half the fix: the heartbeat
 * addresses silence, and the caller re-arming (a prose contract in
 * `spec-reports.md`, which cannot be unit tested) covers it either way. Do not
 * read these tests as proof the cause is known.
 *
 * STDERR IS THE LOAD-BEARING CHOICE. Stdout is the result a backgrounded caller
 * parses, and under a monitor every stdout line becomes a notification — so a
 * proof-of-life line there would either corrupt the answer or wake somebody
 * every five minutes.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { waitForPass, WAIT_HEARTBEAT_MS } = require('../src/env/review.js')

// A clock and a sleep the test drives, so no test waits on real minutes.
function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms
    },
    advanceTo: (ms) => {
      t = ms
    },
  }
}

// A store that yields a pass once the clock has passed `at`.
const storeAfter = (clock, at, code = '111111') => () => ({
  corrupt: false,
  pending: {
    passes: clock.now() >= at ? [{ code, at: '2026-01-01T00:00:01.000Z', blob: {} }] : [],
  },
})

const SINCE = '2026-01-01T00:00:00.000Z'

/* ==========================================================================
 * It says it is alive
 * ========================================================================== */

test('a long wait beats on its own cadence', async () => {
  const clock = fakeClock()
  const beats = []
  const result = await waitForPass(storeAfter(clock, 3_000_000), SINCE, {
    sleep: clock.sleep,
    now: clock.now,
    heartbeatMs: 1_000_000,
    onHeartbeat: (b) => beats.push(b.elapsedMs),
  })

  assert.strictEqual(result.state, 'arrived')
  // Two, not three. At 3,000,000 the store yields the pass and the loop returns
  // from the top — a wait that has answered does not beat on its way out, which
  // is the same property the at-once case below pins.
  assert.deepStrictEqual(beats, [1_000_000, 2_000_000])
})

test('a beat carries the elapsed time and the window it is waiting inside', async () => {
  const clock = fakeClock()
  const beats = []
  await waitForPass(storeAfter(clock, 1_200_000), SINCE, {
    sleep: clock.sleep,
    now: clock.now,
    heartbeatMs: 600_000,
    onHeartbeat: (b) => beats.push(b),
  })

  assert.strictEqual(beats[0].since, SINCE)
  assert.strictEqual(beats[0].elapsedMs, 600_000)
})

test('the cadence is counted from the start, so it cannot drift or double-fire', async () => {
  // Scheduling the next beat off the previous one lets a slow poll push every
  // beat later than the last; counting from the start cannot.
  const clock = fakeClock()
  const beats = []
  await waitForPass(storeAfter(clock, 2_500_000), SINCE, {
    sleep: async (ms) => clock.sleep(ms * 7), // a deliberately lumpy poll
    now: clock.now,
    heartbeatMs: 1_000_000,
    onHeartbeat: (b) => beats.push(b.elapsedMs),
  })

  assert.ok(beats.length <= 3, `at most one beat per interval, got ${beats.length}`)
  for (let i = 1; i < beats.length; i++) {
    assert.ok(beats[i] > beats[i - 1], 'strictly increasing')
  }
})

test('the default cadence is minutes, not the poll interval', async () => {
  // The poll stays at 400ms because that is how fast a press should be noticed;
  // the heartbeat is addressed to a supervisor, not a reader.
  assert.strictEqual(WAIT_HEARTBEAT_MS, 5 * 60 * 1000)
})

/* ==========================================================================
 * Stays silent
 * ========================================================================== */

test('STAYS SILENT: a wait that finds a pass at once never beats', async () => {
  const clock = fakeClock()
  const beats = []
  const result = await waitForPass(storeAfter(clock, 0), SINCE, {
    sleep: clock.sleep,
    now: clock.now,
    heartbeatMs: 1,
    onHeartbeat: () => beats.push(1),
  })

  assert.strictEqual(result.state, 'arrived')
  assert.deepStrictEqual(beats, [], 'nothing to prove alive — it already answered')
})

test('STAYS SILENT: no hook means no beat, and the wait is otherwise identical', async () => {
  // Every existing caller passes no hook, and must behave exactly as before.
  const clock = fakeClock()
  const result = await waitForPass(storeAfter(clock, 2_000_000), SINCE, {
    sleep: clock.sleep,
    now: clock.now,
  })
  assert.strictEqual(result.state, 'arrived')
  assert.strictEqual(result.code, '111111')
})

test('STAYS SILENT: heartbeatMs of 0 disables it without disabling the wait', async () => {
  const clock = fakeClock()
  const beats = []
  const result = await waitForPass(storeAfter(clock, 2_000_000), SINCE, {
    sleep: clock.sleep,
    now: clock.now,
    heartbeatMs: 0,
    onHeartbeat: () => beats.push(1),
  })
  assert.strictEqual(result.state, 'arrived')
  assert.deepStrictEqual(beats, [])
})

test('STAYS SILENT: an unusable window returns at once and beats nothing', async () => {
  const beats = []
  const result = await waitForPass(() => ({ corrupt: false, pending: { passes: [] } }), 'not-a-date', {
    heartbeatMs: 1,
    onHeartbeat: () => beats.push(1),
  })
  assert.strictEqual(result.state, 'unusable')
  assert.deepStrictEqual(beats, [])
})

test('STAYS SILENT: the beat does not interfere with a timeout', async () => {
  const clock = fakeClock()
  const beats = []
  const result = await waitForPass(() => ({ corrupt: false, pending: { passes: [] } }), SINCE, {
    sleep: clock.sleep,
    now: clock.now,
    timeoutMs: 2_000_000,
    heartbeatMs: 500_000,
    onHeartbeat: (b) => beats.push(b.elapsedMs),
  })
  assert.strictEqual(result.state, 'timeout')
  assert.ok(beats.length > 0, 'it did beat while waiting')
})
