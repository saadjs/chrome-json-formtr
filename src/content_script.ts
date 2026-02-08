import cssText from "./content_script.css?inline";
import { getTheme, generateThemeCSS } from "./themes.js";

let showingRaw = false;
let originalText = "";
let currentSettings = { theme: "dark", fontSize: 16 };
let cachedFormattedHTML: string | null = null;
let cachedFormattedText: string | null = null;
let cachedFormattedLineContentHTML: string[] | null = null;
let cachedFormattedLineCount = 0;
let cachedFoldRanges: Map<number, FoldRange> | null = null;
let lineCountEl: HTMLElement | null = null;
let toggleButton: HTMLButtonElement | null = null;
let collapseAllButton: HTMLButtonElement | null = null;
let expandAllButton: HTMLButtonElement | null = null;

type FoldOpen = "{" | "[";
type FoldClose = "}" | "]";
type FoldRange = {
    startLine: number;
    endLine: number;
    open: FoldOpen;
    close: FoldClose;
    collapsedLineContentHTML: string;
};

type JsonViewerEl = HTMLElement & {
    __jsonFormtrLineEls?: HTMLElement[];
    __jsonFormtrHidden?: boolean[];
};

// Session-only fold state (persists across Raw/Formatted toggles)
const collapsedFoldStarts = new Set<number>();

function injectCSS() {
    const style = document.createElement("style");
    style.id = "json-formtr-base-css";
    style.textContent = cssText;
    document.head.appendChild(style);
}

function injectThemeCSS(theme: string, fontSize: number) {
    // Remove existing theme CSS
    const existingThemeStyle = document.getElementById("json-formtr-theme-css");
    if (existingThemeStyle) {
        existingThemeStyle.remove();
    }

    // Inject new theme CSS
    const themeStyle = document.createElement("style");
    themeStyle.id = "json-formtr-theme-css";
    themeStyle.textContent = generateThemeCSS(getTheme(theme), fontSize);
    document.head.appendChild(themeStyle);
}

function isLikelyJsonResponse(): boolean {
    // Check if this looks like a JSON API response
    const contentType = document.contentType || "";
    const bodyText = document.body.innerText.trim();

    // Must have some content
    if (!bodyText) return false;

    // Check content type hints
    if (contentType.includes("json")) return true;

    // Check if body looks like JSON
    if (!(bodyText.startsWith("{") || bodyText.startsWith("["))) return false;

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

function formatLineCount(count: number): string {
    const formattedCount = count.toLocaleString();
    return count === 1 ? `${formattedCount} line` : `${formattedCount} lines`;
}

function countLines(text: string): number {
    if (!text) return 0;
    return text.split("\n").length;
}

function highlightJsonSyntax(jsonText: string): string {
    // Note: Input is already HTML-escaped, so quotes are &quot;
    return (
        jsonText
            .replace(
                /(&quot;.*?&quot;)\s*:/g,
                '<span class="json-key">$1</span>:'
            )
            .replace(/:\s*(&quot;.*?&quot;)/g, (_, str) => {
                // Apply URL linkification to string values
                const linkified = linkifyUrls(str);
                return `: <span class="json-string">${linkified}</span>`;
            })
            .replace(
                /:\s*(-?\d+\.?\d*)/g,
                ': <span class="json-number">$1</span>'
            )
            .replace(
                /:\s*(true|false)/g,
                ': <span class="json-boolean">$1</span>'
            )
            .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
            .replace(/([{}[\]])/g, '<span class="json-brace">$1</span>')
            // Match array string values: standalone strings at start of line (not keys)
            .replace(/^(\s*)(&quot;.*?&quot;)(?!\s*:)/g, (_, ws, str) => {
                const linkified = linkifyUrls(str);
                return `${ws}<span class="json-string">${linkified}</span>`;
            })
    );
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function linkifyUrls(str: string): string {
    const quotedValueMatch = str.match(/^&quot;(.*)&quot;$/);
    if (!quotedValueMatch) return str;

    const inner = quotedValueMatch[1];
    // Match URLs inside the string value, but stop at whitespace or quotes.
    const urlPattern = /(https?|ftp):\/\/[^\s"]+|mailto:[^\s"]+/g;
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
            if (ch === "(") openParen += 1;
            else if (ch === ")") closeParen += 1;
            else if (ch === "[") openBracket += 1;
            else if (ch === "]") closeBracket += 1;
            else if (ch === "{") openBrace += 1;
            else if (ch === "}") closeBrace += 1;
        }

        while (trimmed.length > 0) {
            const last = trimmed[trimmed.length - 1];
            if (last === ")" && closeParen > openParen) {
                trimmed = trimmed.slice(0, -1);
                closeParen -= 1;
                continue;
            }
            if (last === "]" && closeBracket > openBracket) {
                trimmed = trimmed.slice(0, -1);
                closeBracket -= 1;
                continue;
            }
            if (last === "}" && closeBrace > openBrace) {
                trimmed = trimmed.slice(0, -1);
                closeBrace -= 1;
                continue;
            }
            if (
                last === "." ||
                last === "," ||
                last === "!" ||
                last === "?" ||
                last === ";" ||
                last === ":" ||
                last === '"' ||
                last === "'"
            ) {
                trimmed = trimmed.slice(0, -1);
                continue;
            }
            break;
        }

        const trailing = url.slice(trimmed.length);
        if (trimmed.length === 0) return url;
        // Decode HTML entities for href, keep escaped version for display
        const hrefUrl = trimmed.replace(/&amp;/g, "&");
        return `<a href="${hrefUrl}" class="json-link" target="_blank" rel="noopener noreferrer">${trimmed}</a>${trailing}`;
    });

    return `&quot;${linkified}&quot;`;
}

