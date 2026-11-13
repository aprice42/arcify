import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

let browser, page;

beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
});
afterAll(async () => { await browser?.close(); });

test('an open context menu closes when focus leaves the sidebar', async () => {
    await page.waitForSelector('.space.active .tab');
    await page.bringToFront();
    await page.$eval('.space.active .tab', el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })));
    await page.waitForSelector('#tab-context-menu');

    const other = await browser.newPage();
    await other.bringToFront();
    await page.waitForFunction(() => !document.querySelector('.context-menu'), { polling: 100, timeout: 5000 });
    await other.close();
});
