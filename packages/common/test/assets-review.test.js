'use strict'

/**
 * Guards for the shipped review page template.
 *
 * Two halves. The first reads the template as TEXT and asserts the properties
 * that make it a viewer rather than a coloured dump: both splice points present,
 * nothing loaded from the network, and every colour token defined in the bare
 * `:root` block. The second RUNS the page's own script against a hand-rolled DOM
 * shim, because the band/tree/filter logic is the substance of the phase and
 * asserting on markup strings would not touch it.
 *
 * The shim is deliberately ~80 lines of this file rather than a dependency: the
 * repo ships with two devDependencies and adding a DOM library to test one page
 * is a bigger change to the project than the page is.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const {
  renderReviewPage,
  loadTemplate,
  TEMPLATE_PATH,
  DATA_PLACEHOLDER,
  REVIEW_PLACEHOLDER,
} = require('../src/env/review.js')

const ROOT = path.join(__dirname, '..', '..', '..')
const TEMPLATE = loadTemplate()

// --- the template as text ---------------------------------------------------

test('the template ships with both splice points', () => {
  assert.ok(TEMPLATE.includes(DATA_PLACEHOLDER), 'data island placeholder')
  assert.ok(TEMPLATE.includes(REVIEW_PLACEHOLDER), 'review block placeholder')
  // The island must be a JSON script tag, not an inline JS literal: the engine
  // splices raw patch text in, and only `application/json` is inert.
  assert.match(TEMPLATE, /<script type="application\/json" id="review-data">__REVIEW_DATA__<\/script>/)
})

test('every distribution ships the template, not just the source package', () => {
  for (const pkg of ['skitterspec', 'skitterspec-linear']) {
    const p = path.join(ROOT, 'packages', pkg, 'assets', 'review', 'page.html')
    // A POSITIVE signal: the built distribution's own copy must exist and carry
    // the splice points. (Built output is gitignored, so a clean checkout that
    // has not run the build legitimately has neither — skip rather than accuse.)
    if (!fs.existsSync(path.join(ROOT, 'packages', pkg, 'assets'))) continue
    assert.ok(fs.existsSync(p), `${pkg} ships assets/review/page.html`)
    const t = fs.readFileSync(p, 'utf8')
    assert.ok(t.includes(DATA_PLACEHOLDER) && t.includes(REVIEW_PLACEHOLDER), `${pkg} template is intact`)
  }
})

test('the page loads nothing from the network', () => {
  const external = TEMPLATE.match(/(?:src|href)\s*=\s*"(?!#)[^"]*"/g) || []
  // A Google Fonts link would be the one permitted exception; this page takes
  // even that off the table so a review opens with no connection at all.
  assert.deepStrictEqual(external, [], 'no external stylesheet, script, font or image')
  assert.ok(!/url\(\s*['"]?https?:/.test(TEMPLATE), 'no remote url() in CSS')
})

test('every colour token the page uses is defined on bare :root', () => {
  // The bare block only — NOT the media query or the [data-theme] block. A token
  // whose sole definition lives in one of those is invisible in the other theme,
  // which is the classic way a page reads fine for its author and is unreadable
  // for everyone else.
  const bare = /:root\s*\{([^}]*)\}/.exec(TEMPLATE)
  assert.ok(bare, 'the bare :root block is present')
  const defined = new Set([...bare[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const used = new Set([...TEMPLATE.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))
  const missing = [...used].filter((t) => !defined.has(t))
  assert.deepStrictEqual(missing, [], `tokens used but never defined on bare :root: ${missing.join(', ')}`)
})

test('both theme overrides exist, and only redefine', () => {
  assert.match(TEMPLATE, /:root:not\(\[data-theme="light"\]\)/, 'dark-by-preference is guarded')
  assert.match(TEMPLATE, /@media \(prefers-color-scheme: dark\)/, 'the preference query is present')
  assert.match(TEMPLATE, /:root\[data-theme="dark"\]/, 'an explicit toggle wins')
  assert.match(TEMPLATE, /body\s*\{[^}]*background:\s*var\(--bg\)/, 'body paints an explicit background')
})

test('add and remove are legible without colour, and controls show focus', () => {
  // A +/- gutter, not colour alone.
  assert.match(TEMPLATE, /row\.t === 'add' \? '\+' : row\.t === 'del' \? '-' : ' '/)
  assert.match(TEMPLATE, /:focus-visible[\s\S]{0,200}outline:/, 'a visible focus ring is defined')
})

test('the code box scrolls, not the page, and line numbers stay put', () => {
  assert.match(TEMPLATE, /\.code\s*\{[^}]*overflow-x:\s*auto/, 'the code box owns the horizontal scroll')
  assert.match(TEMPLATE, /td\.gutter\s*\{[^}]*position:\s*sticky/, 'line numbers are sticky')
  assert.match(TEMPLATE, /\.main\s*\{[^}]*min-width:\s*0/, 'the grid column may shrink below its content')
})

test('the page script parses', () => {
  const src = pageScript()
  new vm.Script(src, { filename: 'page.html:script' })
})

// --- the page script, run for real ------------------------------------------

function pageScript() {
  const m = /<script>\n([\s\S]*?)<\/script>/.exec(TEMPLATE)
  assert.ok(m, 'found the page script')
  return m[1]
}

// Enough CSS selector to serve the page: `.cls`, `tag.cls`, `[attr]`,
// `.cls[attr="v"]`. Anything richer would be a library, and the page does not
// ask for one.
function selectorMatches(node, sel) {
  const m = /^([a-z]+)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(sel.trim())
  if (!m) throw new Error(`shim: unsupported selector ${sel}`)
  const [, tag, cls, attr, value] = m
  if (tag && String(node.tagName || '').toLowerCase() !== tag) return false
  if (cls && !String(node.className || '').split(/\s+/).includes(cls)) return false
  if (attr) {
    const got = node.getAttribute ? node.getAttribute(attr) : null
    if (got === null) return false
    if (value !== undefined && got !== value) return false
  }
  return true
}

function queryAll(root, sel, out = []) {
  for (const child of root.childNodes || []) {
    if (child.getAttribute && selectorMatches(child, sel)) out.push(child)
    queryAll(child, sel, out)
  }
  return out
}

// A DOM shim: only what the page actually touches. Anything the page starts
// using that is not here fails loudly as a TypeError, which is the behaviour we
// want — a silent stub would let a broken page pass.
// What the shim reports when the page MEASURES. A shim cannot lay out, so a
// width is declared rather than computed: a 1000px pane over a 44px gutter is
// an ordinary review on a laptop. Keyed by class and read at access time,
// because the page rebuilds its code box on every band expansion — a width set
// on one node would not survive the next render.
const DEFAULT_WIDTHS = { code: 1000, gutter: 44 }

function fakeDom(islandText, widths = DEFAULT_WIDTHS) {
  // `execCommand('copy')` copies the SELECTION, so the shim reads back through
  // the same ranges the page added. Modelling the copy without the selection
  // would let a page that selects nothing still "copy" in a test.
  const selectedText = () => {
    const last = selection.ranges[selection.ranges.length - 1]
    return last && last.node ? last.node.textContent : ''
  }
  const make = (tag) => {
    const node = {
      tagName: tag,
      className: '',
      childNodes: [],
      parent: null,
      listeners: {},
      attrs: {},
      _open: false,
      hidden: false,
      checked: false,
      appendChild(c) {
        c.parent = node
        node.childNodes.push(c)
        return c
      },
      addEventListener(ev, fn) {
        ;(node.listeners[ev] = node.listeners[ev] || []).push(fn)
      },
      dispatch(ev) {
        const event = { target: node, preventDefault() {}, stopPropagation() {} }
        for (const fn of node.listeners[ev] || []) fn(event)
      },
      replaceChild(next, old) {
        const at = node.childNodes.indexOf(old)
        if (at === -1) return old
        next.parent = node
        node.childNodes[at] = next
        return old
      },
      querySelector(sel) {
        return queryAll(node, sel)[0] || null
      },
      querySelectorAll(sel) {
        return queryAll(node, sel)
      },
      focus() {},
      select() {},
      setAttribute(k, v) {
        node.attrs[k] = v
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null
      },
      // RECORDED, not ignored. The page scrolls for three different reasons —
      // revealing a file, jumping to a line, following the current row — and
      // the third is conditional on layout, so a test has to be able to see
      // that it did NOT happen as well as that it did.
      _scrolls: [],
      scrollIntoView(opts) { node._scrolls.push(opts || null) },
      // Layout the page asks about when deciding whether the current tree row
      // has left the sidebar's scrollport. A node no test positioned reports
      // all zeros, which reads as "inside the box" — so the default is the
      // no-scroll branch and a test opts IN to the moving one.
      _rect: null,
      getBoundingClientRect() {
        return node._rect || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }
      },
      value: '',
      // The page publishes the pane width onto the code box as custom
      // properties, and reads nothing back from the cascade — so a recorder is
      // the whole of what `style` has to be here.
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = String(v) },
        getPropertyValue(k) { return Object.prototype.hasOwnProperty.call(this._props, k) ? this._props[k] : '' },
      },
      closest(sel) {
        const cls = sel.replace(/^\./, '')
        let n = node
        while (n) {
          if (String(n.className).split(/\s+/).includes(cls)) return n
          n = n.parent
        }
        return null
      },
    }
    // Layout, to the depth the page asks about it: how wide the scrolling code
    // box is and how wide the gutter column beside it. A node no test declared
    // a width for reports 0 — which is what a <details> that has never been
    // opened really reports, and the case `sizeNotes` must stay silent on.
    const declaredWidth = () =>
      String(node.className || '').split(/\s+/).reduce((w, c) => (widths[c] != null ? widths[c] : w), 0)
    Object.defineProperty(node, 'clientWidth', { get: declaredWidth })
    Object.defineProperty(node, 'offsetWidth', { get: declaredWidth })
    Object.defineProperty(node, 'parentNode', { get: () => node.parent })
    Object.defineProperty(node, 'textContent', {
      get() {
        return node.childNodes.map((c) => (c.nodeValue != null ? c.nodeValue : c.textContent)).join('')
      },
      set(v) {
        node.childNodes = []
        if (v !== '') node.appendChild({ nodeValue: String(v), childNodes: [], parent: node })
      },
    })
    // `open` fires `toggle`, which is how the page renders a file lazily.
    Object.defineProperty(node, 'open', {
      get: () => node._open,
      set(v) {
        const changed = node._open !== v
        node._open = v
        if (changed) node.dispatch('toggle')
      },
    })
    return node
  }

  const byId = {}
  for (const id of [
    'title', 'sub', 'files', 'tree', 'tree-wrap', 'tree-summary',
    'expand-all', 'collapse-all', 'show-noise', 'noise-label', 'theme', 'review-block',
    'verdict', 'verdict-commit', 'verdict-commit-continue', 'verdict-commit-start', 'verdict-commit-land', 'verdict-continue',
    'verdict-changes', 'verdict-discuss',
    'verdict-count', 'verdict-log', 'verdict-warn', 'copy-out', 'copy-hint',
    'sent-cmd', 'sent-cmd-lead', 'sent-cmd-text', 'sent-cmd-copy', 'cmd-list', 'cmd-lead',
    'context', 'context-why', 'context-more', 'context-more-summary', 'context-rest',
    'wrap', 'decided', 'decided-what', 'decided-note', 'decided-toggle', 'drawn-by',
    'send-failed', 'send-failed-what', 'send-failed-note', 'send-failed-cmd',
    'send-failed-lead', 'send-failed-text', 'send-failed-copy',
  ]) {
    byId[id] = make('div')
    byId[id].id = id
  }
  // The shim cannot parse markup, so an element that SHIPS hidden would start
  // out visible here and a test could not tell "the page revealed it" from
  // "the shim never hid it". Read the initial state off the template itself
  // rather than listing ids by hand, so it cannot drift from what ships.
  for (const tag of TEMPLATE.match(/<[^>]*\bid="[^"]+"[^>]*>/g) || []) {
    const id = /\bid="([^"]+)"/.exec(tag)[1]
    if (byId[id] && /\shidden(\s|>|=)/.test(tag)) byId[id].hidden = true
  }

  // The noise checkbox must sit inside a `.toggle` for closest() to find it.
  const toggleLabel = make('label')
  toggleLabel.className = 'toggle'
  toggleLabel.appendChild(byId['show-noise'])

  const island = make('script')
  island.textContent = islandText
  byId['review-data'] = island

  // One root so document-level queries can reach everything the page builds.
  const root = make('div')
  root.appendChild(byId['review-block'])
  root.appendChild(byId.files)
  // The command list is built by the script into a container the template
  // ships, so the shim has to put that container somewhere document-level
  // queries can reach — otherwise its rows exist and no test can see them.
  root.appendChild(byId['cmd-list'])

  // A selection, enough for the page's one use of it: the command box has no
  // `select()` any more, so the fallback goes through a Range — and a shim that
  // simply lacked `createRange` would send every test down the could-not-select
  // branch and never touch the one that ships.
  const selection = { ranges: [], removeAllRanges() { this.ranges = [] }, addRange(r) { this.ranges.push(r) } }
  const document = {
    documentElement: make('html'),
    createElement: make,
    // `execCommand('copy')` is the page's PLAIN-HTTP copy route, so the shim has
    // to model it as a real capability that can be present, absent, or present
    // and refusing — the three states a browser actually offers. `_exec` is what
    // a test sets; `_execCopied` records what it was asked to copy.
    _exec: () => true,
    _execCopied: [],
    execCommand(cmd) {
      if (cmd !== 'copy') return false
      const ok = document._exec()
      if (ok) document._execCopied.push(selectedText())
      return ok
    },
    createRange: () => ({ node: null, selectNodeContents(n) { this.node = n } }),
    createTextNode: (t) => ({ nodeValue: String(t), childNodes: [] }),
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => queryAll(root, sel)[0] || null,
    querySelectorAll: (sel) => queryAll(root, sel),
    _root: root,
    _register: (id, node) => { byId[id] = node },
  }
  // Elements the page mints and then looks up by id (the per-file <details>).
  const origCreate = document.createElement
  document.createElement = (tag) => {
    const n = origCreate(tag)
    Object.defineProperty(n, 'id', {
      get: () => n._id,
      set(v) { n._id = v; byId[v] = n },
    })
    return n
  }

  const store = new Map()
  const window = {
    matchMedia: (q) => ({ matches: /min-width/.test(q) }),
    getSelection: () => selection,
    // Real enough to prove the autosave round-trips; `_fail` makes it throw the
    // way Safari does on file://, which is the case the page must survive.
    localStorage: {
      _fail: false,
      getItem(k) {
        if (this._fail) throw new Error('storage disabled')
        return store.has(k) ? store.get(k) : null
      },
      setItem(k, v) {
        if (this._fail) throw new Error('storage disabled')
        store.set(k, v)
      },
    },
    setTimeout: (fn) => fn(),
  }
  return { document, window, byId, store, selection }
}

/**
 * An IntersectionObserver the test drives by hand.
 *
 * ABSENT BY DEFAULT, because that is what the sandbox has always been: the vm
 * context is an explicit allowlist, so every existing test already describes a
 * browser without one — which is exactly the case the page's `typeof` guard is
 * for, and it stays covered for free.
 */
function fakeIntersection() {
  const io = {
    callback: null,
    options: null,
    observed: [],
    /** Hand the page a batch of changes, the way a browser would. */
    fire(entries) {
      io.callback(entries.map((e) => ({ target: e.target, isIntersecting: e.isIntersecting })))
    },
    /** Everything on screen at once — a tall viewport, or a tiny diff. */
    fireAll(nodes) {
      io.fire(nodes.map((target) => ({ target, isIntersecting: true })))
    },
  }
  io.ctor = function (cb, opts) {
    io.callback = cb
    io.options = opts
    this.observe = (node) => io.observed.push(node)
    this.unobserve = (node) => { io.observed = io.observed.filter((n) => n !== node) }
    this.disconnect = () => { io.observed = [] }
  }
  return io
}

