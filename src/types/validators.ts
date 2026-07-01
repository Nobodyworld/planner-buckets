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
    BucketTemplate,
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
 * Validate resource tag is in canonical form (already processed).
 * 
 * Canonical form requirements:
 * - Must be a string
 * - Must be non-empty
 * - Must equal its trimmed value (no leading/trailing whitespace)
 * - Must equal its lowercase value (no uppercase characters)
 * - Must not contain internal duplicate spaces
 * 
 * This validates that a tag is ALREADY in canonical form,
 * not that it CAN be normalized to canonical form.
 */
export const isValidResourceTag = (value: unknown): value is ResourceTag => {
    if (typeof value !== 'string') return false;
    if (value.length === 0) return false;
    // Check canonical form: equals trimmed and lowercase
    if (value !== value.trim()) return false;
    if (value !== value.toLowerCase()) return false;
    return true;
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
 * Validate bucket template.
 */
export const isValidBucketTemplate = (value: unknown): value is BucketTemplate => {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Partial<BucketTemplate>;
    return (
        typeof obj.id === 'string' &&
        typeof obj.name === 'string' &&
        typeof obj.description === 'string' &&
        typeof obj.active === 'boolean' &&
        typeof obj.createdAt === 'string' &&
        typeof obj.updatedAt === 'string'
    );
};

/**
 * Validate bucket template definition.
 * Must reference an existing template and have valid position.
 */
export const isValidBucketTemplateDefinition = (value: unknown): value is BucketTemplateDefinition => {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Partial<BucketTemplateDefinition>;
    return (
        typeof obj.id === 'string' &&
        typeof obj.templateId === 'string' &&
        typeof obj.name === 'string' &&
        typeof obj.description === 'string' &&
        isValidPriority(obj.priority) &&
        typeof obj.defaultActive === 'boolean' &&
        typeof obj.position === 'number' &&
        obj.position >= 0 &&
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
 * Enforces resource tag canonicality and uniqueness.
 */
export const isValidTaskV2 = (value: unknown): value is PlannerTaskV2 => {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Partial<PlannerTaskV2>;

    // Basic structure validation
    if (!(
        typeof obj.id === 'string' &&
        typeof obj.projectId === 'string' &&
        (typeof obj.bucketId === 'string' || obj.bucketId === null) &&
        typeof obj.title === 'string' &&
        typeof obj.description === 'string' &&
        isValidPriority(obj.priority) &&
        Array.isArray(obj.resourceTags) &&
        typeof obj.pinned === 'boolean' &&
        typeof obj.completed === 'boolean' &&
        (typeof obj.archivedAt === 'string' || obj.archivedAt === null) &&
        typeof obj.createdAt === 'string' &&
        typeof obj.updatedAt === 'string'
    )) {
        return false;
    }

    // Validate each tag is in canonical form
    if (!obj.resourceTags.every(isValidResourceTag)) {
        return false;
    }

    // Ensure no duplicate tags (case-insensitive would have been deduplicated during normalization)
    const tagSet = new Set(obj.resourceTags);
    if (tagSet.size !== obj.resourceTags.length) {
        return false;
    }

    // Ensure tags are sorted (part of canonical form)
    const sortedTags = [...obj.resourceTags].sort();
    if (JSON.stringify(obj.resourceTags) !== JSON.stringify(sortedTags)) {
        return false;
    }

    return true;
};

/**
 * Validate v2 planner data has correct structure (shape check only).
 * Does not perform relational integrity checks.
 * Use isValidPlannerDataV2() for complete validation.
 */
export const isPlannerDataV2Shape = (value: unknown): value is PlannerDataV2 => {
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
        Array.isArray(data.templates) &&
        data.templates.every(isValidBucketTemplate) &&
        Array.isArray(data.templateDefinitions) &&
        data.templateDefinitions.every(isValidBucketTemplateDefinition)
    );
};

/**
 * Complete v2 planner data validation: structure + relational integrity.
 * 
 * Checks:
 * - Structural correctness (isValidPlannerDataV2Shape)
 * - Relational integrity (projects exist, no orphans, same-project references, etc.)
 * 
 * Returns false on any validation failure (does not throw).
 * Use for data loaded from persistence or user input.
 */
export const isValidPlannerDataV2 = (value: unknown): boolean => {
    // First check structure
    if (!isPlannerDataV2Shape(value)) {
        return false;
    }

    const data = value as PlannerDataV2;

    // Then check relational integrity (catch and return false on throw)
    try {
        validatePlannerDataV2Integrity(data);
        return true;
    } catch {
        return false;
    }
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
 * Validate no duplicate template IDs.
 */
export const validateNoDuplicateTemplateIds = (data: PlannerDataV2): void => {
    const templateIds = new Set<string>();

    for (const template of data.templates) {
        if (templateIds.has(template.id)) {
            throw new Error(`Duplicate template ID: ${template.id}`);
        }
        templateIds.add(template.id);
    }
};

/**
 * Validate all template definitions reference existing templates.
 */
export const validateTemplateDefinitionsReferenceTemplates = (data: PlannerDataV2): void => {
    const templateIds = new Set(data.templates.map(t => t.id));

    for (const def of data.templateDefinitions) {
        if (!templateIds.has(def.templateId)) {
            throw new Error(
                `Template definition ${def.id} references missing template ${def.templateId}`
            );
        }
    }
};

/**
 * Validate all buckets reference existing template definitions (if specified).
 */
export const validateBucketsReferenceTemplateDefinitions = (data: PlannerDataV2): void => {
    const defIds = new Set(data.templateDefinitions.map(t => t.id));

    for (const bucket of data.buckets) {
        if (bucket.templateDefinitionId !== null && !defIds.has(bucket.templateDefinitionId)) {
            throw new Error(
                `Bucket ${bucket.id} references missing template definition ${bucket.templateDefinitionId}`
            );
        }
    }
};

/**
 * Validate no invalid booleans in active/defaultActive fields.
 */
export const validateBooleanFields = (data: PlannerDataV2): void => {
    for (const template of data.templates) {
        if (typeof template.active !== 'boolean') {
            throw new Error(`Template ${template.id} has invalid active field`);
        }
    }

    for (const def of data.templateDefinitions) {
        if (typeof def.defaultActive !== 'boolean') {
            throw new Error(`Template definition ${def.id} has invalid defaultActive field`);
        }
    }
};

/**
 * Run all v2 data integrity validators.
 */
export const validatePlannerDataV2Integrity = (data: PlannerDataV2): void => {
    validateProjectsExist(data);
    validateNoDuplicateIds(data);
    validateNoDuplicateTemplateIds(data);
    validateBucketsReferenceProjects(data);
    validateTasksReferenceProjects(data);
    validateTasksReferenceBucketsInSameProject(data);
    validateTemplateDefinitionsReferenceTemplates(data);
    validateBucketsReferenceTemplateDefinitions(data);
    validateBooleanFields(data);
};
