import type { PlannerData } from '../types';
import { loadPlannerData, savePlannerData } from '../storage/plannerStorage';

/**
 * Browser adapter: Load planner data from localStorage.
 * Intentional side effect: reads from browser storage.
 * Returns data from storage, or creates initial data if not found.
 * @throws if storage access fails
 */
export const loadFromLocalStorage = (): PlannerData => {
    return loadPlannerData();
};

/**
 * Browser adapter: Save planner data to localStorage.
 * Intentional side effect: writes to browser storage.
 * @throws if write fails
 */
export const saveToLocalStorage = (data: PlannerData): void => {
    savePlannerData(data);
};
