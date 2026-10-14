declare global {
  interface Navigator {
    /** Safari's own flag for a page opened from the Home Screen. */
    readonly standalone?: boolean;
  }
}

/** True when running as an installed Home Screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}
