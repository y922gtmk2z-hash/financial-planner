// Brief 16: Plan's retirement answers, life what-ifs, CSV downloads and
// quarterly check-in reminders, in the browser.
const fs = require('node:fs');
const { test, expect, loadSample, open } = require('./helpers');

test('the retirement card: the earliest you could retire, and how long money lasts across market paths', async ({ page }) => {
  await loadSample(page);
  await open(page, '#plan');
  const card = page.locator('.outcome', { has: page.locator('#oc-retirement') });
  await expect(card).toContainText('Earliest you could retire at your target spending');
  await expect(card.locator('.outcome-row', { hasText: 'Earliest' }).locator('strong')).toHaveText(/^\d{2}$/);
  // The market paths run after the page shows.
  await expect(card.locator('.outcome-row[data-done]')).toContainText(/Lasts to 95 in \d+ of 10/, { timeout: 30000 });
});

test('a life what-if: added from What if, then edited under Life events', async ({ page }) => {
  await loadSample(page);
  await open(page, '#what-if');
  await page.getByRole('button', { name: 'Go four days a week' }).click();
  await expect(page.locator('#toast')).toContainText('Four days a week from');
  await page.locator('#toast').getByRole('button', { name: 'Edit it' }).click();
  const events = page.locator('#future-events');
  await expect(events).toHaveAttribute('open', '');
  const item = events.locator('.event-item', { hasText: 'Four days a week' });
  await expect(item.getByLabel('Pay, as a share of now', { exact: true })).toHaveValue('80');
  await item.getByLabel('Pay, as a share of now', { exact: true }).fill('60');
  await expect(item.locator('.event-sum')).toContainText('60% of your pay');
  // Editing the new scenario, not the Baseline.
  await expect(page.locator('#scenario-bar select')).toHaveValue(await page.locator('#scenario-bar option', { hasText: 'Four days a week' }).getAttribute('value'));
});

test('Life events are linked from Your figures', async ({ page }) => {
  await loadSample(page);
  await open(page, '#setup/spending');
  await page.locator('.life-events-link a').click();
  await expect(page).toHaveURL(/#plan\/year-by-year\/events$/);
  await expect(page.locator('#future-events')).toHaveAttribute('open', '');
});

test('the year-by-year table downloads as CSV, in today’s money and future money', async ({ page }) => {
  await loadSample(page);
  await open(page, '#plan/year-by-year');
  await page.locator('#year-table > summary').click();
  for (const [label, money] of [['Download CSV (today’s money)', 'today’s money'], ['Download CSV (future money)', 'future money']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^year-by-year-.*\.csv$/);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    expect(text.split('\r\n')[0]).toContain(`Net worth £ (${money})`);
    expect(text.trim().split('\r\n').length).toBeGreaterThan(40);
  }
});

test('Progress: add quarterly check-ins to my calendar, a repeating reminder', async ({ page }) => {
  await loadSample(page);
  await open(page, '#progress');
  const card = page.locator('#checkin-calendar');
  await expect(card).toContainText('Add quarterly check-ins to my calendar');
  await expect(page.locator('main')).toContainText('Every three months, or when your pension statements arrive');
  let [dl] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Add to my calendar' }).click()]);
  expect(fs.readFileSync(await dl.path(), 'utf8')).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3');
  await card.getByText('Every month').click();
  [dl] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Add to my calendar' }).click()]);
  expect(fs.readFileSync(await dl.path(), 'utf8')).toMatch(/RRULE:FREQ=MONTHLY\r\n/);
});
