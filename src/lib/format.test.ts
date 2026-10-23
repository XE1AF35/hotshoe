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
    [780, 'Wed, 14 Oct, 2:05:09 pm (UTC+13:00)'],
    [330, 'Wed, 14 Oct, 6:35:09 am (UTC+05:30)'],
    [0, 'Wed, 14 Oct, 1:05:09 am (UTC)'],
    [-210, 'Tue, 13 Oct, 9:35:09 pm (UTC-03:30)'],
  ])('falls back to the recorded offset %d for an unknown zone', (utcOffsetMin, text) => {
    expect(formatLoggedTime(instant, { timeZone: 'Mars/Base', utcOffsetMin })).toBe(text);
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
