import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';
import { createServer } from 'node:http';

// No internet: favorites load a local fixture server.
let server, baseUrl, browser, page, space;

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<title>Page ${req.url}</title><p>${req.url}</p>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    page.on('pageerror', error => console.error('Sidebar error:', error.message));
    space = await page.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' })).spaces[0]);
});
afterAll(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function openMenu(selector, menuSelector, label) {
    await page.$eval(selector, el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })));
    await page.waitForFunction((menuSelector, label) =>
        [...document.querySelectorAll(`${menuSelector} .context-menu-item`)].some(el => el.textContent === label), { polling: 100 }, menuSelector, label);
    await page.evaluate((menuSelector, label) =>
        [...document.querySelectorAll(`${menuSelector} .context-menu-item`)].find(el => el.textContent === label).click(), menuSelector, label);
    await page.waitForSelector('.icon-picker');
}

test('a favorite takes a line icon, then an emoji, then goes back to its site icon', async () => {
    const url = `${baseUrl}/icon-favorite`;
    await page.evaluate(async ({ folderId, url }) => chrome.bookmarks.create({ parentId: folderId, url, title: 'Icon favorite' }), { folderId: space.bookmarkFolderId, url });
    const favorite = `.space.active .tab.bookmark-only[data-url="${url}"]`;
    await page.waitForSelector(favorite);

    await openMenu(favorite, '#tab-context-menu', 'Change Icon…');
    await page.type('.icon-picker input[type="search"]', 'rocket');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.dataset.name)).toBe('rocket');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${favorite} .custom-icon svg`);
    expect(await page.$eval(`${favorite} .tab-favicon`, el => getComputedStyle(el).display)).toBe('none');

    await openMenu(favorite, '#tab-context-menu', 'Change Icon…');
    await page.type('.icon-picker input[type="text"]', '🚀');
    await page.keyboard.press('Enter');
    await page.waitForFunction(selector => document.querySelector(`${selector} .custom-icon-emoji`)?.textContent === '🚀', { polling: 100 }, favorite);

    await openMenu(favorite, '#tab-context-menu', 'Change Icon…');
    await page.$eval('.icon-picker-reset', el => el.click());
    await page.waitForFunction(selector => !document.querySelector(`${selector} .custom-icon`), { polling: 100 }, favorite);
});

test('a folder takes a line icon, and Escape leaves it unchanged', async () => {
    const folderId = await page.evaluate(async parentId => (await chrome.bookmarks.create({ parentId, title: 'Icon folder' })).id, space.bookmarkFolderId);
    const folder = `.space.active .folder[data-bookmark-id="${folderId}"]`;
    await page.waitForSelector(folder);

    await openMenu(`${folder} > .folder-header`, '.context-menu', 'Change Icon…');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.icon-picker'), { polling: 100 });
    expect(await page.$(`${folder} .folder-icon .custom-icon`)).toBeNull();

    await openMenu(`${folder} > .folder-header`, '.context-menu', 'Change Icon…');
    await page.$eval('.icon-picker-icon[data-name="briefcase"]', el => el.click());
    await page.waitForSelector(`${folder} > .folder-header .folder-icon.custom .custom-icon svg`);
});
