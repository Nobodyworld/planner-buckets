import type { Bucket, PlannerData, PlannerTask } from '../types';
import { createId } from '../storage/plannerStorage';

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
