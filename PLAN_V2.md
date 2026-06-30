# Planner v2.0 Architecture Plan

## Executive Summary

v2.0 introduces a **project–bucket–task hierarchy** while preserving local-first operation and maintaining backward compatibility with v1 data. The scope focuses on portfolio projects with bucket templates, simple priority tracking, and resource tagging—**not** on calendar, cloud storage, workflow automation, or task templates.

Key design principles:

- **Backward compatible:** v1 `PlannerDataV1` remains a permanently supported import format
- **Deterministic migration:** explicit pure function `migrateV1toV2()` with predictable output
- **Focused modules:** functions and hooks, not stateful manager classes
- **Local-first:** no calendars, no accounts, no cloud sync
- **Derived projections:** shared bucket views are editable projections over canonical data, not duplicates
- **Copy-on-apply templates:** bucket templates create independent copies; later template edits do not retroactively change projects
- **Simple priority:** 4-level priority scale (0=none, 1=low, 2=medium, 3=high) across projects, buckets, and tasks
- **Resource tagging:** minimal resource tags for task tracking; no utilization analytics in v2

---

## 1. Complete v2 TypeScript Schema

### Type Definitions

```typescript
// src/domain/types.ts

/**
 * Priority scale: 0=none, 1=low, 2=medium, 3=high.
 * Applied uniformly across projects, buckets, and tasks.
 */
export type Priority = 0 | 1 | 2 | 3;

/**
 * v1 schema: permanent baseline for imports.
 * This interface is never modified; it captures the exact v1 structure.
 */
export interface PlannerDataV1 {
  buckets: BucketV1[];
  tasks: TaskV1[];
  settings?: SettingsV1;
}

export interface BucketV1 {
  id: string;
  name: string;
  isPinned?: boolean;
  position?: number;
}

export interface TaskV1 {
  id: string;
  bucketId: string;
  title: string;
  notes?: string;
  isCompleted?: boolean;
  isPinned?: boolean;
  position?: number;
  createdAt?: string;
}

export interface SettingsV1 {
  visibilityFilter?: 'all' | 'active';
  visualMode?: 'normal' | 'energetic';
  theme?: 'light' | 'dark';
  boardZoom?: number;
}

/**
 * v2 schema: introduces projects, templates, and priority.
 * All v1 data is migrated into default project "My Planner" (id: "project-default").
 */
export interface PlannerDataV2 {
  version: 2;
  projects: Project[];
  buckets: Bucket[];
  tasks: PlannerTask[];
  projectTemplates: ProjectTemplate[];
  bucketTemplateDefinitions: BucketTemplateDefinition[];
  settings: SettingsV2;
  lastModified: string;
}

/**
 * Project: top-level container for buckets, tasks, and configuration.
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  priority?: Priority;
  position: number;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bucket: organizes tasks within a project.
 * - projectId: always required; every bucket belongs to exactly one project
 * - templateBucketDefinitionId: if created from template, links to that definition's stable ID
 */
export interface Bucket {
  id: string;
  projectId: string;
  name: string;
  priority?: Priority;
  description?: string;
  templateBucketDefinitionId?: string; // Stable ID linking to template; null if manually created
  isPinned?: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * PlannerTask: individual task or work item.
 * - projectId: always required; every task belongs to a project
 * - bucketId: required for assigned tasks; null for unassigned tasks in the project
 * - resourceTags: optional list of resource identifiers (trimmed, unique by case-insensitive comparison)
 * - priority: simple 0-3 scale
 */
export interface PlannerTask {
  id: string;
  projectId: string;
  bucketId: string | null; // null = unassigned within the project
  title: string;
  notes?: string;
  isCompleted?: boolean;
  isPinned?: boolean;
  priority?: Priority;
  resourceTags: string[]; // Normalized: trimmed, unique
  position: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * BucketTemplateDefinition: reusable bucket structure.
 * Contains stable bucket definitions, not task templates.
 * Deactivating does not change existing projects created from it.
 */
export interface BucketTemplateDefinition {
  id: string;
  name: string;
  description?: string;
  buckets: TemplateBucketSpec[];
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * TemplateBucketSpec: specification for a bucket within a template.
 * When template is applied, each spec becomes a Bucket instance with stable ID reference.
 */
export interface TemplateBucketSpec {
  id: string; // Template bucket definition ID (stable across applications)
  name: string;
  description?: string;
  priority?: Priority;
  position: number;
}

/**
 * ProjectTemplate: predefined project setup.
 * Included for schema completeness; implementation may defer to later phase.
 */
export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  bucketTemplateDefinitionId: string;
  isActive: boolean;
  position: number;
  createdAt: string;
}

/**
 * Settings: user preferences and state.
 */
export interface SettingsV2 {
  visibilityFilter?: 'all' | 'active';
  visualMode?: 'normal' | 'energetic';
  theme?: 'light' | 'dark';
  boardZoom?: number;
  lastOpenProjectId?: string; // Remember user's active project
}

/**
 * Core reducer action types for v2.
 * Extended definitions in plannerReducer.ts.
 */
export type PlannerAction =
  // v1 actions (preserved)
  | { type: 'ADD_BUCKET'; payload: { projectId: string; name: string } }
  | { type: 'DELETE_BUCKET'; payload: { bucketId: string } }
  | { type: 'RENAME_BUCKET'; payload: { bucketId: string; name: string } }
  | { type: 'MOVE_BUCKET'; payload: { bucketId: string; position: number } }
  | { type: 'TOGGLE_BUCKET_PIN'; payload: { bucketId: string } }
  | { type: 'ADD_TASK'; payload: { projectId: string; bucketId: string | null; title: string } }
  | { type: 'EDIT_TASK'; payload: { taskId: string; title: string; notes?: string } }
  | { type: 'DELETE_TASK'; payload: { taskId: string } }
  | { type: 'TOGGLE_TASK'; payload: { taskId: string } }
  | { type: 'MOVE_TASK'; payload: { taskId: string; bucketId: string | null } }
  | { type: 'MOVE_TASKS'; payload: { taskIds: string[]; bucketId: string | null } }
  | { type: 'TOGGLE_TASK_PIN'; payload: { taskId: string } }
  | { type: 'ARCHIVE_COMPLETED_TASKS'; payload: { projectId?: string } }
  | { type: 'UNARCHIVE_TASK'; payload: { taskId: string } }
  // v2 actions (new)
  | { type: 'CREATE_PROJECT'; payload: { name: string; description?: string } }
  | { type: 'DELETE_PROJECT'; payload: { projectId: string } }
  | { type: 'RENAME_PROJECT'; payload: { projectId: string; name: string } }
  | { type: 'MOVE_PROJECT'; payload: { projectId: string; position: number } }
  | { type: 'TOGGLE_PROJECT_PIN'; payload: { projectId: string } }
  | { type: 'SET_PROJECT_PRIORITY'; payload: { projectId: string; priority?: Priority } }
  | { type: 'SET_BUCKET_PRIORITY'; payload: { bucketId: string; priority?: Priority } }
  | { type: 'SET_TASK_PRIORITY'; payload: { taskId: string; priority?: Priority } }
  | { type: 'SET_TASK_RESOURCE_TAGS'; payload: { taskId: string; tags: string[] } }
  | { type: 'CREATE_BUCKET_TEMPLATE'; payload: { name: string; description?: string; buckets: TemplateBucketSpec[] } }
  | { type: 'DELETE_BUCKET_TEMPLATE'; payload: { templateId: string } }
  | { type: 'TOGGLE_BUCKET_TEMPLATE_ACTIVE'; payload: { templateId: string } }
  | { type: 'APPLY_BUCKET_TEMPLATE'; payload: { templateId: string; projectId: string } }
  | { type: 'REPLACE_DATA'; payload: PlannerDataV2 }
  | { type: 'MERGE_DATA'; payload: PlannerDataV2 };
```

