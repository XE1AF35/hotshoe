import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { BackupSection } from '../transfer/BackupSection.tsx';
import { ExportSection } from '../transfer/ExportSection.tsx';
import { TripsSection } from '../trips/TripsSection.tsx';
import { SettingsSection } from './SettingsSection.tsx';
import { StorageSection } from './StorageSection.tsx';

export function MoreScreen() {
  return (
    <section aria-labelledby="screen-title" className="space-y-8">
      <ScreenHeader title="More" />
      <BackupSection />
      <ExportSection />
      <TripsSection />
      <SettingsSection />
      <StorageSection />
      <section aria-labelledby="about-heading" className="space-y-2 text-sm">
        <h2 id="about-heading" className="font-semibold text-lg">
          About
        </h2>
        <p className="text-muted">
          Hotshoe keeps everything on this iPhone, and there is no account. Your entries are never
          sent anywhere. The one exception is the map: to draw it, Hotshoe asks OpenFreeMap for the
          area you're looking at, so OpenFreeMap can see that area but not your entries.
        </p>
        <p className="text-muted">
          Map data © OpenStreetMap contributors, served by OpenFreeMap. Hotshoe is open source under
          the MIT licence.
        </p>
      </section>
    </section>
  );
}
