import { describe, expect, it } from 'vitest';
import type { PlannerData } from '../types';
import { plannerReducer } from './plannerReducer';

const baseState: PlannerData = {
  version: 1,
  buckets: [
    { id: 'bucket-a', name: 'A', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
    { id: 'bucket-b', name: 'B', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
  ],
  tasks: [
    {
      id: 'task-1',
      title: 'Test task',
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

describe('plannerReducer', () => {
  it('moves a task to a new bucket', () => {
    const next = plannerReducer(baseState, {
      type: 'MOVE_TASK',
      taskId: 'task-1',
      bucketId: 'bucket-b',
    });

    expect(next.tasks[0]?.bucketId).toBe('bucket-b');
  });

  it('reorders tasks inside a bucket by target index', () => {
    const stateWithMany: PlannerData = {
      ...baseState,
      tasks: [
        {
          ...baseState.tasks[0],
          id: 'task-1',
          title: 'First',
        },
        {
          ...baseState.tasks[0],
          id: 'task-2',
          title: 'Second',
          bucketId: 'bucket-a',
        },
        {
          ...baseState.tasks[0],
          id: 'task-3',
          title: 'Third',
          bucketId: 'bucket-a',
        },
      ],
    };

    const moveToBottom = plannerReducer(stateWithMany, {
      type: 'MOVE_TASK',
      taskId: 'task-1',
      bucketId: 'bucket-a',
      targetIndex: 3,
    });

    expect(moveToBottom.tasks.map((task) => task.id)).toEqual([
      'task-2',
      'task-3',
      'task-1',
    ]);

    const moveMiddle = plannerReducer(moveToBottom, {
      type: 'MOVE_TASK',
      taskId: 'task-1',
      bucketId: 'bucket-a',
      targetIndex: 1,
    });

    expect(moveMiddle.tasks.map((task) => task.id)).toEqual([
      'task-2',
      'task-1',
      'task-3',
    ]);
  });

  it('moves tasks to unassigned when deleting a bucket', () => {
    const next = plannerReducer(baseState, {
      type: 'DELETE_BUCKET',
      bucketId: 'bucket-a',
    });

    expect(next.buckets).toHaveLength(1);
    expect(next.tasks[0]?.bucketId).toBeNull();
  });

  it('toggles completion', () => {
    const next = plannerReducer(baseState, {
      type: 'TOGGLE_TASK',
      taskId: 'task-1',
    });

    expect(next.tasks[0]?.completed).toBe(true);
  });

  it('archives completed tasks', () => {
    const withCompleted: PlannerData = {
      ...baseState,
      tasks: [
        ...baseState.tasks,
        {
          id: 'task-2',
          title: 'Done task',
          description: '',
          bucketId: 'bucket-b',
          pinned: false,
          completed: true,
          archivedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    const next = plannerReducer(withCompleted, {
      type: 'ARCHIVE_COMPLETED_TASKS',
    });

    expect(next.tasks).toHaveLength(2);
    expect(next.tasks.find((task) => task.id === 'task-2')?.archivedAt).toBeTruthy();
  });

  it('unarchives and reopens a task', () => {
    const archivedState: PlannerData = {
      ...baseState,
      tasks: [
        {
          ...baseState.tasks[0],
          completed: true,
          archivedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    };

    const next = plannerReducer(archivedState, {
      type: 'UNARCHIVE_TASK',
      taskId: 'task-1',
    });

    expect(next.tasks[0]?.archivedAt).toBeNull();
    expect(next.tasks[0]?.completed).toBe(false);
  });

  it('unarchives automatically when toggled from archive', () => {
    const archivedState: PlannerData = {
      ...baseState,
      tasks: [
        {
          ...baseState.tasks[0],
          completed: true,
          archivedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    };

    const next = plannerReducer(archivedState, {
      type: 'TOGGLE_TASK',
      taskId: 'task-1',
    });

    expect(next.tasks[0]?.archivedAt).toBeNull();
    expect(next.tasks[0]?.completed).toBe(false);
  });

  it('pins a task to bucket top group', () => {
    const next = plannerReducer(baseState, {
      type: 'TOGGLE_TASK_PIN',
      taskId: 'task-1',
    });

    expect(next.tasks[0]?.pinned).toBe(true);
  });

  it('keeps pinned buckets grouped on the left after unpinning and moving a bucket', () => {
    const withPinned: PlannerData = {
      ...baseState,
      buckets: [
        { ...baseState.buckets[0], id: 'bucket-p1', pinned: true },
        { ...baseState.buckets[1], id: 'bucket-p2', pinned: true },
        { id: 'bucket-n1', name: 'N1', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
      ],
    };

    const unpinned = plannerReducer(withPinned, {
      type: 'TOGGLE_BUCKET_PIN',
      bucketId: 'bucket-p1',
    });

    const next = plannerReducer(unpinned, {
      type: 'MOVE_BUCKET',
      bucketId: 'bucket-p1',
      targetIndex: 2,
    });

    expect(next.buckets.map((bucket) => bucket.id)).toEqual(['bucket-p2', 'bucket-p1', 'bucket-n1']);
  });

  it('keeps a dragged pinned bucket inside the pinned group', () => {
    const withPinned: PlannerData = {
      ...baseState,
      buckets: [
        { id: 'bucket-p1', name: 'Pinned One', createdAt: '2026-01-01T00:00:00.000Z', pinned: true },
        { id: 'bucket-p2', name: 'Pinned Two', createdAt: '2026-01-01T00:00:00.000Z', pinned: true },
        { id: 'bucket-u1', name: 'Unpinned One', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
        { id: 'bucket-u2', name: 'Unpinned Two', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
      ],
    };

    const next = plannerReducer(withPinned, {
      type: 'MOVE_BUCKET',
      bucketId: 'bucket-p1',
      targetIndex: 3,
    });

    expect(next.buckets.map((bucket) => bucket.id)).toEqual(['bucket-p2', 'bucket-p1', 'bucket-u1', 'bucket-u2']);
  });

  it('adds newly pinned buckets after existing pinned seniority', () => {
    const withPinned: PlannerData = {
      ...baseState,
      buckets: [
        { id: 'bucket-p1', name: 'Pinned One', createdAt: '2026-01-01T00:00:00.000Z', pinned: true },
        { id: 'bucket-u1', name: 'Unpinned One', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
        { id: 'bucket-u2', name: 'Unpinned Two', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
      ],
    };

    const next = plannerReducer(withPinned, {
      type: 'TOGGLE_BUCKET_PIN',
      bucketId: 'bucket-u2',
    });

    expect(next.buckets.map((bucket) => bucket.id)).toEqual(['bucket-p1', 'bucket-u2', 'bucket-u1']);
  });

  it('places a bucket in the intended slot when dragging rightward', () => {
    const withBuckets: PlannerData = {
      ...baseState,
      buckets: [
        { id: 'bucket-a', name: 'A', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
        { id: 'bucket-b', name: 'B', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
        { id: 'bucket-c', name: 'C', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
        { id: 'bucket-d', name: 'D', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
      ],
    };

    const next = plannerReducer(withBuckets, {
      type: 'MOVE_BUCKET',
      bucketId: 'bucket-b',
      targetIndex: 3,
    });

    expect(next.buckets.map((bucket) => bucket.id)).toEqual(['bucket-a', 'bucket-c', 'bucket-b', 'bucket-d']);
  });

  it('ignores add bucket when name is blank', () => {
    const next = plannerReducer(baseState, {
      type: 'ADD_BUCKET',
      name: '   ',
    });

    expect(next).toEqual(baseState);
  });

  it('trims added bucket names', () => {
    const next = plannerReducer(baseState, {
      type: 'ADD_BUCKET',
      name: '  New Bucket  ',
    });

    expect(next.buckets.at(-1)?.name).toBe('New Bucket');
  });

  it('ignores rename bucket when the new name is blank', () => {
    const next = plannerReducer(baseState, {
      type: 'RENAME_BUCKET',
      bucketId: 'bucket-a',
      name: '   ',
    });

    expect(next).toEqual(baseState);
  });

  it('keeps bucket order unchanged when moving an unknown bucket', () => {
    const next = plannerReducer(baseState, {
      type: 'MOVE_BUCKET',
      bucketId: 'missing-bucket',
      targetIndex: 0,
    });

    expect(next).toEqual(baseState);
  });

  it('normalizes data when replacing planner state', () => {
    const replaced = plannerReducer(baseState, {
      type: 'REPLACE_DATA',
      data: {
        version: 1,
        buckets: [
          {
            id: 'bucket-todo',
            name: ' To Do ',
            createdAt: '2026-01-01T00:00:00.000Z',
            pinned: false,
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
            id: 'task-keep',
            title: '  Keep title  ',
            description: 'desc',
            bucketId: 'bucket-todo',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'task-unassigned',
            title: 'Task 2',
            description: '',
            bucketId: 'missing-bucket',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    expect(replaced.buckets[0]).toMatchObject({
      id: 'bucket-todo',
      name: 'To Do',
      pinned: false,
    });
    expect(replaced.buckets[1]).toMatchObject({
      id: 'bucket-empty',
      name: 'Untitled bucket',
    });
    expect(replaced.tasks.find((task) => task.id === 'task-keep')?.title).toBe('Keep title');
    expect(replaced.tasks.find((task) => task.id === 'task-unassigned')?.bucketId).toBeNull();
  });
});
