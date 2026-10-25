// Shared steps for the journey tests: opening the planner from file://, as a
// fresh visitor, and failing any test that logs a console error.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = require('@playwright/test');

const URL = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;

// Every test fails if the page logs an error or throws.
const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    base.expect(errors, 'console errors').toEqual([]);
  },
});

/*
 * A first visit: nothing saved. opts.started skips the front page (straight
 * to the quick start); opts.theme: 'light' or 'dark'.
 */
async function fresh(page, opts = {}) {
  await page.goto(URL);
  await page.evaluate((o) => {
    localStorage.clear();
    if (o.started) localStorage.setItem('ukfp.pref.started', '1');
    if (o.theme) localStorage.setItem('ukfp.pref.theme', o.theme);
  }, opts);
  await page.reload();
}

const PERSONA = { 'about.age': '38', 'income.grossSalary': '85000', 'outgoings.estimate': '3200', 'assumptions.retirementAge': '60', 'goals.retirementIncome': '3000' };
const box = (page, p) => page.locator(`.quick-start [data-path="${p}"] input[type="text"]`);

// The quick start, answered with `answers` (the persona by default).
async function quickStart(page, answers = PERSONA) {
  for (const [p, v] of Object.entries(answers)) await box(page, p).fill(v);
  await box(page, Object.keys(answers).pop()).blur();
}

// The fictional sample household, from the quick start page.
async function loadSample(page, opts = {}) {
  await fresh(page, { ...opts, started: true });
  await page.getByRole('button', { name: 'See a fictional example' }).click();
  await base.expect(page.locator('#sample-banner')).toBeVisible();
}

// Opens a screen by its link and waits for it to finish drawing.
async function open(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await base.expect(page.locator('main h1').first()).toBeVisible();
}

// Every screen once the planner is fully open (the sample household).
const SCREENS = ['#plan', '#plan/cash-flow', '#plan/own-and-owe', '#plan/pay-and-tax', '#plan/year-by-year', '#actions', '#what-if', '#progress', '#checkin', '#setup', '#assumptions', '#data', '#settings'];

module.exports = { test, expect: base.expect, URL, fresh, quickStart, loadSample, open, box, PERSONA, SCREENS };
