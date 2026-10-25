// The quick start: the persona reaching a verdict, retyping money boxes, and sense checks.
const { test, expect, fresh, quickStart, box, PERSONA } = require('./helpers');

const MONEY = ['income.grossSalary', 'outgoings.estimate', 'goals.retirementIncome'];
const NEW = { 'income.grossSalary': ['92000', '92,000'], 'outgoings.estimate': ['2800', '2,800'], 'goals.retirementIncome': ['2500', '2,500'] };

test.beforeEach(async ({ page }) => { await fresh(page, { started: true }); });

test('the quick-start persona reaches a verdict', async ({ page }) => {
  await quickStart(page);
  await page.getByRole('button', { name: 'See my plan' }).click();
  await expect(page).toHaveURL(/#plan$/);
  const verdict = page.locator('#oc-retirement ~ .verdict, .outcome .verdict').filter({ hasText: 'On course for about' });
  await expect(verdict).toContainText('by 60');
  await expect(verdict).toContainText('You’d need about');
  await expect(page.locator('.plan-check')).toHaveCount(0);
});

// Moves focus with Tab (or Shift+Tab) until it reaches `target`, as you would.
async function tabTo(page, target, key) {
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press(key);
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`${key} never reached the box`);
}

test('Tab into each money box and type: the new figure replaces the old one', async ({ page }) => {
  await quickStart(page);
  for (const p of MONEY) {
    const input = box(page, p);
    await expect(input).toHaveValue(Number(PERSONA[p]).toLocaleString('en-GB'));
    await page.locator('.quick-start [data-path="about.age"] input').focus();
    await tabTo(page, input, 'Tab');
    await page.keyboard.type(NEW[p][0]);
    await input.blur();
    await expect(input, `${p} after Tab`).toHaveValue(NEW[p][1]);
  }
});

test('Shift+Tab into each money box and type: the new figure replaces the old one', async ({ page }) => {
  await quickStart(page);
  for (const p of MONEY) {
    const input = box(page, p);
    await page.getByRole('button', { name: 'See my plan' }).focus();
    await tabTo(page, input, 'Shift+Tab');
    await page.keyboard.type(PERSONA[p]);
    await input.blur();
    await expect(input, `${p} after Shift+Tab`).toHaveValue(Number(PERSONA[p]).toLocaleString('en-GB'));
  }
});

test('click keeps the caret by the same digit, and select-all then type replaces', async ({ page }) => {
  await quickStart(page);
  for (const p of MONEY) {
    const input = box(page, p);
    await page.locator('.quick-start [data-path="about.age"] input').focus();
    // Clicking past the end of the figure puts the caret after its last digit.
    const b = await input.boundingBox();
    await input.click({ position: { x: b.width - 4, y: b.height / 2 } });
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue(PERSONA[p].slice(0, -1));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(NEW[p][0]);
    await input.blur();
    await expect(input, `${p} after select-all`).toHaveValue(NEW[p][1]);
  }
});

test('£40,000 a month in retirement shows the yearly check, and Plan a warning line above the verdict', async ({ page }) => {
  await quickStart(page, { ...PERSONA, 'goals.retirementIncome': '40000' });
  const field = page.locator('.quick-start [data-path="goals.retirementIncome"]');
  await expect(field.locator('.sense-check')).toHaveText(/That’s £480,000 a year\. Did you mean £40,000 a year \(£3,333 a month\)\?/);
  await expect(field.locator('.field-error')).toBeHidden();
  await page.getByRole('button', { name: 'See my plan' }).click();
  const line = page.locator('.plan-check');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('what you’d like to spend in retirement (£40,000 a month)');
  const above = await line.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('.verdict')) & Node.DOCUMENT_POSITION_FOLLOWING));
  expect(above, 'the warning line is above the verdict').toBe(true);
});

test('impossible figures are errors that stop you going on', async ({ page }) => {
  await quickStart(page, { ...PERSONA, 'goals.retirementIncome': '150000', 'outgoings.estimate': '250000' });
  for (const [p, limit] of [['goals.retirementIncome', '£100,000'], ['outgoings.estimate', '£200,000']]) {
    const field = page.locator(`.quick-start [data-path="${p}"]`);
    await expect(field.locator('.field-error')).toHaveText(`More than ${limit} a month can’t be right. Check the figure: is it a yearly amount?`);
    await expect(field.locator('input')).toHaveAttribute('aria-invalid', 'true');
  }
  await page.getByRole('button', { name: 'See my plan' }).click();
  await expect(page.locator('#toast')).toHaveText('Fix the highlighted box first.');
  await expect(page.locator('.quick-start')).toBeVisible();
});
