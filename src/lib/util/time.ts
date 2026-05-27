/**
 * Time helpers. We deliberately keep this dependency-free and rely on
 * `Intl.DateTimeFormat` (built into Node 24 + browsers) for timezone math.
 */

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export type WeekdayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

const WEEKDAY_MAP: Record<string, WeekdayCode> = {
  Mon: 'MON',
  Tue: 'TUE',
  Wed: 'WED',
  Thu: 'THU',
  Fri: 'FRI',
  Sat: 'SAT',
  Sun: 'SUN',
};

export function localDayAndHour(
  instant: Date,
  timezone: string,
): { day: WeekdayCode; hour: number } {
  const dayFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  });
  const hourFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });
  const dayStr = dayFmt.format(instant);
  const hourStr = hourFmt.format(instant);
  const day = WEEKDAY_MAP[dayStr];
  if (!day) throw new Error(`Unrecognized weekday '${dayStr}' for timezone '${timezone}'`);
  // Some locales/options return "24" for midnight; coerce to 0.
  const hourNum = Number(hourStr) % 24;
  return { day, hour: hourNum };
}
