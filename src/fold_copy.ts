export type FoldOpen = "{" | "[";
export type FoldClose = "}" | "]";
export interface FoldRange {
    startLine: number;
    endLine: number;
    open: FoldOpen;
    close: FoldClose;
    collapsedLineContentHTML: string;
}

export interface LineInterval {
    start: number;
    end: number;
}

function normalizeLineInterval(interval: LineInterval): LineInterval | null {
    if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end)) {
        return null;
    }
    const start = Math.floor(Math.min(interval.start, interval.end));
    const end = Math.floor(Math.max(interval.start, interval.end));
    if (start < 1 || end < 1) return null;
    return { start, end };
}

function mergeLineIntervals(intervals: LineInterval[]): LineInterval[] {
    const normalized = intervals
        .map(normalizeLineInterval)
        .filter((interval): interval is LineInterval => interval !== null)
        .sort((a, b) => a.start - b.start || a.end - b.end);

    if (normalized.length === 0) return [];

    const merged: LineInterval[] = [normalized[0]];
    for (let i = 1; i < normalized.length; i += 1) {
        const cur = normalized[i];
        const last = merged[merged.length - 1];
        if (cur.start <= last.end + 1) {
            if (cur.end > last.end) last.end = cur.end;
            continue;
        }
        merged.push({ start: cur.start, end: cur.end });
    }
    return merged;
}

export function getLineNoFromNode(node: Node | null): number | null {
    if (!node) return null;
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return null;
    const lineEl = element.closest<HTMLElement>(".json-line[data-line-no]");
    if (!lineEl) return null;
    const raw = lineEl.dataset.lineNo;
    if (!raw) return null;
    const lineNo = Number(raw);
    return Number.isFinite(lineNo) ? lineNo : null;
}

export function getSelectedLineIntervals(
    selection: Selection,
    viewer: HTMLElement
): LineInterval[] {
    if (selection.rangeCount === 0 || selection.isCollapsed) return [];

    const intervals: LineInterval[] = [];
    const lineEls = Array.from(
        viewer.querySelectorAll<HTMLElement>(".json-line[data-line-no]")
    );
    for (let i = 0; i < selection.rangeCount; i += 1) {
        const range = selection.getRangeAt(i);
        const startLine = getLineNoFromNode(range.startContainer);
        const endLine = getLineNoFromNode(range.endContainer);
        if (startLine !== null && endLine !== null) {
            intervals.push({
                start: Math.min(startLine, endLine),
                end: Math.max(startLine, endLine),
            });
            continue;
        }

        let intervalStart: number | null = null;
        let intervalEnd: number | null = null;

        for (const lineEl of lineEls) {
            const rawLineNo = lineEl.dataset.lineNo;
            if (!rawLineNo) continue;
            const lineNo = Number(rawLineNo);
            if (!Number.isFinite(lineNo)) continue;
            if (!range.intersectsNode(lineEl)) continue;

            if (intervalStart === null || lineNo < intervalStart) {
                intervalStart = lineNo;
            }
            if (intervalEnd === null || lineNo > intervalEnd) {
                intervalEnd = lineNo;
            }
        }

        if (intervalStart !== null && intervalEnd !== null) {
            intervals.push({ start: intervalStart, end: intervalEnd });
        }
    }

    return mergeLineIntervals(intervals);
}

export function expandIntervalsForCollapsedStarts(
    intervals: LineInterval[],
    foldRanges: ReadonlyMap<number, FoldRange>,
    collapsedStarts: ReadonlySet<number>
): LineInterval[] {
    const mergedIntervals = mergeLineIntervals(intervals);
    if (mergedIntervals.length === 0 || collapsedStarts.size === 0) {
        return mergedIntervals;
    }

    const collapsedSorted = Array.from(collapsedStarts)
        .filter((line) => Number.isFinite(line))
        .sort((a, b) => a - b);

    const expanded: LineInterval[] = [];
    for (const interval of mergedIntervals) {
        let end = interval.end;
        let changed = true;

        while (changed) {
            changed = false;
            for (const startLine of collapsedSorted) {
                if (startLine < interval.start || startLine > end) continue;
                const range = foldRanges.get(startLine);
                if (!range) continue;
                if (range.endLine > end) {
                    end = range.endLine;
                    changed = true;
                }
            }
        }

        expanded.push({ start: interval.start, end });
    }

    return mergeLineIntervals(expanded);
}

export function buildTextFromIntervals(
    formattedLines: string[],
    intervals: LineInterval[]
): string {
    if (formattedLines.length === 0 || intervals.length === 0) return "";
    const mergedIntervals = mergeLineIntervals(intervals);
    const chunks: string[] = [];

    for (const interval of mergedIntervals) {
        const start = Math.max(1, interval.start);
        const end = Math.min(formattedLines.length, interval.end);
        if (end < start) continue;
        chunks.push(formattedLines.slice(start - 1, end).join("\n"));
    }

    return chunks.join("\n");
}

export function resolveCopyTextForSelection(input: {
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
