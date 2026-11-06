import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateTab } from '../../tab-duplicate.js';
import { isInSplit } from '../../split-view.js';

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
        get: async id => ({ id, splitViewId: -1 }),
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
    const [copy] = await duplicateTab(1, dispatch, tabsApi);
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

// Chrome-like tab strip: a copy lands right after its original and breaks a split it lands inside.
function splitStrip() {
    let nextId = 10;
    let nextSplit = 100;
    const tabs = [
        { id: 1, index: 0, splitViewId: 5, windowId: 1 },
        { id: 2, index: 1, splitViewId: 5, windowId: 1 }
    ];
    const reindex = () => tabs.sort((a, b) => a.index - b.index).forEach((tab, index) => { tab.index = index; });
    const api = {
        get: async id => ({ ...tabs.find(tab => tab.id === id) }),
        query: async () => tabs.map(tab => ({ ...tab })),
        duplicate: async id => {
            const copy = { id: nextId++, index: tabs.find(tab => tab.id === id).index + 0.5, splitViewId: -1, windowId: 1 };
            tabs.push(copy);
            reindex();
            const [before, after] = [tabs[copy.index - 1], tabs[copy.index + 1]];
            if (isInSplit(before) && before.splitViewId === after?.splitViewId) before.splitViewId = after.splitViewId = -1;
            return { ...copy };
        },
        update: async () => {},
        unsplit: async splitViewId => tabs.forEach(tab => { if (tab.splitViewId === splitViewId) tab.splitViewId = -1; }),
        move: async (id, { index }) => {
            const tab = tabs.splice(tabs.findIndex(t => t.id === id), 1)[0];
            tabs.splice(index, 0, tab);
            tabs.forEach((t, i) => { t.index = i; });
        },
        createSplit: async ids => {
            const splitViewId = nextSplit++;
            ids.forEach(id => { tabs.find(tab => tab.id === id).splitViewId = splitViewId; });
        }
    };
    const dispatch = async () => [{ id: 'a', spaceBookmarks: [], temporaryTabs: tabs.map(tab => tab.id) }];
    return { tabs, api, dispatch };
}

test('duplicating either half of a split duplicates the split as a new split', async () => {
    const { tabs, api, dispatch } = splitStrip();
    const copies = await duplicateTab(2, dispatch, api);
    const byId = id => tabs.find(tab => tab.id === id);
    assert.equal(copies.length, 2);
    assert.ok(isInSplit(byId(copies[0].id)));
    assert.equal(byId(copies[0].id).splitViewId, byId(copies[1].id).splitViewId);
    assert.ok(byId(copies[0].id).index < byId(copies[1].id).index);
    assert.notEqual(byId(copies[0].id).splitViewId, byId(1).splitViewId);
});

test('the original split survives a copy landing between its halves', async () => {
    const { tabs, api, dispatch } = splitStrip();
    await duplicateTab(1, dispatch, api);
    const [left, right] = [tabs.find(tab => tab.id === 1), tabs.find(tab => tab.id === 2)];
    assert.ok(isInSplit(left));
    assert.equal(left.splitViewId, right.splitViewId);
    assert.equal(right.index, left.index + 1);
});

test('the original split is re-paired even when copying the second half fails', async () => {
    const { tabs, api, dispatch } = splitStrip();
    const duplicate = api.duplicate;
    api.duplicate = async id => {
        if (id === 2) throw new Error('tab closed');
        return duplicate(id);
    };
    await assert.rejects(duplicateTab(1, dispatch, api), /tab closed/);
    const [left, right] = [tabs.find(tab => tab.id === 1), tabs.find(tab => tab.id === 2)];
    assert.ok(isInSplit(left));
    assert.equal(left.splitViewId, right.splitViewId);
});
