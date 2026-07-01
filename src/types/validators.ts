/**
 * Validators and type guards for v1 and v2 planner data.
 * Strict runtime validation: rejects malformed data rather than repairing.
 */

import type { PlannerData, PlannerTask, Bucket } from '../types';
import { PLANNER_DATA_VERSION } from '../types';
import type {
  PlannerDataV2,
  Project,
  BucketV2,
  PlannerTaskV2,
  BucketTemplateDefinition,
  Priority,
  ResourceTag,
} from './v2';
import { PLANNER_DATA_V2_VERSION, DEFAULT_PROJECT_ID } from './v2';

// ============================================================================
// V1 VALIDATORS (preserve existing validation logic)
// ============================================================================

/**
 * Validate a bucket object matches v1 Bucket interface.
 */
export const isValidBucketV1 = (value: unknown): value is Bucket => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<Bucket>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.pinned === 'boolean'
  );
};

/**
 * Validate a task object matches v1 PlannerTask interface.
 */
export const isValidTaskV1 = (value: unknown): value is PlannerTask => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<PlannerTask>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.description === 'string' &&
    (typeof obj.bucketId === 'string' || obj.bucketId === null) &&
    (typeof obj.pinned === 'boolean' || typeof obj.pinned === 'undefined') &&
    typeof obj.completed === 'boolean' &&
    (typeof obj.archivedAt === 'string' || obj.archivedAt === null || typeof obj.archivedAt === 'undefined') &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Validate v1 planner data structure and version.
 */
export const isValidPlannerDataV1 = (value: unknown): value is PlannerData => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PlannerData>;
  return (
    data.version === PLANNER_DATA_VERSION &&
    Array.isArray(data.buckets) &&
    data.buckets.every(isValidBucketV1) &&
    Array.isArray(data.tasks) &&
    data.tasks.every(isValidTaskV1)
  );
};

// ============================================================================
// V2 VALIDATORS
// ============================================================================

/**
 * Validate priority value.
 */
export const isValidPriority = (value: unknown): value is Priority => {
  return value === 0 || value === 1 || value === 2 || value === 3;
};

/**
 * Validate resource tag (must be non-empty after trim).
 */
export const isValidResourceTag = (value: unknown): value is ResourceTag => {
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * Validate project object.
 */
export const isValidProject = (value: unknown): value is Project => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<Project>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isValidPriority(obj.priority) &&
    typeof obj.pinned === 'boolean' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Validate bucket template definition.
 */
export const isValidBucketTemplateDefinition = (value: unknown): value is BucketTemplateDefinition => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<BucketTemplateDefinition>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isValidPriority(obj.priority) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Validate v2 bucket.
 */
export const isValidBucketV2 = (value: unknown): value is BucketV2 => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<BucketV2>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.projectId === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    (typeof obj.templateDefinitionId === 'string' || obj.templateDefinitionId === null) &&
    isValidPriority(obj.priority) &&
    typeof obj.pinned === 'boolean' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Validate v2 task.
 */
export const isValidTaskV2 = (value: unknown): value is PlannerTaskV2 => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<PlannerTaskV2>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.projectId === 'string' &&
    (typeof obj.bucketId === 'string' || obj.bucketId === null) &&
    typeof obj.title === 'string' &&
    typeof obj.description === 'string' &&
    isValidPriority(obj.priority) &&
    Array.isArray(obj.resourceTags) &&
    obj.resourceTags.every(isValidResourceTag) &&
    typeof obj.pinned === 'boolean' &&
    typeof obj.completed === 'boolean' &&
    (typeof obj.archivedAt === 'string' || obj.archivedAt === null) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Validate v2 planner data structure and version.
 */
export const isValidPlannerDataV2 = (value: unknown): value is PlannerDataV2 => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PlannerDataV2>;
  return (
    data.version === PLANNER_DATA_V2_VERSION &&
    Array.isArray(data.projects) &&
    data.projects.every(isValidProject) &&
    Array.isArray(data.buckets) &&
    data.buckets.every(isValidBucketV2) &&
    Array.isArray(data.tasks) &&
    data.tasks.every(isValidTaskV2) &&
    Array.isArray(data.templateDefinitions) &&
    data.templateDefinitions.every(isValidBucketTemplateDefinition)
  );
};

