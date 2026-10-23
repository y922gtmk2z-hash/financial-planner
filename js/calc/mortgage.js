/*
 * Repayment mortgage maths. Pure functions, no DOM. Rates are % a year,
 * interest is charged monthly at rate / 12.
 */
(function (FP) {
  'use strict';

  const EPSILON = 0.005; // half a penny

  // Contractual monthly payment that clears `balance` over `termMonths`.
  function monthlyPayment(balance, annualRatePct, termMonths) {
    if (!(balance > 0)) return 0;
    if (!(termMonths > 0)) return balance; // term has run out: everything is due
    const r = (annualRatePct || 0) / 100 / 12;
    if (r === 0) return balance / termMonths;
    return (balance * r) / (1 - Math.pow(1 + r, -termMonths));
  }

  /*
   * Month-by-month amortisation. The contractual payment stays fixed, so
   * overpayments shorten the term (the usual UK default). If the rate changes,
   * the payment is recalculated over the term that remains, as lenders do.
   *
   * opts: { balance, annualRatePct, termMonths, monthlyOverpayment,
   *         rateChange: { afterMonths, annualRatePct } | null }
   * Returns { months, totalInterest, totalPaid, yearEndBalances, payment }
   *   yearEndBalances[i] = balance after (i + 1) years.
   */
  function amortise(opts) {
    let balance = Math.max(0, opts.balance || 0);
    const termMonths = Math.max(0, Math.round(opts.termMonths || 0));
    const over = Math.max(0, opts.monthlyOverpayment || 0);
    const change = opts.rateChange;
    let rate = opts.annualRatePct || 0;
    let payment = monthlyPayment(balance, rate, termMonths);
    const initialPayment = payment;

    let months = 0;
    let totalInterest = 0;
    let totalPaid = 0;
    const yearEndBalances = [];
    const cap = Math.max(termMonths, 1);

    while (balance > EPSILON && months < cap) {
      if (change && change.afterMonths === months && months > 0) {
        rate = change.annualRatePct || 0;
        payment = monthlyPayment(balance, rate, termMonths - months);
      }
      const interest = balance * (rate / 100 / 12);
      const due = balance + interest;
      const paid = Math.min(due, payment + over);
      balance = due - paid;
      totalInterest += interest;
      totalPaid += paid;
      months += 1;
      if (months % 12 === 0) yearEndBalances.push(balance > EPSILON ? balance : 0);
    }
    if (balance <= EPSILON) balance = 0;
    if (months % 12 !== 0) yearEndBalances.push(balance);

    return { months, totalInterest, totalPaid, yearEndBalances, payment: initialPayment, remainingBalance: balance };
  }

  // Overpayments above `limitPct` of the balance in a year often trigger a charge.
  function overpaymentLimit(balance, monthlyOverpayment, limitPct) {
    const yearly = Math.max(0, monthlyOverpayment || 0) * 12;
    const allowance = Math.max(0, balance || 0) * (limitPct || 0) / 100;
    return { yearly, allowance, exceeds: yearly > allowance + EPSILON && yearly > 0 };
  }

  FP.mortgage = { monthlyPayment, amortise, overpaymentLimit };
})(globalThis.FP = globalThis.FP || {});
