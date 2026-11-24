import { isPracticeUrl } from './tour-practice.js';

// Favorites (the sidebar's top row) are pinned tabs bound to bookmarks, which outlive the tabs across a restart.
// The background is the only writer; bindings are in session storage because tab IDs don't survive a restart.

export const FAVORITES_FOLDER_TITLE = 'Arcify Favorites';
const FOLDER_KEY = 'favoritesFolderId';
export const BINDINGS_KEY = 'favoriteBindings';
// Where each favorite's tab last was, so a restored tab that had navigated still finds its favorite.
export const LAST_URLS_KEY = 'favoriteLastUrls';
const UNPIN_SETTLE_MS = 250;

const tabUrl = tab => tab.url || tab.pendingUrl || '';

function urlKey(url) {
    try {
        const { origin, pathname } = new URL(url);
        return origin + pathname;
    } catch {
        return url;
    }
}

// Exact URL first, then origin and path, so a favorite that picked up a query or hash still matches.
export function matchBookmark(url, bookmarks, lastUrls = {}) {
    const urls = b => [b.url, lastUrls[b.id]].filter(Boolean);
    return bookmarks.find(b => urls(b).includes(url))
        || bookmarks.find(b => urls(b).some(u => urlKey(u) === urlKey(url))) || null;
}

// Tour practice tabs show in the row while pinned but aren't kept, and incognito pins never reach synced bookmarks.
const keepsFavorite = tab => !tab.incognito && !isPracticeUrl(tabUrl(tab));

/**
 * The favorites for one window, in bookmark order, with the pinned tab bound to each (or null).
 * Pinned tabs that aren't favorites yet, such as a pinned tab with no URL, follow at the end.
 */
export function favoriteItems(bookmarks, bindings, pinnedTabs) {
    const tabByBookmark = new Map();
    for (const tab of pinnedTabs) {
        const bookmarkId = bindings[tab.id];
        if (bookmarkId && !tabByBookmark.has(bookmarkId)) tabByBookmark.set(bookmarkId, tab);
    }
    const items = bookmarks.map(b => ({ bookmarkId: b.id, title: b.title, url: b.url, tab: tabByBookmark.get(b.id) || null }));
    const shown = new Set(items.map(item => item.tab?.id).filter(Boolean));
    for (const tab of [...pinnedTabs].sort((a, b) => a.index - b.index)) {
        if (!shown.has(tab.id)) items.push({ bookmarkId: null, title: tab.title, url: tabUrl(tab), tab });
    }
    return items;
}

/** `order` with the bookmarks in `slots` (their positions) replaced, in turn, by `ids`. */
export function fillSlots(order, slots, ids) {
    const next = [...order];
    [...slots].sort((a, b) => a - b).forEach((slot, i) => { next[slot] = ids[i]; });
    return next;
}

export class FavoritesStore {
    constructor() { this.chain = Promise.resolve(); }

    run(operation) {
        const result = this.chain.then(operation);
        this.chain = result.catch(error => console.error('[Favorites]', error));
        return result;
    }

    async folder() {
        const { [FOLDER_KEY]: savedId } = await chrome.storage.local.get(FOLDER_KEY);
        if (savedId) {
            const [node] = await chrome.bookmarks.get(savedId).catch(() => []);
            if (node && !node.url) return node;
        }
        // Bookmarks sync, so another device may already have made the folder.
        let folder = (await chrome.bookmarks.search({ title: FAVORITES_FOLDER_TITLE })).find(node => !node.url);
        if (!folder) {
            // Beside the Arcify folder, not in it: every folder in there is read as a space.
            const arcify = (await chrome.bookmarks.search({ title: 'Arcify' })).find(node => !node.url);
            folder = await chrome.bookmarks.create({ title: FAVORITES_FOLDER_TITLE, ...(arcify?.parentId && { parentId: arcify.parentId }) });
        }
        await chrome.storage.local.set({ [FOLDER_KEY]: folder.id });
        return folder;
    }

    async bookmarks() {
        const folder = await this.folder();
        return { folder, bookmarks: (await chrome.bookmarks.getChildren(folder.id)).filter(node => node.url) };
    }

