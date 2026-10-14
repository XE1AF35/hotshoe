import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { holdUpdates, updatesHeld, useHoldUpdates } from './updates.ts';

afterEach(() => {
  document.body.replaceChildren();
});

describe('updatesHeld', () => {
  it('is free when nothing is in progress', () => {
    expect(updatesHeld()).toBe(false);
  });

  it('holds until every hold is released, even if one is released twice', () => {
    const first = holdUpdates();
    const second = holdUpdates();
    first();
    first();
    expect(updatesHeld()).toBe(true);
    second();
    expect(updatesHeld()).toBe(false);
  });

  it('holds while a hook says so, and lets go on unmount', () => {
    const { rerender, unmount } = renderHook(({ active }) => useHoldUpdates(active), {
      initialProps: { active: true },
    });
    expect(updatesHeld()).toBe(true);
    rerender({ active: false });
    expect(updatesHeld()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(updatesHeld()).toBe(false);
  });

  it('holds while a sheet is open', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    expect(updatesHeld()).toBe(true);
  });

  it('holds while a text field has focus, but not a radio button', () => {
    const text = document.createElement('input');
    const radio = document.createElement('input');
    radio.type = 'radio';
    document.body.append(text, radio);
    text.focus();
    expect(updatesHeld()).toBe(true);
    radio.focus();
    expect(updatesHeld()).toBe(false);
  });
});