---

## 2. Migration Rules and Lifecycle Behavior

### v1 to v2 Migration

```typescript
// src/domain/migrations.ts

/**
 * migrateV1toV2: deterministic pure function.
 *
 * Input: v1 JSON (any object)
 * Output: valid v2 state, or throws with descriptive error
 *
 * Migration strategy:
 * - Create default project "My Planner" with stable ID "project-default"
 * - Migrate all v1 buckets to v2, assigning projectId="project-default"
 * - Migrate all v1 tasks to v2, assigning projectId="project-default"
 * - Normalize task resource tags (none in v1; initialize as empty)
 * - Preserve all v1 timestamps, completion state, pins, ordering
 * - Generate no new IDs for existing entities
 * - Backfill missing createdAt timestamps with current ISO time
 * - Result is semantically identical to v1 data, now v2-shaped
 * - Never modify the original v1 object
 * - Always produces same output for same input
 */
export function migrateV1toV2(input: unknown): PlannerDataV2 {
  const v1 = parseAndValidateV1(input);
  const now = new Date().toISOString();
  const defaultProjectId = 'project-default';

  const defaultProject: Project = {
    id: defaultProjectId,
    name: 'My Planner',
    position: 0,
    createdAt: now,
    updatedAt: now,
  };

  const buckets: Bucket[] = v1.buckets.map((b, idx) => ({
    id: b.id,
    projectId: defaultProjectId,
    name: b.name,
    position: b.position ?? idx,
    isPinned: b.isPinned,
    createdAt: b.createdAt || now,
    updatedAt: b.createdAt || now,
  }));

  const tasks: PlannerTask[] = v1.tasks.map((t, idx) => ({
    id: t.id,
    projectId: defaultProjectId,
    bucketId: t.bucketId,
    title: t.title,
    notes: t.notes,
    isCompleted: t.isCompleted ?? false,
    isPinned: t.isPinned,
    position: t.position ?? idx,
    resourceTags: [],
    createdAt: t.createdAt || now,
  }));

  return {
    version: 2,
    projects: [defaultProject],
    buckets,
    tasks,
    projectTemplates: [],
    bucketTemplateDefinitions: [],
    settings: v1.settings || {},
    lastModified: now,
  };
}

/**
 * Type guards for version detection.
 */
export function isV1Data(input: unknown): input is PlannerDataV1 {
  if (!input || typeof input !== 'object') return false;
  const obj = input as any;
  return obj.version === undefined && Array.isArray(obj.buckets) && Array.isArray(obj.tasks);
}

export function isV2Data(input: unknown): input is PlannerDataV2 {
  if (!input || typeof input !== 'object') return false;
  const obj = input as any;
  return obj.version === 2 && Array.isArray(obj.projects) && Array.isArray(obj.buckets);
}

function parseAndValidateV1(input: unknown): PlannerDataV1 {
  if (!isV1Data(input)) {
    throw new Error('Input is not valid v1 PlannerData format');
  }
  return input;
}
```

