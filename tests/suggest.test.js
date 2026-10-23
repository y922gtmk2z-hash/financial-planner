const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

// A simple household with a choice of salary, cash and spending.
function profile(o) {
  o = o || {};
  const p = FP.profile.blank();
  p.about.age = 35;
  p.income.grossSalary = o.salary || 35000;
  p.assets.cashSavings = o.cash == null ? 50000 : o.cash;
  p.spending = [{ id: 's', category: 'All', monthly: o.spend == null ? 1000 : o.spend }];
  if (o.mortgage) Object.assign(p.mortgage, { balance: 150000, remainingTermYears: 25, monthlyOverpayment: 0 });
  if (o.debts) p.debts = o.debts;
  if (o.savings) p.savings = o.savings;
  return p;
}
const ids = (r) => r.suggestions.map((s) => s.id);
const sum = (split) => split.emergency + split.cash + split.invest + split.mortgage + split.pension;

test('left over is take-home minus spending, debts and regular savings', () => {
  const p = profile({ savings: [{ id: 'x', type: 'cash', monthly: 100, grows: 'fixed' }] });
  const r = FP.suggest.analyse(p);
  const take = FP.tax.forProfile(p).takeHomeMonthly;
  assert.ok(Math.abs(r.left - (take - 1000 - 100)) < 0.01);
});

test('nothing left over: say so, and no split', () => {
  const r = FP.suggest.analyse(profile({ spend: 5000 }));
  assert.ok(r.left < 0);
  assert.deepEqual(ids(r), ['noSurplus']);
  assert.equal(r.split, null);
});

test('a small emergency fund comes first', () => {
  const r = FP.suggest.analyse(profile({ cash: 1000 }));
  assert.ok(ids(r).includes('emergency'));
  assert.equal(r.emergency.short, true);
  assert.deepEqual(r.split, { emergency: 80, cash: 0, invest: 10, mortgage: 0, pension: 10 });
  const e = r.suggestions.find((s) => s.id === 'emergency');
  assert.match(e.text, /target is 3/);
  assert.match(e.text, /Putting 80% of what’s left/);
  assert.equal(FP.suggest.duration(1), '1 month');
  assert.equal(FP.suggest.duration(30), 'about 3 years');
  assert.equal(FP.suggest.duration(500), 'over 10 years');
  const ok = FP.suggest.analyse(profile({ cash: 50000 }));
  assert.ok(ids(ok).includes('emergencyOk'));
});

test('expensive debts are flagged, most expensive first', () => {
  const r = FP.suggest.analyse(profile({ debts: [
    { id: 'a', name: 'Loan', balance: 3000, rate: 8, monthlyPayment: 100 },
    { id: 'b', name: 'Card', balance: 1000, rate: 24, monthlyPayment: 50 },
    { id: 'c', name: 'Cheap', balance: 1000, rate: 0, monthlyPayment: 50 },
  ] }));
  const d = r.suggestions.find((s) => s.id === 'debt');
  assert.match(d.title, /Clear Card first/);
  assert.match(d.text, /Loan \(8%\) is next/);
  assert.doesNotMatch(d.text, /Cheap/);
  // Emergency fund already full: mostly cash to clear the debts, plus a top-up.
  assert.deepEqual(r.split, { emergency: 10, cash: 70, invest: 10, mortgage: 0, pension: 10 });
});

test('basic-rate taxpayer with a mortgage dearer than cash', () => {
  const r = FP.suggest.analyse(profile({ mortgage: true, spend: 500 }));
  assert.ok(ids(r).includes('mortgage'));
  assert.ok(!ids(r).includes('relief'));
  assert.deepEqual(r.split, { emergency: 10, cash: 0, invest: 50, mortgage: 20, pension: 20 });
});

test('no mortgage: nothing goes to overpayments', () => {
  const r = FP.suggest.analyse(profile());
  assert.equal(r.split.mortgage, 0);
  assert.equal(r.split.invest, 70);
});

test('higher-rate taxpayers get a bigger pension share', () => {
  const r = FP.suggest.analyse(profile({ salary: 70000 }));
  assert.ok(ids(r).includes('relief'));
  assert.equal(r.split.pension, 40);
});

test('between £100k and £125k: mostly pension', () => {
  const r = FP.suggest.analyse(profile({ salary: 110000 }));
  assert.ok(ids(r).includes('taper'));
  assert.deepEqual(r.split, { emergency: 10, cash: 0, invest: 20, mortgage: 0, pension: 70 });
});

test('the emergency fund target is your choice', () => {
  const p = profile({ cash: 10000, spend: 2000 }); // 5 months of outgoings
  assert.equal(FP.suggest.analyse(p).emergency.short, false);
  p.leftover.emergencyMonths = 6;
  const r = FP.suggest.analyse(p);
  assert.ok(r.left > 0);
  assert.equal(r.emergency.short, true);
  assert.equal(r.emergency.target, 12000);
  assert.equal(r.split.emergency, 80);
  // Months to fill: the £2,000 gap at 80% of what's left each month.
  assert.equal(r.emergency.monthsToFill(0.8), Math.ceil(2000 / (r.left * 0.8)));
});

test('every suggested split includes the emergency fund', () => {
  [
    { emergency: { short: false }, inTaper: false, topRate: 20 },
    { emergency: { short: true, targetMonths: 3 } },
    { emergency: { short: false }, inTaper: true },
    { emergency: { short: false }, expensive: true },
  ].forEach((s) => assert.ok(FP.suggest.suggestSplit(s).split.emergency > 0));
});

test('ISA room accounts for regular ISA savings', () => {
  const r = FP.suggest.analyse(profile({ savings: [{ id: 'i', type: 'ssIsa', monthly: 500, grows: 'fixed' }] }));
  assert.match(r.suggestions.find((s) => s.id === 'isa').text, /£14,000/);
});

test('a student loan that will be written off', () => {
  const p = profile({ salary: 30000 });
  Object.assign(p.income, { studentLoanPlan: 'plan2', studentLoanBalance: 60000, studentLoanStartYear: 2015 });
  assert.ok(ids(FP.suggest.analyse(p)).includes('studentLoan'));
});

test('every suggested split adds up to 100%', () => {
  [
    { emergency: { short: false }, inTaper: false, topRate: 20, hasMortgage: true, mortgageBeatsCash: true },
    { emergency: { short: false }, inTaper: false, topRate: 40, hasMortgage: true, mortgageBeatsCash: true },
    { emergency: { short: false }, inTaper: false, topRate: 45, hasMortgage: false },
    { emergency: { short: true, targetMonths: 3 } },
    { emergency: { short: true, targetMonths: 6 }, expensive: true },
    { emergency: { short: false }, inTaper: true },
    { emergency: { short: false }, expensive: true },
  ].forEach((s) => assert.equal(sum(FP.suggest.suggestSplit(s).split), 100));
});
