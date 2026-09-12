/**
 * Safari-compatible date utilities.
 *
 * Safari's ECMAScript Date implementation returns `Invalid Date` for space-separated
 * ISO-like timestamps (e.g. "2026-09-12 17:58:37") and non-standard timezone offsets.
 * These utilities normalize input formats to ensure clean execution across Safari,
 * WebKit, Chrome, and Firefox.
 */

/**
 * Parse any date representation into a valid Date object, or return null if invalid.
 */
export function parseSafeDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) || value.getFullYear() <= 1 ? null : value;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value) || value <= 0) return null;
    // Handle unix timestamp in seconds (e.g. 10 digits) vs milliseconds (13 digits)
    const ms = value < 1e11 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) || d.getFullYear() <= 1 ? null : d;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '0' || trimmed.startsWith('0001-01-01')) return null;

    // Fast path: standard ISO with 'T'
    if (trimmed.includes('T')) {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1) return d;
    }

    // Replace space between date and time with 'T' for Safari compatibility:
    // "2026-09-12 17:58:37" -> "2026-09-12T17:58:37"
    const normalized = trimmed.replace(
      /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/,
      '$1T$2'
    ).replace(/\//g, '-');

    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1) return d;

    // If pure number in string format
    const num = Number(trimmed);
    if (!Number.isNaN(num) && Number.isFinite(num) && num > 0) {
      const ms = num < 1e11 ? num * 1000 : num;
      const nd = new Date(ms);
      if (!Number.isNaN(nd.getTime()) && nd.getFullYear() > 1) return nd;
    }

    // Final fallback: try raw
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) || fallback.getFullYear() <= 1 ? null : fallback;
  }

  return null;
}

/**
 * Format date to a localized date-time string safely without throwing or showing Invalid Date.
 */
export function formatSafeDateTime(
  value: string | number | Date | null | undefined,
  fallback = 'Never',
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseSafeDate(value);
  if (!d) return fallback;
  try {
    return d.toLocaleString(undefined, options);
  } catch {
    return d.toISOString();
  }
}

/**
 * Format relative time (e.g. "3 minutes ago", "in 2 hours") safely.
 */
export function formatSafeRelativeTime(
  value: string | number | Date | null | undefined,
  locale = 'zh-CN',
  fallback = 'Never'
): string {
  const date = parseSafeDate(value);
  if (!date) return fallback;

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  try {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (absSeconds < 60) return formatter.format(diffSeconds, 'second');
    const diffMinutes = Math.round(diffSeconds / 60);
    if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
    const diffDays = Math.round(diffHours / 24);
    return formatter.format(diffDays, 'day');
  } catch {
    return date.toLocaleString();
  }
}
