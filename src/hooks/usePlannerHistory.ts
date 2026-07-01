import { useReducer, useCallback, useMemo } from 'react';
import type { PlannerData } from '../types';
import type { PlannerAction } from '../state/plannerReducer';
import { plannerReducer } from '../state/plannerReducer';

const HISTORY_LIMIT = 200;

type Reducer<State, Action> = (state: State, action: Action) => State;

/**
 * Internal history state for undo/redo.
 */
interface PlannerHistoryState<State> {
    past: State[];
    present: State;
    future: State[];
}

/**
 * Actions for the history reducer.
 */
type PlannerHistoryAction<Action> =
    | { type: 'APPLY'; action: Action }
    | { type: 'UNDO' }
    | { type: 'REDO' };

/**
 * Pure reducer for history state management.
 * Maintains a stack of past states and future states for undo/redo.
 */
const createPlannerHistoryReducer = <State, Action>(reducer: Reducer<State, Action>) => (
    state: PlannerHistoryState<State>,
    action: PlannerHistoryAction<Action>,
): PlannerHistoryState<State> => {
    switch (action.type) {
        case 'APPLY': {
            const nextPresent = reducer(state.present, action.action);
            // If no change, return current state
            if (nextPresent === state.present) return state;

            // Add current present to past, cap at HISTORY_LIMIT
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

/**
 * React hook for planner history management with undo/redo.
 *
 * @param initialState - Initial planner data state
 * @returns [currentState, dispatch, { canUndo, canRedo, undo, redo }]
 */
export const usePlannerHistory = <State = PlannerData, Action = PlannerAction>(
    initialState: State,
    reducer: Reducer<State, Action> = plannerReducer as unknown as Reducer<State, Action>,
) => {
    const historyReducer = useMemo(() => createPlannerHistoryReducer(reducer), [reducer]);
    const [historyState, dispatchHistory] = useReducer(historyReducer, {
        past: [],
        present: initialState,
        future: [],
    });

    const dispatch = useCallback((action: Action) => {
        dispatchHistory({ type: 'APPLY', action });
    }, []);

    const undo = useCallback(() => {
        dispatchHistory({ type: 'UNDO' });
    }, []);

    const redo = useCallback(() => {
        dispatchHistory({ type: 'REDO' });
    }, []);

    const canUndo = historyState.past.length > 0;
    const canRedo = historyState.future.length > 0;

    return {
        state: historyState.present,
        dispatch,
        canUndo,
        canRedo,
        undo,
        redo,
    };
};
