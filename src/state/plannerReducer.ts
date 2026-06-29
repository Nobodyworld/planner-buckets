import type { PlannerData, TaskDraft } from '../types';
import { createId, normalizePlannerData } from '../storage/plannerStorage';

export type PlannerAction =
  | { type: 'ADD_BUCKET'; name: string; id?: string }
  | { type: 'MOVE_BUCKET'; bucketId: string; targetIndex: number }
  | { type: 'TOGGLE_BUCKET_PIN'; bucketId: string }
  | { type: 'RENAME_BUCKET'; bucketId: string; name: string }
  | { type: 'DELETE_BUCKET'; bucketId: string }
  | { type: 'ADD_TASK'; draft: TaskDraft }
  | { type: 'ADD_TASK_BATCH'; drafts: TaskDraft[] }
  | { type: 'UPDATE_TASK'; taskId: string; draft: TaskDraft }
  | { type: 'TOGGLE_TASK_PIN'; taskId: string }
  | { type: 'DELETE_TASK'; taskId: string }
  | { type: 'TOGGLE_TASK'; taskId: string }
  | {
    type: 'MOVE_TASK';
    taskId: string;
    bucketId: string | null;
    targetIndex?: number;
  }
  | {
    type: 'MOVE_TASKS';
    taskIds: string[];
    bucketId: string | null;
    targetIndex?: number;
  }
  | { type: 'ARCHIVE_COMPLETED_TASKS' }
  | { type: 'UNARCHIVE_TASK'; taskId: string }
  | { type: 'REPLACE_DATA'; data: PlannerData };

const now = (): string => new Date().toISOString();

const normalizeBucketOrder = (buckets: PlannerData['buckets']) => {
  const pinned = buckets.filter((bucket) => bucket.pinned);
  const unpinned = buckets.filter((bucket) => !bucket.pinned);
  return [...pinned, ...unpinned];
};

const moveBucketWithOrder = (
  buckets: PlannerData['buckets'],
  bucketId: string,
  targetIndex: number,
) => {
  const sourceIndex = buckets.findIndex((bucket) => bucket.id === bucketId);
  if (sourceIndex < 0) return buckets;
  const fromBucket = buckets[sourceIndex];

  const withoutMoved = buckets.filter((bucket) => bucket.id !== bucketId);
  const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  const safeIndex = Math.max(0, Math.min(adjustedTargetIndex, withoutMoved.length));
  const groupInsertIndex = withoutMoved
    .slice(0, safeIndex)
    .filter((bucket) => bucket.pinned === fromBucket.pinned).length;
  const sameGroup = withoutMoved.filter(
    (bucket) => bucket.pinned === fromBucket.pinned,
  );
  const otherGroup = withoutMoved.filter(
    (bucket) => bucket.pinned !== fromBucket.pinned,
  );
  const reorderedGroup = [
    ...sameGroup.slice(0, groupInsertIndex),
    fromBucket,
    ...sameGroup.slice(groupInsertIndex),
  ];

  return fromBucket.pinned
    ? [...reorderedGroup, ...otherGroup]
    : [...otherGroup, ...reorderedGroup];
};

const toggleBucketPinWithOrder = (
  buckets: PlannerData['buckets'],
  bucketId: string,
) => {
  const currentIndex = buckets.findIndex((bucket) => bucket.id === bucketId);
  if (currentIndex < 0) return buckets;

  const target = buckets[currentIndex];
  const willPin = !target.pinned;
  const updated = { ...target, pinned: willPin };
  const withoutTarget = buckets.filter((bucket) => bucket.id !== bucketId);
  const pinned = withoutTarget.filter((bucket) => bucket.pinned);
  const unpinned = withoutTarget.filter((bucket) => !bucket.pinned);

  if (!willPin) {
    return [...pinned, updated, ...unpinned];
  }

  return [...pinned, updated, ...unpinned];
};

const moveTaskWithOrder = (
  tasks: PlannerData['tasks'],
  taskId: string,
  bucketId: string | null,
  targetIndex?: number,
) => {
  const fromTask = tasks.find((task) => task.id === taskId);
  if (!fromTask) return tasks;

  const withoutMoved = tasks.filter((task) => task.id !== taskId);
  const movedTask = {
    ...fromTask,
    bucketId,
    updatedAt: now(),
  };

  const bucketTasks = withoutMoved.filter(
    (task) => task.bucketId === bucketId && !task.archivedAt,
  );

  const safeIndex = Math.max(
    0,
    Math.min(targetIndex ?? bucketTasks.length, bucketTasks.length),
  );

  const beforeTask = bucketTasks[safeIndex] ?? null;
  if (beforeTask) {
    const insertAt = withoutMoved.findIndex((task) => task.id === beforeTask.id);
    return [
      ...withoutMoved.slice(0, insertAt),
      movedTask,
      ...withoutMoved.slice(insertAt),
    ];
  }

  const lastBucketIndex = (() => {
    for (let i = withoutMoved.length - 1; i >= 0; i -= 1) {
      if (withoutMoved[i]?.bucketId === bucketId && !withoutMoved[i]?.archivedAt) {
        return i;
      }
    }
    return -1;
  })();

  if (lastBucketIndex >= 0) {
    const insertAt = lastBucketIndex + 1;
    return [
      ...withoutMoved.slice(0, insertAt),
      movedTask,
      ...withoutMoved.slice(insertAt),
    ];
  }

  return [...withoutMoved, movedTask];
};

