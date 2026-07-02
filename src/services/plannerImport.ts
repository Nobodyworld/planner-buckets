import type { Bucket, PlannerData, PlannerTask } from '../types';
import type { BucketV2, PlannerDataV2, PlannerTaskV2 } from '../types/v2';
import { createId } from '../storage/plannerStorage';
import { detectPlannerVersion, migrateV1toV2 } from '../types/migration';
import { isValidPlannerDataV1, isValidPlannerDataV2, validatePlannerDataV2Integrity } from '../types/validators';

/**
 * Normalize bucket name for comparison (trim and lowercase).
 */
const normalizeBucketName = (name: string): string => name.trim().toLowerCase();

/**
 * Create a duplicate detection key for a task within a bucket.
 * Format: "bucketId::title::description"
 */
const createTaskDuplicateKey = (
    task: Pick<PlannerTask, 'title' | 'description'>,
    bucketId: string | null,
): string => `${bucketId ?? 'unassigned'}::${task.title.trim().toLowerCase()}::${task.description.trim().toLowerCase()}`;

/**
 * Result of a merge operation.
 */
export interface MergeResult {
    data: PlannerData;
    createdBucketCount: number;
    mergedIntoExistingBucketCount: number;
    skippedDuplicateCount: number;
    uploadedTaskIds: string[];
}

export interface PlannerDataImportResult {
    data: PlannerDataV2;
    sourceVersion: 1 | 2;
}

export interface MergeResultV2 {
    data: PlannerDataV2;
    createdBucketCount: number;
    mergedIntoExistingBucketCount: number;
    skippedDuplicateCount: number;
    uploadedTaskIds: string[];
}

interface MergeUploadedPlannerDataV2Options {
    targetProjectId: string;
    createUniqueId?: () => string;
}

/**
 * Merge incoming planner data into current state.
 *
 * Strategy:
 * - Match incoming buckets to existing buckets by normalized name
 * - If a match exists, use existing bucket ID and skip creating new bucket
 * - If no match, create new bucket with new ID
 * - For each incoming task, check if duplicate exists (by title + description + bucketId)
 * - If duplicate, skip; otherwise create new task with new ID
 */
export const mergeUploadedPlannerData = (current: PlannerData, incoming: PlannerData): MergeResult => {
    const bucketIdMap = new Map<string, string | null>();
    const bucketsByName = new Map<string, Bucket>();

    // Index current buckets by normalized name
    current.buckets.forEach((bucket) => {
        bucketsByName.set(normalizeBucketName(bucket.name), bucket);
    });

    const mergedBuckets = [...current.buckets];
    let createdBucketCount = 0;
    let mergedIntoExistingBucketCount = 0;

    // Process incoming buckets
    incoming.buckets.forEach((bucket) => {
        const normalizedName = normalizeBucketName(bucket.name) || 'untitled bucket';
        const existingBucket = bucketsByName.get(normalizedName) ?? null;

        if (existingBucket) {
            bucketIdMap.set(bucket.id, existingBucket.id);
            mergedIntoExistingBucketCount += 1;
            return;
        }

        const mergedBucket: Bucket = {
            ...bucket,
            id: createId(),
            name: bucket.name.trim() || 'Untitled bucket',
        };

        bucketIdMap.set(bucket.id, mergedBucket.id);
        bucketsByName.set(normalizedName, mergedBucket);
        mergedBuckets.push(mergedBucket);
        createdBucketCount += 1;
    });

    // Build set of existing task keys for duplicate detection
    const existingTaskKeys = new Set(
        current.tasks.map((task) => createTaskDuplicateKey(task, task.bucketId)),
    );

    const mergedTasks = [...current.tasks];
    const uploadedTaskIds: string[] = [];
    let skippedDuplicateCount = 0;

    // Process incoming tasks
    incoming.tasks.forEach((task) => {
        const mergedBucketId = task.bucketId
            ? bucketIdMap.get(task.bucketId) ?? null
            : null;
        const duplicateKey = createTaskDuplicateKey(task, mergedBucketId);

        if (existingTaskKeys.has(duplicateKey)) {
            skippedDuplicateCount += 1;
            return;
        }

        const uploadedTask: PlannerTask = {
            ...task,
            id: createId(),
            bucketId: mergedBucketId,
            title: task.title.trim() || 'Untitled task',
            description: task.description.trim(),
        };

        mergedTasks.push(uploadedTask);
        uploadedTaskIds.push(uploadedTask.id);
        existingTaskKeys.add(duplicateKey);
    });

    return {
        data: {
            version: current.version,
            buckets: mergedBuckets,
            tasks: mergedTasks,
        },
        createdBucketCount,
        mergedIntoExistingBucketCount,
        skippedDuplicateCount,
        uploadedTaskIds,
    };
};

const createTaskDuplicateKeyV2 = (
    task: Pick<PlannerTaskV2, 'title' | 'description'>,
    bucketId: string | null,
): string => `${bucketId ?? 'unassigned'}::${task.title.trim().toLowerCase()}::${task.description.trim().toLowerCase()}`;

const collectPlannerDataV2Ids = (data: PlannerDataV2): Set<string> => new Set([
    ...data.projects.map((project) => project.id),
    ...data.buckets.map((bucket) => bucket.id),
    ...data.tasks.map((task) => task.id),
    ...data.templates.map((template) => template.id),
    ...data.templateDefinitions.map((definition) => definition.id),
]);

