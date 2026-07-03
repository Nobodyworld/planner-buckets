import { describe, expect, it } from 'vitest';
import type { PlannerData } from '../types';
import type { BucketV2, PlannerDataV2, PlannerTaskV2 } from '../types/v2';
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
    templates: [
        {
            id: 'template-current',
            name: 'Current Template',
            description: '',
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
    templateDefinitions: [
        {
            id: 'definition-current',
            templateId: 'template-current',
            name: 'Current Definition',
            description: '',
            priority: 0,
            defaultActive: true,
            position: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
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

    it('rejects malformed v2 imports with duplicate linked buckets in one project', () => {
        const malformed: PlannerDataV2 = {
            ...createCurrentV2(),
            buckets: [
                {
                    id: 'bucket-linked-1',
                    projectId: 'project-current',
                    name: 'Ready Lane A',
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
                {
                    id: 'bucket-linked-2',
                    projectId: 'project-current',
                    name: 'Ready Lane B',
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
        };

        expect(() => coercePlannerDataToV2(malformed)).toThrow('Selected file is not a valid planner export.');
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

    it('preserves copied bucket templateDefinitionId only when it exists locally', () => {
        const current = createCurrentV2();
        const incoming: PlannerDataV2 = {
            ...createCurrentV2(),
            projects: [
                {
                    id: 'incoming-project',
                    name: 'Incoming',
                    description: '',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            buckets: [
                {
                    id: 'incoming-known',
                    projectId: 'incoming-project',
                    name: 'Known Link',
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
                {
                    id: 'incoming-missing',
                    projectId: 'incoming-project',
                    name: 'Missing Link',
                    description: '',
                    templateDefinitionId: 'definition-incoming-only',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            tasks: [],
            templates: [
                ...current.templates,
                {
                    id: 'template-incoming-only',
                    name: 'Incoming Only',
                    description: '',
                    active: true,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            templateDefinitions: [
                ...current.templateDefinitions,
                {
                    id: 'definition-incoming-only',
                    templateId: 'template-incoming-only',
                    name: 'Incoming Only',
                    description: '',
                    priority: 0,
                    defaultActive: true,
                    position: 0,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
        };

        const result = mergeUploadedPlannerDataV2(current, incoming, {
            targetProjectId: 'project-current',
            createUniqueId: (() => {
                const ids = ['bucket-known-copy', 'bucket-missing-copy'];
                return () => ids.shift() ?? 'fallback-id';
            })(),
        });

        expect(result.data.buckets.find((bucket) => bucket.id === 'bucket-known-copy')?.templateDefinitionId).toBe('definition-current');
        expect(result.data.buckets.find((bucket) => bucket.id === 'bucket-missing-copy')?.templateDefinitionId).toBeNull();
        expect(result.data.templates).toEqual(current.templates);
        expect(result.data.templateDefinitions).toEqual(current.templateDefinitions);
    });

    it('maps same definition with different bucket name to existing linked bucket', () => {
        const current = createCurrentV2();
        // Add a bucket linked to definition-current
        const existingLinkedBucket: BucketV2 = {
            id: 'bucket-existing-linked',
            projectId: 'project-current',
            name: 'Ready',
            description: '',
            templateDefinitionId: 'definition-current',
            priority: 0,
            pinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const currentWithLinked = {
            ...current,
            buckets: [...current.buckets, existingLinkedBucket],
        };

        const incoming: PlannerDataV2 = {
            ...current,
            buckets: [
                {
                    id: 'incoming-bucket',
                    projectId: 'project-current',
                    name: 'Different Name', // Different name but same definition
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            tasks: [],
        };

        const result = mergeUploadedPlannerDataV2(currentWithLinked, incoming, {
            targetProjectId: 'project-current',
        });

        expect(result.mergedIntoExistingBucketCount).toBe(1);
        expect(result.createdBucketCount).toBe(0);
        expect(result.data.buckets.filter((b) => b.projectId === 'project-current' && b.templateDefinitionId === 'definition-current')).toHaveLength(1);
    });

    it('creates new linked bucket if definition exists but no bucket exists for it yet', () => {
        const current = createCurrentV2();
        // No existing bucket for definition-current

        const incoming: PlannerDataV2 = {
            ...current,
            buckets: [
                {
                    id: 'incoming-bucket',
                    projectId: 'project-current',
                    name: 'New Ready',
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            tasks: [],
        };

        const result = mergeUploadedPlannerDataV2(current, incoming, {
            targetProjectId: 'project-current',
            createUniqueId: () => 'bucket-created-for-definition',
        });

        expect(result.createdBucketCount).toBe(1);
        expect(result.data.buckets.find((b) => b.id === 'bucket-created-for-definition')?.templateDefinitionId).toBe('definition-current');
    });

    it('remaps tasks to existing linked bucket when merging same definition', () => {
        const current = createCurrentV2();
        const existingBucket: BucketV2 = {
            id: 'bucket-existing',
            projectId: 'project-current',
            name: 'Ready',
            description: '',
            templateDefinitionId: 'definition-current',
            priority: 0,
            pinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const currentWithBucket = {
            ...current,
            buckets: [...current.buckets, existingBucket],
        };

        const incomingBucket: BucketV2 = {
            id: 'bucket-incoming',
            projectId: 'project-current',
            name: 'Different Name',
            description: '',
            templateDefinitionId: 'definition-current',
            priority: 0,
            pinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const incomingTask: PlannerTaskV2 = {
            id: 'task-incoming',
            projectId: 'project-current',
            bucketId: 'bucket-incoming',
            title: 'Incoming task',
            description: '',
            completed: false,
            archivedAt: null,
            priority: 0,
            pinned: false,
            resourceTags: [],
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const incoming: PlannerDataV2 = {
            version: PLANNER_DATA_V2_VERSION,
            projects: current.projects,
            templates: current.templates,
            templateDefinitions: current.templateDefinitions,
            buckets: [incomingBucket],
            tasks: [incomingTask],
        };

        const result = mergeUploadedPlannerDataV2(currentWithBucket, incoming, {
            targetProjectId: 'project-current',
        });

        // Should map incoming bucket to existing bucket with same definition
        expect(result.mergedIntoExistingBucketCount).toBe(1);
        expect(result.createdBucketCount).toBe(0);
        // Task should be remapped to existing bucket
        const uploadedTask = result.data.tasks.find((t) => t.projectId === 'project-current' && t.title === 'Incoming task');
        expect(uploadedTask?.bucketId).toBe('bucket-existing');
    });

    it('prevents duplicate linked buckets in target project during merge', () => {
        const current = createCurrentV2();
        const existingBucket: BucketV2 = {
            id: 'bucket-existing',
            projectId: 'project-current',
            name: 'Ready',
            description: '',
            templateDefinitionId: 'definition-current',
            priority: 0,
            pinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const currentWithBucket = {
            ...current,
            buckets: [...current.buckets, existingBucket],
        };

        const incoming: PlannerDataV2 = {
            ...createCurrentV2(),
            projects: [
                {
                    id: 'incoming-project-1',
                    name: 'Incoming 1',
                    description: '',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
                {
                    id: 'incoming-project-2',
                    name: 'Incoming 2',
                    description: '',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            buckets: [
                {
                    id: 'bucket-incoming-1',
                    projectId: 'incoming-project-1',
                    name: 'Ready v1',
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
                {
                    id: 'bucket-incoming-2',
                    projectId: 'incoming-project-2',
                    name: 'Ready v2',
                    description: '',
                    templateDefinitionId: 'definition-current',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            tasks: [],
        };

        const result = mergeUploadedPlannerDataV2(currentWithBucket, incoming, {
            targetProjectId: 'project-current',
        });

        // Both incoming buckets should map to the existing bucket, not create new ones
        expect(result.mergedIntoExistingBucketCount).toBe(2);
        expect(result.createdBucketCount).toBe(0);
        expect(result.data.buckets.filter((b) => b.projectId === 'project-current' && b.templateDefinitionId === 'definition-current')).toHaveLength(1);
    });

    it('uses same definition in different projects', () => {
        const current: PlannerDataV2 = {
            version: PLANNER_DATA_V2_VERSION,
            projects: [
                {
                    id: 'project-a',
                    name: 'Project A',
                    description: '',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
                {
                    id: 'project-b',
                    name: 'Project B',
                    description: '',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            buckets: [
                {
                    id: 'bucket-a',
                    projectId: 'project-a',
                    name: 'Ready',
                    description: '',
                    templateDefinitionId: 'definition-ready',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            tasks: [],
            templates: [
                {
                    id: 'template-shared',
                    name: 'Shared',
                    description: '',
                    active: true,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
            templateDefinitions: [
                {
                    id: 'definition-ready',
                    templateId: 'template-shared',
                    name: 'Ready',
                    description: '',
                    priority: 0,
                    defaultActive: true,
                    position: 0,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
        };

        const incoming: PlannerDataV2 = {
            ...current,
            buckets: [
                {
                    id: 'bucket-incoming',
                    projectId: 'project-b',
                    name: 'Ready',
                    description: '',
                    templateDefinitionId: 'definition-ready',
                    priority: 0,
                    pinned: false,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
        };

        const result = mergeUploadedPlannerDataV2(current, incoming, {
            targetProjectId: 'project-b',
            createUniqueId: () => 'bucket-b-ready',
        });

        // Should create a new bucket for project-b even though project-a has the same definition
        expect(result.createdBucketCount).toBe(1);
        expect(result.data.buckets.filter((b) => b.templateDefinitionId === 'definition-ready')).toHaveLength(2);
        expect(result.data.buckets.find((b) => b.id === 'bucket-b-ready')?.projectId).toBe('project-b');
    });
});
