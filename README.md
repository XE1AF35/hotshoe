# Hotshoe

Log where you took a photo, so you can geotag it later.

Hotshoe is a small web app for iPhone, installed to the Home Screen from Safari. Tap one button when you take a photo and it records your location, accuracy, and time. You can attach a quick reference photo from the iPhone camera, then copy the coordinates into Flickr's location editor or export a GPX track for digiKam, Lightroom, or darktable.

Everything stays on your phone. There is no account, no server, and no tracking.

> **Status:** early development. Not ready to use yet.

## Development

Requirements: Node 22.12 or later (CI uses Node 24) and pnpm.

```sh
pnpm install
pnpm dev                # local dev server
pnpm check              # Biome lint and format check
pnpm typecheck          # TypeScript
pnpm test               # unit tests (Vitest)
pnpm build && pnpm size # production build and bundle size budget
pnpm test:e2e           # end-to-end tests in WebKit with an iPhone viewport
```

Playwright's WebKit build needs Ubuntu or Debian system libraries. On other Linux distributions, run `pnpm test:e2e:chromium` locally instead; CI always runs the WebKit suite.

## Licence

[MIT](LICENSE)
