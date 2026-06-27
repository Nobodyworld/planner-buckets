import {
  PLANNER_DATA_VERSION,
  type PlannerData,
  type PlannerTask,
  type Bucket,
} from '../types';

const STORAGE_KEY = 'planner-buckets:data:v1';

export const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const now = (): string => new Date().toISOString();

const normalizeBucketOrder = (buckets: Bucket[]): Bucket[] => {
  const pinned = buckets.filter((bucket) => bucket.pinned);
  const unpinned = buckets.filter((bucket) => !bucket.pinned);
  return [...pinned, ...unpinned];
};

export const createInitialPlannerData = (): PlannerData => ({
  version: PLANNER_DATA_VERSION,
  buckets: [
    { id: createId(), name: 'To Do', createdAt: now(), pinned: true },
    { id: createId(), name: 'In Progress', createdAt: now(), pinned: false },
  ],
  tasks: [],
});

const isBucket = (value: unknown): value is Bucket => {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Partial<Bucket>;
  return (
    typeof bucket.id === 'string' &&
    typeof bucket.name === 'string' &&
    typeof bucket.createdAt === 'string' &&
    (typeof bucket.pinned === 'boolean' || typeof bucket.pinned === 'undefined')
  );
};

const isTask = (value: unknown): value is PlannerTask => {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<PlannerTask>;
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.description === 'string' &&
    (typeof task.bucketId === 'string' || task.bucketId === null) &&
    (typeof task.pinned === 'boolean' || typeof task.pinned === 'undefined') &&
    typeof task.completed === 'boolean' &&
    (typeof task.archivedAt === 'string' || task.archivedAt === null || typeof task.archivedAt === 'undefined') &&
    typeof task.createdAt === 'string' &&
    typeof task.updatedAt === 'string'
  );
};

export const isPlannerData = (value: unknown): value is PlannerData => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PlannerData>;
  return (
    data.version === PLANNER_DATA_VERSION &&
    Array.isArray(data.buckets) &&
    data.buckets.every(isBucket) &&
    Array.isArray(data.tasks) &&
    data.tasks.every(isTask)
  );
};

export const normalizePlannerData = (data: PlannerData): PlannerData => {
  const normalizedBuckets = normalizeBucketOrder(data.buckets.map((bucket) => ({
    ...bucket,
    name: bucket.name.trim() || 'Untitled bucket',
    pinned: typeof bucket.pinned === 'boolean'
      ? bucket.pinned
      : bucket.name.trim().toLowerCase() === 'to do',
  })));
  const bucketIds = new Set(normalizedBuckets.map((bucket) => bucket.id));

  return {
    ...data,
    buckets: normalizedBuckets,
    tasks: data.tasks.map((task) => ({
      ...task,
      title: task.title.trim() || 'Untitled task',
      pinned: typeof task.pinned === 'boolean' ? task.pinned : false,
      archivedAt:
        typeof task.archivedAt === 'string' || task.archivedAt === null
          ? task.archivedAt
          : null,
      bucketId:
        task.bucketId !== null && bucketIds.has(task.bucketId)
          ? task.bucketId
          : null,
    })),
  };
};

export const loadPlannerData = (): PlannerData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialPlannerData();

    const parsed: unknown = JSON.parse(raw);
    if (!isPlannerData(parsed)) return createInitialPlannerData();

    return normalizePlannerData(parsed);
  } catch {
    return createInitialPlannerData();
  }
};

export const savePlannerData = (data: PlannerData): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};
