# Planner v2.0 Architecture Plan

> **Status: historical design record.** This document originally contained the pre-implementation v2 proposal. The implemented architecture evolved during development, so the old pseudocode, type names, field names, and file paths were removed from the current branch to prevent them from being mistaken for live technical documentation. The complete original proposal remains available in Git history.

## Authoritative implementation references

Use these files when reviewing or changing the current system:

- `README.md` — current product behavior, setup, architecture overview, and repository map
- `src/types/v2.ts` — implemented v2 domain schema
- `src/types/validators.ts` — structural and relational validation
- `src/state/plannerReducerV2.ts` — deterministic v2 state transitions
- `src/services/plannerPersistence.ts` — loading, migration, persistence, import, and restore behavior
- `src/services/plannerPersistenceV2.test.ts` — v2 persistence and migration coverage
- `src/App.integration.test.tsx` — integrated UI behavior coverage

## Design principles retained in the implementation

- Local-first browser operation without required accounts or cloud services
- Explicit project, bucket, task, template, and template-definition entities
- Versioned persistence with v1-to-v2 migration support
- Deterministic reducer-driven state transitions
- Relational integrity validation for imported and restored data
- Project-scoped unassigned tasks
- Copy-on-apply bucket templates
- Simple priority and normalized resource-tag support

## Documentation rule

Current source, tests, `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` are authoritative. When a historical commit or design note differs from the implemented code, follow the current implementation and update its tests and user-facing documentation together.
