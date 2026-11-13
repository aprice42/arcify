import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CUSTOM_ICONS_KEY, tabIconKey, folderIconKey, getCustomIcons, setCustomIcon, moveCustomIcon, firstEmoji
} from '../../custom-icon.js';
import { ICON_SET } from '../../icon-set.js';

const fakeStorage = () => {
    const data = {};
    return { data, get: async key => ({ [key]: data[key] }), set: async values => Object.assign(data, values) };
};

test('custom icons are saved, replaced and cleared per favorite URL and folder id', async () => {
    const storage = fakeStorage();
    await setCustomIcon(tabIconKey('https://mail.test/'), { emoji: '📬' }, storage);
    await setCustomIcon(folderIconKey('42'), { name: 'rocket' }, storage);
    await setCustomIcon(tabIconKey('https://mail.test/'), null, storage);
    assert.deepEqual(await getCustomIcons(storage), { 'folder:42': { name: 'rocket' } });
    assert.deepEqual(Object.keys(storage.data), [CUSTOM_ICONS_KEY]);
});

test('a favorite whose URL is replaced keeps its icon', async () => {
    const storage = fakeStorage();
    await setCustomIcon(tabIconKey('https://old.test/'), { name: 'star' }, storage);
    await moveCustomIcon(tabIconKey('https://old.test/'), tabIconKey('https://new.test/'), storage);
    assert.deepEqual(await getCustomIcons(storage), { 'url:https://new.test/': { name: 'star' } });
    await moveCustomIcon(tabIconKey('https://none.test/'), tabIconKey('https://other.test/'), storage);
    assert.deepEqual(Object.keys(await getCustomIcons(storage)), ['url:https://new.test/']);
});

test('only an emoji counts, including flags and joined sequences', () => {
    assert.equal(firstEmoji(' 🚀 launch'), '🚀');
    assert.equal(firstEmoji('🇨🇦'), '🇨🇦');
    assert.equal(firstEmoji('👩‍💻'), '👩‍💻');
    assert.equal(firstEmoji('A'), '');
    assert.equal(firstEmoji(''), '');
});

test('the icon set holds only plain drawing elements', () => {
    assert.ok(Object.keys(ICON_SET).length > 100);
    for (const markup of Object.values(ICON_SET)) {
        assert.doesNotMatch(markup, /<(?!\/?(path|circle|rect|line|polyline|polygon|ellipse)\b)/);
        assert.doesNotMatch(markup, /\son\w+=|href/i);
    }
});