function buildFormattedHTML(formatted: string): {
    html: string;
    lineCount: number;
    lineContentHTML: string[];
} {
    const lines = formatted.split("\n");
    const foldRanges = cachedFoldRanges ?? new Map<number, FoldRange>();
    const lineContentHTML: string[] = new Array(lines.length);
    const html = lines
        .map((line, i) => {
            const highlightedLine = line === "" ? "\u200B" : highlightJsonSyntax(escapeHtml(line));
            lineContentHTML[i] = highlightedLine;
            const lineNo = i + 1;
            const hasFold = foldRanges.has(lineNo);
            const foldToggle = hasFold
                ? `<button class="json-fold-toggle" type="button" data-fold-start="${lineNo}" aria-label="Collapse section" aria-expanded="true"></button>`
                : `<span class="json-fold-spacer" aria-hidden="true"></span>`;
            return `<div class="json-line">
                <span class="json-line-number">${foldToggle}<span class="json-line-num">${lineNo}</span></span>
                <span class="json-line-content">${highlightedLine}</span>
            </div>`;
        })
        .join("");

    return { html, lineCount: lines.length, lineContentHTML };
}

function createFormattedViewer(html: string, lineCount: number): HTMLElement {
    const viewer = document.createElement("div");
    viewer.id = "json-format-viewer";
    const digits = String(lineCount).length;
    // Account for: toggle (16px + 6px gap) + digits + padding
    viewer.style.setProperty(
        "--line-number-width",
        `calc(22px + ${digits}ch)`
    );
    viewer.innerHTML = html;
    return viewer;
}

function ensureFormattedCache(): void {
    if (cachedFormattedHTML && cachedFormattedText && cachedFormattedLineContentHTML && cachedFoldRanges) return;
    cachedFormattedText = formatJson(originalText);
    cachedFoldRanges = computeFoldRanges(cachedFormattedText);
    const formatted = buildFormattedHTML(cachedFormattedText);
    cachedFormattedHTML = formatted.html;
    cachedFormattedLineCount = formatted.lineCount;
    cachedFormattedLineContentHTML = formatted.lineContentHTML;
}

function updateLineCount(count: number): void {
    if (lineCountEl) {
        lineCountEl.textContent = formatLineCount(count);
    }
}

function updateToggleLabel(): void {
    if (toggleButton) {
        toggleButton.textContent = showingRaw ? "Formatted" : "Raw";
    }
}

function showToast(message: string): void {
    const toast = document.createElement("div");
    toast.className = "json-formtr-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    window.setTimeout(() => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.remove(), 250);
    }, 1800);
}

async function copyFormattedToClipboard(): Promise<void> {
    ensureFormattedCache();
    if (!cachedFormattedText) return;

    try {
        await navigator.clipboard.writeText(cachedFormattedText);
        showToast("Copied formatted JSON");
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = cachedFormattedText;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            showToast("Copied formatted JSON");
        } catch {
            showToast("Copy failed");
        } finally {
            textarea.remove();
        }
    }
}

