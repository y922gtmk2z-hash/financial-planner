/*
 * Year-by-year projection engine. Pure function of the profile: no DOM.
 * All amounts are nominal (future pounds); the UI converts to today's money
 * with each row's inflationFactor.
 *
 * Each year, in order:
 *  1. Income: salary and bonuses grow with salary growth; take-home uses the
 *     tax rules with thresholds frozen or raised with inflation. Salary stops
 *     at retirement age. State Pension (taxed) from State Pension age.
 *  2. Growth on opening balances: home, cash, investments (net of fees),
 *     pension (net of fees).
 *  3. Mortgage amortises month by month (fixed payment plus overpayments, with
 *     an optional rate change); other debts amortise until cleared.
 *  4. Spending grows with spending growth. Surplus = net income - spending -
 *     mortgage and debt payments.
 *  5. Pension contributions from pay are added while working.
 *  6. A surplus first repays any earlier shortfall, then is split between
 *     cash, investments (ISA first), mortgage overpayment and pension. A
 *     deficit is drawn from the pension (in retirement, after tax), then cash,
 *     then investments; anything left becomes an unfunded shortfall.
 */
(function (FP) {
  'use strict';

  const MAX_YEARS = 40;

  function sum(list, fn) {
    return list.reduce((s, x) => s + (fn ? fn(x) : x), 0);
  }

  /*
   * The surplus split as fractions. Under 100% in total: the rest goes to
   * cash. Over 100%: scaled down proportionally.
   */
  function splitShares(a) {
    const raw = FP.assumptions.SPLIT_KEYS.map((k) => Math.max(0, a[k] || 0));
    const total = sum(raw);
    const scale = total > 100 ? 1 / total : 1 / 100;
    const [cash, invest, mortgage, pension] = raw.map((v) => v * scale);
    const remainder = total < 100 ? (100 - total) / 100 : 0;
    return {
      cash: cash + remainder, invest, mortgage, pension, total,
      status: total === 100 ? 'ok' : total < 100 ? 'under' : 'over',
    };
  }

  // Smallest gross pension withdrawal that leaves `need` after tax.
  // 25% of each withdrawal is tax-free; the rest is taxed with `otherTaxable`.
  function grossUpPension(need, otherTaxable, region, cfg) {
    const baseTax = FP.tax.incomeTaxOnly(otherTaxable, region, cfg);
    const netOf = (g) => g - (FP.tax.incomeTaxOnly(otherTaxable + g * 0.75, region, cfg) - baseTax);
    let lo = need;
    let hi = need * 2 + 1;
    while (netOf(hi) < need) hi *= 2;
    for (let i = 0; i < 50; i += 1) {
      const mid = (lo + hi) / 2;
      if (netOf(mid) >= need) hi = mid; else lo = mid;
    }
    return hi;
  }

  function project(profile, opts) {
    opts = opts || {};
    const cfg = opts.taxConfig || FP.taxConfig;
    const a = profile.assumptions;
    const age0 = profile.about.age;
    if (age0 == null) return { ok: false, reason: 'age', message: 'Enter your age in Setup to see a projection.' };
    const years = Math.min(MAX_YEARS, (a.endAge || 0) - age0);
    if (years < 1) return { ok: false, reason: 'endAge', message: 'Your projection end age must be after your current age.' };

    const startYear = opts.startYear || new Date().getFullYear();
    const region = profile.income.region;
    const shares = splitShares(a);
    const warnings = [];
    const warnOnce = (key, text) => { if (!warnings.some((w) => w.key === key)) warnings.push({ key, level: 'warn', text }); };

    // Opening balances
    let home = profile.assets.homeValue || 0;
    let cash = profile.assets.cashSavings || 0;
    let isa = profile.assets.isa || 0;
    let gia = profile.assets.gia || 0;
    let pension = profile.assets.pension || 0;
    const other = profile.assets.other || 0;
    let shortfall = 0;

    let mBal = profile.mortgage.balance || 0;
    const termMonths = Math.round((profile.mortgage.remainingTermYears || 0) * 12);
    const overMonthly = mBal > 0 ? profile.mortgage.monthlyOverpayment || 0 : 0;
    let mRate = a.mortgageRate || 0;
    let mPayment = FP.mortgage.monthlyPayment(mBal, mRate, termMonths);
    let monthsElapsed = 0;

    const debts = profile.debts.map((d) => ({
      bal: d.balance || 0, rate: FP.summary.debtRate(d, a), pay: d.monthlyPayment || 0,
    }));
    const spendMonthly0 = sum(profile.spending, (r) => r.monthly || 0);
    const relief = (cfg.reliefAtSourceRate || 0) / 100;

    const snapshot = (y, extra) => {
      const debtTotal = sum(debts, (d) => d.bal);
      const assets = home + cash + isa + gia + pension + other;
      const liabilities = mBal + debtTotal + shortfall;
      return {
        y, year: startYear + y, age: age0 + y,
        home, mortgage: mBal, equity: home - mBal, cash, isa, gia, pension, other,
        debts: debtTotal, shortfall, assets, liabilities, netWorth: assets - liabilities,
        inflationFactor: FP.growth.inflationFactor(a.inflation, y),
        ...extra,
      };
    };

    const rows = [snapshot(0, { today: true })];

    for (let y = 1; y <= years; y += 1) {
      const g = y - 1; // years of growth applied to this year's income and spending
      const startAge = age0 + g;
      const working = startAge < a.retirementAge;
      const priceFactor = FP.growth.inflationFactor(a.inflation, g);
      const cfgY = a.taxThresholds === 'inflation' ? FP.tax.indexConfig(cfg, priceFactor) : cfg;

      // 1. Income
      let salary = 0;
      let bonus = 0;
      let takeHome = 0;
      let pensionFromPay = 0;
      if (working) {
        const sf = FP.growth.compound(1, a.salaryGrowth, g);
        const input = FP.tax.inputFromProfile(profile);
        input.salary = (input.salary || 0) * sf;
        input.bonuses = (input.bonuses || []).map((b) => ({ ...b, amount: (b.amount || 0) * sf }));
        const th = FP.tax.takeHome(input, cfgY);
        salary = th.salary;
        bonus = th.bonus;
        takeHome = th.takeHome;
        pensionFromPay = th.pensionIntoPot;
      }
      const statePension = startAge >= a.statePensionAge ? (a.statePension || 0) * priceFactor : 0;
      const statePensionTax = FP.tax.incomeTaxOnly(statePension, region, cfgY);
      const netIncome = takeHome + statePension - statePensionTax;

      // 2. Growth on opening balances
      home = FP.growth.compound(home, a.housePriceGrowth, 1);
      cash = FP.growth.compound(cash, a.savingsRate, 1);
      isa = FP.growth.compound(isa, FP.growth.netRate(a.investmentReturn, a.investmentFees), 1);
      gia = FP.growth.compound(gia, FP.growth.netRate(a.investmentReturn, a.investmentFees), 1);
      pension = FP.growth.compound(pension, FP.growth.netRate(a.pensionGrowth, a.pensionFees), 1);

      // 3. Mortgage, month by month
      const mStart = mBal;
      let mortgagePaid = 0;
      let overpaid = 0;
      if (a.mortgageRateChangeYear != null && a.mortgageRateAfterChange != null && g === a.mortgageRateChangeYear && mBal > 0) {
        mRate = a.mortgageRateAfterChange;
        mPayment = FP.mortgage.monthlyPayment(mBal, mRate, termMonths - monthsElapsed);
      }
      for (let m = 0; m < 12 && mBal > 0.005; m += 1) {
        const interest = mBal * mRate / 100 / 12;
        const due = mBal + interest;
        const contractual = monthsElapsed >= termMonths ? due : mPayment;
        const paid = Math.min(due, contractual + overMonthly);
        overpaid += Math.max(0, paid - contractual);
        mBal = due - paid;
        mortgagePaid += paid;
        monthsElapsed += 1;
      }
      if (mBal <= 0.005) mBal = 0;

      let debtPaid = 0;
      debts.forEach((d) => {
        for (let m = 0; m < 12 && d.bal > 0.005; m += 1) {
          const due = d.bal * (1 + d.rate / 100 / 12);
          const paid = Math.min(due, d.pay);
          d.bal = due - paid;
          debtPaid += paid;
        }
        if (d.bal <= 0.005) d.bal = 0;
      });

      // 4. Spending and surplus
      const spending = spendMonthly0 * 12 * FP.growth.compound(1, a.spendingGrowth, g);
      const surplus = netIncome - spending - mortgagePaid - debtPaid;

      // 5. Pension contributions from pay
      if (working) pension += pensionFromPay;

      // 6. Allocate a surplus or fund a deficit
      const flow = { toCash: 0, toInvest: 0, toMortgage: 0, toPension: 0, fromPension: 0, pensionTax: 0, fromCash: 0, fromInvest: 0, unfunded: 0 };
      if (surplus >= 0) {
        let s = surplus;
        const repay = Math.min(s, shortfall);
        shortfall -= repay;
        s -= repay;

        let toCash = s * shares.cash;
        let toPension = s * shares.pension;
        const toInvest = s * shares.invest;
        const toMortgage = Math.min(s * shares.mortgage, mBal);
        toCash += s * shares.mortgage - toMortgage;
        if (!working) { toCash += toPension; toPension = 0; }

        mBal -= toMortgage;
        if (mBal <= 0.005) mBal = 0;
        const intoIsa = Math.min(toInvest, Math.max(0, a.isaAllowance || 0));
        isa += intoIsa;
        gia += toInvest - intoIsa;
        const grossPension = relief < 1 ? toPension / (1 - relief) : toPension;
        pension += grossPension;
        cash += toCash;
        Object.assign(flow, { toCash, toInvest, toMortgage, toPension: grossPension });

        const allowance = mStart * (a.overpaymentLimitPct || 0) / 100;
        if (mStart > 0 && overpaid + toMortgage > allowance + 0.5) {
          warnOnce('overpay', `In ${startYear + y} (age ${age0 + y}) mortgage overpayments of about ${fmt(overpaid + toMortgage)} exceed ${a.overpaymentLimitPct}% of the balance. Your lender may charge an early repayment fee — consider a smaller mortgage share of the surplus.`);
        }
      } else {
        let need = -surplus;
        const canDrawPension = !working && startAge >= a.pensionAccessAge;
        if (canDrawPension && pension > 0) {
          const gross = Math.min(pension, grossUpPension(need, statePension, region, cfgY));
          const tax = FP.tax.incomeTaxOnly(statePension + gross * 0.75, region, cfgY) - statePensionTax;
          pension -= gross;
          need = Math.max(0, need - (gross - tax));
          flow.fromPension = gross;
          flow.pensionTax = tax;
        }
        const fromCash = Math.min(cash, need);
        cash -= fromCash;
        need -= fromCash;
        const fromGia = Math.min(gia, need);
        gia -= fromGia;
        need -= fromGia;
        const fromIsa = Math.min(isa, need);
        isa -= fromIsa;
        need -= fromIsa;
        flow.fromCash = fromCash;
        flow.fromInvest = fromGia + fromIsa;
        if (need > 0.5) {
          shortfall += need;
          flow.unfunded = need;
          warnOnce('shortfall', `From ${startYear + y} (age ${age0 + y}) your savings and investments${canDrawPension ? ' and pension' : ''} can’t cover your spending. The gap is shown as an unfunded shortfall.`);
        }
        if (working && startAge >= a.pensionAccessAge && need > 0.5 && pension > 0) {
          warnOnce('pensionWhileWorking', 'The projection doesn’t draw on your pension while you’re still working, even after the minimum pension age.');
        }
      }

      rows.push(snapshot(y, {
        working, salary, bonus, takeHome, pensionFromPay, statePension, statePensionTax,
        netIncome, spending, mortgagePaid, debtPaid, surplus, ...flow,
      }));
    }

    if (shares.status !== 'ok') {
      warnings.push({
        key: 'split', level: 'info',
        text: shares.status === 'under'
          ? `Your surplus split adds up to ${shares.total}%. The other ${100 - shares.total}% goes to cash savings.`
          : `Your surplus split adds up to ${shares.total}%, so each share is scaled down to make 100%.`,
      });
    }

    return { ok: true, rows, years, startYear, shares, warnings, events: events(rows, profile, a) };
  }

  function events(rows, profile, a) {
    const first = (fn) => rows.find((r, i) => i > 0 && fn(r));
    const m0 = profile.mortgage.balance || 0;
    const mortgageFree = m0 > 0 ? first((r) => r.mortgage <= 0) : null;
    const retirement = rows.find((r) => r.age === a.retirementAge) || null;
    const runsOut = first((r) => r.shortfall > 0) || null;
    return {
      mortgageFree, // row, or null (none / not within projection)
      hasMortgage: m0 > 0,
      retirement,
      runsOut,
      end: rows[rows.length - 1],
    };
  }

  function fmt(n) {
    return `£${Math.round(n).toLocaleString('en-GB')}`;
  }

  // A row's money values in today's money.
  const MONEY_KEYS = [
    'home', 'mortgage', 'equity', 'cash', 'isa', 'gia', 'pension', 'other', 'debts', 'shortfall', 'assets',
    'liabilities', 'netWorth', 'salary', 'bonus', 'takeHome', 'pensionFromPay', 'statePension', 'statePensionTax',
    'netIncome', 'spending', 'mortgagePaid', 'debtPaid', 'surplus', 'toCash', 'toInvest', 'toMortgage',
    'toPension', 'fromPension', 'pensionTax', 'fromCash', 'fromInvest', 'unfunded',
  ];
  function toReal(row) {
    const out = { ...row };
    MONEY_KEYS.forEach((k) => { if (typeof row[k] === 'number') out[k] = row[k] / row.inflationFactor; });
    return out;
  }

  FP.projection = { MAX_YEARS, project, splitShares, grossUpPension, toReal };
})(globalThis.FP = globalThis.FP || {});
