import { describe, expect, it } from 'vitest';
import {
  formatCoordParts,
  formatCoords,
  formatDecimal,
  formatDms,
  isValidLatLon,
} from './coords.ts';

const auckland = { lat: -36.8484609, lon: 174.763336 };

describe('formatDecimal', () => {
  it('puts latitude first and rounds to six decimal places', () => {
    expect(formatDecimal(auckland)).toBe('-36.848461, 174.763336');
  });

  it('never prints negative zero', () => {
    expect(formatDecimal({ lat: -0.0000001, lon: -0 })).toBe('0.000000, 0.000000');
  });
});

describe('formatDms', () => {
  it('formats southern and eastern hemispheres', () => {
    expect(formatDms(auckland)).toBe(`36°50'54.5"S, 174°45'48.0"E`);
  });

  it('formats northern and western hemispheres', () => {
    expect(formatDms({ lat: 37.794721, lon: -122.401388 })).toBe(`37°47'41.0"N, 122°24'05.0"W`);
  });

  it('carries rounded seconds into minutes and degrees', () => {
    expect(formatDms({ lat: 0.99999999, lon: 10.999999 })).toBe(`1°00'00.0"N, 11°00'00.0"E`);
  });

  it('treats values that round to zero as the positive hemisphere', () => {
    expect(formatDms({ lat: -0.000001, lon: 0 })).toBe(`0°00'00.0"N, 0°00'00.0"E`);
  });

  it('handles the poles and the antimeridian', () => {
    expect(formatDms({ lat: -90, lon: 180 })).toBe(`90°00'00.0"S, 180°00'00.0"E`);
  });
});

describe('formatCoords', () => {
  it('chooses the format', () => {
    expect(formatCoords(auckland, { format: 'decimal', decimalMark: 'point' })).toBe(
      formatDecimal(auckland),
    );
    expect(formatCoords(auckland, { format: 'dms', decimalMark: 'point' })).toBe(
      formatDms(auckland),
    );
  });

  it('uses a decimal comma, with a semicolon between the two numbers', () => {
    expect(formatCoords(auckland, { format: 'decimal', decimalMark: 'comma' })).toBe(
      '-36,848461; 174,763336',
    );
    expect(formatCoords(auckland, { format: 'dms', decimalMark: 'comma' })).toBe(
      `36°50'54,5"S; 174°45'48,0"E`,
    );
  });
});

describe('isValidLatLon', () => {
  it.each([
    [{ lat: 0, lon: 0 }, true],
    [{ lat: 90, lon: -180 }, true],
    [{ lat: 90.0001, lon: 0 }, false],
    [{ lat: 0, lon: -180.0001 }, false],
    [{ lat: Number.NaN, lon: 0 }, false],
    [{ lat: 0, lon: Number.POSITIVE_INFINITY }, false],
  ])('%o is %s', (coords, expected) => {
    expect(isValidLatLon(coords)).toBe(expected);
  });
});

describe('formatCoordParts', () => {
  it('splits the same text formatCoords joins', () => {
    for (const format of ['decimal', 'dms'] as const) {
      for (const decimalMark of ['point', 'comma'] as const) {
        const style = { format, decimalMark };
        const separator = decimalMark === 'comma' ? '; ' : ', ';
        expect(formatCoordParts(auckland, style).join(separator)).toBe(
          formatCoords(auckland, style),
        );
      }
    }
  });
});
