import cssText from './content_script.css?inline';
import gearIcon from './icons/gear.svg?raw';
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
    return jsonText
        .replace(/(".*?")\s*:/g, '<span class="json-key">$1</span>:')
        .replace(/:\s*(".*?")/g, ': <span class="json-string">$1</span>')
        .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
        .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
        .replace(/([{}[\]])/g, '<span class="json-brace">$1</span>');
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildFormattedViewer(formatted: string): HTMLElement {
    const lines = formatted.split('\n');

    const viewer = document.createElement('div');
    viewer.id = 'json-format-viewer';

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

function createSettingsGear(): HTMLElement {
    const gear = document.createElement('div');
    gear.className = 'json-settings-gear';
    gear.title = 'JSON Formtr Settings';
    gear.innerHTML = gearIcon;

    gear.addEventListener('click', () => {
        try {
            // Send message to background script to open options page
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[JSON Formtr] Could not send message to background:', chrome.runtime.lastError);
                } else if (response?.success) {
                    console.log('[JSON Formtr] Options page opened successfully');
                }
            });
        } catch (error) {
            console.error('[JSON Formtr] Could not send message to background:', error);
        }
    });

    return gear;
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

    // Ensure settings gear is always visible
    if (!document.querySelector('.json-settings-gear')) {
        const settingsGear = createSettingsGear();
        document.body.appendChild(settingsGear);
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

        // Add settings gear icon
        const settingsGear = createSettingsGear();
        document.body.appendChild(settingsGear);

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
