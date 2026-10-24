/*
 * Loans: given the balance and any two of interest rate, monthly payment and
 * time left, work out the third. Pure functions, no DOM.
 *
 * Rates are % a year, in one of two forms:
 *   'apr'     - an APR (loans, credit cards, car finance): the true yearly
 *               cost, so the monthly rate is (1 + APR)^(1/12) - 1.
 *   'nominal' - a mortgage's quoted rate, charged as rate / 12 each month.
 */
(function (FP) {
  'use strict';

  const EPSILON = 0.005;

  // Monthly interest rate (a fraction) from a yearly % rate.
  function monthlyRate(ratePct, kind) {
    const r = (ratePct || 0) / 100;
    return kind === 'apr' ? Math.pow(1 + r, 1 / 12) - 1 : r / 12;
  }

  // Yearly % rate from a monthly rate (a fraction).
  function yearlyRate(monthly, kind) {
    return (kind === 'apr' ? Math.pow(1 + monthly, 12) - 1 : monthly * 12) * 100;
  }

  // Payment that clears `balance` in `months` at monthly rate `r`.
  function paymentFor(balance, r, months) {
    if (!(balance > 0)) return 0;
    if (!(months > 0)) return balance;
    if (r === 0) return balance / months;
    return (balance * r) / (1 - Math.pow(1 + r, -months));
  }

  // Months to clear `balance` paying `payment` at monthly rate `r` (Infinity if never).
  function monthsFor(balance, r, payment) {
    if (!(balance > 0)) return 0;
    if (!(payment > balance * r + EPSILON)) return Infinity;
    if (r === 0) return balance / payment;
    return -Math.log(1 - (r * balance) / payment) / Math.log(1 + r);
  }

  // Monthly rate at which `payment` clears `balance` in `months`, or null if
  // it can't (the payments don't even cover the balance).
  function rateFor(balance, payment, months) {
    if (!(balance > 0) || !(payment > 0) || !(months > 0)) return null;
    if (payment * months < balance - EPSILON) return null;
    let lo = 0;
    let hi = 1; // 100% a month
    if (paymentFor(balance, hi, months) < payment) return null;
    for (let i = 0; i < 100; i += 1) {
      const mid = (lo + hi) / 2;
      if (paymentFor(balance, mid, months) < payment) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /*
   * Fill in whichever of rate, payment and months is missing (null).
   * opts: { balance, rate (% a year), payment (a month), months, kind ('apr' | 'nominal'),
   *         defaultRate (used when the rate can't be worked out) }
   * Returns { balance, rate, payment, months, worked: 'rate' | 'payment' | 'months' | null,
   *           rateIsDefault, error }. months is Infinity when the payment never
   * clears the balance; error says why figures don't add up.
   */
  function resolve(opts) {
    const kind = opts.kind || 'apr';
    const balance = Math.max(0, opts.balance || 0);
    let rate = opts.rate == null ? null : opts.rate;
    let payment = opts.payment > 0 ? opts.payment : null;
    let months = opts.months > 0 ? opts.months : null;
    let worked = null;
    let rateIsDefault = false;
    let error = null;
    if (!(balance > 0)) return { balance, rate: rate == null ? opts.defaultRate || 0 : rate, payment: payment || 0, months: 0, worked, rateIsDefault: rate == null, error };

    if (rate == null && payment != null && months != null) {
      const r = rateFor(balance, payment, months);
      if (r == null) {
        error = 'At that payment the balance wouldn’t be cleared in that time, even with no interest. Check the figures.';
        rate = opts.defaultRate || 0;
        rateIsDefault = true;
      } else {
        rate = yearlyRate(r, kind);
        worked = 'rate';
      }
    }
    if (rate == null) {
      rate = opts.defaultRate || 0;
      rateIsDefault = true;
    }
    const r = monthlyRate(rate, kind);
    if (payment == null && months != null) {
      payment = paymentFor(balance, r, months);
      worked = worked || 'payment';
    } else if (months == null && payment != null) {
      months = monthsFor(balance, r, payment);
      worked = worked || 'months';
    }
    return { balance, rate, payment: payment || 0, months: months || 0, worked, rateIsDefault, error };
  }

  // One of your other debts, with anything missing worked out (rates are APRs).
  function forDebt(d, assumptions) {
    return resolve({
      balance: d.balance, rate: d.rate, payment: d.monthlyPayment, months: d.termMonths,
      kind: 'apr', defaultRate: assumptions.otherDebtRate,
    });
  }

  // Your mortgage, with anything missing worked out. A blank rate falls back
  // to MORTGAGE_FALLBACK_RATE when it can't be worked out from your payment.
  const MORTGAGE_FALLBACK_RATE = 4.5;
  function forMortgage(profile) {
    const m = profile.mortgage;
    const years = m.remainingTermYears || 0;
    return resolve({
      balance: m.balance, rate: profile.assumptions.mortgageRate, payment: m.monthlyPayment,
      months: years > 0 ? Math.round(years * 12) : null,
      kind: 'nominal', defaultRate: MORTGAGE_FALLBACK_RATE,
    });
  }

  FP.loan = { monthlyRate, yearlyRate, paymentFor, monthsFor, rateFor, resolve, forDebt, forMortgage, MORTGAGE_FALLBACK_RATE };
})(globalThis.FP = globalThis.FP || {});