### Deletion and Lifecycle Rules

```typescript
/**
 * State change and deletion rules:
 *
 * DELETE_PROJECT:
 *   - Deletes project, all its buckets, and all tasks in project.
 *   - Single undoable reducer action.
 *   - UI requires explicit user confirmation before dispatch.
 *
 * DELETE_BUCKET:
 *   - Moves tasks in bucket to project's unassigned collection (bucketId=null).
 *   - Deletes bucket definition.
 *   - Single undoable action.
 *
 * DELETE_BUCKET_TEMPLATE:
 *   - Deletes template definition.
 *   - Does NOT modify existing projects created from template.
 *   - Existing buckets retain templateBucketDefinitionId (now orphaned).
 *   - Single undoable action.
 *
 * TOGGLE_BUCKET_TEMPLATE_ACTIVE:
 *   - Changes isActive flag.
 *   - Does NOT modify existing projects.
 *   - Single undoable action.
 *
 * Import v1 into existing v2:
 *   - Migrate v1 to v2 format first.
 *   - User chooses MERGE or REPLACE.
 *   - MERGE: assign new IDs to all imported entities; merge projects by name;
 *     merge buckets within projects by name; skip tasks with duplicate
 *     (normalized title + normalized notes) in target bucket.
 *   - REPLACE: replace all current data after user confirmation.
 *   - All ID remapping is deterministic and logged.
 *
 * Import v2 into existing v2:
 *   - User chooses MERGE or REPLACE (same logic as v1→v2).
 *
 * REPLACE_DATA (restore):
 *   - Replaces all state with provided state after validation and confirmation.
 *   - Single undoable action.
 */
```

