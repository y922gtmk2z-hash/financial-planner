// Brief 14: the quick start's rough pension figure, actions you can afford,
// and goal-seek limits, in the browser.
const { test, expect, fresh, quickStart, loadSample, open, box } = require('./helpers');

test('a rough figure for pensions and savings: in the first look, and flagged in Your figures until edited', async ({ page }) => {
  await fresh(page, { started: true });
  await quickStart(page);
  await box(page, 'assets.pension').fill('60000');
  await box(page, 'assets.pension').blur();
  await page.getByRole('button', { name: 'See my plan' }).click();
  await expect(page.locator('.outcome').filter({ hasText: 'Rough' })).toContainText('It includes your rough £60,000 in pensions and savings');
  await open(page, '#setup/assets');
  const field = page.locator('#assets [data-path="assets.pension"]');
  await expect(field.locator('.rough-note')).toBeVisible();
  await field.locator('input[type="text"]').fill('55000');
  await expect(field.locator('.rough-note')).toBeHidden();
});

test('the sample household: what it can afford, and smaller ideas folded away', async ({ page }) => {
  await loadSample(page);
  await open(page, '#actions');
  const mortgage = page.locator('.action', { has: page.getByRole('heading', { name: 'Overpaying the mortgage beats cash savings' }) });
  await expect(mortgage.getByRole('button', { name: /^Apply £44 a month \(what you can afford\)$/ })).toBeVisible();
  await expect(mortgage.locator('.action-figures')).toContainText('interest a year');
  const smaller = page.locator('#actions-smaller');
  await expect(smaller).toContainText('Smaller ideas');
  await expect(smaller).not.toHaveAttribute('open', '');
  await mortgage.getByRole('button', { name: /^Apply £44/ }).click();
  await expect(page.locator('#toast')).toContainText('Applied');
});

test('goal-seek: £4,600 a month by the pension alone is out of reach, offered only to try', async ({ page }) => {
  await loadSample(page);
  await open(page, '#what-if');
  const card = page.locator('.goal-seek');
  await card.getByLabel('How much a month, in today’s money').fill('4600');
  await card.getByRole('button', { name: 'Work it out' }).click();
  const out = card.locator('.goal-answer');
  await expect(out).toContainText('Not reachable by changing this alone. Closest:');
  await expect(out).not.toContainText('52.5%');
  await expect(out.getByRole('button', { name: 'Apply' })).toHaveCount(0);
  await expect(out.getByRole('button', { name: 'Try as a scenario' })).toBeVisible();
});
