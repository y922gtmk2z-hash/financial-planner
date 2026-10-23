/*
 * Today's position: net worth, home equity, mortgage and monthly cash flow.
 * Pure function of the profile (plus optional take-home pay). No DOM.
 */
(function (FP) {
  'use strict';

  const ASSET_ITEMS = [
    { key: 'homeValue', label: 'Home' },
    { key: 'cashSavings', label: 'Cash savings' },
    { key: 'isa', label: 'ISA investments' },
    { key: 'gia', label: 'Other investments' },
    { key: 'pension', label: 'Pensions' },
    { key: 'other', label: 'Other assets' },
  ];

  function num(v) {
    return Number.isFinite(v) ? v : 0;
  }

  function debtRate(debt, assumptions) {
    return debt.rate == null ? assumptions.otherDebtRate : debt.rate;
  }

  /*
   * takeHomeMonthly: monthly net pay, or null when not yet calculated.
   */
  function compute(profile, takeHomeMonthly) {
    const a = profile.assumptions;
    const warnings = [];

    const assetItems = ASSET_ITEMS.map((i) => ({ key: i.key, label: i.label, value: num(profile.assets[i.key]) }));
    const totalAssets = assetItems.reduce((s, i) => s + i.value, 0);

    const m = profile.mortgage;
    const mBalance = num(m.balance);
    const termMonths = Math.round(num(m.remainingTermYears) * 12);
    const rateChange = a.mortgageRateChangeYear != null && a.mortgageRateAfterChange != null
      ? { afterMonths: a.mortgageRateChangeYear * 12, annualRatePct: a.mortgageRateAfterChange }
      : null;

    let mortgage = null;
    if (mBalance > 0) {
      if (termMonths <= 0) {
        warnings.push({ level: 'warn', text: 'Enter the years left on your mortgage to work out the monthly payment.' });
      }
      const base = { balance: mBalance, annualRatePct: a.mortgageRate, termMonths, rateChange };
      const withOver = FP.mortgage.amortise({ ...base, monthlyOverpayment: num(m.monthlyOverpayment) });
      const without = FP.mortgage.amortise({ ...base, monthlyOverpayment: 0 });
      const limit = FP.mortgage.overpaymentLimit(mBalance, m.monthlyOverpayment, a.overpaymentLimitPct);
      if (limit.exceeds) {
        warnings.push({
          level: 'warn',
          text: `Your overpayments (${fmt(limit.yearly)} a year) are more than ${a.overpaymentLimitPct}% of the balance (${fmt(limit.allowance)}). Many lenders charge an early repayment fee above this — check your deal.`,
        });
      }
      mortgage = {
        balance: mBalance,
        termMonths,
        rate: a.mortgageRate,
        payment: termMonths > 0 ? withOver.payment : 0,
        overpayment: num(m.monthlyOverpayment),
        monthsToClear: withOver.months,
        monthsToClearWithoutOver: without.months,
        interestSaved: Math.max(0, without.totalInterest - withOver.totalInterest),
        totalInterest: withOver.totalInterest,
        overpaymentLimit: limit,
      };
    }

    const debts = profile.debts.map((d) => {
      const rate = debtRate(d, a);
      const balance = num(d.balance);
      const payment = num(d.monthlyPayment);
      const monthlyInterest = balance * rate / 100 / 12;
      if (balance > 0 && payment <= monthlyInterest) {
        warnings.push({
          level: 'warn',
          text: `${d.name || 'A debt'}: the monthly payment doesn’t cover the interest (about ${fmt(monthlyInterest)} a month), so the balance won’t go down.`,
        });
      }
      return { id: d.id, name: d.name || 'Unnamed debt', balance, rate, rateIsDefault: d.rate == null, payment };
    });

    const totalDebts = debts.reduce((s, d) => s + d.balance, 0);
    const liabilityItems = [
      { key: 'mortgage', label: 'Mortgage', value: mBalance },
      { key: 'debts', label: 'Other debts', value: totalDebts },
    ];
    const totalLiabilities = mBalance + totalDebts;

    const homeValue = num(profile.assets.homeValue);
    const home = {
      value: homeValue,
      mortgageBalance: mBalance,
      equity: homeValue - mBalance,
      ltvPct: homeValue > 0 ? (mBalance / homeValue) * 100 : null,
    };
    if (homeValue === 0 && mBalance > 0) {
      warnings.push({ level: 'info', text: 'You have a mortgage balance but no home value. Add your home value in Setup to see your equity.' });
    }

    const spendingMonthly = profile.spending.reduce((s, r) => s + num(r.monthly), 0);
    const mortgageMonthly = mortgage ? mortgage.payment + mortgage.overpayment : 0;
    const debtMonthly = debts.reduce((s, d) => s + (d.balance > 0 ? d.payment : 0), 0);
    const outgoings = spendingMonthly + mortgageMonthly + debtMonthly;
    const hasTakeHome = Number.isFinite(takeHomeMonthly);
    if (hasTakeHome && takeHomeMonthly - outgoings < 0) {
      warnings.push({
        level: 'warn',
        text: `You\u2019re spending about ${fmt(outgoings - takeHomeMonthly)} a month more than you take home.`,
      });
    }

    return {
      assets: { items: assetItems, total: totalAssets },
      liabilities: { items: liabilityItems, total: totalLiabilities },
      netWorth: totalAssets - totalLiabilities,
      home,
      mortgage,
      debts,
      cashFlow: {
        takeHomeMonthly: hasTakeHome ? takeHomeMonthly : null,
        spendingMonthly,
        mortgageMonthly,
        debtMonthly,
        outgoings,
        surplus: hasTakeHome ? takeHomeMonthly - outgoings : null,
      },
      warnings,
    };
  }

  function fmt(n) {
    return `£${Math.round(n).toLocaleString('en-GB')}`;
  }

  FP.summary = { compute, ASSET_ITEMS, debtRate };
})(globalThis.FP = globalThis.FP || {});
