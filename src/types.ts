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
// v2 SCHEMA TYPES (exported for reference; actual types in types/v2.ts)
// ============================================================================
export type {
  Priority,
  ResourceTag,
  Project,
  BucketTemplateDefinition,
  BucketV2,
  PlannerTaskV2,
  PlannerDataV2,
} from './types/v2';

export {
  PLANNER_DATA_V2_VERSION,
  DEFAULT_PROJECT_ID,
  createInitialPlannerDataV2,
} from './types/v2';