function runPage(data, { checks = [], failStorage = false, clipboard = true, execCopy = true, protocol = 'file:', fetchWith = null, claudeUse = null, storage = null, noSelection = false, widths = DEFAULT_WIDTHS, intersect = false } = {}) {
  const html = renderReviewPage(data)
  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(island, 'the island was not closed early')
  const dom = fakeDom(island[1], widths)
  // A SECOND PAGE OVER THE SAME STORAGE is how a reader re-opening their tab is
  // modelled — the decision has to outlive the page object, not just the call.
  if (storage) dom.window.localStorage = storage
  if (failStorage) dom.window.localStorage._fail = true
  if (noSelection) dom.window.getSelection = () => null
  // Three states for the fallback route, matching what browsers really do:
  // present and working, present and refusing, and absent altogether.
  if (execCopy === false) dom.document.execCommand = undefined
  else if (execCopy === 'refuse') dom.document._exec = () => false
  // The review block is spliced in as MARKUP, which the shim cannot parse — so
  // a test that wants checks hands them over already built.
  for (const c of checks) {
    const li = dom.document.createElement('li')
    li.className = `check ${c.level || 'confirm'}`
    li.setAttribute('data-check', c.id)
    if (c.file) li.setAttribute('data-file', c.file)
    if (c.line != null) li.setAttribute('data-line', String(c.line))
    // The jump button, built the way `renderReviewBlock` builds it — the shim
    // cannot parse markup, so a check that would carry one has to be handed it.
    if (c.file) {
      const btn = dom.document.createElement('button')
      btn.className = 'check-file'
      btn.setAttribute('data-goto', c.file)
      if (c.line != null) btn.setAttribute('data-goto-line', String(c.line))
      li.appendChild(btn)
    }
    dom.byId['review-block'].appendChild(li)
  }
  const copied = []
  // No clipboard at all is the `file://` case on a browser that withholds it.
  const navigator = clipboard
    ? { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve() } } }
    : {}
  // The page decides how to send from what it IS — `file:` copies, anything
  // else posts — so the shim has to carry a protocol and a path.
  const location = { protocol, pathname: '/tok/feat-x' }
  // A PUBLISHED page is distinguished by `window.claude.use` being there at
  // all, so the shim grows one only when a test asks for it — every other test
  // keeps describing a page the engine served.
  if (claudeUse) dom.window.claude = { use: claudeUse }
  const posted = []
  const fetch = (url, opts) => {
    posted.push({ url, ...opts })
    return fetchWith
      ? fetchWith(url, opts)
      : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"code":"418207"}') })
  }
  const io = intersect ? fakeIntersection() : null
  vm.runInNewContext(
    `(function (document, window, navigator, location, fetch) { ${pageScript()} })(document, window, navigator, location, fetch)`,
    {
      document: dom.document,
      window: dom.window,
      navigator,
      location,
      fetch,
      JSON,
      encodeURIComponent,
      Promise,
      // Only where a test asked for one — see `fakeIntersection`.
      ...(io ? { IntersectionObserver: io.ctor } : {}),
      // The page stamps a pass with the moment it was sent. The sandbox was
      // simply missing the global, not the page reaching for something it
      // should not have.
      Date,
    },
  )
  dom.copied = copied
  dom.posted = posted
  dom.intersect = io
  return dom
}

// Walk a shim tree collecting nodes whose className contains `cls`.
function findAll(node, cls, out = []) {
  if (node.className && String(node.className).split(/\s+/).includes(cls)) out.push(node)
  for (const c of node.childNodes || []) findAll(c, cls, out)
  return out
}

function fixture(overrides = {}) {
  // 60 unchanged lines, one changed, then 39 more. Big enough that a single
  // ±20 leaves the band standing — a fixture that vanishes on one click cannot
  // tell "expanded correctly" from "removed the band by mistake".
  const body = []
  for (let i = 1; i <= 60; i++) body.push(` line ${i}`)
  body.push('-line 61 old', '+line 61 new')
  for (let i = 62; i <= 100; i++) body.push(` line ${i}`)
  const patch = ['--- a/src/app.js', '+++ b/src/app.js', '@@ -1,100 +1,100 @@', ...body].join('\n')
  return {
    spec: 'feat-x',
    title: 'feat-x',
    branch: 'feat/x',
    mode: 'working',
    base: null,
    generatedAt: '2020-01-01T00:00:00.000Z',
    totals: { files: 2, additions: 1, deletions: 1 },
    review: null,
    files: [
      { path: 'src/app.js', status: 'modified', additions: 1, deletions: 1, whole: true, noise: false, binary: false, patch },
      {
        path: 'specs/in-progress/feat-x/00-overview.md',
        status: 'modified', additions: 1, deletions: 0, whole: true, noise: true, binary: false,
        patch: ['--- a/x', '+++ b/x', '@@ -1,1 +1,2 @@', ' # x', '+more'].join('\n'),
      },
    ],
    ...overrides,
  }
}

test('unchanged runs collapse into bands that report what they hide', () => {
  const dom = runPage(fixture())
  const bands = findAll(dom.byId.files, 'band')
  assert.strictEqual(bands.length, 2, 'one band above the change, one below')
  assert.match(bands[0].textContent, /unchanged lines/)
  // 60 leading context lines, 4 kept next to the change → 56 hidden.
  assert.match(bands[0].textContent, /^⋯56 unchanged lines/)
})

test('expanding a band re-renders the file with more context, not fewer bands', () => {
  const dom = runPage(fixture())
  const before = findAll(dom.byId.files, 'band')
  const stepBtn = before[0].childNodes[1].childNodes[1]
  stepBtn.dispatch('click')
  const after = findAll(dom.byId.files, 'band')
  assert.strictEqual(after.length, 2, 'the band is still there, just smaller')
  // 56 hidden, 20 revealed at each end → 16.
  assert.match(after[0].textContent, /^⋯16 unchanged lines/)
})

test('"show all" removes a band entirely', () => {
  const dom = runPage(fixture())
  const band = findAll(dom.byId.files, 'band')[0]
  band.childNodes[1].childNodes[2].dispatch('click')
  const after = findAll(dom.byId.files, 'band')
  assert.strictEqual(after.length, 1, 'only the band below the change remains')
})

test('the page-level control expands every file at once', () => {
  const dom = runPage(fixture())
  assert.ok(findAll(dom.byId.files, 'band').length > 0)
  dom.byId['expand-all'].dispatch('click')
  assert.deepStrictEqual(findAll(dom.byId.files, 'band'), [])
  dom.byId['collapse-all'].dispatch('click')
  assert.ok(findAll(dom.byId.files, 'band').length > 0, 'and puts them back')
})

test('the tree lists every file, including the ones the noise filter hides', () => {
  const dom = runPage(fixture())
  const entries = findAll(dom.byId.tree, 'tree-file')
  assert.strictEqual(entries.length, 2, 'both files are reachable from the tree')
  assert.ok(entries.some((e) => e.textContent.includes('00-overview.md')), 'the bookkeeping file too')
  assert.match(dom.byId['tree-summary'].textContent, /Files \(2\)/)
})

test('clicking a hidden file in the tree turns the filter on and opens it', () => {
  const dom = runPage(fixture())
  const noiseDetails = dom.byId['f-' + encodeURIComponent('specs/in-progress/feat-x/00-overview.md')]
  assert.strictEqual(noiseDetails.hidden, true, 'bookkeeping starts filtered out')
  assert.strictEqual(noiseDetails.open, false, 'and unrendered')

  const entry = findAll(dom.byId.tree, 'tree-file').find((e) => e.textContent.includes('00-overview.md'))
  entry.dispatch('click')

  assert.strictEqual(dom.byId['show-noise'].checked, true, 'the filter was turned on for you')
  assert.strictEqual(noiseDetails.hidden, false)
  assert.strictEqual(noiseDetails.open, true)
})

// --- which file am I reading ------------------------------------------------

const CODE = 'src/app.js'
const NOISE = 'specs/in-progress/feat-x/00-overview.md'
const row = (dom, name) =>
  findAll(dom.byId.tree, 'tree-file').find((e) => e.textContent.includes(name))
const isCurrent = (node) => String(node.className).split(/\s+/).includes('is-current')
const card = (dom, path) => dom.byId['f-' + encodeURIComponent(path)]

test('the tree marks the topmost file on screen, and only that one', () => {
  const dom = runPage(fixture(), { intersect: true })
  assert.strictEqual(dom.intersect.observed.length, 2, 'every file card is watched')

  dom.intersect.fireAll([card(dom, CODE), card(dom, NOISE)])

  assert.ok(isCurrent(row(dom, 'app.js')), 'the first file in document order wins')
  assert.ok(!isCurrent(row(dom, '00-overview.md')), 'and it is the only one marked')
})

test('the mark moves as the file under the band changes', () => {
  const dom = runPage(fixture(), { intersect: true })
  dom.intersect.fireAll([card(dom, CODE)])
  assert.ok(isCurrent(row(dom, 'app.js')))

  // The first scrolls off as the second comes in — one batch, the way a
  // browser delivers it.
  dom.intersect.fire([
    { target: card(dom, CODE), isIntersecting: false },
    { target: card(dom, NOISE), isIntersecting: true },
  ])

  assert.ok(isCurrent(row(dom, '00-overview.md')), 'the mark followed')
  assert.ok(!isCurrent(row(dom, 'app.js')), 'and left the row it was on')
  assert.strictEqual(
    findAll(dom.byId.tree, 'tree-file').filter(isCurrent).length,
    1,
    'exactly one row is ever current',
  )
})

test('clicking a file in the tree marks it without waiting for the observer', () => {
  const dom = runPage(fixture(), { intersect: true })
  row(dom, 'app.js').dispatch('click')
  assert.ok(isCurrent(row(dom, 'app.js')))
})

// STAYS SILENT. A browser with no IntersectionObserver is not a broken one,
// and the page must render, build its tree and mark nothing — the same shape
// the ResizeObserver guard beside it takes.
test('a browser without IntersectionObserver gets a working page and no highlight', () => {
  const dom = runPage(fixture())
  assert.strictEqual(dom.intersect, null, 'the sandbox really has none')
  assert.strictEqual(findAll(dom.byId.tree, 'tree-file').length, 2, 'the tree is still a tree')
  assert.deepStrictEqual(findAll(dom.byId.tree, 'tree-file').filter(isCurrent), [])
})

// STAYS SILENT. Scrolled above the first card or past the last, nothing is on
// screen — which is not an answer. Clearing the mark there would flicker it off
// every time a card boundary crossed the band.
test('nothing on screen leaves the last marked row exactly where it was', () => {
  const dom = runPage(fixture(), { intersect: true })
  dom.intersect.fireAll([card(dom, CODE)])
  assert.ok(isCurrent(row(dom, 'app.js')))

  dom.intersect.fire([{ target: card(dom, CODE), isIntersecting: false }])

  assert.ok(isCurrent(row(dom, 'app.js')), 'still marked')
})

// STAYS SILENT. A row already inside the sidebar's scrollport must not be
// scrolled to — that is the constant motion this deliberately avoids.
test('the tree does not scroll for a row that is already in view', () => {
  const dom = runPage(fixture(), { intersect: true })
  dom.byId['tree-wrap']._rect = { top: 0, bottom: 500 }
  row(dom, 'app.js')._rect = { top: 20, bottom: 40 }

  dom.intersect.fireAll([card(dom, CODE)])

  assert.deepStrictEqual(row(dom, 'app.js')._scrolls, [], 'nothing moved')
})

test('the tree scrolls itself when the marked row has left its scrollport', () => {
  const dom = runPage(fixture(), { intersect: true })
  dom.byId['tree-wrap']._rect = { top: 0, bottom: 500 }
  row(dom, '00-overview.md')._rect = { top: 900, bottom: 920 }

  dom.intersect.fireAll([card(dom, NOISE)])

  // Asserted field by field rather than with deepStrictEqual: the options
  // object is minted inside the vm realm, so its prototype is not this one's
  // and a deep-equal fails on two objects that print identically.
  const scrolls = row(dom, '00-overview.md')._scrolls
  assert.strictEqual(scrolls.length, 1, 'scrolled once')
  assert.strictEqual(scrolls[0].block, 'nearest', 'nudged in, never re-centred')
})

test('a decided page points at nothing, since its diff is hidden', async () => {
  const dom = runPage(fixture(), { intersect: true, protocol: 'http:' })
  dom.intersect.fireAll([card(dom, CODE)])
  assert.ok(isCurrent(row(dom, 'app.js')))

  dom.byId['verdict-commit'].dispatch('click')
  await drained()

  assert.strictEqual(findAll(dom.byId.tree, 'tree-file').filter(isCurrent).length, 0)
})

test('the noise filter hides bookkeeping and leaves real code alone', () => {
  const dom = runPage(fixture())
  const code = dom.byId['f-' + encodeURIComponent('src/app.js')]
  const noise = dom.byId['f-' + encodeURIComponent('specs/in-progress/feat-x/00-overview.md')]
  assert.strictEqual(code.hidden, false)
  assert.strictEqual(noise.hidden, true)
  dom.byId['show-noise'].checked = true
  dom.byId['show-noise'].dispatch('change')
  assert.strictEqual(noise.hidden, false)
})

test('line numbers come from the hunk header, on both sides', () => {
  const dom = runPage(fixture())
  const gutters = findAll(dom.byId.files, 'gutter').map((g) => g.textContent)
  // The first rendered row is context line 57 (4 kept before the change at 61).
  assert.ok(gutters.some((g) => g.includes('57')), 'context carries its line number')
  const add = findAll(dom.byId.files, 'add')[0]
  assert.match(add.childNodes[0].textContent, /\+$/, 'an addition is marked in the gutter')
})

test('the theme button drives the [data-theme] attribute in both directions', () => {
  const dom = runPage(fixture())
  const root = dom.document.documentElement
  assert.strictEqual(root.getAttribute('data-theme'), null, 'untouched until asked')
  dom.byId.theme.dispatch('click')
  const first = root.getAttribute('data-theme')
  assert.ok(first === 'dark' || first === 'light')
  dom.byId.theme.dispatch('click')
  assert.notStrictEqual(root.getAttribute('data-theme'), first, 'and back again')
})

test('a patch containing </script> survives into the rendered rows', () => {
  const data = fixture()
  data.files = [
    {
      path: 'page.html', status: 'new', additions: 1, deletions: 0, whole: true, noise: false, binary: false,
      patch: ['--- /dev/null', '+++ b/page.html', '@@ -0,0 +1 @@', '+<script>var a = 1</script>'].join('\n'),
    },
  ]
  const dom = runPage(data)
  const adds = findAll(dom.byId.files, 'add')
  assert.strictEqual(adds.length, 1)
  assert.strictEqual(adds[0].childNodes[1].textContent, '<script>var a = 1</script>')
})

test('stays silent: a spec with no files renders a page rather than throwing', () => {
  const data = fixture({ files: [], totals: { files: 0, additions: 0, deletions: 0 } })
  const dom = runPage(data)
  assert.match(dom.byId.files.textContent, /Nothing to review/)
  assert.match(dom.byId['tree-summary'].textContent, /Files \(0\)/)
})

test('stays silent: a binary file says so instead of rendering an empty table', () => {
  const data = fixture({
    files: [
      { path: 'logo.png', status: 'modified', additions: 0, deletions: 0, whole: true, noise: false, binary: true,
        patch: 'Binary files a/logo.png and b/logo.png differ\n' },
    ],
    totals: { files: 1, additions: 0, deletions: 0 },
  })
  const dom = runPage(data)
  assert.match(dom.byId.files.textContent, /Binary file/)
})

test('TEMPLATE_PATH resolves inside the package that ships it', () => {
  assert.ok(fs.existsSync(TEMPLATE_PATH), TEMPLATE_PATH)
  assert.ok(TEMPLATE_PATH.endsWith(path.join('assets', 'review', 'page.html')))
})

// --- the review round-trip: marks, notes, replies, blob ---------------------

const {
  validateNotesBlob,
  mergeNotes,
  emptyNotes,
} = require('../src/env/review.js')

