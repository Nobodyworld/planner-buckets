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
});
