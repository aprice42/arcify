import { ICON_SET } from './icon-set.js';
import { firstEmoji, iconSvg } from './custom-icon.js';

const COLUMNS = 7;
const MARGIN = 8;

const iconLabel = name => name.replace(/-/g, ' ');

/**
 * Opens the icon picker near (x, y): an emoji field, a searchable icon grid and a reset button.
 *
 * @param {object} options
 * @param {string} options.title - Accessible name of the dialog.
 * @param {string} options.resetLabel - Text of the button that restores the default icon.
 * @param {{emoji: string}|{name: string}|undefined} options.current
 * @param {(icon: {emoji: string}|{name: string}|null) => void} options.onPick - Not called on cancel.
 */
export function showIconPicker({ x, y, title, resetLabel, current, onPick }) {
    document.querySelector('.icon-picker')?.remove();
    const returnFocus = document.activeElement;

    const picker = document.createElement('div');
    picker.className = 'icon-picker';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', title);

    const emojiInput = labelledInput(picker, 'Emoji', 'text', 'Type or paste an emoji');
    const emojiHint = document.createElement('p');
    emojiHint.className = 'icon-picker-hint';
    emojiHint.id = 'icon-picker-hint';
    emojiHint.textContent = 'Press Return to use it. ⌃⌘Space opens the emoji viewer.';
    emojiInput.setAttribute('aria-describedby', emojiHint.id);
    picker.appendChild(emojiHint);
    if (current?.emoji) emojiInput.value = current.emoji;

    const searchInput = labelledInput(picker, 'Icons', 'search', 'Search icons');
    const grid = document.createElement('div');
    grid.className = 'icon-picker-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Icons');
    const buttons = Object.keys(ICON_SET).map(name => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-picker-icon';
        button.dataset.name = name;
        button.tabIndex = -1;
        button.setAttribute('aria-label', iconLabel(name));
        button.setAttribute('aria-pressed', String(current?.name === name));
        button.title = iconLabel(name);
        button.innerHTML = iconSvg(name);
        button.addEventListener('click', () => pick({ name }));
        grid.appendChild(button);
        return button;
    });
    picker.appendChild(grid);

    const status = document.createElement('p');
    status.className = 'visually-hidden';
    status.setAttribute('role', 'status');
    picker.appendChild(status);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'icon-picker-reset';
    reset.textContent = resetLabel;
    reset.addEventListener('click', () => pick(null));
    picker.appendChild(reset);

    // Roving focus: the grid is one Tab stop and arrow keys move within it.
    const visible = () => buttons.filter(button => !button.hidden);
    const setRover = target => {
        buttons.forEach(button => { button.tabIndex = button === target ? 0 : -1; });
    };
    setRover(buttons.find(button => button.dataset.name === current?.name) || buttons[0]);
    grid.addEventListener('keydown', event => {
        const shown = visible();
        const index = shown.indexOf(document.activeElement);
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS, Home: -index, End: shown.length - 1 - index };
        if (index < 0 || !(event.key in moves)) return;
        event.preventDefault();
        const next = shown[Math.min(shown.length - 1, Math.max(0, index + moves[event.key]))];
        setRover(next);
        next.focus();
    });

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        buttons.forEach(button => { button.hidden = Boolean(query) && !iconLabel(button.dataset.name).includes(query); });
        const shown = visible();
        setRover(shown[0] || null);
        status.textContent = shown.length ? `${shown.length} icons` : 'No icons match';
    });
    searchInput.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            event.preventDefault();
            visible()[0]?.focus();
        }
    });
    emojiInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const emoji = firstEmoji(emojiInput.value);
        if (emoji) pick({ emoji });
        else status.textContent = 'That is not an emoji';
    });

    const close = () => {
        picker.remove();
        document.removeEventListener('mousedown', onOutside, true);
        if (returnFocus?.isConnected) returnFocus.focus();
    };
    const pick = icon => {
        close();
        onPick(icon);
    };
    const onOutside = event => {
        if (!picker.contains(event.target)) close();
    };
    picker.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
    });
    document.addEventListener('mousedown', onOutside, true);

    document.body.appendChild(picker);
    const { width, height } = picker.getBoundingClientRect();
    picker.style.left = `${Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN))}px`;
    picker.style.top = `${Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN))}px`;
    (current?.emoji ? emojiInput : searchInput).focus();
}

function labelledInput(parent, text, type, placeholder) {
    const label = document.createElement('label');
    label.className = 'icon-picker-label';
    label.textContent = text;
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.autocomplete = 'off';
    label.appendChild(input);
    parent.appendChild(label);
    return input;
}