---

## 3. Shared/Global Bucket Views

### Global Bucket Identity and Derived Projections

```typescript
/**
 * Global bucket view: projection of all buckets with matching templateBucketDefinitionId.
 *
 * Example:
 *   - Project "Website": bucket "Backlog" with templateBucketDefinitionId="spec-001"
 *   - Project "Mobile": bucket "Backlog" with templateBucketDefinitionId="spec-001"
 *   - Global view "Backlog": shows both buckets' tasks, grouped by project
 *
 * Implementation (UI layer, not state):
 *   - Filter all buckets by templateBucketDefinitionId.
 *   - Group tasks by (project, bucket).
 *   - Render as derived list (no duplication).
 *   - Task actions dispatch against original (projectId, taskId).
 *   - No separate synchronization; single source of truth is canonical state.
 */

export function getGlobalBucketView(
  state: PlannerDataV2,
  templateBucketDefinitionId: string
): {
  definition: TemplateBucketSpec | undefined;
  tasks: Array<{ projectId: string; bucketId: string; task: PlannerTask }>;
} {
  const definition = state.bucketTemplateDefinitions
    .flatMap(t => t.buckets)
    .find(b => b.id === templateBucketDefinitionId);

  const buckets = state.buckets.filter(b => b.templateBucketDefinitionId === templateBucketDefinitionId);

  const tasks = buckets.flatMap(b =>
    state.tasks
      .filter(t => t.bucketId === b.id && t.projectId === b.projectId)
      .map(t => ({ projectId: b.projectId, bucketId: b.id, task: t }))
  );

  return { definition, tasks };
}
```

---

## 4. Resource Tags and Normalization

```typescript
/**
 * Resource tags: optional string identifiers for task-level resource assignment.
 *
 * Stored on PlannerTask.resourceTags: string[]
 *
 * Normalization:
 *   - Trim whitespace from each tag.
 *   - Deduplicate by case-insensitive comparison.
 *   - Store in canonical form (original case or lowercase, consistently).
 *   - Allow empty list for untagged tasks.
 *
 * v2.0 scope:
 *   - Display resource tags on task cards.
 *   - Add/remove tags via task editor UI.
 *   - Optional: filter tasks by resource tag.
 *
 * NOT in v2.0:
 *   - Resource utilization analytics.
 *   - Capacity planning or conflicts.
 *   - Historical resource usage reports.
 *
 * Example:
 *   Input: ["  Alice  ", "alice", "  Bob  "]
 *   Normalized: ["Alice", "Bob"]
 */

export function normalizeResourceTags(tags: string[]): string[] {
  const trimmed = tags.map(t => t.trim()).filter(t => t.length > 0);
  const uniqueInsensitive = Array.from(new Map(
    trimmed.map(t => [t.toLowerCase(), t])
  ).values());
  return uniqueInsensitive;
}
```

---

## 5. Module and Component Architecture

### Focused Modules (No Stateful Manager Classes)

