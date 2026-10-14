import type { FailReason } from './capture.ts';

const messages: Record<FailReason, { title: string; body: string }> = {
  unsupported: {
    title: "This browser can't share your location",
    body: 'Open Hotshoe in Safari on your iPhone, then add it to your Home Screen.',
  },
  denied: {
    title: 'Hotshoe needs permission to use your location',
    body: 'Location access is turned off for Hotshoe.',
  },
  unavailable: {
    title: "Couldn't find your location",
    body: 'Your iPhone has no GPS signal right now. Step outside or away from tall buildings, then try again.',
  },
  timeout: {
    title: 'Finding your location took too long',
    body: 'GPS can be slow indoors or among tall buildings. Try again, ideally with a clear view of the sky.',
  },
  'storage-full': {
    title: 'Your iPhone is out of space',
    body: "The location was found but couldn't be saved. Free up some space, then try again.",
  },
  'save-error': {
    title: "Couldn't save the location",
    body: 'Something went wrong while saving. Try again.',
  },
};

/** Explains why a capture failed and what to do next. */
export function CaptureProblem({ reason }: { readonly reason: FailReason }) {
  const { title, body } = messages[reason];
  return (
    <div role="alert" className="space-y-2 rounded-2xl bg-warning p-4 text-on-warning">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm">{body}</p>
      {reason === 'denied' && <PermissionHelp />}
    </div>
  );
}

function PermissionHelp() {
  return (
    <div className="space-y-2 text-sm">
      <p>To turn it back on:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Open the Settings app.</li>
        <li>Go to Privacy &amp; Security, then Location Services.</li>
        <li>Make sure Location Services is on.</li>
        <li>
          Tap Safari Websites, choose <strong>While Using the App</strong>, and turn on{' '}
          <strong>Precise Location</strong>.
        </li>
        <li>Come back to Hotshoe and try again.</li>
      </ol>
      <p>
        Still stuck? iOS sometimes refuses location to Home Screen apps even after access is
        allowed. Settings, General, Transfer or Reset iPhone, Reset, then Reset Location &amp;
        Privacy clears this. It also resets location permission for your other apps.
      </p>
    </div>
  );
}
