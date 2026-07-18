import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BucketV2 } from '../types/v2';
import { BucketColumn } from './BucketColumn';

const makeBucket = (pinned = false): BucketV2 => ({
    id: pinned ? 'bucket-pinned' : 'bucket-new',
    projectId: 'project-1',
    name: pinned ? 'Pinned bucket' : 'New bucket',
    description: '',
    templateDefinitionId: null,
    priority: 0,
    pinned,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
});

const renderBucket = (bucket: BucketV2, isWarpHighlight = false) => {
    const onBucketDragStart = vi.fn();
    render(
        <BucketColumn
            columnIndex={11}
            bucket={bucket}
            tasks={[]}
            draggedTaskId={null}
            draggedAccentIndex={null}
            highlightedTaskId={null}
            isWarpHighlight={isWarpHighlight}
            onQuickAddTask={vi.fn()}
            onEditTask={vi.fn()}
            onDeleteTask={vi.fn()}
            onToggleTask={vi.fn()}
            onMoveTask={vi.fn()}
            onToggleTaskPin={vi.fn()}
            onDragStart={vi.fn()}
            onDragEnd={vi.fn()}
            onBucketDragStart={onBucketDragStart}
        />
    );
    return onBucketDragStart;
};

describe('BucketColumn drag handle', () => {
    it.each([false, true])('renders an enabled draggable handle when pinned is %s', (pinned) => {
        renderBucket(makeBucket(pinned));
        expect(screen.getByRole('button', { name: 'Drag to move bucket' })).toHaveAttribute('draggable', 'true');
        expect(screen.getByRole('button', { name: 'Drag to move bucket' })).not.toBeDisabled();
    });

    it('keeps a newly highlighted bucket draggable at a high stagger index', () => {
        const onBucketDragStart = renderBucket(makeBucket(), true);
        const handle = screen.getByRole('button', { name: 'Drag to move bucket' });

        expect(handle.closest('.bucket-column')).toHaveClass('warp-highlight', 'column-stagger-11');
        fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn(), effectAllowed: 'none' } });
        expect(onBucketDragStart).toHaveBeenCalledWith('bucket-new');
    });

    it('does not remove drag functionality when reduced motion is requested', () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
        const onBucketDragStart = renderBucket(makeBucket());
        const handle = screen.getByRole('button', { name: 'Drag to move bucket' });

        fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn(), effectAllowed: 'none' } });
        expect(handle).toHaveAttribute('draggable', 'true');
        expect(onBucketDragStart).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });
});
