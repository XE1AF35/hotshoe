# Hotshoe

Log where you took a photo, so you can geotag it later.

Hotshoe is a small web app for iPhone, installed to the Home Screen from Safari. Tap one button when you take a photo and it records your location, accuracy, and time. You can attach a quick reference photo from the iPhone camera, then copy the coordinates into any photo site or map app, or export a GPX track for digiKam, Lightroom, or darktable.

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

### Build options

- `BASE_PATH`: the path the app is served from. Defaults to `/hotshoe/` for GitHub Pages. Use `/` for a custom domain.
- `PWA_SELF_DESTROY=true`: builds a service worker that removes itself and its caches. Deploy this only to recover from a broken release, then deploy a normal build.

Everything Hotshoe stores in the browser (the database and caches) is named with a `hotshoe` prefix, so it never clashes with other apps served from the same address.

### Icons

The app icons in `public/` are made from `public/favicon.svg`. After changing the SVG, run `pnpm dlx @vite-pwa/assets-generator@2.0.0` and commit the results.

## Licence

[MIT](LICENSE)
