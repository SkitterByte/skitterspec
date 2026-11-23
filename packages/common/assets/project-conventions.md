# Project conventions

This file belongs to the project. skitterspec writes it once and never
overwrites it, so fill it in.

The spec skills tell you to run "your project's typecheck and test commands"
and to "honour project conventions". Spell those out here so specs stay
consistent with the codebase. skitterspec never runs these commands itself and
knows nothing about what this project is written in. Pick the example below
that fits, or write your own.

- **Typecheck command:** `<e.g. npm run typecheck · dotnet build · mypy . · go vet ./...>`
- **Test command:** `<e.g. npm test · dotnet test · pytest · go test ./...>`
  (single file/dir: `<e.g. npx vitest run path · dotnet test --filter · pytest path>`)
- **Lint/format:** `<e.g. npm run lint · dotnet format · ruff check · golangci-lint run>`
- **Other rules specs must honour:** link the relevant `.claude/rules/*.md`
  (architecture, code style, testing, database, etc.) rather than restating them.
