import { ownerOf } from './space-store.js';
import { isInSplit, canCreateSplit, ensureSplit } from './split-view.js';

/**
 * Duplicates a tab at its current URL as an unpinned tab in the same space.
 * A custom tab name belongs to the original tab id, so the copy shows the page title.
 * A tab in a split duplicates the whole split.
 *
 * @param {number} tabId
 * @param {Function} dispatch - The space store's dispatch.
 * @return {Promise<chrome.tabs.Tab[]>} The copies, left first for a split.
 */
export async function duplicateTab(tabId, dispatch, tabsApi = globalThis.chrome.tabs) {
    const tab = await tabsApi.get(tabId);
    if (!isInSplit(tab) || !canCreateSplit(tabsApi)) {
        const copy = await duplicateOne(tabId, dispatch, tabsApi);
        return copy ? [copy] : [];
    }
    const halves = (await tabsApi.query({ windowId: tab.windowId }))
        .filter(t => t.splitViewId === tab.splitViewId)
        .sort((a, b) => a.index - b.index);
    const copies = [];
    try {
        for (const half of halves) {
            const copy = await duplicateOne(half.id, dispatch, tabsApi);
            if (copy) copies.push(copy);
        }
    } finally {
        // Chrome places a copy right after its original, which can land between the halves.
        if (halves.length === 2) await ensureSplit(halves[0].id, halves[1].id, tabsApi);
    }
    if (copies.length === 2) await ensureSplit(copies[0].id, copies[1].id, tabsApi);
    return copies;
}

async function duplicateOne(tabId, dispatch, tabsApi) {
    const spaceId = ownerOf(await dispatch({ action: 'get' }), tabId)?.id;
    const copy = await tabsApi.duplicate(tabId);
    if (!copy) return null;
    if (copy.pinned) await tabsApi.update(copy.id, { pinned: false });
    // Chrome normally sets the original as opener, which already files the copy beside it.
    if (spaceId && ownerOf(await dispatch({ action: 'get' }), copy.id)?.id !== spaceId) {
        await dispatch({ action: 'assign', tabId: copy.id, spaceId, pinned: false });
    }
    return copy;
}
