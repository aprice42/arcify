import { ICON_SET } from './icon-set.js';

// Arc-style folder icon drawn on a 24-unit grid: a tinted folder with an outline, which tips its
// front flap forward when open. A custom icon is fitted inside with FIT_PADDING_PX to spare.
export const FOLDER_PX = 32;
const UNITS_PER_PX = 24 / FOLDER_PX;
const OUTLINE = 1.2 * UNITS_PER_PX;
const FIT_PADDING = 1 * UNITS_PER_PX;
const ICON_LINE_PX = 1.2;
const FLAP_SLANT = -10;
const DOT_RADIUS = 1.2;

const CLOSED = '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1.5 1.5 0 0 1 1.06.44L11.8 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>';
const OPEN = '<path d="M3.5 17.5v-11A1.5 1.5 0 0 1 5 5h4.2a1.5 1.5 0 0 1 1.06.44L11.8 7H18a1.5 1.5 0 0 1 1.5 1.5V10"/><path d="M6.2 10h15.1a1 1 0 0 1 .96 1.28l-1.9 6.6A1.5 1.5 0 0 1 18.9 19H4.4a1 1 0 0 1-.96-1.28l1.8-6.98A1 1 0 0 1 6.2 10z"/>';
// Centre and inside height of the closed body and of the open front flap.
const SPOT = { closed: { x: 12, y: 13, height: 12 }, open: { x: 12.9, y: 14.5, height: 9 } };

const round = n => Math.round(n * 1000) / 1000;
const escapeText = text => text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** The icon's box, in grid units, for a closed or open folder. */
export function iconSize(open) {
    return SPOT[open ? 'open' : 'closed'].height - OUTLINE - 2 * FIT_PADDING;
}

/**
 * @param {object} options
 * @param {boolean} options.open
 * @param {boolean} options.hasOpenTabs - Only shown while closed: dots take the icon's place, as in Arc.
 * @param {{emoji: string}|{name: string}|null} options.icon
 * @return {string} SVG markup; colours come from --folder-fill and --folder-line.
 */
export function folderGlyphSvg({ open, hasOpenTabs = false, icon = null }) {
    const spot = SPOT[open ? 'open' : 'closed'];
    const size = iconSize(open);
    const place = `translate(${spot.x} ${spot.y})${open ? ` skewX(${FLAP_SLANT})` : ''}`;
    let inner = '';
    if (!open && hasOpenTabs) {
        const gap = DOT_RADIUS * 3.2;
        inner = [-gap, 0, gap].map(x => `<circle class="folder-dot" cx="${round(x)}" cy="0" r="${DOT_RADIUS}"/>`).join('');
    } else if (icon?.emoji) {
        inner = `<text x="0" y="0" font-size="${round(size * 0.95)}" text-anchor="middle" dominant-baseline="central">${escapeText(icon.emoji)}</text>`;
    } else if (ICON_SET[icon?.name]) {
        // Lucide draws on 24 units; scale it to the box and keep its line a fixed screen width.
        const line = ICON_LINE_PX / (size / UNITS_PER_PX) * 24;
        inner = `<g class="folder-inner" stroke-width="${round(line)}" transform="translate(${round(-size / 2)} ${round(-size / 2)}) scale(${round(size / 24)})">${ICON_SET[icon.name]}</g>`;
    }
    return `<svg class="folder-glyph" viewBox="0 0 24 24" width="${FOLDER_PX}" height="${FOLDER_PX}" stroke-width="${round(OUTLINE)}" aria-hidden="true">`
        + `<g class="folder-shape">${open ? OPEN : CLOSED}</g>${inner ? `<g transform="${place}">${inner}</g>` : ''}</svg>`;
}
