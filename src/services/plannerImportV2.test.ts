import { describe, expect, it } from 'vitest';
import type { PlannerData } from '../types';
import type { PlannerDataV2 } from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import { coercePlannerDataToV2, mergeUploadedPlannerDataV2 } from './plannerImport';

const timestamp = '2026-07-01T00:00:00.000Z';

const createCurrentV2 = (): PlannerDataV2 => ({
    version: PLANNER_DATA_V2_VERSION,
    projects: [
        {
            id: 'project-current',
            name: 'Current',
            description: '',
            priority: 0,
            pinned: true,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
    buckets: [
        {
            id: 'bucket-current',
            projectId: 'project-current',
            name: 'Current Bucket',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
    tasks: [],
    templates: [],
    templateDefinitions: [],
});

const createV1Upload = (): PlannerData => ({
    version: 1,
    buckets: [
        { id: 'bucket-v1', name: 'Imported', createdAt: timestamp, pinned: false },
    ],
    tasks: [
        {
            id: 'task-v1',
            title: 'Imported task',
            description: '',
            bucketId: 'bucket-v1',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
});

describe('plannerImport v2 compatibility', () => {
    it('accepts valid v2 planner data unchanged', () => {
        const current = createCurrentV2();
        const result = coercePlannerDataToV2(current);

        expect(result.sourceVersion).toBe(2);
        expect(result.data).toEqual(current);
    });

    it('accepts valid v1 planner data by migrating it to v2', () => {
        const result = coercePlannerDataToV2(createV1Upload());

        expect(result.sourceVersion).toBe(1);
        expect(result.data.version).toBe(2);
        expect(result.data.projects).toHaveLength(1);
        expect(result.data.tasks[0].projectId).toBe(result.data.projects[0].id);
    });

    it('rejects invalid imports without producing replacement data', () => {
        expect(() => coercePlannerDataToV2({ version: 2, projects: [], buckets: [], tasks: [] })).toThrow(
            'Selected file is not a valid planner export.',
        );
    });

    it('merges migrated v1 data into the target v2 project', () => {
        const current = createCurrentV2();
        const incoming = coercePlannerDataToV2(createV1Upload()).data;
        const result = mergeUploadedPlannerDataV2(current, incoming, {
            targetProjectId: 'project-current',
            createUniqueId: (() => {
                const ids = ['bucket-imported', 'task-imported'];
                return () => ids.shift() ?? 'fallback-id';
            })(),
        });

        expect(result.createdBucketCount).toBe(1);
        expect(result.uploadedTaskIds).toEqual(['task-imported']);
        expect(result.data.buckets.find((bucket) => bucket.id === 'bucket-imported')?.projectId).toBe('project-current');
        expect(result.data.tasks.find((task) => task.id === 'task-imported')?.bucketId).toBe('bucket-imported');
        expect(current.buckets).toHaveLength(1);
    });
});
