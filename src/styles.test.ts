// @ts-expect-error Vitest executes this source-contract test in Node, while app code omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/styles.css', 'utf8');

const cssRule = (selector: string, occurrence = 0) => {
    const escapedSelector = selector
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*');
    const matches = [...stylesheet.matchAll(new RegExp(`${escapedSelector}\\s*\\{`, 'g'))];
    const selectedStart = matches.at(occurrence)?.index ?? -1;
    expect(selectedStart).toBeGreaterThanOrEqual(0);
    const end = stylesheet.indexOf('}', selectedStart);
    return stylesheet.slice(selectedStart, end + 1);
};

describe('bucket drop slot layout contract', () => {
    it('keeps the wrapper at a zero flex footprint in every visual state', () => {
        const wrapper = cssRule('.bucket-drop-slot-wrapper');

        expect(wrapper).toMatch(/flex:\s*0 0 0;/);
        expect(wrapper).toMatch(/width:\s*0;/);
        expect(wrapper).toMatch(/min-width:\s*0;/);
        expect(wrapper).toMatch(/margin:\s*0;/);
        expect(wrapper).toMatch(/padding:\s*0;/);

        for (const selector of [
            '.bucket-drop-slot.visible',
            '.bucket-drop-slot.active',
            '.bucket-drop-slot.settled',
        ]) {
            expect(cssRule(selector)).not.toMatch(/\b(?:flex|width|min-width|margin|padding)\s*:/);
        }
    });

    it('uses an absolute hitbox and keeps active target effects from translating columns', () => {
        const slot = cssRule('.bucket-drop-slot', -1);

        expect(slot).toMatch(/position:\s*absolute;/);
        expect(slot).toMatch(/left:\s*50%;/);
        expect(slot).toMatch(/width:\s*var\(--bucket-insert-hitbox-width\);/);
        expect(cssRule('.bucket-column.bucket-drop-nudge-left')).not.toMatch(/\btransform\s*:/);
        expect(cssRule('.bucket-column.bucket-drop-nudge-right')).not.toMatch(/\btransform\s*:/);
        expect(cssRule('.interaction-drop-slot,\n.drop-slot,\n.bucket-drop-slot')).not.toMatch(/\bwidth\s+var\(--motion/);
    });
});
