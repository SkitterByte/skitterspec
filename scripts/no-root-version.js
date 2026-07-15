#!/usr/bin/env node
'use strict'

/**
 * `preversion` guard for the private monorepo root.
 *
 * `npm version` at the root once bumped the private `skitterspec-monorepo`
 * package (0.0.0 → 1.0.0) instead of a publishable distribution. This guard
 * refuses that command at the root and points at the sanctioned path, so the
 * misfire can't happen again. Releases go through `scripts/release.js`, which
 * versions a single workspace with `npm version -w <pkg>`.
 *
 * Exits non-zero so npm aborts the version bump before it mutates anything.
 */

const MESSAGE = `
✗ Refusing 'npm version' at the monorepo root.

  This is the private 'skitterspec-monorepo' package — bumping it publishes
  nothing and once misfired (0.0.0 → 1.0.0). Release a workspace instead:

      node scripts/release.js <package> <patch|minor|major|x.y.z> [--publish]

  Packages: skitterspec, skitterspec-linear
  See RELEASING.md for the full flow.
`

console.error(MESSAGE.trim())
process.exit(1)
