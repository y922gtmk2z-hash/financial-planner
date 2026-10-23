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
    // interest: % a year for the interest year 1 Sep 2026 to 31 Aug 2027 (RPI 4.1%,
    //   with a temporary 6% cap on Plan 2 and postgraduate loans). Plan 2 interest
    //   slides from interestMin at the repayment threshold to interestMax at
    //   interestUpperThreshold. Rates are reset every September - check them.
    // writeOffYears: written off this many years after the April you were first
    //   due to repay (newer loans; some older Plan 1 and Plan 4 loans end at 65).
    studentLoans: {
      plan1: { threshold: 26900, rate: 9, interest: 4.1, writeOffYears: 25 },
      plan2: { threshold: 29385, rate: 9, interestMin: 4.1, interestMax: 6.0, interestUpperThreshold: 52885, writeOffYears: 30 },
      plan4: { threshold: 33795, rate: 9, interest: 4.1, writeOffYears: 30 },
      plan5: { threshold: 25000, rate: 9, interest: 4.1, writeOffYears: 40 },
      postgrad: { threshold: 21000, rate: 6, interest: 6.0, writeOffYears: 30 },
    },

    // Relief-at-source pensions: the provider claims this rate back on your behalf.
    reliefAtSourceRate: 20,
  };
})(globalThis.FP = globalThis.FP || {});
