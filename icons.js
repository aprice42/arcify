/**
 * Icons - SVG icon definitions and constants
 * 
 * Purpose: Centralized repository for SVG icons used throughout the extension
 * Key Functions: Provides consistent icon definitions, folder states, action icons
 * Architecture: ES6 module exports for icon string constants
 * 
 * Critical Notes:
 * - Icons are embedded as SVG strings for performance and styling flexibility
 * - Font Awesome icons used with proper licensing attribution
 * - Exported constants allow for easy icon swapping and maintenance
 * - SVGs can be styled via CSS for theme consistency
 */

export const ARCHIVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M192 416l0-64 248 0c4 0 8-4 8-8l0-240c0-4-4-8-8-8l-304 0c-4 0-8 4-8 8l0 48c0 4 4 8 8 8l248 0 0 128-192 0 0-64-128 96z"/></svg>`;
export const RESTORE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="svg-icon"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M475 256c0-30-5-58-17-85-12-27-27-51-47-70-19-20-43-35-70-47-27-12-55-17-85-17-33 0-64 6-93 20-30 14-55 34-76 59-1 2-2 4-2 6 0 3 1 4 3 6l39 39c2 2 4 3 7 3 3 0 5-2 7-3 13-19 31-33 51-42 20-10 41-15 64-15 20 0 39 4 57 11 18 8 33 18 46 32 14 13 24 28 32 46 7 18 11 37 11 57 0 20-4 39-11 57-8 18-18 33-32 46-13 14-28 24-46 32-18 7-37 11-57 11-19 0-37-3-54-10-17-7-32-16-45-29l39-39c6-6 7-13 4-20-4-8-9-11-17-11l-128 0c-5 0-9 1-13 5-4 4-5 8-5 13l0 128c0 8 3 13 11 17 7 3 14 2 20-4l37-37c20 19 44 34 70 45 26 10 53 15 81 15 30 0 58-5 85-17 27-12 51-27 70-47 20-19 35-43 47-70 12-27 17-55 17-85z"/></svg>`;
export const MENU_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="svg-icon"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M296 376c0 22-18 40-40 40-22 0-40-18-40-40 0-22 18-40 40-40 22 0 40 18 40 40z m0-240c0 22-18 40-40 40-22 0-40-18-40-40 0-22 18-40 40-40 22 0 40 18 40 40z m0 120c0 22-18 40-40 40-22 0-40-18-40-40 0-22 18-40 40-40 22 0 40 18 40 40z"/></svg>`;

// Two side-by-side panes; drawn for Arcify, no attribution needed.
export const SPLIT_VIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.75" y="2.75" width="5.5" height="10.5" rx="1.25"/><rect x="8.75" y="2.75" width="5.5" height="10.5" rx="1.25"/></svg>`;