```
src/
├── domain/
│   ├── types.ts                      # All v2 TypeScript definitions
│   ├── plannerReducer.ts             # Pure reducer: mutations only
│   └── migrations.ts                 # Pure v1↔v2 conversion functions
├── services/
│   ├── plannerPersistence.ts         # localStorage load/save (pure functions)
│   ├── plannerImport.ts              # Import/merge/restore logic (pure functions)
│   └── plannerClipboard.ts           # Clipboard formatting/parsing (pure functions)
├── hooks/
│   ├── usePlannerHistory.ts          # Undo/redo wrapper around useReducer
│   ├── usePlannerKeyboardShortcuts.ts # Global keyboard event lifecycle
│   └── usePlanner.ts                 # Optional: composition layer (if needed)
├── components/
│   ├── ProjectBoard/
│   │   ├── ProjectBoard.tsx          # Selected project's buckets/tasks
│   │   ├── BucketColumn.tsx          # Existing, extracted
│   │   ├── TaskCard.tsx              # Existing, extracted
│   │   └── BucketHeader.tsx          # Extracted from BucketColumn
│   ├── ControlPanel/
│   │   ├── ControlPanel.tsx          # Left sidebar container
│   │   ├── ProjectList.tsx           # Project selection and CRUD
│   │   ├── TemplateLibrary.tsx       # Bucket template management
│   │   └── ImportExport.tsx          # Extracted from App
│   ├── TaskActions/
│   │   ├── TaskEditor.tsx            # Existing
│   │   ├── PriorityPicker.tsx        # NEW: priority control
│   │   └── ResourceTagEditor.tsx     # NEW: resource tag input
│   └── Modals/
│       ├── ImportModal.tsx           # Extract from App
│       ├── ProjectModal.tsx          # Create/edit projects
│       └── TemplateModal.tsx         # Create/manage templates
├── App.tsx                           # Orchestration only (< 300 lines)
└── main.tsx                          # Entry point (unchanged)
```

### Service Module Examples

```typescript
// src/services/plannerPersistence.ts
export function saveToLocalStorage(state: PlannerDataV2): void {
  localStorage.setItem('planner-v2', JSON.stringify(state));
  localStorage.setItem('planner-v2-timestamp', new Date().toISOString());
}

export function loadFromLocalStorage(): PlannerDataV2 | null {
  const raw = localStorage.getItem('planner-v2');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlannerDataV2;
  } catch {
    return null;
  }
}

// src/services/plannerClipboard.ts
export function formatTasksForClipboard(tasks: PlannerTask[]): string {
  return tasks.map((t, i) => {
    const priority = t.priority ? `[P${t.priority}]` : '';
    const tags = t.resourceTags.length ? ` {${t.resourceTags.join(',')}}` : '';
    const notes = t.notes ? `\n  Notes: ${t.notes}` : '';
    return `${i + 1}. ${priority} ${t.title}${tags}${notes}`;
  }).join('\n');
}

// src/hooks/usePlannerHistory.ts
export function usePlannerHistory(
  initialState: PlannerDataV2
): [PlannerDataV2, Dispatch<PlannerAction>, { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }] {
  const [history, setHistory] = React.useState<PlannerDataV2[]>([initialState]);
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const dispatch = React.useCallback((action: PlannerAction) => {
    setCurrentIndex(i => {
      const nextState = plannerReducer(history[i], action);
      const newHistory = history.slice(0, i + 1);
      newHistory.push(nextState);
      setHistory(newHistory);
      return i + 1;
    });
  }, [history]);

  return [
    history[currentIndex],
    dispatch,
    {
      canUndo: currentIndex > 0,
      canRedo: currentIndex < history.length - 1,
      undo: () => setCurrentIndex(i => Math.max(0, i - 1)),
      redo: () => setCurrentIndex(i => Math.min(history.length - 1, i + 1)),
    },
  ];
}
```

---

## 6. Reducer Actions and Ordering

### Preserved v1 Actions (with projectId added where needed)

- `ADD_BUCKET`: Create bucket in project
- `DELETE_BUCKET`: Delete bucket, move tasks to unassigned
- `RENAME_BUCKET`: Rename bucket
- `MOVE_BUCKET`: Change bucket position within project
- `TOGGLE_BUCKET_PIN`: Pin/unpin bucket
- `ADD_TASK`: Add task to project/bucket
- `EDIT_TASK`: Edit task title/notes
- `DELETE_TASK`: Delete task
- `TOGGLE_TASK`: Toggle completion
- `MOVE_TASK`: Move task to different bucket or unassigned
- `MOVE_TASKS`: Batch move multiple tasks
- `TOGGLE_TASK_PIN`: Pin/unpin task
- `ARCHIVE_COMPLETED_TASKS`: Archive completed tasks in project
- `UNARCHIVE_TASK`: Unarchive task
- `REPLACE_DATA`: Full state replacement (restore)

