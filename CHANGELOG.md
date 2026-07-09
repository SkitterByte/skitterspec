# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-09

### Added
- **sync**: opt-in Linear steps in /spec and /spec-go
- **sync**: add spec-status/pull/push skills
- **sync**: push/pull engine + MCP adapter
- **sync**: three-way Linear sync engine core
- **spec**: worktree-by-default isolation, docker on demand
- **init**: opt into per-spec isolation at setup
- **env**: worktree-only specs skip docker slots
- **env**: per-spec Stack field gates docker
- **env**: wire spec-env into init + docs + hooks
- **env**: spec-env down teardown + guards
- **env**: provision spec-env up + generic opener
- **env**: add spec-env config/registry/resolve

### Changed
- **specs**: retire folder index files

## [0.1.0] - 2026-06-30

### Added
- **cli**: guided install for release tooling
- **config**: wire config into the generators
- **scripts**: port changelog/releases generators
- add /commit skill and commit-messages rule
- split spec phases into per-phase files
- add spec-review skill and spec-go pre-flight
- skitterspec scaffolder for Claude Code specs
