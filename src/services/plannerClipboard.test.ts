import { describe, expect, it } from 'vitest';
import {
    formatTaskChecklistLabel,
    formatTaskForOrderedCopy,
    formatTaskForSingleCopy,
    formatTaskNoteForCopy,
} from '../services/plannerClipboard';
import type { PlannerTask } from '../types';

describe('plannerClipboard', () => {
    describe('formatTaskChecklistLabel', () => {
        it('formats completed task with [x]', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Test task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: true,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[x] Test task');
        });

        it('formats incomplete task with [ ]', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Test task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[ ] Test task');
        });

        it('handles empty title with fallback', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: '   ',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[ ] Untitled task');
        });

        it('trims whitespace from title', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: '  My Task  ',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[ ] My Task');
        });
    });

    describe('formatTaskNoteForCopy', () => {
        it('formats single-line note with prefix', () => {
            expect(formatTaskNoteForCopy('Simple note', 'Note: ')).toBe('Note: Simple note');
        });

        it('formats multi-line note', () => {
            expect(formatTaskNoteForCopy('Line 1\nLine 2\nLine 3', 'Note: ')).toBe(
                'Note: Line 1\nNote: Line 2\nNote: Line 3'
            );
        });

        it('trims whitespace and filters empty lines', () => {
            expect(formatTaskNoteForCopy('  Line 1  \n\n  Line 2  \n', 'Note: ')).toBe(
                'Note: Line 1\nNote: Line 2'
            );
        });

        it('handles empty description', () => {
            expect(formatTaskNoteForCopy('', 'Note: ')).toBe('');
        });

        it('uses no prefix when not provided', () => {
            expect(formatTaskNoteForCopy('Note content')).toBe('Note content');
        });
    });

    describe('formatTaskForOrderedCopy', () => {
        it('formats task with index and optional notes', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Buy groceries',
                description: 'Milk\nBread',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForOrderedCopy(task, 0)).toBe(
                '1. [ ] Buy groceries\n   Note: Milk\n   Note: Bread'
            );
        });

        it('handles completed tasks', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Done task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: true,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForOrderedCopy(task, 5)).toBe('6. [x] Done task');
        });

        it('uses correct 1-based indexing', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Third item',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForOrderedCopy(task, 2)).toMatch(/^3\./);
        });
    });

    describe('formatTaskForSingleCopy', () => {
        it('formats task with bucket name and notes', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Review PR',
                description: 'Check tests',
                bucketId: 'bucket-work',
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForSingleCopy(task, 'Work')).toBe(
                '[ ] Review PR\nBucket: Work\nNote: Check tests'
            );
        });

        it('handles tasks without notes', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Quick task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: true,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForSingleCopy(task, 'Unassigned')).toBe(
                '[x] Quick task\nBucket: Unassigned'
            );
        });
    });
});
