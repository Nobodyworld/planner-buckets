import { Fragment, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { BucketColumn } from './components/BucketColumn';
import { TaskCard } from './components/TaskCard';
import { TaskEditor } from './components/TaskEditor';
import { plannerReducer, type PlannerAction } from './state/plannerReducer';
import {
  createId,
  isPlannerData,
  loadPlannerData,
  normalizePlannerData,
  savePlannerData,
} from './storage/plannerStorage';
import type { Bucket, PlannerData, PlannerTask, TaskDraft } from './types';

const accentIndexFromBucket = (bucketId: string | null) => {
  if (!bucketId) return 0;
  const hash = bucketId
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (hash % 8) + 1;
};

const ensureScrollableTargetInView = (
  container: HTMLElement | null,
  target: HTMLElement | null,
  margin = 12,
) => {
  if (!container || !target) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const fullyVisible =
    targetRect.top >= containerRect.top + margin &&
    targetRect.bottom <= containerRect.bottom - margin;

  if (!fullyVisible) {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

const UPLOAD_HALO_DURATION_MS = 120000;
const DROP_SETTLE_DURATION_MS = 1500;
const QUICK_TASK_BUCKET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

const normalizeBucketName = (name: string) => name.trim().toLowerCase();

const createTaskDuplicateKey = (
  task: Pick<PlannerTask, 'title' | 'description'>,
  bucketId: string | null,
) => `${bucketId ?? 'unassigned'}::${task.title.trim().toLowerCase()}::${task.description.trim().toLowerCase()}`;

const formatTaskNoteForCopy = (description: string, prefix = '') => (
  description
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `${prefix}${line}`)
    .join('\n')
);

const formatTaskChecklistLabel = (task: PlannerTask) => (
  `${task.completed ? '[x]' : '[ ]'} ${task.title.trim() || 'Untitled task'}`
);

const formatTaskForOrderedCopy = (task: PlannerTask, index: number) => {
  const lines = [`${index + 1}. ${formatTaskChecklistLabel(task)}`];
  const note = formatTaskNoteForCopy(task.description, '   Note: ');

  if (note) {
    lines.push(note);
  }

  return lines.join('\n');
};

const formatTaskForSingleCopy = (task: PlannerTask, bucketName: string) => {
  const lines = [formatTaskChecklistLabel(task), `Bucket: ${bucketName}`];
  const note = formatTaskNoteForCopy(task.description, 'Note: ');

  if (note) {
    lines.push(note);
  }

  return lines.join('\n');
};

const copyTextToClipboard = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the legacy clipboard path below.
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error('Clipboard copy failed');
  }
};

const mergeUploadedPlannerData = (current: PlannerData, incoming: PlannerData) => {
  const bucketIdMap = new Map<string, string | null>();
  const bucketsByName = new Map<string, Bucket>();

  current.buckets.forEach((bucket) => {
    bucketsByName.set(normalizeBucketName(bucket.name), bucket);
  });

  const mergedBuckets = [...current.buckets];
  let createdBucketCount = 0;
  let mergedIntoExistingBucketCount = 0;

  incoming.buckets.forEach((bucket) => {
    const normalizedName = normalizeBucketName(bucket.name) || 'untitled bucket';
    const existingBucket = bucketsByName.get(normalizedName) ?? null;

    if (existingBucket) {
      bucketIdMap.set(bucket.id, existingBucket.id);
      mergedIntoExistingBucketCount += 1;
      return;
    }

    const mergedBucket: Bucket = {
      ...bucket,
      id: createId(),
      name: bucket.name.trim() || 'Untitled bucket',
    };

    bucketIdMap.set(bucket.id, mergedBucket.id);
    bucketsByName.set(normalizedName, mergedBucket);
    mergedBuckets.push(mergedBucket);
    createdBucketCount += 1;
  });

  const existingTaskKeys = new Set(
    current.tasks.map((task) => createTaskDuplicateKey(task, task.bucketId)),
  );
  const mergedTasks = [...current.tasks];
  const uploadedTaskIds: string[] = [];
  let skippedDuplicateCount = 0;

  incoming.tasks.forEach((task) => {
    const mergedBucketId = task.bucketId
      ? bucketIdMap.get(task.bucketId) ?? null
      : null;
    const duplicateKey = createTaskDuplicateKey(task, mergedBucketId);

    if (existingTaskKeys.has(duplicateKey)) {
      skippedDuplicateCount += 1;
      return;
    }

    const uploadedTask: PlannerTask = {
      ...task,
      id: createId(),
      bucketId: mergedBucketId,
      title: task.title.trim() || 'Untitled task',
      description: task.description.trim(),
    };

    mergedTasks.push(uploadedTask);
    uploadedTaskIds.push(uploadedTask.id);
    existingTaskKeys.add(duplicateKey);
  });

  return {
    data: {
      version: current.version,
      buckets: mergedBuckets,
      tasks: mergedTasks,
    },
    createdBucketCount,
    mergedIntoExistingBucketCount,
    skippedDuplicateCount,
    uploadedTaskIds,
  };
};

interface EditorState {
  task: PlannerTask | null;
  defaultBucketId: string | null;
}

type ConfirmDialogAction =
  | { type: 'delete-task'; taskId: string }
  | { type: 'delete-bucket'; bucketId: string };

interface ConfirmDialogState {
  title: string;
  targetLabel: string;
  detail?: string;
  confirmLabel: string;
  action: ConfirmDialogAction;
}

interface RenameDialogState {
  bucketId: string;
  initialName: string;
  value: string;
}

type ThemeMode = 'light' | 'dark';
type VisualMode = 'calm' | 'balanced' | 'energetic';
const BOARD_ZOOM_STORAGE_KEY = 'planner-buckets:board-zoom-index';
const THEME_STORAGE_KEY = 'planner-buckets:theme';
const VISUAL_MODE_STORAGE_KEY = 'planner-buckets:visual-mode';
const MIN_BOARD_ZOOM_INDEX = 0;
const MAX_BOARD_ZOOM_INDEX = 4;
const APP_NAME = 'Buckets & Shovels Planner';
const APP_BANNER = 'B.S. Planner';
const APP_ICON_TEXT = 'BSP';
const HISTORY_LIMIT = 200;

interface PlannerHistoryState {
  past: PlannerData[];
  present: PlannerData;
  future: PlannerData[];
}

type PlannerHistoryAction =
  | { type: 'APPLY'; action: PlannerAction }
  | { type: 'UNDO' }
  | { type: 'REDO' };

const createInitialPlannerHistory = (): PlannerHistoryState => ({
  past: [],
  present: loadPlannerData(),
  future: [],
});

const plannerHistoryReducer = (
  state: PlannerHistoryState,
  action: PlannerHistoryAction,
): PlannerHistoryState => {
  switch (action.type) {
    case 'APPLY': {
      const nextPresent = plannerReducer(state.present, action.action);
      if (nextPresent === state.present) return state;

      const nextPast = state.past.length >= HISTORY_LIMIT
        ? [...state.past.slice(1), state.present]
        : [...state.past, state.present];

      return {
        past: nextPast,
        present: nextPresent,
        future: [],
      };
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const [next, ...remainingFuture] = state.future;
      return {
        past: [...state.past, state.present],
        present: next,
        future: remainingFuture,
      };
    }

    default:
      return state;
  }
};