// ============================================================================
// V2 RELATIONAL INTEGRITY VALIDATORS
// ============================================================================

/**
 * Validate v2 data has at least one project (should include default project).
 */
export const validateProjectsExist = (data: PlannerDataV2): void => {
  if (data.projects.length === 0) {
    throw new Error('v2 data must contain at least one project');
  }
};

/**
 * Validate no duplicate IDs across all entities.
 */
export const validateNoDuplicateIds = (data: PlannerDataV2): void => {
  const allIds = new Set<string>();
  
  for (const project of data.projects) {
    if (allIds.has(project.id)) throw new Error(`Duplicate project ID: ${project.id}`);
    allIds.add(project.id);
  }
  
  for (const bucket of data.buckets) {
    if (allIds.has(bucket.id)) throw new Error(`Duplicate bucket ID: ${bucket.id}`);
    allIds.add(bucket.id);
  }
  
  for (const task of data.tasks) {
    if (allIds.has(task.id)) throw new Error(`Duplicate task ID: ${task.id}`);
    allIds.add(task.id);
  }
  
  for (const def of data.templateDefinitions) {
    if (allIds.has(def.id)) throw new Error(`Duplicate template definition ID: ${def.id}`);
    allIds.add(def.id);
  }
};

/**
 * Validate all buckets reference existing projects.
 */
export const validateBucketsReferenceProjects = (data: PlannerDataV2): void => {
  const projectIds = new Set(data.projects.map(p => p.id));
  
  for (const bucket of data.buckets) {
    if (!projectIds.has(bucket.projectId)) {
      throw new Error(`Bucket ${bucket.id} references missing project ${bucket.projectId}`);
    }
  }
};

/**
 * Validate all tasks reference existing projects.
 */
export const validateTasksReferenceProjects = (data: PlannerDataV2): void => {
  const projectIds = new Set(data.projects.map(p => p.id));
  
  for (const task of data.tasks) {
    if (!projectIds.has(task.projectId)) {
      throw new Error(`Task ${task.id} references missing project ${task.projectId}`);
    }
  }
};

/**
 * Validate all tasks with bucketId reference buckets in the same project.
 */
export const validateTasksReferenceBucketsInSameProject = (data: PlannerDataV2): void => {
  const bucketsByProject = new Map<string, Set<string>>();
  
  for (const bucket of data.buckets) {
    if (!bucketsByProject.has(bucket.projectId)) {
      bucketsByProject.set(bucket.projectId, new Set());
    }
    bucketsByProject.get(bucket.projectId)!.add(bucket.id);
  }
  
  for (const task of data.tasks) {
    if (task.bucketId !== null) {
      const bucketsInProject = bucketsByProject.get(task.projectId);
      if (!bucketsInProject || !bucketsInProject.has(task.bucketId)) {
        throw new Error(
          `Task ${task.id} references bucket ${task.bucketId} not in its project ${task.projectId}`
        );
      }
    }
  }
};

/**
 * Validate all template definition references are valid.
 */
export const validateTemplateReferences = (data: PlannerDataV2): void => {
  const templateIds = new Set(data.templateDefinitions.map(t => t.id));
  
  for (const bucket of data.buckets) {
    if (bucket.templateDefinitionId !== null && !templateIds.has(bucket.templateDefinitionId)) {
      throw new Error(
        `Bucket ${bucket.id} references missing template definition ${bucket.templateDefinitionId}`
      );
    }
  }
};

/**
 * Run all v2 data integrity validators.
 */
export const validatePlannerDataV2Integrity = (data: PlannerDataV2): void => {
  validateProjectsExist(data);
  validateNoDuplicateIds(data);
  validateBucketsReferenceProjects(data);
  validateTasksReferenceProjects(data);
  validateTasksReferenceBucketsInSameProject(data);
  validateTemplateReferences(data);
};
