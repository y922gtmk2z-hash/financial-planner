// What if: applying an action to the Baseline carries into every scenario.
const { test, expect, loadSample, open } = require('./helpers');

const summaries = (page) => page.locator('.scenario-item').evaluateAll((items) => items.slice(1).map((li) => {
  const d = li.querySelector('.diff-list');
  return d ? d.textContent : li.textContent;
}));

test('apply “Use your ISA allowance” to the Baseline: other scenarios’ change summaries are unchanged', async ({ page }) => {
  await loadSample(page);
  await open(page, '#what-if');
  const before = await summaries(page);
  expect(before.length).toBe(2);
  await open(page, '#actions');
  const card = page.locator('.action', { has: page.getByRole('heading', { name: 'Use your ISA allowance' }) });
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#toast')).toContainText('Applied: Use your ISA allowance');
  await open(page, '#what-if');
  expect(await summaries(page)).toEqual(before);
  for (const s of await summaries(page)) expect(s).not.toContain('Regular saving');
});