// The fixture above predates the marks, so it carries none of their fields —
// which is itself worth keeping: it is the page rendering a spec with no notes.
function marked(overrides = {}) {
  const base = fixture()
  base.notes = { version: 1, updatedAt: null, totals: { accepted: 0, lapsed: 0, unresolved: 0, resolved: 0 }, unanchored: [] }
  base.files = base.files.map((f) => ({ ...f, hash: 'h-' + f.path, accepted: false, acceptedAt: null, comments: [] }))
  return { ...base, ...overrides }
}

const accepts = (dom) => findAll(dom.byId.files, 'accept')
const gutters = (dom) => findAll(dom.byId.files, 'can-note')

// The editor is one shape everywhere: [textarea, [ok, cancel?]].
function writeNote(input, text) {
  input.value = text
  input.parentNode.childNodes[1].childNodes[0].dispatch('click')
}

// Take the blob the page ACTUALLY emits, through the button a person presses.
// There is no verdict-less control any more — every pass leaves the page having
// said something — so the marks-only tests below press the one that means
// "report it and stop", which is what they were always asking for.
function copyBlob(dom, verdict = 'discuss') {
  const before = dom.copied.length
  dom.byId['verdict-' + verdict].dispatch('click')
  assert.strictEqual(dom.copied.length, before + 1, 'the blob reached the clipboard')
  return JSON.parse(dom.copied[dom.copied.length - 1])
}

const countSays = (dom) => dom.byId['verdict-count'].textContent

// Every blob this file produces goes through the real validator. That is the
// whole point of driving the page rather than asserting on its source: the page
// and the engine cannot drift apart without a test here going red.
function accepted(blob, spec = 'feat-x') {
  return validateNotesBlob(blob, spec)
}

test('ticking accept sends the file and the hash it was read at', () => {
  const dom = runPage(marked())
  assert.match(countSays(dom), /Nothing marked/, 'nothing marked yet')
  accepts(dom)[0].dispatch('click')
  assert.strictEqual(countSays(dom), '1 mark to send')

  const blob = copyBlob(dom)
  accepted(blob)
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
  assert.deepStrictEqual(blob.unaccepted, [])
})

test('an accept already recorded says nothing; withdrawing it is explicit', () => {
  const data = marked()
  data.files[0].accepted = true
  const dom = runPage(data)

  // Ticked on arrival, and nothing has changed — so there is nothing to send.
  assert.match(countSays(dom), /Nothing marked/)

  accepts(dom)[0].dispatch('click') // untick
  const blob = copyBlob(dom)
  accepted(blob)
  assert.deepStrictEqual(blob.accepted, [], 'no re-send of what is already stored')
  assert.deepStrictEqual(blob.unaccepted, ['src/app.js'], 'withdrawal cannot be expressed by absence')
})

test('a lapsed accept is shown as lapsed, and re-ticking re-sends the new hash', () => {
  const data = marked()
  data.files[0].accepted = 'lapsed'
  data.files[0].acceptedAt = '2020-01-01T00:00:00.000Z'
  const dom = runPage(data)

  const chips = findAll(dom.byId.files, 'lapsed')
  assert.strictEqual(chips.length, 1)
  assert.match(chips[0].textContent, /accepted earlier — changed since/)

  assert.strictEqual(accepts(dom)[0].getAttribute('aria-pressed'), 'false', 'a lapse is not a tick')
  accepts(dom)[0].dispatch('click')
  const blob = copyBlob(dom)
  accepted(blob)
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
})

test('a comment from the gutter carries the line and the line it was about', () => {
  const dom = runPage(marked())
  const changed = gutters(dom).find((g) => g.textContent.includes('+'))
  changed.dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this needs the old value kept')

  const blob = copyBlob(dom)
  accepted(blob)
  assert.strictEqual(blob.comments.length, 1)
  const c = blob.comments[0]
  assert.strictEqual(c.file, 'src/app.js')
  assert.strictEqual(c.line, 61)
  assert.strictEqual(c.lineText, 'line 61 new', 'the text travels, so the note survives the line moving')
  assert.match(c.id, /^2020-01-01T00:00:00\.000Z-/, 'ids are minted from the render, so a re-paste merges')
})

test('a note about the whole file carries no line', () => {
  const dom = runPage(marked())
  const strip = findAll(dom.byId.files, 'strip')[0]
  strip.childNodes[strip.childNodes.length - 1].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'split this module')

  const blob = copyBlob(dom)
  accepted(blob)
  assert.strictEqual(blob.comments[0].line, null)
  assert.strictEqual(blob.comments[0].file, 'src/app.js')
})

test('a stored comment renders at its line, and the band hiding it is opened', () => {
  const data = marked()
  // Line 20 sits deep inside the collapsed run above the change.
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: 20, lineText: ' line 20', check: null, note: 'why this order?', raisedAt: 'T', resolved: null },
  ]
  const dom = runPage(data)
  const notes = findAll(dom.byId.files, 'note-row')
  assert.strictEqual(notes.length, 1, 'it is rendered')
  assert.match(notes[0].textContent, /line 20/)
  assert.match(notes[0].textContent, /why this order\?/)
  assert.doesNotMatch(notes[0].textContent, /not sent yet/, 'a stored note is already sent')
  const rows = findAll(dom.byId.files, 'has-note')
  assert.strictEqual(rows.length, 1, 'its line is marked')
})

test('a resolved comment is struck through and shows what was done', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: 61, lineText: 'line 61 new', check: null, note: 'hash this', raisedAt: 'T', resolved: { at: 'T2', note: 'keyed on the blob sha' } },
  ]
  const dom = runPage(data)
  const resolved = findAll(dom.byId.files, 'is-resolved')
  assert.strictEqual(resolved.length, 1)
  assert.match(resolved[0].textContent, /keyed on the blob sha/)
})

test('answering a check rides back tagged with the check and its file', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'confirm', file: 'src/app.js' }] })
  const li = dom.document.querySelector('.check[data-check="k0"]')
  assert.ok(li, 'the reply box found the check')
  li.querySelector('.reply').childNodes[0].dispatch('click')
  writeNote(li.querySelector('.note-input'), 'yes — deliberate')

  const blob = copyBlob(dom)
  accepted(blob)
  const reply = blob.comments.find((c) => c.check === 'k0')
  assert.ok(reply, 'the answer is a comment carrying the check id')
  assert.strictEqual(reply.file, 'src/app.js')
  assert.strictEqual(reply.note, 'yes — deliberate')
})

test('a check with no file answers against the review itself, and still validates', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'flag' }] })
  const li = dom.document.querySelector('.check[data-check="k0"]')
  li.querySelector('.reply').childNodes[0].dispatch('click')
  writeNote(li.querySelector('.note-input'), 'agreed')
  const blob = copyBlob(dom)
  accepted(blob)
  assert.strictEqual(blob.comments[0].file, '(review)', 'the sentinel keeps the blob valid')
})

test('what the page emits is what the engine stores', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'keep the old value')

  const blob = copyBlob(dom)
  const notes = mergeNotes(emptyNotes('feat-x'), accepted(blob), 'T1')
  assert.deepStrictEqual(notes.files['src/app.js'], { acceptedHash: 'h-src/app.js', acceptedAt: 'T1' })
  assert.strictEqual(notes.comments.length, 1)
  assert.strictEqual(notes.comments[0].line, 61)
})

test('a draft can be removed before it is ever sent', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  assert.strictEqual(copyBlob(dom).comments.length, 1, 'written')

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(copyBlob(dom).comments.length, 0)
})

test('the pass is autosaved, and storage that throws does not break the page', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  const saved = JSON.parse(dom.store.get('skitterspec-review:feat-x:2020-01-01T00:00:00.000Z'))
  assert.strictEqual(saved.accepts['src/app.js'], true, 'a tab switch mid-review costs nothing')

  // Safari on file:// THROWS rather than returning null. A page that failed to
  // render because it could not autosave would be the worse bug by far.
  const blind = runPage(marked(), { failStorage: true })
  assert.ok(findAll(blind.byId.files, 'file').length > 0 || blind.byId.files.childNodes.length > 0, 'still renders')
  accepts(blind)[0].dispatch('click')
  assert.strictEqual(copyBlob(blind).accepted.length, 1, 'and still works')
})

test('with no clipboard the blob is offered as text instead', () => {
  const dom = runPage(marked(), { clipboard: false })
  accepts(dom)[0].dispatch('click')
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.byId['copy-out'].hidden, false, 'the fallback is shown')
  accepted(JSON.parse(dom.byId['copy-out'].value))
  assert.match(dom.byId['copy-hint'].textContent, /paste it to Claude/)
})

test('a page with no marks at all emits nothing and says nothing', () => {
  const dom = runPage(marked())
  assert.match(countSays(dom), /Nothing marked/)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'a clean read is committable')
  assert.strictEqual(dom.byId['verdict-log'].hidden, true, 'no verdict has been reached here')
  assert.deepStrictEqual(findAll(dom.byId.files, 'lapsed'), [], 'nothing is accused of being stale')
  assert.deepStrictEqual(findAll(dom.byId.files, 'note-row'), [])
})

test('a resolved comment is history, not an outstanding ask', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: 61, lineText: 'line 61 new', check: null, note: 'hash this', raisedAt: 'T', resolved: { at: 'T2', note: 'keyed on the blob sha' } },
    { id: 'c2', file: 'src/app.js', line: null, lineText: null, check: null, note: 'still open', raisedAt: 'T', resolved: null },
  ]
  const dom = runPage(data)
  // Neither counts: both were already sent. The count is what YOU have written
  // and not yet handed over, never a tally of outstanding work.
  assert.match(countSays(dom), /Nothing marked/)

  // The open one is advertised on the summary; the resolved one is not.
  const chips = findAll(dom.byId.files, 'commented')
  assert.strictEqual(chips.length, 1)
  assert.match(chips[0].textContent, /^1 note$/)
})

// --- the verdict bar --------------------------------------------------------

// Every verdict the page emits goes through the REAL validator, so the three
// buttons and the engine's accepted vocabulary cannot drift apart in silence.

test('each button sends its own verdict, and the engine accepts each', () => {
  // The page and the engine now speak the same words — phase 2 closed the gap
  // phase 1 opened deliberately. The tolerance for an older page's `approve`
  // lives in `env-review-verdict.test.js`, where it belongs: it is about a
  // stale tab, not about what this page sends.
  for (const verdict of ['commit', 'commit-continue', 'changes', 'discuss']) {
    const dom = runPage(marked())
    const blob = copyBlob(dom, verdict)
    assert.strictEqual(blob.verdict, verdict, 'the page sends what its button carries')
    assert.strictEqual(accepted(blob).verdict, verdict, 'and the engine reads it back unchanged')
  }
})

test('a verdict travels with the marks it was reached on', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  const blob = copyBlob(dom, 'commit')
  assert.strictEqual(accepted(blob).verdict, 'commit', 'the engine reads the page word as the action')
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
  accepted(blob)
})

test('committing is blocked while a note is open, and says so on both buttons', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)

  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'keep the old value')

  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  // The reason is IN THE LABEL. A dimmed button with the reason in a tooltip is
  // unreachable on the phone this page is read on.
  assert.match(dom.byId['verdict-commit'].textContent, /1 open note/)
  assert.strictEqual(dom.byId['verdict-changes'].disabled, false, 'changes is the point of a note')
  assert.strictEqual(dom.byId['verdict-discuss'].disabled, false)
})

test('a blocked commit emits nothing at all', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this one first')

  const before = dom.copied.length
  dom.byId['verdict-commit'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact, not a style')
  assert.strictEqual(dom.byId['copy-out'].hidden, true, 'and no fallback textarea either')
})

test('removing the last note re-enables committing, live', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'the bar describes the pass as it stands')
  assert.strictEqual(dom.byId['verdict-commit'].textContent, '✓ Commit')
})

test('a stored comment the agent has not answered blocks committing too', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: null, lineText: null, check: null, note: 'still open', raisedAt: 'T', resolved: null },
  ]
  data.notes.totals.unresolved = 1
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  assert.match(dom.byId['verdict-commit'].textContent, /1 open note/)
})

test('a comment the agent resolved does not block committing', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: null, lineText: null, check: null, note: 'done', raisedAt: 'T', resolved: { at: 'T2', note: 'fixed' } },
  ]
  data.notes.totals.resolved = 1
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

// STAYS SILENT: the healthy-but-unusual input for the one accusing control on
// this page. A 60-file phase read straight through and approved without ticking
// a thing is an ordinary review, not an incomplete one — Decision 3.
test('unaccepted files never block committing, however many there are', () => {
  const data = marked()
  data.notes.totals.unresolved = 0
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'ticking is not a gate')
  const blob = copyBlob(dom, 'commit')
  assert.deepStrictEqual(blob.accepted, [], 'and nothing had to be ticked to send it')
  accepted(blob)
})

test('the last decision is shown as history beneath the bar', () => {
  const data = marked()
  // A sidecar written before the rename says `approve`, and it means the same
  // thing the engine reads it as: a commit. The page says what HAPPENED, so it
  // says committed — it used to say "approved", which described the button
  // rather than the outcome.
  data.notes.lastDecision = { verdict: 'approve', at: '2026-09-14T10:00:00.000Z', note: 'committed a1b2c3d' }
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-log'].hidden, false)
  assert.match(dom.byId['verdict-log'].textContent, /committed earlier/)
  assert.match(dom.byId['verdict-log'].textContent, /2026-09-14/)
  assert.match(dom.byId['verdict-log'].textContent, /committed a1b2c3d/)
})

test('every verdict is named, and an unknown one says so', () => {
  // THE FALLBACK WAS A LIE. Anything the page did not recognise read as
  // "discussed" — including `commit`, the commonest verdict there is — so the
  // history line could tell you a commit was a conversation.
  for (const [verdict, said] of [
    ['commit', /committed earlier/],
    ['commit-continue', /committed, then carried on/],
    ['changes', /changes requested/],
    ['discuss', /discussed earlier/],
  ]) {
    const data = marked()
    data.notes.lastDecision = { verdict, at: '2026-09-14T10:00:00.000Z', note: null }
    assert.match(runPage(data).byId['verdict-log'].textContent, said, verdict)
  }
  const odd = marked()
  odd.notes.lastDecision = { verdict: 'something-new', at: '2026-09-14T10:00:00.000Z', note: null }
  assert.match(runPage(odd).byId['verdict-log'].textContent, /recorded as "something-new"/)
})

test('a skip reads as a skip, with its reason', () => {
  // The page's answer to "was this read and moved past, or never read at all?"
  // A skip that did not show would make those two states identical.
  const data = marked()
  data.gate = { armed: false, armedAt: null, phase: '2', lastSkip: { at: '2026-09-14T11:00:00.000Z', reason: 'docs only' } }
  const dom = runPage(data)
  assert.match(dom.byId['verdict-log'].textContent, /moved on without a verdict/)
  assert.match(dom.byId['verdict-log'].textContent, /docs only/)
})

test('the more recent of a verdict and a skip is the one shown', () => {
  const data = marked()
  data.notes.lastDecision = { verdict: 'commit', at: '2026-09-14T10:00:00.000Z', note: null }
  data.gate = { armed: true, armedAt: null, phase: '3', lastSkip: { at: '2026-09-13T10:00:00.000Z', reason: 'older' } }
  assert.match(runPage(data).byId['verdict-log'].textContent, /committed earlier/, 'the newer verdict wins')

  const other = marked()
  other.notes.lastDecision = { verdict: 'commit', at: '2026-09-13T10:00:00.000Z', note: null }
  other.gate = { armed: true, armedAt: null, phase: '3', lastSkip: { at: '2026-09-14T10:00:00.000Z', reason: 'newer' } }
  assert.match(runPage(other).byId['verdict-log'].textContent, /moved on without a verdict/)
})

test('the verdict bar sits after the diff, not above it', () => {
  // POSITIONAL, on the template text. The bar began in the header and the first
  // person to use it could not find it: you read the diff downward and the
  // control asking for your conclusion was off-screen above you. A later edit
  // that tidies it back into the header re-creates exactly that, so the order
  // is pinned rather than left to prose.
  const files = TEMPLATE.search(/<div id="files"/)
  const bar = TEMPLATE.indexOf('id="verdict-commit"')
  assert.ok(files > -1 && bar > -1, 'both are present')
  assert.ok(bar > files, 'the verdict comes after the thing it is a verdict on')
  // And the whole pass travels with it — the fallback textarea a `file://`
  // reader depends on must not be left behind in the header.
  assert.ok(TEMPLATE.indexOf('id="copy-out"') > files, 'the clipboard fallback moved too')
})

