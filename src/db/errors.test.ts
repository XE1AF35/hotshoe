import { describe, expect, it } from 'vitest';
import { InvalidInputError, normaliseText, StorageFullError, withStorageErrors } from './errors.ts';

function quotaError(): Error {
  const error = new Error('quota');
  error.name = 'QuotaExceededError';
  return error;
}

describe('withStorageErrors', () => {
  it('turns a quota error into StorageFullError', async () => {
    await expect(withStorageErrors(() => Promise.reject(quotaError()))).rejects.toBeInstanceOf(
      StorageFullError,
    );
  });

  it('finds a quota error wrapped by Dexie', async () => {
    const wrapped = Object.assign(new Error('aborted'), {
      name: 'AbortError',
      inner: quotaError(),
    });
    await expect(withStorageErrors(() => Promise.reject(wrapped))).rejects.toBeInstanceOf(
      StorageFullError,
    );
  });

  it('passes other errors and results through', async () => {
    const other = new Error('other');
    await expect(withStorageErrors(() => Promise.reject(other))).rejects.toBe(other);
    await expect(withStorageErrors(() => Promise.resolve(42))).resolves.toBe(42);
  });
});

describe('normaliseText', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['   ', null],
    ['  Frame 12 ', 'Frame 12'],
  ])('normalises %o to %o', (input, expected) => {
    expect(normaliseText(input, 10, 'Field')).toBe(expected);
  });

  it('rejects text longer than the limit after trimming', () => {
    expect(normaliseText(' 12345 ', 5, 'Field')).toBe('12345');
    expect(() => normaliseText('123456', 5, 'Field')).toThrow(InvalidInputError);
  });
});
