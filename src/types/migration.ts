/**
 * Deterministic v1→v2 migration: pure function with no side effects.
 * Input immutability guaranteed; output identical for identical input.
 * 
 * Timestamp derivation rule:
 * - createdAt: earliest timestamp from all v1 buckets and tasks
 * - updatedAt: latest timestamp from all v1 buckets and tasks
 * - fallback: MIGRATION_FALLBACK_TIMESTAMP if no timestamps found
 */

import type { PlannerData } from '../types';
import type { PlannerDataV2, BucketV2, PlannerTaskV2, Priority, ResourceTag } from './v2';
import { PLANNER_DATA_V2_VERSION, DEFAULT_PROJECT_ID, MIGRATION_FALLBACK_TIMESTAMP } from './v2';
import { isValidPlannerDataV1, validatePlannerDataV2Integrity } from './validators';

/**
 * Derive deterministic migration timestamps from v1 data.
 * 
 * Rules:
 * - createdAt: earliest valid timestamp across all buckets and tasks
 * - updatedAt: latest valid timestamp across all buckets and tasks
 * - fallback: MIGRATION_FALLBACK_TIMESTAMP if no timestamps found
 * 
 * Returns [createdAt, updatedAt]
 */
export const deriveMigrationTimestamps = (
    buckets: Array<{ createdAt: string }>,
    tasks: Array<{ createdAt: string; updatedAt: string; archivedAt: string | null }>,
): [string, string] => {
    const allTimestamps: string[] = [];

    for (const bucket of buckets) {
        if (typeof bucket.createdAt === 'string' && bucket.createdAt.length > 0) {
            allTimestamps.push(bucket.createdAt);
        }
    }

    for (const task of tasks) {
        if (typeof task.createdAt === 'string' && task.createdAt.length > 0) {
            allTimestamps.push(task.createdAt);
        }
        if (typeof task.updatedAt === 'string' && task.updatedAt.length > 0) {
            allTimestamps.push(task.updatedAt);
        }
        if (typeof task.archivedAt === 'string' && task.archivedAt.length > 0) {
            allTimestamps.push(task.archivedAt);
        }
    }

    if (allTimestamps.length === 0) {
        return [MIGRATION_FALLBACK_TIMESTAMP, MIGRATION_FALLBACK_TIMESTAMP];
    }

    // Sort timestamps to find min and max
    allTimestamps.sort();
    const createdAt = allTimestamps[0];
    const updatedAt = allTimestamps[allTimestamps.length - 1];

    return [createdAt, updatedAt];
};

/**
 * Normalize resource tags: trim, lowercase, deduplicate, sort.
 * Returns deterministic, normalized array.
 */
export const normalizeResourceTags = (tags: unknown[]): ResourceTag[] => {
    if (!Array.isArray(tags)) return [];

    const normalized = new Set<string>();

    for (const tag of tags) {
        if (typeof tag === 'string') {
            const trimmed = tag.trim().toLowerCase();
            if (trimmed.length > 0) {
                normalized.add(trimmed);
            }
        }
    }

    // Return sorted for deterministic ordering
    return Array.from(normalized)
        .sort()
        .map(tag => tag as ResourceTag);
};

/**
 * Migrate v1 planner data to v2.
 *
 * Migration rules:
 * - Create one default project with deterministic timestamps derived from v1 data
 * - Place all existing buckets in the default project
 * - Place all existing tasks in the default project
 * - Preserve bucket IDs, task IDs, names, descriptions, timestamps
 * - Preserve completion, pinning, ordering, archive state
 * - Tasks with bucketId: null remain unassigned
 * - Initialize priority fields to 0
 * - Initialize resource tags to []
 * - Initialize template references to null
 * - Initialize templates and templateDefinitions to empty arrays
 *
 * Determinism guarantee: Same v1 input → same v2 output
 * Immutability guarantee: Input data not modified
 * Clock independence: No runtime clock access (new Date() not used)
 */
export const migrateV1toV2 = (v1Data: PlannerData): PlannerDataV2 => {
    // Validate input is valid v1 data
    if (!isValidPlannerDataV1(v1Data)) {
        throw new Error('Input is not valid v1 planner data');
    }

    // Derive deterministic project timestamps from v1 data
    const [projectCreatedAt, projectUpdatedAt] = deriveMigrationTimestamps(v1Data.buckets, v1Data.tasks);

    // Create default project with deterministic timestamps
    const defaultProject = {
        id: DEFAULT_PROJECT_ID,
        name: 'My Planner',
        description: 'Migrated from v1',
        priority: 0 as Priority,
        pinned: true,
        createdAt: projectCreatedAt,
        updatedAt: projectUpdatedAt,
    };

    // Migrate v1 buckets to v2 buckets in default project
    const migratedBuckets: BucketV2[] = v1Data.buckets.map(v1Bucket => ({
        id: v1Bucket.id,
        projectId: DEFAULT_PROJECT_ID,
        name: v1Bucket.name,
        description: '', // v1 buckets don't have descriptions
        templateDefinitionId: null,
        priority: 0 as Priority, // Default priority
        pinned: v1Bucket.pinned,
        createdAt: v1Bucket.createdAt,
        updatedAt: v1Bucket.createdAt, // v1 doesn't track updatedAt for buckets
    }));

    // Migrate v1 tasks to v2 tasks in default project
    const migratedTasks: PlannerTaskV2[] = v1Data.tasks.map(v1Task => ({
        id: v1Task.id,
        projectId: DEFAULT_PROJECT_ID,
        bucketId: v1Task.bucketId, // Preserve null for unassigned
        title: v1Task.title,
        description: v1Task.description,
        priority: 0 as Priority, // Default priority
        resourceTags: normalizeResourceTags([]), // Empty tags for all v1 tasks
        pinned: typeof v1Task.pinned === 'boolean' ? v1Task.pinned : false,
        completed: v1Task.completed,
        archivedAt: typeof v1Task.archivedAt === 'string' ? v1Task.archivedAt : null,
        createdAt: v1Task.createdAt,
        updatedAt: v1Task.updatedAt,
    }));

    // Build v2 data
    const v2Data: PlannerDataV2 = {
        version: PLANNER_DATA_V2_VERSION,
        projects: [defaultProject],
        buckets: migratedBuckets,
        tasks: migratedTasks,
        templates: [],
        templateDefinitions: [],
    };

    // Validate integrity before returning
    validatePlannerDataV2Integrity(v2Data);

    return v2Data;
};

/**
 * Detect whether data is v1 or v2 based on version field.
 */
export const detectPlannerVersion = (data: unknown): 1 | 2 | 'unknown' => {
    if (!data || typeof data !== 'object') return 'unknown';
    const obj = data as Partial<{ version: unknown }>;

    if (obj.version === 1) return 1;
    if (obj.version === 2) return 2;
    return 'unknown';
};
