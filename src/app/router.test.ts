import { describe, expect, it } from 'vitest';
import { detailHref, parseDetail, parseTab, tabHref } from './router.ts';

describe('parseTab', () => {
  it.each([
    ['', 'log'],
    ['#', 'log'],
    ['#/', 'log'],
    ['#/entries', 'entries'],
    ['#entries', 'entries'],
    ['#/map/extra/parts', 'map'],
    ['#/more', 'more'],
    ['#/nonsense', 'log'],
    ['#/constructor', 'log'],
  ])('%s opens %s', (hash, tab) => {
    expect(parseTab(hash)).toBe(tab);
  });

  it('round-trips with tabHref', () => {
    expect(parseTab(tabHref('map'))).toBe('map');
  });
});

describe('parseDetail', () => {
  it.each([
    ['#/map', null],
    ['#/map/', null],
    ['#/map/abc-123', 'abc-123'],
    ['#/map/%E0', null],
  ])('%s has detail %s', (hash, detail) => {
    expect(parseDetail(hash)).toBe(detail);
  });

  it('round-trips with detailHref', () => {
    const href = detailHref('map', 'a/b c');
    expect(parseTab(href)).toBe('map');
    expect(parseDetail(href)).toBe('a/b c');
  });
});
