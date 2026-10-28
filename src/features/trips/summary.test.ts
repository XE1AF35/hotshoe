import { describe, expect, it } from 'vitest';
import type { DayKey } from '../../lib/time.ts';
import {
  formatDayRange,
  formatDistance,
  greatCircleM,
  type SummaryEntry,
  summariseTrip,
} from './summary.ts';

const auckland = { lat: -36.848461, lon: 174.763336 };
const wellington = { lat: -41.286461, lon: 174.776236 };

function entry(overrides: Partial<SummaryEntry> = {}): SummaryEntry {
  return {
    loggedAt: Date.parse('2026-10-14T01:00:00Z'),
    timeZone: 'Pacific/Auckland',
    utcOffsetMin: 780,
    ...auckland,
    accuracyM: 8,
    ...overrides,
  };
}

describe('summariseTrip', () => {
  it('summarises an empty trip', () => {
    expect(summariseTrip([], 0, 20)).toEqual({
      entries: 0,
      photos: 0,
      days: null,
      distanceM: null,
      impreciseFixes: 0,
      weakFixes: 0,
    });
  });

  it('gives one entry one day and no distance', () => {
    const summary = summariseTrip([entry()], 2, 20);
    expect(summary.entries).toBe(1);
    expect(summary.photos).toBe(2);
    expect(summary.days).toEqual({
      first: '2026-10-14',
      last: '2026-10-14',
      span: 1,
      withEntries: 1,
    });
    expect(summary.distanceM).toBeNull();
  });

  it('counts calendar days and the days with entries', () => {
    const summary = summariseTrip(
      [
        entry({ loggedAt: Date.parse('2026-10-03T01:00:00Z') }),
        entry({ loggedAt: Date.parse('2026-10-09T01:00:00Z') }),
        entry({ loggedAt: Date.parse('2026-10-05T01:00:00Z') }),
        entry({ loggedAt: Date.parse('2026-10-05T03:00:00Z') }),
      ],
      0,
      20,
    );
    expect(summary.days).toEqual({
      first: '2026-10-03',
      last: '2026-10-09',
      span: 7,
      withEntries: 3,
    });
  });

  it('uses the local day where each entry was logged', () => {
    // 11 pm in Auckland, then a flight east: 1 pm the same local day in Los Angeles.
    const summary = summariseTrip(
      [
        entry({ loggedAt: Date.parse('2026-10-14T10:00:00Z') }),
        entry({
          loggedAt: Date.parse('2026-10-14T20:00:00Z'),
          timeZone: 'America/Los_Angeles',
          utcOffsetMin: -420,
        }),
      ],
      0,
      20,
    );
    expect(summary.days).toMatchObject({ first: '2026-10-14', last: '2026-10-14', span: 1 });
  });

  it('counts days correctly over the start of daylight saving', () => {
    // NZ clocks went forward on 27 September 2026, so that day was 23 hours long.
    const summary = summariseTrip(
      [
        entry({ loggedAt: Date.parse('2026-09-26T11:30:00Z'), utcOffsetMin: 720 }),
        entry({ loggedAt: Date.parse('2026-09-28T10:30:00Z'), utcOffsetMin: 780 }),
      ],
      0,
      20,
    );
    expect(summary.days).toMatchObject({ first: '2026-09-26', last: '2026-09-28', span: 3 });
  });

  it('adds straight lines between entries in the order they were logged', () => {
    const summary = summariseTrip(
      [
        entry({ loggedAt: 3, lat: 2, lon: 0 }),
        entry({ loggedAt: 1, lat: 0, lon: 0 }),
        entry({ loggedAt: 2, lat: 1, lon: 0 }),
      ],
      0,
      20,
    );
    // Two degrees of latitude, not the four that the stored order would give.
    expect(summary.distanceM).toBeCloseTo(2 * 111_195.08, 0);
  });

  it('leaves fixes kilometres wide out of the distance', () => {
    const summary = summariseTrip(
      [
        entry({ loggedAt: 1, ...auckland }),
        entry({ loggedAt: 2, ...wellington, accuracyM: 3000 }),
        entry({ loggedAt: 3, ...auckland }),
      ],
      0,
      20,
    );
    expect(summary.distanceM).toBe(0);
    expect(summary.impreciseFixes).toBe(1);
  });

  it('counts fixes less accurate than the target as weak', () => {
    const summary = summariseTrip(
      [entry({ accuracyM: 20 }), entry({ accuracyM: 21 }), entry({ accuracyM: 3000 })],
      0,
      20,
    );
    expect(summary.weakFixes).toBe(2);
  });

  it('never counts unknown accuracy as weak or imprecise, and measures to it', () => {
    const summary = summariseTrip(
      [entry({ loggedAt: 1, ...auckland }), entry({ loggedAt: 2, ...auckland, accuracyM: null })],
      0,
      20,
    );
    expect(summary.weakFixes).toBe(0);
    expect(summary.impreciseFixes).toBe(0);
    expect(summary.distanceM).toBe(0);
  });
});

describe('greatCircleM', () => {
  it('measures Auckland to Wellington', () => {
    expect(greatCircleM(auckland, wellington) / 1000).toBeCloseTo(493.5, 0);
  });

  it('is zero between a point and itself', () => {
    expect(greatCircleM(auckland, auckland)).toBe(0);
  });
});

describe('formatDistance', () => {
  it.each([
    [4, 'Under 10 m'],
    [648, 'About 650 m'],
    [4_240, 'About 4.2 km'],
    [42_400, 'About 42 km'],
    [1_234_400, 'About 1,234 km'],
  ])('%d m is %s', (metres, text) => {
    expect(formatDistance(metres)).toBe(text);
  });
});

describe('formatDayRange', () => {
  const day = (key: string) => key as DayKey;

  it('shows one day once', () => {
    expect(formatDayRange(day('2026-10-14'), day('2026-10-14'))).toBe('Wed, 14 Oct 2026');
  });

  it('gives the year once when both days share it', () => {
    expect(formatDayRange(day('2026-10-03'), day('2026-10-09'))).toBe(
      'Sat, 3 Oct to Fri, 9 Oct 2026',
    );
  });

  it('gives both years when they differ', () => {
    expect(formatDayRange(day('2026-12-30'), day('2027-01-02'))).toBe(
      'Wed, 30 Dec 2026 to Sat, 2 Jan 2027',
    );
  });
});
