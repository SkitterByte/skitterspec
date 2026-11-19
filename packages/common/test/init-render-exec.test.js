'use strict'

// The `{{exec}}` render across every installed markdown file — commands,
// skills, rules and setup docs — and the rule that no rendered form may fetch
// an unscoped name from the registry.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { renderExec, distributionPackage, managedTargets } = require('../src/init.js')

function tmp(lockfiles = [], { localInstall = false } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-exec-')))
  for (const f of lockfiles) fs.writeFileSync(path.join(dir, f), '')
  if (localInstall) {
    fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'node_modules', '.bin', 'skitterspec'), '')
  }
  return dir
}

const NO_PATH = { PATH: '' }
const SRC = 'run `{{exec}} skitterspec-github spec-sync ref`\nBash({{exec}} skitterspec spec-env:*)\n'

function withDir(dir, fn) {
  try {
    fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('renderExec per rung', () => {
  withDir(tmp(['pnpm-lock.yaml'], { localInstall: true }), (dir) => {
    assert.strictEqual(
      renderExec(SRC, dir, NO_PATH),
      'run `pnpm exec skitterspec-github spec-sync ref`\nBash(pnpm exec skitterspec spec-env:*)\n',
    )
  })
  withDir(tmp(['package-lock.json'], { localInstall: true }), (dir) => {
    const out = renderExec(SRC, dir, NO_PATH)
    assert.match(out, /`npx --no-install skitterspec-github spec-sync ref`/)
    assert.match(out, /Bash\(npx --no-install skitterspec spec-env:\*\)/)
  })
  withDir(tmp(['yarn.lock'], { localInstall: true }), (dir) => {
    assert.match(renderExec(SRC, dir, NO_PATH), /`yarn skitterspec-github spec-sync ref`/)
  })
  withDir(tmp(), (dir) => {
    const binDir = tmp()
    fs.writeFileSync(path.join(binDir, 'skitterspec'), '')
    try {
      const out = renderExec(SRC, dir, { PATH: binDir })
      assert.match(out, /`skitterspec-github spec-sync ref`/)
      assert.match(out, /Bash\(skitterspec spec-env:\*\)/)
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true })
    }
  })
  withDir(tmp(), (dir) => {
    const pkg = distributionPackage()
    const out = renderExec(SRC, dir, NO_PATH)
    assert.ok(out.includes(`\`npx -p ${pkg} skitterspec-github spec-sync ref\``), out)
    assert.ok(out.includes(`Bash(npx -p ${pkg} skitterspec spec-env:*)`), out)
  })
})

test('distributionPackage names a scoped package', () => {
  assert.match(distributionPackage(), /^@skitterbyte\/skitterspec/)
})

// The accusing half: no rung may produce a bare `npx <bin>`, which resolves an
// unscoped name from the registry the moment node_modules is missing.
test('no rendered form fetches an unscoped name', () => {
  const bare = /npx (?!--no-install |-p @skitterbyte\/)skitterspec/
  for (const lock of [[], ['package-lock.json'], ['pnpm-lock.yaml'], ['yarn.lock']]) {
    for (const localInstall of [false, true]) {
      withDir(tmp(lock, { localInstall }), (dir) => {
        assert.doesNotMatch(renderExec(SRC, dir, NO_PATH), bare, `${lock} local=${localInstall}`)
      })
    }
  }
})

test('stays silent: content without the token is returned as is', () => {
  withDir(tmp(), (dir) => {
    const src = 'mentions pnpm exec in prose, and {{other}} braces\n'
    assert.strictEqual(renderExec(src, dir, NO_PATH), src)
  })
})

test('managedTargets renders every markdown asset and leaves the rest alone', () => {
  withDir(tmp(['pnpm-lock.yaml'], { localInstall: true }), (dir) => {
    for (const t of managedTargets(dir)) {
      if (t.relPath.endsWith('.md')) assert.doesNotMatch(t.bundled, /\{\{exec\}\}/, t.relPath)
    }
  })
})
