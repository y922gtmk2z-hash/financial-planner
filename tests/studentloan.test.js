const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const SL = FP.studentLoan;

function profile(income) {
  const p = FP.profile.blank();
  p.about.age = 30;
  p.spending = [];
  Object.assign(p.income, { grossSalary: 40000, studentLoanPlan: 'plan2' }, income);
  return p;
}
const project = (p) => FP.projection.project(p, { startYear: 2026 });

test('interest rates by plan; Plan 2 slides with income; an override wins', () => {
  assert.equal(SL.interestRate('plan1', 50000), 4.1);
  assert.equal(SL.interestRate('plan5', 50000), 4.1);
  assert.equal(SL.interestRate('postgrad', 50000), 6.0);
  assert.equal(SL.interestRate('plan2', 20000), 4.1); // below the repayment threshold
  assert.equal(SL.interestRate('plan2', 29385), 4.1);
  close(SL.interestRate('plan2', (29385 + 52885) / 2), 5.05);
  assert.equal(SL.interestRate('plan2', 52885), 6.0);
  assert.equal(SL.interestRate('plan2', 90000), 6.0);
  assert.equal(SL.interestRate('plan2', 90000, FP.taxConfig, 3), 3);
  assert.equal(SL.interestRate('none', 90000), 0);
});

test('write-off year = first repayment April + the plan term', () => {
  assert.equal(SL.writeOffYear('plan1', 2010), 2035);
  assert.equal(SL.writeOffYear('plan2', 2017), 2047);
  assert.equal(SL.writeOffYear('plan4', 2017), 2047);
  assert.equal(SL.writeOffYear('plan5', 2027), 2067);
  assert.equal(SL.writeOffYear('postgrad', 2020), 2050);
  assert.equal(SL.writeOffYear('plan2', null), null);
});

test('a balance is only tracked with a plan', () => {
  assert.equal(SL.tracked(profile({ studentLoanBalance: 5000 })), true);
  assert.equal(SL.tracked(profile({ studentLoanBalance: 0 })), false);
  assert.equal(SL.tracked(profile({ studentLoanPlan: 'none', studentLoanBalance: 5000 })), false);
});

test('the loan counts as a debt today', () => {
  const s = FP.summary.compute(profile({ studentLoanBalance: 12000 }), null);
  assert.equal(s.liabilities.items.find((i) => i.key === 'studentLoan').value, 12000);
  assert.equal(s.netWorth, -12000);
  const none = FP.summary.compute(profile({ studentLoanPlan: 'none', studentLoanBalance: 12000 }), null);
  assert.equal(none.liabilities.total, 0);
});

test('a small loan is paid off, then repayments stop and take-home rises', () => {
  const p = profile({ studentLoanBalance: 2000, studentLoanStartYear: 2020 });
  p.assumptions.salaryGrowth = 0;
  const r = project(p);
  const np = profile({ studentLoanPlan: 'none' });
  np.assumptions.salaryGrowth = 0;
  const noLoan = project(np);
  const due = (40000 - 29385) * 0.09; // £955.35 a year
  close(r.rows[1].studentLoanRepaid, due, 0.01);
  assert.ok(r.rows[1].studentLoanInterest > 0);
  // Year 1: interest at 4.1% (income below the Plan 2 upper threshold slides the rate up a little)
  const rate = SL.interestRate('plan2', 40000);
  assert.ok(rate > 4.1 && rate < 6);
  const cleared = r.events.studentLoan.clearedRow;
  assert.ok(cleared && cleared.y === 3, `cleared in year ${cleared && cleared.y}`);
  assert.equal(r.rows[3].studentLoan, 0);
  assert.ok(r.rows[3].studentLoanRepaid < due); // final, partial year
  // After it's cleared, take-home matches having no loan at all
  close(r.rows[4].takeHome, noLoan.rows[4].takeHome, 0.05);
  assert.equal(r.rows[4].studentLoanRepaid, 0);
  assert.ok(r.rows[2].takeHome < noLoan.rows[2].takeHome);
});

test('whatever is left is written off in April of the write-off year', () => {
  const p = profile({ studentLoanBalance: 100000, studentLoanStartYear: 2000 }); // written off 2030
  const r = project(p);
  const ev = r.events.studentLoan;
  assert.equal(ev.writeOffYear, 2030);
  assert.equal(ev.writtenOffRow.year, 2031); // the projection year that starts in 2030
  assert.equal(ev.writtenOffAge, 34); // age 30 in 2026, so 34 in April 2030
  assert.ok(ev.writtenOff > 90000);
  assert.equal(ev.clearedRow, null);
  assert.equal(r.rows[5].studentLoan, 0);
  // net worth jumps by the amount written off
  assert.ok(r.rows[5].netWorth - r.rows[4].netWorth > ev.writtenOff * 0.9);
  const noLoan = project(profile({ studentLoanPlan: 'none' }));
  close(r.rows[6].takeHome, noLoan.rows[6].takeHome, 0.05);
});

test('a balance grows when repayments don\'t cover the interest', () => {
  const p = profile({ grossSalary: 25000, studentLoanBalance: 30000 }); // under the threshold: no repayments
  const r = project(p);
  assert.equal(r.rows[1].studentLoanRepaid, 0);
  close(r.rows[1].studentLoan, 30000 * (1 + 0.041 / 12) ** 12, 0.01);
  assert.equal(r.events.studentLoan.writtenOffRow, null); // no start year: write-off unknown
  assert.ok(r.events.studentLoan.owingAtEnd > 30000);
});

test('with no balance entered, repayments carry on while working', () => {
  const r = project(profile({ studentLoanBalance: 0 }));
  const due = (40000 * 1.03 ** 10 - 29385) * 0.09;
  close(r.rows[11].studentLoanRepaid, due, 0.5);
  assert.equal(r.rows[11].studentLoan, 0);
  assert.equal(r.events.studentLoan.tracked, false);
});

test('a custom interest rate is used', () => {
  const p = profile({ grossSalary: 20000, studentLoanBalance: 10000, studentLoanRate: 0 });
  assert.equal(project(p).rows[1].studentLoan, 10000);
});

test('the sample household clears its loan before it would be written off', () => {
  const ev = project(FP.sample()).events.studentLoan;
  assert.equal(ev.tracked, true);
  assert.equal(ev.writeOffYear, 2047);
  assert.ok(ev.clearedRow && ev.clearedRow.year <= 2047);
});
