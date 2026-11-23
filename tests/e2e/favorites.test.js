import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

// Favorites (the top row) are kept as bookmarks, so they outlive their tabs and a restart.
let server, base, browser, page, profile;
const favicon = id => `#pinnedFavicons .pinned-favicon[data-favorite-id="${id}"]`;

async function launch() {
    const result = await launchBrowserWithExtension({ userDataDir: profile });
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    page.on('pageerror', error => console.error('Sidebar error:', error.message));
}

const favoriteBookmarks = () => page.evaluate(async () => {
    const [folder] = (await chrome.bookmarks.search({ title: 'Arcify Favorites' })).filter(node => !node.url);
    if (!folder) return null;
    const [arcify] = (await chrome.bookmarks.search({ title: 'Arcify' })).filter(node => !node.url);
    const children = await chrome.bookmarks.getChildren(folder.id);
    return { besideArcify: folder.parentId === arcify?.parentId, items: children.map(({ id, url }) => ({ id, url })) };
});

async function pinNewTab(url) {
    const tabId = await page.evaluate(async url => {
        const tab = await chrome.tabs.create({ url, active: false });
        await new Promise(resolve => chrome.tabs.onUpdated.addListener(function done(id, info) {
            if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); resolve(); }
        }));
        await chrome.tabs.update(tab.id, { pinned: true });
        return tab.id;
    }, url);
    await page.waitForSelector(`#pinnedFavicons .pinned-favicon[data-tab-id="${tabId}"][data-favorite-id]`);
    return { tabId, bookmarkId: await page.$eval(`#pinnedFavicons [data-tab-id="${tabId}"]`, el => el.dataset.favoriteId) };
}

beforeAll(async () => {
    server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<title>Page ${req.url}</title>`); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    profile = mkdtempSync(path.join(tmpdir(), 'arcify-favorites-'));
    await launch();
});

afterAll(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    rmSync(profile, { recursive: true, force: true });
});

test('pinning a tab saves it as a favorite in a bookmark folder beside Arcify', async () => {
    const { bookmarkId } = await pinNewTab(`${base}/mail`);
    const saved = await favoriteBookmarks();
    expect(saved.besideArcify).toBe(true);
    expect(saved.items).toEqual([{ id: bookmarkId, url: `${base}/mail` }]);
});

test('a favorite whose tab is closed stays in the row, and clicking it opens it pinned again', async () => {
    const [{ id: bookmarkId }] = (await favoriteBookmarks()).items;
    await page.evaluate(async () => {
        const tabs = await chrome.tabs.query({ pinned: true, currentWindow: true });
        await chrome.tabs.remove(tabs.map(t => t.id));
    });
    await page.waitForSelector(`${favicon(bookmarkId)}.unloaded:not([data-tab-id])`);
    await page.reload();
    await page.waitForSelector(`${favicon(bookmarkId)}.unloaded`);
    expect(await page.$eval(favicon(bookmarkId), el => el.getAttribute('aria-label'))).toMatch(/not open/);
    expect(await page.$eval('.pinned-placeholder-container', el => el.style.display)).toBe('none');

    await page.$eval(favicon(bookmarkId), el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    // Opening the favorite hides this tab, where requestAnimationFrame polling stalls.
    await page.waitForFunction(selector => document.querySelector(selector), { polling: 100 }, `${favicon(bookmarkId)}[data-tab-id]:not(.unloaded)`);
    const tabId = Number(await page.$eval(favicon(bookmarkId), el => el.dataset.tabId));
    const tab = await page.evaluate(id => chrome.tabs.get(id), tabId);
    expect(tab.pinned).toBe(true);
    expect(tab.url || tab.pendingUrl).toBe(`${base}/mail`);
    expect((await favoriteBookmarks()).items).toHaveLength(1);
});

test('favorites are still there after Chrome restarts', async () => {
    const { bookmarkId: second } = await pinNewTab(`${base}/calendar`);
    const before = (await favoriteBookmarks()).items.map(item => item.id);
    expect(before.at(-1)).toBe(second);

    await browser.close();
    await launch();

    await page.waitForSelector(favicon(second));
    expect(await page.$$eval('#pinnedFavicons .pinned-favicon', els => els.map(el => el.dataset.favoriteId))).toEqual(before);
    expect((await favoriteBookmarks()).items.map(item => item.id)).toEqual(before);
});

test('dragging a favorite to the end of the row reorders its bookmark', async () => {
    const [first, second] = (await favoriteBookmarks()).items.map(item => item.id);
    await page.$eval(favicon(first), el => {
        el.classList.add('dragging');
        el.parentElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 100000 }));
        el.classList.remove('dragging');
    });
    await page.waitForFunction(async ids => {
        const [folder] = (await chrome.bookmarks.search({ title: 'Arcify Favorites' })).filter(node => !node.url);
        return (await chrome.bookmarks.getChildren(folder.id)).map(node => node.id).join() === ids.join();
    }, { polling: 100 }, [second, first]);
    await page.waitForFunction(ids => [...document.querySelectorAll('#pinnedFavicons .pinned-favicon')].map(el => el.dataset.favoriteId).join() === ids.join(),
        { polling: 100 }, [second, first]);
});

test('unpinning a favorite removes it', async () => {
    const { tabId, bookmarkId } = await pinNewTab(`${base}/docs`);
    await page.evaluate(id => chrome.tabs.update(id, { pinned: false }), tabId);
    await page.waitForFunction(selector => !document.querySelector(selector), { polling: 100 }, favicon(bookmarkId));
    await page.waitForFunction(async id => (await chrome.bookmarks.get(id).catch(() => [])).length === 0, { polling: 100 }, bookmarkId);
});

test.each(['pinned', 'temporary'])('dragging a favorite into a space\'s %s section moves it there without an error', async section => {
    const { tabId, bookmarkId } = await pinNewTab(`${base}/${section}`);
    const dialogs = [];
    const onDialog = dialog => { dialogs.push(dialog.message()); dialog.dismiss(); };
    page.on('dialog', onDialog);
    await page.evaluate((id, section) => {
        const icon = document.querySelector(`#pinnedFavicons [data-tab-id="${id}"]`);
        const target = document.querySelector(`.space.active [data-tab-type="${section}"]`);
        icon.classList.add('dragging');
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 50, clientY: target.getBoundingClientRect().bottom - 2 }));
        icon.classList.remove('dragging');
    }, tabId, section);
    const row = `.space.active [data-tab-type="${section}"] .tab[data-tab-id="${tabId}"]${section === 'pinned' ? '[data-bookmark-id]' : ''}`;
    await page.waitForFunction(selector => document.querySelector(selector), { polling: 100 }, row);
    await page.waitForFunction(async id => (await chrome.bookmarks.get(id).catch(() => [])).length === 0, { polling: 100 }, bookmarkId);
    page.off('dialog', onDialog);
    expect(dialogs).toEqual([]);
    expect(await page.evaluate(id => chrome.tabs.get(id).then(tab => tab.pinned), tabId)).toBe(false);
});
