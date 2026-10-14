import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureTimeContext, formatUtcOffset, localDayKey } from './time.ts';

const nz = { timeZone: 'Pacific/Auckland', utcOffsetMin: 720 };

describe('localDayKey', () => {
  it('uses the local day, not the UTC day', () => {
    // 11:30 UTC on 1 June is 23:30 NZST on 1 June; 12:30 UTC is 00:30 on 2 June.
    expect(localDayKey(Date.parse('2026-06-01T11:30:00Z'), nz)).toBe('2026-06-01');
    expect(localDayKey(Date.parse('2026-06-01T12:30:00Z'), nz)).toBe('2026-06-02');
  });

  it('follows daylight saving changes within a zone', () => {
    // NZ daylight saving started at 02:00 NZST on 27 September 2026 (UTC+12 to UTC+13).
    // 11:30 UTC on 27 September is 00:30 NZDT on 28 September, but 23:30 on 27 September at +12.
    expect(localDayKey(Date.parse('2026-09-27T11:30:00Z'), nz)).toBe('2026-09-28');
  });

  it('gives the same instant different days in different zones', () => {
    const instant = Date.parse('2026-10-14T20:00:00Z');
    expect(localDayKey(instant, nz)).toBe('2026-10-15');
    expect(localDayKey(instant, { timeZone: 'Europe/London', utcOffsetMin: 60 })).toBe(
      '2026-10-14',
    );
  });

  it('falls back to the recorded offset when the zone is unknown', () => {
    const unknown = { timeZone: 'Mars/Olympus_Mons', utcOffsetMin: 780 };
    expect(localDayKey(Date.parse('2026-10-14T11:30:00Z'), unknown)).toBe('2026-10-15');
    expect(localDayKey(Date.parse('2026-10-14T10:30:00Z'), unknown)).toBe('2026-10-14');
  });
});

describe('captureTimeContext', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records the device zone and the offset east of UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland');
    expect(captureTimeContext(new Date('2026-10-14T00:00:00Z'))).toEqual({
      timeZone: 'Pacific/Auckland',
      utcOffsetMin: 780,
    });
    expect(captureTimeContext(new Date('2026-06-01T00:00:00Z')).utcOffsetMin).toBe(720);
  });

  it('records a zone west of UTC as a negative offset', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(captureTimeContext(new Date('2026-10-14T00:00:00Z'))).toEqual({
      timeZone: 'America/Los_Angeles',
      utcOffsetMin: -420,
    });
  });
});

describe('formatUtcOffset', () => {
  it.each([
    [0, 'UTC'],
    [780, 'UTC+13:00'],
    [-210, 'UTC-03:30'],
    [345, 'UTC+05:45'],
  ])('%i minutes is %s', (minutes, text) => {
    expect(formatUtcOffset(minutes)).toBe(text);
  });
});