    async bindings() {
        return (await chrome.storage.session.get(BINDINGS_KEY))[BINDINGS_KEY] || {};
    }

    async saveBindings(bindings) {
        await chrome.storage.session.set({ [BINDINGS_KEY]: bindings });
    }

    async lastUrls() {
        return (await chrome.storage.local.get(LAST_URLS_KEY))[LAST_URLS_KEY] || {};
    }

    async setLastUrl(bookmarkId, url) {
        const lastUrls = await this.lastUrls();
        if (url) lastUrls[bookmarkId] = url;
        else delete lastUrls[bookmarkId];
        await chrome.storage.local.set({ [LAST_URLS_KEY]: lastUrls });
    }

    async pinnedTabs(windowId) {
        return chrome.tabs.query({ pinned: true, ...(windowId !== undefined && { windowId }) });
    }

    /** Drops bindings that no longer hold, then makes every pinned tab a favorite. */
    async reconcile() {
        const { bookmarks } = await this.bookmarks();
        const bookmarkIds = new Set(bookmarks.map(b => b.id));
        const pinned = await this.pinnedTabs();
        const pinnedIds = new Set(pinned.map(t => String(t.id)));
        const bindings = Object.fromEntries(Object.entries(await this.bindings())
            .filter(([tabId, bookmarkId]) => pinnedIds.has(tabId) && bookmarkIds.has(bookmarkId)));
        await this.saveBindings(bindings);
        for (const tab of pinned.sort((a, b) => a.index - b.index)) await this.adopt(tab);
    }

    /** Binds a pinned tab to its favorite, matching an unbound one in its window by URL or adding one. */
    async adopt(tab) {
        const url = tabUrl(tab);
        const bindings = await this.bindings();
        if (bindings[tab.id]) {
            if (url) await this.setLastUrl(bindings[tab.id], url);
            return;
        }
        if (!tab.pinned || !url || !keepsFavorite(tab)) return;
        const { folder, bookmarks } = await this.bookmarks();
        const windowTabs = new Set((await this.pinnedTabs(tab.windowId)).map(t => String(t.id)));
        const taken = new Set(Object.entries(bindings).filter(([tabId]) => windowTabs.has(tabId)).map(([, id]) => id));
        const bookmark = matchBookmark(url, bookmarks.filter(b => !taken.has(b.id)), await this.lastUrls())
            || await chrome.bookmarks.create({ parentId: folder.id, title: tab.title || url, url });
        await this.saveBindings({ ...bindings, [tab.id]: bookmark.id });
        await this.setLastUrl(bookmark.id, url);
    }

