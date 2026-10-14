import { useId } from 'react';
import { useDb } from '../../db/DbProvider.tsx';
import { useSettings } from '../../db/hooks.ts';
import {
  type PhotoQuality,
  type SettingKey,
  type Settings,
  setSetting,
} from '../../db/settings.ts';
import { type CoordFormat, formatCoords } from '../../lib/coords.ts';

const example = { lat: -36.848461, lon: 174.763336 };
const accuracyChoices = [10, 20, 30, 50, 100] as const;
const timeoutChoices = [30, 45, 60, 90, 120] as const;

export function SettingsSection() {
  const db = useDb();
  const settings = useSettings();
  const ids = { accuracy: useId(), timeout: useId() };
  if (!settings) return null;

  function save<K extends SettingKey>(key: K, value: Settings[K]) {
    void setSetting(db, key, value);
  }

  return (
    <section aria-labelledby="settings-heading" className="space-y-4">
      <h2 id="settings-heading" className="font-semibold text-lg">
        Settings
      </h2>

      <fieldset className="space-y-1">
        <legend className="mb-1 font-medium text-sm">Coordinate format for copying</legend>
        {(['decimal', 'dms'] as const satisfies readonly CoordFormat[]).map((format) => (
          <label
            key={format}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 has-checked:bg-raised"
          >
            <input
              type="radio"
              name="coord-format"
              checked={settings.coordFormat === format}
              onChange={() => save('coordFormat', format)}
              className="size-5 accent-accent-ink"
            />
            <span>
              {format === 'decimal' ? 'Decimal degrees' : 'Degrees, minutes, seconds'}
              <span className="block font-mono text-muted text-sm">
                {formatCoords(example, format)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1 font-medium text-sm">Photo size</legend>
        {(['standard', 'high'] as const satisfies readonly PhotoQuality[]).map((quality) => (
          <label
            key={quality}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 has-checked:bg-raised"
          >
            <input
              type="radio"
              name="photo-quality"
              checked={settings.photoQuality === quality}
              onChange={() => save('photoQuality', quality)}
              className="size-5 accent-accent-ink"
            />
            <span>
              {quality === 'standard' ? 'Standard' : 'High quality'}
              <span className="block text-muted text-sm">
                {quality === 'standard'
                  ? '1,600 px, about 300 KB a photo'
                  : '2,560 px, about 800 KB a photo'}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={ids.accuracy} className="block font-medium text-sm">
            Save when accurate to
          </label>
          <select
            id={ids.accuracy}
            value={settings.accuracyTargetM}
            onChange={(event) => save('accuracyTargetM', Number(event.target.value))}
            className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base"
          >
            {accuracyChoices.map((metres) => (
              <option key={metres} value={metres}>
                {metres} m
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.timeout} className="block font-medium text-sm">
            Give up after
          </label>
          <select
            id={ids.timeout}
            value={settings.fixTimeoutS}
            onChange={(event) => save('fixTimeoutS', Number(event.target.value))}
            className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base"
          >
            {timeoutChoices.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
