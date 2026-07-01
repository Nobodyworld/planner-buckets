import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlannerHistory } from '../hooks/usePlannerHistory';
import type { BucketV2, PlannerDataV2, PlannerTaskV2, Project } from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import { plannerReducerV2, type PlannerActionV2 } from './plannerReducerV2';

const timestamp = '2026-07-01T00:00:00.000Z';

const project = (id: string, name = id, pinned = false): Project => ({
  id,
  name,
  description: '',
  priority: 0,
  pinned,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const task = (id: string, projectId: string, bucketId: string | null): PlannerTaskV2 => ({
  id,
  projectId,
  bucketId,
  title: id,
  description: '',
  priority: 0,
  resourceTags: [],
  pinned: false,
  completed: false,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const bucket = (id: string, projectId: string, name = id): BucketV2 => ({
  id,
  projectId,
  name,
  description: '',
  templateDefinitionId: null,
  priority: 0,
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const baseState = (): PlannerDataV2 => ({
  version: PLANNER_DATA_V2_VERSION,
  projects: [project('project-a', 'A', true), project('project-b', 'B')],
  buckets: [
    {
      id: 'bucket-a',
      projectId: 'project-a',
      name: 'A Bucket',
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'bucket-b',
      projectId: 'project-b',
      name: 'B Bucket',
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  tasks: [task('task-a', 'project-a', 'bucket-a'), task('task-b', 'project-b', 'bucket-b')],
  templates: [],
  templateDefinitions: [],
});

describe('plannerReducerV2', () => {
  it('creates projects with complete action values', () => {
    const next = plannerReducerV2(baseState(), {
      type: 'ADD_PROJECT',
      project: project('project-c', 'C'),
    });

    expect(next.projects.map((item) => item.id)).toContain('project-c');
  });

  it('renames projects and updates descriptions', () => {
    const renamed = plannerReducerV2(baseState(), {
      type: 'RENAME_PROJECT',
      projectId: 'project-a',
      name: ' Renamed ',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    const described = plannerReducerV2(renamed, {
      type: 'UPDATE_PROJECT_DESCRIPTION',
      projectId: 'project-a',
      description: '  Notes  ',
      updatedAt: '2026-07-03T00:00:00.000Z',
    });

    expect(described.projects[0].name).toBe('Renamed');
    expect(described.projects[0].description).toBe('Notes');
  });

  it('pins and reorders projects inside pinned groups', () => {
    const pinned = plannerReducerV2(baseState(), {
      type: 'TOGGLE_PROJECT_PIN',
      projectId: 'project-b',
      updatedAt: timestamp,
    });

    const moved = plannerReducerV2(pinned, {
      type: 'MOVE_PROJECT',
      projectId: 'project-b',
      targetIndex: 0,
    });

    expect(moved.projects.map((item) => item.id)).toEqual(['project-b', 'project-a']);
  });

  it('prevents deleting the final project', () => {
    const onlyProject: PlannerDataV2 = {
      ...baseState(),
      projects: [project('project-a')],
      buckets: [],
      tasks: [],
    };

    expect(plannerReducerV2(onlyProject, { type: 'DELETE_PROJECT', projectId: 'project-a' })).toBe(onlyProject);
  });

  it('deletes a project with its buckets and tasks', () => {
    const next = plannerReducerV2(baseState(), { type: 'DELETE_PROJECT', projectId: 'project-a' });

    expect(next.projects.map((item) => item.id)).toEqual(['project-b']);
    expect(next.buckets.map((item) => item.id)).toEqual(['bucket-b']);
    expect(next.tasks.map((item) => item.id)).toEqual(['task-b']);
  });

  it('restores a deleted project subtree through undo and redo', () => {
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(baseState(), plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'DELETE_PROJECT', projectId: 'project-a' });
    });

    expect(result.current.state.projects.map((item) => item.id)).toEqual(['project-b']);

    act(() => {
      result.current.undo();
    });

    expect(result.current.state.projects.map((item) => item.id)).toEqual(['project-a', 'project-b']);
    expect(result.current.state.buckets.map((item) => item.id)).toContain('bucket-a');
    expect(result.current.state.tasks.map((item) => item.id)).toContain('task-a');

    act(() => {
      result.current.redo();
    });

    expect(result.current.state.projects.map((item) => item.id)).toEqual(['project-b']);
  });

  it('scopes bucket deletion and task unassignment to one project', () => {
    const next = plannerReducerV2(baseState(), {
      type: 'DELETE_BUCKET',
      projectId: 'project-a',
      bucketId: 'bucket-a',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(next.buckets.map((item) => item.id)).toEqual(['bucket-b']);
    expect(next.tasks.find((item) => item.id === 'task-a')?.bucketId).toBeNull();
    expect(next.tasks.find((item) => item.id === 'task-b')?.bucketId).toBe('bucket-b');
  });

  it('rejects moving a task into a bucket from another project', () => {
    const state = baseState();
    const next = plannerReducerV2(state, {
      type: 'MOVE_TASK',
      projectId: 'project-a',
      taskId: 'task-a',
      bucketId: 'bucket-b',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(next).toBe(state);
  });

  it('keeps unassigned tasks scoped to their own project', () => {
    const next = plannerReducerV2(baseState(), {
      type: 'MOVE_TASK',
      projectId: 'project-a',
      taskId: 'task-a',
      bucketId: null,
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(next.tasks.find((item) => item.id === 'task-a')?.bucketId).toBeNull();
    expect(next.tasks.find((item) => item.id === 'task-a')?.projectId).toBe('project-a');
    expect(next.tasks.find((item) => item.id === 'task-b')?.bucketId).toBe('bucket-b');
  });

  it('returns the same state reference for reducer no-op actions', () => {
    const state = baseState();
    const noOpActions: PlannerActionV2[] = [
      { type: 'RENAME_PROJECT', projectId: 'missing-project', name: 'Name', updatedAt: timestamp },
      { type: 'RENAME_PROJECT', projectId: 'project-a', name: ' A ', updatedAt: timestamp },
      { type: 'UPDATE_PROJECT_DESCRIPTION', projectId: 'project-a', description: '   ', updatedAt: timestamp },
      { type: 'MOVE_PROJECT', projectId: 'project-a', targetIndex: 0 },
      { type: 'DELETE_PROJECT', projectId: 'missing-project' },
      { type: 'RENAME_BUCKET', projectId: 'project-a', bucketId: 'missing-bucket', name: 'Name', updatedAt: timestamp },
      { type: 'RENAME_BUCKET', projectId: 'project-a', bucketId: 'bucket-a', name: ' A Bucket ', updatedAt: timestamp },
      { type: 'MOVE_BUCKET', projectId: 'project-a', bucketId: 'bucket-a', targetIndex: 0 },
      { type: 'DELETE_BUCKET', projectId: 'project-a', bucketId: 'missing-bucket', updatedAt: timestamp },
      { type: 'UPDATE_TASK', projectId: 'project-a', taskId: 'missing-task', draft: { title: 'Task', description: '', bucketId: null }, updatedAt: timestamp },
      { type: 'UPDATE_TASK', projectId: 'project-a', taskId: 'task-a', draft: { title: 'task-a', description: '', bucketId: 'bucket-a' }, updatedAt: timestamp },
      { type: 'MOVE_TASK', projectId: 'project-a', taskId: 'task-a', bucketId: 'bucket-a', targetIndex: 0, updatedAt: timestamp },
      { type: 'MOVE_TASKS', projectId: 'project-a', taskIds: ['task-a'], bucketId: 'bucket-a', targetIndex: 0, updatedAt: timestamp },
      { type: 'DELETE_TASK', projectId: 'project-a', taskId: 'missing-task' },
      { type: 'ARCHIVE_COMPLETED_TASKS', projectId: 'project-a', archivedAt: timestamp },
      { type: 'UNARCHIVE_TASK', projectId: 'project-a', taskId: 'task-a', updatedAt: timestamp },
      { type: 'ADD_TASK_BATCH', tasks: [task('batch-invalid', 'project-a', 'bucket-a'), { ...task('batch-blank', 'project-a', 'bucket-a'), title: '   ' }] },
      { type: 'REPLACE_DATA', data: state },
    ];

    noOpActions.forEach((action) => {
      expect(plannerReducerV2(state, action)).toBe(state);
    });
  });

  it('does not add history for no-op actions', () => {
    const initialState = baseState();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(initialState, plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'DELETE_TASK', projectId: 'project-a', taskId: 'missing-task' });
    });

    expect(result.current.state).toBe(initialState);
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps redo history intact after a no-op action', () => {
    const initialState = baseState();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(initialState, plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'ADD_PROJECT', project: project('project-c', 'C') });
    });

    act(() => {
      result.current.undo();
    });

    const presentAfterUndo = result.current.state;
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.dispatch({ type: 'RENAME_PROJECT', projectId: 'missing-project', name: 'Nope', updatedAt: timestamp });
    });

    expect(result.current.state).toBe(presentAfterUndo);
    expect(result.current.canRedo).toBe(true);
  });

  it('rejects add actions with IDs colliding across any entity type', () => {
    const state: PlannerDataV2 = {
      ...baseState(),
      templates: [
        {
          id: 'template-a',
          name: 'Template',
          description: '',
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      templateDefinitions: [
        {
          id: 'definition-a',
          templateId: 'template-a',
          name: 'Definition',
          description: '',
          priority: 0,
          defaultActive: true,
          position: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    };

    expect(plannerReducerV2(state, { type: 'ADD_PROJECT', project: project('bucket-a', 'Collision') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_BUCKET', bucket: bucket('task-a', 'project-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TASK', task: task('project-a', 'project-a', 'bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TASK', task: task('template-a', 'project-a', 'bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TASK', task: task('definition-a', 'project-a', 'bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, {
      type: 'ADD_TASK_BATCH',
      tasks: [task('batch-task', 'project-a', 'bucket-a'), task('batch-task', 'project-a', 'bucket-a')],
    })).toBe(state);
  });

  it('does not add history for global ID collision rejection', () => {
    const initialState = baseState();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(initialState, plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'ADD_TASK', task: task('project-a', 'project-a', 'bucket-a') });
    });

    expect(result.current.state).toBe(initialState);
    expect(result.current.canUndo).toBe(false);
  });
});
