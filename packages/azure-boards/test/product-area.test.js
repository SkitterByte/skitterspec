'use strict'

// A spec's `> **Product:**` decides the Azure area path its items are filed in
// — on create, and again on every push that finds the product changed, phase
// items included — so one DevOps project can hold several products with a
// board each. A project with no `azure.products` pushes exactly as before.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE, loadAzureConfig, productArea } = require('../src/config.js')

const ORG = 'https://dev.azure.com/acme'
const PROJECT = 'web'
const PRODUCTS = {
  ereqs: { areaPath: 'web\\eReqs' },
  tendering: { areaPath: 'web\\Tendering' },
}

function specRepo({ product = null, azure = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-product-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  writeConfig(dir, azure)
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  writeOverview(dir, product)
  fs.writeFileSync(path.join(spec, '01-outbox.md'), '# Phase 1 — Outbox 🔄\n\n**Goal:** a durable place.\n')
  return dir
}

function writeConfig(dir, azure) {
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ azure: { orgUrl: ORG, project: PROJECT, ...azure } }),
  )
}

// Rewrites the header only, keeping any stamps the push wrote above it.
function writeOverview(dir, product) {
  const file = path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md')
  let front = ''
  if (fs.existsSync(file)) {
    const m = /^---\n[\s\S]*?\n---\n/.exec(fs.readFileSync(file, 'utf-8'))
    if (m) front = m[0] + '\n'
  }
  const header = product ? `> **Product:** ${product}\n\n` : ''
  fs.writeFileSync(file, `${front}# Demo\n\n${header}## Problem\n\nBody prose.\n`)
}

class Sink {
  constructor() {
    this.text = ''
  }
  write(s) {
    this.text += s
  }
}

async function run(args, dir, adapter) {
  const out = new Sink()
  const err = new Sink()
  const code = await specSync(args, { cwd: dir, out, err, adapter, env: {} })
  return { code, out: out.text, err: err.text }
}

function fakeAdapter() {
  const calls = []
  let n = 100
  const items = new Map()
  const make = (title, areaPath, type) => {
    const id = String(++n)
    const item = { id, identifier: `AB#${id}`, url: `${ORG}/${PROJECT}/_workitems/edit/${id}`, title, description: null, state: { name: 'To Do' }, type, areaPath: areaPath || null }
    items.set(id, item)
    return { id, identifier: item.identifier, url: item.url }
  }
  return {
    calls,
    items,
    async readIssue(id) {
      return items.get(String(id).replace(/^AB#/, '')) || null
    },
    async createIssue({ title, description, areaPath }) {
      calls.push(['createIssue', areaPath])
      const made = make(title, areaPath, 'Issue')
      items.get(made.id).description = description ?? null
      return made
    },
    async createSubIssue(parentId, { title, description, areaPath }) {
      calls.push(['createSubIssue', areaPath])
      const made = make(title, areaPath, 'Task')
      items.get(made.id).description = description ?? null
      return made
    },
    async updateIssue(id, updates) {
      calls.push(['updateIssue', String(id), updates])
      const item = items.get(String(id))
      if (item && updates.description !== undefined) item.description = updates.description
      if (item && updates.areaPath) item.areaPath = updates.areaPath
      return {}
    },
    async transitionTo(id, target) {
      const item = items.get(String(id))
      if (item) item.state = { name: target }
      return { moved: true }
    },
    async searchIssues() {
      return []
    },
  }
}

async function plan(dir) {
  return run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
}

async function planAndApply(dir, adapter) {
  const p = await plan(dir)
  assert.strictEqual(p.code, 0, p.out + p.err)
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, p.out)
  const applied = await run(['apply', 'feat-demo', '--plan', planFile], dir, adapter)
  assert.strictEqual(applied.code, 0, applied.out + applied.err)
  return { plan: JSON.parse(p.out), applied }
}

const PARENT = '101'
const CHILD = '102'

test('a product files the spec and its phases in that product\'s area', async () => {
  const dir = specRepo({ product: 'tendering', azure: { products: PRODUCTS } })
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  assert.strictEqual(adapter.items.get(PARENT).areaPath, 'web\\Tendering')
  assert.strictEqual(adapter.items.get(CHILD).areaPath, 'web\\Tendering')

  // Closed loop: the place is recorded, so the next plan is empty.
  const again = JSON.parse((await plan(dir)).out)
  assert.strictEqual(again.issue, undefined, JSON.stringify(again))
  assert.strictEqual(again.subIssues.update.length, 0)
})

test('changing the product moves the item and its phase items, and nothing else is rewritten', async () => {
  const dir = specRepo({ product: 'ereqs', azure: { products: PRODUCTS } })
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).areaPath, 'web\\eReqs')

  writeOverview(dir, 'Tendering') // matched without regard to case
  adapter.calls.length = 0
  const { plan: p } = await planAndApply(dir, adapter)

  assert.strictEqual(p.issue.placement, 'web\\Tendering')
  assert.strictEqual(adapter.items.get(PARENT).areaPath, 'web\\Tendering')
  assert.strictEqual(adapter.items.get(CHILD).areaPath, 'web\\Tendering')
  const childUpdate = adapter.calls.find(([op, id]) => op === 'updateIssue' && id === CHILD)
  assert.deepStrictEqual(childUpdate[2], { areaPath: 'web\\Tendering' }, 'the phase is moved, not rewritten')
})

