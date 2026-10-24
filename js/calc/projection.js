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

  const SPLIT_KEYS = ['emergency', 'debts', 'cash', 'invest', 'mortgage', 'pension'];

  /*
   * The leftover split can be entered as % of what's left (unit 'pct', the
   * default) or as £ a month (unit 'gbp'). These give it as % of `left` (the
   * money left over a month) either way, and set it back from percentages.
   */
  function splitAsPct(split, left) {
    const src = split || {};
    const out = {};
    SPLIT_KEYS.forEach((k) => {
      const v = Math.max(0, src[k] || 0);
      out[k] = src.unit !== 'gbp' ? v : left > 0 ? (v / left) * 100 : (v > 0 ? Infinity : 0);
    });
    return out;
  }

  // Sets the split's values from percentages, in the split's own unit (whole
  // pounds, or % to one decimal place), rounded so the parts add up to the
  // same total as before.
  function setSplitFromPct(split, pct, left) {
    const step = split.unit === 'gbp' ? Math.max(0, left) / 100 : 1;
    const unitSize = split.unit === 'gbp' ? 1 : 0.1;
    const exact = SPLIT_KEYS.map((k) => (Math.max(0, pct[k] || 0) * step) / unitSize);
    const floors = exact.map(Math.floor);
    let spare = Math.round(sum(exact)) - sum(floors);
    exact.map((v, i) => [v - floors[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => {
      if (spare > 0) { floors[i] += 1; spare -= 1; }
    });
    SPLIT_KEYS.forEach((k, i) => { split[k] = Math.round(floors[i] * unitSize * 10) / 10; });
    return split;
  }

  /*
   * The leftover split ({ emergency, debts, cash, invest, mortgage, pension })
   * as fractions of what's left (`left` a month, needed when it's entered in £).
   * Under 100% in total: the rest is `unallocated` and isn't saved anywhere
   * (it's treated as spent). Over 100%: scaled down proportionally.
   */
  function splitShares(split, left) {
    const pct = splitAsPct(split, left);
    const raw = SPLIT_KEYS.map((k) => pct[k]);
    if (raw.some((v) => v === Infinity)) raw.forEach((v, i) => { raw[i] = v === Infinity ? 100 : 0; });
    // In £, within £1 of what's left counts as all of it (amounts are whole pounds).
    const amounts = SPLIT_KEYS.reduce((t, k) => t + Math.max(0, (split || {})[k] || 0), 0);
    if ((split || {}).unit === 'gbp' && left > 0 && amounts > 0 && Math.abs(amounts - left) < 1) {
      const t = sum(raw);
      raw.forEach((v, i) => { raw[i] = (v / t) * 100; });
    }
    const total = sum(raw);
    const scale = total > 100 ? 1 / total : 1 / 100;
    const [emergency, debts, cash, invest, mortgage, pension] = raw.map((v) => v * scale);
    const remainder = total < 100 ? (100 - total) / 100 : 0;
    return {
      emergency, debts, cash, invest, mortgage, pension, unallocated: remainder, total,
      status: Math.abs(total - 100) < 0.05 ? 'ok' : total < 100 ? 'under' : 'over',
    };
  }

  /*
   * Shares out `total` by `shares`, where each choice can take at most caps[key]
   * (for example the mortgage once it's cleared, or the emergency fund once it's
   * full). Whatever a choice can't take goes to the others you chose, in
   * proportion. The unallocated share, and anything none of your choices can
   * take, is returned as `unallocated`: it isn't saved.
   */
  function allocate(total, shares, caps) {
    const out = {};
    SPLIT_KEYS.forEach((k) => { out[k] = 0; });
    let open = SPLIT_KEYS.filter((k) => shares[k] > 0);
    const kept = total * (shares.unallocated || 0);
    let left = total - kept;
    while (left > 1e-9 && open.length) {
      const w = sum(open, (k) => shares[k]);
      const want = {};
      open.forEach((k) => { want[k] = left * shares[k] / w; });
      const full = open.filter((k) => out[k] + want[k] > caps[k] + 1e-9);
      if (!full.length) {
        open.forEach((k) => { out[k] += want[k]; });
        left = 0;
        break;
      }
      full.forEach((k) => { left -= caps[k] - out[k]; out[k] = caps[k]; });
      open = open.filter((k) => !full.includes(k));
    }
    out.unallocated = kept + Math.max(0, left);
    return out;
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
    if (age0 == null) return { ok: false, reason: 'age', message: 'Enter your age in Your figures to see a projection.' };
    const years = Math.min(opts.maxYears || MAX_YEARS, (a.endAge || 0) - age0);
    if (years < 1) return { ok: false, reason: 'endAge', message: 'Your projection end age must be after your current age.' };

    const now = new Date();
    const startYear = opts.startYear || now.getFullYear();
    // Month the projection starts (1-12). Each projection year runs from here.
    const startMonth = opts.startMonth || now.getMonth() + 1;
    const startMonthIndex = startYear * 12 + (startMonth - 1);
    const [clY, clM] = cfg.isa.cashLimitFrom.split('-').map(Number);
    const cashLimitFromIndex = clY * 12 + (clM - 1);
    const region = profile.income.region;
    // Entered in £: shared out of each year's leftover money, rising with prices.
    const byAmount = profile.leftover.unit === 'gbp';
    const leftToday = byAmount ? FP.summary.compute(profile, FP.tax.forProfile(profile, cfg).takeHomeMonthly).cashFlow.surplus : null;
    const shares = splitShares(profile.leftover, leftToday);
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
    // Student loan: tracked only when there's a plan and a balance. Otherwise
    // repayments simply continue while working.
    const slPlan = profile.income.studentLoanPlan;
    const slTracked = FP.studentLoan.tracked(profile);
    let slBal = slTracked ? profile.income.studentLoanBalance : 0;
    const slWriteOff = slTracked ? FP.studentLoan.writeOffYear(slPlan, profile.income.studentLoanStartYear, cfg) : null;

    const spendMonthly0 = sum(profile.spending, (r) => r.monthly || 0);
    const relief = (cfg.reliefAtSourceRate || 0) / 100;

    const snapshot = (y, extra) => {
      const debtTotal = sum(debts, (d) => d.bal);
      const assets = home + cash + isa + gia + pension + other;
      const liabilities = mBal + debtTotal + slBal + shortfall;
      return {
        y, year: startYear + y, age: age0 + y,
        home, mortgage: mBal, equity: home - mBal, cash, isa, gia, pension, other,
        debts: debtTotal, studentLoan: slBal, shortfall, assets, liabilities, netWorth: assets - liabilities,
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
      let salarySacrifice = 0;
      let slDue = 0;
      let slPay = 0;
      if (working) {
        const sf = FP.growth.compound(1, a.salaryGrowth, g);
        const input = FP.tax.inputFromProfile(profile);
        input.salary = (input.salary || 0) * sf;
        input.bonuses = (input.bonuses || []).map((b) => ({ ...b, amount: (b.amount || 0) * sf }));
        // Salary sacrifice (car, cycle...) only while each arrangement lasts.
        const ss = FP.tax.sacrificeForYear(profile.income.sacrifices, g);
        input.otherSacrifice = ss.sacrifice;
        // Benefits in kind and other income rise with prices.
        input.benefitInKind = ss.benefitInKind + FP.tax.benefitsTotal(profile.income.benefits) * priceFactor;
        input.otherIncome = (profile.income.otherIncome || 0) * priceFactor;
        input.taxFreeIncome = (profile.income.taxFreeIncome || 0) * priceFactor;
        const th = FP.tax.takeHome(input, cfgY);
        salary = th.salary;
        salarySacrifice = th.salarySacrifice;
        bonus = th.bonus;
        takeHome = th.takeHome;
        pensionFromPay = th.pensionIntoPot;
        slDue = th.studentLoan;
        slPay = th.niablePay;
      }

      // Student loan balance, month by month: written off in April of the
      // write-off year; otherwise interest is added (published rates for the
      // current interest year, then either the same rates or your inflation
      // assumption as RPI plus the plan's margin) and repayments taken. Once it's cleared, repayments
      // stop and take-home rises.
      let slRepaid = slDue;
      let slInterest = 0;
      let slWrittenOff = 0;
      let slExtra = 0; // voluntary payments, from take-home pay
      const slExtraMonthly = profile.income.studentLoanOverpayment || 0;
      if (slTracked) {
        slRepaid = 0;
        const override = profile.income.studentLoanRate;
        const ratePublished = FP.studentLoan.interestRate(slPlan, slPay, cfgY, { override });
        // After the current interest year: today's rates, or inflation as RPI (see Assumptions).
        const rateFuture = a.studentLoanInterest === 'inflation'
          ? FP.studentLoan.interestRate(slPlan, slPay, cfgY, { override, rpi: a.inflation })
          : ratePublished;
        for (let m = 0; m < 12; m += 1) {
          const abs = startMonthIndex + 12 * g + m; // months since year 0
          const year = Math.floor(abs / 12);
          const month = (abs % 12) + 1;
          if (slBal > 0 && slWriteOff != null && (year > slWriteOff || (year === slWriteOff && month >= 4))) {
            slWrittenOff = slBal;
            slBal = 0;
          }
          if (slBal <= 0.005) break;
          const rate = FP.studentLoan.publishedRatesApply(year, month, cfgY) ? ratePublished : rateFuture;
          const interest = slBal * rate / 100 / 12;
          const paid = Math.min(slBal + interest, slDue / 12);
          const extra = Math.min(slBal + interest - paid, slExtraMonthly);
          slBal = slBal + interest - paid - extra;
          slInterest += interest;
          slRepaid += paid + extra;
          slExtra += extra;
        }
        if (slBal <= 0.5) slBal = 0;
        takeHome += slDue - (slRepaid - slExtra);
      }
      const statePension = startAge >= a.statePensionAge ? (a.statePension || 0) * priceFactor : 0;
      // Other income you've said carries on after you retire (it's in take-home while you work).
      const keepsOther = !working && profile.income.otherIncomeAfterRetirement === 'yes';
      const otherTaxable = keepsOther ? (profile.income.otherIncome || 0) * priceFactor : 0;
      const otherTaxFree = keepsOther ? (profile.income.taxFreeIncome || 0) * priceFactor : 0;
      const retiredTaxable = statePension + otherTaxable;
      const statePensionTax = FP.tax.incomeTaxOnly(retiredTaxable, region, cfgY);
      const netIncome = takeHome + retiredTaxable + otherTaxFree - statePensionTax;

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

      // 4. Spending, regular savings (while working) and surplus
      // opts.retirementSpending scales spending once you've retired (used to find what you could afford).
      const spending = spendMonthly0 * 12 * FP.growth.compound(1, a.spendingGrowth, g) * (working ? 1 : (opts.retirementSpending == null ? 1 : opts.retirementSpending));
      const yearStartsAfterCashLimit = startMonthIndex + 12 * g >= cashLimitFromIndex;
      const saved = working
        ? FP.savings.forYear(profile.savings, {
          salaryFactor: FP.growth.compound(1, a.salaryGrowth, g),
          isaAllowance: a.isaAllowance,
          cashIsaLimit: yearStartsAfterCashLimit && startAge < cfg.isa.cashLimitExemptAge ? a.cashIsaLimit : null,
        })
        : FP.savings.forYear([], {});
      if (saved.overAllowance) {
        warnOnce('isaAllowance', `From ${startYear + y} (age ${age0 + y}) your regular ISA savings are more than the ${fmt(a.isaAllowance)} ISA allowance. The extra is saved outside an ISA.`);
      } else if (saved.overCashLimit) {
        warnOnce('cashIsaLimit', `From ${startYear + y} (age ${age0 + y}) your cash ISA savings are more than the ${fmt(a.cashIsaLimit)} cash ISA limit for under-65s. The extra is saved as ordinary cash.`);
      }
      const surplus = netIncome - spending - mortgagePaid - debtPaid - slExtra - saved.total;

      // Regular savings go in first (so they take ISA allowance before the leftover money is shared out).
      cash += saved.cash;
      isa += saved.isa;
      gia += saved.gia;
      const isaRoomLeft = Math.max(0, (a.isaAllowance || 0) - saved.isaUsed);

      // 5. Pension contributions from pay
      if (working) pension += pensionFromPay;

      // 6. Allocate a surplus or fund a deficit
      // The emergency fund aims to cover this much of the year's essential outgoings.
      const emergencyTarget = (profile.leftover.emergencyMonths || 0) * (spending + mortgagePaid + debtPaid) / 12;
      const flow = { savedCash: saved.cash, savedIsa: saved.isa + saved.gia, regularSaving: saved.total, emergencyTarget, toEmergency: 0, toDebts: 0, toCash: 0, toInvest: 0, toMortgage: 0, toPension: 0, notSaved: 0, fromPension: 0, pensionTax: 0, fromCash: 0, fromInvest: 0, unfunded: 0 };
      const allowance = mStart * (a.overpaymentLimitPct || 0) / 100;
      if (surplus >= 0) {
        let s = surplus;
        const repay = Math.min(s, shortfall);
        shortfall -= repay;
        s -= repay;

        // What each choice can take this year. The emergency fund tops cash up
        // to its target, debts and the mortgage take what's owed (overpayments
        // within the limit unless you've turned that off), and pension
        // contributions stop when you retire.
        const caps = {
          emergency: Math.max(0, emergencyTarget - cash),
          debts: sum(debts, (d) => d.bal),
          cash: Infinity,
          invest: Infinity,
          mortgage: a.capOverpayments === 'none' ? mBal : Math.min(mBal, Math.max(0, allowance - overpaid)),
          pension: working ? Infinity : 0,
        };
        const share = allocate(s, byAmount ? splitShares(profile.leftover, s / 12 / priceFactor) : shares, caps);
        const toEmergency = share.emergency;
        const toCash = share.cash;
        const toPension = share.pension;
        const toInvest = share.invest;
        const toMortgage = share.mortgage;
        const toDebts = share.debts;

        mBal -= toMortgage;
        if (mBal <= 0.005) mBal = 0;
        // Extra debt payments clear the most expensive debt first.
        let extra = toDebts;
        debts.slice().sort((x, z) => z.rate - x.rate).forEach((d) => {
          const paid = Math.min(extra, d.bal);
          d.bal -= paid;
          extra -= paid;
          if (d.bal <= 0.005) d.bal = 0;
        });
        const intoIsa = Math.min(toInvest, isaRoomLeft);
        isa += intoIsa;
        gia += toInvest - intoIsa;
        const grossPension = relief < 1 ? toPension / (1 - relief) : toPension;
        pension += grossPension;
        cash += toEmergency + toCash;
        Object.assign(flow, { toEmergency, toDebts, toCash, toInvest, toMortgage, toPension: grossPension, notSaved: share.unallocated });
      }
      // (Not in the year it's paid off, when the limit on a small balance means little.)
      if (mStart > 0 && mBal > 0 && overpaid + flow.toMortgage > allowance + 0.5) {
        warnOnce('overpay', flow.toMortgage > 0
          ? `In ${startYear + y} (age ${age0 + y}) mortgage overpayments of about ${fmt(overpaid + flow.toMortgage)} are more than ${a.overpaymentLimitPct}% of the balance. Your lender may charge an early repayment fee. Keep overpayments from your leftover money within the limit in Assumptions, or lower your monthly overpayment.`
          : `In ${startYear + y} (age ${age0 + y}) your monthly overpayments (about ${fmt(overpaid)} that year) are more than ${a.overpaymentLimitPct}% of the balance. Your lender may charge an early repayment fee — consider lowering your monthly overpayment in Your figures.`);
      }
      if (surplus < 0) {
        let need = -surplus;
        const canDrawPension = !working && startAge >= a.pensionAccessAge;
        if (canDrawPension && pension > 0) {
          const gross = Math.min(pension, grossUpPension(need, retiredTaxable, region, cfgY));
          const tax = FP.tax.incomeTaxOnly(retiredTaxable + gross * 0.75, region, cfgY) - statePensionTax;
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
        working, salary, bonus, salarySacrifice, takeHome, pensionFromPay, statePension, statePensionTax,
        otherIncomeRetired: otherTaxable + otherTaxFree,
        studentLoanRepaid: slRepaid, studentLoanExtra: slExtra, studentLoanInterest: slInterest, studentLoanWrittenOff: slWrittenOff,
        netIncome, spending, mortgagePaid, debtPaid, surplus, ...flow,
      }));
    }

    if (shares.status !== 'ok') {
      const total = byAmount ? fmt(sum(SPLIT_KEYS, (k) => profile.leftover[k] || 0)) : `${Math.round(shares.total * 10) / 10}%`;
      const rest = byAmount ? `${fmt(Math.max(0, leftToday) - sum(SPLIT_KEYS, (k) => profile.leftover[k] || 0))} a month` : `${Math.round((100 - shares.total) * 10) / 10}%`;
      warnings.push({
        key: 'split', level: 'info',
        text: shares.status === 'under'
          ? (shares.total === 0
            ? 'You haven\u2019t chosen what to do with your leftover money, so the projection doesn\u2019t save any of it (it\u2019s treated as spent).'
            : `What you do with your leftover money adds up to ${total}${byAmount ? ' a month' : ''}. The other ${rest} isn\u2019t saved (it\u2019s treated as spent).`)
          : `What you do with your leftover money adds up to ${total}${byAmount ? ' a month, more than is left over' : ''}, so each share is scaled down${byAmount ? ' to fit' : ' to make 100%'}.`,
      });
    }

    return {
      ok: true, rows, years, startYear, shares, warnings,
      events: { ...events(rows, profile, a), studentLoan: studentLoanEvents(rows, slTracked, slWriteOff) },
    };
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

  /*
   * When the student loan ends: { tracked, clearedRow, writtenOffRow, writtenOff
   * (amount), writeOffYear, owingAtEnd }. Rows are null when it doesn't happen
   * within the projection.
   */
  function studentLoanEvents(rows, tracked, writeOffYear) {
    if (!tracked) return { tracked: false };
    const writtenOffRow = rows.find((r) => r.studentLoanWrittenOff > 0) || null;
    const clearedRow = writtenOffRow ? null : rows.find((r, i) => i > 0 && r.studentLoan === 0) || null;
    const last = rows[rows.length - 1];
    return {
      tracked: true, clearedRow, writtenOffRow, writeOffYear,
      // Written off in April of writeOffYear, during writtenOffRow's year.
      writtenOffAge: writtenOffRow ? writtenOffRow.age - 1 : null,
      writtenOff: writtenOffRow ? writtenOffRow.studentLoanWrittenOff : 0,
      owingAtEnd: last.studentLoan,
    };
  }

  function fmt(n) {
    return `£${Math.round(n).toLocaleString('en-GB')}`;
  }

  // A row's money values in today's money.
  const MONEY_KEYS = [
    'home', 'mortgage', 'equity', 'cash', 'isa', 'gia', 'pension', 'other', 'debts', 'studentLoan', 'shortfall', 'assets',
    'studentLoanRepaid', 'studentLoanExtra', 'studentLoanInterest', 'studentLoanWrittenOff',
    'liabilities', 'netWorth', 'salary', 'bonus', 'takeHome', 'pensionFromPay', 'statePension', 'statePensionTax', 'otherIncomeRetired',
    'netIncome', 'spending', 'regularSaving', 'savedCash', 'savedIsa', 'salarySacrifice', 'mortgagePaid', 'debtPaid', 'surplus', 'toCash', 'toInvest', 'toMortgage',
    'toPension', 'notSaved', 'fromPension', 'pensionTax', 'fromCash', 'fromInvest', 'unfunded',
  ];
  /*
   * How much you could spend in retirement without running short before the
   * end age: the highest monthly spending (in today's money, at the start of
   * retirement) that keeps every year funded. Mortgage and debt payments are on
   * top, and your home isn't sold. This runs all the way to your end age, past
   * the 40-year limit on the shown projection. Returns null when there are no
   * retirement years or no spending entered; else { monthly, now, factor, endAge }.
   */
  // It runs the projection ~30 times, so results are remembered for recent inputs
  // (Scenarios redraws every scenario as you type).
  const spendCache = new Map();

  function retirementSpend(profile, opts) {
    const key = JSON.stringify([profile, opts || null, new Date().getFullYear(), new Date().getMonth()]);
    if (spendCache.has(key)) return spendCache.get(key);
    const result = solveRetirementSpend(profile, opts);
    spendCache.set(key, result);
    if (spendCache.size > 30) spendCache.delete(spendCache.keys().next().value);
    return result;
  }

  function solveRetirementSpend(profile, opts) {
    opts = { ...opts, maxYears: 100 };
    const base = project(profile, opts);
    if (!base.ok || !base.events.retirement || base.events.retirement.y >= base.rows.length - 1) return null;
    const now = sum(profile.spending, (r) => r.monthly || 0);
    if (!(now > 0)) return null;
    const lasts = (factor) => {
      const r = project(profile, { ...opts, retirementSpending: factor });
      // Every retirement year, not just the last: a gap repaid later is still a gap.
      return r.rows.every((row) => row.working !== false || row.shortfall <= 0.5);
    };
    let lo = 0;
    let hi = 1;
    if (lasts(hi)) {
      while (hi < 16 && lasts(hi * 2)) hi *= 2;
      lo = hi;
      hi *= 2;
    }
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (lasts(mid)) lo = mid; else hi = mid;
    }
    const a = profile.assumptions;
    const ret = base.events.retirement;
    // Spending grows from now; in today's money at the start of retirement.
    const atRetirement = now * FP.growth.compound(1, a.spendingGrowth, ret.y) / ret.inflationFactor;
    return { factor: lo, monthly: atRetirement * lo, now, endAge: base.events.end.age, capped: lo >= 16 };
  }

  function toReal(row) {
    const out = { ...row };
    MONEY_KEYS.forEach((k) => { if (typeof row[k] === 'number') out[k] = row[k] / row.inflationFactor; });
    return out;
  }

  FP.projection = { MAX_YEARS, SPLIT_KEYS, project, retirementSpend, splitShares, splitAsPct, setSplitFromPct, allocate, grossUpPension, toReal };
})(globalThis.FP = globalThis.FP || {});
