'use strict'

/**
 * The doctor REPORT FRAMEWORK — the states, the row shape, and the combining
 * rule every provider's `doctor` shares. The checks themselves are the
 * provider's: they name its config files, its states, its transports.
 *
 * Two distinctions carry the design:
 *
 * 1. **`missing` is not `broken`.** `missing` is an opt-in not taken, which is
 *    fine; `broken` is configured-but-wrong, which is not. `ok` is false only
 *    for `broken`, so declining an opt-in never reads as a failure.
 * 2. **Every non-`ok` row names the command that fixes it**, so the output is
 *    actionable without reading docs.
 *
 * `warn` sits between `ok` and `broken`: worth a human's attention, but not a
 * failure — said out loud, exit code left alone.
 */

const DOCTOR_STATES = ['ok', 'missing', 'broken', 'skipped', 'warn']

// A row is a check. `fix` is the exact command to run, or null when there is
// nothing to fix.
function doctorRow(id, label, state, detail, fix = null) {
  if (!DOCTOR_STATES.includes(state)) throw new Error(`doctor: unknown check state "${state}" for ${id}`)
  return { id, label, state, detail, fix }
}

// `missing` is a declined opt-in, so it must not fail the run. Only a
// configured-but-wrong layer does.
function combineDoctorChecks(checks) {
  return { ok: !checks.some((c) => c.state === 'broken'), checks }
}

module.exports = { DOCTOR_STATES, doctorRow, combineDoctorChecks }