test('no header files the spec in azure.areaPath once products are configured', async () => {
  const dir = specRepo({ azure: { products: PRODUCTS, areaPath: 'web\\eReqs' } })
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).areaPath, 'web\\eReqs')
  assert.strictEqual(adapter.items.get(CHILD).areaPath, 'web\\eReqs')
})

test('configuring products moves a spec pushed before them into the default area', async () => {
  const dir = specRepo({ azure: { areaPath: 'web\\eReqs' } })
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  writeConfig(dir, { products: PRODUCTS, areaPath: 'web\\eReqs' })
  adapter.items.get(PARENT).areaPath = 'web' // filed by hand before products
  const { plan: p } = await planAndApply(dir, adapter)
  assert.strictEqual(p.issue.placement, 'web\\eReqs')
  assert.strictEqual(adapter.items.get(PARENT).areaPath, 'web\\eReqs')
})

test('an unknown product refuses the plan, names the configured products, and writes nothing', async () => {
  const dir = specRepo({ product: 'tendring', azure: { products: PRODUCTS } })
  const p = await plan(dir)
  assert.notStrictEqual(p.code, 0)
  assert.match(p.out + p.err, /unknown product "tendring".*ereqs, tendering/)
  assert.ok(!fs.existsSync(path.join(dir, 'specs', '.core', 'azure-base')))
})

test('a Product header with no azure.products refuses rather than filing it anywhere', () => {
  assert.throws(() => productArea({ azure: { products: {}, areaPath: 'web' } }, 'tendering'), /sets no azure\.products/)
})

test('a product with no area path is dropped from the config, so naming it refuses', () => {
  const dir = specRepo({ azure: { products: { tendering: {}, ereqs: { areaPath: ' web\\eReqs ' } } } })
  const { config } = loadAzureConfig(dir)
  assert.deepStrictEqual(config.azure.products, { ereqs: { areaPath: 'web\\eReqs' } })
  assert.throws(() => productArea(config, 'tendering'), /unknown product/)
})

test('STAYS SILENT: no products and no header push exactly as before', async () => {
  const dir = specRepo({ azure: { areaPath: 'web\\Team' } })
  const adapter = fakeAdapter()
  const { plan: p } = await planAndApply(dir, adapter)

  assert.strictEqual(p.issue.placement, undefined)
  assert.ok(!p.subIssues.create.some((c) => 'placement' in c))
  // Created where they always were, from azure.areaPath.
  assert.deepStrictEqual(adapter.calls.filter(([op]) => op.startsWith('create')).map(([, a]) => a), ['web\\Team', 'web\\Team'])
  const base = fs.readdirSync(path.join(dir, 'specs', '.core', 'azure-base'))
  const snap = JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'azure-base', base[0]), 'utf-8'))
  assert.strictEqual(snap.placement, undefined)

  // And an edit's update carries no area at all.
  writeOverview(dir, null)
  fs.appendFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), '\nMore prose.\n')
  adapter.calls.length = 0
  await planAndApply(dir, adapter)
  for (const [op, , updates] of adapter.calls) if (op === 'updateIssue') assert.ok(!('areaPath' in updates))
})

// --- phase 2: products, ideas, doctor, the /spec question ---------------------

test('products lists each product with its area and where a headerless spec goes', async () => {
  const dir = specRepo({ azure: { products: PRODUCTS, areaPath: 'web\\eReqs' } })
  const r = await run(['products', '--json'], dir)
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(JSON.parse(r.out), {
    products: [
      { key: 'ereqs', areaPath: 'web\\eReqs' },
      { key: 'tendering', areaPath: 'web\\Tendering' },
    ],
    default: 'web\\eReqs',
  })
  const text = await run(['products'], dir)
  assert.match(text.out, /tendering\s+web\\Tendering/)
})

