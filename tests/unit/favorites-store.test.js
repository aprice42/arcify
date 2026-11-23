import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FavoritesStore, favoriteItems, fillSlots, matchBookmark, FAVORITES_FOLDER_TITLE, BINDINGS_KEY } from '../../favorites-store.js';

let nodes, tabs, local, session, nextId;
const area = data => ({
    async get(key) { return { [key]: structuredClone(data[key]) }; },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; }
});
const children = parentId => nodes.filter(n => n.parentId === parentId).sort((a, b) => a.index - b.index);
const reindex = parentId => children(parentId).forEach((n, i) => { n.index = i; });
const place = (node, parentId, index) => {
    const siblings = children(parentId).filter(n => n !== node);
    siblings.splice(index ?? siblings.length, 0, node);
    node.parentId = parentId;
    siblings.forEach((n, i) => { n.index = i; });
};
const tab = (id, url, extra = {}) => ({ id, url, title: url, windowId: 1, pinned: true, index: 0, ...extra });
const favoriteUrls = () => children(folderId()).map(n => n.url);
const folderId = () => nodes.find(n => n.title === FAVORITES_FOLDER_TITLE && !n.url)?.id;

beforeEach(() => {
    nextId = 100;
    nodes = [{ id: '2', title: 'Other bookmarks' }, { id: 'arcify', title: 'Arcify', parentId: '2', index: 0 }];
    tabs = [];
    local = {};
    session = {};
    globalThis.chrome = {
        storage: { local: area(local), session: area(session) },
        bookmarks: {
            get: async id => { const n = nodes.find(n => n.id === id); if (!n) throw new Error('missing'); return [n]; },
            search: async ({ title }) => nodes.filter(n => n.title === title),
            getChildren: async id => structuredClone(children(id)),
            create: async ({ parentId = '2', title, url, index }) => {
                const node = { id: String(nextId++), title, ...(url && { url }) };
                nodes.push(node);
                place(node, parentId, index);
                return structuredClone(node);
            },
            move: async (id, { parentId, index }) => { place(nodes.find(n => n.id === id), parentId, index); },
            remove: async id => { const n = nodes.find(n => n.id === id); nodes = nodes.filter(x => x !== n); reindex(n.parentId); }
        },
        tabs: {
            query: async ({ pinned, windowId }) => tabs.filter(t => (pinned === undefined || t.pinned === pinned) && (windowId === undefined || t.windowId === windowId)),
            get: async id => { const t = tabs.find(t => t.id === id); if (!t) throw new Error(`No tab with id: ${id}.`); return t; },
            update: async (id, changes) => Object.assign(tabs.find(t => t.id === id), changes),
            move: async (id, { index }) => {
                const t = tabs.find(t => t.id === id);
                const row = tabs.filter(x => x.windowId === t.windowId && x !== t).sort((a, b) => a.index - b.index);
                row.splice(index, 0, t);
                row.forEach((x, i) => { x.index = i; });
            },
            create: async ({ windowId, url, pinned, index }) => {
                const t = tab(nextId++, url, { windowId, pinned });
                tabs.push(t);
                await chrome.tabs.move(t.id, { index });
                return t;
            }
        }
    };
});

test('pinned tabs from before the upgrade become favorites in a folder beside Arcify', async () => {
    tabs = [tab(1, 'https://mail.test/', { index: 0 }), tab(2, 'https://cal.test/', { index: 1 }), tab(3, 'https://docs.test/', { pinned: false, index: 2 })];
    await new FavoritesStore().reconcile();
    assert.equal(nodes.find(n => n.id === folderId()).parentId, '2');
    assert.deepEqual(favoriteUrls(), ['https://mail.test/', 'https://cal.test/']);
    assert.equal(Object.keys(session[BINDINGS_KEY]).length, 2);
});

test('a favorite whose tab was closed stays in the row, not open, and opens pinned in its place', async () => {
    tabs = [tab(1, 'https://mail.test/', { index: 0 }), tab(2, 'https://cal.test/', { index: 1 })];
    const store = new FavoritesStore();
    await store.reconcile();
    tabs = tabs.filter(t => t.id !== 1);
    tabs[0].index = 0;
    await store.tabRemoved(1);

    const { items } = await store.get({ windowId: 1 });
    assert.deepEqual(items.map(i => [i.url, i.tabId]), [['https://mail.test/', null], ['https://cal.test/', 2]]);

    await store.open({ bookmarkId: items[0].bookmarkId, windowId: 1 });
    const reopened = tabs.find(t => t.url === 'https://mail.test/');
    assert.equal(reopened.pinned, true);
    assert.equal(reopened.index, 0);
    assert.equal((await store.get({ windowId: 1 })).items[0].tabId, reopened.id);
});

