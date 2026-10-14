import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

test('opens on Log and moves between tabs without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');

  await expect(page.getByRole('heading', { level: 1, name: 'Log' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Entries', 'Map', 'More', 'Log']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('tells a browser-tab visitor to open the app from the Home Screen', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('complementary', { name: 'Install Hotshoe' })).toContainText(
    'Add to Home Screen',
  );
});

test('is installable: manifest, icons, and service worker are served', async ({
  page,
  request,
}) => {
  await page.goto('./');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifest = await (await request.get(new URL(manifestHref ?? '', page.url()).href)).json();
  expect(manifest).toMatchObject({ name: 'Hotshoe', display: 'standalone', lang: 'en-NZ' });

  for (const icon of manifest.icons as Array<{ src: string }>) {
    const response = await request.get(new URL(icon.src, page.url()).href);
    expect(response.ok(), icon.src).toBe(true);
  }
  expect((await request.get('apple-touch-icon-180x180.png')).ok()).toBe(true);
  expect((await request.get('sw.js')).ok()).toBe(true);
});

test('keeps working offline after the first visit', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first visit installs the worker; a reload puts the page under its control.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Log' })).toBeVisible();
  await context.setOffline(false);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`has no detectable WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    for (const tab of ['log', 'entries', 'map', 'more']) {
      await page.goto(`./#/${tab}`);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, tab).toEqual([]);
    }
  });
}

test('links to the source code on GitHub from the More tab', async ({ page }) => {
  await page.goto('./#/more');
  const link = page.getByRole('link', { name: /Hotshoe on GitHub/ });
  await expect(link).toHaveAttribute('href', 'https://github.com/XE1AF35/hotshoe');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
