/*
 * Clearly fictional sample household, so every screen has something to show.
 * Not based on any real person. Replace it from Setup or the Data screen.
 */
(function (FP) {
  'use strict';

  function sample() {
    return FP.profile.normalise({
      isSample: true,
      about: { age: 38 },
      assets: { homeValue: 325000, cashSavings: 14000, isa: 22000, gia: 3500, pension: 61000, other: 6000 },
      mortgage: { balance: 198000, remainingTermYears: 23, monthlyOverpayment: 150 },
      debts: [
        { id: 'sample-car', name: 'Car finance (sample)', balance: 7800, rate: 6.9, monthlyPayment: 245 },
        { id: 'sample-card', name: 'Credit card (sample)', balance: 1200, rate: null, monthlyPayment: 100 },
      ],
      income: {
        grossSalary: 56000,
        bonuses: [
          { id: 'sample-b1', amount: 2000, month: 'mar' },
          { id: 'sample-b2', amount: 500, month: 'dec' },
        ],
        studentLoanPlan: 'plan2',
        studentLoanBalance: 41000,
        studentLoanStartYear: 2017,
        region: 'rUK',
        pensionMethod: 'netPay',
      },
      savings: [
        { id: 'sample-sv1', type: 'ssIsa', monthly: 75, grows: 'salary' },
      ],
      // The example household has chosen what to do with its leftover money.
      leftover: { emergency: 10, debts: 0, cash: 20, invest: 50, mortgage: 10, pension: 10, emergencyMonths: 3 },
      spending: [
        { id: 'sample-s1', category: 'Bills & utilities', monthly: 260 },
        { id: 'sample-s2', category: 'Council tax', monthly: 175 },
        { id: 'sample-s3', category: 'Groceries', monthly: 420 },
        { id: 'sample-s4', category: 'Transport', monthly: 140 },
        { id: 'sample-s5', category: 'Childcare', monthly: 0 },
        { id: 'sample-s6', category: 'Insurance', monthly: 65 },
        { id: 'sample-s7', category: 'Eating out & leisure', monthly: 180 },
        { id: 'sample-s8', category: 'Holidays', monthly: 120 },
        { id: 'sample-s9', category: 'Other', monthly: 120 },
      ],
      assumptions: { ...FP.assumptions.defaults(), mortgageRate: 4.5 },
    });
  }

  // Sample workspace: the baseline plus two example scenarios to compare.
  function sampleWorkspace() {
    const ws = FP.scenarios.fromProfile(sample(), 'Baseline');
    const base = ws.scenarios[0].id;
    const early = FP.scenarios.clone(ws, base, 'Retire at 60 (sample)');
    early.profile.assumptions.retirementAge = 60;
    const markets = FP.scenarios.clone(ws, base, 'Stronger markets (sample)');
    Object.assign(markets.profile.assumptions, { investmentReturn: 7, pensionGrowth: 7, housePriceGrowth: 4 });
    ws.activeId = base;
    return ws;
  }

  FP.sample = sample;
  FP.sampleWorkspace = sampleWorkspace;
})(globalThis.FP = globalThis.FP || {});
