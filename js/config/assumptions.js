/*
 * Every number the model depends on is defined here, once.
 * Each default records the date it was set so you can tell when it may be stale.
 * Values are edited in the Assumptions panel and stored in profile.assumptions.
 */
(function (FP) {
  'use strict';

  const SET_ON = '2026-10-23';
  // Asset classes and model mixes (brief 10).
  const MIX_SET_ON = '2026-10-25';

  const GROUPS = [
    { id: 'economy', label: 'Economy' },
    { id: 'returns', label: 'Savings interest & fees' },
    { id: 'mix', label: 'Shares, bonds & cash' },
    { id: 'borrowing', label: 'Mortgage & debts' },
    { id: 'pension', label: 'Pension & retirement' },
    { id: 'tax', label: 'Tax & State Pension in projections' },
  ];

  // unit: 'pct' (% per year), 'pts' (percentage points a year), 'pctOfPay', 'pctOfBalance',
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
      key: 'investmentFees', group: 'returns', label: 'Investment fees', unit: 'pct',
      default: 0.4, min: 0, max: 5, setOn: SET_ON, advanced: true,
      help: 'Platform and fund charges on ISAs and other investments, taken off their growth each year.',
    },
    {
      key: 'pensionFees', group: 'returns', label: 'Pension fees', unit: 'pct',
      default: 0.5, min: 0, max: 5, setOn: SET_ON, advanced: true,
      help: 'Pension provider and fund charges, taken off the growth each year.',
    },
    // What ISAs, other investments and pension pots grow at comes from what
    // each is invested in (its mix of shares, bonds and cash, in Your figures).
    {
      key: 'sharesReturn', group: 'mix', label: 'Shares: return (before fees)', unit: 'pct',
      default: 6.5, min: -20, max: 20, setOn: MIX_SET_ON,
      help: 'Average yearly growth of shares (equities) over the long run, before fees. A long-run assumption, not a forecast.',
    },
    {
      key: 'sharesVolatility', group: 'mix', label: 'Shares: how much returns vary', unit: 'pct',
      default: 16, min: 0, max: 50, setOn: MIX_SET_ON, advanced: true,
      help: 'Volatility: how far a typical year\u2019s return is from the average. Shares can fall a lot in a bad year. Used to show the size of falls, not in the projection.',
    },
    {
      key: 'bondsReturn', group: 'mix', label: 'Bonds: return (before fees)', unit: 'pct',
      default: 4.0, min: -20, max: 20, setOn: MIX_SET_ON,
      help: 'Average yearly growth of bonds (gilts and corporate bonds) over the long run, before fees.',
    },
    {
      key: 'bondsVolatility', group: 'mix', label: 'Bonds: how much returns vary', unit: 'pct',
      default: 6, min: 0, max: 50, setOn: MIX_SET_ON, advanced: true,
      help: 'Volatility of bonds. Lower than shares, but bonds can still fall, especially when interest rates rise.',
    },
    {
      key: 'cashReturn', group: 'mix', label: 'Cash in a pot: return (before fees)', unit: 'pct',
      default: 3.5, min: -20, max: 20, setOn: MIX_SET_ON,
      help: 'Cash and cash-like funds held inside an ISA or pension. Your cash savings use the savings interest rate instead.',
    },
    {
      key: 'cashVolatility', group: 'mix', label: 'Cash in a pot: how much returns vary', unit: 'pct',
      default: 1, min: 0, max: 50, setOn: MIX_SET_ON, advanced: true,
      help: 'Volatility of cash held in a pot. Small, though it can lose value against rising prices.',
    },
    {
      key: 'marketShift', group: 'mix', label: 'Shares and bonds: change to returns', unit: 'pts',
      default: 0, min: -30, max: 30, setOn: MIX_SET_ON, advanced: true,
      help: 'Points added to shares and bonds returns, for weaker or stronger markets. The Weaker markets what-if sets it to \u22122. Saves from before mixes keep any investment or pension return you\u2019d changed here.',
    },
    {
      key: 'mortgageRate', group: 'borrowing', label: 'Mortgage interest rate', unit: 'pct',
      default: null, nullable: true, min: 0, max: 25, setOn: SET_ON,
      help: 'The yearly rate on your mortgage today (not the APRC). Entered in Your figures. If it\u2019s blank it\u2019s worked out from your monthly payment, or 4.5% is used.',
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
      help: 'Used for any debt in Your figures where you leave the rate blank.',
    },
    {
      key: 'overpaymentLimitPct', group: 'borrowing', label: 'Overpayment warning level', unit: 'pctOfBalance',
      default: 10, min: 0, max: 100, setOn: SET_ON, advanced: true,
      help: 'Warn when yearly overpayments exceed this share of the balance. 10% is a common early-repayment-charge limit — check your own deal.',
    },
    {
      key: 'capOverpayments', group: 'borrowing', label: 'Overpaying from leftover money', unit: 'choice',
      default: 'limit', setOn: SET_ON, advanced: true,
      options: [
        { value: 'limit', label: 'Stay within the overpayment limit' },
        { value: 'none', label: 'No limit' },
      ],
      help: 'With the limit, the mortgage share of your leftover money stops at the overpayment warning level each year, and the rest goes to your other choices. Your fixed monthly overpayment in Your figures isn\u2019t limited.',
    },
    {
      key: 'employeePensionPct', group: 'pension', label: 'Your pension contribution', unit: 'pctOfPay',
      default: 5, min: 0, max: 100, setOn: SET_ON,
      help: 'Share of gross salary you pay into your pension. Entered in Your figures.',
    },
    {
      key: 'employerPensionPct', group: 'pension', label: 'Employer pension contribution', unit: 'pctOfPay',
      default: 3, min: 0, max: 100, setOn: SET_ON,
      help: 'Share of gross salary your employer adds. Entered in Your figures.',
    },
    {
      key: 'retirementAge', group: 'pension', label: 'Retirement age', unit: 'age',
      default: 67, min: 40, max: 80, setOn: SET_ON,
      help: 'When salary and pension contributions stop in projections.',
    },
    {
      key: 'lifeExpectancy', group: 'pension', label: 'Life expectancy', unit: 'age',
      default: 86, min: 60, max: 110, setOn: SET_ON,
      help: 'How long a first look at your plan pays for retirement. 86 is about average for someone aged 65 in the UK, men and women together (ONS cohort projections: 84.8 for men, 87.5 for women). Many people live longer, so the full plan runs to the projection end age.',
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
      key: 'studentLoanInterest', group: 'tax', label: 'Student loan interest in future years', unit: 'choice',
      default: 'current', setOn: SET_ON,
      options: [
        { value: 'current', label: 'Stay at current rates' },
        { value: 'inflation', label: 'Follow inflation (as RPI) plus the plan\u2019s margin' },
      ],
      help: 'Current rates are those published for September 2026 to August 2027 (RPI 4.1%; Plan 2 and postgraduate capped at 6%). Following inflation uses your inflation assumption as RPI from September 2027, with no cap. Your own rate in Your figures overrides both.',
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
      help: 'Regular ISA savings use this first. Leftover money you choose to invest then goes into your ISA up to what\u2019s left, then into a general investment account.',
    },
    {
      key: 'cashIsaLimit', group: 'tax', label: 'Cash ISA limit (from April 2027)', unit: 'money',
      default: 12000, min: 0, max: 100000, setOn: SET_ON, advanced: true,
      help: 'From 6 April 2027, under-65s can put at most this much a year into cash ISAs, within the overall ISA allowance. Over-65s are exempt. Cash saved above it stays as ordinary cash savings.',
    },
  ];

  const UNIT_SUFFIX = {
    pct: '% a year', pts: 'points a year', pctOfPay: '% of salary', pctOfBalance: '% of balance',
    age: 'years old', year: 'years', money: 'a year', choice: '',
  };

  /*
   * Mixes: what a pot is invested in, as percentages adding up to 100.
   * DEFAULT_MIX is what a pot has until you change it: at the default returns
   * it grows at 5% a year before fees, as every pot did before mixes.
   * MODEL_MIXES are illustrations for people with each risk level (the risk
   * question in About you), not recommendations: no products or funds.
   */
  const MIX_KEYS = ['shares', 'bonds', 'cash'];
  const DEFAULT_MIX = { shares: 40, bonds: 60, cash: 0 };
  const MODEL_MIXES = {
    setOn: MIX_SET_ON,
    cautious: { shares: 20, bonds: 60, cash: 20 },
    balanced: { shares: 60, bonds: 35, cash: 5 },
    adventurous: { shares: 90, bonds: 10, cash: 0 },
  };

  function defaults() {
    const out = {};
    DEFS.forEach((d) => { out[d.key] = d.default; });
    return out;
  }

  function def(key) {
    return DEFS.find((d) => d.key === key);
  }

  FP.assumptions = { GROUPS, DEFS, UNIT_SUFFIX, MIX_KEYS, DEFAULT_MIX, MODEL_MIXES, defaults, def };
})(globalThis.FP = globalThis.FP || {});
