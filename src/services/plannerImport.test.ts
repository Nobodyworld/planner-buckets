import { describe, expect, it } from 'vitest';
import { mergeUploadedPlannerData, type MergeResult } from '../services/plannerImport';
import type { PlannerData } from '../types';

describe('plannerImport', () => {
    describe('mergeUploadedPlannerData', () => {
        it('creates new buckets for incoming buckets without matches', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1', name: 'Current', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b-new', name: 'Incoming', createdAt: '2026-06-01T00:00:00Z', pinned: false }],
                tasks: [],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.createdBucketCount).toBe(1);
            expect(result.mergedIntoExistingBucketCount).toBe(0);
            expect(result.data.buckets).toHaveLength(2);
            expect(result.data.buckets[1].name).toBe('Incoming');
            expect(result.data.buckets[1].id).not.toBe('b-new'); // New ID assigned
        });

        it('matches buckets by normalized name (case-insensitive, trimmed)', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b-incoming', name: '  to do  ', createdAt: '2026-06-01T00:00:00Z', pinned: false }],
                tasks: [],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.mergedIntoExistingBucketCount).toBe(1);
            expect(result.createdBucketCount).toBe(0);
            expect(result.data.buckets).toHaveLength(1);
        });

        it('handles duplicate tasks by (bucketId, title, description)', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1', name: 'Work', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't1',
                        title: 'Task A',
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

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1-incoming', name: 'Work', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't-new',
                        title: 'Task A',
                        description: 'Notes',
                        bucketId: 'b1-incoming',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.skippedDuplicateCount).toBe(1);
            expect(result.uploadedTaskIds).toHaveLength(0);
            expect(result.data.tasks).toHaveLength(1); // Original task only
        });

        it('detects duplicates case-insensitively for title and description', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1', name: 'Inbox', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't1',
                        title: 'Call Mom',
                        description: 'Birthday gift',
                        bucketId: 'b1',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1-incoming', name: 'inbox', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't-new',
                        title: 'call mom',
                        description: 'BIRTHDAY GIFT',
                        bucketId: 'b1-incoming',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.skippedDuplicateCount).toBe(1);
        });

        it('preserves non-duplicate tasks', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1', name: 'Work', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't1',
                        title: 'Task A',
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

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1-incoming', name: 'Work', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't-new',
                        title: 'Task B',
                        description: 'Different notes',
                        bucketId: 'b1-incoming',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.uploadedTaskIds).toHaveLength(1);
            expect(result.data.tasks).toHaveLength(2);
        });

        it('remaps bucket IDs in tasks correctly', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [{ id: 'b-existing', name: 'Work', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b-incoming', name: 'Work', createdAt: '2026-06-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't-new',
                        title: 'New task',
                        description: '',
                        bucketId: 'b-incoming',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.data.tasks[0].bucketId).toBe('b-existing');
        });

        it('handles null bucketId (unassigned tasks)', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [],
                tasks: [
                    {
                        id: 't-new',
                        title: 'Unassigned task',
                        description: '',
                        bucketId: null,
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.data.tasks[0].bucketId).toBeNull();
        });

        it('trims bucket and task names', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [{ id: 'b1', name: '  ', createdAt: '2026-06-01T00:00:00Z', pinned: false }],
                tasks: [
                    {
                        id: 't1',
                        title: '  ',
                        description: '',
                        bucketId: null,
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.data.buckets[0].name).toBe('Untitled bucket');
            expect(result.data.tasks[0].title).toBe('Untitled task');
        });

        it('generates new IDs for all merged items', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [
                    { id: 'b-old-1', name: 'Bucket 1', createdAt: '2026-06-01T00:00:00Z', pinned: false },
                    { id: 'b-old-2', name: 'Bucket 2', createdAt: '2026-06-01T00:00:00Z', pinned: false },
                ],
                tasks: [
                    {
                        id: 't-old-1',
                        title: 'Task 1',
                        description: '',
                        bucketId: 'b-old-1',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-06-01T00:00:00Z',
                        updatedAt: '2026-06-01T00:00:00Z',
                    },
                ],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.data.buckets[0].id).not.toBe('b-old-1');
            expect(result.data.buckets[1].id).not.toBe('b-old-2');
            expect(result.data.tasks[0].id).not.toBe('t-old-1');
        });

        it('preserves version in result', () => {
            const current: PlannerData = {
                version: 1,
                buckets: [],
                tasks: [],
            };

            const incoming: PlannerData = {
                version: 1,
                buckets: [],
                tasks: [],
            };

            const result = mergeUploadedPlannerData(current, incoming);

            expect(result.data.version).toBe(1);
        });
    });
});
