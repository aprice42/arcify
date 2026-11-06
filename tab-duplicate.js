import { ownerOf } from './space-store.js';

/**
 * Duplicates a tab at its current URL as an unpinned tab in the same space.
 * A custom tab name belongs to the original tab id, so the copy shows the page title.
 *
 * @param {number} tabId
 * @param {Function} dispatch - The space store's dispatch.
 * @return {Promise<chrome.tabs.Tab|null>} The copy.
 */
export async function duplicateTab(tabId, dispatch, tabsApi = globalThis.chrome.tabs) {
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
