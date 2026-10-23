/*
 * Every number the model depends on is defined here, once.
 * Each default records the date it was set so you can tell when it may be stale.
 * Values are edited in the Assumptions panel and stored in profile.assumptions.
 */
(function (FP) {
  'use strict';

  const SET_ON = '2026-10-23';

  const GROUPS = [
    { id: 'economy', label: 'Economy' },
    { id: 'returns', label: 'Savings & investment returns' },
    { id: 'borrowing', label: 'Mortgage & debts' },
    { id: 'pension', label: 'Pension & retirement' },
    { id: 'tax', label: 'Tax & State Pension in projections' },
    { id: 'split', label: 'Where your surplus goes' },
  ];

  // unit: 'pct' (% per year), 'pctOfPay', 'pctOfBalance', 'pctOfSurplus',
  //       'age', 'year', 'money' (£ a year), 'choice' (one of `options`)
  const DEFS = [
    {
      key: 'inflation', group: 'economy', label: 'Inflation (CPI)', unit: 'pct',
      default: 2.5, min: -5, max: 20, setOn: SET_ON,
      help: 'How fast prices rise each year. Used to show future values in today’s money.',
    },
    {
      key: 'salaryGrowth', group: 'economy', label: 'Salary growth', unit: 'pct',
      default: 3.0, min: -10, max: 20, setOn: SET_ON,
      help: 'How much your gross salary rises each year on average.',
    },
    {
      key: 'spendingGrowth', group: 'economy', label: 'Spending growth', unit: 'pct',
      default: 2.5, min: -10, max: 20, setOn: SET_ON, advanced: true,
      help: 'How fast your monthly spending rises each year. Usually set to match inflation.',
    },
    {
      key: 'housePriceGrowth', group: 'economy', label: 'House price growth', unit: 'pct',
      default: 3.0, min: -20, max: 20, setOn: SET_ON,
      help: 'Average yearly change in your home’s value.',
    },
    {
      key: 'savingsRate', group: 'returns', label: 'Savings interest rate', unit: 'pct',
      default: 3.5, min: 0, max: 20, setOn: SET_ON,
      help: 'Interest on cash savings. Enter it after any tax — the planner does not model savings tax.',
    },
    {
      key: 'investmentReturn', group: 'returns', label: 'Investment return (before fees)', unit: 'pct',
      default: 5.0, min: -20, max: 20, setOn: SET_ON,
      help: 'Average yearly growth of ISA and general investment accounts, before fees.',
    },
    {
      key: 'investmentFees', group: 'returns', label: 'Investment fees', unit: 'pct',
      default: 0.4, min: 0, max: 5, setOn: SET_ON, advanced: true,
      help: 'Platform and fund charges, taken off the return each year.',
    },
    {
      key: 'pensionGrowth', group: 'returns', label: 'Pension growth (before fees)', unit: 'pct',
      default: 5.0, min: -20, max: 20, setOn: SET_ON,
      help: 'Average yearly growth of your pension pot, before fees.',
    },
    {
      key: 'pensionFees', group: 'returns', label: 'Pension fees', unit: 'pct',
      default: 0.5, min: 0, max: 5, setOn: SET_ON, advanced: true,
      help: 'Pension provider and fund charges, taken off the growth each year.',
    },
    {
      key: 'mortgageRate', group: 'borrowing', label: 'Mortgage interest rate', unit: 'pct',
      default: 4.5, min: 0, max: 25, setOn: SET_ON,
      help: 'The rate on your mortgage today. Also shown in Setup — both edit the same value.',
    },
    {
      key: 'mortgageRateChangeYear', group: 'borrowing', label: 'Rate changes after (years)', unit: 'year',
      default: null, nullable: true, min: 1, max: 40, setOn: SET_ON, advanced: true,
      help: 'Optional. For example, when a fixed deal ends. Leave blank for no change.',
    },
    {
      key: 'mortgageRateAfterChange', group: 'borrowing', label: 'New mortgage rate', unit: 'pct',
      default: null, nullable: true, min: 0, max: 25, setOn: SET_ON, advanced: true,
      help: 'The rate after the change above. Leave blank for no change.',
    },
    {
      key: 'otherDebtRate', group: 'borrowing', label: 'Default rate for other debts', unit: 'pct',
      default: 7.0, min: 0, max: 100, setOn: SET_ON,
      help: 'Used for any debt in Setup where you leave the rate blank.',
    },
    {
      key: 'overpaymentLimitPct', group: 'borrowing', label: 'Overpayment warning level', unit: 'pctOfBalance',
      default: 10, min: 0, max: 100, setOn: SET_ON, advanced: true,
      help: 'Warn when yearly overpayments exceed this share of the balance. 10% is a common early-repayment-charge limit — check your own deal.',
    },
    {
      key: 'employeePensionPct', group: 'pension', label: 'Your pension contribution', unit: 'pctOfPay',
      default: 5, min: 0, max: 100, setOn: SET_ON,
      help: 'Share of gross salary you pay into your pension. Also shown in Setup.',
    },
    {
      key: 'employerPensionPct', group: 'pension', label: 'Employer pension contribution', unit: 'pctOfPay',
      default: 3, min: 0, max: 100, setOn: SET_ON,
      help: 'Share of gross salary your employer adds. Also shown in Setup.',
    },
    {
      key: 'retirementAge', group: 'pension', label: 'Retirement age', unit: 'age',
      default: 67, min: 40, max: 80, setOn: SET_ON,
      help: 'When salary and pension contributions stop in projections.',
    },
    {
      key: 'endAge', group: 'pension', label: 'Projection end age', unit: 'age',
      default: 95, min: 50, max: 110, setOn: SET_ON, advanced: true,
      help: 'How far ahead projections run (capped at 40 years from today).',
    },
    {
      key: 'pensionAccessAge', group: 'pension', label: 'Age you can take your pension', unit: 'age',
      default: 57, min: 50, max: 75, setOn: SET_ON, advanced: true,
      help: 'The normal minimum pension age rises from 55 to 57 in April 2028. Your pension can\u2019t be drawn before this age.',
    },
    {
      key: 'taxThresholds', group: 'tax', label: 'Tax thresholds in future years', unit: 'choice',
      default: 'frozen', setOn: SET_ON,
      options: [
        { value: 'frozen', label: 'Stay frozen at today\u2019s levels' },
        { value: 'inflation', label: 'Rise with inflation' },
      ],
      help: 'Applies to the personal allowance, tax bands, NI thresholds and student loan thresholds. Frozen thresholds mean more of a rising salary is taxed (\u201cfiscal drag\u201d). Rates stay as they are today.',
    },
    {
      key: 'statePension', group: 'tax', label: 'State Pension (today\u2019s money)', unit: 'money',
      default: 12547.6, min: 0, max: 50000, setOn: SET_ON,
      help: 'Full new State Pension for 2026/27 is \u00a3241.30 a week. Check your own forecast on GOV.UK \u2014 set to 0 if you won\u2019t get it. Rises with inflation in projections.',
    },
    {
      key: 'statePensionAge', group: 'tax', label: 'State Pension age', unit: 'age',
      default: 67, min: 60, max: 75, setOn: SET_ON,
      help: 'Currently 67 for most people, rising to 68 for those born after April 1977 (timing under review). Check yours on GOV.UK.',
    },
    {
      key: 'isaAllowance', group: 'tax', label: 'ISA allowance', unit: 'money',
      default: 20000, min: 0, max: 100000, setOn: SET_ON, advanced: true,
      help: 'Surplus put into investments goes into your ISA up to this amount a year, then into a general investment account.',
    },
    {
      key: 'splitCash', group: 'split', label: 'Cash savings', unit: 'pctOfSurplus',
      default: 30, min: 0, max: 100, setOn: SET_ON,
      help: 'Share of each year\u2019s surplus added to cash savings.',
    },
    {
      key: 'splitInvest', group: 'split', label: 'Investments', unit: 'pctOfSurplus',
      default: 50, min: 0, max: 100, setOn: SET_ON,
      help: 'Share invested \u2014 into your ISA first, then a general investment account.',
    },
    {
      key: 'splitMortgage', group: 'split', label: 'Mortgage overpayments', unit: 'pctOfSurplus',
      default: 10, min: 0, max: 100, setOn: SET_ON,
      help: 'Share paid off the mortgage as a yearly lump sum. Goes to cash once the mortgage is cleared.',
    },
    {
      key: 'splitPension', group: 'split', label: 'Extra pension contributions', unit: 'pctOfSurplus',
      default: 10, min: 0, max: 100, setOn: SET_ON,
      help: 'Share paid into your pension, with 20% basic-rate tax relief added. Goes to cash once you retire.',
    },
  ];

  const UNIT_SUFFIX = {
    pct: '% a year', pctOfPay: '% of salary', pctOfBalance: '% of balance', pctOfSurplus: '% of surplus',
    age: 'years old', year: 'years', money: 'a year', choice: '',
  };

  const SPLIT_KEYS = ['splitCash', 'splitInvest', 'splitMortgage', 'splitPension'];

  function defaults() {
    const out = {};
    DEFS.forEach((d) => { out[d.key] = d.default; });
    return out;
  }

  function def(key) {
    return DEFS.find((d) => d.key === key);
  }

  FP.assumptions = { GROUPS, DEFS, UNIT_SUFFIX, SPLIT_KEYS, defaults, def };
})(globalThis.FP = globalThis.FP || {});
