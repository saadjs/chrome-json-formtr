import cssText from "./content_script.css?inline";
import { getTheme, generateThemeCSS } from "./themes.js";
import {
    buildTextFromIntervals as buildTextFromIntervalsImpl,
    expandIntervalsForCollapsedStarts as expandIntervalsForCollapsedStartsImpl,
    getCollapsedSummaryTextForLine as getCollapsedSummaryTextForLineImpl,
    getSelectedLineIntervals as getSelectedLineIntervalsImpl,
    type FoldOpen,
    type FoldRange,
    type LineInterval,
} from "./fold_copy.js";

let showingRaw = false;
let sortedKeys = false;
const sortedKeyOrder = Symbol("sortedKeyOrder");

type SortedObject = Record<string, unknown> & {
    [sortedKeyOrder]?: string[];
};
let originalText = "";
let currentSettings = { theme: "dark", fontSize: 16 };
let cachedFormattedHTML: string | null = null;
let cachedFormattedText: string | null = null;
let cachedFormattedLineContentHTML: string[] | null = null;
let cachedFormattedLineCount = 0;
let cachedFoldRanges: Map<number, FoldRange> | null = null;
let cachedJsonPaths: string[] | null = null;
let lineCountEl: HTMLElement | null = null;
let sizeEl: HTMLElement | null = null;
let toggleButton: HTMLButtonElement | null = null;
let collapseAllButton: HTMLButtonElement | null = null;
let depthButtons: HTMLButtonElement[] = [];
let sortButton: HTMLButtonElement | null = null;
let pathBarEl: HTMLElement | null = null;

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

function resolveThemeId(themeId: string): string {
    if (themeId !== "auto") return themeId;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
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
    themeStyle.textContent = generateThemeCSS(
        getTheme(resolveThemeId(theme)),
        fontSize
    );
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
        if (sortedKeys) {
            return stringifySorted(sortKeysRecursive(parsed), 0);
        }
        return JSON.stringify(parsed, null, 2);
    } catch {
        return text;
    }
}

function sortKeysRecursive(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeysRecursive);
    }
    if (value !== null && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        const sorted = Object.create(null) as SortedObject;
        sorted[sortedKeyOrder] = keys;
        for (const key of keys) {
            sorted[key] = sortKeysRecursive(obj[key]);
        }
        return sorted as Record<string, unknown>;
    }
    return value;
}

function stringifySorted(value: unknown, indent: number): string {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as SortedObject;
        const keys = obj[sortedKeyOrder] ?? Object.keys(obj);
        if (keys.length === 0) return "{}";
        const entries: string[] = [];
        const pad = " ".repeat(indent);
        const innerPad = " ".repeat(indent + 2);
        for (const k of keys) {
            const v = obj[k];
            entries.push(
                `${innerPad}${JSON.stringify(k)}: ${stringifySorted(v, indent + 2)}`
            );
        }
        return `{\n${entries.join(",\n")}\n${pad}}`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        const pad = " ".repeat(indent);
        const innerPad = " ".repeat(indent + 2);
        const items = value.map(
            (item) => `${innerPad}${stringifySorted(item, indent + 2)}`
        );
        return `[\n${items.join(",\n")}\n${pad}]`;
    }
    return JSON.stringify(value);
}

function formatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function computeJsonPaths(formatted: string): string[] {
    const lines = formatted.split("\n");
    const paths: string[] = new Array(lines.length).fill("");

    interface PathContext {
        type: "object" | "array";
        path: string;
        arrayIndex: number;
    }

    const stack: PathContext[] = [];

    function currentPath(): string {
        return stack.length > 0 ? stack[stack.length - 1].path : "$";
    }

    function makeKeyPath(parentPath: string, key: string): string {
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
            return `${parentPath}.${key}`;
        }
        return `${parentPath}[${JSON.stringify(key)}]`;
    }

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) {
            paths[i] = currentPath();
            continue;
        }

        // Closing bracket
        if (trimmed[0] === "}" || trimmed[0] === "]") {
            paths[i] = currentPath();
            stack.pop();
            continue;
        }

        // Key-value pair: "key": ...
        const keyMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"\s*:\s*(.*)/);

        if (keyMatch) {
            // Reuse JSON's own string parser so escaped keys round-trip
            // correctly when we later rebuild bracket notation paths.
            const key = JSON.parse(`"${keyMatch[1]}"`) as string;
            const parentPath = currentPath();
            const thisPath = makeKeyPath(parentPath, key);
            paths[i] = thisPath;

            const rest = keyMatch[2].replace(/,\s*$/, "").trim();
            if (rest === "{") {
                stack.push({
                    type: "object",
                    path: thisPath,
                    arrayIndex: 0,
                });
            } else if (rest === "[") {
                stack.push({ type: "array", path: thisPath, arrayIndex: 0 });
            }
            continue;
        }

        // Array element or root bracket
        const parentCtx = stack.length > 0 ? stack[stack.length - 1] : null;

        if (parentCtx && parentCtx.type === "array") {
            const thisPath = `${parentCtx.path}[${parentCtx.arrayIndex}]`;
            parentCtx.arrayIndex++;
            paths[i] = thisPath;

            const rest = trimmed.replace(/,\s*$/, "").trim();
            if (rest === "{") {
                stack.push({
                    type: "object",
                    path: thisPath,
                    arrayIndex: 0,
                });
            } else if (rest === "[") {
                stack.push({ type: "array", path: thisPath, arrayIndex: 0 });
            }
            continue;
        }

        // Root bracket
        if (trimmed === "{" || trimmed === "[") {
            paths[i] = "$";
            stack.push({
                type: trimmed === "{" ? "object" : "array",
                path: "$",
                arrayIndex: 0,
            });
            continue;
        }

        paths[i] = currentPath();
    }

    return paths;
}

