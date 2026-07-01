import type { TaskDraft } from '../types';
import type { BucketV2, PlannerDataV2, PlannerTaskV2, Project } from '../types/v2';
import { validatePlannerDataV2Integrity } from '../types/validators';

export type PlannerActionV2 =
  | { type: 'ADD_PROJECT'; project: Project }
  | { type: 'RENAME_PROJECT'; projectId: string; name: string; updatedAt: string }
  | { type: 'UPDATE_PROJECT_DESCRIPTION'; projectId: string; description: string; updatedAt: string }
  | { type: 'TOGGLE_PROJECT_PIN'; projectId: string; updatedAt: string }
  | { type: 'MOVE_PROJECT'; projectId: string; targetIndex: number }
  | { type: 'DELETE_PROJECT'; projectId: string }
  | { type: 'ADD_BUCKET'; bucket: BucketV2 }
  | { type: 'MOVE_BUCKET'; projectId: string; bucketId: string; targetIndex: number }
  | { type: 'TOGGLE_BUCKET_PIN'; projectId: string; bucketId: string; updatedAt: string }
  | { type: 'RENAME_BUCKET'; projectId: string; bucketId: string; name: string; updatedAt: string }
  | { type: 'DELETE_BUCKET'; projectId: string; bucketId: string; updatedAt: string }
  | { type: 'ADD_TASK'; task: PlannerTaskV2 }
  | { type: 'ADD_TASK_BATCH'; tasks: PlannerTaskV2[] }
  | { type: 'UPDATE_TASK'; projectId: string; taskId: string; draft: TaskDraft; updatedAt: string }
  | { type: 'TOGGLE_TASK_PIN'; projectId: string; taskId: string; updatedAt: string }
  | { type: 'DELETE_TASK'; projectId: string; taskId: string }
  | { type: 'TOGGLE_TASK'; projectId: string; taskId: string; updatedAt: string }
  | { type: 'MOVE_TASK'; projectId: string; taskId: string; bucketId: string | null; targetIndex?: number; updatedAt: string }
  | { type: 'MOVE_TASKS'; projectId: string; taskIds: string[]; bucketId: string | null; targetIndex?: number; updatedAt: string }
  | { type: 'ARCHIVE_COMPLETED_TASKS'; projectId: string; archivedAt: string }
  | { type: 'UNARCHIVE_TASK'; projectId: string; taskId: string; updatedAt: string }
  | { type: 'REPLACE_DATA'; data: PlannerDataV2 };

const normalizePinnedOrder = <Item extends { pinned: boolean }>(items: Item[]): Item[] => {
  const pinned = items.filter((item) => item.pinned);
  const unpinned = items.filter((item) => !item.pinned);
  return [...pinned, ...unpinned];
};

const moveWithPinnedOrder = <Item extends { id: string; pinned: boolean }>(
  items: Item[],
  itemId: string,
  targetIndex: number,
): Item[] => {
  const sourceIndex = items.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return items;
  const movingItem = items[sourceIndex];

  const withoutMoved = items.filter((item) => item.id !== itemId);
  const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  const safeIndex = Math.max(0, Math.min(adjustedTargetIndex, withoutMoved.length));
  const groupInsertIndex = withoutMoved
    .slice(0, safeIndex)
    .filter((item) => item.pinned === movingItem.pinned).length;
  const sameGroup = withoutMoved.filter((item) => item.pinned === movingItem.pinned);
  const otherGroup = withoutMoved.filter((item) => item.pinned !== movingItem.pinned);
  const reorderedGroup = [
    ...sameGroup.slice(0, groupInsertIndex),
    movingItem,
    ...sameGroup.slice(groupInsertIndex),
  ];

  return movingItem.pinned
    ? [...reorderedGroup, ...otherGroup]
    : [...otherGroup, ...reorderedGroup];
};

const togglePinnedWithOrder = <Item extends { id: string; pinned: boolean }>(
  items: Item[],
  itemId: string,
  update: (item: Item, pinned: boolean) => Item,
): Item[] => {
  const target = items.find((item) => item.id === itemId);
  if (!target) return items;

  const updated = update(target, !target.pinned);
  const withoutTarget = items.filter((item) => item.id !== itemId);
  const pinned = withoutTarget.filter((item) => item.pinned);
  const unpinned = withoutTarget.filter((item) => !item.pinned);

  return [...pinned, updated, ...unpinned];
};

const bucketBelongsToProject = (
  state: PlannerDataV2,
  projectId: string,
  bucketId: string | null,
): boolean => {
  if (bucketId === null) return true;
  return state.buckets.some((bucket) => bucket.id === bucketId && bucket.projectId === projectId);
};

const replaceProjectBuckets = (
  state: PlannerDataV2,
  projectId: string,
  buckets: BucketV2[],
): PlannerDataV2 => ({
  ...state,
  buckets: state.projects.flatMap((project) => (
    project.id === projectId
      ? buckets
      : state.buckets.filter((bucket) => bucket.projectId === project.id)
  )),
});