// --- sending, and falling back ----------------------------------------------
//
// Driven through the real page against the REAL validator, as every other
// round-trip test here is: the page and the engine cannot drift apart without
// one of these going red.

const pressed = (dom, verdict = 'discuss') => dom.byId['verdict-' + verdict].dispatch('click')

// The posting path answers on a promise, so anything it sets is written after
// the click returns. `setImmediate` runs once the microtask queue has drained,
// which is the shortest honest wait — a fixed delay would be a guess.
const settled = () => new Promise((r) => setImmediate(r))

test('a served page posts the pass to its own URL', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  accepts(dom)[0].dispatch('click')
  pressed(dom, 'commit')

  assert.strictEqual(dom.posted.length, 1, 'it went over the wire')
  assert.strictEqual(dom.copied.length, 0, 'and not to the clipboard')
  const sent = dom.posted[0]
  assert.strictEqual(sent.url, '/tok/feat-x', "the page's own path, so there is no second address")
  assert.strictEqual(sent.method, 'POST')
  // The REAL validator, on the body the page actually sent.
  const blob = JSON.parse(sent.body)
  accepted(blob)
  assert.strictEqual(blob.verdict, 'commit')
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
})

test('the command is handed over where the verdict was pressed', async () => {
  // Once the page has ESTABLISHED that nobody picked the pass up. It used to be
  // handed over on every send, which is what taught the reader to ignore it.
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'discuss')
  await drained()
  // The code used to be read out for CHECKING, back when the agent went looking
  // for a pass and had to prove which one it had. It is handed over as the whole
  // command now — the reader's next action, not a number to compare.
  assert.match(dom.byId['decided-what'].textContent, /You chose/)
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is offered')
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  assert.doesNotMatch(dom.byId['sent-cmd-lead'].textContent, /claim it with/, 'it asks for no transcription')
})

// ── Phase 2 of feat-page-hands-you-the-command ───────────────────────────────

test('with a clipboard, Copy is offered and puts the command on it verbatim', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  pressed(dom, 'commit')
  await settled()
  const btn = dom.byId['sent-cmd-copy']
  assert.strictEqual(btn.hidden, false, 'the button exists where it can work')
  btn.dispatch('click')
  await settled()
  assert.deepStrictEqual(dom.copied, ['/spec-reviewed 418207'], 'verbatim, code included')
  assert.match(btn.textContent, /Copied/)
})

// THE CASE THE BUTTON EXISTS FOR, and the one it used to be missing from.
// `navigator.clipboard` is secure-context-only, so it is absent on every
// `http://<lan-ip>:7777` page — which is the page someone reads on a phone.
// Gating the button on that API alone hid it exactly there, and left a phone
// reader long-pressing to select text the page could have copied for them.
// `document.execCommand('copy')` has no such restriction.
test('a LAN-served page with no clipboard API still offers Copy, and it works', async () => {
  const dom = runPage(marked(), { protocol: 'http:', clipboard: false, fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'commit')
  await drained()
  const btn = dom.byId['sent-cmd-copy']
  assert.strictEqual(btn.hidden, false, 'the button is there without a clipboard API')
  btn.dispatch('click')
  await drained()
  assert.deepStrictEqual(dom.document._execCopied, ['/spec-reviewed 418207'], 'verbatim, code included')
  assert.match(btn.textContent, /Copied/)
})

test('with a button, the command is NOT pre-selected', async () => {
  // Pre-selecting is what made the line read as a focused input rather than a
  // command, and it is the long-press gesture the button is here to spare.
  const dom = runPage(marked(), { protocol: 'http:', clipboard: false, fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.selection.ranges.length, 0, 'nothing selected before the tap')
  assert.doesNotMatch(dom.byId['sent-cmd-lead'].textContent, /selected/i)
})

// NEVER A BUTTON THAT CANNOT COPY — unchanged as a rule; what changed is that
// the capability is now asked about honestly. Both routes gone is the only
// state that earns the text-only page.
test('no Copy control appears when NEITHER copy route exists', async () => {
  const dom = runPage(marked(), { protocol: 'http:', clipboard: false, execCopy: false })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd-copy'].hidden, true)
  assert.match(dom.byId['sent-cmd-lead'].textContent, /copy it/i, 'and it asks by hand instead')
})

test('a copy route that REFUSES leaves the command selected, and says so', async () => {
  // Present-but-refusing is a real browser state, and it is why the selection
  // is made before execCommand rather than after: the reader is left exactly
  // where the old no-clipboard page put them, not empty-handed.
  const dom = runPage(marked(), {
    protocol: 'http:', clipboard: false, execCopy: 'refuse', fetchWith: polling(['waiting']).fetchWith,
  })
  pressed(dom, 'commit')
  await drained()
  dom.byId['sent-cmd-copy'].dispatch('click')
  await drained()
  assert.match(dom.byId['sent-cmd-copy'].textContent, /Copy failed — selected/)
  assert.strictEqual(dom.selection.ranges[0].node, dom.byId['sent-cmd-text'])
})

// A server that answered without a code cannot have its pass addressed, so the
// page does not invent an address for it.
test('no code means no command, and the bare instruction instead', async () => {
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true)
  assert.match(dom.byId['copy-hint'].textContent, /run \/spec-reviewed to pick it up/)
})

// STAYS SILENT (`negative-checks.md` rule 3), twice over: a page that sent
// nothing shows no command, and the `file://` path never had a code to offer.
test('stays silent: nothing sent shows no command, and file:// is untouched', () => {
  const fresh = runPage(marked(), { protocol: 'http:' })
  assert.strictEqual(fresh.byId['sent-cmd'].hidden, true, 'nothing offered before a verdict')

  const local = runPage(marked())
  pressed(local, 'commit')
  assert.strictEqual(local.byId['sent-cmd'].hidden, true, 'no command on a file:// page')
  assert.strictEqual(local.copied.length, 1, 'it copied the blob, exactly as before')
})

test('a refused pass offers no command to run', async () => {
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () => Promise.resolve({ ok: false, status: 422, text: () => Promise.resolve('nope') }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true, 'nothing was held, so nothing to claim')
})

test('a refused pass is shown, not swallowed', async () => {
  // A pass the server rejected must never read as sent — the engine's message
  // names the entry that was wrong, so it is relayed rather than summarised.
  // It reads out of the CALLOUT now rather than the footer's grey line: the one
  // outcome the reader must act on stopped being quieter than the one they need
  // do nothing about.
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () =>
      Promise.resolve({
        ok: false,
        status: 422,
        text: () => Promise.resolve('verdict "aprove" is not one of approve, changes, discuss'),
      }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['send-failed'].hidden, false)
  assert.match(dom.byId['send-failed-what'].textContent, /Not sent/)
  assert.match(dom.byId['send-failed-note'].textContent, /verdict "aprove" is not one of/)
  assert.strictEqual(dom.byId['copy-hint'].hidden, true, 'and not also in the footer')
})

test('a request that never arrives is named, and the verdict is recoverable', async () => {
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: () => Promise.reject(new Error('gone')) })
  pressed(dom, 'discuss')
  await settled()
  assert.strictEqual(dom.byId['send-failed'].hidden, false)
  assert.match(dom.byId['send-failed-what'].textContent, /could not reach the server/i)
  // An unmarked pass is one word, so the command carries it — which reaches the
  // agent whether or not any server ever comes back.
  assert.strictEqual(dom.byId['send-failed-cmd'].hidden, false)
  assert.strictEqual(dom.byId['send-failed-text'].textContent, '/spec-reviewed discuss')
})

// STAYS SILENT (`negative-checks.md` rule 3). A `file://` page has no server to
// talk to and never will, so it must behave exactly as it did before any of
// this existed — the clipboard path is not deprecated, it is the whole story
// for a local reader.
test('stays silent: a file:// page still copies, and never reaches for fetch', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  pressed(dom, 'changes')
  assert.strictEqual(dom.posted.length, 0, 'no request was attempted')
  assert.strictEqual(dom.copied.length, 1, 'it went to the clipboard as always')
  const blob = JSON.parse(dom.copied[0])
  accepted(blob)
  assert.strictEqual(blob.verdict, 'changes')
})

test('the marks stay put after sending — a pass is not spent until it is claimed', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  accepts(dom)[0].dispatch('click')
  assert.strictEqual(countSays(dom), '1 mark to send')
  pressed(dom, 'discuss')
  // Clearing here would be the page lying about state it does not own: the
  // engine holds the pass, and only a claim spends it.
  assert.strictEqual(countSays(dom), '1 mark to send')
  assert.strictEqual(accepts(dom)[0].getAttribute('aria-pressed'), 'true')
})

test('the decision is not re-judged on the way out', () => {
  // Approve is blocked while a note is open, and that block is the page's only
  // refusal. It must hold on the posting path exactly as it does on the copying
  // one — nothing may become sendable merely by being sent differently.
  const dom = runPage(marked(), { protocol: 'http:' })
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  pressed(dom, 'commit')
  assert.strictEqual(dom.posted.length, 0, 'the block is a fact on every path')
})

// --- the four buttons (feat-verdict-is-the-action phase 2) -------------------

test('the page offers four verdicts, labelled for what they do', () => {
  assert.match(TEMPLATE, /id="verdict-commit"[^>]*>✓ Commit</)
  assert.match(TEMPLATE, /id="verdict-commit-continue"[^>]*>✓ Commit &amp; Continue</)
  assert.match(TEMPLATE, /id="verdict-changes"/)
  assert.match(TEMPLATE, /id="verdict-discuss"/)
})

// THE PAIRING IS THE POINT. Two committing controls blocked by two separate
// reads is how a page ends up with one disabled and the other not — which would
// be a way around the single refusal this page makes.
test('both committing buttons block and unblock together, off one count', () => {
  const dom = runPage(marked())
  const commit = () => dom.byId['verdict-commit']
  const cont = () => dom.byId['verdict-commit-continue']
  assert.strictEqual(commit().disabled, false)
  assert.strictEqual(cont().disabled, false)

  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')
  assert.strictEqual(commit().disabled, true, 'commit is blocked')
  assert.strictEqual(cont().disabled, true, 'and so is commit & continue')
  // The reason is on BOTH labels, not just the first.
  assert.match(commit().textContent, /1 open note/)
  assert.match(cont().textContent, /1 open note/)

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(commit().disabled, false, 'both come back')
  assert.strictEqual(cont().disabled, false)
  assert.strictEqual(commit().textContent, '✓ Commit')
  assert.strictEqual(cont().textContent, '✓ Commit & Continue')
})

test('a blocked commit-continue emits nothing either', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')
  const before = dom.copied.length
  dom.byId['verdict-commit-continue'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact on both, not just on commit')
})

test('continue says what it will not do', () => {
  // A reader must not press it expecting the spec to be finished and landed —
  // `/spec-next` builds the next phase and stops there.
  assert.match(TEMPLATE, /then build the next phase — nothing is landed/)
})

// STAYS SILENT (`negative-checks.md` rule 3). The two that ask for something
// are never blocked, and nothing about ticking files blocks anything — Decisions
// 1 and 3 of `feat-review-verdict` are untouched by a fourth button.
test('stays silent: changes, discuss and unticked files block nothing', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'a note')
  assert.strictEqual(dom.byId['verdict-changes'].disabled, false)
  assert.strictEqual(dom.byId['verdict-discuss'].disabled, false)

  const clean = runPage(marked())
  for (const id of ['verdict-commit', 'verdict-commit-continue']) {
    assert.strictEqual(clean.byId[id].disabled, false, `${id} needs no ticks`)
  }
})

test('the committing verdicts are named once, so one cannot slip the block', () => {
  // The same reason the engine keeps a COMMITTING list rather than a second
  // condition: adding a committing verdict means adding it to one place.
  //
  // PINNED LITERALLY, and updated deliberately when `commit-start` was added —
  // which is the test doing its job. A regex loose enough to accept a new
  // member without anyone noticing would accept the bug this guards against:
  // a committing verdict that is not in the list is a committing verdict an
  // open comment does not block.
  assert.match(TEMPLATE, /var COMMITTERS = \['commit', 'commit-continue', 'commit-start', 'commit-land'\]/)
  assert.match(TEMPLATE, /COMMITTERS\.forEach/)
  // And the old per-button form is gone, not merely unused.
  assert.doesNotMatch(TEMPLATE, /verdictBtns\.approve/)
})

// --- the page names the command, not the arrangement it replaced ------------
//
// `/spec-reviewed` shipped and the page went on describing the interim
// arrangement it replaced: narrate that a pass exists and hope the agent looks.
// Copy that names no command is copy that makes the operator invent one.

test('the sent message names /spec-reviewed', async () => {
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'commit')
  await drained()
  const lead = dom.byId['sent-cmd-lead'].textContent
  const cmd = dom.byId['sent-cmd-text'].textContent
  // The command moved OUT of the sentence and into a field the reader can copy —
  // the lead introduces it. Both halves are asserted so neither can vanish.
  assert.match(cmd, /\/spec-reviewed/, 'it names the command to type')
  assert.match(cmd, /418207/, 'carrying the code, so the pass is addressed')
  assert.match(lead, /Run this/, 'and the lead points at it')
  assert.doesNotMatch(lead, /tell Claude it is waiting/, 'the old arrangement is gone')
})

// --- the button reasons from the phases (feat-page-knows-the-phase) ---------
//
// The operator opened the four-button bar on a COMPLETED spec — nought files,
// "Nothing to review" — and was offered a continue with nothing to continue
// into. One question answers it and the last-phase case together.

const phased = (over) => marked({ phases: over })

test('commit & continue is disabled, with its reason, when no phase is left', () => {
  const dom = runPage(phased({ total: 3, done: 3, hasNextPhase: false }))
  const cont = dom.byId['verdict-commit-continue']
  assert.strictEqual(cont.disabled, true)
  assert.match(cont.textContent, /no phase left/, 'the reason is on the control')
  assert.match(cont.title, /nothing left to build/i)
  // `✓ Commit` is untouched: a clean read still commits, and a finished spec is
  // still a legitimate thing to read.
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
  assert.strictEqual(dom.byId['verdict-commit'].textContent, '✓ Commit')
})

test('a spec with a phase left is offered the continue', () => {
  const dom = runPage(phased({ total: 3, done: 1, hasNextPhase: true }))
  assert.strictEqual(dom.byId['verdict-commit-continue'].disabled, false)
  assert.strictEqual(dom.byId['verdict-commit-continue'].textContent, '✓ Commit & Continue')
})

