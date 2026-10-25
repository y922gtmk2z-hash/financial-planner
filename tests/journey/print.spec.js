// Plan on a page: one A4 page by default, at most two with every assumption.
const { test, expect, loadSample, open } = require('./helpers');

// Pages in a PDF: one "/Type /Page" object each.
const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) || []).length;

async function printPdf(page) {
  // window.print() would open a dialog: the summary is filled when it's called, then saved as a PDF.
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole('button', { name: 'Print or save as PDF' }).click();
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  return pdf;
}

test('plan on a page: one page by default, at most two with every assumption', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'PDF page size doesn’t depend on the window');
  await loadSample(page);
  // With commitments too, so the page holds the most it usually would.
  await open(page, '#actions');
  const m = page.locator('.action', { has: page.getByRole('heading', { name: 'Overpaying the mortgage beats cash savings' }) });
  await m.getByRole('button', { name: /^Apply £44/ }).click();
  await open(page, '#plan');
  const one = await printPdf(page);
  await expect(page.locator('.print-summary')).toContainText('Your plan on a page');
  await expect(page.locator('.print-summary')).toContainText('Your commitments');
  await expect(page.locator('.print-summary')).toContainText(/All (other )?assumptions are defaults set on/);
  expect(pages(one)).toBe(1);
  await page.getByLabel('Include every assumption (adds a page)').check();
  const two = await printPdf(page);
  await expect(page.locator('.print-summary')).toContainText('Every assumption');
  expect(pages(two)).toBeGreaterThan(1);
  expect(pages(two)).toBeLessThanOrEqual(2);
  // Labels have room: none of them wraps one word a line.
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96dpi
  const rows = await page.locator('.print-page-2 .print-table tbody th').evaluateAll((ths) => ths.map((th) => ({
    width: th.getBoundingClientRect().width,
    lines: Math.round(th.getBoundingClientRect().height / parseFloat(getComputedStyle(th).lineHeight)),
  })));
  expect(rows.length).toBeGreaterThan(20);
  rows.forEach((r) => { expect(r.width).toBeGreaterThan(200); expect(r.lines).toBeLessThanOrEqual(2); });
});
