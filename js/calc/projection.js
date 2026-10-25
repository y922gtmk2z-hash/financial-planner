/*
 * Year-by-year projection engine. Pure function of the profile: no DOM.
 * All amounts are nominal (future pounds); the UI converts to today's money
 * with each row's inflationFactor.
 *
 * Each year, in order:
 *  1. Income: salary and bonuses grow with salary growth; take-home uses the
 *     tax rules with thresholds frozen or raised with inflation. Salary stops
 *     at retirement age. State Pension (taxed) from State Pension age.
 *  2. Growth on opening balances: home, cash, and each ISA, investment and
 *     pension pot at the rate its mix of shares, bonds and cash gives (see
 *     FP.mix), net of fees.
 *  3. Mortgage amortises month by month (fixed payment plus overpayments, with
 *     an optional rate change); other debts amortise until cleared.
 *  4. Spending grows with spending growth, plus any life events that year
 *     (in today's money, so they rise with prices). Surplus = net income -
 *     spending - life events - mortgage and debt payments.
 *  5. Pension contributions from pay are added while working.
 *  6. A surplus first repays any earlier shortfall, then is split between
 *     cash, investments (ISA first), mortgage overpayment and pension. A
 *     deficit is drawn from the pension (in retirement, after tax), then cash,
 *     then investments; anything left becomes an unfunded shortfall.
 *
 * initState sets up where you start, stepYear runs one year, and project
 * loops it, giving each year its rates of return (the assumptions, or
 * opts.returnsPath) and the life events (profile.events and opts.events).
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

  /*
   * Where the projection starts: opening balances, debts, the mortgage and
   * student loan, ages, and the rules that stay fixed from year to year.
   * Returns the state, or { ok: false, reason, message } when it can't run.
   */
  function initState(profile, opts) {
    opts = opts || {};
    const cfg = opts.taxConfig || FP.taxConfig;
    const a = profile.assumptions;
    const age0 = profile.about.age;
    if (age0 == null) return { ok: false, reason: 'age', message: 'Enter your age in Your figures to see a projection.' };
    // Up to 40 years are shown; the retirement solvers ask for more, up to your end age.
    const years = Math.min(opts.maxYears || MAX_YEARS, (a.endAge || 0) - age0);
    if (years < 1) return { ok: false, reason: 'endAge', message: 'Your projection end age must be after your current age.' };

    const now = new Date();
    const startYear = opts.startYear || now.getFullYear();
    // Month the projection starts (1-12). Each projection year runs from here.
    const startMonth = opts.startMonth || now.getMonth() + 1;
    const [clY, clM] = cfg.isa.cashLimitFrom.split('-').map(Number);
    // Entered in £: shared out of each year's leftover money, rising with prices.
    const byAmount = profile.leftover.unit === 'gbp';
    const leftToday = byAmount ? FP.summary.compute(profile, FP.tax.household(profile, cfg).takeHomeMonthly).cashFlow.surplus : null;
    const warnings = [];

    const mBal = profile.mortgage.balance || 0;
    const mLoan = FP.loan.forMortgage(profile);
    const termMonths = FP.summary.mortgageMonths(mLoan);
    /*
     * Each person (you, and a partner if there is one): their own pay, student
     * loan, retirement and State Pension. A partner without an age is taken to
     * be your age. Student loans are tracked only with a plan and a balance;
     * otherwise repayments simply continue while that person works.
     */
    const persons = FP.profile.people(profile).map((person) => {
      const tracked = FP.studentLoan.tracked(person);
      return {
        person, age0: person.age == null ? age0 : person.age,
        slPlan: person.income.studentLoanPlan, slTracked: tracked,
        slBal: tracked ? person.income.studentLoanBalance : 0,
        slWriteOff: tracked ? FP.studentLoan.writeOffYear(person.income.studentLoanPlan, person.income.studentLoanStartYear, cfg) : null,
      };
    });
    const ownerIndex = (o) => (o === 'partner' && persons.length > 1 ? 1 : 0);
    // Pension pots besides your main one (assets.pension): your partner's main pot, then any others.
    // Each has the mix it's invested in, which sets how it grows.
    const mixOf = (m) => FP.profile.cleanMix(m) || FP.profile.newMix();
    const pots = (profile.partner ? [{ owner: 1, bal: profile.partner.pension || 0, access: a.pensionAccessAge, monthly: 0, main: true, mix: mixOf(profile.partner.pensionMix) }] : [])
      .concat((profile.pensions || []).filter((x) => x.type === 'dc').map((x) => ({
        owner: ownerIndex(x.owner), bal: x.value || 0, access: x.accessAge == null ? a.pensionAccessAge : x.accessAge, monthly: x.monthly || 0, mix: mixOf(x.mix),
      })));
    const mixes = profile.mixes || {};
    // Defined benefit pensions: a yearly income (today's money) from the start age.
    const dbs = (profile.pensions || []).filter((x) => x.type === 'db' && x.income > 0).map((x) => {
      const owner = ownerIndex(x.owner);
      return { owner, income: x.income, start: x.accessAge == null ? persons[owner].person.statePensionAge : x.accessAge };
    });

    return {
      ok: true, profile, opts, cfg, a, age0, years, startYear, warnings,
      startMonthIndex: startYear * 12 + (startMonth - 1),
      cashLimitFromIndex: clY * 12 + (clM - 1),
      byAmount, leftToday, persons, pots, dbs,
      isaMix: mixOf(mixes.isa), giaMix: mixOf(mixes.gia), pensionMix: mixOf(mixes.pension),
      shares: splitShares(profile.leftover, leftToday),
      warnOnce: (key, text) => { if (!warnings.some((w) => w.key === key)) warnings.push({ key, level: 'warn', text }); },

      // Opening balances
      home: profile.assets.homeValue || 0,
      cash: profile.assets.cashSavings || 0,
      isa: profile.assets.isa || 0,
      gia: profile.assets.gia || 0,
      pension: profile.assets.pension || 0,
      other: profile.assets.other || 0,
      shortfall: 0,

      mBal, termMonths,
      overMonthly: mBal > 0 ? profile.mortgage.monthlyOverpayment || 0 : 0,
      mRate: mLoan.rate,
      mPayment: FP.mortgage.monthlyPayment(mBal, mLoan.rate, termMonths),
      monthsElapsed: 0,
      fixChange: FP.mortgage.fixChange(profile.mortgage, startYear * 12 + (startMonth - 1)),

      // Rates are APRs, so interest is charged at the matching monthly rate.
      debts: profile.debts.map((d) => {
        const loan = FP.loan.forDebt(d, a);
        return { bal: d.balance || 0, rate: loan.rate, monthly: FP.loan.monthlyRate(loan.rate, 'apr'), pay: loan.payment };
      }),

      spendMonthly0: sum(profile.spending, (r) => r.monthly || 0),
      relief: (cfg.reliefAtSourceRate || 0) / 100,
      boosted: false,
    };
  }

  // A row of the projection: balances at the end of year y, plus that year's flows.
  function snapshot(state, y, extra) {
    const { home, cash, isa, gia, other, mBal, shortfall } = state;
    // With one person and one pot, these are simply yours.
    const pension = state.pots.length ? state.pension + sum(state.pots, (x) => x.bal) : state.pension;
    const slBal = state.persons.length > 1 ? sum(state.persons, (x) => x.slBal) : state.persons[0].slBal;
    const debtTotal = sum(state.debts, (d) => d.bal);
    const assets = home + cash + isa + gia + pension + other;
    const liabilities = mBal + debtTotal + slBal + shortfall;
    return {
      y, year: state.startYear + y, age: state.age0 + y,
      home, mortgage: mBal, equity: home - mBal, cash, isa, gia, pension, other,
      debts: debtTotal, studentLoan: slBal, shortfall, assets, liabilities, netWorth: assets - liabilities,
      inflationFactor: FP.growth.inflationFactor(state.a.inflation, y),
      ...extra,
    };
  }

  /*
   * One year (y = 1 for the first), in the order at the top of this file.
   * Changes `state` and returns the year's row. ctx.returns = { cash, house,
   * shares, bonds, cashFund }: this year's rates, % a year, for cash savings,
   * your home, and the shares, bonds and cash that pots are invested in
   * (before fees, which still come off investments and pensions).
   * ctx.events: life events, in the shape of profile.events (see
   * FP.profile.EVENT_TYPES); anything without a start year is ignored.
   */
  function stepYear(state, y, ctx) {
    const { profile, opts, cfg, a, age0, startYear, startMonthIndex, cashLimitFromIndex, byAmount, shares, debts, overMonthly, spendMonthly0, relief, warnOnce, persons, pots } = state;
    let { home, cash, isa, gia, pension, shortfall, mBal, mRate, mPayment, monthsElapsed, boosted, termMonths } = state;
    const g = y - 1; // years of growth applied to this year's income and spending
    const startAge = age0 + g;
    const priceFactor = FP.growth.inflationFactor(a.inflation, g);
    const cfgY = a.taxThresholds === 'inflation' ? FP.tax.indexConfig(cfg, priceFactor) : cfg;

    // Life events this year: the projection year starting in this calendar year.
    const life = eventsForYear(ctx.events, startYear + g, persons.length);

    // 1. Income, person by person, then added together for the household.
    const each = persons.map((ps, i) => personYear(state, ps, i, g, priceFactor, cfgY, life.pay[i] == null ? 1 : life.pay[i]));
    const one = each.length === 1;
    const total = (k) => (one ? each[0][k] : sum(each, (x) => x[k]));
    // You (person 1) are working; the household is working while either of you is.
    const { working, retiredTaxable } = each[0];
    const anyWorking = one ? working : each.some((x) => x.working);
    const salary = total('salary');
    const bonus = total('bonus');
    const salarySacrifice = total('salarySacrifice');
    const takeHome = total('takeHome');
    const pensionFromPay = total('pensionFromPay');
    const statePension = total('statePension');
    const statePensionTax = total('statePensionTax');
    const otherTaxable = total('otherTaxable');
    const otherTaxFree = total('otherTaxFree');
    const netIncome = total('netIncome');
    const slRepaid = total('slRepaid');
    const slExtra = total('slExtra');
    const slInterest = total('slInterest');
    const slWrittenOff = total('slWrittenOff');
    const region = persons[0].person.income.region;

    // opts.retirementBoost (today's money) adds savings at the start of
    // retirement, or takes them away if negative (used to find what you'd need).
    if (opts.retirementBoost && !anyWorking && !boosted) {
      boosted = true;
      const boost = opts.retirementBoost * priceFactor;
      if (boost > 0 && opts.retirementBoostTo === 'pension') pension += boost;
      else if (boost > 0) isa += boost;
      else {
        // Taken from cash, then investments, then the pension.
        let take = -boost;
        const from = (pot) => { const t = Math.min(pot, take); take -= t; return pot - t; };
        cash = from(cash);
        gia = from(gia);
        isa = from(isa);
        pension = from(pension);
      }
    }

    // A move to a new home this year: sell this one, buy that one with a new
    // mortgage, at the start of the year (in today's money raised by prices),
    // so the new home grows from its price through the year.
    // What's left of the sale goes into cash (as money coming in); a shortfall
    // is a cost this year, like the moving costs.
    if (life.move) {
      const mv = life.move;
      const newHome = Math.max(0, mv.price || 0) * priceFactor;
      const newLoan = Math.min(newHome, Math.max(0, mv.mortgage || 0) * priceFactor);
      const left = (home - mBal) - (newHome - newLoan);
      if (left >= 0) life.inLump += left / priceFactor; else life.out += -left / priceFactor;
      home = newHome;
      mBal = newLoan;
      termMonths = Math.max(1, Math.round(mv.term || 25)) * 12;
      monthsElapsed = 0;
      mPayment = FP.mortgage.monthlyPayment(mBal, mRate, termMonths);
      state.fixChange = null;
    }

    // 2. Growth on opening balances
    const r = ctx.returns;
    home = FP.growth.compound(home, r.house, 1);
    cash = FP.growth.compound(cash, r.cash, 1);
    const mixReturns = { shares: r.shares, bonds: r.bonds, cash: r.cashFund };
    const grow = (bal, mix, fees) => FP.growth.compound(bal, FP.growth.netRate(FP.mix.grossRate(mix, mixReturns), fees), 1);
    isa = grow(isa, state.isaMix, a.investmentFees);
    gia = grow(gia, state.giaMix, a.investmentFees);
    pension = grow(pension, state.pensionMix, a.pensionFees);
    pots.forEach((x) => { x.bal = grow(x.bal, x.mix, a.pensionFees); });

    // 3. Mortgage, month by month
    const mStart = mBal;
    let mortgagePaid = 0;
    let overpaid = 0;
    for (let m = 0; m < 12 && mBal > 0.005; m += 1) {
      // When a fixed rate ends, the payment is worked out again at the rate you expect after.
      if (state.fixChange && monthsElapsed === state.fixChange.afterMonths) {
        mRate = state.fixChange.annualRatePct;
        mPayment = FP.mortgage.monthlyPayment(mBal, mRate, termMonths - monthsElapsed);
      }
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
        const due = d.bal * (1 + d.monthly);
        const paid = Math.min(due, d.pay);
        d.bal = due - paid;
        debtPaid += paid;
      }
      if (d.bal <= 0.005) d.bal = 0;
    });

    // 4. Spending, regular savings (while working) and surplus
    // opts.retirementSpending scales spending once you've retired (used to find what you could afford).
    const spending = spendMonthly0 * 12 * FP.growth.compound(1, a.spendingGrowth, g) * (anyWorking ? 1 : (opts.retirementSpending == null ? 1 : opts.retirementSpending));
    const yearStartsAfterCashLimit = startMonthIndex + 12 * g >= cashLimitFromIndex;
    // Regular savings while their owner works, each person using their own ISA allowance.
    const savedFor = (rows, w, ageNow) => (w
      ? FP.savings.forYear(rows, {
        salaryFactor: FP.growth.compound(1, a.salaryGrowth, g),
        isaAllowance: a.isaAllowance,
        cashIsaLimit: yearStartsAfterCashLimit && ageNow < cfg.isa.cashLimitExemptAge ? a.cashIsaLimit : null,
      })
      : FP.savings.forYear([], {}));
    const savedEach = one ? [savedFor(profile.savings, working, startAge)] : [
      savedFor(profile.savings.filter((x) => x.owner !== 'partner'), working, startAge),
      savedFor(profile.savings.filter((x) => x.owner === 'partner'), each[1].working, persons[1].age0 + g),
    ];
    const saved = one ? savedEach[0] : ['cash', 'isa', 'gia', 'isaUsed', 'total'].reduce((o, k) => ({ ...o, [k]: savedEach[0][k] + savedEach[1][k] }),
      { overAllowance: savedEach.some((x) => x.overAllowance), overCashLimit: savedEach.some((x) => x.overCashLimit) });
    // Other pension pots you pay into (from take-home pay, with basic-rate relief added) while their owner works.
    const pensionSaving = sum(pots, (x) => (x.monthly > 0 && each[x.owner].working ? x.monthly * 12 : 0));
    if (saved.overAllowance) {
      warnOnce('isaAllowance', `From ${startYear + y} (age ${age0 + y}) your regular ISA savings are more than the ${fmt(a.isaAllowance)} ISA allowance. The extra is saved outside an ISA.`);
    } else if (saved.overCashLimit) {
      warnOnce('cashIsaLimit', `From ${startYear + y} (age ${age0 + y}) your cash ISA savings are more than the ${fmt(a.cashIsaLimit)} cash ISA limit for under-65s. The extra is saved as ordinary cash.`);
    }
    // Life events, in today's money: costs and monthly money in through the year,
    // and a lump sum in (an inheritance) straight into cash savings.
    const eventsOut = life.out * priceFactor;
    const eventsIn = life.inMonthly * priceFactor;
    const eventsLump = life.inLump * priceFactor;
    const surplus = netIncome + eventsIn - spending - eventsOut - mortgagePaid - debtPaid - slExtra - saved.total - pensionSaving;
    cash += eventsLump;

    // Regular savings go in first (so they take ISA allowance before the leftover money is shared out).
    cash += saved.cash;
    isa += saved.isa;
    gia += saved.gia;
    const isaRoomLeft = one ? Math.max(0, (a.isaAllowance || 0) - saved.isaUsed)
      : sum(savedEach, (x) => Math.max(0, (a.isaAllowance || 0) - x.isaUsed));

    // 5. Pension contributions: from pay into each person's main pot, and into other pots you pay into.
    if (working) pension += each[0].pensionFromPay;
    pots.forEach((x) => {
      if (x.main && each[x.owner].working) x.bal += each[x.owner].pensionFromPay;
      if (x.monthly > 0 && each[x.owner].working) x.bal += relief < 1 ? (x.monthly * 12) / (1 - relief) : x.monthly * 12;
    });

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
        pension: anyWorking ? Infinity : 0,
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
      if (one) pension += grossPension;
      else {
        // Shared equally between those still working, into their main pots.
        const into = each.filter((x) => x.working);
        into.forEach((x) => {
          const part = grossPension / into.length;
          if (x.index === 0) pension += part; else pots.find((pt) => pt.main && pt.owner === x.index).bal += part;
        });
      }
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
      if (pots.length) {
        // More than one pot: drawn by owner (see drawPots).
        const drawn = drawPots(state, pension, need, each, g, cfgY);
        pension = drawn.pension;
        need = drawn.need;
        flow.fromPension = drawn.gross;
        flow.pensionTax = drawn.tax;
      } else if (canDrawPension && pension > 0) {
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

    Object.assign(state, { home, cash, isa, gia, pension, shortfall, mBal, mRate, mPayment, monthsElapsed, boosted, termMonths });
    const row = snapshot(state, y, {
      working: anyWorking, salary, bonus, salarySacrifice, takeHome, pensionFromPay, statePension, statePensionTax,
      otherIncomeRetired: otherTaxable + otherTaxFree,
      studentLoanRepaid: slRepaid, studentLoanExtra: slExtra, studentLoanInterest: slInterest, studentLoanWrittenOff: slWrittenOff,
      netIncome, spending, mortgagePaid, debtPaid, surplus, ...flow,
    });
    // Only with more than one person or pot, so a single person's rows stay as they were.
    if (pots.length) row.pensionSaving = pensionSaving;
    // Only in years with a life event, so plans without any keep the same rows.
    if (eventsOut || eventsIn || eventsLump) Object.assign(row, { eventsOut, eventsIn, eventsLump });
    if (!one) {
      row.people = each.map((x, i) => ({
        working: x.working, age: persons[i].age0 + y, salary: x.salary, takeHome: x.takeHome, statePension: x.statePension,
        definedBenefit: x.definedBenefit, studentLoan: persons[i].slBal, studentLoanWrittenOff: x.slWrittenOff,
      }));
    }
    return row;
  }

  /*
   * One person's year: pay and take-home while they work (with any defined
   * benefit pension taxed alongside), their student loan month by month, their
   * State Pension, and other income that carries on after they retire.
   * Changes their student loan balance (ps.slBal).
   */
  /*
   * The life events in calendar year `year`, a year's worth: out (costs),
   * inMonthly (money coming in through the year), inLump (lump sums in), all in
   * today's money; pay[i]: the share of person i's pay this year (0 on a career
   * break, 0.8 working four days a week, less for months out of work; 1 when
   * unset); and move: a move to a new home this year (the event), or null.
   */
  function eventsForYear(list, year, people) {
    const out = { out: 0, inMonthly: 0, inLump: 0, pay: [], move: null };
    const cut = (e, f) => {
      const who = e.owner === 'joint' ? [...Array(people).keys()] : [e.owner === 'partner' && people > 1 ? 1 : 0];
      who.forEach((i) => { out.pay[i] = (out.pay[i] == null ? 1 : out.pay[i]) * f; });
    };
    (Array.isArray(list) ? list : []).forEach((e) => {
      if (!e || !Number.isFinite(e.startYear)) return;
      const t = FP.profile.eventType(e.type);
      const lump = e.per === 'lump';
      // Time out of work runs for its months; fewer days a week, until its end year or for good.
      const months = t.outMonths ? Math.max(1, Math.round(e.months || 1)) : 0;
      const end = t.outMonths ? e.startYear + Math.ceil(months / 12) - 1
        : lump ? e.startYear : e.endYear == null ? (t.ongoing ? Infinity : e.startYear) : e.endYear;
      if (year < e.startYear || year > end) return;
      if (t.move) out.move = e;
      // Months out of work this year (from the start of the year).
      const away = t.outMonths ? Math.min(12, months - 12 * (year - e.startYear)) : 0;
      const amount = Math.max(0, e.amount || 0) * (lump || e.per === 'year' ? 1 : t.outMonths ? away : 12);
      if (t.dir === 'in') out[lump ? 'inLump' : 'inMonthly'] += amount;
      else out.out += amount;
      if (t.pause) cut(e, 0);
      if (t.payCut) cut(e, Math.max(0, Math.min(100, e.payPct == null ? 100 : e.payPct)) / 100);
      if (t.outMonths) cut(e, 1 - away / 12);
    });
    return out;
  }

  // pay: the share of their pay this year (0 on a career break: no pay,
  // bonuses, workplace pension, salary sacrifice or taxable benefits).
  function personYear(state, ps, index, g, priceFactor, cfgY, pay) {
    const paused = pay <= 0;
    const { a, startMonthIndex, dbs } = state;
    const p = ps.person;
    const inc = p.income;
    const startAge = ps.age0 + g;
    const working = startAge < p.retirementAge;
    const definedBenefit = sum(dbs, (x) => (x.owner === index && startAge >= x.start ? x.income * priceFactor : 0));
    let salary = 0;
    let bonus = 0;
    let takeHome = 0;
    let pensionFromPay = 0;
    let salarySacrifice = 0;
    let slDue = 0;
    let slPay = 0;
    if (working) {
      const sf = paused ? 0 : pay * FP.growth.compound(1, a.salaryGrowth, g);
      const input = FP.tax.inputFromPerson(p);
      input.salary = (input.salary || 0) * sf;
      input.bonuses = (input.bonuses || []).map((b) => ({ ...b, amount: (b.amount || 0) * sf }));
      // Salary sacrifice (car, cycle...) only while each arrangement lasts.
      const ss = paused ? { sacrifice: 0, benefitInKind: 0 } : FP.tax.sacrificeForYear(inc.sacrifices, g);
      input.otherSacrifice = ss.sacrifice;
      // Benefits in kind and other income rise with prices.
      input.benefitInKind = ss.benefitInKind + (paused ? 0 : FP.tax.benefitsTotal(inc.benefits) * priceFactor);
      input.otherIncome = (inc.otherIncome || 0) * priceFactor;
      // A defined benefit pension paid while you still work is taxed with your pay.
      if (definedBenefit > 0) input.otherIncome += definedBenefit;
      input.taxFreeIncome = (inc.taxFreeIncome || 0) * priceFactor;
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
    const slExtraMonthly = inc.studentLoanOverpayment || 0;
    let { slBal } = ps;
    if (ps.slTracked) {
      slRepaid = 0;
      const override = inc.studentLoanRate;
      const ratePublished = FP.studentLoan.interestRate(ps.slPlan, slPay, cfgY, { override });
      // After the current interest year: today's rates, or inflation as RPI (see Assumptions).
      const rateFuture = a.studentLoanInterest === 'inflation'
        ? FP.studentLoan.interestRate(ps.slPlan, slPay, cfgY, { override, rpi: a.inflation })
        : ratePublished;
      for (let m = 0; m < 12; m += 1) {
        const abs = startMonthIndex + 12 * g + m; // months since year 0
        const year = Math.floor(abs / 12);
        const month = (abs % 12) + 1;
        if (slBal > 0 && ps.slWriteOff != null && (year > ps.slWriteOff || (year === ps.slWriteOff && month >= 4))) {
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
    ps.slBal = slBal;
    const statePension = startAge >= p.statePensionAge ? (p.statePension || 0) * priceFactor : 0;
    // Other income you've said carries on after you retire (it's in take-home while you work).
    const keepsOther = !working && inc.otherIncomeAfterRetirement === 'yes';
    const otherTaxable = keepsOther ? (inc.otherIncome || 0) * priceFactor : 0;
    const otherTaxFree = keepsOther ? (inc.taxFreeIncome || 0) * priceFactor : 0;
    let retiredTaxable = statePension + otherTaxable;
    // Once you've retired, a defined benefit pension is taxed with your State Pension.
    if (!working && definedBenefit > 0) retiredTaxable += definedBenefit;
    const statePensionTax = FP.tax.incomeTaxOnly(retiredTaxable, inc.region, cfgY);
    const netIncome = takeHome + retiredTaxable + otherTaxFree - statePensionTax;
    return {
      index, working, salary, bonus, salarySacrifice, takeHome, pensionFromPay, statePension, statePensionTax,
      otherTaxable, otherTaxFree, retiredTaxable, netIncome, definedBenefit,
      slRepaid, slExtra, slInterest, slWrittenOff,
    };

  }

  /*
   * A shortfall met from pension pots, when there's more than one: from pots
   * whose owner has retired and reached the pot's access age, shared between
   * owners in proportion to their pots, each taxed with that owner's income
   * (25% of each withdrawal tax-free). Returns { pension (your main pot), need
   * (what's still to find), gross (drawn), tax }.
   */
  function drawPots(state, pension, need, each, g, cfgY) {
    const all = [{ owner: 0, access: state.a.pensionAccessAge, get bal() { return pension; }, set bal(v) { pension = v; } }].concat(state.pots);
    const open = all.filter((x) => x.bal > 0 && !each[x.owner].working && state.persons[x.owner].age0 + g >= x.access);
    const pool = sum(open, (x) => x.bal);
    let gross = 0;
    let tax = 0;
    if (pool > 0 && need > 0) {
      const want = need;
      [0, 1].forEach((o) => {
        const mine = open.filter((x) => x.owner === o);
        const have = sum(mine, (x) => x.bal);
        if (!(have > 0)) return;
        const person = each[o];
        const region = state.persons[o].person.income.region;
        const g1 = Math.min(have, grossUpPension(want * (have / pool), person.retiredTaxable, region, cfgY));
        const t1 = FP.tax.incomeTaxOnly(person.retiredTaxable + g1 * 0.75, region, cfgY) - person.statePensionTax;
        mine.forEach((x) => { x.bal -= g1 * (x.bal / have); });
        gross += g1;
        tax += t1;
        need -= g1 - t1;
      });
      need = Math.max(0, need);
    }
    return { pension, need, gross, tax };
  }

  // This year's returns: the assumptions (with the market shift on shares and
  // bonds), or that year of opts.returnsPath.
  function returnsFor(a, path, y) {
    const m = FP.mix.returnsOf(a);
    const out = { cash: a.savingsRate, house: a.housePriceGrowth, shares: m.shares, bonds: m.bonds, cashFund: m.cash };
    const given = Array.isArray(path) ? path[y - 1] : null;
    if (given && typeof given === 'object') {
      Object.keys(out).forEach((k) => { if (Number.isFinite(given[k])) out[k] = given[k]; });
    }
    return out;
  }

  /*
   * opts: maxYears (up to your end age; 40 if not given), startYear,
   * startMonth, taxConfig, returnsPath (an array of { cash, house, shares,
   * bonds, cashFund } by year, first projection year first, overriding the assumption
   * rates; missing years or rates use the assumptions), events (an array,
   * added to profile.events and passed to each year as ctx.events), and the solvers' retirementSpending,
   * retirementBoost and retirementBoostTo.
   */
  function project(profile, opts) {
    opts = opts || {};
    const state = initState(profile, opts);
    if (!state.ok) return state;
    const { a, years, startYear, shares, byAmount, leftToday, warnings } = state;
    const lifeEvents = (profile.events || []).concat(Array.isArray(opts.events) ? opts.events : []);

    const rows = [snapshot(state, 0, { today: true })];
    for (let y = 1; y <= years; y += 1) {
      rows.push(stepYear(state, y, { returns: returnsFor(a, opts.returnsPath, y), events: lifeEvents }));
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
      events: householdEvents(rows, profile, a, state),
    };
  }

  /*
   * The events for the household. With just you, as they've always been. With a
   * partner, retirement is when the later of you retires (the plan's ages are
   * yours), and each of you has your own student loan events.
   */
  function householdEvents(rows, profile, a, state) {
    const ps = state.persons;
    const ev = events(rows, profile, a);
    if (ps.length === 1) return { ...ev, studentLoan: studentLoanEvents(rows, ps[0].slTracked, ps[0].slWriteOff) };
    const y = Math.max(...ps.map((x) => x.person.retirementAge - x.age0));
    ev.retirement = y >= 0 && y < rows.length ? rows[y] : null;
    // Each person's own view of the rows, for their student loan.
    const theirs = (i) => rows.map((r, j) => (j === 0 ? { ...r, studentLoan: ps[i].slTracked ? ps[i].person.income.studentLoanBalance : 0, studentLoanWrittenOff: 0 } : { ...r, ...r.people[i] }));
    ev.studentLoan = studentLoanEvents(theirs(0), ps[0].slTracked, ps[0].slWriteOff);
    ev.studentLoans = ps.map((x, i) => studentLoanEvents(theirs(i), x.slTracked, x.slWriteOff));
    return ev;
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
    'toPension', 'notSaved', 'fromPension', 'pensionTax', 'fromCash', 'fromInvest', 'unfunded', 'eventsOut', 'eventsIn', 'eventsLump',
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
      // Every retirement year, not just the last: a gap repaid later is still a
      // gap. (A gap from before you retire isn't changed by retirement spending.)
      return r.rows.every((row) => row.working !== false || !(row.unfunded > 0.5));
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

  /*
   * The first answer about retirement: to spend your goal each month (today's
   * money) from retirement to your end age, how much you'd need in savings,
   * investments and pensions when you retire (on top of the State Pension and
   * any income that carries on), how much you're on course to have, and how
   * long that would last. Returns null when there are no retirement years or
   * no spending entered; else { goal, goalIsSet, needed, have, lastsUntil
   * (age money runs short, or null if it lasts), endAge, retirementAge }.
   */
  const needCache = new Map();

  function retirementNeed(profile, into) {
    const key = JSON.stringify([profile, into, new Date().getFullYear(), new Date().getMonth()]);
    if (needCache.has(key)) return needCache.get(key);
    const result = solveRetirementNeed(profile, into);
    needCache.set(key, result);
    if (needCache.size > 30) needCache.delete(needCache.keys().next().value);
    return result;
  }

  function solveRetirementNeed(profile, into) {
    const opts = { maxYears: 100 };
    const base = project(profile, opts);
    if (!base.ok || !base.events.retirement || base.events.retirement.y >= base.rows.length - 1) return null;
    const now = sum(profile.spending, (r) => r.monthly || 0);
    if (!(now > 0)) return null;
    const a = profile.assumptions;
    const set = profile.goals && profile.goals.retirementIncome > 0;
    const goal = set ? profile.goals.retirementIncome : now;
    const ret = base.events.retirement;
    // Spending in retirement scaled so its first year is your goal (in today's money).
    const factor = goal / (now * FP.growth.compound(1, a.spendingGrowth, ret.y) / ret.inflationFactor);
    const run = (boost) => project(profile, { ...opts, retirementSpending: factor, retirementBoost: boost, retirementBoostTo: into });
    // The first retirement year your savings can't cover.
    const shortRow = (r) => r.rows.find((row) => row.working === false && row.unfunded > 0.5) || null;
    const funded = (boost) => !shortRow(run(boost));

    const atRet = toReal(base.rows[ret.y]);
    const have = atRet.cash + atRet.isa + atRet.gia + atRet.pension;
    const short = shortRow(run(0));

    // The smallest boost (or largest take-away) that still funds every year.
    let lo;
    let hi;
    if (short) {
      lo = 0;
      hi = Math.max(have, goal * 12 * 10);
      for (let i = 0; i < 20 && !funded(hi); i += 1) hi *= 2;
      if (!funded(hi)) return null; // no amount of savings would cover it
    } else if (funded(-have)) {
      lo = -have;
      hi = -have;
    } else {
      lo = -have;
      hi = 0;
    }
    for (let i = 0; i < 30 && hi - lo > 50; i += 1) {
      const mid = (lo + hi) / 2;
      if (funded(mid)) hi = mid; else lo = mid;
    }
    return {
      goal, goalIsSet: !!set,
      needed: Math.max(0, have + hi),
      have,
      lastsUntil: short ? short.age : null,
      endAge: base.events.end.age,
      // When the household retires (with just you, your retirement age), as your age.
      retirementAge: ret.age,
    };
  }

  /*
   * The first look: the pension pot you'd need when you retire to spend your
   * goal until your life expectancy (or toAge), on its own (nothing you'd save
   * before then counts). Savings instead if you retire before you can draw a pension.
   */
  function potNeeded(profile, toAge) {
    const a = profile.assumptions;
    const p = {
      ...profile,
      income: { ...profile.income, grossSalary: 0, bonuses: [], sacrifices: [] },
      assets: Object.fromEntries(Object.keys(profile.assets).map((k) => [k, 0])),
      savings: [],
      // Your partner's pay and pots don't count either; defined benefit pensions (an income) do.
      partner: profile.partner ? { ...profile.partner, pension: 0, income: { ...profile.partner.income, grossSalary: 0, bonuses: [], sacrifices: [] } } : profile.partner,
      pensions: (profile.pensions || []).map((x) => (x.type === 'dc' ? { ...x, value: 0, monthly: 0 } : x)),
      assumptions: { ...a, endAge: toAge || a.lifeExpectancy },
    };
    return retirementNeed(p, a.retirementAge >= a.pensionAccessAge ? 'pension' : 'isa');
  }

  function toReal(row) {
    const out = { ...row };
    MONEY_KEYS.forEach((k) => { if (typeof row[k] === 'number') out[k] = row[k] / row.inflationFactor; });
    return out;
  }

  FP.projection = { MAX_YEARS, SPLIT_KEYS, initState, stepYear, returnsFor, project, retirementSpend, retirementNeed, potNeeded, splitShares, splitAsPct, setSplitFromPct, allocate, grossUpPension, toReal };
})(globalThis.FP = globalThis.FP || {});
