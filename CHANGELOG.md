# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

## [1.0.1] - 2026-06-30

### Fixed

- Release workflow: removed redundant `npm run build` step (build already included in `npm run verify`).

## [1.0.0] - 2026-06-30

### Added

- Clipboard copy actions for individual tasks and ordered active task lists per bucket.
- Multi-select task copy/paste between buckets.
- Undo and redo history wrapper for reducer-driven planner actions.
- Repository hygiene baseline for private-to-public readiness.
- GitHub Actions CI workflow for build/test verification.
- Contribution, security, and pull request templates.
- MIT license and README architecture/screenshot documentation.

### Changed

- Bucket/task drag-and-drop interaction polish and visual feedback improvements.
- Bucket and task hover states now use mode-tuned slow glow behavior, with energetic long-hover sparks.
- Side panel behavior now separates manual Show/Hide, autohide, and automatic-open locking.
- Import behavior now merges tasks into existing buckets by name and skips duplicates.

### Fixed

- Bucket placement index bug when dragging rightward.
- Lingering task drop-line glitch during bucket moves.
- Board/sidebar spacing regressions after the side panel layout update.

## [0.1.0] - 2026-06-26

### Initial release

- Initial local-first bucket planner.
- Task and bucket management (create, edit, move, archive, restore).
- JSON export/import and local storage persistence.
- Theme and visual mode controls.
- Reducer test coverage.
