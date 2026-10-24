// Edge cases: blanks, zeros and unusual inputs across the engines.
const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('tax config is internally consistent', () => {
  const cfg = FP.taxConfig;
  Object.values(cfg.bands).forEach((bands) => {
    for (let i = 1; i < bands.length; i += 1) {
      assert.ok(bands[i].rate > bands[i - 1].rate, 'rates rise band by band');
      if (bands[i].upTo != null) assert.ok(bands[i].upTo > bands[i - 1].upTo, 'limits rise band by band');
    }
    assert.equal(bands[bands.length - 1].upTo, null, 'top band is open-ended');
  });
  assert.ok(cfg.nationalInsurance.upperEarningsLimit > cfg.nationalInsurance.primaryThreshold);
  assert.ok(cfg.yearEnd > cfg.yearStart);
  // The UK higher-rate threshold in salary terms is £50,270
  assert.equal(cfg.personalAllowance + cfg.bands.rUK[0].upTo, 50270);
});

test('parsing: odd inputs are rejected or treated as blank, never NaN', () => {
  const money = FP.profile.fieldFor('assets.homeValue');
  ['1e5', '12abc', '--5', '1,2,3.4.5', 'Infinity'].forEach((t) => assert.equal(FP.profile.parseValue(money, t).ok, false, t));
  assert.deepEqual(FP.profile.parseValue(money, '£'), { ok: true, value: 0 });
  assert.deepEqual(FP.profile.parseValue(money, '.5'), { ok: true, value: 0.5 });
  assert.deepEqual(FP.profile.parseValue(money, ' 1 000 '), { ok: true, value: 1000 });
  assert.equal(FP.profile.parseValue(money, '2000000000').ok, false);
  const choice = FP.profile.assumptionField('taxThresholds');
  assert.equal(FP.profile.parseValue(choice, 'inflation').ok, true);
  assert.equal(FP.profile.parseValue(choice, 'sometimes').ok, false);
});

test('summary warns about overpayments above the limit and debts that never shrink', () => {
  const p = FP.profile.blank();
  p.assets.homeValue = 200000;
  p.mortgage = { balance: 100000, remainingTermYears: 20, monthlyOverpayment: 1000 };
  p.debts = [{ id: 'd', name: 'Card', balance: 5000, rate: 24, monthlyPayment: 50 }];
  const s = FP.summary.compute(p, 5000);
  assert.ok(s.warnings.some((w) => /more than 10% of the balance/.test(w.text)));
  assert.ok(s.warnings.some((w) => /Card: the monthly payment doesn.t cover the interest/.test(w.text)));
  assert.equal(s.home.ltvPct, 50);
});

test('summary: mortgage with no term asks for one; a payment with no balance still goes out', () => {
  const p = FP.profile.blank();
  p.mortgage.balance = 50000;
  p.debts = [{ id: 'd', name: 'Old loan', balance: 0, rate: null, monthlyPayment: 200 }];
  const s = FP.summary.compute(p, null);
  assert.ok(s.warnings.some((w) => /time left on your mortgage/.test(w.text)));
  assert.equal(s.cashFlow.debtMonthly, 200);
  assert.ok(s.warnings.some((w) => /no home value/.test(w.text)));
});

test('projection: other debts are paid off and their payments stop', () => {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.income.grossSalary = 40000;
  p.debts = [{ id: 'd', name: 'Loan', balance: 3000, rate: 0, monthlyPayment: 100 }];
  const r = FP.projection.project(p).rows;
  close(r[1].debtPaid, 1200);
  close(r[1].debts, 1800);
  close(r[3].debtPaid, 600);
  assert.equal(r[3].debts, 0);
  assert.equal(r[4].debtPaid, 0);
});

test('projection: a mortgage with no term left is cleared in the first year', () => {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.mortgage = { balance: 10000, remainingTermYears: 0, monthlyOverpayment: 0 };
  p.assets.cashSavings = 50000;
  const r = FP.projection.project(p).rows;
  assert.equal(r[1].mortgage, 0);
  close(r[1].mortgagePaid, 10000 * (1 + 0.045 / 12)); // one month's interest, then cleared
});

test('projection: negative equity is reported, not hidden', () => {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.assets.homeValue = 150000;
  p.mortgage = { balance: 200000, remainingTermYears: 25, monthlyOverpayment: 0 };
  p.assumptions.housePriceGrowth = -5;
  p.assets.cashSavings = 1e6;
  const r = FP.projection.project(p).rows;
  assert.ok(r[1].equity < 0);
  close(r[1].equity, r[1].home - r[1].mortgage);
});

test('projection: zero growth and zero inflation keep everything flat', () => {
  const p = FP.profile.blank();
  p.about.age = 50;
  p.assets = { homeValue: 100000, cashSavings: 10000, isa: 10000, gia: 10000, pension: 10000, other: 0 };
  Object.assign(p.assumptions, {
    inflation: 0, housePriceGrowth: 0, savingsRate: 0, investmentReturn: 0, investmentFees: 0,
    pensionGrowth: 0, pensionFees: 0, statePension: 0, retirementAge: 50, pensionAccessAge: 90,
  });
  const r = FP.projection.project(p).rows;
  const last = r[r.length - 1];
  assert.equal(last.netWorth, r[0].netWorth);
  assert.equal(FP.projection.toReal(last).netWorth, last.netWorth);
});

test('pension gross-up: the net amount after tax matches what was needed', () => {
  const cfg = FP.taxConfig;
  [1000, 20000, 80000].forEach((need) => {
    const gross = FP.projection.grossUpPension(need, 12547.6, 'rUK', cfg);
    const tax = FP.tax.incomeTaxOnly(12547.6 + gross * 0.75, 'rUK', cfg) - FP.tax.incomeTaxOnly(12547.6, 'rUK', cfg);
    close(gross - tax, need, 0.01);
  });
});

test('income tax only (no NI) on pensions; Scotland differs', () => {
  assert.equal(FP.tax.incomeTaxOnly(12570, 'rUK'), 0);
  close(FP.tax.incomeTaxOnly(30000, 'rUK'), (30000 - 12570) * 0.2);
  assert.ok(FP.tax.incomeTaxOnly(30000, 'scotland') !== FP.tax.incomeTaxOnly(30000, 'rUK'));
});

test('scenario differences report list changes and bonus timing', () => {
  const a = FP.sample();
  const b = JSON.parse(JSON.stringify(a));
  b.income.bonuses[0].month = 'jun';
  b.debts = [];
  const d = FP.scenarios.differences(a, b);
  assert.ok(d.some((x) => x.label === 'Bonus months' && x.kind === 'note'));
  assert.ok(d.some((x) => x.label === 'Other debts (total owed)' && x.to === 0));
});
