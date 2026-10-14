import { gymTimezone } from "@/config/env";

/**
 * Timezone-safe date helpers.
 *
 * All persistence happens in UTC (`timestamptz`); business "today" is always
 * resolved through the gym's configured IANA timezone using the built-in
 * Intl API (no extra dependency, DST correct).
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    cache.set(timeZone, f);
  }
  return f;
}

/** Millisecond offset of `timeZone` at the instant `date`. */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` of `date` inside `timeZone`. */
export function ymdInTz(date: Date, timeZone: string = gymTimezone): string {
  return formatter(timeZone).format(date);
}

/** Midnight (start of day) of `date`'s calendar day in `timeZone`, returned as a UTC instant. */
export function startOfDayInTz(date: Date, timeZone: string = gymTimezone): Date {
  const ymd = ymdInTz(date, timeZone);
  const naive = Date.parse(`${ymd}T00:00:00.000Z`);
  const offset = timeZoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - offset);
}

/** End of the calendar day in `timeZone` (exclusive instant). */
export function endOfDayInTz(date: Date, timeZone: string = gymTimezone): Date {
  const start = startOfDayInTz(date, timeZone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Parse a `YYYY-MM-DD` date-only string as UTC midnight (safe for date math). */
export function parseDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** Format a Date/string as `YYYY-MM-DD` for date inputs. */
export function toDateOnly(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Whole days from `from`'s day to `to`'s day in the gym timezone (positive when `to` is later). */
export function daysBetween(from: Date, to: Date, timeZone: string = gymTimezone): number {
  const a = parseDateOnly(ymdInTz(from, timeZone)).getTime();
  const b = parseDateOnly(ymdInTz(to, timeZone)).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Add calendar months keeping the day-of-month, clamped to the target month length. */
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** First day of the calendar month of `date` (UTC). */
export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, months: number): Date {
  return addMonthsClamped(date, months);
}

export function isSameYmd(a: Date, b: Date, timeZone: string = gymTimezone): boolean {
  return ymdInTz(a, timeZone) === ymdInTz(b, timeZone);
}

/** Month key `YYYY-MM` for grouping in gym timezone. */
export function monthKeyInTz(date: Date, timeZone: string = gymTimezone): string {
  return ymdInTz(date, timeZone).slice(0, 7);
}

/** Hour 0-23 of `date` in the gym timezone. */
export function hourInTz(date: Date, timeZone: string = gymTimezone): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
  });
  return Number(dtf.format(date)) % 24;
}

export { gymTimezone };
