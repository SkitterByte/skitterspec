# Project conventions

This file belongs to the project. skitterspec writes it once and never
overwrites it.

- **Typecheck command:** none — plain CommonJS, no type layer. `pnpm build`
  composes the distributions and is the nearest equivalent.
- **Test command:** `pnpm test` (`node --test`). Single file:
  `node --test packages/common/test/<file>.test.js`. Asset tests read the built
  distributions, so run `pnpm build` first after an asset edit.
- **Lint/format:** none configured.
- **Other rules specs must honour:** `.claude/rules/commit-messages.md`,
  `.claude/rules/commit-trailers.md`, `.claude/rules/docs-freshness.md`,
  `.claude/rules/negative-checks.md`.
