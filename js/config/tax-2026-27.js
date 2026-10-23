/*
 * UK income tax, National Insurance and student loan rules for ONE tax year.
 *
 *   TAX YEAR 2026/27 — 6 April 2026 to 5 April 2027
 *
 * !! These figures change. Check every value against HMRC / gov.scot / gov.uk
 * !! at the start of each tax year, then copy this file to tax-YYYY-YY.js,
 * !! update it and point index.html (and tests/load.js) at the new file.
 *
 * Band limits are in TAXABLE income (after the personal allowance), which is
 * how HMRC defines them. `grossLabel` shows the familiar salary figure assuming
 * the full £12,570 allowance.
 */
(function (FP) {
  'use strict';

  FP.taxConfig = {
    taxYear: '2026/27',
    yearStart: '2026-04-06',
    yearEnd: '2027-04-05',
    checkedOn: '2026-10-23',
    sources: [
      { label: 'HMRC: Income Tax rates and allowances', url: 'https://www.gov.uk/government/publications/rates-and-allowances-income-tax' },
      { label: 'HMRC: National Insurance rates and thresholds', url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027' },
      { label: 'Scottish Government: Scottish Income Tax 2026 to 2027', url: 'https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/' },
      { label: 'gov.uk: Repaying your student loan', url: 'https://www.gov.uk/repaying-your-student-loan/what-you-pay' },
      { label: 'gov.uk: Student loan interest rates', url: 'https://www.gov.uk/government/news/student-loans-interest-rates-and-repayment-threshold-announcement--7' },
      { label: 'gov.uk: When your student loan gets written off', url: 'https://www.gov.uk/repaying-your-student-loan/when-your-student-loan-gets-written-off-or-cancelled' },
      { label: 'gov.uk: Tax on company cars', url: 'https://www.gov.uk/tax-company-benefits/tax-on-company-cars' },
      { label: 'gov.uk: Salary sacrifice for employees', url: 'https://www.gov.uk/guidance/salary-sacrifice-and-the-effects-on-paye' },
    ],

    personalAllowance: 12570,
    // The allowance falls by £1 for every £2 of adjusted net income over £100,000,
    // reaching zero at £125,140.
    taperThreshold: 100000,
    taperRate: 0.5,

    // upTo = top of the band in taxable income; null = no upper limit.
    bands: {
      rUK: [
        { name: 'Basic rate', rate: 20, upTo: 37700, grossLabel: '£12,571 to £50,270' },
        { name: 'Higher rate', rate: 40, upTo: 125140, grossLabel: '£50,271 to £125,140' },
        { name: 'Additional rate', rate: 45, upTo: null, grossLabel: 'over £125,140' },
      ],
      scotland: [
        { name: 'Starter rate', rate: 19, upTo: 3967, grossLabel: '£12,571 to £16,537' },
        { name: 'Basic rate', rate: 20, upTo: 16956, grossLabel: '£16,538 to £29,526' },
        { name: 'Intermediate rate', rate: 21, upTo: 31092, grossLabel: '£29,527 to £43,662' },
        { name: 'Higher rate', rate: 42, upTo: 62430, grossLabel: '£43,663 to £75,000' },
        { name: 'Advanced rate', rate: 45, upTo: 125140, grossLabel: '£75,001 to £125,140' },
        { name: 'Top rate', rate: 48, upTo: null, grossLabel: 'over £125,140' },
      ],
    },

    // Employee (Class 1 primary) National Insurance, worked out on yearly pay.
    nationalInsurance: {
      primaryThreshold: 12570,
      upperEarningsLimit: 50270,
      mainRate: 8,
      upperRate: 2,
    },

    // Yearly repayment thresholds; repay `rate`% of income above the threshold.
    //
    // Interest is RPI plus a margin. RPI is set each year (from the previous
    // March), so projections use your inflation assumption from the end of the
    // current interest year:
    //   Plan 1 and Plan 4: RPI (strictly the lower of RPI and Bank of England
    //     base rate + 1%; base rate isn't modelled).
    //   Plan 2: RPI + 0% at the repayment threshold, sliding to RPI + 3% at
    //     interestUpperThreshold and above.
    //   Plan 5: RPI.  Postgraduate: RPI + 3%.
    // studentLoanInterest holds the published rates for the current interest
    // year (1 Sep 2026 to 31 Aug 2027: RPI 4.1%, with a temporary 6% cap on
    // Plan 2 and postgraduate loans). Check them every September.
    //
    // writeOffYears: written off this many years after the April you were first
    //   due to repay (newer loans; some older Plan 1 and Plan 4 loans end at 65).
    studentLoans: {
      plan1: { threshold: 26900, rate: 9, margin: 0, writeOffYears: 25 },
      plan2: { threshold: 29385, rate: 9, margin: 0, marginMax: 3, interestUpperThreshold: 52885, writeOffYears: 30 },
      plan4: { threshold: 33795, rate: 9, margin: 0, writeOffYears: 30 },
      plan5: { threshold: 25000, rate: 9, margin: 0, writeOffYears: 40 },
      postgrad: { threshold: 21000, rate: 6, margin: 3, writeOffYears: 30 },
    },
    studentLoanInterest: {
      // Published rates apply up to and including this month (YYYY-MM).
      until: '2027-08',
      rpi: 4.1,
      cap: 6.0, // temporary cap for this interest year only
    },

    // Company car benefit in kind: % of the car's list price (P11D value) that's
    // taxed as income. Fully electric cars: 4% in 2026/27 (5% in 2027/28, then
    // 7% and 9%). Used as the default for a new car salary sacrifice.
    electricCarBikPct: 4,

    // ISAs: the cash ISA limit (an assumption, £12,000 by default) applies from
    // this month to people under this age. The overall allowance is an assumption too.
    isa: { cashLimitFrom: '2027-04', cashLimitExemptAge: 65 },

    // Relief-at-source pensions: the provider claims this rate back on your behalf.
    reliefAtSourceRate: 20,
  };
})(globalThis.FP = globalThis.FP || {});
