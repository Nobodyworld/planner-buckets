import { useEffect } from 'react';

/**
 * Handlers for keyboard shortcuts.
 */
export interface KeyboardShortcutHandlers {
    onCopy?: () => void;
    onPaste?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
}

/**
 * React hook for global keyboard shortcut management.
 *
 * Keyboard shortcuts:
 * - Ctrl+C / Cmd+C: Copy selected tasks
 * - Ctrl+V / Cmd+V: Paste tasks
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z: Redo (Mac style)
 * - Ctrl+Y / Cmd+Y: Redo (Windows style)
 *
 * Shortcuts are ignored when focused on input/textarea/select/contenteditable elements.
 */
export const usePlannerKeyboardShortcuts = (handlers: KeyboardShortcutHandlers): void => {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // Ignore shortcuts when editing text
            const target = event.target as HTMLElement | null;
            if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) {
                return;
            }

            const withMeta = event.ctrlKey || event.metaKey;
            if (!withMeta) {
                return;
            }

            const key = event.key.toLowerCase();

            // Redo: Ctrl+Shift+Z or Ctrl+Y
            if ((key === 'z' && event.shiftKey) || key === 'y') {
                event.preventDefault();
                handlers.onRedo?.();
                return;
            }

            // Undo: Ctrl+Z
            if (key === 'z') {
                event.preventDefault();
                handlers.onUndo?.();
                return;
            }

            // Copy: Ctrl+C
            if (key === 'c') {
                event.preventDefault();
                handlers.onCopy?.();
                return;
            }

            // Paste: Ctrl+V
            if (key === 'v') {
                event.preventDefault();
                handlers.onPaste?.();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [handlers]);
};