    /** Unpinning a favorite's tab removes the favorite, in every window; closing the tab doesn't. */
    async unpinned(tabId) {
        const bindings = await this.bindings();
        const bookmarkId = bindings[tabId];
        if (!bookmarkId) return;
        delete bindings[tabId];
        await this.saveBindings(bindings);
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab && !tab.pinned) {
            await chrome.bookmarks.remove(bookmarkId).catch(() => {});
            await this.setLastUrl(bookmarkId, null);
        }
    }

    async tabRemoved(tabId) {
        const bindings = await this.bindings();
        if (!bindings[tabId]) return;
        delete bindings[tabId];
        await this.saveBindings(bindings);
    }

    async tabReplaced(addedId, removedId) {
        const bindings = await this.bindings();
        if (!bindings[removedId]) return;
        bindings[addedId] = bindings[removedId];
        delete bindings[removedId];
        await this.saveBindings(bindings);
    }

    /** A favorite's bookmark was deleted or moved out of the folder, so its tabs stop being pinned. */
    async bookmarkGone(bookmarkId) {
        const bindings = await this.bindings();
        const tabIds = Object.keys(bindings).filter(tabId => bindings[tabId] === bookmarkId);
        if (!tabIds.length) return;
        tabIds.forEach(tabId => delete bindings[tabId]);
        await this.saveBindings(bindings);
        await this.setLastUrl(bookmarkId, null);
        for (const tabId of tabIds) await chrome.tabs.update(Number(tabId), { pinned: false }).catch(() => {});
    }

    /** Chrome reports only the folder as removed, not its bookmarks, so unpin every favorite's tab here. */
    async folderGone() {
        const tabIds = Object.keys(await this.bindings());
        await chrome.storage.local.remove([FOLDER_KEY, LAST_URLS_KEY]);
        await this.saveBindings({});
        for (const tabId of tabIds) await chrome.tabs.update(Number(tabId), { pinned: false }).catch(() => {});
    }

    async applyOrder(folderId, ids) {
        const current = (await chrome.bookmarks.getChildren(folderId)).map(node => node.id);
        for (let index = 0; index < ids.length; index++) {
            if (current[index] === ids[index]) continue;
            const from = current.indexOf(ids[index]);
            if (from < 0) continue;
            // Each ID moves toward the front, which sidesteps Chrome's off-by-one on downward moves.
            await chrome.bookmarks.move(ids[index], { parentId: folderId, index });
            current.splice(from, 1);
            current.splice(index, 0, ids[index]);
        }
    }

    /** Puts a window's favorite tabs in bookmark order at the front of its pinned tabs. */
    async syncTabOrder(windowId) {
        const { bookmarks } = await this.bookmarks();
        const position = new Map(bookmarks.map((b, i) => [b.id, i]));
        const bindings = await this.bindings();
        const tabs = (await this.pinnedTabs(windowId))
            .filter(t => position.has(bindings[t.id]))
            .sort((a, b) => position.get(bindings[a.id]) - position.get(bindings[b.id]));
        for (let index = 0; index < tabs.length; index++) {
            if (tabs[index].index !== index) await chrome.tabs.move(tabs[index].id, { index });
        }
    }

    /** A favorite's tab was dragged in Chrome's tab strip, so the bookmarks follow the tabs. */
    async followTabOrder(windowId) {
        const { folder, bookmarks } = await this.bookmarks();
        const order = bookmarks.map(b => b.id);
        const bindings = await this.bindings();
        const ids = (await this.pinnedTabs(windowId))
            .sort((a, b) => a.index - b.index)
            .map(t => bindings[t.id])
            .filter(id => order.includes(id));
        const unique = [...new Set(ids)];
        const slots = unique.map(id => order.indexOf(id));
        await this.applyOrder(folder.id, fillSlots(order, slots, unique));
    }

    async get({ windowId }) {
        const { bookmarks } = await this.bookmarks();
        const items = favoriteItems(bookmarks, await this.bindings(), await this.pinnedTabs(windowId));
        return { items: items.map(({ tab, ...item }) => ({ ...item, tabId: tab?.id ?? null, favIconUrl: tab?.favIconUrl || null })) };
    }

    async add({ tabId, index }) {
        const tab = await chrome.tabs.get(tabId);
        if (!keepsFavorite(tab)) {
            await chrome.tabs.update(tabId, { pinned: true });
            return;
        }
        const { folder, bookmarks } = await this.bookmarks();
        const bindings = await this.bindings();
        const at = Math.max(0, Math.min(index ?? bookmarks.length, bookmarks.length));
        if (bindings[tabId]) {
            const order = bookmarks.map(b => b.id).filter(id => id !== bindings[tabId]);
            order.splice(at, 0, bindings[tabId]);
            await this.applyOrder(folder.id, order);
        } else {
            const url = tabUrl(tab);
            if (!url) throw new Error('This tab has no address to save as a favorite yet.');
            const bookmark = await chrome.bookmarks.create({ parentId: folder.id, title: tab.title || url, url, index: at });
            await this.saveBindings({ ...bindings, [tabId]: bookmark.id });
            await this.setLastUrl(bookmark.id, url);
        }
        if (!tab.pinned) await chrome.tabs.update(tabId, { pinned: true });
        await this.syncTabOrder(tab.windowId);
    }

    async reorder({ bookmarkIds, windowId }) {
        const { folder, bookmarks } = await this.bookmarks();
        const known = new Set(bookmarks.map(b => b.id));
        const ids = bookmarkIds.filter(id => known.has(id));
        const rest = bookmarks.map(b => b.id).filter(id => !ids.includes(id));
        await this.applyOrder(folder.id, [...ids, ...rest]);
        await this.syncTabOrder(windowId);
    }

    /** Activates the favorite's tab in this window, opening it pinned if it isn't open. */
    async open({ bookmarkId, windowId }) {
        const { bookmarks } = await this.bookmarks();
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) throw new Error('This favorite no longer exists.');
        const bindings = await this.bindings();
        const pinned = await this.pinnedTabs(windowId);
        const open = pinned.find(t => bindings[t.id] === bookmarkId);
        if (open) {
            await chrome.tabs.update(open.id, { active: true });
            return;
        }
        const position = new Map(bookmarks.map((b, i) => [b.id, i]));
        const index = pinned.filter(t => position.get(bindings[t.id]) < position.get(bookmarkId)).length;
        const tab = await chrome.tabs.create({ windowId, url: bookmark.url, pinned: true, index, active: true });
        await this.saveBindings({ ...(await this.bindings()), [tab.id]: bookmarkId });
        await this.setLastUrl(bookmarkId, bookmark.url);
    }

    async dispatch(message) {
        const actions = { get: m => this.get(m), add: m => this.add(m), reorder: m => this.reorder(m), open: m => this.open(m) };
        const action = actions[message.action];
        if (!action) throw new Error(`Unknown favorites action: ${message.action}`);
        const result = await this.run(() => action(message));
        if (message.action !== 'get') this.notify();
        return result;
    }

    notify() {
        try {
            chrome.runtime.sendMessage({ type: 'favoritesChanged' })?.catch?.(() => {});
        } catch { /* No sidebar is open. */ }
    }

    install() {
        const handle = operation => this.run(operation).then(() => this.notify(), () => {});
        const inFolder = async parentId => parentId && parentId === (await chrome.storage.local.get(FOLDER_KEY))[FOLDER_KEY];

        chrome.tabs.onCreated.addListener(tab => { if (tab.pinned) handle(() => this.adopt(tab)); });
        chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
            // Chrome unpins a pinned tab just before closing it, so wait to see which this is.
            if (change.pinned === false) setTimeout(() => handle(() => this.unpinned(tabId)), UNPIN_SETTLE_MS);
            else if (change.pinned === true || (tab.pinned && change.url)) handle(() => this.adopt(tab));
        });
        chrome.tabs.onRemoved.addListener(tabId => handle(() => this.tabRemoved(tabId)));
        chrome.tabs.onReplaced.addListener((added, removed) => handle(() => this.tabReplaced(added, removed)));
        chrome.tabs.onMoved.addListener(async (tabId, { windowId }) => {
            if ((await this.bindings())[tabId]) handle(() => this.followTabOrder(windowId));
        });

        chrome.bookmarks.onRemoved.addListener(async (id, { parentId }) => {
            if (id === (await chrome.storage.local.get(FOLDER_KEY))[FOLDER_KEY]) handle(() => this.folderGone());
            else if (await inFolder(parentId)) handle(() => this.bookmarkGone(id));
        });
        chrome.bookmarks.onMoved.addListener(async (id, { parentId, oldParentId }) => {
            if (parentId !== oldParentId && await inFolder(oldParentId)) handle(() => this.bookmarkGone(id));
            else if (await inFolder(parentId)) this.notify();
        });
        chrome.bookmarks.onCreated.addListener(async (id, node) => { if (await inFolder(node.parentId)) this.notify(); });
        chrome.bookmarks.onChanged.addListener(async id => {
            const [node] = await chrome.bookmarks.get(id).catch(() => []);
            if (await inFolder(node?.parentId)) this.notify();
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type !== 'favorites') return;
            this.dispatch(message).then(result => sendResponse({ success: true, ...result }), error => sendResponse({ success: false, error: error.message }));
            return true;
        });

        // Pinned tabs from before this version, and rebinding after a restart or update clears session storage.
        handle(() => this.reconcile());
    }
}
