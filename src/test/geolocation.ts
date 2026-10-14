import { afterEach } from 'vitest';

interface Watcher {
  readonly success: PositionCallback;
  readonly error: PositionErrorCallback | null | undefined;
}

/** A Geolocation the test drives by hand: emit positions or errors to the active watches. */
export class FakeGeolocation implements Geolocation {
  readonly watchers = new Map<number, Watcher>();
  private nextId = 1;

  watchPosition(success: PositionCallback, error?: PositionErrorCallback | null): number {
    const id = this.nextId++;
    this.watchers.set(id, { success, error });
    return id;
  }

  clearWatch(id: number): void {
    this.watchers.delete(id);
  }

  getCurrentPosition(): void {
    throw new Error('Hotshoe uses watchPosition');
  }

  emit(accuracy: number, lat = -36.848461, lon = 174.763336): void {
    const position = {
      timestamp: Date.now(),
      coords: {
        latitude: lat,
        longitude: lon,
        accuracy,
        altitude: 12,
        altitudeAccuracy: 4,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      toJSON: () => ({}),
    } satisfies GeolocationPosition;
    for (const watcher of [...this.watchers.values()]) watcher.success(position);
  }

  fail(code: 1 | 2 | 3): void {
    const error = {
      code,
      message: 'fake',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } satisfies GeolocationPositionError;
    for (const watcher of [...this.watchers.values()]) watcher.error?.(error);
  }
}

const original = Object.getOwnPropertyDescriptor(window.navigator, 'geolocation');

afterEach(() => {
  if (original) {
    Object.defineProperty(window.navigator, 'geolocation', original);
  } else {
    Reflect.deleteProperty(window.navigator, 'geolocation');
  }
});

/** Replaces navigator.geolocation for one test. */
export function installFakeGeolocation(): FakeGeolocation {
  const fake = new FakeGeolocation();
  Object.defineProperty(window.navigator, 'geolocation', { value: fake, configurable: true });
  return fake;
}
