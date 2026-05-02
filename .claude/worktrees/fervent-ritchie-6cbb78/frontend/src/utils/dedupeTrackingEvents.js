const normalize = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
};

const defaultKey = (event) => {
    const description = normalize(event?.description);
    const loc = event?.location;
    const locationText = typeof loc === 'string'
        ? loc
        : (loc?.formattedAddress || loc?.address || loc?.city || '');
    return `${description}|${normalize(locationText)}`;
};

const tsMs = (event) => {
    const t = event?.timestamp ? new Date(event.timestamp).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
};

/**
 * Collapse runs of adjacent same-key events into one entry.
 * Preserves real status transitions while eliminating noise from
 * carriers that re-emit the same checkpoint at near-identical times.
 *
 * Output entries get:
 *   - timestamp: latest occurrence
 *   - firstTimestamp: earliest occurrence (only set when occurrences > 1)
 *   - occurrences: count of merged duplicates
 *
 * Returned list is sorted ascending by timestamp; caller re-sorts as needed.
 */
export function dedupeTrackingEvents(events, getKey = defaultKey) {
    if (!Array.isArray(events) || events.length === 0) return [];

    const sorted = [...events].sort((a, b) => tsMs(a) - tsMs(b));
    const result = [];

    for (const event of sorted) {
        const last = result[result.length - 1];
        if (last && getKey(last) === getKey(event)) {
            const lastTs = tsMs(last);
            const curTs = tsMs(event);
            const latest = curTs >= lastTs ? event : last;
            const earliestTs = Math.min(lastTs, curTs);
            result[result.length - 1] = {
                ...latest,
                occurrences: (last.occurrences || 1) + 1,
                firstTimestamp: last.firstTimestamp || new Date(earliestTs).toISOString(),
            };
        } else {
            result.push({ ...event, occurrences: 1 });
        }
    }

    return result;
}

export default dedupeTrackingEvents;
