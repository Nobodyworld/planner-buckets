/**
 * Phase 2 Tests: v2 Schema, Migration, Validators
 * 40+ test cases covering schema, migration, validation, determinism, and templates.
 */

import { describe, it, expect, vi } from 'vitest';
import type { PlannerData } from '../types';
import { PLANNER_DATA_VERSION } from '../types';
import type { PlannerDataV2, Priority } from './v2';
import { PLANNER_DATA_V2_VERSION, DEFAULT_PROJECT_ID, MIGRATION_FALLBACK_TIMESTAMP } from './v2';
import {
    isValidPlannerDataV1,
    isPlannerDataV2Shape,
    isValidPlannerDataV2,
    isValidPriority,
    isValidResourceTag,
    isValidProject,
    isValidBucketTemplate,
    isValidBucketTemplateDefinition,
    isValidBucketV2,
    isValidTaskV2,
    validatePlannerDataV2Integrity,
} from './validators';
import {
    migrateV1toV2,
    normalizeResourceTags,
    detectPlannerVersion,
    deriveMigrationTimestamps,
    selectProjectId,
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
            expect(v2.templates).toHaveLength(0);
            expect(v2.templateDefinitions).toHaveLength(0);
        });

        it('uses migration fallback timestamp for empty v1 data', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [],
                tasks: [],
            };

            const v2 = migrateV1toV2(v1);

            expect(v2.projects[0].createdAt).toBe(MIGRATION_FALLBACK_TIMESTAMP);
            expect(v2.projects[0].updatedAt).toBe(MIGRATION_FALLBACK_TIMESTAMP);
        });
    });

    // =========================================================================
    // 2. Migration timestamp derivation
    // =========================================================================
    describe('Deterministic timestamp derivation', () => {
        it('derives earliest createdAt and latest updatedAt from v1 data', () => {
            const buckets = [
                { createdAt: '2026-06-15T10:00:00Z' },
                { createdAt: '2026-06-10T08:00:00Z' }, // earliest
            ];
            const tasks = [
                { createdAt: '2026-06-20T00:00:00Z', updatedAt: '2026-06-25T23:59:59Z', archivedAt: null }, // latest
                { createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z', archivedAt: null },
            ];

            const [createdAt, updatedAt] = deriveMigrationTimestamps(buckets, tasks);

            expect(createdAt).toBe('2026-06-10T08:00:00Z');
            expect(updatedAt).toBe('2026-06-25T23:59:59Z');
        });

        it('uses fallback timestamp when no valid timestamps exist', () => {
            const [createdAt, updatedAt] = deriveMigrationTimestamps([], []);

            expect(createdAt).toBe(MIGRATION_FALLBACK_TIMESTAMP);
            expect(updatedAt).toBe(MIGRATION_FALLBACK_TIMESTAMP);
        });

        it('includes archived timestamps in derivation', () => {
            const buckets = [{ createdAt: '2026-06-10T00:00:00Z' }];
            const tasks = [
                { createdAt: '2026-06-15T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z', archivedAt: '2026-06-30T00:00:00Z' }, // latest
            ];

            const [createdAt, updatedAt] = deriveMigrationTimestamps(buckets, tasks);

            expect(createdAt).toBe('2026-06-10T00:00:00Z');
            expect(updatedAt).toBe('2026-06-30T00:00:00Z');
        });
    });

    // =========================================================================
    // 3. Determinism across system time
    // =========================================================================
    describe('Determinism independent of system time', () => {
        it('produces identical output regardless of system time', () => {
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

            // First migration
            const result1 = migrateV1toV2(v1);
            const json1 = JSON.stringify(result1);

            // Mock system time
            const futureDate = new Date();
            futureDate.setFullYear(2099);
            vi.useFakeTimers();
            vi.setSystemTime(futureDate);

            // Second migration with same input but different system time
            const result2 = migrateV1toV2(v1);
            const json2 = JSON.stringify(result2);

            vi.useRealTimers();

            expect(json1).toBe(json2);
        });

        it('produces identical output on repeated calls', () => {
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
                ],
            };

            const results = [
                JSON.stringify(migrateV1toV2(v1)),
                JSON.stringify(migrateV1toV2(v1)),
                JSON.stringify(migrateV1toV2(v1)),
            ];

            // All results must be identical
            expect(results[0]).toBe(results[1]);
            expect(results[1]).toBe(results[2]);
        });
    });

    // =========================================================================
    // 4. Migration with multiple buckets
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
    // 5. Migration with assigned and unassigned tasks
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
    // 6. ID preservation
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
    // 7. Timestamp and archive preservation
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
    // 8. Pin and ordering preservation
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
    // 9. Default values
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
            expect(v2.buckets[0].templateDefinitionId).toBeNull();
        });
    });

    // =========================================================================
    // 10. Deterministic output (repeat test for emphasis)
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
    // 11. Input immutability
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
    // 12. Version detection
    // =========================================================================
    describe('Version detection', () => {
        it('detects v1, v2, and unknown versions', () => {
            expect(detectPlannerVersion({ version: 1 })).toBe(1);
            expect(detectPlannerVersion({ version: 2 })).toBe(2);
            expect(detectPlannerVersion({ version: 3 })).toBe('unknown');
            expect(detectPlannerVersion(null)).toBe('unknown');
        });
    });

    // =========================================================================
    // 13. v1 validation
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
    // 14. Structural v2 validation (shape only)
    // =========================================================================
    describe('v2 structural validation', () => {
        it('validates v2 shape without relational checks', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [],
                tasks: [],
            };

            const v2 = migrateV1toV2(v1);
            expect(isPlannerDataV2Shape(v2)).toBe(true);
        });

        it('rejects malformed v2 structure', () => {
            expect(isPlannerDataV2Shape({ version: 2, projects: 'not an array', buckets: [], tasks: [], templates: [], templateDefinitions: [] })).toBe(false);
            expect(isPlannerDataV2Shape({ version: 1, projects: [], buckets: [], tasks: [], templates: [], templateDefinitions: [] })).toBe(false);
        });
    });

    // =========================================================================
    // 15. Complete v2 validation (structure + relational)
    // =========================================================================
    describe('v2 complete validation', () => {
        it('accepts valid complete v2 data', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [],
                tasks: [],
            };

            const v2 = migrateV1toV2(v1);
            expect(isValidPlannerDataV2(v2)).toBe(true);
        });

        it('rejects v2 data with orphan buckets', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [],
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
                templates: [],
                templateDefinitions: [],
            };

            expect(isValidPlannerDataV2(v2)).toBe(false);
        });

        it('rejects v2 data with relational violations', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'p1',
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
                        projectId: 'p1',
                        name: 'Bucket',
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
                        projectId: 'different-project',
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
                templates: [],
                templateDefinitions: [],
            };

            expect(isValidPlannerDataV2(v2)).toBe(false);
        });
    });

    // =========================================================================
    // 16. Canonical resource tag validation
    // =========================================================================
    describe('Canonical resource tag validation', () => {
        it('accepts canonical tags (lowercase, trimmed, non-empty)', () => {
            expect(isValidResourceTag('github')).toBe(true);
            expect(isValidResourceTag('work')).toBe(true);
            expect(isValidResourceTag('a')).toBe(true);
        });

        it('rejects non-canonical tags', () => {
            expect(isValidResourceTag('GitHub')).toBe(false); // uppercase
            expect(isValidResourceTag('GITHUB')).toBe(false); // uppercase
            expect(isValidResourceTag('  github')).toBe(false); // leading whitespace
            expect(isValidResourceTag('github  ')).toBe(false); // trailing whitespace
            expect(isValidResourceTag('')).toBe(false); // empty
            expect(isValidResourceTag('   ')).toBe(false); // whitespace only
        });
    });

    // =========================================================================
    // 17. Tag normalization
    // =========================================================================
    describe('Resource tag normalization', () => {
        it('normalizes tags: trim, lowercase, deduplicate, sort', () => {
            const tags = ['  Work  ', 'work', 'URGENT', 'urgent', 'Personal'];
            const normalized = normalizeResourceTags(tags);

            expect(normalized).toEqual(['personal', 'urgent', 'work']);
            expect(normalized.every(t => isValidResourceTag(t))).toBe(true);
        });

        it('removes empty tags', () => {
            const tags = ['Tag1', '', '  ', 'Tag2'];
            const normalized = normalizeResourceTags(tags);

            expect(normalized).toEqual(['tag1', 'tag2']);
        });

        it('handles non-string input', () => {
            expect(normalizeResourceTags([1, true, null])).toEqual([]);
        });

        it('returns sorted array for deterministic ordering', () => {
            const tags1 = ['z', 'a', 'm'];
            const tags2 = ['m', 'z', 'a'];
            const tags3 = ['a', 'm', 'z'];

            expect(normalizeResourceTags(tags1)).toEqual(normalizeResourceTags(tags2));
            expect(normalizeResourceTags(tags2)).toEqual(normalizeResourceTags(tags3));
            expect(normalizeResourceTags(tags1)).toEqual(['a', 'm', 'z']);
        });
    });

    // =========================================================================
    // 18. Task validation with tag constraints
    // =========================================================================
    describe('Task validation with resource tags', () => {
        it('rejects tasks with non-canonical tags', () => {
            const task = {
                id: 't1',
                projectId: 'p1',
                bucketId: null,
                title: 'Task',
                description: '',
                priority: 0 as Priority,
                resourceTags: ['GitHub'] as any[], // non-canonical
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidTaskV2(task)).toBe(false);
        });

        it('rejects tasks with duplicate tags', () => {
            const task = {
                id: 't1',
                projectId: 'p1',
                bucketId: null,
                title: 'Task',
                description: '',
                priority: 0 as Priority,
                resourceTags: ['work', 'work'] as any[], // duplicate
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidTaskV2(task)).toBe(false);
        });

        it('rejects tasks with unsorted tags', () => {
            const task = {
                id: 't1',
                projectId: 'p1',
                bucketId: null,
                title: 'Task',
                description: '',
                priority: 0 as Priority,
                resourceTags: ['work', 'personal', 'github'] as any[], // unsorted
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidTaskV2(task)).toBe(false);
        });

        it('accepts tasks with canonical, sorted tags', () => {
            const task = {
                id: 't1',
                projectId: 'p1',
                bucketId: null,
                title: 'Task',
                description: '',
                priority: 0 as Priority,
                resourceTags: ['github', 'personal', 'work'] as any[], // sorted
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidTaskV2(task)).toBe(true);
        });
    });

    // =========================================================================
    // 19. Priority validation
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
    // 20. Template validation
    // =========================================================================
    describe('Template validation', () => {
        it('validates valid bucket templates', () => {
            const template = {
                id: 't1',
                name: 'Work',
                description: 'Work tasks',
                active: true,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidBucketTemplate(template)).toBe(true);
        });

        it('rejects templates with invalid active field', () => {
            const template = {
                id: 't1',
                name: 'Work',
                description: 'Work tasks',
                active: 'yes' as any,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidBucketTemplate(template)).toBe(false);
        });

        it('rejects templates with inactive templates remaining valid', () => {
            const inactiveTemplate = {
                id: 't1',
                name: 'Old Template',
                description: 'Inactive',
                active: false,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            // Inactive templates are still valid data structures
            expect(isValidBucketTemplate(inactiveTemplate)).toBe(true);
        });
    });

    // =========================================================================
    // 21. Template definition validation
    // =========================================================================
    describe('Template definition validation', () => {
        it('validates valid template definitions', () => {
            const def = {
                id: 'd1',
                templateId: 't1',
                name: 'To Do',
                description: 'To do bucket',
                priority: 1 as Priority,
                defaultActive: true,
                position: 0,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidBucketTemplateDefinition(def)).toBe(true);
        });

        it('rejects definitions with invalid position', () => {
            const def = {
                id: 'd1',
                templateId: 't1',
                name: 'To Do',
                description: '',
                priority: 1 as Priority,
                defaultActive: true,
                position: -1,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidBucketTemplateDefinition(def)).toBe(false);
        });

        it('rejects definitions with invalid defaultActive', () => {
            const def = {
                id: 'd1',
                templateId: 't1',
                name: 'To Do',
                description: '',
                priority: 1 as Priority,
                defaultActive: 'yes' as any,
                position: 0,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            };

            expect(isValidBucketTemplateDefinition(def)).toBe(false);
        });

        it('rejects definitions referencing missing templates', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'p1',
                        name: 'Project',
                        description: '',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                buckets: [],
                tasks: [],
                templates: [],
                templateDefinitions: [
                    {
                        id: 'd1',
                        templateId: 'missing-template',
                        name: 'To Do',
                        description: '',
                        priority: 0,
                        defaultActive: true,
                        position: 0,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('missing template');
        });
    });

    // =========================================================================
    // 22. v2 JSON round-trip
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
    // 23. Representative real v1 fixture migration
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

    // =========================================================================
    // 24. Global ID uniqueness (templates included)
    // =========================================================================
    describe('Global ID uniqueness enforcement', () => {
        it('rejects template ID colliding with project ID', () => {
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
                buckets: [],
                tasks: [],
                templates: [
                    {
                        id: 'shared-id', // Collision!
                        name: 'Template',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                templateDefinitions: [],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('Duplicate template ID');
        });

        it('rejects template ID colliding with bucket ID', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'p1',
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
                        projectId: 'p1',
                        name: 'Bucket',
                        description: '',
                        templateDefinitionId: null,
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                tasks: [],
                templates: [
                    {
                        id: 'shared-id', // Collision with bucket!
                        name: 'Template',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                templateDefinitions: [],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('Duplicate template ID');
        });

        it('rejects template ID colliding with task ID', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'p1',
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
                        id: 'shared-id',
                        projectId: 'p1',
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
                templates: [
                    {
                        id: 'shared-id', // Collision with task!
                        name: 'Template',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                templateDefinitions: [],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('Duplicate template ID');
        });

        it('rejects template ID colliding with template definition ID', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'p1',
                        name: 'Project',
                        description: '',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                buckets: [],
                tasks: [],
                templates: [
                    {
                        id: 'shared-id',
                        name: 'Template',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                templateDefinitions: [
                    {
                        id: 'shared-id', // Collision with template!
                        templateId: 'shared-id',
                        name: 'Definition',
                        description: '',
                        priority: 0,
                        defaultActive: true,
                        position: 0,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('Duplicate template definition ID');
        });

        it('accepts non-colliding template IDs across all entities', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'p1',
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
                        projectId: 'p1',
                        name: 'Bucket',
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
                        projectId: 'p1',
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
                templates: [
                    {
                        id: 'tmpl1',
                        name: 'Template',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                templateDefinitions: [
                    {
                        id: 'def1',
                        templateId: 'tmpl1',
                        name: 'Definition',
                        description: '',
                        priority: 0,
                        defaultActive: true,
                        position: 0,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).not.toThrow();
        });
    });

    describe('Project template-definition linkage uniqueness', () => {
        it('rejects duplicate linked buckets in one project', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'project-a',
                        name: 'Project A',
                        description: '',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                buckets: [
                    {
                        id: 'bucket-a-1',
                        projectId: 'project-a',
                        name: 'Ready A',
                        description: '',
                        templateDefinitionId: 'definition-ready',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                    {
                        id: 'bucket-a-2',
                        projectId: 'project-a',
                        name: 'Ready B',
                        description: '',
                        templateDefinitionId: 'definition-ready',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                tasks: [],
                templates: [
                    {
                        id: 'template-launch',
                        name: 'Launch',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
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
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('duplicate linked buckets');
        });

        it('rejects duplicate linked buckets in one project even with different names', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'project-a',
                        name: 'Project A',
                        description: '',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                buckets: [
                    {
                        id: 'bucket-a-1',
                        projectId: 'project-a',
                        name: 'Ready Lane',
                        description: '',
                        templateDefinitionId: 'definition-ready',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                    {
                        id: 'bucket-a-2',
                        projectId: 'project-a',
                        name: 'Completely Different Name',
                        description: '',
                        templateDefinitionId: 'definition-ready',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                tasks: [],
                templates: [
                    {
                        id: 'template-launch',
                        name: 'Launch',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
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
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).toThrow('duplicate linked buckets');
        });

        it('accepts the same definition used once in multiple projects', () => {
            const v2: PlannerDataV2 = {
                version: PLANNER_DATA_V2_VERSION,
                projects: [
                    {
                        id: 'project-a',
                        name: 'Project A',
                        description: '',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                    {
                        id: 'project-b',
                        name: 'Project B',
                        description: '',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                buckets: [
                    {
                        id: 'bucket-a-1',
                        projectId: 'project-a',
                        name: 'Ready A',
                        description: '',
                        templateDefinitionId: 'definition-ready',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                    {
                        id: 'bucket-b-1',
                        projectId: 'project-b',
                        name: 'Ready B',
                        description: '',
                        templateDefinitionId: 'definition-ready',
                        priority: 0,
                        pinned: false,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
                tasks: [],
                templates: [
                    {
                        id: 'template-launch',
                        name: 'Launch',
                        description: '',
                        active: true,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
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
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            expect(() => validatePlannerDataV2Integrity(v2)).not.toThrow();
        });
    });

    // =========================================================================
    // 25. Project ID collision handling
    // =========================================================================
    describe('Deterministic project ID selection', () => {
        it('selects project-default when no collision', () => {
            const existingIds = new Set(['bucket-1', 'task-1']);
            const selectedId = selectProjectId(existingIds);

            expect(selectedId).toBe(DEFAULT_PROJECT_ID);
        });

        it('selects project-default-2 when project-default occupied by bucket', () => {
            const existingIds = new Set([DEFAULT_PROJECT_ID, 'task-1']);
            const selectedId = selectProjectId(existingIds);

            expect(selectedId).toBe('project-default-2');
            expect(!existingIds.has(selectedId)).toBe(true);
        });

        it('selects project-default-2 when project-default occupied by task', () => {
            const existingIds = new Set(['bucket-1', DEFAULT_PROJECT_ID]);
            const selectedId = selectProjectId(existingIds);

            expect(selectedId).toBe('project-default-2');
        });

        it('increments deterministically through multiple occupied candidates', () => {
            const existingIds = new Set([
                DEFAULT_PROJECT_ID,
                'project-default-2',
                'project-default-3',
            ]);
            const selectedId = selectProjectId(existingIds);

            expect(selectedId).toBe('project-default-4');
        });

        it('produces deterministic output for identical input', () => {
            const existingIds = new Set([DEFAULT_PROJECT_ID, 'project-default-2']);

            const result1 = selectProjectId(existingIds);
            const result2 = selectProjectId(existingIds);
            const result3 = selectProjectId(existingIds);

            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
            expect(result1).toBe('project-default-3');
        });
    });

    // =========================================================================
    // 26. Migration with project ID collision handling
    // =========================================================================
    describe('Migration with project ID collision', () => {
        it('uses alternate project ID when default collides with bucket ID', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    {
                        id: DEFAULT_PROJECT_ID, // Collision!
                        name: 'To Do',
                        createdAt: '2026-01-01T00:00:00Z',
                        pinned: true,
                    },
                ],
                tasks: [],
            };

            const v2 = migrateV1toV2(v1);

            // Should use alternate ID
            expect(v2.projects[0].id).not.toBe(DEFAULT_PROJECT_ID);
            expect(v2.projects[0].id).toBe('project-default-2');
            expect(v2.buckets[0].projectId).toBe('project-default-2');
        });

        it('uses alternate project ID when default collides with task ID', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: 'bucket-1', name: 'Bucket', createdAt: '2026-01-01T00:00:00Z', pinned: false },
                ],
                tasks: [
                    {
                        id: DEFAULT_PROJECT_ID, // Collision!
                        title: 'Task',
                        description: '',
                        bucketId: 'bucket-1',
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            const v2 = migrateV1toV2(v1);

            expect(v2.projects[0].id).toBe('project-default-2');
            expect(v2.buckets[0].projectId).toBe('project-default-2');
            expect(v2.tasks[0].projectId).toBe('project-default-2');
        });

        it('handles multiple collisions and selects next available ID', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: DEFAULT_PROJECT_ID, name: 'B1', createdAt: '2026-01-01T00:00:00Z', pinned: true },
                    { id: 'project-default-2', name: 'B2', createdAt: '2026-01-02T00:00:00Z', pinned: false },
                ],
                tasks: [],
            };

            const v2 = migrateV1toV2(v1);

            expect(v2.projects[0].id).toBe('project-default-3');
            expect(v2.buckets.every(b => b.projectId === 'project-default-3')).toBe(true);
        });

        it('maintains deterministic migration with alternate project ID', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [{ id: DEFAULT_PROJECT_ID, name: 'Bucket', createdAt: '2026-01-01T00:00:00Z', pinned: false }],
                tasks: [],
            };

            const result1 = migrateV1toV2(v1);
            const result2 = migrateV1toV2(v1);

            expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
            expect(result1.projects[0].id).toBe('project-default-2');
        });

        it('validates output with alternate project ID', () => {
            const v1: PlannerData = {
                version: PLANNER_DATA_VERSION,
                buckets: [
                    { id: DEFAULT_PROJECT_ID, name: 'Bucket', createdAt: '2026-01-01T00:00:00Z', pinned: false },
                ],
                tasks: [
                    {
                        id: 't1',
                        title: 'Task',
                        description: '',
                        bucketId: DEFAULT_PROJECT_ID,
                        pinned: false,
                        completed: false,
                        archivedAt: null,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };

            const v2 = migrateV1toV2(v1);

            // Must pass complete validation even with alternate ID
            expect(isValidPlannerDataV2(v2)).toBe(true);
            expect(() => validatePlannerDataV2Integrity(v2)).not.toThrow();
        });
    });
});
