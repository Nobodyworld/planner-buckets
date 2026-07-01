import type { PlannerData } from '../types';
import { loadPlannerData, savePlannerData } from '../storage/plannerStorage';
import type { PlannerDataV2 } from '../types/v2';
import { createInitialPlannerDataV2 } from '../types/v2';
import { migrateV1toV2 } from '../types/migration';
import { isValidPlannerDataV1, isValidPlannerDataV2, validatePlannerDataV2Integrity } from '../types/validators';

export const PLANNER_STORAGE_KEY_V1 = 'planner-buckets:data:v1';
export const PLANNER_STORAGE_KEY_V2 = 'planner-buckets:data:v2';

export type PlannerDataV2LoadSource = 'v2' | 'migrated-v1' | 'new';

export interface PlannerDataV2LoadResult {
    data: PlannerDataV2;
    source: PlannerDataV2LoadSource;
    warning: string | null;
}

const parseStoredJson = (raw: string): unknown => JSON.parse(raw);

const createInvalidStorageWarning = (versionLabel: string): string => (
    `Stored ${versionLabel} planner data could not be loaded. The original stored value was left untouched and recovery used the next available fallback.`
);

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

/**
 * Browser adapter: Load v2 planner data from localStorage.
 *
 * Loading order:
 * 1. Valid v2 data from the v2 key
 * 2. Valid v1 data from the v1 key, migrated deterministically and saved to v2
 * 3. New v2 data using a runtime timestamp
 *
 * The v1 key is never deleted or overwritten here.
 */
export const loadPlannerDataV2FromLocalStorage = (
    createTimestamp: () => string = () => new Date().toISOString(),
): PlannerDataV2LoadResult => {
    let warning: string | null = null;
    const rawV2 = localStorage.getItem(PLANNER_STORAGE_KEY_V2);

    if (rawV2) {
        try {
            const parsedV2 = parseStoredJson(rawV2);
            if (isValidPlannerDataV2(parsedV2)) {
                return { data: parsedV2 as PlannerDataV2, source: 'v2', warning: null };
            }
            warning = createInvalidStorageWarning('v2');
        } catch {
            warning = createInvalidStorageWarning('v2');
        }
    }

    const rawV1 = localStorage.getItem(PLANNER_STORAGE_KEY_V1);
    if (rawV1) {
        try {
            const parsedV1 = parseStoredJson(rawV1);
            if (isValidPlannerDataV1(parsedV1)) {
                const migrated = migrateV1toV2(parsedV1);
                validatePlannerDataV2Integrity(migrated);
                savePlannerDataV2ToLocalStorage(migrated);
                return { data: migrated, source: 'migrated-v1', warning };
            }
            warning = warning ?? createInvalidStorageWarning('v1');
        } catch {
            warning = warning ?? createInvalidStorageWarning('v1');
        }
    }

    const createdAt = createTimestamp();
    const data = createInitialPlannerDataV2(createdAt);
    validatePlannerDataV2Integrity(data);
    return { data, source: 'new', warning };
};

/**
 * Browser adapter: Save validated v2 planner data to localStorage.
 * Does not touch the v1 key, which remains a fallback backup.
 */
export const savePlannerDataV2ToLocalStorage = (data: PlannerDataV2): void => {
    if (!isValidPlannerDataV2(data)) {
        throw new Error('Cannot save invalid v2 planner data');
    }
    localStorage.setItem(PLANNER_STORAGE_KEY_V2, JSON.stringify(data));
};
