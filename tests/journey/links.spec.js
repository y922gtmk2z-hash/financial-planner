// Old links, printing, and no console errors on any screen.
const fs = require('node:fs');
const { test, expect, loadSample, open, fresh, SCREENS } = require('./helpers');

test('old links land on the screens that replaced them', async ({ page }) => {
  await loadSample(page);
  const cases = [['#overview', '#plan', 'Your plan'], ['#now', '#plan', 'Your plan'], ['#future', '#plan/year-by-year', null], ['#scenarios', '#what-if', 'What if']];
  for (const [from, to, heading] of cases) {
    await open(page, '#settings');
    await page.evaluate((h) => { location.hash = h; }, from);
    await expect(page, from).toHaveURL(new RegExp(`${to.replace('/', '\\/')}$`));
    if (heading) await expect(page.locator('main h1').first(), from).toHaveText(heading);
  }
  await page.evaluate(() => { location.hash = '#now/month'; });
  await expect(page).toHaveURL(/#plan\/cash-flow$/);
  await expect(page.locator('dialog.sheet[open]')).toBeVisible();
});

test('the printed plan is at most 3 pages', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'printing doesn’t depend on the window width');
  await loadSample(page);
  await open(page, '#plan');
  await page.evaluate(() => window.onbeforeprint());
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
  fs.writeFileSync(info.outputPath('plan.pdf'), pdf);
  expect(pages).toBeGreaterThan(0);
  expect(pages).toBeLessThanOrEqual(3);
});

test('no console errors on any screen', async ({ page }) => {
  // The front page and quick start, then every screen with the sample household.
  await fresh(page);
  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.locator('.quick-start')).toBeVisible();
  await loadSample(page);
  for (const s of SCREENS) await open(page, s);
});
