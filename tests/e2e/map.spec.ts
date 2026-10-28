import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { addExif } from '../../src/test/exif.ts';
import { cameraJpeg } from './helpers.ts';

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

/** Requests for the map's code. MapLibre itself lands in the chunk both maps share. */
function watchMapCode(page: Page): string[] {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (/\/(MapView|PinMap|mapConfig)-|maplibre/.test(request.url())) {
      requested.push(request.url());
    }
  });
  return requested;
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
  const mapRequests = watchMapCode(page);
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

test('places a photo with no location by dropping and dragging a pin', async ({ page }) => {
  await stubMapTiles(page);
  const mapRequests = watchMapCode(page);
  const violations = await watchPolicyViolations(page);
  await page.goto('./');
  const jpeg = addExif(await cameraJpeg(page), {
    dateTimeOriginal: '2026:10:14 10:35:12',
    offsetTimeOriginal: '+13:00',
  });

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From photos' }).click();
  await (await chooser).setFiles({
    name: 'IMG_0001.JPG',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg),
  });
  const sheet = page.getByRole('dialog', { name: 'From photos' });
  await expect(sheet.getByRole('checkbox', { name: /IMG_0001\.JPG.*No location/ })).toBeVisible();
  expect(mapRequests).toEqual([]);

  await sheet.getByRole('button', { name: 'Place on map for IMG_0001.JPG' }).click();
  const pinSheet = page.getByRole('dialog', { name: 'Place on map' });
  await pinSheet.getByRole('button', { name: 'Load map' }).click();
  const canvas = pinSheet.locator('canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  expect(mapRequests.length).toBeGreaterThan(0);

  const status = pinSheet.getByRole('status');
  await expect(status).toHaveText('No pin yet');
  await canvas.click();
  await expect(status).toHaveText(/^Pin at /);
  const dropped = (await status.textContent()) ?? '';
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  const pin = pinSheet.getByLabel('Pin');
  const box = await pin.boundingBox();
  if (!box) throw new Error('the pin has no position');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(status).not.toHaveText(dropped);
  const moved = ((await status.textContent()) ?? '').replace('Pin at ', '');

  await pinSheet.getByRole('button', { name: 'Place here' }).click();
  await expect(pinSheet).toBeHidden();
  await expect(sheet.getByRole('button', { name: 'Place on map for IMG_0001.JPG' })).toBeFocused();
  await expect(
    sheet.getByRole('checkbox', { name: /IMG_0001\.JPG.*Placed by hand/ }),
  ).toBeVisible();
  await expect(sheet.getByLabel('Coordinates for IMG_0001.JPG')).toHaveValue(moved);
  await sheet.getByRole('button', { name: 'Add 1 entry' }).click();
  await expect(page.getByText('Added 1 entry.')).toBeVisible();
  expect(await violations()).toEqual([]);
});

/** Logs two entries on different Days: today's, and one moved back to 1 January 2026. */
async function logTwoDays(page: Page) {
  await logEntry(page, 'Ferry terminal');
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Entries' })
    .click();
  // Labelled here with its new time, so nothing waits on the Log screen's label to save.
  await page.getByRole('button', { name: /Untitled/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Entry' });
  await sheet.getByLabel('Label').fill('Ferry building');
  await sheet.getByLabel('Date and time').fill('2026-01-01T09:00');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
}

const newYear = 'Thursday, 1 January 2026';

test("opens a Day's map after asking, and a pin opens its entry", async ({ page }) => {
  await stubMapTiles(page);
  const violations = await watchPolicyViolations(page);
  await logTwoDays(page);

  const newYearHeading = page.getByRole('button', { name: new RegExp(newYear) });
  await newYearHeading.click();
  await expect(newYearHeading).toHaveAttribute('aria-expanded', 'true');
  const box = page.getByRole('region', { name: `Map of ${newYear}` });
  await box.getByRole('button', { name: 'Load map' }).click();
  const canvas = box.locator('canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  await expect(box.getByRole('status')).toHaveText('1 entry on the map');
  await expect(box.locator('.maplibregl-ctrl-attrib')).toBeAttached();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // The Day's only pin sits in the middle of its map once the map has drawn it.
  const sheet = page.getByRole('dialog', { name: 'Entry' });
  await expect(async () => {
    if (!(await sheet.isVisible())) await canvas.click({ timeout: 1000 });
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(sheet.getByLabel('Label')).toHaveValue('Ferry building');
  await page.keyboard.press('Escape');

  // Another Day replaces it, and loads without asking again.
  const todayHeading = page.locator('main h2 button').first();
  await todayHeading.click();
  await expect(newYearHeading).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
  await expect(page.getByRole('region', { name: /^Map of/ })).toHaveCount(1);
  await expect(page.getByRole('region', { name: /^Map of/ }).getByRole('status')).toHaveText(
    '1 entry on the map',
  );
  expect(await violations()).toEqual([]);
});

test('a plain mouse wheel over a Day map shows the two-finger hint and leaves it alone', async ({
  page,
}) => {
  await stubMapTiles(page);
  await logEntry(page, 'Ferry terminal');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Entries' })
    .click();
  await page.locator('main h2 button').first().click();
  const box = page.getByRole('region', { name: /^Map of/ });
  await box.getByRole('button', { name: 'Load map' }).click();
  const canvas = box.locator('canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();

  // The hint shows for only a moment, so watch for it rather than look.
  const hinted = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const hint = document.querySelector('.maplibregl-cooperative-gesture-screen');
        if (!hint) throw new Error('the map has no cooperative-gestures hint');
        new MutationObserver(() => {
          if (hint.classList.contains('maplibregl-show')) resolve();
        }).observe(hint, { attributes: true, attributeFilter: ['class'] });
      }),
  );
  // Leave the hint out of the pictures, which compare only what the map draws. It still gets its
  // class when shown. The Content Security Policy blocks style sheets, so this styles it directly.
  await box
    .locator('.maplibregl-cooperative-gesture-screen')
    .evaluate((hint: HTMLElement) => hint.style.setProperty('visibility', 'hidden'));
  const picture = () => canvas.screenshot();
  let before = await picture();
  await expect(async () => {
    const now = await picture();
    const settled = now.equals(before);
    before = now;
    expect(settled).toBe(true);
  }).toPass();

  // Mobile WebKit has no mouse wheel, so send the wheel event itself, away from the pin.
  const size = await canvas.boundingBox();
  if (!size) throw new Error('the map has no size');
  const wheel = (keys: { ctrlKey?: boolean; metaKey?: boolean }) =>
    canvas.dispatchEvent('wheel', {
      deltaY: -400,
      deltaMode: 0,
      clientX: size.x + size.width / 4,
      clientY: size.y + size.height / 4,
      bubbles: true,
      cancelable: true,
      ...keys,
    });
  await wheel({});
  await hinted;
  await page.waitForTimeout(500);
  expect((await picture()).equals(before)).toBe(true);

  // The same wheel with the modifier does zoom, which shows the pictures would catch it.
  await wheel({ ctrlKey: true, metaKey: true });
  await expect.poll(async () => (await picture()).equals(before)).toBe(false);
});
