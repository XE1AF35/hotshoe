import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const wharf = { latitude: -36.840556, longitude: 174.766389, accuracy: 6 };

test.use({
  geolocation: wharf,
  permissions: ['geolocation'],
  timezoneId: 'Pacific/Auckland',
});

async function expectNoViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations, state).toEqual([]);
}

async function downloadText(page: Page): Promise<{ name: string; text: string }> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save or share export' }).click();
  const file = await download;
  return {
    name: file.suggestedFilename(),
    text: await readFile((await file.path()) ?? '', 'utf8'),
  };
}

function gpxTimes(gpx: string): number[] {
  return [...gpx.matchAll(/<trkpt[^>]*>.*?<time>([^<]+)<\/time>/g)].map((match) =>
    Date.parse(match[1] ?? ''),
  );
}

test("matches a trip's GPX to its camera clock", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
  await page.goto('./');
  await page.getByRole('button', { name: /Trip: None/ }).click();
  const picker = page.getByRole('dialog', { name: 'Trip for new entries' });
  await picker.getByLabel('New trip').fill('Waiheke');
  await picker.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Log location' }).click();
  await expect(page.getByRole('heading', { name: 'Logged' })).toBeVisible();

  // Measure: the camera reads 2 min 4 s ahead of Hotshoe's clock.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await page.getByRole('button', { name: /^Waiheke/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Trip' });
  await sheet.getByRole('button', { name: 'Show clock to photograph' }).click();
  await expect(sheet.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeVisible();
  await expectNoViolations(page, 'clock face');
  await sheet.getByRole('button', { name: "I've taken the photo" }).click();

  const hotshoe = sheet.getByRole('group', { name: "Hotshoe's clock, as it shows in the photo" });
  await hotshoe.getByLabel('Time with seconds').fill('14:03:27');
  const camera = sheet.getByRole('group', { name: "The camera's own time for that photo" });
  await camera.getByLabel('Time with seconds').fill('2:05:31 pm');
  await expect(
    sheet.getByText("Your camera's clock is 2 min 4 s ahead of this iPhone."),
  ).toBeVisible();
  await expectNoViolations(page, 'times form');
  await sheet.getByRole('button', { name: 'Save camera clock' }).click();
  await expect(
    sheet.getByText("Your camera's clock is 2 min 4 s ahead of this iPhone."),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // Export the trip as GPX, matched and plain.
  await page.getByLabel('Entries', { exact: true }).selectOption({ label: 'Waiheke (1)' });
  await expect(page.getByLabel("Match this trip's camera clock")).toBeChecked();
  await expect(page.getByLabel('Time zone you set in your photo software')).toHaveValue('780');

  const matched = await downloadText(page);
  expect(matched.name).toMatch(/^hotshoe-waiheke-\d{8}-camera-time\.gpx$/);
  expect(matched.text).toContain('set the time zone to UTC+13:00 when geotagging');

  await page.getByLabel("Match this trip's camera clock").uncheck();
  const plain = await downloadText(page);
  expect(plain.name).toMatch(/^hotshoe-waiheke-\d{8}\.gpx$/);

  const [matchedTime] = gpxTimes(matched.text);
  const [plainTime] = gpxTimes(plain.text);
  expect((matchedTime ?? 0) - (plainTime ?? 0)).toBe(124_000);

  // Photo software set to UTC instead: the camera's own reading, 13 hours further on.
  await page.getByLabel("Match this trip's camera clock").check();
  await page.getByLabel('Time zone you set in your photo software').selectOption('0');
  const utc = await downloadText(page);
  expect((gpxTimes(utc.text)[0] ?? 0) - (plainTime ?? 0)).toBe(13 * 3_600_000 + 124_000);
});
