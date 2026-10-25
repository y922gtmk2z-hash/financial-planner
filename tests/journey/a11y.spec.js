// axe-core on every screen, light and dark: no serious or critical violations.
const { test, expect, fresh, loadSample, open, SCREENS } = require('./helpers');

// Only so axe can be added to the page for the test; the site's own policy is unchanged.
test.use({ bypassCSP: true });

async function axe(page, where) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const r = await page.evaluate(() => window.axe.run(document, { preload: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
  return bad;
}

for (const theme of ['light', 'dark']) {
  test(`every screen, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const bad = [];
    await fresh(page, { theme });
    bad.push(...await axe(page, 'front page'));
    await fresh(page, { theme, started: true });
    bad.push(...await axe(page, 'quick start'));
    await loadSample(page, { theme });
    for (const s of SCREENS) {
      await open(page, s);
      bad.push(...await axe(page, s));
    }
    expect(bad).toEqual([]);
  });
}
