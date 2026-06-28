import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Bucket, PlannerTask } from '../types';
import { TaskCard } from './TaskCard';

interface BucketColumnProps {
    columnIndex: number;
    bucket: Bucket | null;
    tasks: PlannerTask[];
    draggedTaskId: string | null;
    isBucketDragActive?: boolean;
    nudgeFromLeftGap?: boolean;
    nudgeFromRightGap?: boolean;
    isBucketDropSettled?: boolean;
    bucketDropSettleFrom?: 'left' | 'right' | null;
    draggedAccentIndex: number | null;
    highlightedTaskId: string | null;
    uploadedTaskIdSet?: Set<string>;
    registerColumnRef?: (bucketId: string, element: HTMLElement | null) => void;
    isWarpHighlight?: boolean;
    onAddTask: (bucketId: string | null) => void;
    onCopyBucketTasks?: (bucketId: string | null) => void;
    onCopyTask?: (task: PlannerTask, bucketName: string) => void;
    onEditTask: (task: PlannerTask) => void;
    onDeleteTask: (task: PlannerTask) => void;
    onToggleTask: (taskId: string) => void;
    onMoveTask: (taskId: string, bucketId: string | null, targetIndex?: number) => void;
    onToggleTaskPin: (taskId: string) => void;
    onDragStart: (taskId: string) => void;
    onDragEnd: () => void;
    onBucketDragStart?: (bucketId: string) => void;
    onBucketDragEnd?: () => void;
    onBucketDropSettleEnd?: () => void;
    copyTaskCount?: number;
    onToggleBucketPin?: (bucket: Bucket) => void;
    onRenameBucket?: (bucket: Bucket) => void;
    onDeleteBucket?: (bucket: Bucket) => void;
}

const accentIndexFromBucket = (bucketId: string | null) => {
    if (!bucketId) return 0;
    const hash = bucketId
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return (hash % 8) + 1;
};

