import { ICON_SET } from './icon-set.js';

// Custom icons replace a favorite's favicon or a folder's icon, as in Arc. Stored on this device only:
// favorites by pinned URL, so the icon survives undo and re-pinning, folders by bookmark id.
export const CUSTOM_ICONS_KEY = 'customIcons';

export const tabIconKey = url => `url:${url}`;
export const folderIconKey = id => `folder:${id}`;

export async function getCustomIcons(storage = globalThis.chrome.storage.local) {
    return (await storage.get(CUSTOM_ICONS_KEY))[CUSTOM_ICONS_KEY] || {};
}

/**
 * @param {string} key - From tabIconKey or folderIconKey.
 * @param {{emoji: string}|{name: string}|null} icon - null goes back to the default icon.
 */
export async function setCustomIcon(key, icon, storage = globalThis.chrome.storage.local) {
    const icons = await getCustomIcons(storage);
    if (icon) icons[key] = icon;
    else delete icons[key];
    await storage.set({ [CUSTOM_ICONS_KEY]: icons });
}

export async function moveCustomIcon(fromKey, toKey, storage = globalThis.chrome.storage.local) {
    const icons = await getCustomIcons(storage);
    if (!icons[fromKey] || fromKey === toKey) return;
    icons[toKey] = icons[fromKey];
    delete icons[fromKey];
    await storage.set({ [CUSTOM_ICONS_KEY]: icons });
}

// The first character of text when it is an emoji, else ''.
export function firstEmoji(text) {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.trim())) {
        return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment) ? segment : '';
    }
    return '';
}

export function iconSvg(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_SET[name]}</svg>`;
}

// A decorative element showing icon, or null when it names an icon that no longer exists.
export function createCustomIconElement(icon, doc = document) {
    const element = doc.createElement('span');
    element.className = 'custom-icon';
    element.setAttribute('aria-hidden', 'true');
    if (icon?.emoji) {
        element.classList.add('custom-icon-emoji');
        element.textContent = icon.emoji;
        return element;
    }
    if (!ICON_SET[icon?.name]) return null;
    element.innerHTML = iconSvg(icon.name);
    return element;
}