test('after a restart, a restored pinned tab binds to its favorite instead of adding a duplicate', async () => {
    tabs = [tab(1, 'https://mail.test/')];
    await new FavoritesStore().reconcile();
    // A restart clears session storage and gives restored tabs new IDs.
    delete session[BINDINGS_KEY];
    tabs = [tab(9, 'https://mail.test/#inbox')];
    await new FavoritesStore().reconcile();
    assert.deepEqual(favoriteUrls(), ['https://mail.test/']);
    assert.equal(session[BINDINGS_KEY][9], children(folderId())[0].id);
});

test('a favorite stays bound to its tab after the tab navigates elsewhere', async () => {
    tabs = [tab(1, 'https://mail.test/')];
    const store = new FavoritesStore();
    await store.reconcile();
    tabs[0].url = 'https://elsewhere.test/';
    await store.adopt(tabs[0]);
    assert.deepEqual(favoriteUrls(), ['https://mail.test/']);
});

test('unpinning a favorite removes it, and unpins its tab in other windows', async () => {
    tabs = [tab(1, 'https://mail.test/'), tab(2, 'https://mail.test/', { windowId: 2 })];
    const store = new FavoritesStore();
    await store.reconcile();
    const bookmarkId = children(folderId())[0].id;
    assert.equal(session[BINDINGS_KEY][2], bookmarkId);

    tabs[0].pinned = false;
    await store.unpinned(1);
    await store.bookmarkGone(bookmarkId); // chrome.bookmarks.onRemoved
    assert.deepEqual(favoriteUrls(), []);
    assert.equal(tabs[1].pinned, false);
});

test('closing a favorite\'s tab, which Chrome reports as an unpin first, keeps the favorite', async () => {
    tabs = [tab(1, 'https://mail.test/')];
    const store = new FavoritesStore();
    await store.reconcile();
    tabs = [];
    await store.unpinned(1);
    await store.tabRemoved(1);
    assert.deepEqual(favoriteUrls(), ['https://mail.test/']);
    assert.deepEqual(session[BINDINGS_KEY], {});
});

test('a tab dropped among favorites is saved at that position and pinned in matching order', async () => {
    tabs = [tab(1, 'https://a.test/', { index: 0 }), tab(2, 'https://b.test/', { index: 1 }), tab(3, 'https://c.test/', { pinned: false, index: 2 })];
    const store = new FavoritesStore();
    await store.reconcile();
    await store.add({ tabId: 3, index: 1 });
    assert.deepEqual(favoriteUrls(), ['https://a.test/', 'https://c.test/', 'https://b.test/']);
    assert.deepEqual([...tabs].sort((a, b) => a.index - b.index).map(t => t.id), [1, 3, 2]);
});

test('reordering moves the bookmarks and the pinned tabs, and leaves unknown bookmarks at the end', async () => {
    tabs = [tab(1, 'https://a.test/', { index: 0 }), tab(2, 'https://b.test/', { index: 1 }), tab(3, 'https://c.test/', { index: 2 })];
    const store = new FavoritesStore();
    await store.reconcile();
    const [a, b, c] = children(folderId()).map(n => n.id);
    await store.reorder({ bookmarkIds: [c, a], windowId: 1 });
    assert.deepEqual(children(folderId()).map(n => n.id), [c, a, b]);
    assert.deepEqual([...tabs].sort((x, y) => x.index - y.index).map(t => t.id), [3, 1, 2]);
});

test('dragging favorites in the tab strip reorders their bookmarks around ones that are not open', async () => {
    tabs = [tab(1, 'https://a.test/', { index: 0 }), tab(2, 'https://b.test/', { index: 1 }), tab(3, 'https://c.test/', { index: 2 })];
    const store = new FavoritesStore();
    await store.reconcile();
    tabs = tabs.filter(t => t.id !== 2);
    await store.tabRemoved(2);
    tabs[0].index = 1; tabs[1].index = 0; // c dragged before a
    await store.followTabOrder(1);
    assert.deepEqual(favoriteUrls(), ['https://c.test/', 'https://b.test/', 'https://a.test/']);
});

test('fillSlots and matchBookmark', () => {
    assert.deepEqual(fillSlots(['a', 'b', 'c', 'd'], [3, 0], ['d', 'a']), ['d', 'b', 'c', 'a']);
    const bookmarks = [{ id: '1', url: 'https://x.test/a?q=1' }, { id: '2', url: 'https://x.test/a' }];
    assert.equal(matchBookmark('https://x.test/a', bookmarks).id, '2');
    assert.equal(matchBookmark('https://x.test/a#h', bookmarks).id, '1');
    assert.equal(matchBookmark('https://y.test/', bookmarks), null);
});

test('favoriteItems lists pinned tabs that are not favorites yet after the favorites', () => {
    const items = favoriteItems([{ id: 'b1', title: 'A', url: 'https://a.test/' }], { 5: 'b1' },
        [tab(6, '', { index: 0 }), tab(5, 'https://a.test/', { index: 1 })]);
    assert.deepEqual(items.map(i => [i.bookmarkId, i.tab?.id]), [['b1', 5], [null, 6]]);
});