// CANNOT TELL IS NOT A NO (`negative-checks.md` rules 1 and 4). A spec whose
// phases the engine could not read — a legacy layout, inline phases — must keep
// the button it has always had.
test('stays silent: no phases key leaves both buttons exactly as they were', () => {
  const dom = runPage(marked())
  assert.ok(!('phases' in marked()), 'the fixture carries none')
  assert.strictEqual(dom.byId['verdict-commit-continue'].disabled, false)
  assert.strictEqual(dom.byId['verdict-commit-continue'].textContent, '✓ Commit & Continue')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

// TWO REASONS, ONE LABEL. The open note is the one the reader can act on, so it
// wins — a "no phase left" in its place would send them to fix the wrong thing.
test('an open note outranks no-phase-left on the label', () => {
  const dom = runPage(phased({ total: 2, done: 2, hasNextPhase: false }))
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')

  const cont = dom.byId['verdict-commit-continue']
  assert.strictEqual(cont.disabled, true)
  assert.match(cont.textContent, /1 open note/, 'the actionable reason wins')
  assert.doesNotMatch(cont.textContent, /no phase left/)
  // And commit is blocked by the note too, as it always was.
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  assert.match(dom.byId['verdict-commit'].textContent, /1 open note/)
})

test('removing the note restores the no-phase reason, not the plain label', () => {
  const dom = runPage(phased({ total: 2, done: 2, hasNextPhase: false }))
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')

  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'commit comes back')
  assert.strictEqual(dom.byId['verdict-commit-continue'].disabled, true, 'continue does not')
  assert.match(dom.byId['verdict-commit-continue'].textContent, /no phase left/)
})

test('a disabled continue emits nothing', () => {
  const dom = runPage(phased({ total: 1, done: 1, hasNextPhase: false }))
  const before = dom.copied.length
  dom.byId['verdict-commit-continue'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact, not a style')
})

test('the page asks the filesystem nothing — it reasons from what it was given', () => {
  // A static artefact spliced once. A page that read the filesystem would not be
  // one, and could not be opened from a phone at all.
  assert.match(TEMPLATE, /data\.phases\.hasNextPhase === false/)
  assert.match(TEMPLATE, /Boolean\(data\.phases\)/, 'absence is checked before the value')
})

// ── Phase 1 of feat-seamless-review-loop ─────────────────────────────────────
//
// The page opened on a file list and said nothing about what the change was
// for. A reviewer on a phone met `page.html +18 −4` with no statement of the
// problem or the surfaces it touches — the two things a pull request puts above
// the diff, because nobody can review a change they must reconstruct first.

const CONTEXT = {
  problem: 'The lead paragraph, which is the one that stays open.\n\nA second paragraph that folds away.',
  impact: { rows: [{ surface: 'Engine', change: 'update', detail: 'collectReview — context' }] },
  phase: {
    n: 2,
    title: 'The report ends in a choice',
    goal: 'the terminal is a third way to finish a review',
    tasks: [{ done: true, text: 'Amend spec-reports.md' }, { done: false, text: 'Offer it from /spec-diff' }],
  },
}
const withContext = (over) => marked({ context: { ...CONTEXT, ...over } })

test('the header opens on THIS PHASE, not on the whole spec', () => {
  // The question a review page answers is "what am I looking at". It used to
  // open on the overview's Problem — the same paragraph at phase 1 and phase 4
  // — and the only line naming what this review actually covers was folded
  // away behind `More`.
  const dom = runPage(withContext())
  assert.strictEqual(dom.byId['context'].hidden, false, 'the header is shown')

  const why = dom.byId['context-why'].textContent
  assert.match(why, /Phase 2 — The report ends in a choice/, 'the phase leads')
  assert.match(why, /third way to finish a review/, 'with its goal')
  assert.doesNotMatch(why, /The lead paragraph/, 'and not the spec-wide problem')
})

test('every task checkbox is open, not folded', () => {
  // The cheapest statement of what is and is NOT in this diff, which matters
  // most half-way through a phase: three ticked boxes and four empty ones is
  // why the diff looks unfinished, and the empty ones say so without asking.
  const why = runPage(withContext()).byId['context-why'].textContent
  assert.match(why, /✅ Amend spec-reports\.md/)
  assert.match(why, /⬜ Offer it from \/spec-diff/)
})

// A PHONE SHOWS ABOUT SIX LINES before the file list is pushed off-screen, and
// pushing it off is precisely what this header must not do.
test('the spec-wide background is behind the fold, not dropped', () => {
  const dom = runPage(withContext())
  assert.strictEqual(dom.byId['context-more'].hidden, false, 'there is a fold')
  const rest = dom.byId['context-rest'].textContent
  assert.match(rest, /The lead paragraph/, 'the problem moved, it did not vanish')
  assert.match(rest, /A second paragraph/)
  assert.match(rest, /collectReview — context/, 'and the impact detail is still there')
  assert.doesNotMatch(dom.byId['context-why'].textContent, /A second paragraph/)
})

test('with NO phase the problem leads, because nothing else can', () => {
  // A branch-wide diff, or a spec with no live phase. Three states, and this is
  // the one where folding the problem away would leave an empty header.
  const dom = runPage(marked({ context: { problem: 'Lead para.\n\nSecond para.' } }))
  assert.match(dom.byId['context-why'].textContent, /Lead para/)
  assert.doesNotMatch(dom.byId['context-why'].textContent, /Second para/)
})

test('each part is optional — a problem with no impact and no phase still draws', () => {
  const dom = runPage(marked({ context: { problem: 'Only this.' } }))
  assert.strictEqual(dom.byId['context'].hidden, false)
  assert.match(dom.byId['context-why'].textContent, /Only this/)
  // Nothing folded away, so there is nothing to offer a fold for.
  assert.strictEqual(dom.byId['context-more'].hidden, true)
})

test('a spec touching no external surface says so, rather than showing an empty table', () => {
  const dom = runPage(marked({ context: { impact: { prose: 'No external surface changes — internal refactor only.' } } }))
  assert.match(dom.byId['context-rest'].textContent, /No external surface changes/)
})

// STAYS SILENT (`negative-checks.md` rule 3). A legacy bare `<name>.md`, an
// overview with inline phases, a spec with no `## Problem` — all yield no
// context at all, and the page must render exactly as it did before this.
test('stays silent: no context means no header, not an empty one', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['context'].hidden, true, 'nothing is shown')
  assert.strictEqual(dom.byId['context-why'].textContent, '', 'and nothing was drawn')
  assert.ok(dom.byId.files.childNodes.length > 0, 'the file list is untouched')
})

// The header is markdown out of a spec file — anything someone typed — and this
// page is served over the network. Built with createElement so a spec's prose
// can never reach the DOM as markup.
test('the header is built as text, never spliced as markup', () => {
  const dom = runPage(marked({ context: { problem: '<img src=x onerror=alert(1)> and <b>bold</b>' } }))
  const why = dom.byId['context-why']
  assert.match(why.textContent, /<img src=x/, 'it is shown verbatim, as text')
  assert.strictEqual(findAll(why, 'anything').length, 0, 'no elements were parsed out of it')
  assert.doesNotMatch(TEMPLATE, /context-why[\s\S]{0,400}innerHTML/, 'and it never reaches for innerHTML')
})

// --- the third transport: a published page, for a reader off the LAN --------
//
// The engine serves on a LAN address, which a phone on mobile data cannot
// reach — and a published page's POST would go to claude.ai and fail. So a
// page that finds itself published hands the pass to the artifact's own store
// instead, where Claude reads it back and deletes it.

// A stand-in for the artifact runtime: `use('db')` resolving to a store that
// records what was written.
function fakeClaude({ db = true } = {}) {
  const added = []
  const use = (name) => {
    if (name !== 'db' || !db) return Promise.resolve(null)
    return Promise.resolve({
      collection: (path) => ({
        add: (doc) => {
          added.push({ path, doc })
          return Promise.resolve({ id: 'doc1' })
        },
      }),
    })
  }
  return { use, added }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

test('a published page stores the pass instead of posting it', async () => {
  const claude = fakeClaude()
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-discuss'].dispatch('click')
  await settle()

  assert.strictEqual(claude.added.length, 1)
  assert.strictEqual(claude.added[0].path, 'passes')
  assert.strictEqual(claude.added[0].doc.blob.verdict, 'discuss')
  assert.strictEqual(claude.added[0].doc.spec, 'feat-x')
  // The POST is the trap this branch exists to avoid: on a published page it
  // would go to claude.ai, fail, and surface as "could not reach the server".
  assert.deepStrictEqual(dom.posted, [])
  assert.match(dom.byId['copy-hint'].textContent, /Sent/)
})

test('a stored pass names the render it came from, so its age can be read', () => {
  // Age is how a stranger's pass gives itself away, and a published page has
  // no six-digit code to carry that for it.
  const claude = fakeClaude()
  const data = marked()
  const dom = runPage(data, { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-discuss'].dispatch('click')
  return settle().then(() => {
    assert.strictEqual(claude.added[0].doc.render, data.generatedAt)
    assert.ok(claude.added[0].doc.at, 'and when it was sent')
  })
})

test('a published page with no store falls back to the clipboard, never silence', async () => {
  const claude = fakeClaude({ db: false })
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use, clipboard: false })
  dom.byId['verdict-discuss'].dispatch('click')
  await settle()
  // Recoverable rather than lost: the reader's work is on screen to copy.
  assert.strictEqual(dom.byId['copy-out'].hidden, false)
  assert.match(dom.byId['copy-hint'].textContent, /Could not reach the store/)
})

// STAYS SILENT. Adding a transport must not change the two that existed — and
// the check is presence of `window.claude`, so a served page never waits on a
// capability that is never coming.
test('a served page still posts, exactly as before', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.posted.length, 1)
  assert.strictEqual(dom.posted[0].url, '/tok/feat-x')
})

test('a file:// page still copies, exactly as before', () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.copied.length, 1)
  assert.deepStrictEqual(dom.posted, [])
})

// --- the review ends when the verdict is delivered --------------------------
//
// The page used to carry on as if nothing had happened: the diff stayed, all
// four buttons stayed live, and a line of small grey text under them said
// "Sent." A reader returning to that tab could not tell a sent review from an
// unsent one, and pressing again reached an agent that had stopped listening.

const decidedOn = (dom) => dom.byId['decided'].hidden === false

test('a delivered verdict ends the review and says what was chosen', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()

  assert.ok(decidedOn(dom), 'the panel is shown')
  assert.match(dom.byId['decided-what'].textContent, /You chose: ✓ Commit/)
  assert.match(dom.byId['decided-note'].textContent, /Sent to Claude/)
  // The diff is faded out by a class rather than a timer, so nothing depends on
  // JavaScript finishing an animation.
  assert.match(dom.byId['wrap'].className, /\bis-decided\b/)
})

test('every verdict button dies, with the reason on it', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  for (const key of ['commit', 'commit-continue', 'changes', 'discuss']) {
    const btn = dom.byId['verdict-' + key]
    assert.strictEqual(btn.disabled, true, key)
    assert.match(btn.title, /Already sent/, key)
  }
  // `refresh` re-enables the non-committing pair unconditionally, so a decided
  // page has to beat it — this is the assertion that catches that regression.
  assert.match(dom.byId['verdict-count'].textContent, /Sent —/)
})

test('the decision survives a reload of the same render', async () => {
  const data = marked()
  const first = runPage(data, { protocol: 'http:' })
  first.byId['verdict-changes'].dispatch('click')
  await settle()
  // A second page over the SAME storage — the reader re-opening their tab.
  const again = runPage(data, { protocol: 'http:', storage: first.window.localStorage })
  assert.ok(decidedOn(again))
  assert.match(again.byId['decided-what'].textContent, /Request changes/)
  assert.strictEqual(again.byId['verdict-commit'].disabled, true)
})

test('the next render is a live page again', async () => {
  // Keyed to the render, like every other mark: after the commit the phase
  // re-renders, and that page is not finished just because the last one was.
  const first = runPage(marked(), { protocol: 'http:' })
  first.byId['verdict-commit'].dispatch('click')
  await settle()
  const next = marked()
  next.generatedAt = '2027-01-01T00:00:00.000Z'
  const fresh = runPage(next, { protocol: 'http:', storage: first.window.localStorage })
  assert.strictEqual(decidedOn(fresh), false)
  assert.strictEqual(fresh.byId['verdict-commit'].disabled, false)
})

test('there is a way back to the diff, and the buttons stay dead there', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  dom.byId['decided-toggle'].dispatch('click')
  assert.match(dom.byId['wrap'].className, /\bshow-diff\b/, 'the diff comes back')
  assert.match(dom.byId['wrap'].className, /\bis-decided\b/, 'and it is still decided')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true, 'so the buttons stay closed')
  assert.match(dom.byId['decided-toggle'].textContent, /Hide the diff/)
})

test('a stored pass ends the review the same way', () => {
  const claude = fakeClaude()
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-discuss'].dispatch('click')
  return settle().then(() => {
    assert.ok(decidedOn(dom))
    assert.match(dom.byId['decided-what'].textContent, /Discuss first/)
  })
})

// STAYS SILENT. A clipboard copy is NOT a delivery — the pass is in the
// reader's hands, not Claude's — so ending the page there would claim
// something was handed over when the reader still has to paste it.
test('a clipboard copy does not end the review', async () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(decidedOn(dom), false)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

test('a refused pass does not end the review either', () => {
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('bad blob') }),
  })
  dom.byId['verdict-commit'].dispatch('click')
  return settle().then(() => {
    assert.strictEqual(decidedOn(dom), false, 'nothing was accepted, so nothing was decided')
    assert.match(dom.byId['send-failed-what'].textContent, /Not sent/)
  })
})

// --- the ending says it ONCE ------------------------------------------------
//
// The decided page said the same thing four times: the panel, the verdict bar,
// the history line and a command box with a Copy button. The panel is the
// ending; the rest either earns its place or goes.

test('a code keeps its box, because six digits are worth copying', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false)
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
})

test('a bare command is a sentence, not a copyable artefact', async () => {
  // The store transport has no code to hand back, and `/spec-reviewed` is a
  // word you type into the terminal you are already in. A Copy button for it
  // makes a finished page look unfinished.
  const claude = fakeClaude()
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true, 'no command box')
  assert.strictEqual(dom.byId['copy-hint'].hidden, true, 'and no hint above it')
  // The instruction is not lost — it is a clause in the panel, where the rest
  // of the ending already is.
  assert.match(dom.byId['decided-note'].textContent, /run \/spec-reviewed where it is/)
})

test('the history line goes quiet once the panel says the same thing', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(dom.byId['verdict-log'].hidden, true)
  // And the panel is still the one that speaks.
  assert.match(dom.byId['decided-what'].textContent, /You chose/)
})

