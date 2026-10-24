const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const L = FP.loan;

test('an APR is the true yearly cost; a mortgage rate is charged monthly as rate / 12', () => {
  close((1 + L.monthlyRate(12, 'apr')) ** 12, 1.12, 1e-9);
  close(L.monthlyRate(6, 'nominal'), 0.005, 1e-12);
  close(L.yearlyRate(L.monthlyRate(19.9, 'apr'), 'apr'), 19.9, 1e-9);
});

test('any two of rate, payment and time left give the third', () => {
  const base = { balance: 10000, kind: 'apr' };
  const payment = L.resolve({ ...base, rate: 9.9, months: 48 });
  assert.equal(payment.worked, 'payment');
  const rate = L.resolve({ ...base, payment: payment.payment, months: 48 });
  assert.equal(rate.worked, 'rate');
  close(rate.rate, 9.9, 0.001);
  const months = L.resolve({ ...base, rate: 9.9, payment: payment.payment });
  assert.equal(months.worked, 'months');
  close(months.months, 48, 0.001);
});

test('a mortgage: rate worked out from payment and term', () => {
  const p = FP.profile.blank();
  Object.assign(p.mortgage, { balance: 200000, remainingTermYears: 25, monthlyPayment: 1146.2 });
  p.assumptions.mortgageRate = null;
  const m = L.forMortgage(p);
  assert.equal(m.worked, 'rate');
  close(m.rate, 4.8, 0.01);
  // The summary and projection use it.
  close(FP.summary.compute(p, null).mortgage.rate, m.rate, 1e-9);
});

test('a blank rate with nothing to work it from uses the default, and says so', () => {
  const d = { balance: 1200, rate: null, monthlyPayment: 100, termMonths: null };
  const r = L.forDebt(d, { otherDebtRate: 7 });
  assert.equal(r.rate, 7);
  assert.equal(r.rateIsDefault, true);
  assert.equal(r.worked, 'months');
});

test('figures that can’t add up are flagged, not guessed', () => {
  const r = L.resolve({ balance: 10000, payment: 100, months: 12, kind: 'apr', defaultRate: 7 });
  assert.ok(r.error);
  const never = L.resolve({ balance: 10000, rate: 30, payment: 50, kind: 'apr' });
  assert.equal(never.months, Infinity);
});

test('older saved debts gain a blank time left', () => {
  const p = FP.profile.normalise({ debts: [{ name: 'Loan', balance: 1000, rate: 5, monthlyPayment: 50 }] });
  assert.equal(p.debts[0].termMonths, null);
  assert.equal(p.mortgage.monthlyPayment, null);
});
