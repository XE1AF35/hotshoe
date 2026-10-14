import { ScreenHeader } from '../../app/ScreenHeader.tsx';

export function MapScreen() {
  return (
    <section aria-labelledby="screen-title" className="space-y-4">
      <ScreenHeader title="Map" />
      <p className="text-muted">Your logged locations will appear on a map here.</p>
    </section>
  );
}
