import { describe, expect, it } from 'vitest';
import { formatAccuracy, formatDay, formatLoggedClock, formatLoggedTime } from './format.ts';
import type { DayKey } from './time.ts';

describe('formatAccuracy', () => {
  it.each([
    [7.6, '±8 m'],
    [120, '±120 m'],
    [999.4, '±999 m'],
    [1000, '±1.0 km'],
    [1450, '±1.4 km'],
  ])('%d metres reads %s', (metres, text) => {
    expect(formatAccuracy(metres)).toBe(text);
  });
});

describe('formatLoggedTime', () => {
  const instant = Date.parse('2026-10-14T01:05:09Z');

  it('shows the time where the entry was logged', () => {
    const text = formatLoggedTime(instant, { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 });
    expect(text).toContain('2:05:09');
    expect(text).toContain('14 Oct');
  });

  it.each([
    [780, '2:05:09', '(UTC+13:00)'],
    [345, '6:50:09', '(UTC+05:45)'],
    [0, '1:05:09', '(UTC)'],
  ])('falls back to the recorded offset %d for an unknown zone', (utcOffsetMin, clock, label) => {
    const text = formatLoggedTime(instant, { timeZone: 'Mars/Base', utcOffsetMin });
    expect(text).toContain(clock);
    expect(text).toContain(label);
  });
});

describe('formatLoggedClock', () => {
  it('shows only the local clock time', () => {
    const text = formatLoggedClock(Date.parse('2026-10-14T01:05:09Z'), {
      timeZone: 'Pacific/Auckland',
      utcOffsetMin: 780,
    });
    expect(text).toBe('2:05 pm');
  });
});

describe('formatDay', () => {
  it('spells out the day without shifting it', () => {
    expect(formatDay('2026-10-14' as DayKey)).toBe('Wednesday, 14 October 2026');
  });
});
