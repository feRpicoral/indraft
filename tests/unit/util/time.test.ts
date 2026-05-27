import { describe, it, expect } from 'vitest';
import { localDayAndHour } from '@/lib/util/time';

describe('localDayAndHour', () => {
  it('returns weekday + hour in the given timezone', () => {
    // 2026-05-25 14:00 UTC = 2026-05-25 10:00 EDT (Monday)
    const instant = new Date('2026-05-25T14:00:00Z');

    const { day, hour } = localDayAndHour(instant, 'America/New_York');

    expect(day).toBe('MON');
    expect(hour).toBe(10);
  });

  it('crosses the date boundary correctly', () => {
    // 2026-05-26 02:00 UTC = 2026-05-25 22:00 EDT (still Monday locally)
    const instant = new Date('2026-05-26T02:00:00Z');

    const { day, hour } = localDayAndHour(instant, 'America/New_York');

    expect(day).toBe('MON');
    expect(hour).toBe(22);
  });

  it('handles UTC', () => {
    const instant = new Date('2026-05-29T00:00:00Z'); // Friday 00:00 UTC

    const { day, hour } = localDayAndHour(instant, 'UTC');

    expect(day).toBe('FRI');
    expect(hour).toBe(0);
  });
});
