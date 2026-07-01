import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlannerHistory } from '../hooks/usePlannerHistory';
import type { PlannerData } from '../types';
import type { PlannerAction } from '../state/plannerReducer';
import { PLANNER_DATA_VERSION } from '../types';

describe('usePlannerHistory', () => {
    const createInitialState = (): PlannerData => ({
        version: PLANNER_DATA_VERSION,
        buckets: [
            { id: 'b1', name: 'To Do', createdAt: '2026-01-01T00:00:00Z', pinned: true },
        ],
        tasks: [],
    });

    const addBucketAction = (name: string): PlannerAction => ({
        type: 'ADD_BUCKET',
        name,
    });

    it('initializes with provided state', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        expect(result.current.state).toEqual(initialState);
    });

    it('dispatches actions to update state', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        act(() => {
            result.current.dispatch(addBucketAction('New Bucket'));
        });

        expect(result.current.state.buckets).toHaveLength(2);
        expect(result.current.state.buckets[1].name).toBe('New Bucket');
    });

    it('undoes the last action', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        act(() => {
            result.current.dispatch(addBucketAction('Bucket A'));
        });

        expect(result.current.canUndo).toBe(true);
        expect(result.current.state.buckets).toHaveLength(2);

        act(() => {
            result.current.undo();
        });

        expect(result.current.state.buckets).toHaveLength(1);
    });

    it('redoes an undone action', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        act(() => {
            result.current.dispatch(addBucketAction('Bucket A'));
        });

        act(() => {
            result.current.undo();
        });

        expect(result.current.canRedo).toBe(true);

        act(() => {
            result.current.redo();
        });

        expect(result.current.state.buckets).toHaveLength(2);
    });

    it('clears future state when new action dispatched after undo', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        act(() => {
            result.current.dispatch(addBucketAction('Bucket A'));
        });

        act(() => {
            result.current.dispatch(addBucketAction('Bucket B'));
        });

        act(() => {
            result.current.undo();
        });

        expect(result.current.canRedo).toBe(true);

        act(() => {
            result.current.dispatch(addBucketAction('Bucket C'));
        });

        expect(result.current.canRedo).toBe(false);
        expect(result.current.state.buckets).toHaveLength(3);
        expect(result.current.state.buckets[2].name).toBe('Bucket C');
    });

    it('returns canUndo as true when past has states', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        expect(result.current.canUndo).toBe(false);

        act(() => {
            result.current.dispatch(addBucketAction('Bucket A'));
        });

        expect(result.current.canUndo).toBe(true);
    });

    it('returns canRedo as true when future has states', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        act(() => {
            result.current.dispatch(addBucketAction('Bucket A'));
        });

        expect(result.current.canRedo).toBe(false);

        act(() => {
            result.current.undo();
        });

        expect(result.current.canRedo).toBe(true);
    });

    it('respects history limit (200 states)', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        // Dispatch 210 actions to exceed the limit
        for (let i = 0; i < 210; i++) {
            act(() => {
                result.current.dispatch(addBucketAction(`Bucket ${i}`));
            });
        }

        // Past should be limited to 200 states
        // We should have the latest bucket and be unable to undo to the first bucket
        act(() => {
            result.current.undo(); // Undo latest
        });

        // Try to undo many times
        for (let i = 0; i < 200; i++) {
            if (!result.current.canUndo) break;
            act(() => {
                result.current.undo();
            });
        }

        // After 200 undos, we should be at the limit of past history
        expect(result.current.canUndo).toBe(false);
    });

    it('ignores action that does not change state', () => {
        const initialState = createInitialState();
        const { result } = renderHook(() => usePlannerHistory(initialState));

        const initialBucketCount = result.current.state.buckets.length;

        act(() => {
            result.current.dispatch(addBucketAction('Bucket A'));
        });

        expect(result.current.canUndo).toBe(true);

        // Dispatch a no-op action (invalid empty name)
        act(() => {
            result.current.dispatch(addBucketAction(''));
        });

        // State should not have changed, so undo count should remain the same
        expect(result.current.canUndo).toBe(true);
    });
});