export function BucketColumn({
    columnIndex,
    bucket,
    tasks,
    draggedTaskId,
    isBucketDragActive = false,
    nudgeFromLeftGap = false,
    nudgeFromRightGap = false,
    isBucketDropSettled = false,
    bucketDropSettleFrom = null,
    draggedAccentIndex,
    highlightedTaskId,
    uploadedTaskIdSet,
    registerColumnRef,
    isWarpHighlight = false,
    onAddTask,
    onCopyBucketTasks,
    onCopyTask,
    onEditTask,
    onDeleteTask,
    onToggleTask,
    onMoveTask,
    onToggleTaskPin,
    onDragStart,
    onDragEnd,
    onBucketDragStart,
    onBucketDragEnd,
    onBucketDropSettleEnd,
    copyTaskCount = tasks.length,
    onToggleBucketPin,
    onRenameBucket,
    onDeleteBucket,
}: BucketColumnProps) {
    const [isOver, setIsOver] = useState(false);
    const [activeDropIndex, setActiveDropIndex] = useState<number | null>(null);
    const [settledDropIndex, setSettledDropIndex] = useState<number | null>(null);
    const [settledTaskId, setSettledTaskId] = useState<string | null>(null);
    const settleTimeoutRef = useRef<number | null>(null);
    const bucketId = bucket?.id ?? null;
    const bucketLabel = bucket?.name ?? 'Unassigned';
    const accentIndex = accentIndexFromBucket(bucketId);
    const dragSourceAccentIndex = draggedAccentIndex ?? 0;
    const staggerIndex = columnIndex % 12;

    useEffect(() => {
        if (!draggedTaskId) {
            setIsOver(false);
            setActiveDropIndex(null);
        }
    }, [draggedTaskId]);

    useEffect(() => {
        if (!isBucketDragActive) return;
        setIsOver(false);
        setActiveDropIndex(null);
    }, [isBucketDragActive]);

    useEffect(() => () => {
        if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current);
        }
    }, []);

    const drop = (event: DragEvent<HTMLElement>, targetIndex?: number) => {
        if (isBucketDragActive) return;
        event.preventDefault();
        event.stopPropagation();
        const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId;
        if (taskId) {
            onMoveTask(taskId, bucketId, targetIndex);
            setSettledTaskId(taskId);
            setSettledDropIndex(targetIndex ?? tasks.length);
            if (settleTimeoutRef.current !== null) {
                window.clearTimeout(settleTimeoutRef.current);
            }
            settleTimeoutRef.current = window.setTimeout(() => {
                setSettledTaskId(null);
                setSettledDropIndex(null);
                settleTimeoutRef.current = null;
            }, 820);
        }
        setIsOver(false);
        setActiveDropIndex(null);
        onDragEnd();
    };

    return (
        <section
            ref={(element) => {
                if (bucket) registerColumnRef?.(bucket.id, element);
            }}
            className={`bucket-column bucket-accent-${accentIndex} drag-source-${dragSourceAccentIndex} column-stagger-${staggerIndex}${isOver ? ' drag-over' : ''}${isWarpHighlight ? ' warp-highlight' : ''}${nudgeFromLeftGap ? ' bucket-drop-nudge-left' : ''}${nudgeFromRightGap ? ' bucket-drop-nudge-right' : ''}${isBucketDropSettled ? ' bucket-drop-settled' : ''}${bucketDropSettleFrom === 'left' ? ' bucket-drop-settled-from-left' : ''}${bucketDropSettleFrom === 'right' ? ' bucket-drop-settled-from-right' : ''}`}
            onDragOver={(event) => {
                if (isBucketDragActive) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setIsOver(true);
            }}
            onDragLeave={(event) => {
                if (isBucketDragActive) return;
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsOver(false);
                }
            }}
            onDrop={(event) => drop(event, tasks.length)}
            onAnimationEnd={(event) => {
                if (!isBucketDropSettled) return;
                if (event.animationName !== 'bucket-relocate-settle') return;
                onBucketDropSettleEnd?.();
            }}
        >
            <header className="bucket-header">
                <div>
                    <h2>{bucketLabel}</h2>
                    <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
                </div>
                {(onCopyBucketTasks || bucket) && (
                    <div className="bucket-actions">
                        {onCopyBucketTasks && (
                            <button
                                type="button"
                                className="icon-button copy-button"
                                onClick={() => onCopyBucketTasks(bucketId)}
                                disabled={copyTaskCount === 0}
                                title={copyTaskCount === 0 ? `No tasks to copy from ${bucketLabel}` : `Copy all tasks in ${bucketLabel}`}
                                aria-label={copyTaskCount === 0 ? `No tasks to copy from ${bucketLabel}` : `Copy all tasks in ${bucketLabel}`}
                            >
                                ⧉
                            </button>
                        )}
                        {bucket && (
                            <>
                                <button
                                    type="button"
                                    className="icon-button interaction-drag-handle drag-handle bucket-drag-handle"
                                    draggable
                                    onDragStart={(event) => {
                                        if (!bucket) return;
                                        event.dataTransfer.setData('text/plain', bucket.id);
                                        event.dataTransfer.effectAllowed = 'move';
                                        onBucketDragStart?.(bucket.id);
                                    }}
                                    onDragEnd={() => onBucketDragEnd?.()}
                                    title="Drag to move bucket"
                                    aria-label="Drag to move bucket"
                                >
                                    ⠿
                                </button>
                                <button
                                    type="button"
                                    className={`icon-button${bucket.pinned ? ' is-pinned' : ''}`}
                                    onClick={() => onToggleBucketPin?.(bucket)}
                                    title={bucket.pinned ? 'Unpin bucket' : 'Pin bucket to left group'}
                                    aria-label={bucket.pinned ? 'Unpin bucket' : 'Pin bucket to left group'}
                                >
                                    {bucket.pinned ? '📌' : '◯'}
                                </button>
                                <button type="button" className="icon-button" onClick={() => onRenameBucket?.(bucket)} title="Rename bucket">
                                    ✎
                                </button>
                                <button type="button" className="icon-button danger" onClick={() => onDeleteBucket?.(bucket)} title="Delete bucket">
                                    ×
                                </button>
                            </>
                        )}
                    </div>
                )}
            </header>

            <div className="task-list">
                {tasks.map((task, index) => (
                    <div
                        key={task.id}
                        className={`task-row${activeDropIndex === index ? ' active-drop' : ''}${draggedTaskId && activeDropIndex === index ? ' active-drop-preview' : ''}`}
                        onDragOver={(event) => {
                            if (isBucketDragActive) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setActiveDropIndex(index);
                        }}
                    >
                        <div
                            className={`drop-slot interaction-drop-slot interaction-task-drop-slot${draggedTaskId ? ' visible' : ''}${activeDropIndex === index ? ' active' : ''}${settledDropIndex === index ? ' settled' : ''}`}
                            onDragOver={(event) => {
                                if (isBucketDragActive) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setActiveDropIndex(index);
                            }}
                            onDrop={(event) => drop(event, index)}
                            aria-hidden="true"
                        />
                        <TaskCard
                            task={task}
                            onEdit={() => onEditTask(task)}
                            onDelete={() => onDeleteTask(task)}
                            onToggle={() => onToggleTask(task.id)}
                            onTogglePin={() => onToggleTaskPin(task.id)}
                            onCopy={onCopyTask ? () => onCopyTask(task, bucketLabel) : undefined}
                            onCardDragOver={(event) => {
                                if (isBucketDragActive) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setActiveDropIndex(index);
                            }}
                            onDragStart={(event) => {
                                event.dataTransfer.setData('text/plain', task.id);
                                event.dataTransfer.effectAllowed = 'move';
                                onDragStart(task.id);
                            }}
                            onDragEnd={onDragEnd}
                            isDragging={draggedTaskId === task.id}
                            isFreshHighlight={highlightedTaskId === task.id}
                            isUploadedHighlight={uploadedTaskIdSet?.has(task.id) ?? false}
                            isDropSettled={settledTaskId === task.id}
                        />
                    </div>
                ))}

                {tasks.length > 0 && (
                    <div
                        className={`drop-slot interaction-drop-slot interaction-task-drop-slot${draggedTaskId ? ' visible' : ''}${activeDropIndex === tasks.length ? ' active' : ''}${settledDropIndex === tasks.length ? ' settled' : ''}`}
                        onDragOver={(event) => {
                            if (isBucketDragActive) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setActiveDropIndex(tasks.length);
                        }}
                        onDrop={(event) => drop(event, tasks.length)}
                        aria-hidden="true"
                    />
                )}

                {tasks.length === 0 && (
                    <div className="empty-bucket">
                        {draggedTaskId ? 'Drop task here' : 'No tasks'}
                    </div>
                )}
            </div>

            <button type="button" className="add-task-button" onClick={() => onAddTask(bucketId)}>
                + Add task
            </button>
        </section>
    );
}
