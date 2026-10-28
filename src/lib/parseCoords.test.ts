import { describe, expect, it } from 'vitest';
import { formatCoords } from './coords.ts';
import { parseCoords } from './parseCoords.ts';

const auckland = { lat: -36.8484609, lon: 174.763336 };

describe('parseCoords', () => {
  const places = [
    auckland,
    { lat: 37.794721, lon: -122.401388 },
    { lat: -0.5, lon: -0.25 },
    { lat: 90, lon: -180 },
    { lat: 0, lon: 0 },
  ];

  it('reads back every form Hotshoe copies', () => {
    for (const format of ['decimal', 'dms'] as const) {
      for (const decimalMark of ['point', 'comma'] as const) {
        const style = { format, decimalMark };
        for (const place of places) {
          const text = formatCoords(place, style);
          const parsed = parseCoords(text);
          if (!parsed.ok) throw new Error(`${text}: ${parsed.problem}`);
          expect(formatCoords(parsed.coords, style)).toBe(text);
        }
      }
    }
  });

  it('reads decimal and DMS values', () => {
    expect(parseCoords('-36.848461, 174.763336')).toEqual({
      ok: true,
      coords: { lat: -36.848461, lon: 174.763336 },
    });
    expect(parseCoords(`36°50'54.5"S, 174°45'48.0"W`)).toEqual({
      ok: true,
      coords: { lat: expect.closeTo(-36.848472, 6), lon: expect.closeTo(-174.763333, 6) },
    });
  });

  it.each([
    '  -36.848461,174.763336 ',
    '-36.848461 174.763336',
    '-36,848461 174,763336',
    '-36,848461;174,763336',
    `36° 50′ 54.5″ S, 174° 45′ 48.0″ E`,
    `36°50'54.5"s 174°45'48.0"e`,
  ])('accepts loose spacing and marks in %s', (text) => {
    expect(parseCoords(text)).toEqual({
      ok: true,
      coords: { lat: expect.closeTo(-36.8485, 4), lon: expect.closeTo(174.7633, 4) },
    });
  });

  it('asks for something when the field is blank', () => {
    expect(parseCoords('  ')).toEqual({ ok: false, problem: expect.stringMatching(/^Paste/) });
  });

  it.each([
    'Auckland',
    '-36.848461',
    '-36.848461, 174.763336, 12',
    '1.2.3, 4',
    `174°45'48.0"E, 36°50'54.5"S`,
    `36°60'00.0"S, 174°45'48.0"E`,
    `36°50'60.0"S, 174°45'48.0"E`,
  ])('rejects %s as unreadable', (text) => {
    expect(parseCoords(text)).toEqual({ ok: false, problem: expect.stringMatching(/can't read/) });
  });

  it.each(['-90.5, 174', '45, 180.000001', `91°00'00.0"N, 0°00'00.0"E`])(
    'rejects %s as out of range',
    (text) => {
      expect(parseCoords(text)).toEqual({ ok: false, problem: expect.stringMatching(/between/) });
    },
  );
});
