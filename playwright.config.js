// Journey tests (tests/journey/*.spec.js): the planner in a real browser, at a
// phone width and a desktop width. Run with `npm run test:journey`. The site
// itself loads nothing new: Playwright and axe-core are for these tests only.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/journey',
  timeout: 90000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 }, hasTouch: false } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
