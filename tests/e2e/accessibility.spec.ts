import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({ geolocation: wharf, permissions: ['geolocation'] });

async function expectNoViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations, state).toEqual([]);
}

/** Anything wider than the screen, which would need sideways scrolling (WCAG 1.4.10). */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('main *, nav *')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.right > width + 1 || box.left < -1);
      })
      .filter((element) => !element.closest('.sr-only'))
      .map((element) => `${element.tagName.toLowerCase()}: ${element.textContent?.slice(0, 40)}`);
  });
}

async function logEntry(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Log' }).click();
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();
  await page.getByLabel('Label').fill(label);
  await page.getByLabel('Label').press('Enter');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`has no detectable violations in everyday states in ${colorScheme} mode`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('./');
    await logEntry(page, 'Ferry terminal');
    await expectNoViolations(page, 'log, after logging');

    // Hold the fix short of the target so the dial stays up.
    await context.setGeolocation({ ...wharf, accuracy: 80 });
    await page.getByRole('button', { name: 'Log location' }).click();
    await expect(page.getByRole('button', { name: 'Use this fix' })).toBeEnabled();
    await expectNoViolations(page, 'log, locating');
    await page.getByRole('button', { name: 'Cancel' }).click();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Entries' }).click();
    await page.getByRole('button', { name: /Ferry terminal/ }).click();
    await expect(page.getByRole('dialog', { name: 'Entry' })).toBeVisible();
    await expectNoViolations(page, 'entry sheet');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Select' }).click();
    await page.getByRole('checkbox', { name: /Ferry terminal/ }).check();
    await expectNoViolations(page, 'select mode');

    await nav.getByRole('link', { name: 'Map' }).click();
    await expect(page.getByRole('button', { name: 'Load map' })).toBeVisible();
    await expectNoViolations(page, 'map, before loading');

    await nav.getByRole('link', { name: 'More' }).click();
    await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
    await expectNoViolations(page, 'more');
  });
}

test('fits the screen without sideways scrolling at 200% text size', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await logEntry(page, 'A long label for the ferry terminal at the end of the wharf');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const problems: Record<string, string[]> = {};

  problems['log, after logging'] = await overflowingElements(page);
  await context.setGeolocation({ ...wharf, accuracy: 80 });
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('button', { name: 'Use this fix' })).toBeEnabled();
  problems['log, locating'] = await overflowingElements(page);
  await page.getByRole('button', { name: 'Cancel' }).click();

  for (const tab of ['Entries', 'Map', 'More']) {
    await nav.getByRole('link', { name: tab }).click();
    await expect(page.getByRole('heading', { level: 1, name: tab })).toBeVisible();
    problems[tab] = await overflowingElements(page);
  }
  await nav.getByRole('link', { name: 'Entries' }).click();
  await page.getByRole('button', { name: 'Select' }).click();
  problems['select mode'] = await overflowingElements(page);

  expect(problems).toEqual({
    'log, after logging': [],
    'log, locating': [],
    Entries: [],
    Map: [],
    More: [],
    'select mode': [],
  });
});
