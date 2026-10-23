const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

test('parseValue accepts friendly formats and treats blanks as zero', () => {
  const money = FP.profile.fieldFor('assets.homeValue');
  assert.deepEqual(FP.profile.parseValue(money, '£250,000'), { ok: true, value: 250000 });
  assert.deepEqual(FP.profile.parseValue(money, ''), { ok: true, value: 0 });
  assert.equal(FP.profile.parseValue(money, '-5').ok, false);
  assert.equal(FP.profile.parseValue(money, 'abc').ok, false);
  assert.equal(FP.profile.parseValue(money, '1.2.3').ok, false);
});

test('parseValue enforces ranges and nullable fields', () => {
  const age = FP.profile.fieldFor('about.age');
  assert.deepEqual(FP.profile.parseValue(age, ''), { ok: true, value: null });
  assert.equal(FP.profile.parseValue(age, '200').ok, false);
  assert.equal(FP.profile.parseValue(age, '38.5').ok, false);
  const rate = FP.profile.DEBT_FIELDS.find((f) => f.key === 'rate');
  assert.deepEqual(FP.profile.parseValue(rate, ''), { ok: true, value: null });
  assert.deepEqual(FP.profile.parseValue(rate, '6.9%'), { ok: true, value: 6.9 });
});

test('normalise fills gaps, drops junk and keeps valid values', () => {
  const p = FP.profile.normalise({
    assets: { homeValue: '300000', isa: -1, hacked: 5 },
    assumptions: { inflation: 3, mortgageRate: 999 },
    debts: [{ name: 'Loan', balance: 1000, rate: 'x' }, null],
    extra: 'ignored',
  });
  assert.equal(p.assets.homeValue, 300000);
  assert.equal(p.assets.isa, 0);
  assert.equal(p.assets.hacked, undefined);
  assert.equal(p.extra, undefined);
  assert.equal(p.assumptions.inflation, 3);
  assert.equal(p.assumptions.mortgageRate, 4.5);
  assert.equal(p.debts.length, 1);
  assert.equal(p.debts[0].rate, null);
});

test('export then import round-trips the profile', () => {
  const p = FP.sample();
  const r = FP.store.importJson(FP.store.exportJson(p));
  assert.equal(r.ok, true);
  assert.deepEqual(r.profile, p);
  assert.equal(FP.store.importJson('{"profile":{}}').ok, false);
  assert.equal(FP.store.importJson('not json').ok, false);
});

test('every assumption has a default inside its range and a set-on date', () => {
  FP.assumptions.DEFS.forEach((d) => {
    assert.match(d.setOn, /^\d{4}-\d{2}-\d{2}$/, d.key);
    if (d.default != null) assert.ok(d.default >= d.min && d.default <= d.max, d.key);
  });
});

test('summary: net worth, equity and outgoings for the sample household', () => {
  const p = FP.sample();
  const s = FP.summary.compute(p, null);
  assert.equal(s.assets.total, 325000 + 14000 + 22000 + 3500 + 61000 + 6000);
  assert.equal(s.liabilities.total, 198000 + 7800 + 1200);
  assert.equal(s.netWorth, s.assets.total - s.liabilities.total);
  assert.equal(s.home.equity, 325000 - 198000);
  assert.equal(s.cashFlow.surplus, null);
  assert.equal(s.cashFlow.spendingMonthly, 1480);
  assert.equal(s.cashFlow.debtMonthly, 345);
  assert.ok(s.mortgage.monthsToClear < s.mortgage.monthsToClearWithoutOver);
  // credit card with a blank rate uses the default other-debt rate
  assert.equal(s.debts[1].rate, 7);
  const withPay = FP.summary.compute(p, 3000);
  assert.equal(withPay.cashFlow.surplus, 3000 - withPay.cashFlow.outgoings);
});

test('summary copes with an empty profile', () => {
  const s = FP.summary.compute(FP.profile.blank(), null);
  assert.equal(s.netWorth, 0);
  assert.equal(s.mortgage, null);
  assert.equal(s.home.ltvPct, null);
  assert.equal(s.cashFlow.outgoings, 0);
});

test('bonus month is stored and validated', () => {
  assert.equal(FP.profile.blank().income.bonusMonth, 'spread');
  assert.equal(FP.profile.normalise({ income: { bonusMonth: 'mar' } }).income.bonusMonth, 'mar');
  assert.equal(FP.profile.normalise({ income: { bonusMonth: 'smarch' } }).income.bonusMonth, 'spread');
});
