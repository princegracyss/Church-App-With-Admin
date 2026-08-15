/**
 * Date formatting utilities for Parish Connect.
 *
 * ROOT CAUSE of the "wrong date" bug:
 *   Supabase returns DATE columns (date_of_birth, paid_on, liturgy_date, etc.)
 *   as bare "YYYY-MM-DD" strings. Passing those directly to `new Date(str)` or
 *   `new Date(str).toLocaleDateString()` without a time component causes the JS
 *   engine to parse them as **UTC midnight**, which rolls the displayed day back
 *   by one on any device whose local timezone is UTC+ (e.g. India UTC+5:30).
 *
 * SOLUTION:
 *   Always append 'T00:00:00' (no Z) so the date is interpreted in LOCAL time.
 *   These helpers do that consistently so no screen needs to remember it.
 */

/**
 * Format a DATE string ("YYYY-MM-DD") or TIMESTAMPTZ string for display.
 * Returns a human-readable date like "14 Jul 2025" or "Monday, 14 July 2025".
 *
 * @param {string|null|undefined} iso  – value from Supabase
 * @param {'short'|'long'|'numeric'} monthFmt – month format (default 'short')
 * @param {boolean} includeWeekday
 */
export function fmtDate(iso, monthFmt = 'short', includeWeekday = false) {
  if (!iso) return '—';
  // If it looks like a pure date (YYYY-MM-DD), parse as local midnight.
  // Timestamps already carry timezone info so pass them through as-is.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(iso + 'T00:00:00')
    : new Date(iso);
  if (isNaN(d.getTime())) return iso; // fall back to raw string if unparseable
  return d.toLocaleDateString('en-IN', {
    ...(includeWeekday && { weekday: 'long' }),
    day: 'numeric',
    month: monthFmt,
    year: 'numeric',
  });
}

/**
 * Format a TIMESTAMPTZ string to a date+time string, e.g. "14 Jul 2025, 10:30 AM".
 */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Return just the day-of-month number from a DATE string (local time).
 * e.g. "2025-07-14" → 14
 */
export function fmtDay(iso) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getDate();
}

/**
 * Return the abbreviated month name (3 letters, uppercased) from a DATE string.
 * e.g. "2025-07-14" → "JUL"
 */
export function fmtMonthShort(iso) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
}
