import { describe, expect, it } from 'vitest';
import { offsetOnlyZone } from './time.ts';
import { loggedTimeFromWallClock, parseWallClock, wallClockValue } from './wallClock.ts';

const nzst = { timeZone: 'Pacific/Auckland', utcOffsetMin: 720 };
const nzdt = { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 };

describe('wallClockValue', () => {
  it("shows the instant in the entry's own zone, to the minute", () => {
    expect(wallClockValue(Date.parse('2026-10-14T01:00:59.900Z'), nzdt)).toBe('2026-10-14T14:00');
    expect(
      wallClockValue(Date.parse('2026-10-14T01:00:00Z'), {
        timeZone: 'Europe/London',
        utcOffsetMin: 60,
      }),
    ).toBe('2026-10-14T02:00');
  });

  it("uses the zone's own offset at the instant over the recorded one", () => {
    // The zone is what the list shows, so the field starts at the same time.
    expect(wallClockValue(Date.parse('2026-10-14T01:00:00Z'), nzst)).toBe('2026-10-14T14:00');
  });

  it('uses the recorded offset for an offset-only or unknown zone', () => {
    const at = Date.parse('2026-10-14T03:35:00Z');
    expect(wallClockValue(at, { timeZone: offsetOnlyZone, utcOffsetMin: 420 })).toBe(
      '2026-10-14T10:35',
    );
    expect(wallClockValue(at, { timeZone: 'Mars/Olympus_Mons', utcOffsetMin: -210 })).toBe(
      '2026-10-14T00:05',
    );
  });
});

describe('parseWallClock', () => {
  it.each(['', '2026-10-14', 'nonsense', '2026-02-31T10:00', '2026-10-14T24:30'])(
    '%j is no time',
    (text) => {
      expect(parseWallClock(text)).toBeNull();
    },
  );

  it('reads a field value as if it were UTC', () => {
    expect(parseWallClock('2026-10-14T10:35')).toBe(Date.parse('2026-10-14T10:35:00Z'));
    expect(parseWallClock('2026-10-14T10:35:12')).toBe(Date.parse('2026-10-14T10:35:12Z'));
  });
});

describe('loggedTimeFromWallClock', () => {
  it('gives nothing for an empty or invalid value', () => {
    expect(loggedTimeFromWallClock('', nzdt)).toBeNull();
    expect(loggedTimeFromWallClock('2026-02-31T10:00', nzdt)).toBeNull();
  });

  it('keeps the named zone and recomputes its offset across a clock change', () => {
    // An entry logged in June (NZST) moved to October (NZDT).
    expect(loggedTimeFromWallClock('2026-10-14T14:00', nzst)).toEqual({
      loggedAt: Date.parse('2026-10-14T01:00:00Z'),
      ...nzdt,
    });
    // And back again.
    expect(loggedTimeFromWallClock('2026-06-01T14:00', nzdt)).toEqual({
      loggedAt: Date.parse('2026-06-01T02:00:00Z'),
      ...nzst,
    });
  });

  it('moves a time the clocks skipped forward by the gap', () => {
    // NZ daylight saving began at 02:00 NZST on 27 September 2026, jumping to 03:00 NZDT.
    expect(loggedTimeFromWallClock('2026-09-27T02:30', nzst)).toEqual({
      loggedAt: Date.parse('2026-09-26T14:30:00Z'),
      ...nzdt,
    });
  });

  it('takes the earlier of a time the clocks showed twice', () => {
    // NZ daylight saving ended at 03:00 NZDT on 5 April 2026, going back to 02:00 NZST.
    expect(loggedTimeFromWallClock('2026-04-05T02:30', nzst)).toEqual({
      loggedAt: Date.parse('2026-04-04T13:30:00Z'),
      ...nzdt,
    });
    expect(loggedTimeFromWallClock('2026-04-05T03:30', nzdt)).toEqual({
      loggedAt: Date.parse('2026-04-04T15:30:00Z'),
      ...nzst,
    });
  });

  it('follows a zone west of UTC in the other hemisphere', () => {
    // US daylight saving ends at 02:00 PDT on 1 November 2026: 01:30 happens twice.
    const la = { timeZone: 'America/Los_Angeles', utcOffsetMin: -420 };
    expect(loggedTimeFromWallClock('2026-11-01T01:30', la)).toEqual({
      loggedAt: Date.parse('2026-11-01T08:30:00Z'),
      ...la,
    });
    expect(loggedTimeFromWallClock('2026-11-02T09:00', la)).toEqual({
      loggedAt: Date.parse('2026-11-02T17:00:00Z'),
      timeZone: 'America/Los_Angeles',
      utcOffsetMin: -480,
    });
  });

  it('keeps the offset of an offset-only zone', () => {
    const context = { timeZone: offsetOnlyZone, utcOffsetMin: 420 };
    expect(loggedTimeFromWallClock('2026-10-14T10:35', context)).toEqual({
      loggedAt: Date.parse('2026-10-14T03:35:00Z'),
      ...context,
    });
  });

  it('keeps the offset of a zone Intl does not know', () => {
    const context = { timeZone: 'Mars/Olympus_Mons', utcOffsetMin: 780 };
    expect(loggedTimeFromWallClock('2026-06-01T14:00', context)).toEqual({
      loggedAt: Date.parse('2026-06-01T01:00:00Z'),
      ...context,
    });
  });

  it('handles half-hour offsets', () => {
    const kolkata = { timeZone: 'Asia/Kolkata', utcOffsetMin: 330 };
    expect(loggedTimeFromWallClock('2026-10-14T10:35', kolkata)).toEqual({
      loggedAt: Date.parse('2026-10-14T05:05:00Z'),
      ...kolkata,
    });
    const newfoundland = { timeZone: offsetOnlyZone, utcOffsetMin: -210 };
    expect(loggedTimeFromWallClock('2026-10-14T10:35', newfoundland)).toEqual({
      loggedAt: Date.parse('2026-10-14T14:05:00Z'),
      ...newfoundland,
    });
  });

  it.each([
    ['a named zone', nzdt],
    ['an offset-only zone', { timeZone: offsetOnlyZone, utcOffsetMin: 330 }],
  ])('round trips an instant through the field to the minute in %s', (_, context) => {
    const at = Date.parse('2026-10-14T01:23:45.678Z');
    expect(loggedTimeFromWallClock(wallClockValue(at, context), context)).toEqual({
      loggedAt: Date.parse('2026-10-14T01:23:00Z'),
      ...context,
    });
  });
});
