import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlannerHistory } from '../hooks/usePlannerHistory';
import type { PlannerDataV2, PlannerTaskV2, Project } from '../types/v2';
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
});
