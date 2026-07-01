/**
 * v2 Domain Schema: Explicit types for next-generation planner data model.
 * Preserves v1 types separately; does not mutate v1 interfaces.
 */

/**
 * v2 Schema version constant.
 */
export const PLANNER_DATA_V2_VERSION = 2 as const;

/**
 * Priority level: 0 (none), 1 (low), 2 (medium), 3 (high).
 */
export type Priority = 0 | 1 | 2 | 3;

/**
 * Normalized resource tag: lowercase, trimmed, non-empty string.
 */
export type ResourceTag = string & { readonly __brand: 'ResourceTag' };

/**
 * Creates a resource tag brand (type-level branding for compile-time validation).
 */
export const createResourceTag = (tag: string): ResourceTag => {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) throw new Error('Resource tag cannot be empty');
  return normalized as ResourceTag;
};

/**
 * v2 Project: top-level container for buckets and tasks.
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  priority: Priority;
  pinned: boolean;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

/**
 * Bucket template definition: reusable bucket specification for copy-on-apply.
 */
export interface BucketTemplateDefinition {
  id: string;
  name: string;
  description: string;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

/**
 * v2 Bucket: project-scoped container for tasks, optionally based on template.
 */
export interface BucketV2 {
  id: string;
  projectId: string;
  name: string;
  description: string;
  templateDefinitionId: string | null; // Reference to BucketTemplateDefinition
  priority: Priority;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * v2 Task: project-scoped item with optional bucket assignment.
 */
export interface PlannerTaskV2 {
  id: string;
  projectId: string;
  bucketId: string | null; // null = project-scoped unassigned
  title: string;
  description: string;
  priority: Priority;
  resourceTags: ResourceTag[];
  pinned: boolean;
  completed: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * v2 Planner Data: complete v2 model state.
 */
export interface PlannerDataV2 {
  version: typeof PLANNER_DATA_V2_VERSION;
  projects: Project[];
  buckets: BucketV2[];
  tasks: PlannerTaskV2[];
  templateDefinitions: BucketTemplateDefinition[];
}

/**
 * Named constant for the stable default project ID.
 * Used during v1→v2 migration to group all v1 data under a single project.
 */
export const DEFAULT_PROJECT_ID = 'project-default' as const;

/**
 * Helper: create initial v2 data with default project.
 */
export const createInitialPlannerDataV2 = (): PlannerDataV2 => ({
  version: PLANNER_DATA_V2_VERSION,
  projects: [
    {
      id: DEFAULT_PROJECT_ID,
      name: 'My Planner',
      description: 'Default project for all tasks',
      priority: 0,
      pinned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  buckets: [],
  tasks: [],
  templateDefinitions: [],
});
