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

const renderBucket = (bucket: BucketV2, isWarpHighlight = false, isBucketDragSource = false) => {
    const onBucketDragStart = vi.fn();
    const onBucketDragEnd = vi.fn();
    const result = render(
        <BucketColumn
            columnIndex={11}
            bucket={bucket}
            tasks={[]}
            draggedTaskId={null}
            draggedAccentIndex={null}
            highlightedTaskId={null}
            isWarpHighlight={isWarpHighlight}
            isBucketDragSource={isBucketDragSource}
            onQuickAddTask={vi.fn()}
            onEditTask={vi.fn()}
            onDeleteTask={vi.fn()}
            onToggleTask={vi.fn()}
            onMoveTask={vi.fn()}
            onToggleTaskPin={vi.fn()}
            onDragStart={vi.fn()}
            onDragEnd={vi.fn()}
            onBucketDragStart={onBucketDragStart}
            onBucketDragEnd={onBucketDragEnd}
        />
    );
    return { ...result, onBucketDragStart, onBucketDragEnd };
};

const createDataTransfer = () => ({
    setData: vi.fn(),
    setDragImage: vi.fn(),
    effectAllowed: 'none',
});

describe('BucketColumn drag handle', () => {
    it.each([false, true])('renders an enabled draggable handle when pinned is %s', (pinned) => {
        renderBucket(makeBucket(pinned));
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });
        expect(handle).toHaveAttribute('draggable', 'true');
        expect(handle.tagName).toBe('SPAN');
    });

    it('keeps a newly highlighted bucket draggable at a high stagger index', () => {
        const { onBucketDragStart } = renderBucket(makeBucket(), true);
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });
        const dataTransfer = createDataTransfer();

        expect(handle.closest('.bucket-column')).toHaveClass('warp-highlight', 'column-stagger-11');
        fireEvent.dragStart(handle, { dataTransfer });
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'bucket-new');
        expect(dataTransfer.effectAllowed).toBe('move');
        expect(dataTransfer.setDragImage).toHaveBeenCalledWith(expect.any(HTMLElement), 28, 22);
        expect(onBucketDragStart).toHaveBeenCalledWith('bucket-new');
    });

    it('creates a named translucent preview and removes it on drag end', () => {
        const { onBucketDragEnd } = renderBucket(makeBucket());
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });

        fireEvent.dragStart(handle, { dataTransfer: createDataTransfer() });
        expect(document.querySelector('.bucket-drag-preview')).toHaveTextContent('New bucket');

        fireEvent.dragEnd(handle);
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
        expect(onBucketDragEnd).toHaveBeenCalledOnce();
    });

    it('keeps bucket drag active when only the optional preview setup fails', () => {
        const { unmount, onBucketDragStart } = renderBucket(makeBucket());
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });
        const failedTransfer = createDataTransfer();
        failedTransfer.setDragImage.mockImplementation(() => { throw new Error('drag image failed'); });

        fireEvent.dragStart(handle, { dataTransfer: failedTransfer });
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
        expect(failedTransfer.setData).toHaveBeenCalledWith('text/plain', 'bucket-new');
        expect(failedTransfer.effectAllowed).toBe('move');
        expect(onBucketDragStart).toHaveBeenCalledWith('bucket-new');

        fireEvent.dragStart(handle, { dataTransfer: createDataTransfer() });
        unmount();
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
    });

    it('marks only the active bucket as the drag source', () => {
        renderBucket(makeBucket(), false, true);
        expect(screen.getByRole('img', { name: 'Drag to move bucket' }).closest('.bucket-column')).toHaveClass('bucket-drag-source');
    });

    it('does not remove drag functionality when reduced motion is requested', () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
        const { onBucketDragStart } = renderBucket(makeBucket());
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });

        fireEvent.dragStart(handle, { dataTransfer: createDataTransfer() });
        expect(handle).toHaveAttribute('draggable', 'true');
        expect(onBucketDragStart).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });
});
