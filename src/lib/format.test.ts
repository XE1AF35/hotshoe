import { describe, expect, it } from 'vitest';
import { formatAccuracy, formatLoggedTime } from './format.ts';

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

  it('falls back to the recorded offset for an unknown zone', () => {
    const text = formatLoggedTime(instant, { timeZone: 'Mars/Base', utcOffsetMin: 345 });
    expect(text).toContain('6:50:09');
    expect(text).toContain('(UTC+5:45)');
  });
});
