'use strict'

// The base and every provider install globally side by side
// (feat-global-install). npm refuses a second global package that claims a bin
// another already owns (`npm error File exists: …/bin/skitterspec`), which is
// what kept a machine to one provider. This installs stand-ins carrying each
// distribution's REAL name and bin map into a scratch prefix — the bin maps are
// the whole question, and the real tarballs would need a build per run.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const PKGS = path.join(__dirname, '..', 'packages')
const DISTS = ['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards']

function standIn(root, dir) {
  const real = JSON.parse(fs.readFileSync(path.join(PKGS, dir, 'package.json'), 'utf8'))
  const at = path.join(root, dir)
  fs.mkdirSync(path.join(at, 'bin'), { recursive: true })
  for (const file of new Set(Object.values(real.bin))) {
    fs.writeFileSync(path.join(at, file), '#!/usr/bin/env node\n')
  }
  fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify({ name: real.name, version: real.version, bin: real.bin }))
  return { at, bins: Object.keys(real.bin) }
}

test('the base and all four providers install globally into one prefix', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-global-')))
  const prefix = path.join(root, 'prefix')
  try {
    const all = DISTS.map((d) => standIn(root, d))
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    for (const { at } of all) {
      const r = spawnSync(npm, ['install', '-g', '--prefix', prefix, '--no-audit', '--no-fund', at], {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      })
      assert.strictEqual(r.status, 0, `${at}: ${r.stderr}`)
    }
    const binDir = process.platform === 'win32' ? prefix : path.join(prefix, 'bin')
    for (const bin of all.flatMap((a) => a.bins)) {
      const file = process.platform === 'win32' ? `${bin}.cmd` : bin
      assert.ok(fs.existsSync(path.join(binDir, file)), `${bin} is on the global PATH`)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
