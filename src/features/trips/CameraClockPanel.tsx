import { useEffect, useId, useState } from 'react';
import { useDb } from '../../db/DbProvider.tsx';
import type { Trip } from '../../db/schema.ts';
import { setCameraClock } from '../../db/trips.ts';
import { describeCameraClock, measureCameraClock, type WallTime } from './cameraClock.ts';

type Step = 'summary' | 'clock' | 'enter';

/**
 * Measures a trip's camera clock: photograph Hotshoe's clock with the camera, then, whenever the
 * photo is to hand, enter both times. The two steps can be days apart.
 */
export function CameraClockPanel({ trip }: { readonly trip: Trip }) {
  const db = useDb();
  const [step, setStep] = useState<Step>('summary');

  return (
    <section aria-labelledby="camera-clock-heading" className="space-y-2">
      <h3 id="camera-clock-heading" className="font-medium text-sm">
        Camera clock
      </h3>
      {step === 'clock' && <ClockFace onDone={() => setStep('enter')} />}
      {step === 'enter' && <TimesForm trip={trip} onDone={() => setStep('summary')} />}
      {step === 'summary' && (
        <>
          <p className="text-muted text-sm">
            {trip.cameraClock
              ? describeCameraClock(trip.cameraClock)
              : "Not measured yet. Measuring it lets this trip's GPX line up with your camera's photos even if its clock is off."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('clock')}
              className="min-h-12 grow basis-56 rounded-xl border border-line px-4 font-medium"
            >
              Show clock to photograph
            </button>
            <button
              type="button"
              onClick={() => setStep('enter')}
              className="min-h-12 grow basis-56 rounded-xl border border-line px-4 font-medium"
            >
              Enter times from the photo
            </button>
          </div>
          {trip.cameraClock && (
            <button
              type="button"
              onClick={() => void setCameraClock(db, trip.id, null)}
              className="min-h-11 px-1 font-medium text-danger-ink text-sm"
            >
              Forget the camera clock
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** A large clock with seconds, to photograph with the camera. */
function ClockFace({ onDone }: { readonly onDone: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-3">
      {/* Not a live region: announcing every second would drown out everything else. */}
      <div className="rounded-2xl bg-ink p-4 text-center text-surface">
        <p className="text-sm">
          {now.toLocaleDateString('en-NZ', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>
        <p className="font-bold font-mono text-5xl tabular-nums">
          {now.toLocaleTimeString('en-GB', { hour12: false })}
        </p>
      </div>
      <p className="text-sm">
        Take a photo of this clock with your camera. When you have that photo in front of you, now
        or later, enter its times.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent"
      >
        I've taken the photo
      </button>
    </div>
  );
}

function TimesForm({ trip, onDone }: { readonly trip: Trip; readonly onDone: () => void }) {
  const db = useDb();
  const today = localDate(new Date());
  const [hotshoe, setHotshoe] = useState<WallTime>({ date: today, time: '' });
  const [camera, setCamera] = useState<WallTime>({ date: today, time: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const filledIn = hotshoe.time.trim() !== '' && camera.time.trim() !== '';
  const preview = filledIn ? measureCameraClock(hotshoe, camera, Date.now()) : null;

  async function save() {
    const result = measureCameraClock(hotshoe, camera, Date.now());
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    try {
      await setCameraClock(db, trip.id, result.clock);
      onDone();
    } catch {
      setProblem("Couldn't save the camera clock. Try again.");
    }
  }

  return (
    <div className="space-y-4">
      <WallTimeFields
        legend="Hotshoe's clock, as it shows in the photo"
        value={hotshoe}
        onChange={setHotshoe}
      />
      <WallTimeFields
        legend="The camera's own time for that photo"
        hint="Shown in the photo's details on the camera, or in your photo software."
        value={camera}
        onChange={setCamera}
      />
      <p aria-live="polite" className="text-sm">
        {preview?.ok ? describeCameraClock(preview.clock) : ''}
      </p>
      {problem && (
        <p role="alert" className="text-danger-ink text-sm">
          {problem}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onDone}
          className="min-h-12 rounded-xl border border-line font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 rounded-xl bg-accent px-2 font-semibold text-on-accent"
        >
          Save camera clock
        </button>
      </div>
    </div>
  );
}

/**
 * A date picker and a typed time. iOS time pickers can't show seconds, which matter here, so the
 * time is typed.
 */
function WallTimeFields({
  legend,
  hint,
  value,
  onChange,
}: {
  readonly legend: string;
  readonly hint?: string;
  readonly value: WallTime;
  readonly onChange: (value: WallTime) => void;
}) {
  const ids = { date: useId(), time: useId(), hint: useId() };
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium text-sm">{legend}</legend>
      {hint && (
        <p id={ids.hint} className="text-muted text-sm">
          {hint}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 grow basis-36 space-y-1">
          <label htmlFor={ids.date} className="block text-muted text-sm">
            Date
          </label>
          <input
            id={ids.date}
            type="date"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
            className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 text-base"
          />
        </div>
        <div className="min-w-0 grow basis-32 space-y-1">
          <label htmlFor={ids.time} className="block text-muted text-sm">
            Time with seconds
          </label>
          <input
            id={ids.time}
            value={value.time}
            placeholder="14:03:27"
            autoComplete="off"
            inputMode="text"
            enterKeyHint="done"
            aria-describedby={hint ? ids.hint : undefined}
            onChange={(event) => onChange({ ...value, time: event.target.value })}
            className="min-h-12 w-full rounded-xl border border-line bg-raised px-3 font-mono text-base tabular-nums"
          />
        </div>
      </div>
    </fieldset>
  );
}

/** `YYYY-MM-DD` on this device, as a date input wants it. */
function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
