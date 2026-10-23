const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('monthly payment matches the standard annuity formula', () => {
  // £200,000 over 25 years at 4.5% → £1,111.66 a month
  close(FP.mortgage.monthlyPayment(200000, 4.5, 300), 1111.66);
});

test('zero interest splits the balance evenly', () => {
  close(FP.mortgage.monthlyPayment(12000, 0, 120), 100);
});

test('no balance or no term is handled', () => {
  assert.equal(FP.mortgage.monthlyPayment(0, 4.5, 300), 0);
  assert.equal(FP.mortgage.monthlyPayment(5000, 4.5, 0), 5000);
});

test('amortisation clears the balance exactly at the end of the term', () => {
  const r = FP.mortgage.amortise({ balance: 200000, annualRatePct: 4.5, termMonths: 300 });
  assert.equal(r.months, 300);
  assert.equal(r.remainingBalance, 0);
  assert.equal(r.yearEndBalances.length, 25);
  close(r.totalPaid, 1111.66 * 300, 5);
  close(r.totalInterest, r.totalPaid - 200000, 0.01);
});

test('overpayments shorten the term and save interest', () => {
  const base = { balance: 200000, annualRatePct: 4.5, termMonths: 300 };
  const without = FP.mortgage.amortise(base);
  const withOver = FP.mortgage.amortise({ ...base, monthlyOverpayment: 200 });
  assert.ok(withOver.months < without.months);
  assert.ok(withOver.totalInterest < without.totalInterest);
  assert.equal(withOver.remainingBalance, 0);
});

test('a rate change recalculates the payment over the remaining term', () => {
  const r = FP.mortgage.amortise({
    balance: 200000, annualRatePct: 4.5, termMonths: 300,
    rateChange: { afterMonths: 24, annualRatePct: 6 },
  });
  const flat = FP.mortgage.amortise({ balance: 200000, annualRatePct: 4.5, termMonths: 300 });
  assert.equal(r.months, 300);
  assert.equal(r.remainingBalance, 0);
  assert.ok(r.totalInterest > flat.totalInterest);
  close(r.yearEndBalances[1], flat.yearEndBalances[1], 0.001);
});

test('overpayment limit flags more than 10% a year', () => {
  assert.equal(FP.mortgage.overpaymentLimit(100000, 800, 10).exceeds, false); // 9,600
  assert.equal(FP.mortgage.overpaymentLimit(100000, 900, 10).exceeds, true); // 10,800
  assert.equal(FP.mortgage.overpaymentLimit(100000, 0, 10).exceeds, false);
});
