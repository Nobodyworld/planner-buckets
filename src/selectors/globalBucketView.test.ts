import { describe, expect, it } from 'vitest';
import type { PlannerDataV2 } from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import { getGlobalBucketView } from './globalBucketView';

const timestamp = '2026-07-01T00:00:00.000Z';

const createData = (): PlannerDataV2 => ({
  version: PLANNER_DATA_V2_VERSION,
  projects: [
    {
      id: 'project-a',
      name: 'Alpha',
      description: '',
      priority: 0,
      pinned: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'project-b',
      name: 'Beta',
      description: '',
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  buckets: [
    {
      id: 'bucket-beta-ready',
      projectId: 'project-b',
      name: 'Ready',
      description: '',
      templateDefinitionId: 'definition-ready',
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'bucket-alpha-ready',
      projectId: 'project-a',
      name: 'Ready',
      description: '',
      templateDefinitionId: 'definition-ready',
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'bucket-alpha-done',
      projectId: 'project-a',
      name: 'Done',
      description: '',
      templateDefinitionId: 'definition-done',
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'bucket-private',
      projectId: 'project-a',
      name: 'Private',
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  tasks: [
    {
      id: 'task-open',
      projectId: 'project-a',
      bucketId: 'bucket-alpha-ready',
      title: 'Open',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'task-complete',
      projectId: 'project-a',
      bucketId: 'bucket-alpha-ready',
      title: 'Complete',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: true,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'task-archived',
      projectId: 'project-b',
      bucketId: 'bucket-beta-ready',
      title: 'Archived',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: true,
      archivedAt: '2026-07-02T00:00:00.000Z',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'task-private',
      projectId: 'project-a',
      bucketId: 'bucket-private',
      title: 'Private',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  templates: [
    {
      id: 'template-launch',
      name: 'Launch',
      description: '',
      active: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  templateDefinitions: [
    {
      id: 'definition-ready',
      templateId: 'template-launch',
      name: 'Ready',
      description: '',
      priority: 0,
      defaultActive: true,
      position: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'definition-done',
      templateId: 'template-launch',
      name: 'Done',
      description: '',
      priority: 0,
      defaultActive: false,
      position: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
});

describe('getGlobalBucketView', () => {
  it('groups concrete buckets by shared template definition identity deterministically', () => {
    const groups = getGlobalBucketView(createData());

    expect(groups.map((group) => group.definition.id)).toEqual(['definition-ready', 'definition-done']);
    expect(groups[0].buckets.map((entry) => entry.bucket.id)).toEqual(['bucket-alpha-ready', 'bucket-beta-ready']);
    expect(groups[0].buckets.map((entry) => entry.project.id)).toEqual(['project-a', 'project-b']);
  });

  it('aggregates open completed and archived task counts per shared group', () => {
    const [readyGroup] = getGlobalBucketView(createData());

    expect(readyGroup.aggregateTaskCounts).toEqual({ open: 1, completed: 1, archived: 1 });
    expect(readyGroup.buckets.find((entry) => entry.bucket.id === 'bucket-alpha-ready')?.taskCounts).toEqual({
      open: 1,
      completed: 1,
      archived: 0,
    });
  });

  it('excludes buckets without templateDefinitionId and includes inactive referenced definitions', () => {
    const groups = getGlobalBucketView(createData());

    expect(groups.flatMap((group) => group.buckets).some((entry) => entry.bucket.id === 'bucket-private')).toBe(false);
    expect(groups[0].template.active).toBe(false);
    expect(groups[1].definition.defaultActive).toBe(false);
  });

  it('throws on malformed template-definition references instead of repairing them', () => {
    const data = createData();
    data.buckets[0] = {
      ...data.buckets[0],
      templateDefinitionId: 'missing-definition',
    };

    expect(() => getGlobalBucketView(data)).toThrow('missing template definition');
  });

  it('rejects data with orphan buckets (bucket with missing project)', () => {
    const data = createData();
    data.buckets[0] = {
      ...data.buckets[0],
      projectId: 'missing-project',
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('rejects data with orphan tasks (task with missing project)', () => {
    const data = createData();
    data.tasks[0] = {
      ...data.tasks[0],
      projectId: 'missing-project',
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('rejects data with task referencing missing bucket', () => {
    const data = createData();
    data.tasks[0] = {
      ...data.tasks[0],
      bucketId: 'missing-bucket',
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('rejects data with task-project and bucket-project mismatch', () => {
    const data = createData();
    data.tasks[0] = {
      ...data.tasks[0],
      projectId: 'project-b',
      bucketId: 'bucket-alpha-ready', // bucket belongs to project-a
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('rejects data with missing template for definition', () => {
    const data = createData();
    data.templateDefinitions[0] = {
      ...data.templateDefinitions[0],
      templateId: 'missing-template',
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('rejects data with missing definition in bucket reference', () => {
    const data = createData();
    data.buckets[0] = {
      ...data.buckets[0],
      templateDefinitionId: 'missing-definition',
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('rejects data with duplicate IDs across entity types', () => {
    const data = createData();
    const duplicateId = data.projects[0].id;
    data.buckets[0] = {
      ...data.buckets[0],
      id: duplicateId,
    };

    expect(() => getGlobalBucketView(data)).toThrow();
  });

  it('accepts valid data with template-linked buckets', () => {
    const data = createData();
    // This should not throw
    const result = getGlobalBucketView(data);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});
