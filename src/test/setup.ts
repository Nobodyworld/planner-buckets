import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Enable React act() support in Vitest's DOM-like test runtime.
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    writable: true,
    configurable: true,
});

const createMemoryStorage = (): Storage => {
    const map = new Map<string, string>();

    return {
        get length() {
            return map.size;
        },
        clear: () => {
            map.clear();
        },
        getItem: (key: string) => map.get(key) ?? null,
        key: (index: number) => Array.from(map.keys())[index] ?? null,
        removeItem: (key: string) => {
            map.delete(key);
        },
        setItem: (key: string, value: string) => {
            map.set(key, String(value));
        },
    };
};

const memoryLocalStorage = createMemoryStorage();
const memorySessionStorage = createMemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
    value: memoryLocalStorage,
    configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
    value: memorySessionStorage,
    configurable: true,
});

Object.defineProperty(window, 'localStorage', {
    value: memoryLocalStorage,
    configurable: true,
});

Object.defineProperty(window, 'sessionStorage', {
    value: memorySessionStorage,
    configurable: true,
});

afterEach(() => {
    cleanup();
});
