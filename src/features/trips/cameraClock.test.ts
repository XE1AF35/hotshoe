import { describe, expect, it } from 'vitest';
import {
  type DeviceZone,
  describeCameraClock,
  formatDuration,
  measureCameraClock,
  parseClockTime,
  toCameraTime,
} from './cameraClock.ts';

/** New Zealand daylight time, UTC+13, whatever zone the tests run in. */
const nzdt: DeviceZone = (wallMs) => ({ instantMs: wallMs - 780 * 60_000, utcOffsetMin: 780 });
const now = 1_000;

describe('parseClockTime', () => {
  it.each([
    ['14:03:27', 50_607],
    ['14.03.27', 50_607],
    ['14 03 27', 50_607],
    ['140327', 50_607],
    ['14:03', 50_580],
    ['2:03:27 pm', 50_607],
    ['2:03:27PM', 50_607],
    ['12:00:00 am', 0],
    ['12:30 p.m.', 45_000],
    ['  09:05:00  ', 32_700],
  ])('reads %j', (text, seconds) => {
    expect(parseClockTime(text)).toBe(seconds);
  });

  it.each(['', '24:00:00', '14:60', '13:00 pm', 'noon', '1:2:3', '14:03:27:00'])(
    'rejects %j',
    (text) => {
      expect(parseClockTime(text)).toBeNull();
    },
  );
});

describe('measureCameraClock', () => {
  it('finds a camera running a little fast in the same time zone', () => {
    const result = measureCameraClock(
      { date: '2026-10-14', time: '14:03:27' },
      { date: '2026-10-14', time: '14:05:31' },
      now,
      nzdt,
    );
    expect(result).toEqual({
      ok: true,
      clock: { offsetS: 13 * 3600 + 124, phoneUtcOffsetMin: 780, measuredAt: now },
    });
    if (result.ok) {
      expect(describeCameraClock(result.clock)).toBe(
        "Your camera's clock is 2 min 4 s ahead of this iPhone.",
      );
    }
  });

  it('finds a camera left on UTC, across midnight', () => {
    const result = measureCameraClock(
      { date: '2026-10-15', time: '09:00:00' },
      { date: '2026-10-14', time: '20:00:10' },
      now,
      nzdt,
    );
    expect(result.ok && result.clock.offsetS).toBe(10);
    if (result.ok) {
      expect(describeCameraClock(result.clock)).toBe(
        "Your camera's clock is 12 h 59 min 50 s behind this iPhone. It may be set to a different time zone, which is fine.",
      );
    }
  });

  it('explains what is missing or implausible', () => {
    const camera = { date: '2026-10-14', time: '14:05:31' };
    expect(measureCameraClock({ date: '', time: '14:03:27' }, camera, now, nzdt)).toEqual({
      ok: false,
      problem: "Enter the date and time on Hotshoe's clock.",
    });
    expect(measureCameraClock({ date: '2026-02-31', time: '14:03:27' }, camera, now, nzdt).ok).toBe(
      false,
    );
    expect(
      measureCameraClock({ date: '2026-10-14', time: '14:03' }, { ...camera, time: 'soon' }, now),
    ).toEqual({ ok: false, problem: "Enter the camera's date and time." });
    expect(
      measureCameraClock(
        { date: '2026-10-14', time: '14:03:27' },
        { date: '2024-10-14', time: '14:03:27' },
        now,
        nzdt,
      ),
    ).toEqual({ ok: false, problem: 'Those are more than 30 days apart. Check the dates.' });
  });
});

describe('describeCameraClock', () => {
  it('says when the clocks agree', () => {
    expect(describeCameraClock({ offsetS: 46_800, phoneUtcOffsetMin: 780, measuredAt: 0 })).toBe(
      "Your camera's clock matches this iPhone to the second.",
    );
  });
});

describe('toCameraTime', () => {
  it('shifts a moment by the offset', () => {
    expect(toCameraTime(1_000_000, { offsetS: -30, phoneUtcOffsetMin: 0, measuredAt: 0 })).toBe(
      970_000,
    );
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [59, '59 s'],
    [3600, '1 h'],
    [90_061, '1 day 1 h 1 min 1 s'],
  ])('%i s is %j', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});
