export const PLANNER_DATA_VERSION = 1 as const;

export interface Bucket {
  id: string;
  name: string;
  createdAt: string;
  pinned: boolean;
}

export interface PlannerTask {
  id: string;
  title: string;
  description: string;
  bucketId: string | null;
  pinned: boolean;
  completed: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerData {
  version: typeof PLANNER_DATA_VERSION;
  buckets: Bucket[];
  tasks: PlannerTask[];
}

export interface TaskDraft {
  title: string;
  description: string;
  bucketId: string | null;
}
