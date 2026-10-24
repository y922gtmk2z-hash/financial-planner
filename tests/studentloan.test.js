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
// Projections start in October 2026, so the first year runs to September 2027.
const project = (p) => FP.projection.project(p, { startYear: 2026, startMonth: 10 });

test('published rates for the current interest year (RPI 4.1%, 6% cap)', () => {
  const rate = (plan, income) => SL.interestRate(plan, income);
  assert.equal(rate('plan1', 50000), 4.1);
  assert.equal(rate('plan4', 50000), 4.1);
  assert.equal(rate('plan5', 50000), 4.1);
  assert.equal(rate('postgrad', 50000), 6.0); // RPI + 3% = 7.1%, capped at 6%
  assert.equal(rate('plan2', 20000), 4.1); // below the repayment threshold: RPI only
  assert.equal(rate('plan2', 29385), 4.1);
  close(rate('plan2', (29385 + 52885) / 2), 5.6); // RPI + 1.5%
  assert.equal(rate('plan2', 52885), 6.0); // RPI + 3% = 7.1%, capped
  assert.equal(rate('plan2', 90000), 6.0);
  assert.equal(rate('none', 90000), 0);
});

test('future rates follow inflation (as RPI) plus the plan margin, with no cap', () => {
  const rate = (plan, income, rpi) => SL.interestRate(plan, income, FP.taxConfig, { rpi });
  assert.equal(rate('plan1', 50000, 2.5), 2.5);
  assert.equal(rate('plan4', 50000, 2.5), 2.5);
  assert.equal(rate('plan5', 50000, 2.5), 2.5);
  assert.equal(rate('postgrad', 50000, 2.5), 5.5);
  assert.equal(rate('plan2', 20000, 2.5), 2.5);
  close(rate('plan2', (29385 + 52885) / 2, 2.5), 4.0);
  assert.equal(rate('plan2', 90000, 2.5), 5.5);
  assert.equal(rate('postgrad', 50000, 5), 8); // the temporary cap doesn't carry forward
});

test('your own rate always wins', () => {
  assert.equal(SL.interestRate('plan2', 90000, FP.taxConfig, { override: 3 }), 3);
  assert.equal(SL.interestRate('plan2', 90000, FP.taxConfig, { override: 3, rpi: 9 }), 3);
});

test('published rates apply until August 2027', () => {
  assert.equal(SL.publishedRatesApply(2026, 10), true);
  assert.equal(SL.publishedRatesApply(2027, 8), true);
  assert.equal(SL.publishedRatesApply(2027, 9), false);
  assert.equal(SL.publishedRatesApply(2030, 1), false);
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
  // Year 1: income between the Plan 2 thresholds slides the rate above RPI
  const rate = SL.interestRate('plan2', 40000);
  close(rate, 4.1 + 3 * (40000 - 29385) / (52885 - 29385));
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
  const p = profile({ studentLoanBalance: 100000, studentLoanStartYear: 2000 }); // written off April 2030
  const r = project(p);
  const ev = r.events.studentLoan;
  assert.equal(ev.writeOffYear, 2030);
  // Projection year 4 runs Oct 2029 - Sep 2030, so it contains April 2030
  assert.equal(ev.writtenOffRow.y, 4);
  assert.equal(ev.writtenOffAge, 33);
  assert.ok(ev.writtenOff > 90000);
  assert.equal(ev.clearedRow, null);
  assert.equal(r.rows[4].studentLoan, 0);
  assert.ok(r.rows[3].studentLoan > 90000);
  // Oct-Mar repayments were still taken that year
  assert.ok(r.rows[4].studentLoanRepaid > 0 && r.rows[4].studentLoanRepaid < r.rows[3].studentLoanRepaid);
  // net worth jumps by the amount written off
  assert.ok(r.rows[4].netWorth - r.rows[3].netWorth > ev.writtenOff * 0.9);
  const noLoan = project(profile({ studentLoanPlan: 'none' }));
  close(r.rows[5].takeHome, noLoan.rows[5].takeHome, 0.05);
});

test('a write-off date already passed clears the balance straight away', () => {
  const r = project(profile({ studentLoanBalance: 5000, studentLoanStartYear: 1990 }));
  assert.equal(r.events.studentLoan.writtenOffRow.y, 1);
  assert.equal(r.rows[1].studentLoanRepaid, 0);
});

