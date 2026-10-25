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

  // A debt's APR: yours, worked out from its payment and time left, or the default.
  function debtRate(debt, assumptions) {
    return FP.loan.forDebt(debt, assumptions).rate;
  }

  // Months left on the mortgage, from its term or worked out from its payment
  // (0 when unknown, or when the payment never clears it).
  function mortgageMonths(loan) {
    return Number.isFinite(loan.months) ? Math.ceil(loan.months - 1e-6) : 0;
  }

  /*
   * takeHomeMonthly: monthly net pay, or null when not yet calculated.
   */
  function compute(profile, takeHomeMonthly) {
    const a = profile.assumptions;
    const warnings = [];

    // Pension pots: your main pot, plus your partner's and any others (not defined benefit pensions, which pay an income).
    const otherPots = (profile.partner ? num(profile.partner.pension) : 0) + (profile.pensions || []).filter((x) => x.type === 'dc').reduce((t, x) => t + num(x.value), 0);
    const assetItems = ASSET_ITEMS.map((i) => ({ key: i.key, label: i.label, value: num(profile.assets[i.key]) + (i.key === 'pension' && otherPots ? otherPots : 0) }));
    const totalAssets = assetItems.reduce((s, i) => s + i.value, 0);

    const m = profile.mortgage;
    const mBalance = num(m.balance);
    const loan = FP.loan.forMortgage(profile);
    const termMonths = mortgageMonths(loan);
    const rateChange = a.mortgageRateChangeYear != null && a.mortgageRateAfterChange != null
      ? { afterMonths: a.mortgageRateChangeYear * 12, annualRatePct: a.mortgageRateAfterChange }
      : null;

    let mortgage = null;
    if (mBalance > 0) {
      if (loan.error) warnings.push({ level: 'warn', text: `Mortgage: ${loan.error}` });
      else if (loan.months === Infinity) warnings.push({ level: 'warn', text: 'Your mortgage payment doesn\u2019t cover the interest, so the balance won\u2019t go down. Check your payment and rate.' });
      else if (termMonths <= 0) warnings.push({ level: 'warn', text: 'Add the time left on your mortgage, or your monthly payment, to work out the rest.' });
      const base = { balance: mBalance, annualRatePct: loan.rate, termMonths, rateChange };
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
        rate: loan.rate,
        rateIsDefault: loan.rateIsDefault,
        worked: loan.worked,
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
      const loan = FP.loan.forDebt(d, a);
      const rate = loan.rate;
      const balance = num(d.balance);
      const payment = loan.payment;
      const monthlyInterest = balance * FP.loan.monthlyRate(rate, 'apr');
      if (loan.error) warnings.push({ level: 'warn', text: `${d.name || 'A debt'}: ${loan.error}` });
      else if (balance > 0 && payment <= monthlyInterest) {
        warnings.push({
          level: 'warn',
          text: `${d.name || 'A debt'}: the monthly payment doesn’t cover the interest (about ${fmt(monthlyInterest)} a month), so the balance won’t go down.`,
        });
      }
      return { id: d.id, name: d.name || 'Unnamed debt', balance, rate, rateIsDefault: loan.rateIsDefault, payment, months: loan.months, worked: loan.worked };
    });

    const totalDebts = debts.reduce((s, d) => s + d.balance, 0);
    // Student loan counts as a debt only when there's a plan and a balance.
    const studentLoan = FP.studentLoan.tracked(profile) ? num(profile.income.studentLoanBalance) : 0;
    const liabilityItems = [
      { key: 'mortgage', label: 'Mortgage', value: mBalance },
      { key: 'debts', label: 'Other debts', value: totalDebts },
      { key: 'studentLoan', label: 'Student loan', value: studentLoan },
    ];
    const totalLiabilities = mBalance + totalDebts + studentLoan;

    const homeValue = num(profile.assets.homeValue);
    const home = {
      value: homeValue,
      mortgageBalance: mBalance,
      equity: homeValue - mBalance,
      ltvPct: homeValue > 0 ? (mBalance / homeValue) * 100 : null,
    };
    if (homeValue === 0 && mBalance > 0) {
      warnings.push({ level: 'info', text: 'You have a mortgage balance but no home value. Add your home value in Your figures to see your equity.' });
    }

    const spendingMonthly = profile.spending.reduce((s, r) => s + num(r.monthly), 0);
    const mortgageMonthly = mortgage ? mortgage.payment + mortgage.overpayment : 0;
    // Extra student loan payments (only while there's a balance) count with your debt payments.
    const studentLoanExtraMonthly = FP.studentLoan.tracked(profile) ? num(profile.income.studentLoanOverpayment) : 0;
    const debtMonthly = debts.reduce((s, d) => s + (d.balance > 0 ? d.payment : 0), 0) + studentLoanExtraMonthly;
    const outgoings = spendingMonthly + mortgageMonthly + debtMonthly;
    // Regular savings come out of what's left after spending and debts.
    const saving = FP.savings.monthlyTotals(profile.savings);
    const hasTakeHome = Number.isFinite(takeHomeMonthly);
    if (hasTakeHome && takeHomeMonthly - outgoings < 0) {
      warnings.push({
        level: 'warn',
        text: `You\u2019re spending about ${fmt(outgoings - takeHomeMonthly)} a month more than you take home.`,
      });
    } else if (hasTakeHome && takeHomeMonthly - outgoings - saving.total < 0) {
      warnings.push({
        level: 'warn',
        text: `Your regular savings (${fmt(saving.total)} a month) are about ${fmt(saving.total - (takeHomeMonthly - outgoings))} more than you have left after spending and debts.`,
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
        studentLoanExtraMonthly,
        outgoings,
        // Left after spending and debts, before regular savings.
        available: hasTakeHome ? takeHomeMonthly - outgoings : null,
        savingsMonthly: saving.total,
        savings: saving,
        // Left after regular savings too.
        surplus: hasTakeHome ? takeHomeMonthly - outgoings - saving.total : null,
      },
      warnings,
    };
  }

  function fmt(n) {
    return `£${Math.round(n).toLocaleString('en-GB')}`;
  }

  /*
   * What's still missing from the profile. Blocking items stop the projection
   * being shown (without them it would be badly wrong); the others are worth
   * adding but can genuinely be zero. `target` is where to enter it in Your figures.
   */
  function checklist(profile) {
    const a = profile.assumptions;
    const age = profile.about.age;
    const working = age == null || age < a.retirementAge;
    const spend = profile.spending.reduce((t, r) => t + num(r.monthly), 0);
    const estimate = num((profile.outgoings || {}).estimate);
    const items = [
      { id: 'age', label: 'Your age', done: age != null, blocking: true, target: 'about.age',
        why: 'Needed to work out the years to retirement.' },
      { id: 'spending', label: 'What goes out each month', done: spend > 0 || estimate > 0, blocking: true, target: 'outgoings.estimate',
        why: 'Without it, everything you take home would look like savings.' },
      { id: 'salary', label: 'Your salary', done: !working || num(profile.income.grossSalary) > 0, blocking: false, target: 'income.grossSalary',
        why: 'Leave it blank if you\u2019re not working.' },
      { id: 'pension', label: 'Your pension pots', done: num(profile.assets.pension) > 0, blocking: false, target: 'assets.pension',
        why: 'Fine to leave blank if you don\u2019t have one yet.' },
      { id: 'cash', label: 'Your cash savings', done: num(profile.assets.cashSavings) > 0, blocking: false, target: 'assets.cashSavings',
        why: 'Used for your emergency fund.' },
    ];
    return {
      items,
      ready: items.every((i) => i.done || !i.blocking),
      blocking: items.filter((i) => i.blocking && !i.done),
      optional: items.filter((i) => !i.blocking && !i.done),
    };
  }

  /*
   * Your outgoings against your estimate of everything going out. itemised:
   * bills, other spending, mortgage and debt payments you've entered (a
   * payment counts once its debt has a balance); rest: what's left of the
   * estimate. Returns { estimate (or null), itemised, rest, total }.
   */
  function outgoings(profile) {
    const cf = compute(profile).cashFlow;
    const restRow = profile.spending.find((r) => r.rest);
    const itemised = cf.outgoings - (restRow ? num(restRow.monthly) : 0);
    const est = (profile.outgoings || {}).estimate;
    const estimate = Number.isFinite(est) ? est : null;
    const rest = estimate == null ? 0 : Math.max(0, Math.round((estimate - itemised) * 100) / 100);
    return { estimate, itemised, rest, total: itemised + rest };
  }

  // Puts what's left of your estimate in its own spending row (see FP.profile.newRest).
  function syncOutgoings(profile) {
    let row = profile.spending.find((r) => r.rest);
    if (!row && (profile.outgoings || {}).estimate == null) return;
    if (!row) {
      row = FP.profile.newRest();
      profile.spending.push(row);
    }
    row.monthly = outgoings(profile).rest;
  }

  FP.summary = { compute, checklist, outgoings, syncOutgoings, ASSET_ITEMS, debtRate, mortgageMonths };
})(globalThis.FP = globalThis.FP || {});
