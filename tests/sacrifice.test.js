const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const base = { salary: 40000, bonuses: [], employeePensionPct: 0, employerPensionPct: 0, pensionMethod: 'netPay', studentLoanPlan: 'none', region: 'rUK' };
const th = (o) => FP.tax.takeHome({ ...base, ...o });

test('cycle to work: sacrificed pay escapes income tax and NI', () => {
  const without = th({});
  const r = th({ otherSacrifice: 1200 });
  assert.equal(r.salarySacrifice, 1200);
  close(without.incomeTax - r.incomeTax, 240); // 20%
  close(without.nationalInsurance - r.nationalInsurance, 96); // 8%
  close(without.takeHome - r.takeHome, 1200 - 336); // £1,200 bike costs £864 from take-home
  close(r.regularMonth.salarySacrifice, 100);
});

test('higher-rate taxpayers save 42% (40% tax + 2% NI)', () => {
  const without = th({ salary: 70000 });
  const r = th({ salary: 70000, otherSacrifice: 1000 });
  close(without.takeHome - r.takeHome, 580);
});

test('car scheme: the benefit in kind is taxed, with no employee NI', () => {
  const without = th({});
  const r = th({ otherSacrifice: 4800, benefitInKind: 40000 * 0.04 }); // £400 a month, £40k EV at 4%
  close(r.benefitInKind, 1600);
  close(without.incomeTax - r.incomeTax, 4800 * 0.2 - 1600 * 0.2);
  close(without.nationalInsurance - r.nationalInsurance, 4800 * 0.08);
  close(without.takeHome - r.takeHome, 4800 - 4800 * 0.28 + 1600 * 0.2);
});

test('sacrifice lowers income for the £100k taper and for student loans', () => {
  const over = th({ salary: 105000 });
  const under = th({ salary: 105000, otherSacrifice: 5000 });
  assert.equal(over.personalAllowance, 12570 - 2500);
  assert.equal(under.personalAllowance, 12570);
  const sl = th({ studentLoanPlan: 'plan2' });
  const slSacrifice = th({ studentLoanPlan: 'plan2', otherSacrifice: 1200 });
  close(sl.studentLoan - slSacrifice.studentLoan, 108);
});

test('pension contributions stay based on full salary', () => {
  const r = th({ employeePensionPct: 5, employerPensionPct: 3, otherSacrifice: 2400 });
  close(r.employeePension, 2000);
  close(r.employerPension, 1200);
});

test('you can\'t sacrifice more than you earn', () => {
  const r = th({ salary: 10000, otherSacrifice: 50000 });
  assert.equal(r.salarySacrifice, 10000);
  assert.ok(r.takeHome >= 0);
});

test('bonus months still include the regular sacrifice', () => {
  const r = th({ otherSacrifice: 1200, bonuses: [{ amount: 3000, month: 'mar' }] });
  close(r.regularMonth.salarySacrifice, 100);
  close(r.bonusPayments[0].pay.salarySacrifice, 100);
  close(r.takeHome, r.regularMonth.takeHome * 11 + r.bonusPayments[0].pay.takeHome, 0.05);
});

test('arrangements end when their months run out', () => {
  const list = [
    { type: 'cycle', monthly: 100, monthsLeft: 18 },
    { type: 'car', monthly: 400, monthsLeft: null, carValue: 40000, bikRate: 4 },
  ];
  const y0 = FP.tax.sacrificeForYear(list, 0);
  const y1 = FP.tax.sacrificeForYear(list, 1);
  const y2 = FP.tax.sacrificeForYear(list, 2);
  assert.equal(y0.sacrifice, 1200 + 4800);
  assert.equal(y1.sacrifice, 600 + 4800);
  assert.equal(y2.sacrifice, 4800);
  close(y0.benefitInKind, 1600);
  const car = FP.tax.sacrificeForYear([{ type: 'car', monthly: 400, monthsLeft: 6, carValue: 40000, bikRate: 4 }], 0);
  close(car.benefitInKind, 800); // pro rata
  assert.deepEqual(FP.tax.sacrificeForYear([], 0), { sacrifice: 0, benefitInKind: 0 });
});

test('profile: sacrifices feed take-home, and the projection stops them when they end', () => {
  const p = FP.profile.blank();
  p.about.age = 30;
  p.income.grossSalary = 40000;
  p.assumptions.salaryGrowth = 0;
  p.income.sacrifices = [{ id: 's', type: 'cycle', monthly: 100, monthsLeft: 12, carValue: 0, bikRate: 0 }];
  assert.equal(FP.tax.forProfile(p).salarySacrifice, 1200);
  const r = FP.projection.project(p, { startYear: 2026, startMonth: 10 }).rows;
  const none = FP.profile.blank();
  none.about.age = 30;
  none.income.grossSalary = 40000;
  none.assumptions.salaryGrowth = 0;
  const n = FP.projection.project(none, { startYear: 2026, startMonth: 10 }).rows;
  close(n[1].takeHome - r[1].takeHome, 864);
  assert.equal(r[1].salarySacrifice, 1200);
  close(r[2].takeHome, n[2].takeHome);
  assert.equal(r[2].salarySacrifice, 0);
});

test('profile: sacrifices are validated on import', () => {
  const p = FP.profile.normalise({ income: { sacrifices: [
    { type: 'car', monthly: '£350', monthsLeft: '', carValue: '42,000', bikRate: 4 },
    { type: 'yacht', monthly: -5 },
    'junk',
  ] } });
  assert.equal(p.income.sacrifices.length, 2);
  assert.equal(p.income.sacrifices[0].monthly, 350);
  assert.equal(p.income.sacrifices[0].monthsLeft, null);
  assert.equal(p.income.sacrifices[0].carValue, 42000);
  assert.equal(p.income.sacrifices[1].type, 'car'); // unknown type falls back to the first option
  assert.equal(p.income.sacrifices[1].monthly, 0);
  assert.deepEqual(FP.profile.blank().income.sacrifices, []);
  const fresh = FP.profile.newSacrifice('car');
  assert.equal(fresh.bikRate, 4);
});