// A `display` rule beats the browser's `[hidden] { display: none }`, so an
// element the page hides in JavaScript stays on screen unless its class carries
// an explicit override. This is invisible to every other test here — the DOM
// shim has no CSS, so `hidden = true` "works" — and it shipped: a finished
// review kept showing an empty command box because `.sent-cmd` is `display:
// flex`. So the guard reads the stylesheet rather than the behaviour.
test('anything the page hides has a [hidden] override where it needs one', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(TEMPLATE)[1]
  // Classes the template ships hidden, or that the page hides at runtime.
  const hides = new Set()
  for (const tag of TEMPLATE.match(/<[^>]*\shidden(\s|>|=)[^>]*>/g) || []) {
    const cls = /\bclass="([^"]+)"/.exec(tag)
    if (cls) for (const c of cls[1].split(/\s+/)) hides.add(c)
  }
  assert.ok(hides.size > 0, 'the template ships some hidden elements')

  // AND THE ONES THE SCRIPT HIDES. This half is what the comment above always
  // claimed and the code never did, and the gap is exactly how `.verdict`
  // shipped without an override: it carries no `hidden` attribute in the markup
  // — the page hides it at runtime when it has no transport — so the template
  // scan could not see it, and a `file://` page kept offering four buttons that
  // POST to a server that is not there, directly above the command list that
  // exists because they cannot.
  const script = pageScript()
  const idOf = new Map()
  for (const m of script.matchAll(/var\s+(\w+)\s*=\s*document\.getElementById\(\s*'([^']+)'\s*\)/g)) {
    idOf.set(m[1], m[2])
  }
  const hiddenIds = new Set()
  for (const m of script.matchAll(/(\w+)\.hidden\s*=/g)) {
    if (idOf.has(m[1])) hiddenIds.add(idOf.get(m[1]))
  }
  for (const m of script.matchAll(/document\.getElementById\(\s*'([^']+)'\s*\)\.hidden\s*=/g)) {
    hiddenIds.add(m[1])
  }
  // WHAT THIS STILL CANNOT SEE, named rather than left to be rediscovered: a
  // node built by `el(...)` and hidden through a local variable has no id to
  // resolve, so it is out of range. Those are all inside `.cmd-row`/`.tree`,
  // which carry their own overrides; a new one would not be covered.
  assert.ok(hiddenIds.size > 0, 'the script really does hide things by id')
  for (const id of hiddenIds) {
    const tag = new RegExp(`<[^>]*\\sid="${id}"[^>]*>`).exec(TEMPLATE)
    const cls = tag && /\bclass="([^"]+)"/.exec(tag[0])
    if (cls) for (const c of cls[1].split(/\s+/)) hides.add(c)
  }

  const offenders = []
  for (const cls of hides) {
    // Does any rule give this class a display other than none?
    const sets = new RegExp(`\\.${cls}\\s*\\{[^}]*display:\\s*(?!none)`, 'g').test(css)
    if (!sets) continue
    const guarded = new RegExp(`\\.${cls}\\[hidden\\]\\s*\\{[^}]*display:\\s*none`).test(css)
    if (!guarded) offenders.push(cls)
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these classes set a display and would ignore [hidden]:\n  .${offenders.join('\n  .')}`,
  )
})

// The provenance line exists so a page drawn by a stale renderer can be caught
// by reading the artefact. A working copy carries `0.0.0` — the unpublished
// source package's version — and printing that verbatim answers the question
// with a version that has never existed.
test('a working copy says so rather than claiming a version', () => {
  const dev = fixture()
  dev.engine = '0.0.0'
  assert.match(runPage(dev).byId['drawn-by'].textContent, /skitterspec \(unreleased build\)/)

  const released = fixture()
  released.engine = '18.0.0'
  assert.match(runPage(released).byId['drawn-by'].textContent, /skitterspec 18\.0\.0/)
})

// --- the button set ---------------------------------------------------------

// The set is DECLARED by the render, not derived from the gate — see
// `BUTTON_SETS` in `env/review.js` for why deriving it is wrong.

test('a mid-run page offers Continue instead of the committing pair', () => {
  const dom = runPage(marked({ buttons: 'midrun' }))
  assert.strictEqual(dom.byId['verdict-continue'].hidden, false, 'Continue is offered')
  assert.strictEqual(dom.byId['verdict-commit'].hidden, true, '"commit" is the wrong verb for unfinished work')
  assert.strictEqual(dom.byId['verdict-commit-continue'].hidden, true)
  // The two that ask for something are in BOTH sets — a note you want acted on,
  // and a question, are never the wrong thing to send at any point in a run.
  assert.strictEqual(dom.byId['verdict-changes'].hidden, false)
  assert.strictEqual(dom.byId['verdict-discuss'].hidden, false)
})

test('Continue sends its own verdict, and the engine accepts it', () => {
  const dom = runPage(marked({ buttons: 'midrun' }))
  const blob = copyBlob(dom, 'continue')
  assert.strictEqual(blob.verdict, 'continue', 'the page sends what its button carries')
  assert.strictEqual(accepted(blob).verdict, 'continue', 'and the engine reads it back unchanged')
})

test('Continue is never blocked by an open note, exactly as the engine is not', () => {
  // The engine refuses only a COMMITTING verdict against an open comment, and
  // `continue` is deliberately not one. A disabled button here would be the
  // page holding a second opinion about a refusal the engine does not make.
  const dom = runPage(marked({ buttons: 'midrun' }))
  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'worth a look later')
  assert.strictEqual(dom.byId['verdict-continue'].disabled, false)
  assert.strictEqual(accepted(copyBlob(dom, 'continue')).verdict, 'continue')
})

test('a mid-run page says what a clean read does, and it is not committing', () => {
  assert.strictEqual(countSays(runPage(marked({ buttons: 'midrun' }))), 'Nothing marked — a clean read still carries on')
  assert.strictEqual(countSays(runPage(marked())), 'Nothing marked — a clean read still commits')
})

test('a single-pass fix offers Commit, and not the verb it cannot honour', () => {
  const dom = runPage(marked({ buttons: 'fix' }))
  assert.strictEqual(dom.byId['verdict-commit'].hidden, false, 'the fix is finished, so Commit is right')
  assert.strictEqual(
    dom.byId['verdict-commit-continue'].hidden, true,
    'there is no next phase for /spec-next to build',
  )
  assert.strictEqual(dom.byId['verdict-commit-start'].hidden, true, 'and nothing to put in flight')
  assert.strictEqual(dom.byId['verdict-changes'].hidden, false)
  assert.strictEqual(dom.byId['verdict-discuss'].hidden, false)
})

test('a single-pass fix still commits, and the engine reads the verdict back', () => {
  const dom = runPage(marked({ buttons: 'fix' }))
  const blob = copyBlob(dom, 'commit')
  assert.strictEqual(blob.verdict, 'commit')
  assert.strictEqual(accepted(blob).verdict, 'commit', 'a committing verdict, so it clears the gate')
})

test('a single-pass fix says a clean read commits — it is finished work', () => {
  // `fix` drops a verb; it does not make the page mid-run. A page saying "still
  // carries on" here would describe the one thing this set cannot do.
  assert.strictEqual(countSays(runPage(marked({ buttons: 'fix' }))), 'Nothing marked — a clean read still commits')
})

test('a verdict this render never offered cannot be reached by dispatching at it', () => {
  // The button set is a fact, not a style — the same rule the disabled block
  // already follows. A browser will not fire a hidden control; every other
  // caller is what this guards.
  const dom = runPage(marked({ buttons: 'midrun' }))
  const before = dom.copied.length
  dom.byId['verdict-commit'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'nothing was emitted')
  assert.strictEqual(dom.byId['copy-out'].hidden, true, 'and no fallback textarea either')
})

// STAYS SILENT (`negative-checks.md` rule 3). A page that did not opt in is the
// page it has always been: same four controls, same labels, same states — and
// the mid-run control is not merely dimmed on it, it is absent.
test('stays silent: a render with no button set is the committing page, unchanged', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-commit'].hidden, false)
  assert.strictEqual(dom.byId['verdict-commit-continue'].hidden, false)
  assert.strictEqual(dom.byId['verdict-changes'].hidden, false)
  assert.strictEqual(dom.byId['verdict-discuss'].hidden, false)
  assert.strictEqual(dom.byId['verdict-continue'].hidden, true, 'and Continue is not on it at all')
  assert.strictEqual(dom.byId['verdict-commit'].textContent, '✓ Commit')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

// And the rejected alternative in decision 4, on the page's side of the wire: a
// project running `review.required: false` never arms, and its pages must still
// offer a commit.
test('an unarmed gate does not take the committing buttons away', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-commit'].hidden, false)
  const armed = runPage(marked({ gate: { state: 'armed', phase: 1, armedAt: 'T' }, buttons: 'midrun' }))
  assert.strictEqual(armed.byId['verdict-continue'].hidden, false, 'and an armed one does not force them on')
  assert.strictEqual(armed.byId['verdict-commit'].hidden, true)
})

// ── bug-page-cannot-tell-if-claimed ──────────────────────────────────────────
//
// A successful POST used to end on `Sent. Run this where Claude is:` — the same
// sentence whether a session was waiting to claim the pass or nothing was. The
// page cannot know that at send time, so it stopped guessing and started
// ASKING: it polls its own URL for the code it was given, and says the one
// thing that is true.
//
// WHAT WOULD FOOL THIS: a poll that reads "claimed" from the code being ABSENT.
// A store that moved, a spec path typo, a corrupt sidecar read as empty — all
// three are absences, and all three would quietly tell the reader Claude has
// their pass when nobody has it. So the quiet ending fires on a POSITIVE
// `claimed`, and every other answer — including one that cannot tell — hands
// over the command.

// The poll answer, as the server gives it. `settled()` alone is not enough:
// each poll is a fresh promise chain, so the queue has to drain per round.
const drained = async (n = 4) => { for (let i = 0; i < n; i++) await settled() }

function polling(states) {
  const asked = []
  const queue = states.slice()
  return {
    asked,
    fetchWith: (url, opts) => {
      if (opts && opts.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"code":"418207"}') })
      }
      asked.push(url)
      const next = queue.length > 1 ? queue.shift() : queue[0]
      if (next === 'boom') return Promise.reject(new Error('offline'))
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ state: next })) })
    },
  }
}

test('a sent pass is checked, not guessed about', async () => {
  const p = polling(['waiting'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.ok(p.asked.length >= 1, 'the page asked what became of the pass')
  assert.strictEqual(p.asked[0], '/tok/feat-x?pass=418207', 'its own path, carrying the code it was given')
})

test('a pass Claude picked up names no command at all', async () => {
  const p = polling(['claimed'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true, 'nothing for the reader to run')
  assert.match(dom.byId['decided-note'].textContent, /picked (it|this) up/i)
  assert.doesNotMatch(dom.byId['decided-note'].textContent, /Run this where Claude is/)
})

test('a pass still sitting there hands over the command, loudly', async () => {
  const p = polling(['waiting'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is handed over')
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  assert.match(dom.byId['decided-note'].textContent, /still waiting/i, 'and it says why')
})

// WHERE it sits is a fact about the markup, so it is asserted on the markup.
// The shim cannot parse the spliced template, so every element it makes is a
// root — `closest()` would answer `null` for a correctly nested box and for a
// missing one alike, which is no assertion at all.
test('the command box lives inside the You chose panel, marked as an action', () => {
  const decided = /<section class="decided" id="decided"[\s\S]*?<\/section>/.exec(TEMPLATE)
  assert.ok(decided, 'the decided panel is there')
  assert.match(decided[0], /id="sent-cmd"/, 'the command box sits in it')
  assert.match(decided[0], /class="sent-cmd act"/, 'marked as an action, not a note')
  // And nowhere else: two boxes with one id is a page that hides the wrong one.
  assert.strictEqual((TEMPLATE.match(/id="sent-cmd"/g) || []).length, 1)
  // The callout has to be visible in both themes, so it may only use tokens the
  // bare `:root` defines — the whole-template check guards that, and this one
  // guards that it is actually filled rather than another grey line.
  assert.match(TEMPLATE, /\.sent-cmd\.act\s*\{[^}]*background:\s*var\(--add-bg\)/)
})

// The command is TEXT. A readonly input still reads as a field to type into,
// and on a phone tapping one raises a keyboard for a value nobody can change.
test('the command is plain text with a Copy control, not a form field', () => {
  const box = /<code class="sent-cmd-text" id="sent-cmd-text"><\/code>/.exec(TEMPLATE)
  assert.ok(box, 'the command is a <code> element, empty until the page fills it')
  assert.doesNotMatch(TEMPLATE, /<input[^>]*id="sent-cmd-text"/, 'and never an input')
  // One tap takes the whole command, which is the gesture that still works on a
  // page served over plain http — where the clipboard API is withheld.
  assert.match(TEMPLATE, /\.sent-cmd-text\s*\{[^}]*user-select:\s*all/)
  assert.match(TEMPLATE, /id="sent-cmd-copy"/, 'the Copy control is still there')
})

test('Copy takes what is on screen, and the clipboardless path selects it', async () => {
  const withCopy = runPage(marked(), { protocol: 'http:', fetchWith: polling(['waiting']).fetchWith })
  pressed(withCopy, 'commit')
  await drained()
  withCopy.byId['sent-cmd-copy'].dispatch('click')
  await drained()
  assert.deepStrictEqual(withCopy.copied, ['/spec-reviewed 418207'], 'the text, verbatim')

  const bare = runPage(marked(), { protocol: 'http:', clipboard: false, fetchWith: polling(['waiting']).fetchWith })
  pressed(bare, 'commit')
  await drained()
  bare.byId['sent-cmd-copy'].dispatch('click')
  await drained()
  assert.deepStrictEqual(bare.document._execCopied, ['/spec-reviewed 418207'], 'the same text, the other route')
  assert.strictEqual(bare.selection.ranges[0].node, bare.byId['sent-cmd-text'], 'which copies the selection')
})

// Rule 4 again, on a smaller thing: a browser with no selection at all must not
// be told its text is highlighted. A reader hunting for a highlight that is not
// there is worse off than one who was simply asked to copy.
test('a page that cannot select says copy it, and never claims it selected', async () => {
  const dom = runPage(marked(), {
    protocol: 'http:', clipboard: false, execCopy: false, fetchWith: polling(['waiting']).fetchWith, noSelection: true,
  })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is still handed over')
  assert.match(dom.byId['sent-cmd-lead'].textContent, /copy it/i)
  assert.doesNotMatch(dom.byId['sent-cmd-lead'].textContent, /selected/i)
})

// Rule 4 of `.claude/rules/negative-checks.md`: three states, and the one that
// cannot tell goes to the harmless branch. A command nobody needs to run costs
// a glance; a pass nobody claims costs the review.
test('a poll that cannot tell hands over the command rather than claiming silence', async () => {
  for (const answer of ['boom', 'unknown', 'nonsense']) {
    const p = polling([answer])
    const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
    pressed(dom, 'commit')
    await drained()
    assert.strictEqual(dom.byId['sent-cmd'].hidden, false, `${answer}: the command survives`)
    assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  }
})

// ── phase 2: a page with no transport offers commands, not buttons ───────────
//
// A `file://` page has no server to POST to and no store to write to. Its
// verdict buttons never delivered anything — they built a JSON blob and put it
// on the clipboard for the reader to paste. Where the pass carries nothing but
// a verdict, that blob is a wall of text standing in for one word, so the word
// travels as a command instead.
//
// THE ROWS ARE LABELLED WITH THE BUTTONS' OWN NAMES. `✓ Commit & Continue` is
// what the reader chose on every other page; `commit-continue` is what the
// engine calls it, and asking someone to recognise their decision in the wire
// spelling is asking them to learn a second vocabulary for no reason.

const cmdRows = (dom) => findAll(dom.document._root, 'cmd-row')
const rowFor = (dom, verdict) => cmdRows(dom).filter((r) => r.getAttribute('data-verdict') === verdict)[0]

test('a file:// page offers a command per verdict, not the verdict bar', () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  assert.strictEqual(dom.byId.verdict.hidden, true, 'the buttons cannot deliver, so they are not offered')
  const rows = cmdRows(dom)
  assert.deepStrictEqual(
    rows.map((r) => r.getAttribute('data-verdict')),
    ['commit', 'commit-continue', 'changes', 'discuss'],
    'one row per verdict this render offers, in the same order',
  )
})

test('each row is named as the button was, and carries the command it sends', () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  const seen = cmdRows(dom).map((r) => ({
    label: r.querySelector('.cmd-label').textContent,
    cmd: r.querySelector('.cmd-text').textContent,
  }))
  assert.deepStrictEqual(seen, [
    { label: '✓ Commit', cmd: '/spec-reviewed commit' },
    { label: '✓ Commit & Continue', cmd: '/spec-reviewed commit-continue' },
    { label: '↺ Request changes', cmd: '/spec-reviewed changes' },
    { label: '… Discuss first', cmd: '/spec-reviewed discuss' },
  ])
})

test('a mid-run page lists Continue and never the committing pair', () => {
  const dom = runPage(marked({ buttons: 'midrun' }), { protocol: 'file:' })
  assert.deepStrictEqual(
    cmdRows(dom).map((r) => r.getAttribute('data-verdict')),
    ['continue', 'changes', 'discuss'],
  )
  assert.strictEqual(rowFor(dom, 'commit'), undefined, 'commit is not a verb for unfinished work')
})

test('a file:// page with no clipboard API still offers Copy on every row', async () => {
  // `file://` is where the clipboard API is most often withheld, and this list
  // is the `file://` page's ONLY way to hand a verdict over — so a missing
  // button here costs more than it does anywhere else on the page.
  const dom = runPage(marked(), { protocol: 'file:', clipboard: false })
  const rows = cmdRows(dom)
  assert.ok(rows.length > 0, 'the fixture really lists rows')
  for (const r of rows) assert.ok(r.querySelector('.cmd-copy'), 'every row has a Copy')

  rowFor(dom, 'commit').querySelector('.cmd-copy').dispatch('click')
  await settled()
  assert.deepStrictEqual(dom.document._execCopied, ['/spec-reviewed commit'])
})

test('STAYS SILENT: with neither copy route the rows are text, as before', async () => {
  // The one state that still earns a row with no button. It is worth pinning
  // because the fix widened when the button appears, and a widening with no
  // floor under it would put a dead control on a page that genuinely cannot
  // copy — which is the rule this change kept rather than removed.
  const dom = runPage(marked(), { protocol: 'file:', clipboard: false, execCopy: false })
  for (const r of cmdRows(dom)) {
    assert.strictEqual(r.querySelector('.cmd-copy'), null)
    assert.ok(r.querySelector('.cmd-text').textContent.startsWith('/spec-reviewed '), 'the command is still there')
  }
})