function getSmartFilename(): string {
    let base = "data";
    try {
        const url = new URL(window.location.href);
        if (url.pathname && url.pathname !== "/") {
            base = url.pathname.split("/").filter(Boolean).pop() || base;
        } else if (url.hostname) {
            base = url.hostname;
        }
    } catch {
        // Ignore URL parsing errors.
    }

    const sanitized = base
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${sanitized || "data"}.json`;
}

function downloadFormattedJson(): void {
    ensureFormattedCache();
    if (!cachedFormattedText) return;

    const blob = new Blob([cachedFormattedText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getSmartFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded JSON");
}

function createToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.id = "json-formtr-toolbar";

    const left = document.createElement("div");
    left.className = "json-toolbar-left";
    lineCountEl = document.createElement("span");
    lineCountEl.id = "json-formtr-line-count";
    left.appendChild(lineCountEl);

    const right = document.createElement("div");
    right.className = "json-toolbar-right";

    const copyButton = document.createElement("button");
    copyButton.className = "json-toolbar-btn";
    copyButton.type = "button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => {
        void copyFormattedToClipboard();
    });

    const downloadButton = document.createElement("button");
    downloadButton.className = "json-toolbar-btn";
    downloadButton.type = "button";
    downloadButton.textContent = "Download";
    downloadButton.addEventListener("click", downloadFormattedJson);

    collapseAllButton = document.createElement("button");
    collapseAllButton.className = "json-toolbar-btn";
    collapseAllButton.type = "button";
    collapseAllButton.textContent = "Collapse all";
    collapseAllButton.disabled = true;
    collapseAllButton.addEventListener("click", collapseAllFolds);

    expandAllButton = document.createElement("button");
    expandAllButton.className = "json-toolbar-btn";
    expandAllButton.type = "button";
    expandAllButton.textContent = "Expand all";
    expandAllButton.disabled = true;
    expandAllButton.addEventListener("click", expandAllFolds);

    toggleButton = document.createElement("button");
    toggleButton.className = "json-toolbar-btn";
    toggleButton.type = "button";
    toggleButton.addEventListener("click", toggleRawFormatted);

    right.append(copyButton, downloadButton, collapseAllButton, expandAllButton, toggleButton);
    toolbar.append(left, right);

    updateToggleLabel();
    updateFoldButtonsState();
    return toolbar;
}

function toggleRawFormatted() {
    const viewer = document.getElementById("json-format-viewer");

    if (!viewer) return;

    if (showingRaw) {
        // Switch to formatted
        ensureFormattedCache();
        if (cachedFormattedHTML) {
            const formatted = createFormattedViewer(
                cachedFormattedHTML,
                cachedFormattedLineCount
            );
            viewer.replaceWith(formatted);
            updateLineCount(cachedFormattedLineCount);
            attachFoldingHandlers(formatted);
            applyFoldsIfNeeded(formatted);
        }
        showingRaw = false;
        updateToggleLabel();
        updateFoldButtonsState();
        console.log("[JSON Formtr] Switched to formatted view");
    } else {
        // Switch to raw
        const rawViewer = document.createElement("pre");
        rawViewer.id = "json-format-viewer";
        rawViewer.className = "raw";
        rawViewer.textContent = originalText;
        viewer.replaceWith(rawViewer);
        showingRaw = true;
        updateLineCount(countLines(originalText));
        updateToggleLabel();
        updateFoldButtonsState();
        console.log("[JSON Formtr] Switched to raw view");
    }
}

function loadSettings(): Promise<typeof currentSettings> {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(currentSettings, (settings) => {
                const loadedSettings = {
                    theme: settings.theme || currentSettings.theme,
                    fontSize: settings.fontSize || currentSettings.fontSize,
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

    console.log("[JSON Formtr] Detected JSON page, formatting...");

    // Load settings and then initialize
    loadSettings().then((settings) => {
        // Inject CSS
        injectCSS();
        injectThemeCSS(settings.theme, settings.fontSize);

        // Store original content
        originalText = document.body.innerText.trim();

        // Clear body and add formatted content
        document.body.innerHTML = "";

        // Create toolbar
        const toolbar = createToolbar();
        document.body.appendChild(toolbar);

        // Create and add formatted viewer
        ensureFormattedCache();
        const viewer = cachedFormattedHTML
            ? createFormattedViewer(
                  cachedFormattedHTML,
                  cachedFormattedLineCount
              )
            : createFormattedViewer("", 0);
        document.body.appendChild(viewer);
        updateLineCount(cachedFormattedLineCount);
        attachFoldingHandlers(viewer);
        applyFoldsIfNeeded(viewer);
        updateFoldButtonsState();

        // Set page title if generic
        if (
            document.title === "" ||
            document.title === "Application/JSON" ||
            document.title.includes("localhost")
        ) {
            document.title = getJsonTitleFromUrl();
        }

        // Keyboard shortcut
        document.addEventListener(
            "keydown",
            (e) => {
                if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "f") {
                    e.preventDefault();
                    toggleRawFormatted();
                }
            },
            true
        );

        // Listen for background command message
        try {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg?.type === "TOGGLE_JSON_VIEW") toggleRawFormatted();
            });
        } catch {
            // Ignore if chrome.runtime not available
        }

        // Listen for settings changes
        try {
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.theme || changes.fontSize) {
                    const newTheme =
                        changes.theme?.newValue || currentSettings.theme;
                    const newFontSize =
                        changes.fontSize?.newValue || currentSettings.fontSize;
                    currentSettings = {
                        theme: newTheme,
                        fontSize: newFontSize,
                    };
                    injectThemeCSS(newTheme, newFontSize);
                    console.log(
                        "[JSON Formtr] Settings updated:",
                        currentSettings
                    );
                }
            });
        } catch {
            // Ignore if chrome.storage not available
        }
    });
}

function getJsonTitleFromUrl(): string {
    try {
        const url = new URL(window.location.href);
        const hostname = url.hostname || "local";
        const path = decodeURIComponent(url.pathname || "");
        const pathLabel = path && path !== "/" ? path : "";
        const label = pathLabel ? `${hostname}${pathLabel}` : hostname;
        return `JSON - ${label}`;
    } catch {
        return "JSON - Document";
    }
}

// Run when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

function updateFoldButtonsState(): void {
    const foldEnabled = !showingRaw && !!cachedFoldRanges && cachedFoldRanges.size > 0;
    if (collapseAllButton) collapseAllButton.disabled = !foldEnabled;
    if (expandAllButton) expandAllButton.disabled = !foldEnabled;
}

function getFormattedViewerElement(): HTMLElement | null {
    const viewer = document.getElementById("json-format-viewer");
    if (!viewer) return null;
    if (viewer.tagName === "PRE" || viewer.classList.contains("raw")) return null;
    return viewer as HTMLElement;
}

function collapseAllFolds(): void {
    const viewer = getFormattedViewerElement();
    if (!viewer) return;
    ensureFormattedCache();
    if (!cachedFoldRanges) return;
    for (const startLine of cachedFoldRanges.keys()) {
        collapsedFoldStarts.add(startLine);
    }
    applyFoldsIfNeeded(viewer);
}

function expandAllFolds(): void {
    const viewer = getFormattedViewerElement();
    if (!viewer) return;
    collapsedFoldStarts.clear();
    applyFoldsIfNeeded(viewer);
}

function attachFoldingHandlers(viewer: HTMLElement): void {
    viewer.addEventListener("click", (e) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest?.(".json-fold-toggle") as HTMLButtonElement | null;
        if (!btn) return;
        const start = Number(btn.dataset.foldStart);
        if (!Number.isFinite(start)) return;
        if (collapsedFoldStarts.has(start)) collapsedFoldStarts.delete(start);
        else collapsedFoldStarts.add(start);
        applyFoldsIfNeeded(viewer);
    });
}

function applyFoldsIfNeeded(viewer: HTMLElement): void {
    ensureFormattedCache();
    if (!cachedFoldRanges || !cachedFormattedLineContentHTML) return;
    applyFolds(
        viewer as JsonViewerEl,
        cachedFoldRanges,
        collapsedFoldStarts,
        cachedFormattedLineContentHTML,
        cachedFormattedLineCount
    );
}

function getViewerLineElements(viewer: JsonViewerEl): HTMLElement[] {
    if (viewer.__jsonFormtrLineEls) return viewer.__jsonFormtrLineEls;
    const els = Array.from(viewer.querySelectorAll<HTMLElement>(".json-line"));
    viewer.__jsonFormtrLineEls = els;
    return els;
}

function applyFolds(
    viewer: JsonViewerEl,
    foldRanges: Map<number, FoldRange>,
    collapsed: Set<number>,
    lineContentHTML: string[],
    lineCount: number
): void {
    const lineEls = getViewerLineElements(viewer);
    const nextHidden = new Array<boolean>(lineCount).fill(false);

    for (const range of foldRanges.values()) {
        if (!collapsed.has(range.startLine)) continue;
        for (let l = range.startLine + 1; l <= range.endLine; l += 1) {
            if (l >= 1 && l <= lineCount) nextHidden[l - 1] = true;
        }
    }

    const prevHidden = viewer.__jsonFormtrHidden ?? new Array<boolean>(lineCount).fill(false);
    for (let i = 0; i < lineCount; i += 1) {
        if (prevHidden[i] === nextHidden[i]) continue;
        const el = lineEls[i];
        if (el) el.style.display = nextHidden[i] ? 'none' : '';
        prevHidden[i] = nextHidden[i];
    }
    viewer.__jsonFormtrHidden = prevHidden;

    for (const [startLine, range] of foldRanges.entries()) {
        const idx = startLine - 1;
        const el = lineEls[idx];
        if (!el) continue;
        const isCollapsed = collapsed.has(startLine);
        el.classList.toggle("is-collapsed", isCollapsed);

        const contentEl = el.querySelector<HTMLElement>(".json-line-content");
        if (contentEl) {
            contentEl.innerHTML = isCollapsed
                ? range.collapsedLineContentHTML
                : (lineContentHTML[idx] ?? "\u200B");
        }

        const btn = el.querySelector<HTMLButtonElement>(".json-fold-toggle");
        if (btn) {
            btn.classList.toggle("is-collapsed", isCollapsed);
            btn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
            btn.setAttribute("aria-label", isCollapsed ? "Expand section" : "Collapse section");
        }
    }
}

function computeFoldRanges(formatted: string): Map<number, FoldRange> {
    const lines = formatted.split("\n");
    const ranges = new Map<number, FoldRange>();

    const stack: Array<{ open: FoldOpen; startLine: number }> = [];
    let inString = false;
    let escape = false;
    let line = 1;

    for (let i = 0; i < formatted.length; i += 1) {
        const ch = formatted[i];
        if (ch === "\n") {
            line += 1;
            continue;
        }

        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === "\\") {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === "{" || ch === "[") {
            stack.push({ open: ch, startLine: line });
            continue;
        }

        if (ch === "}" || ch === "]") {
            const close = ch;
            const open = close === "}" ? "{" : "[";
            // Find the nearest matching opener (defensive; should always match for valid JSON).
            for (let s = stack.length - 1; s >= 0; s -= 1) {
                if (stack[s].open !== open) continue;
                const start = stack[s];
                stack.splice(s, 1);
                const startLine = start.startLine;
                const endLine = line;

                // Only fold multi-line ranges with at least one interior line.
                if (endLine < startLine + 2) break;
                if (ranges.has(startLine)) break;

                const startLineText = lines[startLine - 1] ?? "";
                const endLineText = lines[endLine - 1] ?? "";
                const hasTrailingComma = /[}\]]\s*,\s*$/.test(endLineText.trimEnd());
                const comma = hasTrailingComma ? "," : "";

                const openIdx = findStructuralCharIndex(startLineText, open);
                const prefix =
                    openIdx >= 0
                        ? startLineText.slice(0, openIdx + 1).trimEnd()
                        : startLineText.trimEnd();
                const summaryText = `${prefix} ... ${close}${comma}`;
                const collapsedLineContentHTML = highlightJsonSyntax(
                    escapeHtml(summaryText === "" ? "\u200B" : summaryText)
                );

                ranges.set(startLine, {
                    startLine,
                    endLine,
                    open,
                    close,
                    collapsedLineContentHTML,
                });
                break;
            }
        }
    }

    return ranges;
}

function findStructuralCharIndex(lineText: string, target: FoldOpen): number {
    let inString = false;
    let escape = false;
    for (let i = 0; i < lineText.length; i += 1) {
        const ch = lineText[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === "\\") {
                escape = true;
                continue;
            }
            if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === target) return i;
    }
    return -1;
}
