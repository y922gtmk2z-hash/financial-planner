const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const item = (type, monthly, grows) => ({ id: type + monthly, type, monthly, grows: grows || 'fixed' });

test('monthly totals by type', () => {
  const t = FP.savings.monthlyTotals([item('cash', 100), item('cashIsa', 200), item('ssIsa', 300), item('ssIsa', 50)]);
  assert.deepEqual(t, { cash: 100, cashIsa: 200, ssIsa: 350, total: 650 });
});

test('a year of contributions: cash and cash ISA go to cash, stocks & shares to the ISA', () => {
  const y = FP.savings.forYear([item('cash', 100), item('cashIsa', 200), item('ssIsa', 300)], { isaAllowance: 20000 });
  assert.equal(y.cash, 3600);
  assert.equal(y.isa, 3600);
  assert.equal(y.gia, 0);
  assert.equal(y.isaUsed, 6000);
  assert.equal(y.total, 7200);
  assert.equal(y.overAllowance, false);
});

test('over the ISA allowance: the extra is still saved, outside an ISA', () => {
  const y = FP.savings.forYear([item('ssIsa', 2000)], { isaAllowance: 20000 });
  assert.equal(y.isa, 20000);
  assert.equal(y.gia, 4000);
  assert.equal(y.overAllowance, true);
});

test('cash ISA limit: cash over the limit stays as cash and leaves room for stocks & shares', () => {
  const y = FP.savings.forYear([item('cashIsa', 1500), item('ssIsa', 1000)], { isaAllowance: 20000, cashIsaLimit: 12000 });
  assert.equal(y.cash, 18000); // all cash is saved
  assert.equal(y.isaUsed, 12000 + 8000);
  assert.equal(y.isa, 8000);
  assert.equal(y.gia, 4000);
  const under = FP.savings.forYear([item('cashIsa', 1500)], { isaAllowance: 20000, cashIsaLimit: 12000 });
  assert.equal(under.overCashLimit, true);
  assert.equal(under.overAllowance, false); // £18,000 is within the £20,000 overall allowance
  assert.equal(FP.savings.forYear([item('cashIsa', 1500)], { isaAllowance: 20000, cashIsaLimit: null }).overCashLimit, false);
});

test('amounts that rise with pay', () => {
  const y = FP.savings.forYear([item('ssIsa', 100, 'salary'), item('cash', 100)], { isaAllowance: 20000, salaryFactor: 1.1 });
  close(y.isa, 1320);
  close(y.cash, 1200);
});

test('Today: savings come out of what\'s left, with a warning if they don\'t fit', () => {
  const p = FP.profile.blank();
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  p.savings = [item('cashIsa', 300), item('ssIsa', 200)];
  const s = FP.summary.compute(p, 2000);
  assert.equal(s.cashFlow.available, 1000);
  assert.equal(s.cashFlow.savingsMonthly, 500);
  assert.equal(s.cashFlow.surplus, 500);
  assert.equal(s.warnings.length, 0);
  const tight = FP.summary.compute(p, 1300);
  assert.equal(tight.cashFlow.surplus, -200);
  assert.ok(tight.warnings.some((w) => /regular savings .* more than you have left/.test(w.text)));
});

function profile() {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.spending = [];
  p.income.grossSalary = 50000;
  Object.assign(p.assumptions, { salaryGrowth: 0, savingsRate: 0, investmentReturn: 0, investmentFees: 0 });
  Object.assign(p.leftover, { emergency: 0, cash: 30 });
  return p;
}
const project = (p) => FP.projection.project(p, { startYear: 2026, startMonth: 10 });

test('projection: savings feed the right balances and reduce the surplus', () => {
  const plain = project(profile()).rows[1];
  const p = profile();
  p.savings = [item('cash', 100), item('ssIsa', 500)];
  const r = project(p).rows[1];
  close(r.regularSaving, 7200);
  close(r.surplus, plain.surplus - 7200);
  // Surplus split (30% cash, 50% invest) still applies to what's left
  close(r.cash, 1200 + r.surplus * 0.4); // no mortgage: its 10% goes to cash too
  // £6,000 of ISA savings, then the split's investment share fills the rest of the £20,000 allowance
  close(r.isa, 20000);
  close(r.gia, 6000 + r.surplus * 0.5 - 20000);
});

test('projection: regular ISA savings use the allowance before the surplus split', () => {
  const p = profile();
  p.assumptions.isaAllowance = 10000;
  p.savings = [item('ssIsa', 500)]; // £6,000
  const r = project(p).rows[1];
  close(r.isa, 10000); // 6,000 saved + 4,000 of the split
  close(r.gia, r.toInvest - 4000);
});

test('projection: savings stop at retirement', () => {
  const p = profile();
  p.assumptions.retirementAge = 42;
  p.savings = [item('cash', 100)];
  const rows = project(p).rows;
  close(rows[2].regularSaving, 1200);
  assert.equal(rows[3].regularSaving, 0);
});

test('projection: the cash ISA limit starts in April 2027 and not for over-65s', () => {
  const p = profile();
  p.income.grossSalary = 200000; // plenty of surplus
  p.savings = [item('cashIsa', 1500)]; // £18,000 a year
  const r = project(p);
  assert.ok(r.warnings.some((w) => w.key === 'cashIsaLimit'));
  // Year 1 starts Oct 2026, before the limit, so no warning for it yet
  assert.match(r.warnings.find((w) => w.key === 'cashIsaLimit').text, /From 2028/);
  const older = profile();
  older.about.age = 66;
  older.income.grossSalary = 200000;
  older.assumptions.retirementAge = 75;
  older.savings = [item('cashIsa', 1500)];
  assert.ok(!project(older).warnings.some((w) => w.key === 'cashIsaLimit'));
});

test('profile: savings are validated on import', () => {
  const p = FP.profile.normalise({ savings: [{ type: 'ssIsa', monthly: '£250', grows: 'salary' }, { type: 'bonds', monthly: -1 }, 7] });
  assert.equal(p.savings.length, 2);
  assert.deepEqual([p.savings[0].type, p.savings[0].monthly, p.savings[0].grows], ['ssIsa', 250, 'salary']);
  assert.deepEqual([p.savings[1].type, p.savings[1].monthly, p.savings[1].grows], ['cash', 0, 'fixed']);
  assert.deepEqual(FP.profile.blank().savings, []);
});