test('copying a row puts its command on the clipboard and ends the page on it', async () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  rowFor(dom, 'commit-continue').querySelector('.cmd-copy').dispatch('click')
  await settled()
  assert.deepStrictEqual(dom.copied, ['/spec-reviewed commit-continue'])
  // The SAME You chose box the served path shows, with the command repeated in
  // it — a copy can fail silently, and a reader coming back an hour later has
  // nowhere else to find what they chose.
  assert.strictEqual(dom.byId.decided.hidden, false)
  assert.match(dom.byId['decided-what'].textContent, /✓ Commit & Continue/)
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false)
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed commit-continue')
  assert.deepStrictEqual(dom.posted, [], 'and it never reached for the network')
})

// A decision on a `file://` page outlives the tab exactly as a sent one does.
test('a copied verdict is still there when the page is re-opened', async () => {
  const first = runPage(marked(), { protocol: 'file:' })
  rowFor(first, 'changes').querySelector('.cmd-copy').dispatch('click')
  await settled()
  const again = runPage(marked(), { protocol: 'file:', storage: first.window.localStorage })
  assert.strictEqual(again.byId.decided.hidden, false)
  assert.strictEqual(again.byId['sent-cmd-text'].textContent, '/spec-reviewed changes')
})

// THE MARKS DO NOT FIT IN A COMMAND LINE, and are never silently dropped. The
// moment the pass carries an accept or a comment, the rows give way to the blob
// the page has always handed over — announced, because a reader whose notes
// vanished would not find out until the review came back without them.
test('a marked pass gives way to the blob, and says why', () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  assert.ok(cmdRows(dom).length, 'the rows are there while nothing is marked')
  accepts(dom)[0].dispatch('click')
  assert.strictEqual(cmdRows(dom).length ? cmdRows(dom)[0].hidden : true, true, 'the rows stand down')
  assert.strictEqual(dom.byId.verdict.hidden, false, 'and the buttons come back to carry the pass')
  assert.match(dom.byId['copy-hint'].textContent, /marked|notes|blob/i, 'and it says why')
})

test('clearing the last mark brings the commands back', () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  accepts(dom)[0].dispatch('click')
  accepts(dom)[0].dispatch('click')
  assert.strictEqual(cmdRows(dom)[0].hidden, false, 'nothing marked again, so a word carries it')
  assert.strictEqual(dom.byId.verdict.hidden, true)
})

// Stays silent (rule 3): a SERVED page is untouched by any of this. It can
// deliver, so it keeps its buttons.
test('stays silent: a served page keeps its verdict bar and grows no rows', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  assert.strictEqual(dom.byId.verdict.hidden, false)
  assert.deepStrictEqual(cmdRows(dom), [])
})

test('stays silent: a published page keeps its verdict bar too', () => {
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: () => Promise.resolve(null) })
  assert.strictEqual(dom.byId.verdict.hidden, false)
  assert.deepStrictEqual(cmdRows(dom), [])
})

// --- the file tree scrolls sideways, and the counts do not go with it --------
//
// Wrapped names turned every long path into three ragged lines. Unwrapping them
// means the tree scrolls horizontally, and the change counts have to survive
// that scroll or the column is useless at exactly the moment it is needed.
//
// The mechanism is load-bearing and invisible to the DOM shim, which has no CSS
// and no layout: `.ct` is `position: sticky`, and a sticky box can only pin
// within its own row. So every row must span the full scroll width — which is
// what the flat list and `width: max-content` on the list buy. Nest the rows
// again and the counts slide away on deep paths only, which is the kind of bug
// that ships. These read the stylesheet for the same reason the [hidden] guard
// above does.

// A diff of exactly these paths, with everything else the page needs held at
// its dullest — the tree's SHAPE is what these tests are about.
function treeFixture(paths) {
  const base = fixture()
  return {
    ...base,
    totals: { files: paths.length, additions: paths.length, deletions: 0 },
    files: paths.map((path) => ({
      path,
      status: 'modified',
      additions: 1,
      deletions: 0,
      whole: true,
      noise: false,
      binary: false,
      patch: ['--- a/' + path, '+++ b/' + path, '@@ -1,1 +1,1 @@', '-old', '+new'].join('\n'),
    })),
  }
}

const TREE_CSS = () => /<style>([\s\S]*?)<\/style>/.exec(TEMPLATE)[1]
const rule = (sel) => {
  const m = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(TREE_CSS())
  return m ? m[1] : ''
}

test('a file name never wraps', () => {
  assert.match(rule('.tree-file .nm'), /white-space:\s*nowrap/)
  assert.ok(!/overflow-wrap:\s*anywhere/.test(rule('.tree-file .nm')), 'wrapping is what this replaced')
})

test('the tree is what scrolls sideways, not the page', () => {
  assert.match(rule('.tree'), /overflow-x:\s*auto/)
  // `.main` keeps its min-width:0 so a wide diff still cannot push the body
  // sideways — the tree gaining a scroller must not quietly undo that.
  assert.match(rule('.main'), /min-width:\s*0/)
})

test('the counts column is pinned to the scrollport', () => {
  const ct = rule('.tree-file .ct')
  assert.match(ct, /position:\s*sticky/)
  assert.match(ct, /right:\s*0/)
  assert.match(ct, /white-space:\s*nowrap/, 'a wrapped count defeats the fixed column')
})

test('the counts rest in the same place pinned as they do at the scroll end', () => {
  // The bug this pins: a sticky box is clamped by its containing block, so a
  // horizontal padding on the ROW gave `.ct` two resting places — flush to the
  // scrollport while pinned, and inset by that padding once scrolled fully
  // right. The counts appeared to slide inwards as you reached the end. The
  // gutter has to travel with the element, so it is padding on `.ct`.
  assert.match(rule('.tree-file'), /padding:\s*\.15rem 0\b/, 'no horizontal padding on the row')
  assert.match(rule('.tree-file .ct'), /padding-right:/, 'the gutter rides on the pinned element')
  assert.match(rule('.tree-file .ct'), /right:\s*0/, 'and the box itself reaches the edge')
})

test('the pinned counts have something opaque to sit on', () => {
  // `background: inherit` and a row background are one mechanism, not two: the
  // names scroll UNDER `.ct`, so a transparent one shows them through, and
  // inherit is what makes it follow the row's hover colour instead of going
  // flat against it.
  assert.match(rule('.tree-file .ct'), /background:\s*inherit/)
  assert.ok(
    !/background:\s*none/.test(rule('.tree-file')),
    'the row needs a real colour for .ct to inherit',
  )
})

test('every row spans the full scroll width, which is what sticky needs', () => {
  assert.match(rule('.tree > ul'), /width:\s*max-content/)
  assert.match(rule('.tree > ul'), /min-width:\s*100%/)
  assert.match(rule('.tree-file'), /width:\s*100%/)
})

test('the tree is flat, and indentation rides on the rows', () => {
  // The nested form is what breaks the pin, so this asserts the shape rather
  // than trusting the comment that explains why.
  const dom = runPage(treeFixture(['a/b/c/deep.ts', 'top.md']))
  const list = dom.byId.tree.childNodes.filter((n) => n.tagName === 'ul')
  assert.strictEqual(list.length, 1, 'one list')
  assert.ok(
    list[0].childNodes.every((li) => !li.childNodes.some((c) => c.tagName === 'ul')),
    'no row contains another list',
  )
  const deep = findAll(dom.byId.tree, 'tree-file').find((e) => e.textContent.includes('deep.ts'))
  const nm = deep.childNodes.find((c) => String(c.className).includes('nm'))
  assert.strictEqual(nm.getAttribute('style'), 'padding-left:3rem', '3 levels deep, plus the .6rem gutter')
})

test('STAYS SILENT: a root-level file sits at the gutter, not indented', () => {
  // The healthy edge. An off-by-one in the walk would push everything in by a
  // level, and a tree where nothing sits flush reads as merely ugly rather than
  // wrong — so it is worth pinning the base case. .6rem is the gutter every
  // row shares, which is also what a depth-0 dir label gets.
  const dom = runPage(treeFixture(['top.md']))
  const row = findAll(dom.byId.tree, 'tree-file')[0]
  const nm = row.childNodes.find((c) => String(c.className).includes('nm'))
  assert.strictEqual(nm.getAttribute('style'), 'padding-left:0.6rem')

  const dir = findAll(dom.byId.tree, 'dir')[0]
  assert.strictEqual(dir, undefined, 'a root-level file has no dir label above it')
})

// --- the file:// command list: one line, the verdict's colours, and a where --

test('the verdict bar is really gone on a page that cannot POST', () => {
  // The .hidden property was always set correctly; what was missing was the CSS
  // to honour it, so four buttons that POST to a server that is not there sat
  // directly above the command list that exists BECAUSE they cannot. A reader
  // pressing one got nothing and no reason.
  const css = TREE_CSS()
  assert.match(css, /\.verdict\[hidden\]\s*\{[^}]*display:\s*none/)
  const dom = runPage(marked(), { protocol: 'file:' })
  assert.strictEqual(dom.byId.verdict.hidden, true, 'and the page still sets it')
})

test('a command row is one line, not a label stacked over a command', () => {
  // `flex-basis: 100%` on the label is what forced the wrap, and four rows at
  // three lines each spent a screenful on something that fits in four lines.
  assert.ok(
    !/flex-basis:\s*100%/.test(rule('.cmd-label')),
    'the label must not claim a whole row',
  )
  assert.match(rule('.cmd-row'), /display:\s*grid/)
})

test('the commands line up, because the whole list shares one grid', () => {
  // THE POINT: a per-row layout sizes each label column to its own label, and
  // `Commit` and `Commit & Continue` are not the same width — so the commands
  // started at four different x positions. `max-content` lets the longest label
  // decide, which is a fact about the labels rather than a rem value someone
  // has to remember to update when one changes.
  assert.match(rule('.cmd-list'), /display:\s*grid/)
  assert.match(rule('.cmd-list'), /grid-template-columns:\s*max-content/)
  assert.match(rule('.cmd-row'), /grid-template-columns:\s*subgrid/, 'rows share the list\'s columns')
  assert.match(rule('.cmd-row'), /grid-column:\s*1 \/ -1/, 'and span all of them')
  // The lead is a grid item too, so it has to be told to span or it would sit
  // in the label column and squeeze it to the width of a sentence.
  assert.match(rule('.cmd-lead'), /grid-column:\s*1 \/ -1/)
})

test('a browser without subgrid still gets one line per row', () => {
  // Fallback first, then the override: drop the second declaration and the row
  // still lays itself out. Without the fallback it would fall back to a single
  // auto column and STACK, which is worse than the misalignment it was fixing.
  const row = rule('.cmd-row')
  const cols = row.match(/grid-template-columns:[^;]*/g) || []
  assert.strictEqual(cols.length, 2, 'two declarations, in that order')
  assert.match(cols[0], /max-content/, 'the fallback is a real layout')
  assert.match(cols[1], /subgrid/)
})

test('each row is marked with the colour its verdict button would have', () => {
  // These rows STAND IN for the verdict bar, so the choice should be
  // recognisable without re-reading four labels — but as an EDGE, not a fill.
  // Four tinted boxes read as four warnings; the colour was shouting where it
  // only needed to identify.
  const css = TREE_CSS()
  const commitRow = /\.cmd-row\[data-verdict="commit"\][^{]*\{([^}]*)\}/.exec(css)
  assert.ok(commitRow, 'commit is marked')
  assert.match(commitRow[1], /border-left:[^;]*var\(--good-fg\)/, 'the same pair as .v-commit')
  assert.ok(!/background/.test(commitRow[1]), 'an edge, not a fill')
  assert.match(css, /\.cmd-row\[data-verdict="changes"\]\s*\{[^}]*border-left:[^;]*var\(--flag-fg\)/)
  // No new tokens: every colour used here is one the verdict buttons already
  // borrow, which is what keeps the two in step through a theme change.
  const rows = css.match(/\.cmd-row\[data-verdict=[^{]*\{[^}]*\}/g).join('')
  const colours = rows.match(/#[0-9a-f]{3,8}/gi) || []
  assert.deepStrictEqual(colours, [], 'no literal colours, only tokens')
})

test('STAYS SILENT: discuss keeps the neutral panel', () => {
  // The ending that decides nothing must not be dressed as one that does. It is
  // the row most likely to be coloured "for consistency", which would be the
  // page telling a reader something untrue about their options.
  const css = TREE_CSS()
  assert.ok(
    !/\.cmd-row\[data-verdict="discuss"\]/.test(css),
    'no rule of its own — it inherits the plain .cmd-row',
  )
})

test('the lead says WHERE the command has to be pasted', async () => {
  // "Run one of these where it is" assumed the reader knew which terminal
  // counts, and there is usually more than one open.
  const dom = runPage(marked(), { protocol: 'file:' })
  const lead = dom.byId['cmd-lead'].textContent
  assert.match(lead, /paste/i, 'it names the action')
  assert.match(lead, /session that produced this review/i, 'and which session')
})

// --- the ticket in the title, and a date a person can read -------------------

const ticketNode = (dom) => dom.byId.title.childNodes.find((n) => String(n.className) === 'ticket')

test('a linked spec carries its ticket id in the title, as a link', () => {
  const dom = runPage(marked({
    context: { problem: 'x', ticket: { id: 'SKS-285', url: 'https://linear.app/x/issue/SKS-285/y' } },
  }))
  const tk = ticketNode(dom)
  assert.ok(tk, 'the ticket is rendered')
  assert.strictEqual(tk.tagName, 'a')
  assert.strictEqual(tk.textContent, 'SKS-285')
  assert.strictEqual(tk.getAttribute('href'), 'https://linear.app/x/issue/SKS-285/y')
  assert.strictEqual(tk.getAttribute('rel'), 'noopener noreferrer', 'and it opens safely')
})

test('an id with no url is still shown, just not as a link', () => {
  // Half the pair is worth having: the id is how this work is addressed outside
  // the repo, whether or not the page can reach it.
  const dom = runPage(marked({ context: { problem: 'x', ticket: { id: 'SKS-285', url: null } } }))
  const tk = ticketNode(dom)
  assert.ok(tk)
  assert.strictEqual(tk.tagName, 'span', 'no href to give it')
  assert.strictEqual(tk.textContent, 'SKS-285')
})

test('STAYS SILENT: an unlinked spec shows no ticket at all', () => {
  // The ordinary state of a project with no tracker installed. An empty pill,
  // or a link to nowhere, would be the page inventing an address.
  const dom = runPage(marked({ context: { problem: 'x' } }))
  assert.strictEqual(ticketNode(dom), undefined)
  const plain = runPage(marked())
  assert.strictEqual(ticketNode(plain), undefined, 'and with no context either')
})

test('the rendered-at time is readable, with the exact value kept on hover', () => {
  // `2026-09-16T13:53:58.370Z` was shown to a person deciding whether a page
  // was stale — the one question the header exists to answer, asked in the
  // hardest possible way. Nothing precise is lost: the ISO string is the title.
  const dom = runPage(marked())
  const when = dom.byId.sub.childNodes[dom.byId.sub.childNodes.length - 1]
  assert.strictEqual(when.getAttribute('title'), '2020-01-01T00:00:00.000Z', 'the exact value survives')
  assert.doesNotMatch(when.textContent, /T\d\d:\d\d:\d\d/, 'but the ISO shape is gone from the text')
  assert.match(when.textContent, /2020/, 'and it still says when')
})

// --- a failed send is as loud as a successful one (phase 2) ------------------
//
// The one outcome the reader MUST act on was reported more quietly than the one
// they need do nothing about: a small grey line in the footer, under a verdict
// bar that had just closed. It moves into the decided panel's callout, in the
// delete palette, and the three ways a send can fail are named separately —
// because a server that has moved and a pass the engine refused send the reader
// to different places.

const failed = (dom) => ({
  shown: dom.byId['send-failed'].hidden === false,
  what: dom.byId['send-failed-what'].textContent,
  note: dom.byId['send-failed-note'].textContent,
})

const respond = (status, body) => () =>
  Promise.resolve({ ok: false, status, text: () => Promise.resolve(body) })

test('a 404 says the server is gone, and offers the command', async () => {
  // THE BUG, exactly: the port moved, so this page's URL now reaches another
  // repo's daemon — or nothing. The token means nothing there and the POST
  // comes back 404. Re-opening the page is the fix, because the page is what
  // is stale; the verdict is fine.
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: respond(404, 'no such review') })
  pressed(dom, 'commit')
  await settled()
  const f = failed(dom)
  assert.strictEqual(f.shown, true, 'in the callout, not the footer')
  assert.match(f.what, /server is gone/i)
  assert.match(f.note, /Re-open the page/i, 'it names the fix')
  assert.strictEqual(dom.byId['send-failed-cmd'].hidden, false)
  assert.strictEqual(dom.byId['send-failed-text'].textContent, '/spec-reviewed commit')
})

