# Planner Buckets — Simple Build Plan

## Intent

Build a small, reliable planner that behaves like a common bucket/board layout without introducing accounts, servers, or workflow complexity before they are needed.

## Version 1 scope

- Create, edit, delete, and complete tasks.
- Assign a task to a named bucket or leave it unassigned.
- Create, rename, and delete buckets.
- Pin tasks and buckets for faster triage.
- Drag tasks between buckets and back to **Unassigned**.
- Copy one task or copy all active tasks in a bucket as an ordered clipboard list.
- Save automatically in the browser using `localStorage`.
- Export the planner to JSON, merge uploaded JSON, and restore from backup JSON.
- Keep the data model and persistence code isolated so a cloud repository can replace local storage later.

## Product rules

1. **Unassigned is permanent.** It is a system column, not a deletable bucket.
2. **Deleting a bucket never deletes its tasks.** Those tasks move to Unassigned.
3. **Completion is independent of bucket.** A completed task remains where the user placed it.
4. **Task names are required.** Notes and bucket assignment are optional.
5. **Copy actions use active bucket ordering.** Bucket copy preserves the bucket's active task order and excludes archived tasks.
6. **Local data remains the default.** Cloud sync should be added only when multi-device access or collaboration is required.

## Technical approach

- **UI:** React + TypeScript + Vite.
- **State:** A reducer with explicit task and bucket actions.
- **Persistence:** Versioned planner data stored in `localStorage`.
- **Backup:** JSON export, merge upload, and confirmed restore.
- **Drag and drop:** Native browser drag events to avoid an additional runtime dependency.
- **Testing:** Reducer tests for moving tasks, deleting buckets, and completion.

## Likely next phase

When cloud storage is justified, add authentication and a small API backed by SQLite/PostgreSQL or a hosted service. Preserve the existing `PlannerData` schema and replace the local save/load implementation with a repository that supports synchronization and conflict handling.
