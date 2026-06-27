import { describe, expect, it } from 'vitest';
import type { PlannerData } from '../types';
import {
    createId,
    createInitialPlannerData,
    isPlannerData,
    normalizePlannerData,
} from './plannerStorage';

describe('plannerStorage', () => {
    it('creates ids as non-empty strings', () => {
        const id = createId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });

    it('creates initial planner data with pinned To Do bucket', () => {
        const initial = createInitialPlannerData();
        const todo = initial.buckets.find((bucket) => bucket.name === 'To Do');

        expect(initial.version).toBe(1);
        expect(todo?.pinned).toBe(true);
    });

    it('validates planner data shape and rejects malformed values', () => {
        const valid: PlannerData = {
            version: 1,
            buckets: [
                {
                    id: 'bucket-a',
                    name: 'A',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    pinned: false,
                },
            ],
            tasks: [
                {
                    id: 'task-1',
                    title: 'Task',
                    description: '',
                    bucketId: 'bucket-a',
                    pinned: false,
                    completed: false,
                    archivedAt: null,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        };

        const malformed = {
            ...valid,
            tasks: [
                {
                    ...valid.tasks[0],
                    completed: 'nope',
                },
            ],
        };

        expect(isPlannerData(valid)).toBe(true);
        expect(isPlannerData(malformed)).toBe(false);
    });

    it('normalizes bucket order, empty names, and orphaned task bucket ids', () => {
        const withLegacyValues = {
            version: 1,
            buckets: [
                {
                    id: 'bucket-unpinned',
                    name: ' Later ',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    pinned: false,
                },
                {
                    id: 'bucket-todo',
                    name: ' To Do ',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
                {
                    id: 'bucket-empty',
                    name: '   ',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    pinned: false,
                },
            ],
            tasks: [
                {
                    id: 'task-a',
                    title: '  Keep me  ',
                    description: '',
                    bucketId: 'bucket-todo',
                    completed: false,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
                {
                    id: 'task-b',
                    title: 'task-b',
                    description: '',
                    bucketId: 'missing-bucket',
                    completed: false,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        } as unknown as PlannerData;

        const normalized = normalizePlannerData(withLegacyValues);

        expect(normalized.buckets.map((bucket) => bucket.id)).toEqual([
            'bucket-todo',
            'bucket-unpinned',
            'bucket-empty',
        ]);
        expect(normalized.buckets.find((bucket) => bucket.id === 'bucket-empty')?.name).toBe('Untitled bucket');
        expect(normalized.buckets.find((bucket) => bucket.id === 'bucket-todo')?.pinned).toBe(true);
        expect(normalized.tasks.find((task) => task.id === 'task-a')?.title).toBe('Keep me');
        expect(normalized.tasks.find((task) => task.id === 'task-b')?.bucketId).toBeNull();
        expect(normalized.tasks.find((task) => task.id === 'task-a')?.pinned).toBe(false);
        expect(normalized.tasks.find((task) => task.id === 'task-a')?.archivedAt).toBeNull();
    });
});
