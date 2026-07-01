import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlannerData } from '../types';
import type { PlannerDataV2 } from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import {
    loadPlannerDataV2FromLocalStorage,
    PLANNER_STORAGE_KEY_V1,
    PLANNER_STORAGE_KEY_V2,
    savePlannerDataV2ToLocalStorage,
} from './plannerPersistence';

const timestamp = '2026-07-01T00:00:00.000Z';

const createV2Data = (): PlannerDataV2 => ({
    version: PLANNER_DATA_V2_VERSION,
    projects: [
        {
            id: 'project-a',
            name: 'Project A',
            description: '',
            priority: 0,
            pinned: true,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
    buckets: [
        {
            id: 'bucket-a',
            projectId: 'project-a',
            name: 'To Do',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: true,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
    tasks: [
        {
            id: 'task-a',
            projectId: 'project-a',
            bucketId: 'bucket-a',
            title: 'Task A',
            description: '',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
    templates: [],
    templateDefinitions: [],
});

const createV1Data = (): PlannerData => ({
    version: 1,
    buckets: [
        { id: 'bucket-v1', name: 'Legacy Bucket', createdAt: timestamp, pinned: true },
    ],
    tasks: [
        {
            id: 'task-v1',
            title: 'Legacy Task',
            description: 'Notes',
            bucketId: 'bucket-v1',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ],
});

describe('plannerPersistence v2 activation', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('loads completely valid v2 storage first', () => {
        const v2Data = createV2Data();
        localStorage.setItem(PLANNER_STORAGE_KEY_V2, JSON.stringify(v2Data));
        localStorage.setItem(PLANNER_STORAGE_KEY_V1, JSON.stringify(createV1Data()));

        const result = loadPlannerDataV2FromLocalStorage(() => timestamp);

        expect(result.source).toBe('v2');
        expect(result.warning).toBeNull();
        expect(result.data).toEqual(v2Data);
    });

    it('migrates valid v1 storage and preserves the original v1 key', () => {
        const v1Data = createV1Data();
        const rawV1 = JSON.stringify(v1Data);
        localStorage.setItem(PLANNER_STORAGE_KEY_V1, rawV1);

        const result = loadPlannerDataV2FromLocalStorage(() => timestamp);

        expect(result.source).toBe('migrated-v1');
        expect(result.warning).toBeNull();
        expect(result.data.version).toBe(2);
        expect(result.data.buckets[0].projectId).toBe(result.data.projects[0].id);
        expect(result.data.tasks[0].projectId).toBe(result.data.projects[0].id);
        expect(localStorage.getItem(PLANNER_STORAGE_KEY_V1)).toBe(rawV1);
        expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2) ?? '{}')).toEqual(result.data);
    });

    it('returns a recoverable warning when invalid v2 falls back to valid v1', () => {
        localStorage.setItem(PLANNER_STORAGE_KEY_V2, '{bad json');
        localStorage.setItem(PLANNER_STORAGE_KEY_V1, JSON.stringify(createV1Data()));

        const result = loadPlannerDataV2FromLocalStorage(() => timestamp);

        expect(result.source).toBe('migrated-v1');
        expect(result.warning).toContain('v2');
        expect(result.data.version).toBe(2);
    });

    it('creates new v2 data when neither key contains valid planner data', () => {
        localStorage.setItem(PLANNER_STORAGE_KEY_V2, JSON.stringify({ version: 2, projects: [] }));
        localStorage.setItem(PLANNER_STORAGE_KEY_V1, JSON.stringify({ version: 1, buckets: 'nope', tasks: [] }));

        const result = loadPlannerDataV2FromLocalStorage(() => timestamp);

        expect(result.source).toBe('new');
        expect(result.warning).toContain('v2');
        expect(result.data.version).toBe(2);
        expect(result.data.projects[0].createdAt).toBe(timestamp);
    });

    it('saves v2 data without touching the v1 backup key', () => {
        const rawV1 = JSON.stringify(createV1Data());
        const v2Data = createV2Data();
        localStorage.setItem(PLANNER_STORAGE_KEY_V1, rawV1);

        savePlannerDataV2ToLocalStorage(v2Data);

        expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2) ?? '{}')).toEqual(v2Data);
        expect(localStorage.getItem(PLANNER_STORAGE_KEY_V1)).toBe(rawV1);
    });
});
