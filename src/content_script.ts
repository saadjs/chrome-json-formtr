import cssText from './content_script.css?inline';
import { getTheme, generateThemeCSS } from './themes.js';

let showingRaw = false;
let originalText = '';
let currentSettings = { theme: 'dark', fontSize: 16 };

function injectCSS() {
    const style = document.createElement('style');
    style.id = 'json-formtr-base-css';
    style.textContent = cssText;
    document.head.appendChild(style);
}

function injectThemeCSS(theme: string, fontSize: number) {
    // Remove existing theme CSS
    const existingThemeStyle = document.getElementById('json-formtr-theme-css');
    if (existingThemeStyle) {
        existingThemeStyle.remove();
    }

    // Inject new theme CSS
    const themeStyle = document.createElement('style');
    themeStyle.id = 'json-formtr-theme-css';
    themeStyle.textContent = generateThemeCSS(getTheme(theme), fontSize);
    document.head.appendChild(themeStyle);
}

function isLikelyJsonResponse(): boolean {
    // Check if this looks like a JSON API response
    const contentType = document.contentType || '';
    const bodyText = document.body.innerText.trim();

    // Must have some content
    if (!bodyText) return false;

    // Check content type hints
    if (contentType.includes('json')) return true;

    // Check if body looks like JSON
    if (!(bodyText.startsWith('{') || bodyText.startsWith('['))) return false;

    // Try to parse as JSON
    try {
        JSON.parse(bodyText);
        return true;
    } catch {
        return false;
    }
}

function formatJson(text: string): string {
    try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return text;
    }
}

function highlightJsonSyntax(jsonText: string): string {
    // Note: Input is already HTML-escaped, so quotes are &quot;
    return jsonText
        .replace(/(&quot;.*?&quot;)\s*:/g, '<span class="json-key">$1</span>:')
        .replace(/:\s*(&quot;.*?&quot;)/g, (_, str) => {
            // Apply URL linkification to string values
            const linkified = linkifyUrls(str);
            return `: <span class="json-string">${linkified}</span>`;
        })
        .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
        .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
        .replace(/([{}[\]])/g, '<span class="json-brace">$1</span>')
        // Match array string values: standalone strings at start of line (not keys)
        .replace(/^(\s*)(&quot;.*?&quot;)(?!\s*:)/g, (_, ws, str) => {
            const linkified = linkifyUrls(str);
            return `${ws}<span class="json-string">${linkified}</span>`;
        });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function linkifyUrls(str: string): string {
    const quotedValueMatch = str.match(/^&quot;(.*)&quot;$/);
    if (!quotedValueMatch) return str;

    const inner = quotedValueMatch[1];
    // Match URLs inside the string value, but stop at whitespace or quotes.
    const urlPattern = /(https?|ftp):\/\/[^\s"&]+|mailto:[^\s"&]+/g;
    const linkified = inner.replace(urlPattern, (url) => {
        // Trim trailing punctuation that often wraps URLs while preserving balanced pairs.
        let trimmed = url;
        let openParen = 0;
        let closeParen = 0;
        let openBracket = 0;
        let closeBracket = 0;
        let openBrace = 0;
        let closeBrace = 0;

        for (const ch of trimmed) {
            if (ch === '(') openParen += 1;
            else if (ch === ')') closeParen += 1;
            else if (ch === '[') openBracket += 1;
            else if (ch === ']') closeBracket += 1;
            else if (ch === '{') openBrace += 1;
            else if (ch === '}') closeBrace += 1;
        }

        while (trimmed.length > 0) {
            const last = trimmed[trimmed.length - 1];
            if (last === ')' && closeParen > openParen) {
                trimmed = trimmed.slice(0, -1);
                closeParen -= 1;
                continue;
            }
            if (last === ']' && closeBracket > openBracket) {
                trimmed = trimmed.slice(0, -1);
                closeBracket -= 1;
                continue;
            }
            if (last === '}' && closeBrace > openBrace) {
                trimmed = trimmed.slice(0, -1);
                closeBrace -= 1;
                continue;
            }
            if (last === '.' || last === ',' || last === '!' || last === '?' || last === ';' || last === ':' || last === '"' || last === "'") {
                trimmed = trimmed.slice(0, -1);
                continue;
            }
            break;
        }

        const trailing = url.slice(trimmed.length);
        if (trimmed.length === 0) return url;
        // Decode HTML entities for href, keep escaped version for display
        const hrefUrl = trimmed.replace(/&amp;/g, '&');
        return `<a href="${hrefUrl}" class="json-link" target="_blank" rel="noopener noreferrer">${trimmed}</a>${trailing}`;
    });

    return `&quot;${linkified}&quot;`;
}

function buildFormattedViewer(formatted: string): HTMLElement {
    const lines = formatted.split('\n');
    const digitCount = String(lines.length).length;

    const viewer = document.createElement('div');
    viewer.id = 'json-format-viewer';
    viewer.style.setProperty('--line-number-width', `${digitCount}ch`);

    const html = lines
        .map((line, i) => {
            const highlightedLine = line === '' ? '\u200B' : highlightJsonSyntax(escapeHtml(line));
            return `<div class="json-line">
                <span class="json-line-number">${i + 1}</span>
                <span class="json-line-content">${highlightedLine}</span>
            </div>`;
        })
        .join('');

    viewer.innerHTML = html;
    return viewer;
}



function toggleRawFormatted() {
    const viewer = document.getElementById('json-format-viewer');

    if (!viewer) return;

    if (showingRaw) {
        // Switch to formatted
        const formatted = buildFormattedViewer(formatJson(originalText));
        viewer.replaceWith(formatted);
        showingRaw = false;
        console.log('[JSON Formtr] Switched to formatted view');
    } else {
        // Switch to raw
        const rawViewer = document.createElement('pre');
        rawViewer.id = 'json-format-viewer';
        rawViewer.className = 'raw';
        rawViewer.textContent = originalText;
        viewer.replaceWith(rawViewer);
        showingRaw = true;
        console.log('[JSON Formtr] Switched to raw view');
    }
}

function loadSettings(): Promise<typeof currentSettings> {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(currentSettings, (settings) => {
                const loadedSettings = {
                    theme: settings.theme || currentSettings.theme,
                    fontSize: settings.fontSize || currentSettings.fontSize
                };
                currentSettings = loadedSettings;
                resolve(loadedSettings);
            });
        } catch {
            // If chrome.storage is not available, use defaults
            resolve(currentSettings);
        }
    });
}

