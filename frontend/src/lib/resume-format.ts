/**
 * Display formatting shared by every resume renderer (DIR-008, R-11/R-32/R-44).
 *
 * Empty optionals must disappear, not print `undefined – undefined` or an
 * em-dash with nothing around it. Dates are rendered as a single nowrap token so
 * they stay right-aligned without being clipped by an overflowing title.
 */

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
}

export function formatDateRange(
  start: unknown,
  end: unknown,
  current?: boolean | string | number
): string {
  const from = clean(start);
  const to = clean(end);
  const isCurrent = current === true || current === 'true' ||
    /^(present|current|now|ongoing)$/i.test(to);
  if (isCurrent) return from ? `${from} – Present` : 'Present';
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to;
}

/** True when the formatted range should be rendered at all. */
export function hasDateRange(start: unknown, end: unknown, current?: boolean | string | number): boolean {
  return formatDateRange(start, end, current).length > 0;
}