### New v2 Actions

- `CREATE_PROJECT`: Create project
- `DELETE_PROJECT`: Delete project and all contained buckets/tasks
- `RENAME_PROJECT`: Rename project
- `MOVE_PROJECT`: Reorder projects
- `TOGGLE_PROJECT_PIN`: Pin/unpin project
- `SET_PROJECT_PRIORITY`: Set project priority (0-3)
- `SET_BUCKET_PRIORITY`: Set bucket priority (0-3)
- `SET_TASK_PRIORITY`: Set task priority (0-3)
- `SET_TASK_RESOURCE_TAGS`: Set/update resource tags on task
- `CREATE_BUCKET_TEMPLATE`: Create bucket template definition
- `DELETE_BUCKET_TEMPLATE`: Delete template definition
- `TOGGLE_BUCKET_TEMPLATE_ACTIVE`: Activate/deactivate template
- `APPLY_BUCKET_TEMPLATE`: Apply template to project (copy-on-apply)
- `MERGE_DATA`: Merge imported data (v1 or v2) into current state

### Array Ordering

All ordering is canonical via array position within parent:
- Projects ordered by position in `state.projects[]`
- Buckets within a project ordered by filtering `state.buckets` by projectId and sorting by position
- Tasks within a bucket ordered by filtering `state.tasks` by (projectId, bucketId) and sorting by position

Move operations update position field; no fractional indexing or linked lists.

---

## 7. Test Behaviors (Organized by Feature, Not Quantity)

Tests must verify these behaviors:

### v1 Migration Preservation
- [ ] All v1 buckets and tasks migrate to v2 with unchanged IDs
- [ ] v1 timestamps and pin states are preserved
- [ ] v1 data lands in "My Planner" project (id="project-default")
- [ ] Migration is deterministic: same v1 input → same v2 output

### Project CRUD
- [ ] Create project with name and optional description
- [ ] Delete project: removes project, buckets, and tasks (single undoable action)
- [ ] Rename project
- [ ] Reorder projects
- [ ] Pin/unpin projects

### Project-Scoped Unassigned Tasks
- [ ] Tasks can have bucketId=null within a project
- [ ] Moving task to null removes it from bucket display
- [ ] Unassigned tasks appear in project's unassigned collection

### Template Application (Copy-on-Apply)
- [ ] Apply bucket template to project: creates new buckets with matching specs
- [ ] Created buckets have templateBucketDefinitionId set to source template ID
- [ ] Later edits to template do NOT rename, add, or delete buckets in existing projects

### Template Deactivation
- [ ] Deactivating template does NOT change existing projects or buckets
- [ ] Inactive templates do not appear in template library UI

### Shared Bucket Projection
- [ ] Global view groups buckets by templateBucketDefinitionId across projects
- [ ] Tasks in projected view are editable via original (projectId, taskId)
- [ ] No task duplication; single source of truth in canonical state

### Editable Projected Tasks
- [ ] Editing task from projected view dispatches action against original IDs
- [ ] Projected view reflects changes immediately

### Resource Tag Normalization
- [ ] Whitespace trimmed; case-insensitive duplicates removed
- [ ] Empty list valid for untagged tasks
- [ ] Normalized tags stored on task

### Priority Changes
- [ ] Priority can be set to 0, 1, 2, or 3 on projects, buckets, tasks
- [ ] Priority changes dispatch single undoable action

### Project Deletion Undo/Redo
- [ ] Delete project dispatches single action
- [ ] Undo restores project and all contained buckets/tasks
- [ ] Redo re-deletes

### v1-to-v2 Import
- [ ] Detect v1 JSON; migrate to v2 first
- [ ] User chooses MERGE or REPLACE
- [ ] MERGE: reassign all IDs; merge by project name, bucket name; skip duplicate tasks
- [ ] All ID remapping is logged/traceable

### v2-to-v2 Merge
- [ ] Import v2 JSON into existing v2 state
- [ ] Merge strategy matches v1→v2 behavior

