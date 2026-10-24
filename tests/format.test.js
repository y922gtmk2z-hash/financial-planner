// Money formatting shared by the screens (js/ui/dom.js), and the shared measure names.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// dom.js only touches the DOM when it builds elements, so its formatters load in Node.
globalThis.FP = globalThis.FP || {};
require('../js/ui/dom.js');
const { money, far, MEASURES, measure } = globalThis.FP.dom;

test('today’s figures stay to the pound', () => {
  assert.equal(money(3246.84), '£3,247');
  assert.equal(money(1234567), '£1,234,567');
  assert.equal(money(-0.2), '£0');
  assert.equal(money(NaN), '—');
});

test('figures ahead are shown to three significant figures', () => {
  const a = (n) => money(n, { approx: true });
  assert.equal(a(1200000), '£1.20m');
  assert.equal(a(1234567), '£1.23m');
  assert.equal(a(12345678), '£12.3m');
  assert.equal(a(999600), '£1.00m');
  assert.equal(a(999400), '£999k');
  assert.equal(a(292345), '£292k');
  assert.equal(a(45678), '£45.7k');
  assert.equal(a(9999), '£10.0k');
  assert.equal(a(3801), '£3,800');
  assert.equal(a(950), '£950');
  assert.equal(a(-292345), '-£292k');
  assert.equal(a(-0.2), '£0');
});

test('rounding starts five years ahead', () => {
  assert.equal(far(4), false);
  assert.equal(far(5), true);
});

test('each measure has one name, and the detail sheet uses the same ones', () => {
  assert.equal(MEASURES.savingsPensions.label, 'Savings and pensions');
  assert.equal(MEASURES.pensionPots.label, 'Pension pots');
  assert.equal(measure('savingsPensions', 60), 'Savings and pensions at 60');
  const row = { cash: 1, isa: 2, gia: 4, pension: 8, netWorth: 100 };
  assert.equal(MEASURES.savingsPensions.of(row), 15);
  assert.equal(MEASURES.pensionPots.of(row), 8);
  // The sheet's labels come from js/calc/outcomes.js, which can't load the UI map.
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/calc/outcomes.js'), 'utf8');
  ['savingsPensions', 'pensionPots', 'couldSpend'].forEach((id) => assert.ok(src.includes(`'${MEASURES[id].label}`), `${MEASURES[id].label} in outcomes.js`));
  assert.ok(!/Pension pot when|You could spend in retirement/.test(src));
});
