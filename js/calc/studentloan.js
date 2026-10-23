/*
 * Student loan balance rules: interest and write-off. Pure functions, no DOM.
 * Repayments themselves are worked out with pay (FP.tax); this file covers the
 * balance, so the projection can show when a loan is paid off or written off.
 */
(function (FP) {
  'use strict';

  /*
   * Interest rate (% a year) for a plan. `income` is yearly pay for student loan
   * purposes; Plan 2 slides from its minimum at the repayment threshold to its
   * maximum at the upper threshold. `override` (if set) wins.
   */
  function interestRate(plan, income, cfg, override) {
    if (override != null) return override;
    const rule = (cfg || FP.taxConfig).studentLoans[plan];
    if (!rule) return 0;
    if (rule.interest != null) return rule.interest;
    const lo = rule.threshold;
    const hi = rule.interestUpperThreshold;
    const share = hi > lo ? Math.min(1, Math.max(0, ((income || 0) - lo) / (hi - lo))) : 0;
    return rule.interestMin + (rule.interestMax - rule.interestMin) * share;
  }

  // Calendar year the loan is written off (in April), or null if unknown.
  function writeOffYear(plan, firstRepaymentYear, cfg) {
    const rule = (cfg || FP.taxConfig).studentLoans[plan];
    if (!rule || firstRepaymentYear == null) return null;
    return firstRepaymentYear + rule.writeOffYears;
  }

  // Whether the profile has a loan balance to track.
  function tracked(profile) {
    const inc = profile.income;
    return inc.studentLoanPlan !== 'none' && (inc.studentLoanBalance || 0) > 0;
  }

  FP.studentLoan = { interestRate, writeOffYear, tracked };
})(globalThis.FP = globalThis.FP || {});