const moveTasksWithOrder = (
  tasks: PlannerData['tasks'],
  taskIds: string[],
  bucketId: string | null,
  targetIndex?: number,
) => {
  const selectedTaskIds = new Set(taskIds);
  const movingTasks = tasks.filter((task) => selectedTaskIds.has(task.id));
  if (movingTasks.length === 0) return tasks;

  const timestamp = now();
  const withoutMoved = tasks.filter((task) => !selectedTaskIds.has(task.id));
  const movedTasks = movingTasks.map((task) => ({
    ...task,
    bucketId,
    updatedAt: timestamp,
  }));

  const bucketTasks = withoutMoved.filter(
    (task) => task.bucketId === bucketId && !task.archivedAt,
  );

  const safeIndex = Math.max(
    0,
    Math.min(targetIndex ?? bucketTasks.length, bucketTasks.length),
  );

  const beforeTask = bucketTasks[safeIndex] ?? null;
  if (beforeTask) {
    const insertAt = withoutMoved.findIndex((task) => task.id === beforeTask.id);
    return [
      ...withoutMoved.slice(0, insertAt),
      ...movedTasks,
      ...withoutMoved.slice(insertAt),
    ];
  }

  const lastBucketIndex = (() => {
    for (let i = withoutMoved.length - 1; i >= 0; i -= 1) {
      if (withoutMoved[i]?.bucketId === bucketId && !withoutMoved[i]?.archivedAt) {
        return i;
      }
    }
    return -1;
  })();

  if (lastBucketIndex >= 0) {
    const insertAt = lastBucketIndex + 1;
    return [
      ...withoutMoved.slice(0, insertAt),
      ...movedTasks,
      ...withoutMoved.slice(insertAt),
    ];
  }

  return [...withoutMoved, ...movedTasks];
};

export const plannerReducer = (
  state: PlannerData,
  action: PlannerAction,
): PlannerData => {
  switch (action.type) {
    case 'ADD_BUCKET': {
      const name = action.name.trim();
      if (!name) return state;

      return {
        ...state,
        buckets: normalizeBucketOrder([
          ...state.buckets,
          { id: action.id ?? createId(), name, createdAt: now(), pinned: false },
        ]),
      };
    }

    case 'MOVE_BUCKET':
      return {
        ...state,
        buckets: moveBucketWithOrder(state.buckets, action.bucketId, action.targetIndex),
      };

    case 'TOGGLE_BUCKET_PIN':
      return {
        ...state,
        buckets: toggleBucketPinWithOrder(state.buckets, action.bucketId),
      };

    case 'RENAME_BUCKET': {
      const name = action.name.trim();
      if (!name) return state;

      return {
        ...state,
        buckets: state.buckets.map((bucket) =>
          bucket.id === action.bucketId ? { ...bucket, name } : bucket,
        ),
      };
    }

    case 'DELETE_BUCKET':
      return {
        ...state,
        buckets: state.buckets.filter(
          (bucket) => bucket.id !== action.bucketId,
        ),
        tasks: state.tasks.map((task) =>
          task.bucketId === action.bucketId
            ? { ...task, bucketId: null, updatedAt: now() }
            : task,
        ),
      };

    case 'ADD_TASK': {
      const title = action.draft.title.trim();
      if (!title) return state;
      const timestamp = now();

      return {
        ...state,
        tasks: [
          ...state.tasks,
          {
            id: createId(),
            title,
            description: action.draft.description.trim(),
            bucketId: action.draft.bucketId,
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      };
    }

    case 'ADD_TASK_BATCH': {
      const drafts = action.drafts
        .map((draft) => ({
          title: draft.title.trim(),
          description: draft.description.trim(),
          bucketId: draft.bucketId,
        }))
        .filter((draft) => Boolean(draft.title));

      if (drafts.length === 0) return state;

      const timestamp = now();
      return {
        ...state,
        tasks: [
          ...state.tasks,
          ...drafts.map((draft) => ({
            id: createId(),
            title: draft.title,
            description: draft.description,
            bucketId: draft.bucketId,
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        ],
      };
    }

    case 'TOGGLE_TASK_PIN':
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId
            ? { ...task, pinned: !task.pinned, updatedAt: now() }
            : task
        )),
      };

    case 'UPDATE_TASK': {
      const title = action.draft.title.trim();
      if (!title) return state;

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
              ...task,
              title,
              description: action.draft.description.trim(),
              bucketId: action.draft.bucketId,
              updatedAt: now(),
            }
            : task,
        ),
      };
    }

    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.taskId),
      };

    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
              ...task,
              completed: !task.completed,
              archivedAt: task.archivedAt ? null : task.archivedAt,
              updatedAt: now(),
            }
            : task,
        ),
      };

    case 'MOVE_TASK':
      return {
        ...state,
        tasks: moveTaskWithOrder(
          state.tasks,
          action.taskId,
          action.bucketId,
          action.targetIndex,
        ),
      };

    case 'MOVE_TASKS':
      return {
        ...state,
        tasks: moveTasksWithOrder(
          state.tasks,
          action.taskIds,
          action.bucketId,
          action.targetIndex,
        ),
      };

    case 'ARCHIVE_COMPLETED_TASKS':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.completed && !task.archivedAt
            ? { ...task, archivedAt: now(), updatedAt: now() }
            : task,
        ),
      };

    case 'UNARCHIVE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
              ...task,
              archivedAt: null,
              completed: false,
              updatedAt: now(),
            }
            : task,
        ),
      };

    case 'REPLACE_DATA':
      return normalizePlannerData(action.data);

    default:
      return state;
  }
};