function init() {
    // Only run on pages that look like JSON responses
    if (!isLikelyJsonResponse()) return;

    console.log('[JSON Formtr] Detected JSON page, formatting...');

    // Load settings and then initialize
    loadSettings().then((settings) => {
        // Inject CSS
        injectCSS();
        injectThemeCSS(settings.theme, settings.fontSize);

        // Store original content
        originalText = document.body.innerText.trim();

        // Clear body and add formatted content
        document.body.innerHTML = '';

        // Create and add formatted viewer
        const formatted = formatJson(originalText);
        const viewer = buildFormattedViewer(formatted);
        document.body.appendChild(viewer);

        // Set page title if generic
        if (document.title === '' || document.title === 'Application/JSON' || document.title.includes('localhost')) {
            document.title = '📄 JSON Document';
        }

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleRawFormatted();
            }
        }, true);

        // Listen for background command message
        try {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg?.type === 'TOGGLE_JSON_VIEW') toggleRawFormatted();
            });
        } catch {
            // Ignore if chrome.runtime not available
        }

        // Listen for settings changes
        try {
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.theme || changes.fontSize) {
                    const newTheme = changes.theme?.newValue || currentSettings.theme;
                    const newFontSize = changes.fontSize?.newValue || currentSettings.fontSize;
                    currentSettings = { theme: newTheme, fontSize: newFontSize };
                    injectThemeCSS(newTheme, newFontSize);
                    console.log('[JSON Formtr] Settings updated:', currentSettings);
                }
            });
        } catch {
            // Ignore if chrome.storage not available
        }
    });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
