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
 * Bucket template: reusable bucket configuration collection.
 */
export interface BucketTemplate {
    id: string;
    name: string;
    description: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Bucket template definition: reusable bucket specification within a template.
 * Each definition belongs to exactly one template.
 */
export interface BucketTemplateDefinition {
    id: string;
    templateId: string; // Reference to parent BucketTemplate
    name: string;
    description: string;
    priority: Priority;
    defaultActive: boolean;
    position: number; // Order within template
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
    templates: BucketTemplate[];
    templateDefinitions: BucketTemplateDefinition[];
}

/**
 * Named constant for the stable default project ID.
 * Used during v1→v2 migration to group all v1 data under a single project.
 */
export const DEFAULT_PROJECT_ID = 'project-default' as const;

/**
 * Migration timestamp fallback for empty v1 data.
 * Used when no timestamps are present in v1 buckets or tasks.
 */
export const MIGRATION_FALLBACK_TIMESTAMP = '1970-01-01T00:00:00.000Z' as const;

/**
 * Helper: create initial v2 data with default project.
 * Uses fallback timestamp (not runtime clock) for deterministic output.
 */
export const createInitialPlannerDataV2 = (createdAt: string = MIGRATION_FALLBACK_TIMESTAMP): PlannerDataV2 => ({
    version: PLANNER_DATA_V2_VERSION,
    projects: [
        {
            id: DEFAULT_PROJECT_ID,
            name: 'My Planner',
            description: 'Default project for all tasks',
            priority: 0,
            pinned: true,
            createdAt,
            updatedAt: createdAt,
        },
    ],
    buckets: [],
    tasks: [],
    templates: [],
    templateDefinitions: [],
});