test('STAYS SILENT: products with none configured says so and exits 0', async () => {
  const dir = specRepo({ azure: { areaPath: 'web\\Team' } })
  const r = await run(['products', '--json'], dir)
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), { products: [], default: null })
})

function ideaAzure() {
  const calls = []
  return {
    calls,
    async createIssue(input) {
      calls.push(input)
      return { id: '501', identifier: 'AB#501', url: `${ORG}/${PROJECT}/_workitems/edit/501` }
    },
  }
}

test('idea add --product files the idea in that product\'s area', async () => {
  const dir = specRepo({ azure: { products: PRODUCTS } })
  const az = ideaAzure()
  const r = await run(['idea', 'add', 'Bid scoring', '--product', 'tendering', '--json'], dir, az)
  assert.strictEqual(r.code, 0, r.out)
  assert.strictEqual(az.calls[0].areaPath, 'web\\Tendering')
  assert.strictEqual(JSON.parse(r.out).areaPath, 'web\\Tendering')
})

test('idea add --product with an unknown key refuses, hands the text back, and files nothing', async () => {
  const dir = specRepo({ azure: { products: PRODUCTS } })
  const az = ideaAzure()
  const r = await run(['idea', 'add', 'Bid scoring', '--product', 'nope'], dir, az)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /unknown product "nope"/)
  assert.match(r.out, /Bid scoring/)
  assert.strictEqual(az.calls.length, 0)
})

test('STAYS SILENT: idea add without --product still files at the project root', async () => {
  const dir = specRepo({ azure: { products: PRODUCTS, areaPath: 'web\\eReqs' } })
  const az = ideaAzure()
  await run(['idea', 'add', 'Something', '--json'], dir, az)
  assert.ok(!('areaPath' in az.calls[0]))
})

function doctorAzure(areas) {
  return {
    async readViewer() {
      return { id: 'me', name: 'Me' }
    },
    async listIssueStates() {
      return ['To Do', 'Doing', 'Done', 'Removed'].map((name) => ({ name }))
    },
    async listTypeFields() {
      return ['System.Description']
    },
    async searchUsers() {
      return []
    },
    async areaExists(area) {
      if (areas === 'throw') throw new Error('TF400813: not authorized')
      return areas.includes(area)
    },
  }
}

async function doctorAreas(azure, adapter) {
  const dir = specRepo({ azure })
  const out = new Sink()
  await specSync(['doctor', '--check-remote', '--json'], { cwd: dir, out, err: new Sink(), adapter, env: { AZURE_DEVOPS_EXT_PAT: 't' } })
  return JSON.parse(out.text).checks.find((c) => c.id === 'areas')
}

test('doctor --check-remote names a product area that is not in the project', async () => {
  const row = await doctorAreas({ products: PRODUCTS, areaPath: 'web\\eReqs' }, doctorAzure(['web\\eReqs']))
  assert.strictEqual(row.state, 'broken')
  assert.match(row.detail, /web\\Tendering/)
  assert.doesNotMatch(row.detail, /eReqs/)

  const ok = await doctorAreas({ products: PRODUCTS }, doctorAzure(['web\\eReqs', 'web\\Tendering']))
  assert.strictEqual(ok.state, 'ok')
})

test('doctor --check-remote warns, never fails, on an area it could not ask about', async () => {
  const row = await doctorAreas({ products: PRODUCTS }, doctorAzure('throw'))
  assert.strictEqual(row.state, 'warn')
})

test('STAYS SILENT: doctor has no areas row when no product is set', async () => {
  const row = await doctorAreas({ areaPath: 'web\\Team' }, doctorAzure([]))
  assert.strictEqual(row, undefined)
})

// The built skill: /spec (through the link seam) asks for the product before
// the first push. Reads the composed distribution — `pnpm build` first.
test('the Azure /spec asks for the product before the linking push', () => {
  const built = path.join(__dirname, '..', '..', 'skitterspec-azure-boards', 'assets', 'skills', 'spec', 'SKILL.md')
  const text = fs.readFileSync(built, 'utf-8')
  const ask = text.indexOf('spec-sync products --json')
  const link = text.indexOf('**Linking is just the first push**')
  assert.ok(ask !== -1, 'the product step is in the built skill')
  assert.ok(ask < link, 'and it comes before the linking push')
})
