import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { PlannerData } from './types';

const STORAGE_KEY = 'planner-buckets:data:v1';

const plannerFixture: PlannerData = {
    version: 1,
    buckets: [
        {
            id: 'bucket-todo',
            name: 'To Do',
            createdAt: '2026-01-01T00:00:00.000Z',
            pinned: true,
        },
    ],
    tasks: [
        {
            id: 'task-1',
            title: 'Write launch summary',
            description: 'Include blockers',
            bucketId: 'bucket-todo',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ],
};

const seedPlannerData = (data: PlannerData = plannerFixture) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

describe('App integration', () => {
    beforeEach(() => {
        localStorage.clear();
        seedPlannerData();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('auto-opens the sidepanel when hovering the toggle while unlocked', () => {
        vi.useFakeTimers();
        const { container } = render(<App />);

        const toggleGroup = container.querySelector('.sidepanel-toggle-group');
        expect(toggleGroup).toHaveAttribute('data-expanded', 'false');

        const toggleButton = screen.getByRole('button', { name: 'Open planner controls' });
        fireEvent.mouseEnter(toggleButton);

        act(() => {
            vi.advanceTimersByTime(130);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');
    });

    it('does not auto-open the sidepanel when auto-open lock is enabled', () => {
        vi.useFakeTimers();
        const { container } = render(<App />);

        const toggleGroup = container.querySelector('.sidepanel-toggle-group');
        const lockButton = screen.getByRole('button', { name: 'Disable automatic controls opening' });

        fireEvent.click(lockButton);

        expect(toggleGroup).toHaveAttribute('data-auto-open-locked', 'true');
        expect(toggleGroup).toHaveAttribute('data-expanded', 'false');

        const toggleButton = screen.getByRole('button', { name: 'Open planner controls' });
        fireEvent.mouseEnter(toggleButton);

        act(() => {
            vi.advanceTimersByTime(130);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'false');
    });

    it('keeps an open sidepanel open after locking it', () => {
        vi.useFakeTimers();
        const { container } = render(<App />);

        const toggleGroup = container.querySelector('.sidepanel-toggle-group');
        const toggleButton = screen.getByRole('button', { name: 'Open planner controls' });

        fireEvent.mouseEnter(toggleButton);

        act(() => {
            vi.advanceTimersByTime(130);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');

        const lockButton = screen.getByRole('button', { name: 'Disable automatic controls opening' });
        fireEvent.click(lockButton);

        expect(toggleGroup).toHaveAttribute('data-auto-open-locked', 'true');
        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');

        act(() => {
            vi.advanceTimersByTime(250);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');
    });

    it('copies a single task with bucket metadata', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(1);
        });

        expect(writeText).toHaveBeenCalledWith('[ ] Write launch summary\nBucket: To Do\nNote: Include blockers');
    });

    it('copies all tasks in a bucket as an ordered checklist', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy all tasks in To Do' }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(1);
        });

        expect(writeText).toHaveBeenCalledWith('1. [ ] Write launch summary\n   Note: Include blockers');
    });

    it('pastes copied tasks into another bucket', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy all tasks in To Do' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));

        await waitFor(() => {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PlannerData;
            expect(saved.tasks.length).toBe(2);
        });

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PlannerData;
        const pastedTask = saved.tasks.find((task) => task.id !== 'task-1');
        expect(pastedTask?.title).toBe('Write launch summary');
        expect(pastedTask?.bucketId).toBeNull();
    });

    it('supports undo and redo keyboard shortcuts for planner actions', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));
        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Undo target task' },
        });
        fireEvent.keyDown(screen.getByLabelText('Quick add task title'), { key: 'Enter' });

        expect(screen.getByRole('button', { name: 'Undo target task' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Undo target task' })).not.toBeInTheDocument();
        });

        fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Undo target task' })).toBeInTheDocument();
        });
    });

    it('creates a new bucket and task together from quick add', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Draft release notes' },
        });
        fireEvent.change(screen.getByLabelText('Quick add bucket name'), {
            target: { value: 'Release Prep' },
        });

        fireEvent.keyDown(screen.getByLabelText('Quick add bucket name'), { key: 'Enter' });

        expect(screen.getByRole('heading', { name: 'Release Prep' })).toBeInTheDocument();

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PlannerData;
        const createdBucket = saved.buckets.find((bucket) => bucket.name === 'Release Prep');
        const createdTask = saved.tasks.find((task) => task.title === 'Draft release notes');

        expect(createdBucket).toBeTruthy();
        expect(createdTask?.bucketId).toBe(createdBucket?.id);
    });

    it('falls back to Unassigned when quick-add bucket text is invalid', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Follow up with vendor' },
        });
        fireEvent.change(screen.getByLabelText('Quick add bucket name'), {
            target: { value: '@@@' },
        });

        fireEvent.keyDown(screen.getByLabelText('Quick add bucket name'), { key: 'Enter' });

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PlannerData;
        const createdTask = saved.tasks.find((task) => task.title === 'Follow up with vendor');

        expect(createdTask?.bucketId).toBeNull();
        expect(saved.buckets.some((bucket) => bucket.name === '@@@')).toBe(false);
    });

    it('accepts bucket autocomplete with ArrowRight and submits to that bucket', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Call supplier' },
        });

        const bucketInput = screen.getByLabelText('Quick add bucket name');
        fireEvent.change(bucketInput, {
            target: { value: 'To' },
        });
        fireEvent.keyDown(bucketInput, { key: 'ArrowRight' });

        expect((bucketInput as HTMLInputElement).value).toBe('To Do');

        fireEvent.keyDown(bucketInput, { key: 'Enter' });

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PlannerData;
        const createdTask = saved.tasks.find((task) => task.title === 'Call supplier');
        expect(createdTask?.bucketId).toBe('bucket-todo');
    });

    it('shows ghost autocomplete suffix in quick bucket input while typing', () => {
        const { container } = render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const bucketInput = screen.getByLabelText('Quick add bucket name');
        fireEvent.change(bucketInput, {
            target: { value: 'To' },
        });

        const ghostSuffix = container.querySelector('.quick-task-bucket-ghost-suffix');
        expect(ghostSuffix).toBeTruthy();
        expect(ghostSuffix?.textContent).toBe(' Do');
    });

    it('keeps board inline task input open after submitting tasks', () => {
        render(<App />);

        fireEvent.click(screen.getAllByRole('button', { name: '+ Add task' })[0]);

        const input = screen.getByLabelText('Add task in Unassigned');
        fireEvent.change(input, { target: { value: 'Inline board task' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByLabelText('Add task in Unassigned')).toBeInTheDocument();
        expect((screen.getByLabelText('Add task in Unassigned') as HTMLInputElement).value).toBe('');

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PlannerData;
        const createdTask = saved.tasks.find((task) => task.title === 'Inline board task');
        expect(createdTask?.bucketId).toBeNull();
    });

    it('creates a bucket from board inline add bucket entry', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: '+ Add bucket' }));

        const input = screen.getByLabelText('Add bucket in board');
        fireEvent.change(input, { target: { value: 'Board Added Bucket' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByRole('heading', { name: 'Board Added Bucket' })).toBeInTheDocument();
    });
});
