import { describe, expect, it } from 'vitest';
import type { EntryId } from '../../db/schema.ts';
import {
  type CaptureEvent,
  type CaptureState,
  captureReducer,
  type Fix,
  fixFromPosition,
  fixProgress,
  initialCaptureState,
  looksImprecise,
} from './capture.ts';

function fix(accuracyM: number, fixAt = 1000): Fix {
  return { lat: -36.8, lon: 174.7, accuracyM, altitudeM: null, altitudeAccuracyM: null, fixAt };
}

function run(events: CaptureEvent[], from: CaptureState = initialCaptureState): CaptureState {
  return events.reduce(captureReducer, from);
}

const start: CaptureEvent = { type: 'start', at: 500, supported: true };
const position = (accuracyM: number): CaptureEvent => ({
  type: 'position',
  fix: fix(accuracyM),
  targetM: 20,
});

describe('captureReducer', () => {
  it('starts locating with the tap time', () => {
    expect(run([start])).toEqual({
      status: 'locating',
      loggedAt: 500,
      best: null,
      lastError: null,
    });
  });

  it('fails straight away when geolocation is not supported', () => {
    expect(run([{ type: 'start', at: 500, supported: false }])).toEqual({
      status: 'failed',
      reason: 'unsupported',
    });
  });

  it('keeps the most accurate fix while waiting', () => {
    const state = run([start, position(300), position(80), position(150)]);
    expect(state).toMatchObject({ status: 'locating', best: { accuracyM: 80 } });
  });

  it('saves as soon as a fix meets the target', () => {
    expect(run([start, position(300), position(12)])).toEqual({
      status: 'saving',
      loggedAt: 500,
      fix: fix(12),
    });
  });

  it('saves the best fix so far when accepted', () => {
    expect(run([start, position(300), position(45), { type: 'accept' }])).toMatchObject({
      status: 'saving',
      fix: { accuracyM: 45 },
    });
  });

  it('ignores accept before any fix arrives', () => {
    expect(run([start, { type: 'accept' }])).toMatchObject({ status: 'locating' });
  });

  it('saves the best fix at the time limit', () => {
    expect(run([start, position(70), { type: 'timeout' }])).toMatchObject({
      status: 'saving',
      fix: { accuracyM: 70 },
    });
  });

  it('fails at the time limit when no fix arrived', () => {
    expect(run([start, { type: 'timeout' }])).toEqual({ status: 'failed', reason: 'timeout' });
  });

  it('fails at once when permission is refused', () => {
    expect(run([start, position(300), { type: 'positionError', code: 1 }])).toEqual({
      status: 'failed',
      reason: 'denied',
    });
  });

  it('waits through brief errors and reports them only if no fix arrives', () => {
    const afterError = run([start, { type: 'positionError', code: 2 }]);
    expect(afterError).toMatchObject({ status: 'locating', lastError: 'unavailable' });
    expect(run([{ type: 'timeout' }], afterError)).toEqual({
      status: 'failed',
      reason: 'unavailable',
    });
    expect(run([position(10)], afterError)).toMatchObject({ status: 'saving' });
  });

  it('goes back to idle on cancel', () => {
    expect(run([start, position(300), { type: 'cancel' }])).toEqual({ status: 'idle' });
  });

  it('ignores a second start while busy', () => {
    const locating = run([start, position(300)]);
    expect(run([{ type: 'start', at: 900, supported: true }], locating)).toBe(locating);
  });

  it('records the saved entry, or why saving failed', () => {
    const saving = run([start, position(5)]);
    const entryId = 'entry-1' as EntryId;
    expect(run([{ type: 'saved', entryId }], saving)).toEqual({ status: 'saved', entryId });
    expect(run([{ type: 'saveFailed', reason: 'storage-full' }], saving)).toEqual({
      status: 'failed',
      reason: 'storage-full',
    });
  });

  it('can start again after saving or failing', () => {
    const saved: CaptureState = { status: 'saved', entryId: 'e' as EntryId };
    const failed: CaptureState = { status: 'failed', reason: 'timeout' };
    expect(run([start], saved)).toMatchObject({ status: 'locating' });
    expect(run([start], failed)).toMatchObject({ status: 'locating' });
  });

  it('ignores late positions after saving has begun', () => {
    const saving = run([start, position(5)]);
    expect(run([position(1)], saving)).toBe(saving);
  });
});

describe('fixFromPosition', () => {
  it('copies the fields an entry needs', () => {
    const position = {
      timestamp: 1234,
      coords: {
        latitude: -36.8,
        longitude: 174.7,
        accuracy: 9,
        altitude: 20,
        altitudeAccuracy: 5,
        heading: null,
        speed: null,
      },
    } as GeolocationPosition;
    expect(fixFromPosition(position)).toEqual({
      lat: -36.8,
      lon: 174.7,
      accuracyM: 9,
      altitudeM: 20,
      altitudeAccuracyM: 5,
      fixAt: 1234,
    });
  });
});

describe('looksImprecise', () => {
  it('flags kilometre-wide fixes from Precise Location being off', () => {
    expect(looksImprecise(1000)).toBe(false);
    expect(looksImprecise(3000)).toBe(true);
  });
});

describe('fixProgress', () => {
  it('is full at or inside the target and falls off as the fix widens', () => {
    expect(fixProgress(12, 20)).toBe(1);
    expect(fixProgress(20, 20)).toBe(1);
    expect(fixProgress(40, 20)).toBe(0.5);
    expect(fixProgress(2000, 20)).toBe(0.01);
  });
});
