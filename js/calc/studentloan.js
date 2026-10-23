/*
 * Student loan balance rules: interest and write-off. Pure functions, no DOM.
 * Repayments themselves are worked out with pay (FP.tax); this file covers the
 * balance, so the projection can show when a loan is repaid or written off.
 */
(function (FP) {
  'use strict';

  /*
   * Interest rate (% a year) for a plan: RPI plus the plan's margin.
   * `income` is yearly pay for student loan purposes (Plan 2's margin slides
   * from 0% at the repayment threshold to marginMax at the upper threshold).
   * opts.rpi: RPI to use; when omitted, the published RPI and cap for the
   *   current interest year apply.
   * opts.override: the user's own rate, which always wins.
   */
  function interestRate(plan, income, cfg, opts) {
    opts = opts || {};
    if (opts.override != null) return opts.override;
    cfg = cfg || FP.taxConfig;
    const rule = cfg.studentLoans[plan];
    if (!rule) return 0;
    let margin = rule.margin || 0;
    if (rule.marginMax != null) {
      const lo = rule.threshold;
      const hi = rule.interestUpperThreshold;
      const share = hi > lo ? Math.min(1, Math.max(0, ((income || 0) - lo) / (hi - lo))) : 0;
      margin += (rule.marginMax - margin) * share;
    }
    const published = opts.rpi == null;
    const rate = (published ? cfg.studentLoanInterest.rpi : opts.rpi) + margin;
    return published && cfg.studentLoanInterest.cap != null ? Math.min(rate, cfg.studentLoanInterest.cap) : rate;
  }

  // Whether the published rates apply in a given month ('YYYY-MM' or year/month).
  function publishedRatesApply(year, month, cfg) {
    const [y, m] = (cfg || FP.taxConfig).studentLoanInterest.until.split('-').map(Number);
    return year < y || (year === y && month <= m);
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

  FP.studentLoan = { interestRate, publishedRatesApply, writeOffYear, tracked };
})(globalThis.FP = globalThis.FP || {});
