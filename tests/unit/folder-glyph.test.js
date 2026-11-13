import test from 'node:test';
import assert from 'node:assert/strict';
import { folderGlyphSvg, iconSize } from '../../folder-glyph.js';

test('a closed folder draws one shape; an open one adds its tipped-forward flap', () => {
    assert.equal((folderGlyphSvg({ open: false }).match(/<path /g) || []).length, 1);
    assert.equal((folderGlyphSvg({ open: true }).match(/<path /g) || []).length, 2);
});

test('the custom icon is fitted inside the folder, smaller on the open flap and slanted there', () => {
    assert.ok(iconSize(true) < iconSize(false));
    const closed = folderGlyphSvg({ open: false, icon: { name: 'zap' } });
    const open = folderGlyphSvg({ open: true, icon: { name: 'zap' } });
    assert.match(closed, /class="folder-inner"/);
    assert.doesNotMatch(closed, /skewX/);
    assert.match(open, /skewX\(-10\)/);
});

test('open tabs in a collapsed folder show dots in place of its icon, but not once it opens', () => {
    const collapsed = folderGlyphSvg({ open: false, hasOpenTabs: true, icon: { name: 'zap' } });
    assert.equal((collapsed.match(/folder-dot/g) || []).length, 3);
    assert.doesNotMatch(collapsed, /folder-inner/);
    assert.doesNotMatch(folderGlyphSvg({ open: true, hasOpenTabs: true }), /folder-dot/);
});

test('emoji are escaped and unknown icon names draw an empty folder', () => {
    assert.match(folderGlyphSvg({ open: false, icon: { emoji: '<b>' } }), /&lt;b&gt;/);
    assert.doesNotMatch(folderGlyphSvg({ open: false, icon: { name: 'no-such-icon' } }), /<g transform/);
});
