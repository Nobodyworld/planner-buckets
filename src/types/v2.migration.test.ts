/**
 * Phase 2 Tests: v2 Schema, Migration, Validators
 * 20+ test cases covering schema, migration, validation, and determinism.
 */

import { describe, it, expect } from 'vitest';
import type { PlannerData } from '../types';
import { PLANNER_DATA_VERSION } from '../types';
import type { PlannerDataV2, Priority } from './v2';
import { PLANNER_DATA_V2_VERSION, DEFAULT_PROJECT_ID } from './v2';
import {
  isValidPlannerDataV1,
  isValidPlannerDataV2,
  isValidPriority,
  isValidResourceTag,
  isValidProject,
  isValidBucketV2,
  isValidTaskV2,
  validatePlannerDataV2Integrity,
} from './validators';
import {
  migrateV1toV2,
  normalizeResourceTags,
  detectPlannerVersion,
} from './migration';

describe('Phase 2: v2 Schema and Migration', () => {
  // =========================================================================
  // 1. Empty v1 planner migration
  // =========================================================================
  describe('Empty v1 migration', () => {
    it('migrates empty v1 planner to v2 with default project', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [],
        tasks: [],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.version).toBe(PLANNER_DATA_V2_VERSION);
      expect(v2.projects).toHaveLength(1);
      expect(v2.projects[0].id).toBe(DEFAULT_PROJECT_ID);
      expect(v2.projects[0].name).toBe('My Planner');
      expect(v2.buckets).toHaveLength(0);
      expect(v2.tasks).toHaveLength(0);
      expect(v2.templateDefinitions).toHaveLength(0);
    });
  });

  // =========================================================================
  // 2. Migration with multiple buckets
  // =========================================================================
  describe('Multiple buckets migration', () => {
    it('preserves all buckets in default project', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [
          { id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true },
          { id: 'b2', name: 'In Progress', createdAt: '2026-01-02T00:00:00Z', pinned: false },
          { id: 'b3', name: 'Done', createdAt: '2026-01-03T00:00:00Z', pinned: false },
        ],
        tasks: [],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.buckets).toHaveLength(3);
      expect(v2.buckets[0].id).toBe('b1');
      expect(v2.buckets[0].projectId).toBe(DEFAULT_PROJECT_ID);
      expect(v2.buckets[0].name).toBe('To Do');
      expect(v2.buckets[0].pinned).toBe(true);
      expect(v2.buckets[1].id).toBe('b2');
      expect(v2.buckets[2].id).toBe('b3');
    });
  });

  // =========================================================================
  // 3. Migration with assigned and unassigned tasks
  // =========================================================================
  describe('Assigned and unassigned tasks migration', () => {
    it('preserves assigned tasks and unassigned (bucketId: null) tasks', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [{ id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true }],
        tasks: [
          {
            id: 't1',
            title: 'Assigned task',
            description: 'In bucket',
            bucketId: 'b1',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 't2',
            title: 'Unassigned task',
            description: 'No bucket',
            bucketId: null,
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.tasks).toHaveLength(2);
      expect(v2.tasks[0].bucketId).toBe('b1');
      expect(v2.tasks[0].projectId).toBe(DEFAULT_PROJECT_ID);
      expect(v2.tasks[1].bucketId).toBeNull();
      expect(v2.tasks[1].projectId).toBe(DEFAULT_PROJECT_ID);
    });
  });

  // =========================================================================
  // 4. ID preservation
  // =========================================================================
  describe('ID preservation', () => {
    it('preserves all bucket and task IDs exactly', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [
          { id: 'bucket-abc-123', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true },
        ],
        tasks: [
          {
            id: 'task-xyz-789',
            title: 'Task',
            description: '',
            bucketId: 'bucket-abc-123',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.buckets[0].id).toBe('bucket-abc-123');
      expect(v2.tasks[0].id).toBe('task-xyz-789');
    });
  });

  // =========================================================================
  // 5. Timestamp and archive-state preservation
  // =========================================================================
  describe('Timestamp and archive preservation', () => {
    it('preserves createdAt, updatedAt, and archivedAt', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [],
        tasks: [
          {
            id: 't1',
            title: 'Archived task',
            description: '',
            bucketId: null,
            pinned: false,
            completed: true,
            archivedAt: '2026-01-15T12:30:00Z',
            createdAt: '2026-01-01T08:00:00Z',
            updatedAt: '2026-01-15T12:30:00Z',
          },
        ],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.tasks[0].createdAt).toBe('2026-01-01T08:00:00Z');
      expect(v2.tasks[0].updatedAt).toBe('2026-01-15T12:30:00Z');
      expect(v2.tasks[0].archivedAt).toBe('2026-01-15T12:30:00Z');
    });
  });

  // =========================================================================
  // 6. Pin and ordering preservation
  // =========================================================================
  describe('Pin and ordering preservation', () => {
    it('preserves pin state and array ordering', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [
          { id: 'b1', name: 'Pinned', createdAt: '2026-01-01T00:00:00Z', pinned: true },
          { id: 'b2', name: 'Unpinned', createdAt: '2026-01-02T00:00:00Z', pinned: false },
          { id: 'b3', name: 'Pinned 2', createdAt: '2026-01-03T00:00:00Z', pinned: true },
        ],
        tasks: [],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.buckets[0].pinned).toBe(true);
      expect(v2.buckets[1].pinned).toBe(false);
      expect(v2.buckets[2].pinned).toBe(true);
      expect(v2.buckets.map(b => b.id)).toEqual(['b1', 'b2', 'b3']);
    });
  });

  // =========================================================================
  // 7. Default priority and resource-tag values
  // =========================================================================
  describe('Default values', () => {
    it('initializes priority to 0 and resource tags to empty array', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [{ id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
        tasks: [
          {
            id: 't1',
            title: 'Task',
            description: '',
            bucketId: 'b1',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const v2 = migrateV1toV2(v1);

      expect(v2.buckets[0].priority).toBe(0);
      expect(v2.tasks[0].priority).toBe(0);
      expect(v2.tasks[0].resourceTags).toEqual([]);
    });
  });

  // =========================================================================
  // 8. Deterministic output
  // =========================================================================
  describe('Determinism', () => {
    it('produces identical output for identical input', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [
          { id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true },
          { id: 'b2', name: 'Done', createdAt: '2026-01-02T00:00:00Z', pinned: false },
        ],
        tasks: [
          {
            id: 't1',
            title: 'Task 1',
            description: 'Description',
            bucketId: 'b1',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 't2',
            title: 'Task 2',
            description: '',
            bucketId: null,
            pinned: true,
            completed: true,
            archivedAt: '2026-01-05T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-05T00:00:00Z',
          },
        ],
      };

      const result1 = migrateV1toV2(v1);
      const result2 = migrateV1toV2(v1);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // =========================================================================
  // 9. Input immutability
  // =========================================================================
  describe('Input immutability', () => {
    it('does not modify input v1 data', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [{ id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true }],
        tasks: [],
      };

      const originalString = JSON.stringify(v1);
      migrateV1toV2(v1);
      const afterString = JSON.stringify(v1);

      expect(afterString).toBe(originalString);
    });
  });

  // =========================================================================
  // 10. Valid v1 detection
  // =========================================================================
  describe('v1 validation', () => {
    it('validates valid v1 data', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [{ id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true }],
        tasks: [],
      };

      expect(isValidPlannerDataV1(v1)).toBe(true);
    });

    it('rejects malformed v1 data', () => {
      expect(isValidPlannerDataV1({ version: 1, buckets: 'not an array', tasks: [] })).toBe(false);
      expect(isValidPlannerDataV1({ version: 2, buckets: [], tasks: [] })).toBe(false);
      expect(isValidPlannerDataV1(null)).toBe(false);
    });
  });

  // =========================================================================
  // 11. Valid v2 detection
  // =========================================================================
  describe('v2 validation', () => {
    it('validates valid v2 data', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [],
        tasks: [],
      };

      const v2 = migrateV1toV2(v1);
      expect(isValidPlannerDataV2(v2)).toBe(true);
    });

    it('rejects malformed v2 data', () => {
      expect(isValidPlannerDataV2({ version: 2, projects: 'not an array', buckets: [], tasks: [] })).toBe(false);
      expect(isValidPlannerDataV2({ version: 1, projects: [], buckets: [], tasks: [] })).toBe(false);
    });
  });

  // =========================================================================
  // 12. Rejection of malformed versions
  // =========================================================================
  describe('Version rejection', () => {
    it('rejects malformed version values', () => {
      expect(isValidPlannerDataV1({ version: 2, buckets: [], tasks: [] })).toBe(false);
      expect(isValidPlannerDataV2({ version: 1, projects: [], buckets: [], tasks: [] })).toBe(false);
      expect(isValidPlannerDataV1({ version: 'v1', buckets: [], tasks: [] })).toBe(false);
    });

    it('detects version correctly', () => {
      expect(detectPlannerVersion({ version: 1 })).toBe(1);
      expect(detectPlannerVersion({ version: 2 })).toBe(2);
      expect(detectPlannerVersion({ version: 3 })).toBe('unknown');
      expect(detectPlannerVersion(null)).toBe('unknown');
    });
  });

  // =========================================================================
  // 13. Rejection of orphan buckets
  // =========================================================================
  describe('Orphan bucket rejection', () => {
    it('rejects v2 data with buckets referencing missing projects', () => {
      const v2: PlannerDataV2 = {
        version: PLANNER_DATA_V2_VERSION,
        projects: [
          {
            id: DEFAULT_PROJECT_ID,
            name: 'Project',
            description: '',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        buckets: [
          {
            id: 'b1',
            projectId: 'missing-project',
            name: 'To Do',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        tasks: [],
        templateDefinitions: [],
      };

      expect(() => validatePlannerDataV2Integrity(v2)).toThrow('missing project');
    });
  });

  // =========================================================================
  // 14. Rejection of orphan tasks
  // =========================================================================
  describe('Orphan task rejection', () => {
    it('rejects v2 data with tasks referencing missing projects', () => {
      const v2: PlannerDataV2 = {
        version: PLANNER_DATA_V2_VERSION,
        projects: [
          {
            id: DEFAULT_PROJECT_ID,
            name: 'Project',
            description: '',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        buckets: [],
        tasks: [
          {
            id: 't1',
            projectId: 'missing-project',
            bucketId: null,
            title: 'Task',
            description: '',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        templateDefinitions: [],
      };

      expect(() => validatePlannerDataV2Integrity(v2)).toThrow('missing project');
    });
  });

  // =========================================================================
  // 15. Rejection of cross-project bucket/task relationships
  // =========================================================================
  describe('Cross-project relationship rejection', () => {
    it('rejects tasks referencing buckets in different projects', () => {
      const v2: PlannerDataV2 = {
        version: PLANNER_DATA_V2_VERSION,
        projects: [
          {
            id: 'p1',
            name: 'Project 1',
            description: '',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'p2',
            name: 'Project 2',
            description: '',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        buckets: [
          {
            id: 'b1',
            projectId: 'p1',
            name: 'To Do',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        tasks: [
          {
            id: 't1',
            projectId: 'p2',
            bucketId: 'b1',
            title: 'Task',
            description: '',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        templateDefinitions: [],
      };

      expect(() => validatePlannerDataV2Integrity(v2)).toThrow('not in its project');
    });
  });

  // =========================================================================
  // 16. Rejection of duplicate IDs
  // =========================================================================
  describe('Duplicate ID rejection', () => {
    it('rejects v2 data with duplicate IDs across entities', () => {
      const v2: PlannerDataV2 = {
        version: PLANNER_DATA_V2_VERSION,
        projects: [
          {
            id: 'shared-id',
            name: 'Project',
            description: '',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        buckets: [
          {
            id: 'shared-id',
            projectId: 'shared-id',
            name: 'To Do',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        tasks: [],
        templateDefinitions: [],
      };

      expect(() => validatePlannerDataV2Integrity(v2)).toThrow('Duplicate');
    });
  });

  // =========================================================================
  // 17. Priority validation
  // =========================================================================
  describe('Priority validation', () => {
    it('validates valid priorities 0-3', () => {
      expect(isValidPriority(0)).toBe(true);
      expect(isValidPriority(1)).toBe(true);
      expect(isValidPriority(2)).toBe(true);
      expect(isValidPriority(3)).toBe(true);
    });

    it('rejects invalid priorities', () => {
      expect(isValidPriority(-1)).toBe(false);
      expect(isValidPriority(4)).toBe(false);
      expect(isValidPriority('high')).toBe(false);
    });
  });

  // =========================================================================
  // 18. Resource-tag normalization
  // =========================================================================
  describe('Resource tag normalization', () => {
    it('normalizes tags: trim, lowercase, deduplicate, sort', () => {
      const tags = ['  Work  ', 'work', 'URGENT', 'urgent', 'Personal'];
      const normalized = normalizeResourceTags(tags);
      
      expect(normalized).toEqual(['personal', 'urgent', 'work']);
      expect(isValidResourceTag(normalized[0])).toBe(true);
    });

    it('removes empty tags', () => {
      const tags = ['Tag1', '', '  ', 'Tag2'];
      const normalized = normalizeResourceTags(tags);
      
      expect(normalized).toEqual(['tag1', 'tag2']);
    });

    it('handles non-string input', () => {
      expect(normalizeResourceTags([1, true, null])).toEqual([]);
    });
  });

  // =========================================================================
  // 19. v2 JSON serialization round-trip
  // =========================================================================
  describe('v2 JSON round-trip', () => {
    it('preserves v2 data through JSON serialization and parse', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [{ id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true }],
        tasks: [
          {
            id: 't1',
            title: 'Task',
            description: 'Test',
            bucketId: 'b1',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const v2 = migrateV1toV2(v1);
      const serialized = JSON.stringify(v2);
      const parsed = JSON.parse(serialized) as PlannerDataV2;

      expect(isValidPlannerDataV2(parsed)).toBe(true);
      expect(parsed).toEqual(v2);
    });
  });

  // =========================================================================
  // 20. Representative real v1 fixture migration
  // =========================================================================
  describe('Real fixture migration', () => {
    it('migrates representative v1 fixture with all features', () => {
      const v1: PlannerData = {
        version: PLANNER_DATA_VERSION,
        buckets: [
          { id: 'bucket-todo', name: 'To Do', createdAt: '2026-01-01T09:00:00Z', pinned: true },
          { id: 'bucket-wip', name: 'In Progress', createdAt: '2026-01-01T09:15:00Z', pinned: false },
          { id: 'bucket-done', name: 'Done', createdAt: '2026-01-01T09:30:00Z', pinned: false },
        ],
        tasks: [
          {
            id: 'task-1',
            title: 'Implement feature',
            description: 'Build new component',
            bucketId: 'bucket-wip',
            pinned: true,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-03T14:30:00Z',
          },
          {
            id: 'task-2',
            title: 'Write tests',
            description: 'Unit tests for component',
            bucketId: 'bucket-todo',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T10:30:00Z',
            updatedAt: '2026-01-02T10:30:00Z',
          },
          {
            id: 'task-3',
            title: 'Deploy',
            description: 'Push to production',
            bucketId: 'bucket-done',
            pinned: false,
            completed: true,
            archivedAt: '2026-01-04T16:00:00Z',
            createdAt: '2026-01-01T08:00:00Z',
            updatedAt: '2026-01-04T16:00:00Z',
          },
          {
            id: 'task-4',
            title: 'Unassigned idea',
            description: 'Think about this later',
            bucketId: null,
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-05T11:00:00Z',
            updatedAt: '2026-01-05T11:00:00Z',
          },
        ],
      };

      const v2 = migrateV1toV2(v1);

      // Verify structure
      expect(isValidPlannerDataV2(v2)).toBe(true);
      expect(v2.projects).toHaveLength(1);
      expect(v2.projects[0].id).toBe(DEFAULT_PROJECT_ID);
      expect(v2.buckets).toHaveLength(3);
      expect(v2.tasks).toHaveLength(4);

      // Verify preservation
      expect(v2.buckets.map(b => b.id)).toEqual(['bucket-todo', 'bucket-wip', 'bucket-done']);
      expect(v2.tasks.map(t => t.id)).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);

      // Verify specific details
      expect(v2.tasks[0].pinned).toBe(true);
      expect(v2.tasks[2].completed).toBe(true);
      expect(v2.tasks[2].archivedAt).toBe('2026-01-04T16:00:00Z');
      expect(v2.tasks[3].bucketId).toBeNull();

      // Verify all tasks are in default project
      expect(v2.tasks.every(t => t.projectId === DEFAULT_PROJECT_ID)).toBe(true);
    });
  });
});