function buildFormattedHTML(formatted: string): {
    html: string;
    lineCount: number;
    lineContentHTML: string[];
} {
    const lines = formatted.split("\n");
    const foldRanges = cachedFoldRanges ?? new Map<number, FoldRange>();
    const paths = cachedJsonPaths ?? [];
    const lineContentHTML: string[] = new Array(lines.length);
    const html = lines
        .map((line, i) => {
            const highlightedLine =
                line === "" ? "\u200B" : highlightJsonSyntax(escapeHtml(line));
            lineContentHTML[i] = highlightedLine;
            const lineNo = i + 1;
            const hasFold = foldRanges.has(lineNo);
            const foldToggle = hasFold
                ? `<button class="json-fold-toggle" type="button" data-fold-start="${lineNo}" aria-label="Collapse section" aria-expanded="true"></button>`
                : `<span class="json-fold-spacer" aria-hidden="true"></span>`;
            const path = paths[i] ?? "";
            const escapedPath = escapeHtml(path);
            const indentDepth = Math.floor(
                (line.length - line.trimStart().length) / 2
            );
            return `<div class="json-line" data-line-no="${lineNo}" data-path="${escapedPath}">
                <span class="json-line-number">${foldToggle}<span class="json-line-num">${lineNo}</span></span>
                <span class="json-line-content" style="--indent-depth: ${indentDepth}">${highlightedLine}</span>
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
    viewer.style.setProperty("--line-number-width", `calc(22px + ${digits}ch)`);
    viewer.innerHTML = html;
    return viewer;
}

function invalidateFormattedCache(): void {
    cachedFormattedHTML = null;
    cachedFormattedText = null;
    cachedFormattedLineContentHTML = null;
    cachedFormattedLineCount = 0;
    cachedFoldRanges = null;
    cachedJsonPaths = null;
}

function ensureFormattedCache(): void {
    if (
        cachedFormattedHTML &&
        cachedFormattedText &&
        cachedFormattedLineContentHTML &&
        cachedFoldRanges &&
        cachedJsonPaths
    )
        return;
    cachedFormattedText = formatJson(originalText);
    cachedFoldRanges = computeFoldRanges(cachedFormattedText);
    cachedJsonPaths = computeJsonPaths(cachedFormattedText);
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
    sizeEl = document.createElement("span");
    sizeEl.id = "json-formtr-size";
    sizeEl.textContent = formatByteSize(new TextEncoder().encode(originalText).length);
    lineCountEl = document.createElement("span");
    lineCountEl.id = "json-formtr-line-count";
    left.append(sizeEl, lineCountEl);

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

    const depthGroup = document.createElement("div");
    depthGroup.className = "json-depth-group";

    const depthLabel = document.createElement("span");
    depthLabel.className = "json-depth-label";
    depthLabel.textContent = "Depth:";
    depthGroup.appendChild(depthLabel);

    depthButtons = [];
    const depthLevels = [1, 2, 3];
    for (const level of depthLevels) {
        const btn = document.createElement("button");
        btn.className = "json-toolbar-btn json-depth-btn";
        btn.type = "button";
        btn.textContent = String(level);
        btn.disabled = true;
        btn.addEventListener("click", () => collapseToDepth(level));
        depthGroup.appendChild(btn);
        depthButtons.push(btn);
    }
    const allBtn = document.createElement("button");
    allBtn.className = "json-toolbar-btn json-depth-btn";
    allBtn.type = "button";
    allBtn.textContent = "All";
    allBtn.disabled = true;
    allBtn.addEventListener("click", expandAllFolds);
    depthGroup.appendChild(allBtn);
    depthButtons.push(allBtn);

    sortButton = document.createElement("button");
    sortButton.className = "json-toolbar-btn";
    sortButton.type = "button";
    sortButton.textContent = "Sort A→Z";
    sortButton.addEventListener("click", toggleSortKeys);

    toggleButton = document.createElement("button");
    toggleButton.className = "json-toolbar-btn";
    toggleButton.type = "button";
    toggleButton.addEventListener("click", toggleRawFormatted);

    right.append(
        copyButton,
        downloadButton,
        collapseAllButton,
        depthGroup,
        sortButton,
        toggleButton
    );
    toolbar.append(left, right);

    updateToggleLabel();
    updateFoldButtonsState();
    return toolbar;
}

function updateSortLabel(): void {
    if (sortButton) {
        sortButton.textContent = sortedKeys ? "Unsort" : "Sort A→Z";
    }
}

function toggleSortKeys(): void {
    if (showingRaw) return;

    sortedKeys = !sortedKeys;
    collapsedFoldStarts.clear();
    hidePathBar();
    invalidateFormattedCache();
    ensureFormattedCache();

    const viewer = document.getElementById("json-format-viewer");
    if (!viewer || !cachedFormattedHTML) return;

    const formatted = createFormattedViewer(
        cachedFormattedHTML,
        cachedFormattedLineCount
    );
    viewer.replaceWith(formatted);
    updateLineCount(cachedFormattedLineCount);
    attachFoldingHandlers(formatted);
    attachPathHover(formatted);
    updateFoldButtonsState();
    updateSortLabel();
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
            attachPathHover(formatted);
            applyFoldsIfNeeded(formatted);
        }
        showingRaw = false;
        updateToggleLabel();
        updateFoldButtonsState();
        console.log("[JSON Formtr] Switched to formatted view");
    } else {
        // Switch to raw
        hidePathBar();
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

        // Expose parsed JSON on window.data for console access
        try {
            const parsed = JSON.parse(originalText);
            (window as unknown as Record<string, unknown>).data = parsed;
            console.log(
                "[JSON Formtr] Parsed JSON available as %cwindow.data",
                "font-weight: bold; color: #58a6ff"
            );
        } catch {
            // Not valid JSON, skip
        }

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
        attachPathHover(viewer);
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
        document.addEventListener("copy", handleFormattedViewerCopy, true);

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

        // Listen for OS color scheme changes (for auto theme)
        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", () => {
                if (currentSettings.theme === "auto") {
                    injectThemeCSS("auto", currentSettings.fontSize);
                }
            });
    });
}

function createPathBar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "json-path-bar";
    bar.addEventListener("click", () => {
        const path = bar.textContent;
        if (path) {
            navigator.clipboard
                .writeText(path)
                .then(() => showToast("Copied path"))
                .catch(() => {
                    // Ignore clipboard copy errors
                });
        }
    });
    bar.addEventListener("mouseleave", (e) => {
        const nextTarget = e.relatedTarget as Node | null;
        const viewer = getFormattedViewerElement();
        if (viewer && nextTarget && viewer.contains(nextTarget)) {
            return;
        }
        hidePathBar();
    });
    document.body.appendChild(bar);
    return bar;
}

function hidePathBar(): void {
    if (!pathBarEl) return;
    pathBarEl.classList.remove("visible");
    pathBarEl.textContent = "";
}

function attachPathHover(viewer: HTMLElement): void {
    if (!pathBarEl) {
        pathBarEl = createPathBar();
    }

    viewer.addEventListener("mouseover", (e) => {
        if (!pathBarEl || showingRaw) return;
        const target = e.target as HTMLElement;
        const line = target.closest(".json-line") as HTMLElement | null;
        if (!line) {
            hidePathBar();
            return;
        }
        const path = line.dataset.path;
        if (!path || path === "$") {
            hidePathBar();
            return;
        }
        pathBarEl.textContent = path;
        pathBarEl.classList.add("visible");
    });

    viewer.addEventListener("mouseleave", (e) => {
        const nextTarget = e.relatedTarget as Node | null;
        if (pathBarEl && nextTarget && pathBarEl.contains(nextTarget)) {
            return;
        }
        hidePathBar();
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
    const foldEnabled =
        !showingRaw && !!cachedFoldRanges && cachedFoldRanges.size > 0;
    if (collapseAllButton) collapseAllButton.disabled = !foldEnabled;
    for (const btn of depthButtons) {
        btn.disabled = !foldEnabled;
    }
    if (sortButton) sortButton.disabled = showingRaw;
}

function getFormattedViewerElement(): HTMLElement | null {
    const viewer = document.getElementById("json-format-viewer");
    if (!viewer) return null;
    if (viewer.tagName === "PRE" || viewer.classList.contains("raw"))
        return null;
    return viewer as HTMLElement;
}

function getSelectedLineIntervals(
    selection: Selection,
    viewer: HTMLElement
): LineInterval[] {
    return getSelectedLineIntervalsImpl(selection, viewer);
}

function getCollapsedSummaryTextForLine(
    viewer: HTMLElement,
    lineNo: number
): string | null {
    return getCollapsedSummaryTextForLineImpl(viewer, lineNo);
}

function expandIntervalsForCollapsedStarts(
    intervals: LineInterval[],
    foldRanges: ReadonlyMap<number, FoldRange>,
    collapsedStarts: ReadonlySet<number>
): LineInterval[] {
    return expandIntervalsForCollapsedStartsImpl(
        intervals,
        foldRanges,
        collapsedStarts
    );
}

function buildTextFromIntervals(
    formattedLines: string[],
    intervals: LineInterval[]
): string {
    return buildTextFromIntervalsImpl(formattedLines, intervals);
}

function resolveCopyTextForSelection(input: {
    showingRaw: boolean;
    intervals: LineInterval[];
    formattedText: string | null;
    foldRanges: ReadonlyMap<number, FoldRange> | null;
    collapsedStarts: ReadonlySet<number>;
}): string | null {
    if (
        input.showingRaw ||
        !input.formattedText ||
        input.intervals.length === 0
    ) {
        return null;
    }

    const formattedLines = input.formattedText.split("\n");
    const expandedIntervals =
        input.foldRanges && input.foldRanges.size > 0
            ? expandIntervalsForCollapsedStarts(
                  input.intervals,
                  input.foldRanges,
                  input.collapsedStarts
              )
            : input.intervals;
    const text = buildTextFromIntervals(formattedLines, expandedIntervals);
    return text.length > 0 ? text : null;
}

function handleFormattedViewerCopy(event: ClipboardEvent): void {
    const viewer = getFormattedViewerElement();
    if (!viewer || showingRaw) return;

    const selection = window.getSelection();
    if (!selection) return;

    const intervals = getSelectedLineIntervals(selection, viewer);
    if (intervals.length === 0) return;

    if (intervals.length === 1 && intervals[0].start === intervals[0].end) {
        const lineNo = intervals[0].start;
        if (!collapsedFoldStarts.has(lineNo)) return;

        const selectedText = selection.toString().trim();
        const collapsedSummaryText = getCollapsedSummaryTextForLine(
            viewer,
            lineNo
        )?.trim();

        if (!selectedText || selectedText !== collapsedSummaryText) {
            return;
        }
    }

    ensureFormattedCache();
    const copyText = resolveCopyTextForSelection({
        showingRaw,
        intervals,
        formattedText: cachedFormattedText,
        foldRanges: cachedFoldRanges,
        collapsedStarts: collapsedFoldStarts,
    });
    if (!copyText || !event.clipboardData) return;

    event.clipboardData.setData("text/plain", copyText);
    event.preventDefault();
}

function collapseAllFolds(): void {
    const viewer = getFormattedViewerElement();
    if (!viewer) return;
    ensureFormattedCache();
    if (!cachedFoldRanges) return;

    collapsedFoldStarts.clear();
    for (const startLine of cachedFoldRanges.keys()) {
        collapsedFoldStarts.add(startLine);
    }
    applyFoldsIfNeeded(viewer);
}

function collapseToDepth(maxDepth: number): void {
    const viewer = getFormattedViewerElement();
    if (!viewer) return;
    ensureFormattedCache();
    if (!cachedFoldRanges) return;

    collapsedFoldStarts.clear();
    for (const [startLine, range] of cachedFoldRanges) {
        if (range.depth >= maxDepth) {
            collapsedFoldStarts.add(startLine);
        }
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
        const btn = target?.closest?.(
            ".json-fold-toggle"
        ) as HTMLButtonElement | null;
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

    const prevHidden =
        viewer.__jsonFormtrHidden ?? new Array<boolean>(lineCount).fill(false);
    for (let i = 0; i < lineCount; i += 1) {
        if (prevHidden[i] === nextHidden[i]) continue;
        const el = lineEls[i];
        if (el) el.style.display = nextHidden[i] ? "none" : "";
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
            btn.setAttribute(
                "aria-label",
                isCollapsed ? "Expand section" : "Collapse section"
            );
        }
    }
}

function computeFoldRanges(formatted: string): Map<number, FoldRange> {
    const lines = formatted.split("\n");
    const ranges = new Map<number, FoldRange>();

    const stack: {
        open: FoldOpen;
        startLine: number;
        childCount: number;
        depth: number;
    }[] = [];
    let inString = false;
    let escape = false;
    let line = 1;
    let seenValueAtDepth = false;

    for (const ch of formatted) {
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
            // A string at the current depth means there's a value
            if (stack.length > 0 && !seenValueAtDepth) {
                stack[stack.length - 1].childCount += 1;
                seenValueAtDepth = true;
            }
            continue;
        }

        if (ch === "{" || ch === "[") {
            // An opening bracket at the current depth counts as a value
            if (stack.length > 0 && !seenValueAtDepth) {
                stack[stack.length - 1].childCount += 1;
                seenValueAtDepth = true;
            }
            stack.push({
                open: ch,
                startLine: line,
                childCount: 0,
                depth: stack.length,
            });
            seenValueAtDepth = false;
            continue;
        }

        if (ch === ",") {
            seenValueAtDepth = false;
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
                const childCount = start.childCount;

                // Restore seenValueAtDepth for the parent scope
                seenValueAtDepth = true;

                // Only fold multi-line ranges with at least one interior line.
                if (endLine < startLine + 2) break;
                if (ranges.has(startLine)) break;

                const startLineText = lines[startLine - 1] ?? "";
                const endLineText = lines[endLine - 1] ?? "";
                const hasTrailingComma = /[}\]]\s*,\s*$/.test(
                    endLineText.trimEnd()
                );
                const comma = hasTrailingComma ? "," : "";

                const openIdx = findStructuralCharIndex(startLineText, open);
                const prefix =
                    openIdx >= 0
                        ? startLineText.slice(0, openIdx + 1).trimEnd()
                        : startLineText.trimEnd();
                const summaryText = `${prefix} ... ${close}${comma}`;
                const label =
                    open === "{"
                        ? childCount === 1
                            ? "1 key"
                            : `${childCount} keys`
                        : childCount === 1
                          ? "1 item"
                          : `${childCount} items`;
                const countHTML = `<span class="json-fold-count">// ${label}</span>`;
                const baseHTML = highlightJsonSyntax(
                    escapeHtml(summaryText === "" ? "\u200B" : summaryText)
                );
                const collapsedLineContentHTML = `${baseHTML} ${countHTML}`;

                ranges.set(startLine, {
                    startLine,
                    endLine,
                    open,
                    close,
                    childCount,
                    depth: start.depth,
                    collapsedLineContentHTML,
                });
                break;
            }
        }

        // Non-string, non-structural characters (digits, true, false, null)
        // count as values at the current depth
        if (
            stack.length > 0 &&
            !seenValueAtDepth &&
            ch !== " " &&
            ch !== "\t" &&
            ch !== ":"
        ) {
            stack[stack.length - 1].childCount += 1;
            seenValueAtDepth = true;
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