const replaceProjectTasks = (
  state: PlannerDataV2,
  projectId: string,
  tasks: PlannerTaskV2[],
): PlannerDataV2 => ({
  ...state,
  tasks: state.projects.flatMap((project) => (
    project.id === projectId
      ? tasks
      : state.tasks.filter((task) => task.projectId === project.id)
  )),
});

const moveTaskWithOrder = (
  tasks: PlannerTaskV2[],
  taskId: string,
  bucketId: string | null,
  updatedAt: string,
  targetIndex?: number,
): PlannerTaskV2[] => {
  const fromTask = tasks.find((task) => task.id === taskId);
  if (!fromTask) return tasks;

  const withoutMoved = tasks.filter((task) => task.id !== taskId);
  const movedTask = {
    ...fromTask,
    bucketId,
    updatedAt,
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
    for (let index = withoutMoved.length - 1; index >= 0; index -= 1) {
      if (withoutMoved[index]?.bucketId === bucketId && !withoutMoved[index]?.archivedAt) {
        return index;
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
  tasks: PlannerTaskV2[],
  taskIds: string[],
  bucketId: string | null,
  updatedAt: string,
  targetIndex?: number,
): PlannerTaskV2[] => {
  const selectedTaskIds = new Set(taskIds);
  const movingTasks = tasks.filter((task) => selectedTaskIds.has(task.id));
  if (movingTasks.length === 0) return tasks;

  const withoutMoved = tasks.filter((task) => !selectedTaskIds.has(task.id));
  const movedTasks = movingTasks.map((task) => ({
    ...task,
    bucketId,
    updatedAt,
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
    for (let index = withoutMoved.length - 1; index >= 0; index -= 1) {
      if (withoutMoved[index]?.bucketId === bucketId && !withoutMoved[index]?.archivedAt) {
        return index;
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

export const plannerReducerV2 = (
  state: PlannerDataV2,
  action: PlannerActionV2,
): PlannerDataV2 => {
  switch (action.type) {
    case 'ADD_PROJECT': {
      if (!action.project.name.trim()) return state;
      if (state.projects.some((project) => project.id === action.project.id)) return state;
      return {
        ...state,
        projects: normalizePinnedOrder([...state.projects, action.project]),
      };
    }

    case 'RENAME_PROJECT': {
      const name = action.name.trim();
      if (!name) return state;
      return {
        ...state,
        projects: state.projects.map((project) => (
          project.id === action.projectId
            ? { ...project, name, updatedAt: action.updatedAt }
            : project
        )),
      };
    }

    case 'UPDATE_PROJECT_DESCRIPTION':
      return {
        ...state,
        projects: state.projects.map((project) => (
          project.id === action.projectId
            ? { ...project, description: action.description.trim(), updatedAt: action.updatedAt }
            : project
        )),
      };

    case 'TOGGLE_PROJECT_PIN':
      return {
        ...state,
        projects: togglePinnedWithOrder(state.projects, action.projectId, (project, pinned) => ({
          ...project,
          pinned,
          updatedAt: action.updatedAt,
        })),
      };

    case 'MOVE_PROJECT':
      return {
        ...state,
        projects: moveWithPinnedOrder(state.projects, action.projectId, action.targetIndex),
      };

    case 'DELETE_PROJECT': {
      if (state.projects.length <= 1) return state;
      if (!state.projects.some((project) => project.id === action.projectId)) return state;
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== action.projectId),
        buckets: state.buckets.filter((bucket) => bucket.projectId !== action.projectId),
        tasks: state.tasks.filter((task) => task.projectId !== action.projectId),
      };
    }

    case 'ADD_BUCKET': {
      const name = action.bucket.name.trim();
      if (!name) return state;
      if (!state.projects.some((project) => project.id === action.bucket.projectId)) return state;
      if (state.buckets.some((bucket) => bucket.id === action.bucket.id)) return state;
      const projectBuckets = state.buckets.filter((bucket) => bucket.projectId === action.bucket.projectId);
      return replaceProjectBuckets(
        state,
        action.bucket.projectId,
        normalizePinnedOrder([...projectBuckets, { ...action.bucket, name }]),
      );
    }

    case 'MOVE_BUCKET': {
      const projectBuckets = state.buckets.filter((bucket) => bucket.projectId === action.projectId);
      return replaceProjectBuckets(
        state,
        action.projectId,
        moveWithPinnedOrder(projectBuckets, action.bucketId, action.targetIndex),
      );
    }

    case 'TOGGLE_BUCKET_PIN': {
      const projectBuckets = state.buckets.filter((bucket) => bucket.projectId === action.projectId);
      return replaceProjectBuckets(
        state,
        action.projectId,
        togglePinnedWithOrder(projectBuckets, action.bucketId, (bucket, pinned) => ({
          ...bucket,
          pinned,
          updatedAt: action.updatedAt,
        })),
      );
    }

    case 'RENAME_BUCKET': {
      const name = action.name.trim();
      if (!name) return state;
      return {
        ...state,
        buckets: state.buckets.map((bucket) => (
          bucket.id === action.bucketId && bucket.projectId === action.projectId
            ? { ...bucket, name, updatedAt: action.updatedAt }
            : bucket
        )),
      };
    }

    case 'DELETE_BUCKET':
      return {
        ...state,
        buckets: state.buckets.filter(
          (bucket) => !(bucket.id === action.bucketId && bucket.projectId === action.projectId),
        ),
        tasks: state.tasks.map((task) => (
          task.projectId === action.projectId && task.bucketId === action.bucketId
            ? { ...task, bucketId: null, updatedAt: action.updatedAt }
            : task
        )),
      };

    case 'ADD_TASK': {
      const title = action.task.title.trim();
      if (!title) return state;
      if (!state.projects.some((project) => project.id === action.task.projectId)) return state;
      if (!bucketBelongsToProject(state, action.task.projectId, action.task.bucketId)) return state;
      if (state.tasks.some((task) => task.id === action.task.id)) return state;
      const projectTasks = state.tasks.filter((task) => task.projectId === action.task.projectId);
      return replaceProjectTasks(
        state,
        action.task.projectId,
        [...projectTasks, { ...action.task, title, description: action.task.description.trim() }],
      );
    }

    case 'ADD_TASK_BATCH': {
      const tasks = action.tasks
        .map((task) => ({
          ...task,
          title: task.title.trim(),
          description: task.description.trim(),
        }))
        .filter((task) => Boolean(task.title));
      if (tasks.length === 0) return state;
      const projectId = tasks[0].projectId;
      if (!tasks.every((task) => task.projectId === projectId)) return state;
      if (!state.projects.some((project) => project.id === projectId)) return state;
      if (!tasks.every((task) => bucketBelongsToProject(state, projectId, task.bucketId))) return state;
      const existingTaskIds = new Set(state.tasks.map((task) => task.id));
      if (tasks.some((task) => existingTaskIds.has(task.id))) return state;
      const projectTasks = state.tasks.filter((task) => task.projectId === projectId);
      return replaceProjectTasks(state, projectId, [...projectTasks, ...tasks]);
    }

    case 'UPDATE_TASK': {
      const title = action.draft.title.trim();
      if (!title) return state;
      if (!bucketBelongsToProject(state, action.projectId, action.draft.bucketId)) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? {
              ...task,
              title,
              description: action.draft.description.trim(),
              bucketId: action.draft.bucketId,
              updatedAt: action.updatedAt,
            }
            : task
        )),
      };
    }

    case 'TOGGLE_TASK_PIN':
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? { ...task, pinned: !task.pinned, updatedAt: action.updatedAt }
            : task
        )),
      };

    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((task) => !(task.id === action.taskId && task.projectId === action.projectId)),
      };

    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? {
              ...task,
              completed: !task.completed,
              archivedAt: task.archivedAt ? null : task.archivedAt,
              updatedAt: action.updatedAt,
            }
            : task
        )),
      };

    case 'MOVE_TASK': {
      if (!bucketBelongsToProject(state, action.projectId, action.bucketId)) return state;
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (!task || task.projectId !== action.projectId) return state;
      const projectTasks = state.tasks.filter((item) => item.projectId === action.projectId);
      return replaceProjectTasks(
        state,
        action.projectId,
        moveTaskWithOrder(projectTasks, action.taskId, action.bucketId, action.updatedAt, action.targetIndex),
      );
    }

    case 'MOVE_TASKS': {
      if (!bucketBelongsToProject(state, action.projectId, action.bucketId)) return state;
      const selectedTaskIds = new Set(action.taskIds);
      const selectedTasks = state.tasks.filter((task) => selectedTaskIds.has(task.id));
      if (selectedTasks.length === 0) return state;
      if (!selectedTasks.every((task) => task.projectId === action.projectId)) return state;
      const projectTasks = state.tasks.filter((item) => item.projectId === action.projectId);
      return replaceProjectTasks(
        state,
        action.projectId,
        moveTasksWithOrder(projectTasks, action.taskIds, action.bucketId, action.updatedAt, action.targetIndex),
      );
    }

    case 'ARCHIVE_COMPLETED_TASKS':
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.projectId === action.projectId && task.completed && !task.archivedAt
            ? { ...task, archivedAt: action.archivedAt, updatedAt: action.archivedAt }
            : task
        )),
      };

    case 'UNARCHIVE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? {
              ...task,
              archivedAt: null,
              completed: false,
              updatedAt: action.updatedAt,
            }
            : task
        )),
      };

    case 'REPLACE_DATA':
      validatePlannerDataV2Integrity(action.data);
      return action.data;

    default:
      return state;
  }
};
