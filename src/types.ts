export const PLANNER_DATA_VERSION = 1 as const;

export interface Bucket {
  id: string;
  name: string;
  createdAt: string;
  pinned: boolean;
}

export interface PlannerTask {
  id: string;
  title: string;
  description: string;
  bucketId: string | null;
  pinned: boolean;
  completed: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerData {
  version: typeof PLANNER_DATA_VERSION;
  buckets: Bucket[];
  tasks: PlannerTask[];
}

export interface TaskDraft {
  title: string;
  description: string;
  bucketId: string | null;
}

// ============================================================================
// V1 SCHEMA TYPE ALIASES (explicit version naming for clarity)
// ============================================================================
export type PlannerDataV1 = PlannerData;
export type BucketV1 = Bucket;
export type PlannerTaskV1 = PlannerTask;

// ============================================================================
// V2 SCHEMA TYPES (exported for reference; actual types in types/v2.ts)
// ============================================================================
export type {
    Priority,
    ResourceTag,
    Project,
    BucketTemplate,
    BucketTemplateDefinition,
    BucketV2,
    PlannerTaskV2,
    PlannerDataV2,
} from './types/v2';

export {
    PLANNER_DATA_V2_VERSION,
    DEFAULT_PROJECT_ID,
    MIGRATION_FALLBACK_TIMESTAMP,
    createInitialPlannerDataV2,
} from './types/v2';

// ============================================================================
// MIGRATION AND VALIDATION (exported for reference)
// ============================================================================
export { migrateV1toV2, normalizeResourceTags, detectPlannerVersion, deriveMigrationTimestamps } from './types/migration';

export {
    isValidPlannerDataV1,
    isValidBucketV1,
    isValidTaskV1,
    isPlannerDataV2Shape,
    isValidPlannerDataV2,
    isValidProject,
    isValidBucketTemplate,
    isValidBucketTemplateDefinition,
    isValidBucketV2,
    isValidTaskV2,
    isValidPriority,
    isValidResourceTag,
    validatePlannerDataV2Integrity,
} from './types/validators';
