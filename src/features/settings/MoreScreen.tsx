import { TripsSection } from '../trips/TripsSection.tsx';
import { SettingsSection } from './SettingsSection.tsx';

export function MoreScreen() {
  return (
    <section aria-labelledby="screen-title" className="space-y-8">
      <h1 id="screen-title" className="font-semibold text-2xl">
        More
      </h1>
      <TripsSection />
      <SettingsSection />
      <section aria-labelledby="about-heading" className="space-y-2 text-sm">
        <h2 id="about-heading" className="font-semibold text-lg">
          About
        </h2>
        <p className="text-muted">
          Hotshoe keeps everything on this iPhone. Nothing is sent anywhere, and there is no
          account.
        </p>
      </section>
    </section>
  );
}