test('a 422 relays the engine verbatim, and never says to re-open', async () => {
  // The engine READ the pass and refused it; its message names the entry that
  // was wrong. Paraphrasing is how a reader ends up hunting for a problem the
  // tool had already named — and telling them to re-open would send them back
  // to a page that would refuse them again.
  const why = 'verdict "aprove" is not one of commit, changes, discuss'
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: respond(422, why) })
  pressed(dom, 'commit')
  await settled()
  const f = failed(dom)
  assert.match(f.what, /the engine refused this pass/i)
  assert.strictEqual(f.note, why, 'verbatim, not summarised')
  assert.doesNotMatch(f.note, /re-open/i)
  assert.doesNotMatch(f.what, /re-open/i)
})

test('a rejected request is distinguishable from both refusals', async () => {
  // Nothing answered, so there is no status and no message to relay. That is a
  // third sentence rather than either of the two above.
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: () => Promise.reject(new Error('down')) })
  pressed(dom, 'changes')
  await settled()
  const f = failed(dom)
  assert.match(f.what, /could not reach the server/i)
  assert.doesNotMatch(f.what, /server is gone/i, 'not the 404 sentence')
  assert.doesNotMatch(f.what, /refused/i, 'and not the 422 one')
  assert.match(f.note, /did not arrive/i)
})

test('the verdict buttons stay live through all three failures', async () => {
  // NOTHING WAS DELIVERED, so the page is not decided. A page that closed its
  // controls over a failed send would strand the reader with the fix in hand
  // and no way to apply it.
  const ways = [respond(404, ''), respond(422, 'nope'), () => Promise.reject(new Error('down'))]
  for (const fetchWith of ways) {
    const dom = runPage(marked(), { protocol: 'http:', fetchWith })
    pressed(dom, 'commit')
    await settled()
    assert.strictEqual(decidedOn(dom), false, 'the page is not decided')
    assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'commit is still pressable')
    assert.strictEqual(dom.byId['verdict-changes'].disabled, false)
    assert.strictEqual(dom.byId['verdict-discuss'].disabled, false)
  }
})

test('a marked pass still falls back to the blob — notes are not dropped', async () => {
  // A command line carries a verdict and nothing else. A failed send must not
  // become the moment someone's notes disappear, so the whole pass goes to the
  // textarea exactly as it always has — and the callout says why.
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: respond(404, '') })
  accepts(dom)[0].dispatch('click')
  pressed(dom, 'discuss')
  await settled()
  assert.strictEqual(failed(dom).shown, true, 'still as loud')
  assert.strictEqual(dom.byId['send-failed-cmd'].hidden, true, 'no command, because it cannot carry them')
  assert.match(dom.byId['send-failed-note'].textContent, /cannot carry notes/i)
  assert.strictEqual(dom.byId['copy-out'].hidden, false)
  const blob = JSON.parse(dom.byId['copy-out'].value)
  assert.strictEqual(blob.verdict, 'discuss')
  accepted(blob)
})

test('a retry after a failure clears the panel rather than stacking on it', async () => {
  // Two attempts must not leave two accounts of what happened on screen, and a
  // failure that outlived the send that fixed it would be worse than one nobody
  // saw.
  let fail = true
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () =>
      fail
        ? Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
        : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"code":"418207"}') }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(failed(dom).shown, true)
  fail = false
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['send-failed'].hidden, true, 'the failure is gone')
  assert.strictEqual(decidedOn(dom), true, 'and the send that worked ended the page')
})

test('STAYS SILENT: a successful send is untouched', async () => {
  // The whole of this phase must cost the working case nothing — same panel,
  // same wording, same poll, same command box.
  const poll = polling(['waiting'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: poll.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['send-failed'].hidden, true, 'no failure panel anywhere near it')
  assert.strictEqual(dom.byId['send-failed-cmd'].hidden, true)
  assert.strictEqual(decidedOn(dom), true)
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the waiting-pass box is the one that shows')
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
})

test('STAYS SILENT: a file:// page never reaches any of this', () => {
  // It has no server to fail against. The clipboard path is not a fallback
  // here, it is the whole story for a local reader.
  const dom = runPage(marked())
  pressed(dom, 'commit')
  assert.strictEqual(dom.posted.length, 0)
  assert.strictEqual(dom.byId['send-failed'].hidden, true)
  assert.strictEqual(dom.copied.length, 1)
})

// --- the surfaces strip ----------------------------------------------------

/**
 * The strip above the verdicts: where this review lives, and whether it is also
 * running. Every assertion here is about the strip staying DISTINCT from the
 * verdict bar — it is the difference between "I have concluded" and "show me
 * this running first", and a strip that closed the page or cleared a gate would
 * erase it.
 */
test('the strip sits above the verdicts, and says why', () => {
  const at = (s) => TEMPLATE.indexOf(s)
  assert.ok(at('id="surfaces"') > 0, 'the strip is in the template')
  assert.ok(
    at('id="surfaces"') < at('class="verdict-end"'),
    'above the verdict bar, because the question comes before the conclusion',
  )
  assert.match(TEMPLATE, /it is not a verdict/)
})

test('the strip is hidden until a render carries surfaces', () => {
  assert.match(TEMPLATE, /<section class="surfaces reviewable" id="surfaces" hidden>/)
  assert.match(TEMPLATE, /\.surfaces\[hidden\] \{ display: none; \}/)
  // ABSENT, NOT EMPTY — a `--docs` page has no branch to put live, and gets no
  // strip and no line explaining the absence.
  assert.match(TEMPLATE, /ABSENT, NOT EMPTY/)
})

test('every action has a label and a command, and the two lists agree', () => {
  const list = (name) => {
    const m = TEMPLATE.match(new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\n  \\}'))
    assert.ok(m, `${name} is in the page`)
    return [...m[1].matchAll(/'([a-z-]+)':/g)].map((x) => x[1])
  }
  const labels = list('ACTION_LABEL')
  const cmds = list('ACTION_CMD')
  assert.deepStrictEqual(labels, ['live-on', 'allow-network', 'allow-remote'])
  assert.deepStrictEqual(cmds, labels, 'a label with no command leaves a file:// page mute')
  // The command a PERSON types, not the engine verb behind it — the same reason
  // the render's own lines name `/spec-live` and `/spec-remote-review`.
  const cmdBlock = TEMPLATE.match(/var ACTION_CMD = \{([\s\S]*?)\n {2}\}/)[1]
  assert.match(cmdBlock, /'allow-remote': '\/spec-remote-review'/)
  assert.match(cmdBlock, /'live-on': '\/spec-live'/)
})

// AN ACTION MUST NOT END THE PAGE. The reader still owes a verdict; closing
// over an action would be the record-and-do-nothing ending this whole contract
// is against.
test('sending an action never decides the page', () => {
  const fn = TEMPLATE.slice(TEMPLATE.indexOf('function sendAction('), TEMPLATE.indexOf('function watchAction('))
  assert.doesNotMatch(fn, /markDecided/, 'an action is not a conclusion')
  assert.match(TEMPLATE, /IT CARRIES NO MARKS/)
  // The marks stay on the page and travel with the verdict, or one reader's
  // review is counted twice.
  const blob = fn.match(/var blob = \{[\s\S]*?\n {4}\}/)
  assert.ok(blob, 'the action blob is built inline')
  assert.match(blob[0], /accepted: \[\]/)
  assert.match(blob[0], /comments: \[\]/)
})

// A `file://` page has no server and no store, so a button would build an
// instruction with nowhere to go — the same trade the verdict bar already makes.
test('a page with no transport shows the command instead of a button', () => {
  const fn = TEMPLATE.slice(TEMPLATE.indexOf('function buildSurfaces('), TEMPLATE.indexOf('function sendAction('))
  assert.match(fn, /if \(NO_TRANSPORT\) \{/)
  assert.match(fn, /ACTION_CMD\[row\.action\]/)
})

// ENABLE-ONLY is the engine's rule; what the page must not do is invent a
// disable. It renders whatever `tierAction` gave it and no more.
test('the page invents no disable action of its own', () => {
  assert.doesNotMatch(TEMPLATE, /'deny-network'|'deny-remote'|'allow-network-off'/)
})

/* ==========================================================================
 * A check that points at a line
 *
 * `renderReviewBlock` gives a machine finding a jump button; this is the half
 * that proves the button lands somewhere. The unit tests for what the markup
 * SAYS live in env-review-checks.test.js — this one is about what a press does.
 * ========================================================================== */

test('pressing a check with a line opens its file and marks the line', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'flag', file: 'src/app.js', line: 61 }] })
  const btn = dom.document.querySelector('[data-goto]')
  assert.ok(btn, 'the check rendered a jump button')
  btn.dispatch('click')

  const details = dom.byId['f-' + encodeURIComponent('src/app.js')]
  assert.strictEqual(details.open, true, 'the file was opened')
  const hit = dom.document.querySelector('[data-n="61"]')
  assert.ok(hit, 'the row is on screen — the band hiding it was dropped')
  assert.ok(String(hit.className).includes('goto-hit'), 'and it is marked')
})

test('stays silent: a check naming a line that is not in the diff jumps nowhere', () => {
  // A reviewer's finding can name a line that has since moved. Revealing the
  // file is right; scrolling to an arbitrary row would be worse than nothing.
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'flag', file: 'src/app.js', line: 99999 }] })
  dom.document.querySelector('[data-goto]').dispatch('click')
  assert.strictEqual(dom.byId['f-' + encodeURIComponent('src/app.js')].open, true)
  assert.strictEqual(dom.document.querySelector('[data-n="99999"]'), null)
})

test('stays silent: a check naming a file that is not in the diff does nothing', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'flag', file: 'src/gone.js', line: 3 }] })
  // The whole assertion is that this does not throw.
  dom.document.querySelector('[data-goto]').dispatch('click')
})

test('a check with no line still reveals its file', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'confirm', file: 'src/app.js' }] })
  dom.document.querySelector('[data-goto]').dispatch('click')
  assert.strictEqual(dom.byId['f-' + encodeURIComponent('src/app.js')].open, true)
})

test('answering a check still works when the check carries a jump button', () => {
  // The button is appended to the same <li> the reply box is, so the reply
  // wiring must not have been displaced by it.
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'confirm', file: 'src/app.js', line: 61 }] })
  const li = dom.document.querySelector('[data-check="k0"]')
  li.querySelector('.reply').childNodes[0].dispatch('click')
  writeNote(li.querySelector('.note-input'), 'looked at it')
  const reply = copyBlob(dom).comments.find((c) => c.check === 'k0')
  assert.ok(reply)
  assert.strictEqual(reply.file, 'src/app.js')
})

// --- a note survives being written ------------------------------------------
//
// Two ways the page threw one away. It sized the editor by the DIFF COLUMN, so
// on a file with long lines the box was several screens wide and a note scrolled
// sideways instead of wrapping. And it treated text still sitting in the box as
// nothing at all, so a verdict pressed over an unadded note destroyed it without
// a word.

test('a note body is pinned beside the gutter and takes the pane width', () => {
  // The cell a note sits in is a diff-table column, so its width is the longest
  // line of code in the file. Binding the note to that is what made it grow
  // instead of wrap, so the binding is what this asserts.
  const body = /\.note-body\s*\{([^}]*)\}/.exec(TEMPLATE)
  assert.ok(body, 'the template defines .note-body')
  assert.match(body[1], /position:\s*sticky/, 'it follows the horizontal scroll, like the gutter')
  assert.match(body[1], /left:\s*var\(--gutter-w/, 'it pins beside the gutter, not under it')
  assert.match(body[1], /width:\s*var\(--pane-w/, 'its width comes from the pane')
  assert.match(body[1], /max-width:\s*100%/, 'and never widens the table it sits in')
})

test('every note on a row is inside that body — the stored one and the draft', () => {
  const data = marked()
  data.files[0].comments = [{ id: 'c1', line: 61, note: 'this needs a look', raisedAt: '2020-01-01T00:00:00.000Z' }]
  const dom = runPage(data)
  for (const row of findAll(dom.byId.files, 'note-row')) {
    assert.ok(row.querySelector('.note-body'), 'the stored note is in a note body')
  }
  gutters(dom)[0].dispatch('click')
  const input = findAll(dom.byId.files, 'note-input')[0]
  assert.ok(input.closest('.note-body'), 'so is the editor the gutter opens')
})

test('rendering a file publishes the pane width the note body reads', () => {
  const dom = runPage(marked())
  const box = findAll(dom.byId.files, 'code')[0]
  // The shim declares widths (see `widths`): a 1000px pane over a 44px gutter.
  assert.strictEqual(box.style.getPropertyValue('--gutter-w'), '44px')
  assert.strictEqual(box.style.getPropertyValue('--pane-w'), '956px')
})

test('a file measured at nothing keeps the width it had — a closed file is not a 0px pane', () => {
  // STAYS SILENT. A <details> that has not been opened reports 0 for everything,
  // and writing that would give the note a zero-width box on the one render that
  // matters. Three states: a width, no width, and cannot tell.
  const dom = runPage(marked(), { widths: { code: 0, gutter: 0 } })
  const box = findAll(dom.byId.files, 'code')[0]
  assert.strictEqual(box.style.getPropertyValue('--pane-w'), '', 'nothing was published')
})

test('a verdict pressed over an unadded note warns, and sends nothing', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  findAll(dom.byId.files, 'note-input')[0].value = 'the budget total is wrong here'
  const before = dom.copied.length
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'nothing left the page')
  assert.strictEqual(dom.byId['verdict-warn'].hidden, false, 'the reader was told')
  assert.match(dom.byId['verdict-warn'].textContent, /not added/i)
  assert.match(dom.byId['verdict-warn'].textContent, /Discuss first/, 'it names the button pressed')
})

test('the same verdict pressed again sends — warned, never refused', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  findAll(dom.byId.files, 'note-input')[0].value = 'thought better of this'
  dom.byId['verdict-discuss'].dispatch('click')
  const blob = copyBlob(dom)
  assert.deepStrictEqual(blob.comments, [], 'the unadded text was the reader\'s to discard')
  assert.strictEqual(dom.byId['verdict-warn'].hidden, true, 'and the warning went with it')
})

test('adding the note clears the warning rather than leaving it standing', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  const input = findAll(dom.byId.files, 'note-input')[0]
  input.value = 'keep this one'
  dom.byId['verdict-discuss'].dispatch('click')
  writeNote(input, 'keep this one')
  assert.strictEqual(dom.byId['verdict-warn'].hidden, true)
  assert.strictEqual(copyBlob(dom).comments.length, 1, 'and the note is in the pass')
})

test('a second unadded note after a warning warns again, not sends', () => {
  // The confirmation is of what the reader was SHOWN. Text written after the
  // warning was never named in it, so a press that predates it must not carry
  // it away.
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  findAll(dom.byId.files, 'note-input')[0].value = 'first'
  dom.byId['verdict-discuss'].dispatch('click')
  findAll(dom.byId.files, 'note-input')[0].value = 'first, and more'
  const before = dom.copied.length
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the new text was not in the warning')
  assert.strictEqual(dom.byId['verdict-warn'].hidden, false)
})

test('an open editor with nothing in it is not warned about', () => {
  // STAYS SILENT. An editor opened and left empty — or whitespace typed and
  // deleted — is not unfinished work, and a page that stopped on it would teach
  // the reader to press twice for everything.
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  findAll(dom.byId.files, 'note-input')[0].value = '   \n '
  copyBlob(dom)
  assert.strictEqual(dom.byId['verdict-warn'].hidden, true, 'nothing was said')
})
