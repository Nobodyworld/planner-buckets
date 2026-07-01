import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlannerKeyboardShortcuts } from '../hooks/usePlannerKeyboardShortcuts';

describe('usePlannerKeyboardShortcuts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const simulateKeyDown = (key: string, options: { ctrlKey?: boolean; shiftKey?: boolean; target?: HTMLElement } = {}) => {
        const event = new KeyboardEvent('keydown', {
            key,
            ctrlKey: options.ctrlKey ?? false,
            shiftKey: options.shiftKey ?? false,
            metaKey: false,
            bubbles: true,
        });

        // Simulate target if provided
        if (options.target) {
            Object.defineProperty(event, 'target', { value: options.target, enumerable: true });
        }

        window.dispatchEvent(event);
    };

    it('calls onCopy when Ctrl+C is pressed', () => {
        const onCopy = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onCopy }));

        simulateKeyDown('c', { ctrlKey: true });

        expect(onCopy).toHaveBeenCalled();
    });

    it('calls onPaste when Ctrl+V is pressed', () => {
        const onPaste = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onPaste }));

        simulateKeyDown('v', { ctrlKey: true });

        expect(onPaste).toHaveBeenCalled();
    });

    it('calls onUndo when Ctrl+Z is pressed', () => {
        const onUndo = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onUndo }));

        simulateKeyDown('z', { ctrlKey: true });

        expect(onUndo).toHaveBeenCalled();
    });

    it('calls onRedo when Ctrl+Shift+Z is pressed', () => {
        const onRedo = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onRedo }));

        simulateKeyDown('z', { ctrlKey: true, shiftKey: true });

        expect(onRedo).toHaveBeenCalled();
    });

    it('calls onRedo when Ctrl+Y is pressed', () => {
        const onRedo = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onRedo }));

        simulateKeyDown('y', { ctrlKey: true });

        expect(onRedo).toHaveBeenCalled();
    });

    it('works with Cmd (metaKey) on Mac', () => {
        const onCopy = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onCopy }));

        const event = new KeyboardEvent('keydown', {
            key: 'c',
            ctrlKey: false,
            metaKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(onCopy).toHaveBeenCalled();
    });

    it('ignores shortcuts when no Meta/Ctrl is pressed', () => {
        const onCopy = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onCopy }));

        simulateKeyDown('c');

        expect(onCopy).not.toHaveBeenCalled();
    });

    it('ignores shortcuts when focused on input element', () => {
        const onCopy = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onCopy }));

        const input = document.createElement('input');
        simulateKeyDown('c', { ctrlKey: true, target: input });

        expect(onCopy).not.toHaveBeenCalled();
    });

    it('ignores shortcuts when focused on textarea element', () => {
        const onPaste = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onPaste }));

        const textarea = document.createElement('textarea');
        simulateKeyDown('v', { ctrlKey: true, target: textarea });

        expect(onPaste).not.toHaveBeenCalled();
    });

    it('ignores shortcuts when focused on select element', () => {
        const onUndo = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onUndo }));

        const select = document.createElement('select');
        simulateKeyDown('z', { ctrlKey: true, target: select });

        expect(onUndo).not.toHaveBeenCalled();
    });

    it('ignores shortcuts when focused on contenteditable element', () => {
        const onRedo = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onRedo }));

        const editable = document.createElement('div');
        editable.setAttribute('contenteditable', 'true');
        simulateKeyDown('y', { ctrlKey: true, target: editable });

        expect(onRedo).not.toHaveBeenCalled();
    });

    it('case-insensitive key handling', () => {
        const onUndo = vi.fn();
        renderHook(() => usePlannerKeyboardShortcuts({ onUndo }));

        // Capital 'Z' should still trigger onUndo
        const event = new KeyboardEvent('keydown', {
            key: 'Z',
            ctrlKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(onUndo).toHaveBeenCalled();
    });

    it('cleanup removes event listener on unmount', () => {
        const onCopy = vi.fn();
        const spy = vi.spyOn(window, 'removeEventListener');

        const { unmount } = renderHook(() => usePlannerKeyboardShortcuts({ onCopy }));

        unmount();

        expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('calls correct handlers for each shortcut type', () => {
        const onCopy = vi.fn();
        const onPaste = vi.fn();
        const onUndo = vi.fn();
        const onRedo = vi.fn();

        renderHook(() =>
            usePlannerKeyboardShortcuts({ onCopy, onPaste, onUndo, onRedo })
        );

        simulateKeyDown('c', { ctrlKey: true });
        expect(onCopy).toHaveBeenCalledTimes(1);
        expect(onPaste).not.toHaveBeenCalled();

        simulateKeyDown('v', { ctrlKey: true });
        expect(onPaste).toHaveBeenCalledTimes(1);
        expect(onUndo).not.toHaveBeenCalled();

        simulateKeyDown('z', { ctrlKey: true });
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(onRedo).not.toHaveBeenCalled();

        simulateKeyDown('y', { ctrlKey: true });
        expect(onRedo).toHaveBeenCalledTimes(1);
    });
});
