import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { PlannerData } from './types';
import type { PlannerDataV2 } from './types/v2';
import { PLANNER_DATA_V2_VERSION } from './types/v2';

const V1_STORAGE_KEY = 'planner-buckets:data:v1';
const V2_STORAGE_KEY = 'planner-buckets:data:v2';

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

const plannerV2Fixture: PlannerDataV2 = {
    version: PLANNER_DATA_V2_VERSION,
    projects: [
        {
            id: 'project-a',
            name: 'Alpha',
            description: 'Alpha notes',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'project-b',
            name: 'Beta',
            description: '',
            priority: 0,
            pinned: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
    ],
    buckets: [
        {
            id: 'bucket-alpha',
            projectId: 'project-a',
            name: 'Alpha Bucket',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'bucket-beta',
            projectId: 'project-b',
            name: 'Beta Bucket',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
    ],
    tasks: [
        {
            id: 'task-alpha',
            projectId: 'project-a',
            title: 'Alpha task',
            description: '',
            bucketId: 'bucket-alpha',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'task-beta',
            projectId: 'project-b',
            title: 'Beta task',
            description: '',
            bucketId: 'bucket-beta',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'task-alpha-unassigned',
            projectId: 'project-a',
            title: 'Alpha unassigned',
            description: '',
            bucketId: null,
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ],
    templates: [],
    templateDefinitions: [],
};

const seedPlannerData = (data: PlannerData = plannerFixture) => {
    localStorage.setItem(V1_STORAGE_KEY, JSON.stringify(data));
};

const seedPlannerDataV2 = (data: PlannerDataV2 = plannerV2Fixture) => {
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(data));
};

const readRuntimePlannerData = (): PlannerDataV2 => (
    JSON.parse(localStorage.getItem(V2_STORAGE_KEY) ?? '{}') as PlannerDataV2
);

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
            const saved = readRuntimePlannerData();
            expect(saved.tasks.length).toBe(2);
        });

        const saved = readRuntimePlannerData();
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

        const saved = readRuntimePlannerData();
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

        const saved = readRuntimePlannerData();
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

        const saved = readRuntimePlannerData();
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

        const saved = readRuntimePlannerData();
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

    it('initially selects the first pinned project and renders only that project board', () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        expect(screen.getByRole('heading', { name: 'Beta Bucket' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Beta task' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Alpha Bucket' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Alpha task' })).not.toBeInTheDocument();
    });

    it('switches boards without mixing project-scoped buckets or unassigned tasks', () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-a' },
        });

        expect(screen.getByRole('heading', { name: 'Alpha Bucket' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Alpha task' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Alpha unassigned' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Beta Bucket' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Beta task' })).not.toBeInTheDocument();
    });

    it('creates, renames, and updates project descriptions from the compact project list', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const newProjectInput = screen.getByLabelText('New project name');
        fireEvent.change(newProjectInput, { target: { value: 'Roadmap' } });
        fireEvent.keyDown(newProjectInput, { key: 'Enter' });

        await waitFor(() => {
            expect(readRuntimePlannerData().projects.some((project) => project.name === 'Roadmap')).toBe(true);
        });

        fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Roadmap 2' } });
        fireEvent.blur(screen.getByLabelText('Project name'));

        fireEvent.change(screen.getByLabelText('Project description'), { target: { value: 'Phase 3 notes' } });
        fireEvent.blur(screen.getByLabelText('Project description'));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            const project = saved.projects.find((item) => item.name === 'Roadmap 2');
            expect(project?.description).toBe('Phase 3 notes');
        });
    });

    it('falls back to the nearest remaining project after deleting the active project', async () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete project' }).at(-1)!);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Alpha Bucket' })).toBeInTheDocument();
        });

        const saved = readRuntimePlannerData();
        expect(saved.projects.map((project) => project.id)).toEqual(['project-a']);
        expect(saved.buckets.map((bucket) => bucket.projectId)).toEqual(['project-a']);
        expect(saved.tasks.every((task) => task.projectId === 'project-a')).toBe(true);
    });

    it('searches only within the active project', () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        fireEvent.change(screen.getByLabelText('Search tasks'), {
            target: { value: 'Alpha' },
        });

        expect(screen.queryByRole('button', { name: 'Alpha task' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Beta task' })).not.toBeInTheDocument();
    });

    it('exports validated v2 JSON', async () => {
        localStorage.clear();
        seedPlannerDataV2();
        let exportedBlob: Blob | null = null;
        const createObjectUrl = vi.fn((blob: Blob) => {
            exportedBlob = blob;
            return 'blob:planner-export';
        });
        Object.defineProperty(URL, 'createObjectURL', {
            value: createObjectUrl,
            configurable: true,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

        expect(createObjectUrl).toHaveBeenCalledTimes(1);
        expect(exportedBlob).not.toBeNull();
        const exported = JSON.parse(await exportedBlob!.text()) as PlannerDataV2;
        expect(exported.version).toBe(2);
        expect(exported.projects).toHaveLength(2);
    });

    it('restores valid v1 JSON by migrating it into v2 state', async () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        const file = new File([JSON.stringify(plannerFixture)], 'planner-v1.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(screen.getByText('Restore 1 task(s) and 1 bucket(s) and replace current planner?')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.version).toBe(2);
            expect(saved.tasks.find((task) => task.id === 'task-1')?.projectId).toBe(saved.projects[0].id);
        });
    });

    it('restores valid v2 JSON directly', async () => {
        render(<App />);

        const file = new File([JSON.stringify(plannerV2Fixture)], 'planner-v2.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(screen.getByText('Restore 3 task(s) and 2 bucket(s) and replace current planner?')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.projects.map((project) => project.id)).toEqual(['project-a', 'project-b']);
            expect(saved.tasks.find((task) => task.id === 'task-beta')?.projectId).toBe('project-b');
        });
    });
});
