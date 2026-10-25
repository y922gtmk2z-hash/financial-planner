// Brief 15: commitments from Actions, the check-in question, Progress, help
// estimating outgoings, the front page example and GOV.UK links.
const { test, expect, fresh, quickStart, loadSample, open, box } = require('./helpers');

test('apply an action: it’s a commitment on Plan, the check-in asks about it, and Progress counts it kept', async ({ page }) => {
  await loadSample(page);
  await open(page, '#actions');
  const mortgage = page.locator('.action', { has: page.getByRole('heading', { name: 'Overpaying the mortgage beats cash savings' }) });
  await mortgage.locator('summary', { hasText: 'How to do it' }).click();
  await expect(mortgage.locator('.how-to')).toContainText('regular overpayment of £44 a month (£528 a year)');
  await mortgage.getByRole('button', { name: /^Apply £44/ }).click();
  await open(page, '#plan');
  const card = page.locator('#commitments');
  await expect(card).toContainText('Overpay your mortgage by £44 a month');
  await expect(card).toContainText('0 of 1 done');
  await open(page, '#checkin');
  const ask = page.locator('.checkin-commitments');
  await expect(ask).toContainText('Did you do these?');
  await ask.getByLabel(/Overpay your mortgage by £44 a month/).check();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page).toHaveURL(/#progress$/);
  await expect(page.locator('main')).toContainText('Commitments kept');
  await expect(page.locator('main')).toContainText('1 of 1');
});

test('the ISA action is due by 5 April, and Remind me defaults to it', async ({ page }) => {
  await loadSample(page);
  await open(page, '#actions');
  await page.locator('#actions-smaller > summary').click();
  const isa = page.locator('.action', { has: page.getByRole('heading', { name: 'Use your ISA allowance' }) });
  await expect(isa.locator('.action-due')).toContainText('5 Apr');
  await isa.locator('summary', { hasText: 'Remind me' }).click();
  await expect(isa.locator('input[type="date"]')).toHaveValue(/^\d{4}-04-05$/);
});

test('Help me estimate: four boxes add up and fill everything going out', async ({ page }) => {
  await fresh(page, { started: true });
  await quickStart(page);
  const help = page.locator('.quick-start .estimate-help');
  await help.locator('summary').click();
  await help.getByText('Add it up').click();
  for (const [label, v] of [['Housing', '1200'], ['Bills', '400'], ['Debt payments', '150'], ['Everything else', '900']]) {
    await help.getByLabel(label, { exact: true }).fill(v);
  }
  await expect(help).toContainText('Adds up to £2,650 a month.');
  await help.getByRole('button', { name: 'Use £2,650 a month' }).click();
  // Focused straight after, so shown without the thousands separator.
  await expect(box(page, 'outgoings.estimate')).toHaveValue(/^2,?650$/);
  await expect(box(page, 'outgoings.estimate')).toBeFocused();
});

test('the front page shows an example result, and honest effort', async ({ page }) => {
  await fresh(page);
  const ex = page.locator('.gate-example');
  await expect(ex).toContainText('Debt-free');
  await expect(ex).toContainText('Retirement');
  await expect(ex).toContainText('Top action');
  await expect(ex.locator('[aria-busy]')).toHaveCount(0);
  await expect(page.locator('.gate')).toContainText('About 20 to 30 minutes with your payslip and pension statements.');
});

test('GOV.UK links in Your figures open in a new tab, and your State Pension is in About you', async ({ page }) => {
  await loadSample(page);
  await open(page, '#setup/assumptions.statePension');
  await expect(page.locator('#about [data-path="assumptions.statePension"] input')).toBeVisible();
  for (const href of ['https://www.gov.uk/check-state-pension', 'https://www.gov.uk/find-pension-contact-details',
    'https://www.gov.uk/sign-in-to-manage-your-student-loan-balance', 'https://www.gov.uk/personal-tax-account']) {
    const a = page.locator(`#to-hand a[href="${href}"]`);
    await expect(a).toHaveCount(1);
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', /noopener/);
  }
  await open(page, '#assumptions');
  await expect(page.locator('main')).toContainText('Set in Your figures');
  // Your State Pension is listed as set in Your figures, not edited here.
  await expect(page.locator('main .in-setup').filter({ hasText: 'state pension' })).toHaveCount(1);
  await expect(page.locator('main [data-path="assumptions.statePension"]')).toHaveCount(0);
});
