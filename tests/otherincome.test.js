const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

function profile(salary) {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.income.grossSalary = salary;
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  return p;
}

test('private medical insurance is taxed as a benefit in kind (income tax, no NI)', () => {
  const p = profile(40000);
  const base = FP.tax.forProfile(p);
  p.income.benefits = [FP.profile.newBenefit('medical')];
  p.income.benefits[0].yearly = 1000;
  const r = FP.tax.forProfile(p);
  close(r.incomeTax - base.incomeTax, 200); // basic rate on £1,000
  close(r.nationalInsurance, base.nationalInsurance);
  close(base.takeHome - r.takeHome, 200);
  close(r.benefitInKind, 1000);
});

test('other taxable income is taxed with your salary; tax-free income is added as it is', () => {
  const p = profile(45000);
  p.assumptions.employeePensionPct = 0;
  const base = FP.tax.forProfile(p);
  p.income.otherIncome = 10000; // pushes £4,730 into the higher rate band
  const r = FP.tax.forProfile(p);
  close(r.incomeTax - base.incomeTax, (50270 - 45000) * 0.2 + (55000 - 50270) * 0.4);
  close(r.nationalInsurance, base.nationalInsurance);
  close(r.studentLoan, base.studentLoan);
  p.income.taxFreeIncome = 1200;
  const t = FP.tax.forProfile(p);
  close(t.takeHome - r.takeHome, 1200);
  close(t.otherIncome, 11200);
});

test('a bonus month still adds up with other income', () => {
  const p = profile(40000);
  p.income.otherIncome = 6000;
  p.income.bonuses = [{ id: 'b', amount: 3000, month: 'mar' }];
  const r = FP.tax.forProfile(p);
  const year = r.regularMonth.takeHome * 11 + r.bonusPayments[0].pay.takeHome;
  close(year, r.takeHome, 1);
  close(r.regularMonth.otherIncome, 500);
});

test('projection: other income while working, and after retiring only if it carries on', () => {
  const p = profile(40000);
  p.about.age = 64;
  p.assumptions.retirementAge = 66;
  p.income.otherIncome = 6000;
  p.income.taxFreeIncome = 1200;
  let rows = FP.projection.project(p).rows;
  const working = FP.projection.project({ ...p, income: { ...p.income, otherIncome: 0, taxFreeIncome: 0 } }).rows;
  assert.ok(rows[1].takeHome > working[1].takeHome + 5000);
  const retired = rows.find((r, i) => i > 0 && !r.working);
  assert.equal(retired.otherIncomeRetired, 0);
  p.income.otherIncomeAfterRetirement = 'yes';
  rows = FP.projection.project(p).rows;
  const r = rows.find((x, i) => i > 0 && !x.working);
  close(r.otherIncomeRetired, 7200 * FP.growth.inflationFactor(p.assumptions.inflation, r.y - 1), 1); // prices for the year it starts
  assert.ok(r.netIncome > retired.netIncome);
  // Benefits in kind are taxed in the projection too.
  const q = profile(40000);
  const plain = FP.projection.project(q).rows[1];
  q.income.benefits = [{ id: 'm', type: 'medical', yearly: 1000 }];
  close(plain.takeHome - FP.projection.project(q).rows[1].takeHome, 200, 1);
});

test('imports keep benefits and other income, and drop anything invalid', () => {
  const p = FP.profile.normalise({ income: {
    benefits: [{ type: 'medical', yearly: '1,200' }, { type: 'spaceship', yearly: 5 }, 'junk'],
    otherIncome: '£6,000', taxFreeIncome: -5, otherIncomeAfterRetirement: 'maybe',
  } });
  assert.equal(p.income.benefits.length, 2);
  assert.equal(p.income.benefits[0].yearly, 1200);
  assert.equal(p.income.benefits[1].type, 'medical'); // unknown type falls back
  assert.equal(p.income.otherIncome, 6000);
  assert.equal(p.income.taxFreeIncome, 0);
  assert.equal(p.income.otherIncomeAfterRetirement, 'no');
});
