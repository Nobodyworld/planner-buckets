import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadFromLocalStorage, saveToLocalStorage } from '../services/plannerPersistence';
import type { PlannerData } from '../types';
import { PLANNER_DATA_VERSION } from '../types';

describe('plannerPersistence', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('saveToLocalStorage', () => {
        it('saves planner data to localStorage', () => {
            const data: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true },
                ],
                tasks: [
                    {
                        id: 't1',
                        title: 'Sample task',
                        description: 'Notes',
                        bucketId: 'b1',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            saveToLocalStorage(data);

            const stored = localStorage.getItem('planner-buckets:data:v1');
            expect(stored).not.toBeNull();

            const parsed = JSON.parse(stored!);
            expect(parsed).toEqual(data);
        });

        it('overwrites existing data', () => {
            const data1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'b1', name: 'First', createdAt: '2026-01-01T00:00:00Z', pinned: false },
                ],
                tasks: [],
            };

            const data2: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'b2', name: 'Second', createdAt: '2026-01-01T00:00:00Z', pinned: false },
                ],
                tasks: [],
            };

            saveToLocalStorage(data1);
            saveToLocalStorage(data2);

            const stored = localStorage.getItem('planner-buckets:data:v1');
            const parsed = JSON.parse(stored!);
            expect(parsed.buckets[0].name).toBe('Second');
        });
    });

    describe('loadFromLocalStorage', () => {
        it('loads planner data from localStorage', () => {
            const data: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true },
                ],
                tasks: [],
            };

            localStorage.setItem('planner-buckets:data:v1', JSON.stringify(data));

            const loaded = loadFromLocalStorage();
            expect(loaded).toEqual(data);
        });

        it('returns initial data when storage is empty', () => {
            const loaded = loadFromLocalStorage();
            expect(loaded).toBeDefined();
            expect(loaded.version).toBe(PLANNER_DATA_VERSION);
            expect(loaded.buckets).toHaveLength(2); // Initial "To Do" and "In Progress"
        });

        it('returns initial data on corrupted JSON', () => {
            localStorage.setItem('planner-buckets:data:v1', 'invalid json {{{');

            const loaded = loadFromLocalStorage();
            expect(loaded).toBeDefined();
            expect(loaded.version).toBe(PLANNER_DATA_VERSION);
        });

        it('returns initial data for invalid PlannerData shape', () => {
            const invalidData = {
                version: PLANNER_DATA_VERSION,
                buckets: 'not an array',
                tasks: [],
            };

            localStorage.setItem('planner-buckets:data:v1', JSON.stringify(invalidData));

            const loaded = loadFromLocalStorage();
            expect(loaded).toBeDefined();
            expect(loaded.version).toBe(PLANNER_DATA_VERSION);
        });

        it('preserves complex data through round-trip', () => {
            const originalData: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'b1', name: 'Work', createdAt: '2026-01-01T00:00:00Z', pinned: true },
                    { id: 'b2', name: 'Personal', createdAt: '2026-01-02T00:00:00Z', pinned: false },
                ],
                tasks: [
                    {
                        id: 't1',
                        title: 'Complete project',
                        description: 'Multi-line\nnotes\nhere',
                        bucketId: 'b1',
                        pinned: true,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-02T00:00:00Z',
                    },
                    {
                        id: 't2',
                        title: 'Archived task',
                        description: '',
                        bucketId: null,
                        pinned: false,
                        completed: true,
                        archivedAt: '2026-01-03T00:00:00Z',
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-03T00:00:00Z',
                    },
                ],
            };

            saveToLocalStorage(originalData);
            const loaded = loadFromLocalStorage();

            expect(loaded).toEqual(originalData);
        });

        it('handles empty buckets and tasks arrays', () => {
            const data: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [],
                tasks: [],
            };

            saveToLocalStorage(data);
            const loaded = loadFromLocalStorage();

            expect(loaded.buckets).toHaveLength(0);
            expect(loaded.tasks).toHaveLength(0);
        });
    });

    describe('round-trip behavior', () => {
        it('save and load preserve all data integrally', () => {
            const data: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'b-123', name: 'Shopping', createdAt: '2026-06-30T12:34:56Z', pinned: true },
                    { id: 'b-456', name: 'Home', createdAt: '2026-06-29T11:22:33Z', pinned: false },
                ],
                tasks: [
                    {
                        id: 't-a1',
                        title: 'Buy milk',
                        description: 'Whole milk\n2% backup',
                        bucketId: 'b-123',
                        pinned: true,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-30T10:00:00Z',
                        updatedAt: '2026-06-30T10:00:00Z',
                    },
                    {
                        id: 't-a2',
                        title: 'Fix sink',
                        description: '',
                        bucketId: 'b-456',
                        pinned: false,
                        completed: true,
                        archivedAt: '2026-06-28T15:30:00Z',
                        createdAt: '2026-06-25T09:00:00Z',
                        updatedAt: '2026-06-28T15:30:00Z',
                    },
                    {
                        id: 't-a3',
                        title: 'Call dentist',
                        description: 'Monday slot',
                        bucketId: null,
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-30T08:00:00Z',
                        updatedAt: '2026-06-30T08:00:00Z',
                    },
                ],
            };

            saveToLocalStorage(data);
            const loaded = loadFromLocalStorage();

            expect(loaded).toEqual(data);
        });
    });
});