const createUniquePlannerId = (existingIds: Set<string>, createUniqueId: () => string): string => {
    let id = createUniqueId();
    while (existingIds.has(id)) {
        id = createUniqueId();
    }
    existingIds.add(id);
    return id;
};

export const coercePlannerDataToV2 = (value: unknown): PlannerDataImportResult => {
    const version = detectPlannerVersion(value);

    if (version === 2 && isValidPlannerDataV2(value)) {
        return { data: value as PlannerDataV2, sourceVersion: 2 };
    }

    if (version === 1 && isValidPlannerDataV1(value)) {
        const migrated = migrateV1toV2(value);
        validatePlannerDataV2Integrity(migrated);
        return { data: migrated, sourceVersion: 1 };
    }

    throw new Error('Selected file is not a valid planner export.');
};

export const mergeUploadedPlannerDataV2 = (
    current: PlannerDataV2,
    incoming: PlannerDataV2,
    options: MergeUploadedPlannerDataV2Options,
): MergeResultV2 => {
    const targetProject = current.projects.find((project) => project.id === options.targetProjectId) ?? null;
    if (!targetProject) {
        throw new Error(`Cannot merge into missing project: ${options.targetProjectId}`);
    }

    validatePlannerDataV2Integrity(current);
    validatePlannerDataV2Integrity(incoming);

    const createUniqueId = options.createUniqueId ?? createId;
    const existingIds = collectPlannerDataV2Ids(current);
    const bucketIdMap = new Map<string, string | null>();
    const currentProjectBuckets = current.buckets.filter((bucket) => bucket.projectId === options.targetProjectId);
    const bucketsByName = new Map<string, BucketV2>();
    const bucketsByDefinitionId = new Map<string, BucketV2>();
    const currentDefinitionIds = new Set(current.templateDefinitions.map((definition) => definition.id));

    currentProjectBuckets.forEach((bucket) => {
        bucketsByName.set(normalizeBucketName(bucket.name), bucket);
        if (bucket.templateDefinitionId !== null) {
            bucketsByDefinitionId.set(bucket.templateDefinitionId, bucket);
        }
    });

    const mergedBuckets = [...current.buckets];
    let createdBucketCount = 0;
    let mergedIntoExistingBucketCount = 0;

    incoming.buckets.forEach((bucket) => {
        // Priority 1: If incoming bucket references an existing definition, find existing bucket with that definition
        if (bucket.templateDefinitionId && currentDefinitionIds.has(bucket.templateDefinitionId)) {
            const existingDefinitionBucket = bucketsByDefinitionId.get(bucket.templateDefinitionId);
            if (existingDefinitionBucket) {
                bucketIdMap.set(bucket.id, existingDefinitionBucket.id);
                mergedIntoExistingBucketCount += 1;
                return;
            }
        }

        // Priority 2: Fall back to name-based matching
        const normalizedName = normalizeBucketName(bucket.name) || 'untitled bucket';
        const existingBucket = bucketsByName.get(normalizedName) ?? null;

        if (existingBucket) {
            bucketIdMap.set(bucket.id, existingBucket.id);
            mergedIntoExistingBucketCount += 1;
            return;
        }

        // Priority 3: Create new bucket
        const mergedBucket: BucketV2 = {
            ...bucket,
            id: createUniquePlannerId(existingIds, createUniqueId),
            projectId: options.targetProjectId,
            name: bucket.name.trim() || 'Untitled bucket',
            templateDefinitionId: bucket.templateDefinitionId && currentDefinitionIds.has(bucket.templateDefinitionId)
                ? bucket.templateDefinitionId
                : null,
        };

        bucketIdMap.set(bucket.id, mergedBucket.id);
        bucketsByName.set(normalizedName, mergedBucket);
        if (mergedBucket.templateDefinitionId !== null) {
            bucketsByDefinitionId.set(mergedBucket.templateDefinitionId, mergedBucket);
        }
        mergedBuckets.push(mergedBucket);
        createdBucketCount += 1;
    });

    const existingTaskKeys = new Set(
        current.tasks
            .filter((task) => task.projectId === options.targetProjectId)
            .map((task) => createTaskDuplicateKeyV2(task, task.bucketId)),
    );

    const mergedTasks = [...current.tasks];
    const uploadedTaskIds: string[] = [];
    let skippedDuplicateCount = 0;

    incoming.tasks.forEach((task) => {
        const mergedBucketId = task.bucketId
            ? bucketIdMap.get(task.bucketId) ?? null
            : null;
        const duplicateKey = createTaskDuplicateKeyV2(task, mergedBucketId);

        if (existingTaskKeys.has(duplicateKey)) {
            skippedDuplicateCount += 1;
            return;
        }

        const uploadedTask: PlannerTaskV2 = {
            ...task,
            id: createUniquePlannerId(existingIds, createUniqueId),
            projectId: options.targetProjectId,
            bucketId: mergedBucketId,
            title: task.title.trim() || 'Untitled task',
            description: task.description.trim(),
        };

        mergedTasks.push(uploadedTask);
        uploadedTaskIds.push(uploadedTask.id);
        existingTaskKeys.add(duplicateKey);
    });

    const data: PlannerDataV2 = {
        ...current,
        buckets: mergedBuckets,
        tasks: mergedTasks,
    };

    validatePlannerDataV2Integrity(data);

    return {
        data,
        createdBucketCount,
        mergedIntoExistingBucketCount,
        skippedDuplicateCount,
        uploadedTaskIds,
    };
};