test('a balance grows when repayments don\'t cover the interest', () => {
  const p = profile({ grossSalary: 25000, studentLoanBalance: 30000 }); // under the threshold: no repayments
  const r = project(p);
  assert.equal(r.rows[1].studentLoanRepaid, 0);
  // By default the current rate (RPI 4.1%, as income is below the Plan 2 threshold) carries on
  close(r.rows[1].studentLoan, 30000 * (1 + 0.041 / 12) ** 12, 0.01);
  close(r.rows[3].studentLoan, r.rows[2].studentLoan * (1 + 0.041 / 12) ** 12, 0.01);
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

test('following inflation: from September 2027 interest is inflation (as RPI) + margin', () => {
  const p = profile({ grossSalary: 25000, studentLoanBalance: 30000 });
  p.assumptions.studentLoanInterest = 'inflation';
  const r = project(p);
  // Oct 2026 - Aug 2027 at the published 4.1%, then Sep 2027 at 2.5% (inflation)
  close(r.rows[1].studentLoan, 30000 * (1 + 0.041 / 12) ** 11 * (1 + 0.025 / 12), 0.01);
  close(r.rows[3].studentLoan, r.rows[2].studentLoan * (1 + 0.025 / 12) ** 12, 0.01);
});

test('by default, inflation doesn\'t change student loan interest', () => {
  const run = (inflation) => {
    const p = profile({ grossSalary: 45000, studentLoanBalance: 30000, studentLoanStartYear: 2020 });
    p.assumptions.inflation = inflation;
    p.assumptions.salaryGrowth = 3;
    return project(p);
  };
  assert.equal(run(1).rows[5].studentLoan, run(5).rows[5].studentLoan);
});

test('following inflation: higher inflation means more interest and a later payoff', () => {
  const run = (inflation) => {
    const p = profile({ grossSalary: 45000, studentLoanBalance: 30000, studentLoanStartYear: 2020 });
    p.assumptions.studentLoanInterest = 'inflation';
    p.assumptions.inflation = inflation;
    return project(p);
  };
  const low = run(1);
  const high = run(5);
  assert.ok(high.rows[5].studentLoan > low.rows[5].studentLoan);
  const year = (r) => (r.events.studentLoan.clearedRow ? r.events.studentLoan.clearedRow.y : Infinity);
  assert.ok(year(high) > year(low));
  // Year 1 is mostly at the published rate, so the two runs barely differ at first
  assert.ok(Math.abs(high.rows[1].studentLoan - low.rows[1].studentLoan) < 150); // one month (September) differs
});

test('extra payments: paid from take-home, clear the loan sooner and cost less interest', () => {
  const p = FP.sampleWorkspace().scenarios[0].profile;
  const base = project(p);
  p.income.studentLoanOverpayment = 200;
  const r = project(p);
  const bSl = base.events.studentLoan;
  const sl = r.events.studentLoan;
  assert.ok(sl.clearedRow.age < bSl.clearedRow.age);
  // Comes out of what's left over, not the payslip.
  assert.ok(Math.abs(r.rows[1].takeHome - base.rows[1].takeHome) < 0.01);
  assert.ok(Math.abs((base.rows[1].surplus - r.rows[1].surplus) - r.rows[1].studentLoanExtra) < 0.01);
  assert.ok(Math.abs(r.rows[1].studentLoanExtra - 2400) < 0.01);
  const interest = (x) => x.rows.reduce((t, row) => t + (row.studentLoanInterest || 0), 0);
  assert.ok(interest(r) < interest(base));
  // Today's cash flow counts it with debt payments.
  const cf = FP.summary.compute(p, FP.tax.forProfile(p).takeHomeMonthly).cashFlow;
  assert.equal(cf.studentLoanExtraMonthly, 200);
  // Stops once the loan is cleared.
  const after = r.rows.find((row) => row.age > sl.clearedRow.age);
  assert.equal(after.studentLoanExtra, 0);
  // No balance entered: nothing is paid.
  p.income.studentLoanBalance = 0;
  assert.equal(project(p).rows[1].studentLoanExtra, 0);
});
