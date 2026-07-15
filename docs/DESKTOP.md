# Desktop distribution

Planner Buckets supports a browser-first local workflow today. The desktop workstream adds an installable Windows application without removing or weakening the web build.

This document is the implementation contract for issues #38 and #39. Durable persistence and automatic backups are tracked in #40. Signed updates and release automation are tracked in #41.

## Supported delivery modes

### Web

The existing React/Vite application remains supported.

- Development entrypoint: `npm run dev`
- Production build: `npm run build`
- Planner data remains in browser `localStorage`.
- JSON export, merge, and restore remain the portability and backup interface.
- Clearing browser site storage can delete planner data, so users must export backups.

### Desktop

The desktop application will use Tauri 2 around the existing React/Vite frontend.

- It must install and launch without Node.js, a terminal, or the repository.
- It must use normal Windows Start menu and taskbar behavior.
- It must use the same planner schema, validation rules, reducer behavior, and JSON interchange format as the web build.
- Application binaries and user data must be stored separately.
- Desktop file storage will become authoritative only inside the desktop runtime.
- The desktop shell must not silently fall back to browser `localStorage` when file persistence fails.

## Architecture boundary

The React UI must not directly decide where planner data is stored. Introduce a storage adapter selected at runtime.

```text
React UI and planner state
        |
        v
Planner persistence contract
        |
        +-- Web adapter: localStorage
        |
        +-- Desktop adapter: Tauri commands and application-data files
```

The contract should support at least:

- loading validated planner data;
- saving validated planner data;
- describing the active storage mode;
- reporting the current data and backup locations when available;
- creating an explicit recovery snapshot;
- listing or resolving recoverable backups when available;
- returning actionable warnings without discarding the last valid data.

Keep schema validation in TypeScript as the shared domain boundary. Rust-side commands must still protect file operations and must not trust arbitrary paths supplied by the frontend.

## Desktop data locations

Resolve locations through Tauri runtime path APIs. Do not hard-code usernames, repository paths, or installation paths.

Expected Windows shape:

```text
%LOCALAPPDATA%\Planner Buckets\data\planner-v2.json
%LOCALAPPDATA%\Planner Buckets\backups\
```

The exact resolved path may vary by Tauri application identifier and platform conventions.

Data must never be stored under:

- the installed executable directory;
- the Git checkout;
- `node_modules`;
- a temporary build directory;
- a release extraction directory.

## Data safety contract

The desktop persistence implementation in #40 must satisfy these rules:

1. Validate before saving.
2. Write to a temporary file in the destination filesystem.
3. Flush and close the temporary file before replacement.
4. Preserve or recover the previous valid file if replacement fails.
5. Preserve source data before migration.
6. Create a snapshot before restore and update operations.
7. Use bounded backup retention.
8. Surface failures in the UI; never claim data was saved when it was not.
9. Keep JSON export available as a user-controlled external backup.

The initial retention target is 30 daily snapshots plus a bounded set of recent operation snapshots. Final constants and tests belong in #40.

## Browser-to-desktop migration

The first desktop release does not need to read another browser profile directly.

Supported migration flow:

1. Open the current web application.
2. Export **All data** as JSON.
3. Install and launch the desktop application.
4. Restore the exported JSON.
5. Confirm the desktop storage status and create an external backup.

The desktop app must accept the same validated v2 JSON used by the web application. Existing v1 migration behavior must remain deterministic and tested.

## Desktop shell scope for #39

The first desktop PR should include:

- Tauri 2 project files under `src-tauri/`;
- explicit desktop development and build scripts;
- Windows application identity and window configuration;
- application icons generated from an approved source image;
- NSIS installer output;
- a capability/permission configuration limited to required behavior;
- documentation of Windows prerequisites and commands;
- CI-compatible source configuration without committing secrets;
- tests or build checks that prove the browser build remains intact.

The first shell PR may temporarily use the existing localStorage adapter while the desktop file adapter is developed in #40, but it must clearly label that state as transitional and must not claim durable desktop storage is complete.

## Release and update boundary

Issue #41 will add tagged GitHub Release automation and signed updates. The shell work must leave room for it but must not commit private updater keys.

Required later behavior:

- build Windows installers on a supported Windows GitHub-hosted runner;
- publish installer and signed updater artifacts for version tags;
- pin all GitHub Actions to full-length commit SHAs;
- use least-privilege workflow permissions;
- require explicit user approval before restart and installation;
- create a successful pre-update data backup before applying an update;
- keep package, Tauri, installer, and release versions aligned.

## Public repository rules

Because the repository is public and will remain public:

- do not commit signing keys, tokens, local machine paths, personal data, or exported planner data;
- do not include private operational rationale in issues, commits, PRs, workflows, or release notes;
- keep generated build output and installer artifacts out of Git history;
- publish generated installers through GitHub Releases;
- document security-sensitive setup using secret names and procedures, never secret values.

## Validation gates

Before #39 is ready to merge, record the exact results of:

```text
npm ci
npm test
npm run build
npm run verify
npm run desktop:dev
npm run desktop:build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

Command names may be adjusted to match the implemented scripts, but browser tests/builds and Rust/Tauri checks must all be represented.

A local Windows installer launch test is required before calling the shell complete. GitHub Actions validation alone does not prove Start menu installation, taskbar pinning behavior, WebView startup, or upgrade behavior.

## Baseline and rollback reference

The pre-desktop public web baseline is preserved at:

```text
branch: archive/web-v1.1.0-baseline-2026-07-14
commit: 61dc19147c3a82c27ecfa2796854376a409835d9
```

This branch is a source reference, not a substitute for user-data backups.