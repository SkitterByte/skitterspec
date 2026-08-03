'use strict'

/**
 * Live-overlay receipt — the advisory record of which spec currently holds the
 * primary checkout for live testing.
 *
 * The *authority* on "who's live" is the branch checked out in the primary
 * checkout (see `assertPrimaryOnMain` in resolve.js): on the base branch → free;
 * on a feature branch → that spec is in control. This receipt is only metadata —
 * it powers `live status` and crash recovery (`live abort` reads `baseMainCommit`
 * from here to restore the primary checkout). It lives beside the slot registry
 * at the primary checkout root (`.spec-env/live.json`, gitignored).
 *
 * `receiptPath`/`renderReceipt`/`summarizeReceipt` are pure; `read`/`write`/`clear`
 * are the thin IO seam the CLI drives, mirroring env/registry.js. No `Date.now()`
 * — the caller passes `heldSince`.
 */

const fs = require('node:fs')
const path = require('node:path')

const REQUIRED = ['spec', 'branch', 'holder', 'heldSince', 'baseMainCommit']

// Absolute path to the receipt — a sibling of the configured registry file, so it
// follows wherever `.spec-env` is configured (default `.spec-env/live.json`).
function receiptPath(rootDir, config) {
  return path.resolve(rootDir, path.dirname(config.registry), 'live.json')
}

// Normalize receipt fields into the persisted shape. Pure; throws on a missing
// field so a half-formed receipt is never written.
function renderReceipt(fields) {
  for (const key of REQUIRED) {
    if (!fields || !fields[key]) throw new Error(`live receipt: missing ${key}`)
  }
  const receipt = {}
  for (const key of REQUIRED) receipt[key] = String(fields[key])
  return receipt
}

// Read the receipt. Missing file → null (no one is live). Malformed JSON → Error.
function readReceipt(rootDir, config) {
  const file = receiptPath(rootDir, config)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid live receipt ${path.dirname(config.registry)}/live.json: ${error.message}`,
    )
  }
}

// Persist the receipt, creating its parent dir as needed. Returns the written shape.
function writeReceipt(rootDir, config, fields) {
  const receipt = renderReceipt(fields)
  const file = receiptPath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

// Remove the receipt. Idempotent: clearing an absent receipt is a clean no-op.
function clearReceipt(rootDir, config) {
  const file = receiptPath(rootDir, config)
  try {
    fs.unlinkSync(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

// A one-line human summary of a receipt (or the "free" state when null). Pure.
function summarizeReceipt(receipt) {
  if (!receipt) return 'free — no spec is live'
  return (
    `${receipt.spec} (branch ${receipt.branch}) — ` +
    `held by ${receipt.holder} since ${receipt.heldSince}`
  )
}

module.exports = {
  receiptPath,
  renderReceipt,
  readReceipt,
  writeReceipt,
  clearReceipt,
  summarizeReceipt,
}