export default function App() {
  const [historyState, dispatchHistory] = useReducer(plannerHistoryReducer, undefined, createInitialPlannerHistory);
  const state = historyState.present;
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [bucketName, setBucketName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [exportScope, setExportScope] = useState<string>('all');
  const [showExportScopeMenu, setShowExportScopeMenu] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [renameDialogError, setRenameDialogError] = useState<string | null>(null);
  const [pendingRestoreData, setPendingRestoreData] = useState<PlannerData | null>(null);
  const [pendingUploadData, setPendingUploadData] = useState<PlannerData | null>(null);
  const [lastRestoreBackup, setLastRestoreBackup] = useState<PlannerData | null>(null);
  const [pendingBucketWarp, setPendingBucketWarp] = useState(false);
  const [highlightedBucketId, setHighlightedBucketId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedTaskBucketId, setHighlightedTaskBucketId] = useState<string | null>(null);
  const [uploadedTaskIds, setUploadedTaskIds] = useState<string[]>([]);
  const [pendingTaskSurge, setPendingTaskSurge] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(true);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskBucketName, setQuickTaskBucketName] = useState('');
  const [quickTaskBucketId, setQuickTaskBucketId] = useState<string | null>(null);
  const [boardBucketAddOpen, setBoardBucketAddOpen] = useState(false);
  const [boardBucketNameDraft, setBoardBucketNameDraft] = useState('');
  const [hideRestoreUndoCard, setHideRestoreUndoCard] = useState(false);
  const [isRestoreUndoClosing, setIsRestoreUndoClosing] = useState(false);
  const [dataActionMessage, setDataActionMessage] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSearchStatus, setShowSearchStatus] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  });
  const [visualMode, setVisualMode] = useState<VisualMode>(() => {
    const stored = localStorage.getItem(VISUAL_MODE_STORAGE_KEY);
    if (stored === 'calm' || stored === 'energetic' || stored === 'balanced') {
      return stored;
    }
    return 'balanced';
  });
  const [boardZoomIndex, setBoardZoomIndex] = useState(() => {
    const stored = Number(localStorage.getItem(BOARD_ZOOM_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= MIN_BOARD_ZOOM_INDEX && stored <= MAX_BOARD_ZOOM_INDEX) {
      return stored;
    }
    return 3;
  });
  const [isSidepanelOpen, setIsSidepanelOpen] = useState(false);
  const [isSidepanelLocked, setIsSidepanelLocked] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskIds, setDraggedTaskIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectionAnchorTaskId, setSelectionAnchorTaskId] = useState<string | null>(null);
  const [taskClipboard, setTaskClipboard] = useState<Array<Pick<PlannerTask, 'title' | 'description'>>>([]);
  const [activePasteBucketId, setActivePasteBucketId] = useState<string | null>(null);
  const [draggedBucketId, setDraggedBucketId] = useState<string | null>(null);
  const [activeBucketDropIndex, setActiveBucketDropIndex] = useState<number | null>(null);
  const [settledBucketDropIndex, setSettledBucketDropIndex] = useState<number | null>(null);
  const [settledBucketId, setSettledBucketId] = useState<string | null>(null);
  const [settledBucketFrom, setSettledBucketFrom] = useState<'left' | 'right' | null>(null);
  const [status, setStatus] = useState('Saved locally');
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const quickTaskInputRef = useRef<HTMLInputElement>(null);
  const quickTaskBucketInputRef = useRef<HTMLInputElement>(null);
  const quickTaskShellRef = useRef<HTMLDivElement>(null);
  const boardBucketInputRef = useRef<HTMLInputElement>(null);
  const sidepanelRef = useRef<HTMLElement>(null);
  const sidepanelToggleGroupRef = useRef<HTMLDivElement>(null);
  const sidepanelToggleButtonRef = useRef<HTMLButtonElement>(null);
  const sidepanelLockButtonRef = useRef<HTMLButtonElement>(null);
  const boardFrameRef = useRef<HTMLDivElement>(null);
  const bucketElementRefs = useRef<Record<string, HTMLElement | null>>({});
  const restoreConfirmRef = useRef<HTMLDivElement>(null);
  const uploadConfirmRef = useRef<HTMLDivElement>(null);
  const exportScopeMenuRef = useRef<HTMLDivElement>(null);
  const restoreUndoCloseTimeoutRef = useRef<number | null>(null);
  const bucketHighlightTimeoutRef = useRef<number | null>(null);
  const taskSurgeTimeoutRef = useRef<number | null>(null);
  const uploadHaloTimeoutRef = useRef<number | null>(null);
  const bucketDropSettleTimeoutRef = useRef<number | null>(null);
  const hideSearchStatusTimeoutRef = useRef<number | null>(null);
  const sidepanelCloseTimeoutRef = useRef<number | null>(null);
  const sidepanelOpenTimeoutRef = useRef<number | null>(null);
  const sidepanelHoveringRef = useRef(false);
  const sidepanelToggleHoveringRef = useRef(false);
  const sidepanelLockHoveringRef = useRef(false);
  const sidepanelToggleLabel = isSidepanelOpen ? 'Hide controls' : 'Show controls';
  const sidepanelToggleIcon = isSidepanelOpen ? '▴' : '▾';
  const sidepanelLockIcon = isSidepanelLocked ? '🔒' : '🔓';
  const sidepanelLockLabel = isSidepanelLocked
    ? 'Enable automatic controls opening'
    : 'Disable automatic controls opening';
  const sidepanelToggleTitle = isSidepanelOpen
    ? 'Click to collapse controls'
    : 'Click to open controls';
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;

  const dispatchPlanner = (action: PlannerAction) => {
    dispatchHistory({ type: 'APPLY', action });
  };

  useEffect(() => {
    try {
      savePlannerData(state);
      setStatus('Saved locally');
    } catch {
      setStatus('Could not save locally');
    }
  }, [state]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-visual-mode', visualMode);
    localStorage.setItem(VISUAL_MODE_STORAGE_KEY, visualMode);
  }, [visualMode]);

  useEffect(() => {
    localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(boardZoomIndex));
  }, [boardZoomIndex]);

  useEffect(() => {
    return () => {
      if (hideSearchStatusTimeoutRef.current !== null) {
        window.clearTimeout(hideSearchStatusTimeoutRef.current);
      }
      if (restoreUndoCloseTimeoutRef.current !== null) {
        window.clearTimeout(restoreUndoCloseTimeoutRef.current);
      }
      if (bucketHighlightTimeoutRef.current !== null) {
        window.clearTimeout(bucketHighlightTimeoutRef.current);
      }
      if (taskSurgeTimeoutRef.current !== null) {
        window.clearTimeout(taskSurgeTimeoutRef.current);
      }
      if (uploadHaloTimeoutRef.current !== null) {
        window.clearTimeout(uploadHaloTimeoutRef.current);
      }
      if (bucketDropSettleTimeoutRef.current !== null) {
        window.clearTimeout(bucketDropSettleTimeoutRef.current);
      }
      if (sidepanelCloseTimeoutRef.current !== null) {
        window.clearTimeout(sidepanelCloseTimeoutRef.current);
      }
      if (sidepanelOpenTimeoutRef.current !== null) {
        window.clearTimeout(sidepanelOpenTimeoutRef.current);
      }
    };
  }, []);

  const tasksByBucket = useMemo(() => {
    const map = new Map<string | null, PlannerTask[]>();
    map.set(null, []);
    state.buckets.forEach((bucket) => map.set(bucket.id, []));

    state.tasks
      .filter((task) => !task.archivedAt)
      .forEach((task) => {
        const key = map.has(task.bucketId) ? task.bucketId : null;
        map.get(key)?.push(task);
      });

    map.forEach((tasks) => {
      tasks.sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        return 0;
      });
    });

    return map;
  }, [state]);

  const saveTask = (draft: TaskDraft) => {
    if (!editor) return;

    if (editor.task) {
      dispatchPlanner({ type: 'UPDATE_TASK', taskId: editor.task.id, draft });
    } else {
      dispatchPlanner({ type: 'ADD_TASK', draft });
    }
    setEditor(null);
  };

  const filteredTasksByBucket = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = new Map<string | null, PlannerTask[]>();

    tasksByBucket.forEach((tasks, key) => {
      filtered.set(
        key,
        tasks.filter((task) => {
          if (!showCompleted && task.completed) return false;
          if (!query) return true;
          return (
            task.title.toLowerCase().includes(query) ||
            task.description.toLowerCase().includes(query)
          );
        }),
      );
    });

    return filtered;
  }, [tasksByBucket, searchQuery, showCompleted]);

  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);

  const orderedVisibleTaskIds = useMemo(() => {
    const ordered: string[] = [];
    (filteredTasksByBucket.get(null) ?? []).forEach((task) => ordered.push(task.id));
    state.buckets.forEach((bucket) => {
      (filteredTasksByBucket.get(bucket.id) ?? []).forEach((task) => ordered.push(task.id));
    });
    return ordered;
  }, [filteredTasksByBucket, state.buckets]);

  const visibleTaskIndexById = useMemo(() => {
    const map = new Map<string, number>();
    orderedVisibleTaskIds.forEach((taskId, index) => {
      map.set(taskId, index);
    });
    return map;
  }, [orderedVisibleTaskIds]);

  useEffect(() => {
    const activeTaskIdSet = new Set(
      state.tasks
        .filter((task) => !task.archivedAt)
        .map((task) => task.id),
    );

    setSelectedTaskIds((current) => current.filter((taskId) => activeTaskIdSet.has(taskId)));
    if (selectionAnchorTaskId && !activeTaskIdSet.has(selectionAnchorTaskId)) {
      setSelectionAnchorTaskId(null);
    }
  }, [selectionAnchorTaskId, state.tasks]);

  const stats = useMemo(() => {
    const archived = state.tasks.filter((task) => task.archivedAt !== null).length;
    const activeTotal = state.tasks.length - archived;
    const completed = state.tasks.filter((task) => task.completed && !task.archivedAt).length;
    const open = activeTotal - completed;
    const visible = Array.from(filteredTasksByBucket.values()).reduce(
      (count, tasks) => count + tasks.length,
      0,
    );
    return { activeTotal, archived, completed, open, visible };
  }, [state.tasks, filteredTasksByBucket]);

  const archivedTasks = useMemo(
    () => state.tasks.filter((task) => task.archivedAt !== null),
    [state.tasks],
  );

  const bucketNameById = useMemo(() => {
    const map = new Map<string, string>();
    state.buckets.forEach((bucket) => map.set(bucket.id, bucket.name));
    return map;
  }, [state.buckets]);

  const bucketIdByNormalizedName = useMemo(() => {
    const map = new Map<string, string>();
    state.buckets.forEach((bucket) => map.set(normalizeBucketName(bucket.name), bucket.id));
    return map;
  }, [state.buckets]);

  const addBucket = () => {
    const name = bucketName.trim();
    if (!name) return;
    dispatchPlanner({ type: 'ADD_BUCKET', name });
    setBucketName('');
    setPendingBucketWarp(true);
  };

  const addTaskFromBoard = (bucketId: string | null, title: string) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    dispatchPlanner({
      type: 'ADD_TASK',
      draft: {
        title: normalizedTitle,
        description: '',
        bucketId,
      },
    });
    setPendingTaskSurge(true);
  };

  const openBoardBucketAdd = () => {
    setBoardBucketAddOpen(true);
    window.requestAnimationFrame(() => {
      boardBucketInputRef.current?.focus();
    });
  };

  const submitBoardBucketAdd = () => {
    const name = boardBucketNameDraft.trim();
    if (!name) return;
    dispatchPlanner({ type: 'ADD_BUCKET', name });
    setBoardBucketNameDraft('');
    setPendingBucketWarp(true);
    window.requestAnimationFrame(() => {
      boardBucketInputRef.current?.focus();
    });
  };

  const handleBoardBucketKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitBoardBucketAdd();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setBoardBucketNameDraft('');
      setBoardBucketAddOpen(false);
    }
  };

  const bucketHotkeyTargets = useMemo(
    () => [null, ...state.buckets.map((bucket) => bucket.id)],
    [state.buckets],
  );

  const openQuickTaskComposer = (defaultBucketId: string | null = null) => {
    setQuickTaskOpen(true);
    setQuickTaskBucketId(defaultBucketId);
    setQuickTaskBucketName(defaultBucketId ? bucketNameById.get(defaultBucketId) ?? '' : '');
    window.requestAnimationFrame(() => {
      quickTaskInputRef.current?.focus();
    });
  };

  const closeQuickTaskComposer = () => {
    setQuickTaskOpen(false);
    setQuickTaskTitle('');
    setQuickTaskBucketName('');
    setQuickTaskBucketId(null);
  };

  const submitQuickTask = () => {
    const title = quickTaskTitle.trim();
    if (!title) return;

    const candidateBucketName = quickTaskBucketName.trim();
    const hasValidBucketName = candidateBucketName
      ? QUICK_TASK_BUCKET_NAME_PATTERN.test(candidateBucketName)
      : false;

    let targetBucketId: string | null = null;
    let createdBucketName: string | null = null;

    if (candidateBucketName && hasValidBucketName) {
      const existingBucketId = bucketIdByNormalizedName.get(normalizeBucketName(candidateBucketName)) ?? null;
      if (existingBucketId) {
        targetBucketId = existingBucketId;
      } else {
        const newBucketId = createId();
        dispatchPlanner({ type: 'ADD_BUCKET', name: candidateBucketName, id: newBucketId });
        targetBucketId = newBucketId;
        createdBucketName = candidateBucketName;
        setPendingBucketWarp(true);
      }
    }

    dispatchPlanner({
      type: 'ADD_TASK',
      draft: {
        title,
        description: '',
        bucketId: targetBucketId,
      },
    });

    setQuickTaskTitle('');
    if (targetBucketId) {
      const normalized = normalizeBucketName(createdBucketName ?? candidateBucketName);
      const stableName = state.buckets.find((bucket) => normalizeBucketName(bucket.name) === normalized)?.name
        ?? createdBucketName
        ?? candidateBucketName;
      setQuickTaskBucketId(targetBucketId);
      setQuickTaskBucketName(stableName);
    } else {
      setQuickTaskBucketId(null);
      setQuickTaskBucketName('');
    }
    setPendingTaskSurge(true);
    quickTaskInputRef.current?.focus();
  };

  const cycleQuickTaskBucket = () => {
    setQuickTaskBucketId((current) => {
      const currentIndex = Math.max(0, bucketHotkeyTargets.findIndex((value) => value === current));
      const nextIndex = (currentIndex + 1) % bucketHotkeyTargets.length;
      const nextBucketId = bucketHotkeyTargets[nextIndex] ?? null;
      setQuickTaskBucketName(nextBucketId ? bucketNameById.get(nextBucketId) ?? '' : '');
      return nextBucketId;
    });
  };

  const quickTaskBucketSuggestion = useMemo(() => {
    const typedValue = quickTaskBucketName.trim();
    if (!typedValue) return null;

    const typedLower = typedValue.toLowerCase();
    const match = state.buckets.find((bucket) => {
      const name = bucket.name.trim();
      const lower = name.toLowerCase();
      return lower.startsWith(typedLower) && lower !== typedLower;
    });

    return match?.name ?? null;
  }, [quickTaskBucketName, state.buckets]);

  const quickTaskBucketSuggestionSuffix = useMemo(() => {
    if (!quickTaskBucketSuggestion) return '';
    const typedValue = quickTaskBucketName.trim();
    if (!typedValue) return '';
    return quickTaskBucketSuggestion.slice(typedValue.length);
  }, [quickTaskBucketName, quickTaskBucketSuggestion]);

  const handleQuickTaskTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickTaskComposer();
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      const digit = Number(event.key);
      const bucketTarget = digit === 0 ? null : state.buckets[digit - 1]?.id;
      if (digit === 0 || bucketTarget) {
        event.preventDefault();
        setQuickTaskBucketId(bucketTarget ?? null);
        setQuickTaskBucketName(bucketTarget ? bucketNameById.get(bucketTarget) ?? '' : '');
      }
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitQuickTask();
  };

  const handleQuickTaskBucketKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickTaskComposer();
      return;
    }

    if (event.key === 'ArrowRight' && quickTaskBucketSuggestion) {
      const input = event.currentTarget;
      const cursorAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (cursorAtEnd) {
        event.preventDefault();
        setQuickTaskBucketName(quickTaskBucketSuggestion);
        const bucketId = bucketIdByNormalizedName.get(normalizeBucketName(quickTaskBucketSuggestion)) ?? null;
        setQuickTaskBucketId(bucketId);
      }
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitQuickTask();
  };

  const registerBucketElement = (bucketId: string, element: HTMLElement | null) => {
    bucketElementRefs.current[bucketId] = element;
  };

  const renameBucket = (bucket: Bucket) => {
    setRenameDialog({
      bucketId: bucket.id,
      initialName: bucket.name,
      value: bucket.name,
    });
    setRenameDialogError(null);
  };

  const deleteBucket = (bucket: Bucket) => {
    setConfirmDialog({
      title: 'Delete bucket',
      targetLabel: bucket.name,
      detail: 'Tasks in this bucket will move to Unassigned.',
      confirmLabel: 'Delete bucket',
      action: { type: 'delete-bucket', bucketId: bucket.id },
    });
  };

  const toggleBucketPin = (bucket: Bucket) => {
    dispatchPlanner({ type: 'TOGGLE_BUCKET_PIN', bucketId: bucket.id });
  };

  const moveBucketByOffset = (bucketId: string, offset: -1 | 1) => {
    const sourceIndex = state.buckets.findIndex((bucket) => bucket.id === bucketId);
    if (sourceIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(state.buckets.length - 1, sourceIndex + offset));
    if (targetIndex === sourceIndex) return;
    dispatchPlanner({ type: 'MOVE_BUCKET', bucketId, targetIndex });
  };

  const dropBucketAt = (targetIndex: number) => {
    if (!draggedBucketId) return;
    const sourceIndex = state.buckets.findIndex((bucket) => bucket.id === draggedBucketId);
    const settledFrom = sourceIndex >= 0 && targetIndex < sourceIndex ? 'right' : 'left';
    dispatchPlanner({ type: 'MOVE_BUCKET', bucketId: draggedBucketId, targetIndex });
    setSettledBucketDropIndex(targetIndex);
    setSettledBucketId(draggedBucketId);
    setSettledBucketFrom(settledFrom);
    const clearSettledBucketState = () => {
      setSettledBucketDropIndex(null);
      setSettledBucketId(null);
      setSettledBucketFrom(null);
      bucketDropSettleTimeoutRef.current = null;
    };
    if (bucketDropSettleTimeoutRef.current !== null) {
      window.clearTimeout(bucketDropSettleTimeoutRef.current);
    }
    bucketDropSettleTimeoutRef.current = window.setTimeout(() => {
      clearSettledBucketState();
    }, DROP_SETTLE_DURATION_MS);
    setDraggedBucketId(null);
    setActiveBucketDropIndex(null);
  };

  const deleteTask = (task: PlannerTask) => {
    setConfirmDialog({
      title: 'Delete task',
      targetLabel: task.title,
      confirmLabel: 'Delete task',
      action: { type: 'delete-task', taskId: task.id },
    });
  };

  const confirmDialogAction = () => {
    if (!confirmDialog) return;
    if (confirmDialog.action.type === 'delete-task') {
      dispatchPlanner({ type: 'DELETE_TASK', taskId: confirmDialog.action.taskId });
    }
    if (confirmDialog.action.type === 'delete-bucket') {
      dispatchPlanner({ type: 'DELETE_BUCKET', bucketId: confirmDialog.action.bucketId });
    }
    setConfirmDialog(null);
  };

  const submitRenameDialog = () => {
    if (!renameDialog) return;
    const name = renameDialog.value.trim();
    if (!name) {
      setRenameDialogError('Bucket name cannot be empty.');
      return;
    }
    if (name !== renameDialog.initialName) {
      dispatchPlanner({ type: 'RENAME_BUCKET', bucketId: renameDialog.bucketId, name });
    }
    setRenameDialog(null);
    setRenameDialogError(null);
  };

  const archiveCompletedTasks = () => {
    if (stats.completed === 0) return;
    setShowArchiveConfirm(true);
  };

  const confirmArchiveCompletedTasks = () => {
    dispatchPlanner({ type: 'ARCHIVE_COMPLETED_TASKS' });
    setShowArchiveConfirm(false);
  };

  const cancelArchiveCompletedTasks = () => {
    setShowArchiveConfirm(false);
  };

  const exportData = () => {
    setShowExportScopeMenu(false);
    let dataToExport: PlannerData = state;
    if (exportScope === 'unassigned') {
      dataToExport = {
        version: state.version,
        buckets: [],
        tasks: state.tasks.filter((task) => task.bucketId === null),
      };
    } else if (exportScope.startsWith('bucket:')) {
      const bucketId = exportScope.slice('bucket:'.length);
      const bucket = state.buckets.find((item) => item.id === bucketId) ?? null;
      dataToExport = {
        version: state.version,
        buckets: bucket ? [bucket] : [],
        tasks: state.tasks.filter((task) => task.bucketId === bucketId),
      };
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bsp-planner-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const readPlannerDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return null;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isPlannerData(parsed)) {
        setDataActionMessage(`Selected file is not a valid ${APP_NAME} export.`);
        return null;
      }
      setDataActionMessage(null);
      return normalizePlannerData(parsed);
    } catch {
      setDataActionMessage('Selected file could not be read as JSON.');
      return null;
    }
  };

  const restoreDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const parsedData = await readPlannerDataFromFile(event);
    if (!parsedData) return;
    setPendingUploadData(null);
    setPendingRestoreData(parsedData);
  };

  const mergeDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const parsedData = await readPlannerDataFromFile(event);
    if (!parsedData) return;
    setPendingRestoreData(null);
    setPendingUploadData(parsedData);
  };

  const confirmRestoreData = () => {
    if (!pendingRestoreData) return;
    setLastRestoreBackup(state);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
    dispatchPlanner({ type: 'REPLACE_DATA', data: pendingRestoreData });
    setPendingRestoreData(null);
    setDataActionMessage(null);
  };

  const confirmUploadData = () => {
    if (!pendingUploadData) return;
    const mergedUpload = mergeUploadedPlannerData(state, pendingUploadData);
    dispatchPlanner({ type: 'REPLACE_DATA', data: mergedUpload.data });
    if (uploadHaloTimeoutRef.current !== null) {
      window.clearTimeout(uploadHaloTimeoutRef.current);
    }
    setUploadedTaskIds((current) => Array.from(new Set([...current, ...mergedUpload.uploadedTaskIds])));
    uploadHaloTimeoutRef.current = window.setTimeout(() => {
      setUploadedTaskIds([]);
      uploadHaloTimeoutRef.current = null;
    }, UPLOAD_HALO_DURATION_MS);
    setPendingUploadData(null);
    setDataActionMessage(
      `Uploaded ${mergedUpload.uploadedTaskIds.length} task(s); merged into ${mergedUpload.mergedIntoExistingBucketCount} existing bucket(s); created ${mergedUpload.createdBucketCount} bucket(s); skipped ${mergedUpload.skippedDuplicateCount} duplicate task(s).`,
    );
  };

  const undoRestoreData = () => {
    if (!lastRestoreBackup) return;
    dispatchPlanner({ type: 'REPLACE_DATA', data: lastRestoreBackup });
    setLastRestoreBackup(null);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
    setDataActionMessage(null);
  };

  const dismissRestoreUndoCard = () => {
    if (isRestoreUndoClosing) return;
    setIsRestoreUndoClosing(true);
    if (restoreUndoCloseTimeoutRef.current !== null) {
      window.clearTimeout(restoreUndoCloseTimeoutRef.current);
    }
    restoreUndoCloseTimeoutRef.current = window.setTimeout(() => {
      setHideRestoreUndoCard(true);
      setIsRestoreUndoClosing(false);
      restoreUndoCloseTimeoutRef.current = null;
    }, 420);
  };

  const pendingRestoreSummary = pendingRestoreData
    ? `${pendingRestoreData.tasks.length} task(s) and ${pendingRestoreData.buckets.length} bucket(s)`
    : '';
  const pendingUploadSummary = pendingUploadData
    ? `${pendingUploadData.tasks.length} task(s) and ${pendingUploadData.buckets.length} bucket(s)`
    : '';
  const exportScopeOptionCount = 2 + state.buckets.length;

  useEffect(() => {
    if (exportScope.startsWith('bucket:')) {
      const bucketId = exportScope.slice('bucket:'.length);
      const exists = state.buckets.some((bucket) => bucket.id === bucketId);
      if (!exists) {
        setExportScope('all');
      }
    }
  }, [exportScope, state.buckets]);

  const clearSearchStatusTimer = () => {
    if (hideSearchStatusTimeoutRef.current !== null) {
      window.clearTimeout(hideSearchStatusTimeoutRef.current);
      hideSearchStatusTimeoutRef.current = null;
    }
  };

  const scheduleSearchStatusHide = (delayMs = 700) => {
    clearSearchStatusTimer();
    hideSearchStatusTimeoutRef.current = window.setTimeout(() => {
      setShowSearchStatus(false);
      hideSearchStatusTimeoutRef.current = null;
    }, delayMs);
  };

  const showTemporaryStatus = (message: string) => {
    setStatus(message);
    setShowSearchStatus(true);
    scheduleSearchStatusHide(1600);
  };

  const applyTaskSelection = (
    taskId: string,
    options: {
      shift: boolean;
      toggle: boolean;
    },
  ) => {
    if (options.shift && selectionAnchorTaskId) {
      const anchorIndex = visibleTaskIndexById.get(selectionAnchorTaskId);
      const targetIndex = visibleTaskIndexById.get(taskId);
      if (anchorIndex !== undefined && targetIndex !== undefined) {
        const [start, end] = anchorIndex < targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
        const rangeIds = orderedVisibleTaskIds.slice(start, end + 1);
        setSelectedTaskIds((current) => {
          if (options.toggle) {
            return Array.from(new Set([...current, ...rangeIds]));
          }
          return rangeIds;
        });
        setActivePasteBucketId(state.tasks.find((task) => task.id === taskId)?.bucketId ?? null);
        return;
      }
    }

    if (options.toggle) {
      setSelectedTaskIds((current) => {
        const exists = current.includes(taskId);
        if (exists) {
          return current.filter((item) => item !== taskId);
        }
        return [...current, taskId];
      });
      setSelectionAnchorTaskId(taskId);
      setActivePasteBucketId(state.tasks.find((task) => task.id === taskId)?.bucketId ?? null);
      return;
    }

    setSelectedTaskIds([taskId]);
    setSelectionAnchorTaskId(taskId);
    setActivePasteBucketId(state.tasks.find((task) => task.id === taskId)?.bucketId ?? null);
  };

  const handleTaskCardSelection = (taskId: string, event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label, textarea, select, a')) return;

    applyTaskSelection(taskId, {
      shift: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
  };

  const setClipboardFromTasks = (tasks: PlannerTask[]) => {
    setTaskClipboard(
      tasks.map((task) => ({
        title: task.title,
        description: task.description,
      })),
    );
  };

  const copyTaskToClipboard = (task: PlannerTask, bucketName: string) => {
    setClipboardFromTasks([task]);
    setSelectedTaskIds([task.id]);
    setSelectionAnchorTaskId(task.id);
    setActivePasteBucketId(task.bucketId);

    void (async () => {
      try {
        await copyTextToClipboard(formatTaskForSingleCopy(task, bucketName));
        showTemporaryStatus(`Copied "${task.title}"`);
      } catch {
        showTemporaryStatus('Could not copy task');
      }
    })();
  };

  const copyBucketTasksToClipboard = (bucketId: string | null) => {
    const bucketName = bucketId ? bucketNameById.get(bucketId) ?? 'Unassigned' : 'Unassigned';
    const tasks = tasksByBucket.get(bucketId) ?? [];

    if (tasks.length === 0) {
      showTemporaryStatus(`No tasks to copy from ${bucketName}`);
      return;
    }

    setClipboardFromTasks(tasks);
    setSelectedTaskIds(tasks.map((task) => task.id));
    setSelectionAnchorTaskId(tasks[0]?.id ?? null);
    setActivePasteBucketId(bucketId);

    void (async () => {
      try {
        await copyTextToClipboard(tasks.map(formatTaskForOrderedCopy).join('\n'));
        showTemporaryStatus(`Copied ${tasks.length} task${tasks.length === 1 ? '' : 's'} from ${bucketName}`);
      } catch {
        showTemporaryStatus(`Could not copy ${bucketName}`);
      }
    })();
  };

  const copySelectedTasks = () => {
    const tasks = state.tasks.filter(
      (task) => selectedTaskIdSet.has(task.id) && !task.archivedAt,
    );
    if (tasks.length === 0) {
      showTemporaryStatus('Select tasks to copy first');
      return;
    }

    setClipboardFromTasks(tasks);

    void (async () => {
      try {
        await copyTextToClipboard(tasks.map(formatTaskForOrderedCopy).join('\n'));
        showTemporaryStatus(`Copied ${tasks.length} selected task${tasks.length === 1 ? '' : 's'}`);
      } catch {
        showTemporaryStatus('Could not copy selected tasks');
      }
    })();
  };

  const pasteTasksIntoBucket = (bucketId: string | null) => {
    if (taskClipboard.length === 0) {
      showTemporaryStatus('Copy tasks first to paste');
      return;
    }

    dispatchPlanner({
      type: 'ADD_TASK_BATCH',
      drafts: taskClipboard.map((task) => ({
        title: task.title,
        description: task.description,
        bucketId,
      })),
    });

    setPendingTaskSurge(true);
    setActivePasteBucketId(bucketId);
    const bucketName = bucketId ? bucketNameById.get(bucketId) ?? 'Unassigned' : 'Unassigned';
    showTemporaryStatus(`Pasted ${taskClipboard.length} task${taskClipboard.length === 1 ? '' : 's'} into ${bucketName}`);
  };

  const handleTaskDragStart = (taskId: string, taskIds: string[]) => {
    setDraggedTaskId(taskId);
    setDraggedTaskIds(taskIds);
    setSelectedTaskIds(taskIds);
    setSelectionAnchorTaskId(taskId);
    setActivePasteBucketId(state.tasks.find((task) => task.id === taskId)?.bucketId ?? null);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDraggedTaskIds([]);
  };

  const moveTasksToBucket = (taskIds: string[], bucketId: string | null, targetIndex?: number) => {
    if (taskIds.length === 0) return;

    if (taskIds.length === 1) {
      dispatchPlanner({
        type: 'MOVE_TASK',
        taskId: taskIds[0],
        bucketId,
        targetIndex,
      });
      return;
    }

    dispatchPlanner({
      type: 'MOVE_TASKS',
      taskIds,
      bucketId,
      targetIndex,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

      const withMeta = event.ctrlKey || event.metaKey;
      if (!withMeta) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        dispatchHistory({ type: 'REDO' });
        showTemporaryStatus('Redo');
        return;
      }

      if (key === 'z') {
        if (!canUndo) return;
        event.preventDefault();
        dispatchHistory({ type: 'UNDO' });
        showTemporaryStatus('Undo');
        return;
      }

      if (key === 'y') {
        if (!canRedo) return;
        event.preventDefault();
        dispatchHistory({ type: 'REDO' });
        showTemporaryStatus('Redo');
        return;
      }

      if (key === 'c' && selectedTaskIds.length > 0) {
        event.preventDefault();
        copySelectedTasks();
        return;
      }

      if (key === 'v' && taskClipboard.length > 0) {
        event.preventDefault();
        pasteTasksIntoBucket(activePasteBucketId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activePasteBucketId, canRedo, canUndo, selectedTaskIds.length, taskClipboard, state.tasks, selectedTaskIdSet]);

  useEffect(() => {
    if (isSearchFocused || searchQuery.trim()) {
      clearSearchStatusTimer();
      setShowSearchStatus(true);
      return;
    }
    scheduleSearchStatusHide();
  }, [isSearchFocused, searchQuery]);

  useEffect(() => {
    if (!pendingRestoreData) return;
    ensureScrollableTargetInView(sidepanelRef.current, restoreConfirmRef.current);
  }, [pendingRestoreData]);

  useEffect(() => {
    if (!pendingUploadData) return;
    ensureScrollableTargetInView(sidepanelRef.current, uploadConfirmRef.current);
  }, [pendingUploadData]);

  useEffect(() => {
    if (!pendingBucketWarp || state.buckets.length === 0) return;

    const latestBucket = state.buckets.reduce((latest, current) => (
      current.createdAt > latest.createdAt ? current : latest
    ));

    const target = bucketElementRefs.current[latestBucket.id];
    const frame = boardFrameRef.current;
    if (!target || !frame) return;

    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const fullyVisible =
      targetRect.left >= frameRect.left + 12 &&
      targetRect.right <= frameRect.right - 12;

    if (!fullyVisible) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    setHighlightedBucketId(latestBucket.id);
    if (bucketHighlightTimeoutRef.current !== null) {
      window.clearTimeout(bucketHighlightTimeoutRef.current);
    }
    bucketHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedBucketId(null);
      bucketHighlightTimeoutRef.current = null;
    }, 2600);
    setPendingBucketWarp(false);
  }, [pendingBucketWarp, state.buckets]);

  useEffect(() => {
    if (!pendingTaskSurge || state.tasks.length === 0) return;

    const latestTask = state.tasks.reduce((latest, current) => (
      current.createdAt > latest.createdAt ? current : latest
    ));

    setHighlightedTaskId(latestTask.id);
    setHighlightedTaskBucketId(latestTask.bucketId);

    if (taskSurgeTimeoutRef.current !== null) {
      window.clearTimeout(taskSurgeTimeoutRef.current);
    }
    taskSurgeTimeoutRef.current = window.setTimeout(() => {
      setHighlightedTaskId(null);
      setHighlightedTaskBucketId(null);
      taskSurgeTimeoutRef.current = null;
    }, 2200);

    setPendingTaskSurge(false);
  }, [pendingTaskSurge, state.tasks]);

  const draggedTaskAccentIndex = useMemo(() => {
    const leadTaskId = draggedTaskIds[0] ?? draggedTaskId;
    if (!leadTaskId) return null;
    const draggedTask = state.tasks.find((task) => task.id === leadTaskId) ?? null;
    if (!draggedTask) return null;
    return accentIndexFromBucket(draggedTask.bucketId);
  }, [draggedTaskId, draggedTaskIds, state.tasks]);

  const uploadedTaskIdSet = useMemo(() => new Set(uploadedTaskIds), [uploadedTaskIds]);

  const triageRecommendation = 'Recommendation: Unassigned stays fixed on the far left. Pin your triage buckets nearby for faster planning.';

  useEffect(() => {
    if (!showExportScopeMenu) return;
    ensureScrollableTargetInView(sidepanelRef.current, exportScopeMenuRef.current);
  }, [showExportScopeMenu]);

  useEffect(() => {
    if (!quickTaskOpen) return;
    ensureScrollableTargetInView(sidepanelRef.current, quickTaskShellRef.current, 16);
  }, [quickTaskOpen]);

  const clearSidepanelCloseTimer = () => {
    if (sidepanelCloseTimeoutRef.current !== null) {
      window.clearTimeout(sidepanelCloseTimeoutRef.current);
      sidepanelCloseTimeoutRef.current = null;
    }
  };

  const clearSidepanelOpenTimer = () => {
    if (sidepanelOpenTimeoutRef.current !== null) {
      window.clearTimeout(sidepanelOpenTimeoutRef.current);
      sidepanelOpenTimeoutRef.current = null;
    }
  };

  const hasSidepanelInteractionTarget = () => {
    const activeElement = document.activeElement;
    const focusInPanel = Boolean(
      activeElement &&
      (sidepanelRef.current?.contains(activeElement) || sidepanelToggleGroupRef.current?.contains(activeElement)),
    );
    const hoverInPanel = Boolean(sidepanelRef.current?.matches(':hover'));
    const hoverInToggle = Boolean(sidepanelToggleButtonRef.current?.matches(':hover'));
    const hoverInLock = Boolean(sidepanelLockButtonRef.current?.matches(':hover'));

    if (!hoverInPanel) sidepanelHoveringRef.current = false;
    if (!hoverInToggle) sidepanelToggleHoveringRef.current = false;
    if (!hoverInLock) sidepanelLockHoveringRef.current = false;

    return hoverInPanel || hoverInToggle || hoverInLock || focusInPanel;
  };

  const openSidepanelForInteraction = () => {
    clearSidepanelCloseTimer();
    clearSidepanelOpenTimer();
    if (isSidepanelLocked) return;
    setIsSidepanelOpen(true);
  };

  const scheduleSidepanelClose = (delayMs = 220) => {
    if (isSidepanelLocked) return;
    clearSidepanelCloseTimer();
    sidepanelCloseTimeoutRef.current = window.setTimeout(() => {
      if (isSidepanelLocked) return;
      if (hasSidepanelInteractionTarget()) return;
      setIsSidepanelOpen(false);
      sidepanelCloseTimeoutRef.current = null;
    }, delayMs);
  };

  const handleSidepanelToggleMouseEnter = () => {
    sidepanelToggleHoveringRef.current = true;
    clearSidepanelCloseTimer();
    if (isSidepanelOpen || isSidepanelLocked) return;
    clearSidepanelOpenTimer();
    sidepanelOpenTimeoutRef.current = window.setTimeout(() => {
      setIsSidepanelOpen(true);
      sidepanelOpenTimeoutRef.current = null;
    }, 120);
  };

  const handleSidepanelToggleMouseLeave = () => {
    sidepanelToggleHoveringRef.current = false;
    clearSidepanelOpenTimer();
    scheduleSidepanelClose(180);
  };

  const handleSidepanelLockMouseEnter = () => {
    sidepanelLockHoveringRef.current = true;
    clearSidepanelOpenTimer();
    clearSidepanelCloseTimer();
  };

  const handleSidepanelLockMouseLeave = () => {
    sidepanelLockHoveringRef.current = false;
    scheduleSidepanelClose(180);
  };

  const handleSidepanelMouseEnter = () => {
    sidepanelHoveringRef.current = true;
    clearSidepanelCloseTimer();
  };

  const handleSidepanelMouseLeave = () => {
    sidepanelHoveringRef.current = false;
    scheduleSidepanelClose(220);
  };

  const handleSidepanelFocusCapture = (event: ReactFocusEvent<HTMLElement>) => {
    if (sidepanelLockButtonRef.current?.contains(event.target as Node)) {
      clearSidepanelCloseTimer();
      clearSidepanelOpenTimer();
      return;
    }
    openSidepanelForInteraction();
  };

  const handleSidepanelBlurCapture = () => {
    window.setTimeout(() => {
      scheduleSidepanelClose(120);
    }, 0);
  };

  const toggleSidepanelOpen = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    clearSidepanelCloseTimer();
    clearSidepanelOpenTimer();
    setIsSidepanelOpen((current) => !current);
  };

  const toggleSidepanelLock = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    clearSidepanelOpenTimer();
    clearSidepanelCloseTimer();
    setIsSidepanelLocked((current) => {
      return !current;
    });
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-icon" aria-hidden="true">{APP_ICON_TEXT}</span>
          <div>
            <p className="eyebrow">{APP_BANNER}</p>
            <h1>{APP_NAME}</h1>
            <p className="subtitle">Organize tasks into buckets with drag-and-drop ordering and a clean workspace.</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-search-stack">
            <div className="header-search">
              <label className="visually-hidden" htmlFor="task-search-input">
                Search tasks
              </label>
              <input
                id="task-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search tasks"
                aria-label="Search tasks"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              )}
            </div>
            <span className={`save-status search-status${showSearchStatus ? ' visible' : ''}`}>
              {status} · {stats.open} open / {stats.activeTotal} active · {stats.archived} archived
            </span>
          </div>
          <div className="visual-mode-toggle" role="group" aria-label="Visual mode">
            <button
              type="button"
              className={`mode-button${visualMode === 'calm' ? ' active' : ''}`}
              onClick={() => setVisualMode('calm')}
            >
              Calm
            </button>
            <button
              type="button"
              className={`mode-button${visualMode === 'balanced' ? ' active' : ''}`}
              onClick={() => setVisualMode('balanced')}
            >
              Balanced
            </button>
            <button
              type="button"
              className={`mode-button${visualMode === 'energetic' ? ' active' : ''}`}
              onClick={() => setVisualMode('energetic')}
            >
              Energetic
            </button>
          </div>
          <div className="theme-toggle" role="group" aria-label="Theme mode">
            <button
              type="button"
              className={`theme-button${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`theme-button${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
          </div>
        </div>
      </header>

      <div className={`workspace-layout ${isSidepanelOpen ? 'sidepanel-open' : 'sidepanel-closed'}`}>
        <section
          className={`board-stage board-zoom-${boardZoomIndex}`}
          aria-label="Planner board"
        >
          <div className="board-stage-toolbar">
            <div className="board-zoom-toggle" role="group" aria-label="Board zoom">
              <button
                type="button"
                className="zoom-button"
                onClick={() => setBoardZoomIndex((current) => Math.max(MIN_BOARD_ZOOM_INDEX, current - 1))}
                disabled={boardZoomIndex === MIN_BOARD_ZOOM_INDEX}
              >
                -
              </button>
              <span className="zoom-status">View</span>
              <button
                type="button"
                className="zoom-button"
                onClick={() => setBoardZoomIndex((current) => Math.min(MAX_BOARD_ZOOM_INDEX, current + 1))}
                disabled={boardZoomIndex === MAX_BOARD_ZOOM_INDEX}
              >
                +
              </button>
            </div>
            <div className="board-actions" role="group" aria-label="Board actions">
              <button
                type="button"
                className="secondary-button"
                onClick={copySelectedTasks}
                disabled={selectedTaskIds.length === 0}
                title={selectedTaskIds.length === 0 ? 'Select task cards to copy' : 'Copy selected tasks'}
              >
                Copy selected ({selectedTaskIds.length})
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => dispatchHistory({ type: 'UNDO' })}
                disabled={!canUndo}
                aria-label="Undo"
                title="Undo (Ctrl/Cmd+Z)"
              >
                ↶
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => dispatchHistory({ type: 'REDO' })}
                disabled={!canRedo}
                aria-label="Redo"
                title="Redo (Ctrl/Cmd+Y)"
              >
                ↷
              </button>
            </div>
          </div>
          <aside
            ref={sidepanelRef}
            className={`sidepanel ${isSidepanelOpen ? 'open' : 'collapsed'}`}
            aria-label="Planner controls"
            onMouseEnter={handleSidepanelMouseEnter}
            onMouseLeave={handleSidepanelMouseLeave}
            onFocusCapture={handleSidepanelFocusCapture}
            onBlurCapture={handleSidepanelBlurCapture}
          >
            <div
              ref={sidepanelToggleGroupRef}
              className="sidepanel-toggle-group"
              data-expanded={isSidepanelOpen ? 'true' : 'false'}
              data-auto-open-locked={isSidepanelLocked ? 'true' : 'false'}
              onFocusCapture={handleSidepanelFocusCapture}
              onBlurCapture={handleSidepanelBlurCapture}
            >
              <button
                ref={sidepanelToggleButtonRef}
                type="button"
                className="sidepanel-toggle"
                onClick={toggleSidepanelOpen}
                onMouseEnter={handleSidepanelToggleMouseEnter}
                onMouseLeave={handleSidepanelToggleMouseLeave}
                title={sidepanelToggleTitle}
                aria-label={isSidepanelOpen ? 'Close planner controls' : 'Open planner controls'}
              >
                <span className="sidepanel-toggle-icon" aria-hidden="true">
                  {sidepanelToggleIcon}
                </span>
                <span className="sidepanel-toggle-label">{sidepanelToggleLabel}</span>
              </button>
              <button
                ref={sidepanelLockButtonRef}
                type="button"
                className="sidepanel-lock-toggle"
                onClick={toggleSidepanelLock}
                onMouseEnter={handleSidepanelLockMouseEnter}
                onMouseLeave={handleSidepanelLockMouseLeave}
                title={sidepanelLockLabel}
                aria-label={sidepanelLockLabel}
              >
                {sidepanelLockIcon}
              </button>
            </div>
            <section className="panel-card">
              <h2>Tasks</h2>
              <div ref={quickTaskShellRef} className={`quick-task-shell interaction-scroll-target${quickTaskOpen ? ' open' : ''}`}>
                {quickTaskOpen && (
                  <div className="quick-task-fields interaction-enter">
                    <div className="quick-task-input-stack">
                      <input
                        ref={quickTaskInputRef}
                        className="quick-task-input"
                        value={quickTaskTitle}
                        onChange={(event) => setQuickTaskTitle(event.target.value)}
                        onKeyDown={handleQuickTaskTitleKeyDown}
                        placeholder="Task title"
                        maxLength={160}
                        aria-label="Quick add task title"
                      />
                      <div className="quick-task-bucket-field">
                        {quickTaskBucketSuggestionSuffix && (
                          <span className="quick-task-bucket-ghost" aria-hidden="true">
                            <span className="quick-task-bucket-ghost-typed">{quickTaskBucketName.trim()}</span>
                            <span className="quick-task-bucket-ghost-suffix">{quickTaskBucketSuggestionSuffix}</span>
                          </span>
                        )}
                        <input
                          ref={quickTaskBucketInputRef}
                          className="quick-task-bucket-input"
                          value={quickTaskBucketName}
                          onChange={(event) => {
                            const value = event.target.value;
                            setQuickTaskBucketName(value);
                            const existingBucketId = bucketIdByNormalizedName.get(normalizeBucketName(value)) ?? null;
                            setQuickTaskBucketId(existingBucketId);
                          }}
                          onKeyDown={handleQuickTaskBucketKeyDown}
                          placeholder="Bucket (optional)"
                          maxLength={80}
                          list="quick-task-bucket-options"
                          title="Autocomplete available. Press Right Arrow to accept suggestion."
                          aria-label="Quick add bucket name"
                        />
                      </div>
                      <datalist id="quick-task-bucket-options">
                        {state.buckets.map((bucket) => (
                          <option key={bucket.id} value={bucket.name} />
                        ))}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={submitQuickTask}
                      disabled={!quickTaskTitle.trim()}
                    >
                      Add task
                    </button>
                  </div>
                )}
              </div>

            </section>

            <section className="panel-card" aria-label="Create bucket">
              <h2>Buckets</h2>
              <input
                value={bucketName}
                onChange={(event) => setBucketName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addBucket();
                }}
                placeholder="New bucket name"
                maxLength={80}
              />
              <button type="button" className="secondary-button" onClick={addBucket}>
                Add bucket
              </button>
            </section>

            <section className="archive-panel panel-card" aria-label="Archived tasks">
              <div className="archive-header">
                <h2>Archive</h2>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowArchive((current) => !current)}
                >
                  {showArchive ? 'Hide' : 'Show'} ({archivedTasks.length})
                </button>
              </div>

              <div className="archive-controls">
                <label className="inline-toggle" title="Toggle completed task visibility">
                  <input
                    type="checkbox"
                    checked={showCompleted}
                    onChange={(event) => setShowCompleted(event.target.checked)}
                  />
                  <span>Show completed</span>
                </label>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={archiveCompletedTasks}
                  disabled={stats.completed === 0}
                >
                  Archive completed ({stats.completed})
                </button>

                {showArchiveConfirm && stats.completed > 0 && (
                  <div className="inline-confirm" role="group" aria-label="Confirm archive completed tasks">
                    <span className="inline-confirm-text">
                      Archive {stats.completed} completed task{stats.completed === 1 ? '' : 's'}?
                    </span>
                    <div className="inline-confirm-actions">
                      <button
                        type="button"
                        className="icon-button inline-confirm-accept"
                        onClick={confirmArchiveCompletedTasks}
                        aria-label="Confirm archive completed tasks"
                        title="Confirm"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="icon-button inline-confirm-cancel"
                        onClick={cancelArchiveCompletedTasks}
                        aria-label="Cancel archive completed tasks"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {!showCompleted && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setShowCompleted(true);
                    }}
                  >
                    Show completed again
                  </button>
                )}

                <p className="toolbar-meta archive-meta">Showing {stats.visible} task(s)</p>
                <p className="toolbar-meta pin-recommendation archive-meta">{triageRecommendation}</p>
              </div>

              {showArchive && (
                archivedTasks.length > 0 ? (
                  <div className="archive-list">
                    {archivedTasks
                      .slice()
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                      .map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          draggable={false}
                          dragLabel="Archived"
                          onEdit={() => setEditor({ task, defaultBucketId: task.bucketId })}
                          onDelete={() => deleteTask(task)}
                          onToggle={() => dispatchPlanner({ type: 'TOGGLE_TASK', taskId: task.id })}
                          onTogglePin={() => dispatchPlanner({ type: 'TOGGLE_TASK_PIN', taskId: task.id })}
                          onCopy={() => copyTaskToClipboard(
                            task,
                            task.bucketId ? bucketNameById.get(task.bucketId) ?? 'Unassigned' : 'Unassigned',
                          )}
                          onAuxAction={() => dispatchPlanner({ type: 'UNARCHIVE_TASK', taskId: task.id })}
                          auxActionLabel="Undo"
                          onDragStart={(_event) => undefined}
                          onDragEnd={() => undefined}
                          bucketName={task.bucketId ? bucketNameById.get(task.bucketId) ?? 'Unassigned' : 'Unassigned'}
                        />
                      ))}
                  </div>
                ) : (
                  <p className="archive-empty">No archived tasks yet.</p>
                )
              )}
            </section>

            <section className="panel-card data-panel" aria-label="Data controls">
              <h2>Data</h2>
              <div className="data-action-row">
                <button type="button" className="secondary-button" onClick={() => uploadInputRef.current?.click()}>
                  Upload JSON
                </button>
                <span className="help-icon" title="Uploads data and merges it into your current planner by creating new IDs for imported items.">!</span>
              </div>

              {pendingUploadData && (
                <div ref={uploadConfirmRef} className="inline-confirm interaction-scroll-target interaction-enter" role="group" aria-label="Confirm upload data">
                  <span className="inline-confirm-text">
                    Upload {pendingUploadSummary} into current planner?
                  </span>
                  <div className="inline-confirm-actions">
                    <button
                      type="button"
                      className="icon-button inline-confirm-accept"
                      onClick={confirmUploadData}
                      aria-label="Confirm upload"
                      title="Confirm upload"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="icon-button inline-confirm-cancel"
                      onClick={() => setPendingUploadData(null)}
                      aria-label="Cancel upload"
                      title="Cancel upload"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <div className="data-action-row export-action-row">
                <button
                  type="button"
                  className="icon-button data-options-button"
                  onClick={() => setShowExportScopeMenu((current) => !current)}
                  aria-label="Choose export scope"
                  title="Choose export scope"
                >
                  ⋮
                </button>
                <button type="button" className="secondary-button" onClick={exportData}>
                  Export JSON
                </button>
                <span className="help-icon" title="Exports current planner data using the selected scope.">!</span>
              </div>

              {showExportScopeMenu && (
                <div
                  ref={exportScopeMenuRef}
                  className={`scope-menu interaction-scroll-target interaction-enter${exportScopeOptionCount > 5 ? ' scope-menu-scrollable' : ''}`}
                  aria-label="Export scope options"
                >
                  <button
                    type="button"
                    className={`scope-menu-item${exportScope === 'all' ? ' active' : ''}`}
                    onClick={() => {
                      setExportScope('all');
                      setShowExportScopeMenu(false);
                    }}
                  >
                    All data
                  </button>
                  <button
                    type="button"
                    className={`scope-menu-item${exportScope === 'unassigned' ? ' active' : ''}`}
                    onClick={() => {
                      setExportScope('unassigned');
                      setShowExportScopeMenu(false);
                    }}
                  >
                    Unassigned tasks
                  </button>
                  {state.buckets.map((bucket) => (
                    <button
                      key={bucket.id}
                      type="button"
                      className={`scope-menu-item${exportScope === `bucket:${bucket.id}` ? ' active' : ''}`}
                      onClick={() => {
                        setExportScope(`bucket:${bucket.id}`);
                        setShowExportScopeMenu(false);
                      }}
                    >
                      Bucket: {bucket.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="data-action-row">
                <button type="button" className="secondary-button" onClick={() => restoreInputRef.current?.click()}>
                  Restore JSON
                </button>
                <span className="help-icon" title="Restores planner from a backup file and replaces current data after confirmation.">!</span>
              </div>

              {pendingRestoreData && (
                <div ref={restoreConfirmRef} className="inline-confirm interaction-scroll-target interaction-enter" role="group" aria-label="Confirm restore data">
                  <span className="inline-confirm-text">
                    Restore {pendingRestoreSummary} and replace current planner?
                  </span>
                  <div className="inline-confirm-actions">
                    <button
                      type="button"
                      className="icon-button inline-confirm-accept"
                      onClick={confirmRestoreData}
                      aria-label="Confirm restore"
                      title="Confirm restore"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="icon-button inline-confirm-cancel"
                      onClick={() => setPendingRestoreData(null)}
                      aria-label="Cancel restore"
                      title="Cancel restore"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {lastRestoreBackup && !hideRestoreUndoCard && (
                <div
                  className={`inline-confirm restore-undo${isRestoreUndoClosing ? ' is-closing' : ''}`}
                  role="group"
                  aria-label="Undo restore"
                >
                  <div className="restore-undo-head">
                    <span className="inline-confirm-text">Need to revert the last restore?</span>
                    <button
                      type="button"
                      className="icon-button restore-undo-close"
                      onClick={dismissRestoreUndoCard}
                      aria-label="Dismiss undo restore notice"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="inline-confirm-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={undoRestoreData}
                      aria-label="Undo restore"
                    >
                      Undo
                    </button>
                  </div>
                </div>
              )}

              {dataActionMessage && <p className="data-message">{dataActionMessage}</p>}

              <input
                ref={restoreInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Restore planner data from JSON"
                onChange={restoreDataFromFile}
              />
              <input
                ref={uploadInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Upload planner data from JSON"
                onChange={mergeDataFromFile}
              />
            </section>
          </aside>
          <div ref={boardFrameRef} className="board-frame">
            <section className="board">
              <BucketColumn
                columnIndex={0}
                bucket={null}
                tasks={filteredTasksByBucket.get(null) ?? []}
                draggedTaskId={draggedTaskId}
                isBucketDragActive={Boolean(draggedBucketId)}
                nudgeFromRightGap={Boolean(draggedBucketId) && activeBucketDropIndex === 0}
                isBucketDropSettled={false}
                bucketDropSettleFrom={null}
                draggedAccentIndex={draggedTaskAccentIndex}
                highlightedTaskId={highlightedTaskId}
                uploadedTaskIdSet={uploadedTaskIdSet}
                copyTaskCount={tasksByBucket.get(null)?.length ?? 0}
                isWarpHighlight={highlightedTaskBucketId === null}
                onCopyBucketTasks={copyBucketTasksToClipboard}
                onCopyTask={copyTaskToClipboard}
                onQuickAddTask={addTaskFromBoard}
                onEditTask={(task) => setEditor({ task, defaultBucketId: task.bucketId })}
                onDeleteTask={deleteTask}
                onToggleTask={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK', taskId })}
                onToggleTaskPin={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK_PIN', taskId })}
                onMoveTask={(taskId, bucketId, targetIndex) => moveTasksToBucket([taskId], bucketId, targetIndex)}
                onMoveTasks={moveTasksToBucket}
                selectedTaskIds={selectedTaskIdSet}
                onSelectTask={handleTaskCardSelection}
                onPasteIntoBucket={pasteTasksIntoBucket}
                canPasteIntoBucket={taskClipboard.length > 0}
                onDragStart={handleTaskDragStart}
                onDragEnd={handleTaskDragEnd}
                onBucketDropSettleEnd={() => {
                  if (bucketDropSettleTimeoutRef.current !== null) {
                    window.clearTimeout(bucketDropSettleTimeoutRef.current);
                    bucketDropSettleTimeoutRef.current = null;
                  }
                  setSettledBucketDropIndex(null);
                  setSettledBucketId(null);
                  setSettledBucketFrom(null);
                }}
              />

              {state.buckets.map((bucket, index) => (
                <Fragment key={bucket.id}>
                  <div
                    className={`bucket-drop-slot interaction-drop-slot interaction-bucket-drop-slot bucket-accent-${accentIndexFromBucket(bucket.id)}${draggedBucketId ? ' visible' : ''}${activeBucketDropIndex === index ? ' active' : ''}${settledBucketDropIndex === index ? ' settled' : ''}`}
                    onDragOver={(event) => {
                      if (!draggedBucketId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setActiveBucketDropIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropBucketAt(index);
                    }}
                    aria-hidden="true"
                  />
                  <BucketColumn
                    columnIndex={index + 1}
                    bucket={bucket}
                    tasks={filteredTasksByBucket.get(bucket.id) ?? []}
                    draggedTaskId={draggedTaskId}
                    isBucketDragActive={Boolean(draggedBucketId)}
                    nudgeFromLeftGap={Boolean(draggedBucketId) && activeBucketDropIndex === index}
                    nudgeFromRightGap={Boolean(draggedBucketId) && activeBucketDropIndex === index + 1}
                    isBucketDropSettled={settledBucketId === bucket.id}
                    bucketDropSettleFrom={settledBucketId === bucket.id ? settledBucketFrom : null}
                    draggedAccentIndex={draggedTaskAccentIndex}
                    highlightedTaskId={highlightedTaskId}
                    uploadedTaskIdSet={uploadedTaskIdSet}
                    copyTaskCount={tasksByBucket.get(bucket.id)?.length ?? 0}
                    registerColumnRef={registerBucketElement}
                    isWarpHighlight={highlightedBucketId === bucket.id || highlightedTaskBucketId === bucket.id}
                    onCopyBucketTasks={copyBucketTasksToClipboard}
                    onCopyTask={copyTaskToClipboard}
                    onQuickAddTask={addTaskFromBoard}
                    onEditTask={(task) => setEditor({ task, defaultBucketId: task.bucketId })}
                    onDeleteTask={deleteTask}
                    onToggleTask={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK', taskId })}
                    onToggleTaskPin={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK_PIN', taskId })}
                    onMoveTask={(taskId, bucketId, targetIndex) => moveTasksToBucket([taskId], bucketId, targetIndex)}
                    onMoveTasks={moveTasksToBucket}
                    selectedTaskIds={selectedTaskIdSet}
                    onSelectTask={handleTaskCardSelection}
                    onPasteIntoBucket={pasteTasksIntoBucket}
                    canPasteIntoBucket={taskClipboard.length > 0}
                    onDragStart={handleTaskDragStart}
                    onDragEnd={handleTaskDragEnd}
                    onToggleBucketPin={toggleBucketPin}
                    onBucketDragStart={(bucketId) => {
                      setDraggedBucketId(bucketId);
                      setActiveBucketDropIndex(index);
                    }}
                    onBucketDragEnd={() => {
                      setDraggedBucketId(null);
                      setActiveBucketDropIndex(null);
                    }}
                    onMoveBucketByOffset={moveBucketByOffset}
                    canMoveBucketLeft={index > 0}
                    canMoveBucketRight={index < state.buckets.length - 1}
                    onBucketDropSettleEnd={() => {
                      if (bucketDropSettleTimeoutRef.current !== null) {
                        window.clearTimeout(bucketDropSettleTimeoutRef.current);
                        bucketDropSettleTimeoutRef.current = null;
                      }
                      setSettledBucketDropIndex(null);
                      setSettledBucketId(null);
                      setSettledBucketFrom(null);
                    }}
                    onRenameBucket={renameBucket}
                    onDeleteBucket={deleteBucket}
                  />
                </Fragment>
              ))}

              {state.buckets.length > 0 && (
                <div
                  className={`bucket-drop-slot interaction-drop-slot interaction-bucket-drop-slot bucket-accent-${accentIndexFromBucket(state.buckets[state.buckets.length - 1]?.id ?? null)}${draggedBucketId ? ' visible' : ''}${activeBucketDropIndex === state.buckets.length ? ' active' : ''}${settledBucketDropIndex === state.buckets.length ? ' settled' : ''}`}
                  onDragOver={(event) => {
                    if (!draggedBucketId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setActiveBucketDropIndex(state.buckets.length);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropBucketAt(state.buckets.length);
                  }}
                  aria-hidden="true"
                />
              )}

              <section className="bucket-column board-add-bucket-column" aria-label="Board add bucket">
                {boardBucketAddOpen ? (
                  <input
                    ref={boardBucketInputRef}
                    className="add-bucket-inline-input"
                    value={boardBucketNameDraft}
                    onChange={(event) => setBoardBucketNameDraft(event.target.value)}
                    onKeyDown={handleBoardBucketKeyDown}
                    placeholder="Add bucket"
                    maxLength={80}
                    aria-label="Add bucket in board"
                  />
                ) : (
                  <button type="button" className="add-bucket-inline-button" onClick={openBoardBucketAdd}>
                    + Add bucket
                  </button>
                )}
              </section>
            </section>
          </div>
        </section>
      </div>

      {editor && (
        <TaskEditor
          buckets={state.buckets}
          task={editor.task}
          defaultBucketId={editor.defaultBucketId}
          onSave={saveTask}
          onClose={() => setEditor(null)}
        />
      )}

      {confirmDialog && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal modal-compact confirm-modal" role="dialog" aria-modal="true" aria-label={confirmDialog.title}>
            <div className="modal-header">
              <h2>{confirmDialog.title}</h2>
              <button type="button" className="icon-button" onClick={() => setConfirmDialog(null)} aria-label="Close confirmation">×</button>
            </div>
            <p className="confirm-message">
              <span className="confirm-action">Delete</span>{' '}
              <span className="confirm-target">{confirmDialog.targetLabel}</span>
              <span className="confirm-question" aria-hidden="true">?</span>
            </p>
            {confirmDialog.detail && <p className="confirm-detail">{confirmDialog.detail}</p>}
            <div className="modal-actions confirm-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={confirmDialogAction}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameDialog && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal modal-compact" role="dialog" aria-modal="true" aria-label="Rename bucket">
            <div className="modal-header">
              <h2>Rename bucket</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setRenameDialog(null);
                  setRenameDialogError(null);
                }}
                aria-label="Close rename bucket"
              >
                ×
              </button>
            </div>
            <label>
              Bucket name
              <input
                value={renameDialog.value}
                onChange={(event) => {
                  setRenameDialog((current) => current ? { ...current, value: event.target.value } : current);
                  if (renameDialogError) setRenameDialogError(null);
                }}
                maxLength={80}
                autoFocus
              />
            </label>
            {renameDialogError && <p className="data-message">{renameDialogError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setRenameDialog(null);
                  setRenameDialogError(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={submitRenameDialog}>
                Save name
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
