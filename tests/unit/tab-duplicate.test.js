import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateTab } from '../../tab-duplicate.js';

function setup({ copyOwner = 'a', copyPinned = false } = {}) {
    const spaces = [
        { id: 'a', spaceBookmarks: [1], temporaryTabs: [] },
        { id: 'b', spaceBookmarks: [], temporaryTabs: [] }
    ];
    const calls = [];
    const dispatch = async message => {
        calls.push(message.action);
        if (message.action === 'assign') {
            for (const space of spaces) space.temporaryTabs = space.temporaryTabs.filter(id => id !== message.tabId);
            spaces.find(s => s.id === message.spaceId).temporaryTabs.push(message.tabId);
        }
        return structuredClone(spaces);
    };
    const tabsApi = {
        updates: [],
        duplicate: async () => {
            if (copyOwner) spaces.find(s => s.id === copyOwner).temporaryTabs.push(2);
            return { id: 2, pinned: copyPinned };
        },
        update: async (id, props) => { tabsApi.updates.push([id, props]); }
    };
    return { spaces, calls, dispatch, tabsApi };
}

test('a copy filed beside its original is left as an unpinned tab in that space', async () => {
    const { spaces, calls, dispatch, tabsApi } = setup();
    const copy = await duplicateTab(1, dispatch, tabsApi);
    assert.equal(copy.id, 2);
    assert.deepEqual(spaces[0].temporaryTabs, [2]);
    assert.ok(!calls.includes('assign'));
});

test('a copy filed in another space is moved to the original space', async () => {
    const { spaces, dispatch, tabsApi } = setup({ copyOwner: 'b' });
    await duplicateTab(1, dispatch, tabsApi);
    assert.deepEqual(spaces[0].temporaryTabs, [2]);
    assert.deepEqual(spaces[1].temporaryTabs, []);
});

test('a copy of a Chrome-pinned tab is unpinned', async () => {
    const { dispatch, tabsApi } = setup({ copyPinned: true });
    await duplicateTab(1, dispatch, tabsApi);
    assert.deepEqual(tabsApi.updates, [[2, { pinned: false }]]);
});