### Restore Replacement
- [ ] REPLACE_DATA fully replaces state after validation and confirmation
- [ ] Single undoable action

### Persistence Round-Trips
- [ ] State serialized to localStorage and reloaded is identical
- [ ] Export to JSON and re-import is identical
- [ ] No data loss across save/load cycles

---

## 8. Implementation Phases with Review Gates

### Phase 0: Architecture Documentation ✅

**Deliverable:** Reviewed and approved `PLAN_V2.md` in repository

- [ ] Commit revised `PLAN_V2.md` with complete schema, migration rules, module design
- [ ] Stop and await review

**Success Criteria:**
- Schema is unambiguous
- Migration rules are explicit
- Module structure is clear
- Test behaviors are defined

---

### Phase 1: Behavior-Preserving Extraction

**Goal:** Extract clipboard, import/export, persistence, and keyboard logic without changing visible behavior or schema.

**Scope:**
- Extract `plannerClipboard.ts`: pure clipboard formatting functions
- Extract `plannerPersistence.ts`: localStorage load/save
- Extract `plannerImport.ts`: merge/restore logic
- Extract `usePlannerHistory.ts`: undo/redo wrapper
- Extract `usePlannerKeyboardShortcuts.ts`: global keyboard event binding
- Update `App.tsx` to use extracted services/hooks
- **No schema changes**
- **No UI changes**
- **All 36 v1 tests must pass unchanged**

**Acceptance:**
- [ ] All existing tests pass (36/36)
- [ ] No visual differences
- [ ] App.tsx is smaller and clearer
- [ ] Services are independently testable

---

### Phase 2: Schema and Migration Foundation

**Goal:** Add v2 types, migration function, and validators; ensure backward compat.

**Scope:**
- Add v2 types to `domain/types.ts`
- Implement `domain/migrations.ts`: `migrateV1toV2()`, type guards, validators
- Add migration tests: determinism, preservation, edge cases
- Add v2 type tests: schema validation, round-tripping

**Acceptance:**
- [ ] Migration preserves all v1 data semantics
- [ ] Type validation catches malformed data
- [ ] v1 JSON → v2 state is deterministic
- [ ] All migration tests pass

---

### Phase 3: Projects

**Goal:** Add project CRUD and project-scoped board rendering.

**Scope:**
- Extend `plannerReducer.ts` with project actions
- Add reducer tests for CRUD operations, undo/redo, ordering
- Extract `ProjectBoard.tsx`: renders selected project's buckets/tasks
- Extract `ProjectList.tsx`: project selection and CRUD UI
- Update `App.tsx` to manage active project selection
- Wire `usePlannerHistory` and services into App
- Update board to show project-scoped tasks only

**Acceptance:**
- [ ] All v1 tests pass (36/36)
- [ ] All migration tests pass
- [ ] All reducer tests pass (new + v1)
- [ ] Project CRUD is undoable
- [ ] Board correctly scopes to active project

---

### Phase 4: Templates and Shared Bucket Definitions

**Goal:** Add bucket templates, copy-on-apply setup, and global derived views.

**Scope:**
- Add template actions to reducer
- Add reducer tests for template operations, application, preservation
- Implement `getGlobalBucketView()`: projection by `templateBucketDefinitionId`
- Extract `TemplateLibrary.tsx`: manage and apply templates
- Add UI for template selection during project setup
- Update reducer to preserve `templateBucketDefinitionId` on buckets

**Acceptance:**
- [ ] All prior tests pass
- [ ] New template tests pass
- [ ] Template deactivation does not change existing projects
- [ ] Global views correctly group buckets by template ID
- [ ] UI allows creating and applying templates

---

### Phase 5: Priority and Resource Tags

**Goal:** Add simple priority scale and resource tags to tasks.

**Scope:**
- Add priority actions to reducer
- Add resource tag actions to reducer
- Implement `normalizeResourceTags()` function
- Add reducer tests for priority changes, tag normalization, undo/redo
- Extract `PriorityPicker.tsx`: UI for 0-3 scale
- Extract `ResourceTagEditor.tsx`: add/remove tags with normalization
- Update `TaskCard.tsx` to display priority and tags
- Optional: add filter option for priority or resource tag

