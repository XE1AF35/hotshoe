import { describe, expect, it } from 'vitest';
import { fitWithin, longEdgeFor } from './image.ts';

describe('fitWithin', () => {
  it('scales a 48 MP landscape photo to the long edge', () => {
    expect(fitWithin(8064, 6048, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('scales portrait photos by their height', () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('keeps at least one pixel on a very thin image', () => {
    expect(fitWithin(10000, 2, 320)).toEqual({ width: 320, height: 1 });
  });

  it('keeps every output canvas far below the iOS 16.7 MP limit', () => {
    const { width, height } = fitWithin(8064, 6048, longEdgeFor.high);
    expect(width * height).toBeLessThan(16_777_216 / 3);
  });
});
