import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({ geolocation: wharf, permissions: ['geolocation'] });

/**
 * Stands in for OpenFreeMap: a plain background style, and empty font files for the cluster
 * counts. The tests then need no network and don't load the real service.
 */
async function stubMapTiles(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    requested.push(route.request().url());
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith('/styles/')) {
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          version: 8,
          glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          sources: {},
          layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e7e5e4' } }],
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/x-protobuf',
      headers: { 'access-control-allow-origin': '*' },
      body: Buffer.alloc(0),
    });
  });
  return requested;
}

/** Content Security Policy violations, which don't always reach the console. */
async function watchPolicyViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, '__violations', { value: seen });
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

async function logEntry(page: Page, label: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  await page.getByLabel('Label').fill(label);
  await page.getByLabel('Label').press('Enter');
}

test('asks before loading the map, and loads its code only then', async ({ page }) => {
  const tileRequests = await stubMapTiles(page);
  const mapRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/MapView-|maplibre/.test(request.url())) mapRequests.push(request.url());
  });
  const violations = await watchPolicyViolations(page);
  await logEntry(page, 'Ferry terminal');

  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Entries' }).click();
  await nav.getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
  expect(mapRequests).toEqual([]);

  await nav.getByRole('link', { name: 'Map' }).click();
  await expect(page.getByText('1 entry to show')).toBeVisible();
  expect(mapRequests).toEqual([]);
  expect(tileRequests).toEqual([]);

  await page.getByRole('button', { name: 'Load map' }).click();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'on the map' })).toHaveText(
    '1 entry on the map',
  );
  expect(mapRequests.length).toBeGreaterThan(0);
  // OpenStreetMap credit must stay on the map.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeAttached();
  expect(tileRequests.length).toBeGreaterThan(0);
  expect(await violations()).toEqual([]);

  // Loaded once, it stays loaded while moving between tabs.
  await nav.getByRole('link', { name: 'Log' }).click();
  await nav.getByRole('link', { name: 'Map' }).click();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
});

test('remembers to load the map without asking', async ({ page }) => {
  await stubMapTiles(page);
  await logEntry(page, 'Ferry terminal');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Map' }).click();
  await page.getByLabel('Always load without asking').check();
  await page.getByRole('button', { name: 'Load map' }).click();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();

  await page.reload();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await expect(page.getByLabel('Load the map without asking')).toBeChecked();
});

test('shows an entry on the map from the Entries tab', async ({ page }) => {
  await stubMapTiles(page);
  await logEntry(page, 'Ferry terminal');

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Entries' })
    .click();
  await page.getByRole('button', { name: /Ferry terminal/ }).click();
  await page
    .getByRole('dialog', { name: 'Entry' })
    .getByRole('link', { name: 'Show on map' })
    .click();

  const card = page.getByRole('region', { name: 'Ferry terminal' });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Load map' }).click();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Copy coordinates' })).toBeVisible();
  await expect(page.getByText('±6 m')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toBeHidden();
});
