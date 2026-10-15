import { useState } from 'react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../../lib/theme.ts';

const choices: readonly { value: ThemeChoice; label: string; hint?: string }[] = [
  { value: 'system', label: 'System', hint: "Follows your iPhone's setting" },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light or dark mode for this iPhone. It's kept apart from the database, and from backups. */
export function AppearanceSetting() {
  const [choice, setChoice] = useState(getThemeChoice);

  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 font-medium text-sm">Appearance</legend>
      {choices.map(({ value, label, hint }) => (
        <label
          key={value}
          className="flex min-h-12 items-center gap-3 rounded-xl px-3 has-checked:bg-raised"
        >
          <input
            type="radio"
            name="appearance"
            checked={choice === value}
            onChange={() => {
              setChoice(value);
              setThemeChoice(value);
            }}
            className="size-5 accent-accent-ink"
          />
          <span>
            {label}
            {hint && <span className="block text-muted text-sm">{hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