**Acceptance:**
- [ ] All prior tests pass
- [ ] Priority and tags are persisted correctly
- [ ] Tag normalization works (whitespace, duplicates)
- [ ] UI controls are intuitive

---

### Phase 6: Hardening and v2.0 Release

**Goal:** Verify end-to-end workflows, polish, and prepare for public v2.0 release.

**Scope:**
- Full integration testing: create project, apply template, add tasks, set priority, add tags, export/import
- v1-to-v2 import regression testing: real v1 exports → v2 import → project creation
- v2-to-v2 merge regression testing: merge overlapping projects and buckets
- Restore replacement testing: full data replacement with undo
- Accessibility review: keyboard navigation, screen reader support
- Screenshot and documentation update
- CHANGELOG.md update: list v2.0 features and migration notes
- Create v2.0-dev branch; submit PR for final review
- Upon approval, tag `v2.0.0` and publish

**Acceptance:**
- [ ] All integration tests pass
- [ ] Import/export round-trips are lossless
- [ ] Restore and merge work correctly
- [ ] Accessibility guidelines met
- [ ] Documentation is current
- [ ] CI passes on v2.0-dev branch

---

## 9. Summary of v2 Differences from v1

| Aspect | v1 | v2 |
|--------|----|----|
| **Top-level structure** | Flat buckets and tasks | Projects contain buckets and tasks |
| **Task assignment** | Bucket ID required | Project ID required; bucket ID optional (null=unassigned) |
| **Priority** | None | Simple 0-3 scale on projects, buckets, tasks |
| **Resource tags** | None | Optional string[] on tasks; normalized |
| **Templates** | None | Bucket templates (copy-on-apply); no task templates in v2.0 |
| **Shared views** | None | Global derived projections by template bucket ID |
| **Schema version** | Implicit (v1 if no version field) | Explicit: `version: 2` |
| **Default project** | N/A | "My Planner" with ID `project-default` |
| **Migration** | N/A | Deterministic pure function `migrateV1toV2()` |
| **Persistence** | localStorage key: (implicit) | localStorage key: `planner-v2` |

---

## 10. Design Constraints and Non-Goals

### Included in v2.0
- ✅ Project-bucket-task hierarchy
- ✅ Bucket templates (copy-on-apply)
- ✅ Simple 4-level priority
- ✅ Resource tags (minimal, no analytics)
- ✅ Shared bucket views (derived projections)
- ✅ Backward-compatible v1 import
- ✅ Undo/redo for all new actions
- ✅ Local-first persistence

### Explicitly NOT in v2.0
- ❌ Task templates
- ❌ Calendar or scheduling
- ❌ Cloud accounts or team collaboration
- ❌ Workflow automation or conditions
- ❌ Resource utilization analytics
- ❌ Cost accounting
- ❌ Historical trending
- ❌ Recurring tasks or dependencies
- ❌ Notifications or reminders

These are candidate features for v3.0+ after v2.0 is published and stabilized.

---

## 11. Schema Finalization Checklist

Before Phase 1 begins:

- [ ] All TypeScript interfaces in §1 are complete and unambiguous
- [ ] All migration rules in §2 are exact and testable
- [ ] All reducer actions in §6 are necessary and minimal
- [ ] All test behaviors in §7 are concrete and achievable
- [ ] All module paths in §5 are clear and follow project conventions
- [ ] No required classes; all services are functions or hooks
- [ ] Default project ID `"project-default"` is documented
- [ ] Priority scale 0-3 is accepted
- [ ] Resource tags on tasks only (not projects/buckets) is accepted
- [ ] Global views are editable projections, not duplicates

---

## Next: Review and Approval

This plan is complete and ready for review before Phase 1 implementation begins.

**Awaiting:**
1. Schema review and approval
2. Migration rule confirmation
3. Module structure sign-off
4. Test behavior acceptance
5. Phase 1 scope clarification (if needed)

Upon approval, proceed to Phase 1: Behavior-Preserving Extraction.
