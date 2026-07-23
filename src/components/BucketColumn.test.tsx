import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BucketV2, PlannerTaskV2 } from '../types/v2';
import { BucketColumn } from './BucketColumn';

const makeBucket = (pinned = false, name = pinned ? 'Pinned bucket' : 'New bucket'): BucketV2 => ({
    id: pinned ? 'bucket-pinned' : 'bucket-new',
    projectId: 'project-1',
    name,
    description: '',
    templateDefinitionId: null,
    priority: 0,
    pinned,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
});

const makeTask = (): PlannerTaskV2 => ({
    id: 'task-1',
    projectId: 'project-1',
    bucketId: 'bucket-new',
    title: 'Nested task',
    description: '',
    priority: 0,
    resourceTags: [],
    pinned: false,
    completed: false,
    archivedAt: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
});

interface RenderBucketOptions {
    bucketDropIndex?: number;
    isBucketDragActive?: boolean;
    tasks?: PlannerTaskV2[];
}

const renderBucket = (
    bucket: BucketV2,
    isWarpHighlight = false,
    isBucketDragSource = false,
    options: RenderBucketOptions = {},
) => {
    const onBucketDragStart = vi.fn();
    const onBucketDragEnd = vi.fn();
    const onBucketDragHover = vi.fn();
    const onBucketDrop = vi.fn();
    const result = render(
        <BucketColumn
            columnIndex={11}
            bucket={bucket}
            tasks={options.tasks ?? []}
            draggedTaskId={null}
            isBucketDragActive={options.isBucketDragActive}
            draggedAccentIndex={null}
            highlightedTaskId={null}
            isWarpHighlight={isWarpHighlight}
            isBucketDragSource={isBucketDragSource}
            bucketDropIndex={options.bucketDropIndex}
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
            onBucketDragHover={onBucketDragHover}
            onBucketDrop={onBucketDrop}
        />
    );
    return {
        ...result,
        onBucketDragStart,
        onBucketDragEnd,
        onBucketDragHover,
        onBucketDrop,
    };
};

const createDataTransfer = () => ({
    dropEffect: 'none',
    setData: vi.fn(),
    setDragImage: vi.fn(),
    effectAllowed: 'none',
});

const fireBucketDragEvent = (
    type: 'dragover' | 'drop',
    target: HTMLElement,
    clientX: number,
    dataTransfer: ReturnType<typeof createDataTransfer>,
) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    fireEvent(target, event);
    return event;
};

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

describe('BucketColumn midpoint bucket targets', () => {
    it('chooses the boundary before or after the hovered bucket and updates when crossing its midpoint', () => {
        const {
            container,
            onBucketDragHover,
        } = renderBucket(makeBucket(), false, false, {
            bucketDropIndex: 8,
            isBucketDragActive: true,
        });
        const column = container.querySelector('.bucket-column') as HTMLElement;
        vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
            x: 100,
            y: 40,
            left: 100,
            top: 40,
            right: 300,
            bottom: 440,
            width: 200,
            height: 400,
            toJSON: () => ({}),
        });
        const dataTransfer = createDataTransfer();

        const leftHalfEvent = fireBucketDragEvent('dragover', column, 199, dataTransfer);
        expect(leftHalfEvent.defaultPrevented).toBe(true);
        expect(dataTransfer.dropEffect).toBe('move');
        expect(onBucketDragHover).toHaveBeenLastCalledWith(8);

        fireBucketDragEvent('dragover', column, 201, dataTransfer);
        expect(onBucketDragHover).toHaveBeenLastCalledWith(9);
        expect(onBucketDragHover.mock.calls).toEqual([[8], [9]]);
    });

    it('uses the after-bucket boundary at the exact midpoint and on drop', () => {
        const {
            container,
            onBucketDrop,
        } = renderBucket(makeBucket(), false, false, {
            bucketDropIndex: 3,
            isBucketDragActive: true,
        });
        const column = container.querySelector('.bucket-column') as HTMLElement;
        vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
            x: 20,
            y: 40,
            left: 20,
            top: 40,
            right: 220,
            bottom: 440,
            width: 200,
            height: 400,
            toJSON: () => ({}),
        });
        const dataTransfer = createDataTransfer();

        const dropEvent = fireBucketDragEvent('drop', column, 120, dataTransfer);

        expect(dropEvent.defaultPrevented).toBe(true);
        expect(onBucketDrop).toHaveBeenCalledWith(4);
    });

    it.each(['.task-row', '.interaction-task-drop-slot'])(
        'lets bucket drag events from nested task content bubble to the column target through %s',
        (selector) => {
            const {
                container,
                onBucketDragHover,
                onBucketDrop,
            } = renderBucket(makeBucket(), false, false, {
                bucketDropIndex: 5,
                isBucketDragActive: true,
                tasks: [makeTask()],
            });
            const column = container.querySelector('.bucket-column') as HTMLElement;
            const nestedTarget = container.querySelector(selector) as HTMLElement;
            vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
                x: 400,
                y: 40,
                left: 400,
                top: 40,
                right: 700,
                bottom: 440,
                width: 300,
                height: 400,
                toJSON: () => ({}),
            });
            const dataTransfer = createDataTransfer();

            fireBucketDragEvent('dragover', nestedTarget, 401, dataTransfer);
            expect(onBucketDragHover).toHaveBeenCalledWith(5);

            fireBucketDragEvent('drop', nestedTarget, 699, dataTransfer);
            expect(onBucketDrop).toHaveBeenCalledWith(6);
        },
    );
});
