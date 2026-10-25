/*
 * Ideas for money left over each month, based on the profile. Pure functions,
 * no DOM. These are general rules of thumb to consider - not advice.
 *
 * analyse() returns { left, essentials, emergency, suggestions, split, splitReason,
 *   splitIdea, unallocated, base, pay, today }.
 * Each suggestion: { id, tone, title, text, patch, impact, howTo, safety, kind, afford, link? }.
 * tone: 'warn' (fix first), 'tip' (worth considering), 'good' (already fine).
 * patch: the one change to the plan the idea suggests (see FP.patch), or null
 * when there isn't one. impact: FP.patch.impact of that change, or null; it
 * re-runs the plan, so it's only worked out the first time it's read. With
 * money left over that has no job yet (unallocated), every impact is measured
 * on top of the suggested split (base), so gains don't overlap.
 * safety: a problem that stays at the top (short each month, no emergency
 * fund, debt over 20% APR). kind: what its value a year is (see valuePerYear).
 * afford: whether it fits in what's left over, and a smaller version if not.
 * howTo: steps to make the change.
 * Big-ticket checks (taxTrap, reliefToClaim, statePensionGap, fixEnding) are
 * exported on their own as well.
 */
(function (FP) {
  'use strict';

  const EMERGENCY_MIN_MONTHS = 3;
  const EMERGENCY_MAX_MONTHS = 6;
  // A debt costing this much more than savings earn is worth clearing first.
  const EXPENSIVE_DEBT_MARGIN = 2;

  function money(n) {
    return `£${Math.round(n).toLocaleString('en-GB')}`;
  }

  // A rate to one decimal place (worked-out rates aren't round numbers).
  const pctText = (n) => String(Math.round(n * 10) / 10);

  // "8 months", "about 3 years", "over 10 years".
  function duration(months) {
    if (months <= 24) return `${months} month${months === 1 ? '' : 's'}`;
    if (months > 120) return 'over 10 years';
    return `about ${Math.round(months / 12)} years`;
  }

  // Safety problems stay at the top whatever their value; ideas worth less than this a year are smaller ideas.
  const SAFETY_DEBT_APR = 20;
  const SMALL_VALUE = 100;
  const SAFETY_ORDER = ['noSurplus', 'emergency', 'debt'];
  // A scaled-down change smaller than this a month isn't worth offering.
  const MIN_AFFORDABLE = 10;
  const FULL_STATE_PENSION = () => FP.assumptions.def('statePension').default;
  const STATE_PENSION_LINK = 'https://www.gov.uk/check-state-pension';

  /*
   * opts: { cashKnown: whether cash savings have been answered (default:
   * there are some), now: today's date (for a fixed rate ending) }.
   * Until cash savings are answered, the emergency fund isn't judged.
   */
  function analyse(profile, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const a = profile.assumptions;
    // Your pay (for your tax band and the taper); the household's take-home for what's left.
    const pay = FP.tax.forProfile(profile);
    const today = FP.summary.compute(profile, FP.tax.household(profile).takeHomeMonthly);
    const cf = today.cashFlow;
    const left = cf.surplus;
    const room = Math.max(0, left || 0);
    const essentials = cf.outgoings;
    const cash = profile.assets.cashSavings || 0;
    const cashKnown = opts.cashKnown == null ? cash > 0 : !!opts.cashKnown;
    const months = essentials > 0 ? cash / essentials : Infinity;
    const targetMonths = profile.leftover.emergencyMonths || EMERGENCY_MIN_MONTHS;
    const emergency = {
      months,
      targetMonths,
      target: essentials * targetMonths,
      min: essentials * EMERGENCY_MIN_MONTHS,
      max: essentials * EMERGENCY_MAX_MONTHS,
      short: essentials > 0 && months < targetMonths,
      known: cashKnown,
    };
    // Months to fill the fund from `share` (a fraction) of what's left each month.
    emergency.monthsToFill = (share) => (emergency.short && share > 0 && left > 0
      ? Math.ceil((emergency.target - cash) / (left * share)) : 0);

    // Judged on income, not the allowance: a reduced tax code also lowers the allowance.
    const cfg = FP.taxConfig;
    const taperTop = cfg.taperThreshold + cfg.personalAllowance / cfg.taperRate;
    // Each person's top rate and whether they're in the taper. The pension ideas
    // are for whoever is in the taper, or else pays higher-rate tax (you first).
    const people = FP.profile.people(profile);
    const bands = people.map((x, i) => {
      const own = i ? FP.tax.forProfile(FP.profile.asPerson(profile, i)) : pay;
      return {
        i,
        topRate: topRateOf(own),
        inTaper: own.adjustedNetIncome > cfg.taperThreshold && own.adjustedNetIncome < taperTop,
      };
    });
    const forPension = bands.find((b) => b.inTaper) || bands.find((b) => b.topRate >= 40) || bands[0];
    const { topRate, inTaper } = forPension;
    // "your" or "Sam’s", for the person an idea is about.
    const whose = (i) => FP.profile.whose(profile, i);
    const who = (i) => FP.profile.who(profile, i);
    const m = today.mortgage;
    const expensive = today.debts
      .filter((d) => d.balance > 0 && d.rate >= (a.savingsRate || 0) + EXPENSIVE_DEBT_MARGIN)
      .sort((x, y) => y.rate - x.rate);
    const { split, reason } = left > 0
      ? suggestSplit({ emergency, inTaper, topRate, hasMortgage: !!(m && m.balance > 0), mortgageBeatsCash: !!(m && m.rate > a.savingsRate), expensive: expensive.length > 0 })
      : { split: null, reason: null };

    // Money left over that isn't given a job: deciding that comes first, and
    // every other idea is measured on top of the suggested split, so their
    // gains aren't just "start saving".
    const unallocated = left > 0 && FP.projection.splitShares(profile.leftover, room).total === 0;
    const splitIdea = split ? makeSplitIdea(profile, { left, split, splitReason: reason }, unallocated) : null;
    const base = unallocated && splitIdea ? FP.patch.applyPatch(profile, splitIdea.patch) : JSON.parse(JSON.stringify(profile));
    const out = [];
    const add = (id, tone, title, text, patch, extra) => {
      const idea = makeIdea(base, id, tone, title, text, patch, extra);
      idea.afford = affordability(idea, room);
      out.push(idea);
      return idea;
    };

    // Short each month: that comes first.
    if (!(left > 0)) {
      add('noSurplus', 'warn', 'Nothing left over each month',
        left < 0
          ? `You’re ${money(-left)} a month short after spending, debts and regular savings. Look at your biggest spending categories, or reduce regular savings until it balances.`
          : 'Everything you take home is already spoken for. Small cuts to spending would give you room to save.',
        null, { safety: true });
    }

    // 1. Expensive debts. Over 20% APR it's a safety problem.
    if (expensive.length) {
      const d = expensive[0];
      const at = profile.debts.findIndex((x) => x.id === d.id);
      const urgent = d.rate > SAFETY_DEBT_APR;
      const extraPay = 50;
      add('debt', urgent ? 'warn' : 'tip', `Clear ${d.name} first`,
        `It costs ${pctText(d.rate)}% a year, more than savings earn (${a.savingsRate}%), so paying extra off it is a guaranteed return.${expensive.length > 1 ? ` ${expensive.slice(1).map((x) => `${x.name} (${pctText(x.rate)}%)`).join(' and ')} ${expensive.length > 2 ? 'are' : 'is'} next.` : ''} Put a share of your leftover money into “Paying off debts faster” (most expensive first), or raise the monthly payment in Your figures.`,
        at >= 0 ? [{ path: `debts.${at}.monthlyPayment`, op: 'add', value: extraPay }] : null,
        { safety: urgent, kind: 'interest', scale: at >= 0 ? (gbp) => [{ path: `debts.${at}.monthlyPayment`, op: 'add', value: Math.min(extraPay, gbp) }] : null,
          detail: at >= 0 ? (patch) => debtDetail(profile, at, patch, now) : null });
    }

    // 2. Emergency fund: scored in months of cover, never in retirement income.
    // Not judged until your cash savings are in.
    const aim = `A common aim is ${EMERGENCY_MIN_MONTHS}–${EMERGENCY_MAX_MONTHS} months (${money(emergency.min)}–${money(emergency.max)})`;
    if (emergency.short && cashKnown) {
      const shares = FP.projection.splitShares(profile.leftover, room);
      const share = split ? split.emergency / 100 : 0;
      const nowShare = shares.total > 0 ? shares.emergency : 0;
      // Your own split already gives it what the suggestion would: nothing to apply.
      const fill = left > 0 ? (unallocated
        ? ` The suggested split above puts ${split.emergency}% of what’s left (${money(left * share)} a month) into it, which gets you there in ${duration(emergency.monthsToFill(share))}${share < 1 ? `, or ${duration(emergency.monthsToFill(1))} with all of it` : ''}.`
        : ` Putting ${split.emergency}% of what’s left (${money(left * share)} a month) into your emergency fund gets you there in ${duration(emergency.monthsToFill(share))}${share < 1 ? `, or ${duration(emergency.monthsToFill(1))} with all of it` : ''}.`) : '';
      const idea = add('emergency', 'warn', 'Build your emergency fund',
        `Your cash covers about ${months.toFixed(1)} months of essential outgoings; your target is ${targetMonths} (${money(emergency.target)}). ${aim}.${fill}`,
        // With money left unallocated, the split action makes this change.
        !unallocated && splitIdea ? splitIdea.patch : null,
        { safety: true, noImpact: true });
      idea.cover = { now: months, target: targetMonths, monthsToFill: emergency.monthsToFill(unallocated || !splitIdea ? share : Math.max(share, nowShare)) };
    } else if (essentials > 0 && cashKnown) {
      add('emergencyOk', 'good', 'Emergency fund in place',
        `Your cash covers about ${months >= 24 ? 'over 24' : months.toFixed(1)} months of essential outgoings, meeting your ${targetMonths}-month target${months > EMERGENCY_MAX_MONTHS * 2 ? ' — more than you need in easy-access cash; some could work harder in investments or your pension' : ''}. Keep a small share going to it so it keeps up as your costs rise; anything beyond the target goes to your other choices.`);
    }

    // 3. Pension tax relief: the £100k tax trap, else higher-rate relief.
    const pi = forPension.i;
    const trap = inTaper ? taxTrap(profile, pi) : null;
    if (trap) {
      const lead = pi ? `${FP.profile.capital(whose(pi))} adjusted net income` : 'Your adjusted net income';
      add('taper', 'tip', pi ? `Use ${whose(pi)} pension to avoid the 60% band` : 'Use your pension to avoid the 60% band',
        `${lead} is about ${money(trap.ani)}. Between £100,000 and £125,140 ${who(pi)} ${pi ? 'loses' : 'lose'} some personal allowance, so ${pi ? 'keeps' : 'keep'} only about £${Math.round(FP.tax.keepOfNext(FP.tax.inputFromProfile(FP.profile.asPerson(profile, pi))))} of each extra £100. ${trap.pct != null ? `Paying ${money(trap.contribution)} more a year into ${whose(pi)} pension (${pctText(trap.pct)}% more of salary) brings it to £100,000 and saves about ${money(trap.taxSaved)} tax a year.` : `Pension contributions (or salary sacrifice) of ${money(trap.contribution)} a year would bring it to £100,000.`}`,
        trap.patch, { kind: 'tax', person: pi, scale: trap.patch ? pensionScale(trap.patch) : null, detail: trap.patch ? (patch) => pensionDetail(profile, patch, pi) : null });
    } else if (topRate >= 40) {
      const patch = pensionPatch(profile, 3, pi);
      add('relief', 'tip', pi ? `Higher-rate pension relief for ${who(pi)}` : 'Higher-rate pension relief',
        pi
          ? `${FP.profile.capital(who(pi))} pays ${topRate}% tax on the top slice of pay, so each £1 into ${whose(pi)} pension costs only about ${Math.round(100 - topRate)}p. Salary sacrifice also saves National Insurance.`
          : `You pay ${topRate}% tax on your top slice of pay, so each £1 into your pension costs you only about ${Math.round(100 - topRate)}p. Salary sacrifice also saves National Insurance.`,
        patch, { kind: 'retirement', scale: patch ? pensionScale(patch) : null, detail: patch ? (q) => pensionDetail(profile, q, pi) : null });
    }
    // Relief at source only gives basic-rate relief: the rest is claimed.
    people.forEach((x, i) => {
      const c = reliefToClaim(profile, i);
      if (!c) return;
      add(i ? 'claimReliefPartner' : 'claimRelief', 'tip', `Claim ${money(c.claim)} a year of higher-rate pension relief${i ? ` for ${who(i)}` : ''}`,
        `${FP.profile.capital(whose(i))} pension is paid from pay after tax (relief at source), so the provider adds only basic-rate relief. As a ${c.topRate}% taxpayer, ${who(i)} can claim about ${money(c.claim)} a year more through Self Assessment, or by asking HMRC to adjust ${whose(i)} tax code. Your plan assumes it’s claimed.`,
        null, { kind: 'tax', value: c.claim, due: nextDate(1, 31, now), detail: () => claimDetail(profile, i, c, nextDate(1, 31, now)) });
    });
    if ((a.employerPensionPct || 0) > 0) {
      add('match', 'tip', 'Check for employer matching',
        `Your employer adds ${a.employerPensionPct}%. Many employers add more if you pay more — if yours does, that’s usually the best return available.`);
    }

    // 4. Mortgage: a fixed rate ending soon, then overpaying.
    const fix = fixEnding(profile, opts.now);
    if (fix) {
      const change = fix.rise == null
        ? ' Add the rate you expect after in Your figures to see how your payments could change.'
        : fix.rise >= 1 ? ` Payments could rise by ${money(fix.rise)} a month.`
          : fix.rise <= -1 ? ` Payments could fall by ${money(-fix.rise)} a month.` : '';
      add('fixEnds', 'warn', `Your fixed rate ends in ${fix.when}`,
        `Your fix ends in ${fix.when}.${change} ${fix.monthsLeft >= 6 ? 'Start comparing deals six months before.' : 'Start comparing deals now: lenders usually let you secure a new deal up to six months before.'}`,
        null, { kind: 'payment', value: fix.rise > 0 ? fix.rise * 12 : null, due: fix.compareBy, detail: () => fixDetail(fix) });
    }
    const netInvest = FP.mix.netRate(profile.mixes.isa, a, 'invest');
    if (m && m.balance > 0) {
      if (m.rate > a.savingsRate) {
        add('mortgage', 'tip', 'Overpaying the mortgage beats cash savings',
          `Your mortgage costs ${pctText(m.rate)}% and cash earns ${a.savingsRate}%, so overpaying is a guaranteed saving once your emergency fund is in place. Investments are assumed to return ${netInvest.toFixed(1)}% after fees but can fall. Most lenders allow ${a.overpaymentLimitPct}% of the balance a year without a charge.`,
          [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: 200 }],
          { kind: 'interest', scale: (gbp) => [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: Math.min(200, gbp) }], detail: (patch) => mortgageDetail(profile, patch) });
      } else {
        add('mortgageLow', 'tip', 'Your mortgage is cheap',
          `At ${pctText(m.rate)}% it costs less than cash earns (${a.savingsRate}%), so there’s little gain in overpaying.`);
      }
    }

    // 5. ISA allowance
    // One ISA allowance each: a regular saving is yours unless it's your partner's.
    const rooms = people.map((x) => {
      const t = FP.savings.monthlyTotals(profile.savings.filter((sv) => (sv.owner === 'partner' && people.length > 1 ? 1 : 0) === x.index));
      return Math.max(0, (a.isaAllowance || 0) - (t.cashIsa + t.ssIsa) * 12);
    });
    const isaRoom = rooms.reduce((t, r) => t + r, 0);
    // New ISA payments: into your allowance first, then your partner's, in £10s, up to `total` a month.
    const isaRows = (total) => {
      const mine = Math.min(total, Math.floor(rooms[0] / 12 / 10) * 10);
      const theirs = people.length > 1 ? Math.min(total - mine, Math.floor(rooms[1] / 12 / 10) * 10) : 0;
      return [mine >= 10 ? { id: 'idea-isa', type: 'ssIsa', monthly: mine, grows: 'fixed' } : null,
        theirs >= 10 ? { id: 'idea-isa-2', type: 'ssIsa', monthly: theirs, grows: 'fixed', owner: 'partner' } : null].filter(Boolean);
    };
    const isaPatch = (total) => {
      const rows = isaRows(Math.floor(total / 10) * 10);
      return rows.length ? [{ path: 'savings', op: 'set', value: profile.savings.concat(rows) }] : null;
    };
    // What's left over, up to the allowance (or the allowance itself when nothing is).
    const isaMonthly = Math.floor(Math.min(isaRoom / 12, left > 0 ? left : isaRoom / 12) / 10) * 10;
    if (isaRoom > 0 && people.length > 1) {
      const each = money(a.isaAllowance);
      const lead = rooms[0] > 0 && rooms[1] > 0
        ? `You have about ${money(rooms[0])} of your ISA allowance left this year, and ${who(1)} has ${money(rooms[1])} (${each} each).`
        : rooms[0] > 0
          ? `You have about ${money(rooms[0])} of your ${each} ISA allowance left this year (${whose(1)} is used up).`
          : `${FP.profile.capital(who(1))} has about ${money(rooms[1])} of ${whose(1)} ${each} ISA allowance left this year (yours is used up).`;
      add('isa', 'tip', rooms[0] > 0 && rooms[1] > 0 ? 'Use your ISA allowances' : rooms[0] > 0 ? 'Use your ISA allowance' : `Use ${whose(1)} ISA allowance`,
        `${lead} Growth and interest in an ISA are tax-free. For money you won’t need for at least five years, a stocks & shares ISA has historically beaten cash, but can fall in value.`,
        isaPatch(isaMonthly), { kind: 'retirement', scale: (gbp) => isaPatch(Math.min(isaMonthly, gbp)), due: nextDate(4, 5, now), detail: (patch) => isaDetail(profile, patch, isaRoom, now) });
    } else if (isaRoom > 0) {
      add('isa', 'tip', 'Use your ISA allowance',
        `You have about ${money(isaRoom)} of this year’s ${money(a.isaAllowance)} ISA allowance left. Growth and interest in an ISA are tax-free. For money you won’t need for at least five years, a stocks & shares ISA has historically beaten cash, but can fall in value.`,
        isaPatch(isaMonthly), { kind: 'retirement', scale: (gbp) => isaPatch(Math.min(isaMonthly, gbp)), due: nextDate(4, 5, now), detail: (patch) => isaDetail(profile, patch, isaRoom, now) });
    }

    // 6. Student loan
    const proj = FP.projection.project(profile);
    // The first of you whose loan is written off before it's repaid.
    const loans = proj.ok ? (proj.events.studentLoans || [proj.events.studentLoan]) : [];
    const li = loans.findIndex((x) => x && x.tracked && x.writtenOffRow);
    const sl = li >= 0 ? loans[li] : null;
    if (sl && li > 0) {
      add('studentLoan', 'tip', `Don’t rush to overpay ${whose(li)} student loan`,
        `On these assumptions it’s written off in April ${sl.writeOffYear} before ${who(li)} repays it, so extra payments would mostly be lost. Your leftover money is likely to do more elsewhere.`,
        (profile.partner.income.studentLoanOverpayment || 0) > 0 ? [{ path: 'partner.income.studentLoanOverpayment', op: 'set', value: 0 }] : null, { kind: 'retirement' });
    } else if (sl && sl.tracked && sl.writtenOffRow) {
      add('studentLoan', 'tip', 'Don’t rush to overpay your student loan',
        `On these assumptions it’s written off in April ${sl.writeOffYear} before you repay it, so extra payments would mostly be lost. Your leftover money is likely to do more elsewhere.`,
        (profile.income.studentLoanOverpayment || 0) > 0 ? [{ path: 'income.studentLoanOverpayment', op: 'set', value: 0 }] : null, { kind: 'retirement' });
    }

    // 7. State Pension below the full amount.
    people.forEach((x, i) => {
      const g = statePensionGap(profile, i);
      if (!g) return;
      add(i ? 'statePensionPartner' : 'statePension', 'tip', i ? `Check ${whose(i)} State Pension record` : 'Check your State Pension record',
        `${i ? `${FP.profile.capital(whose(i))} plan has` : 'Your plan has'} a State Pension of ${money(g.have)} a year, below the full ${money(g.full)}. Check ${i ? 'their' : 'your'} record for gaps; voluntary contributions can add to it.`,
        null, { link: { href: STATE_PENSION_LINK, text: 'Check your State Pension (GOV.UK)' }, detail: () => statePensionDetail(profile, i, g) });
    });

    return { left, essentials, emergency, suggestions: out, split, splitReason: reason, splitIdea, unallocated, base, pay, today };
  }

  // The top rate someone pays on their pay (0 if none).
  const topRateOf = (t) => Math.max(0, ...t.taxByBand.filter((b) => b.amount > 0).map((b) => b.rate));

  // Income tax and National Insurance for person `i` (you, or 1 for your partner), a year.
  function taxOf(profile, i) {
    const t = FP.tax.forProfile(FP.profile.asPerson(profile, i || 0));
    return t.incomeTax + t.nationalInsurance;
  }
  // Tax (and NI) a patch saves person `i` a year.
  const taxSaved = (profile, patch, i) => taxOf(profile, i) - taxOf(FP.patch.applyPatch(profile, patch), i);

  /*
   * The £100k tax trap: with adjusted net income between £100,000 and
   * £125,140 (where the personal allowance tapers away), the pension
   * contribution that brings it back to £100,000. Returns null outside the
   * trap, else { ani, threshold, contribution (£ a year, gross), pct (more of
   * salary, to 0.1%; null without a salary), patch, taxSaved (£ a year) }.
   */
  function taxTrap(profile, i) {
    const cfg = FP.taxConfig;
    const own = FP.profile.asPerson(profile, i || 0);
    const t = FP.tax.forProfile(own);
    const top = cfg.taperThreshold + cfg.personalAllowance / cfg.taperRate;
    const ani = t.adjustedNetIncome;
    if (!(ani > cfg.taperThreshold && ani < top)) return null;
    const salary = own.income.grossSalary || 0;
    const room = 100 - (own.assumptions.employeePensionPct || 0);
    const need = ani - cfg.taperThreshold;
    if (!(salary > 0) || room <= 0) return { ani, threshold: cfg.taperThreshold, contribution: need, pct: null, patch: null, taxSaved: null };
    const path = FP.profile.personPath(i || 0, 'assumptions.employeePensionPct');
    const at = (pct) => [{ path, op: 'add', value: pct }];
    let pct = Math.min(room, Math.ceil((need / salary) * 1000 - 1e-9) / 10);
    // Contributions are capped at pay, so check, and step up if needed.
    while (pct < room && FP.tax.forProfile(FP.profile.asPerson(FP.patch.applyPatch(profile, at(pct)), i || 0)).adjustedNetIncome > cfg.taperThreshold + 0.5) {
      pct = Math.min(room, Math.round((pct + 0.1) * 10) / 10);
    }
    const patch = at(pct);
    return { ani, threshold: cfg.taperThreshold, contribution: salary * pct / 100, pct, patch, taxSaved: taxSaved(profile, patch, i) };
  }

  /*
   * Higher-rate relief to claim: with a relief-at-source pension the provider
   * adds basic-rate relief only, so someone paying 40% or more claims the rest
   * through Self Assessment. Returns null if there's none, else { claim (£ a
   * year), topRate, contribution (gross, a year) }.
   */
  function reliefToClaim(profile, i) {
    const own = FP.profile.asPerson(profile, i || 0);
    if (own.income.pensionMethod !== 'reliefAtSource') return null;
    const input = FP.tax.inputFromProfile(own);
    const t = FP.tax.takeHome(input);
    const top = topRateOf(t);
    if (top < 40 || !(t.employeePension > 0)) return null;
    const claim = FP.tax.takeHome({ ...input, reliefNotClaimed: true }).incomeTax - t.incomeTax;
    return claim >= 1 ? { claim, topRate: top, contribution: t.employeePension } : null;
  }

  // State Pension below the full amount: null, or { have, full, gap } (£ a year, today's money).
  function statePensionGap(profile, i) {
    const x = FP.profile.people(profile)[i || 0];
    if (!x) return null;
    const full = FULL_STATE_PENSION();
    const have = x.statePension || 0;
    return have < full - 0.5 ? { have, full, gap: full - have } : null;
  }

  /*
   * A mortgage fixed rate ending within 12 months of `now`: null, or { fixEnds,
   * when ("March 2027"), monthsLeft (to the fix's last month), compareBy
   * (six months before it ends, 'YYYY-MM-DD', or today if that's passed), paymentNow,
   * paymentAfter and rise (£ a month; null without a rate you expect after) }.
   */
  function fixEnding(profile, now) {
    const m = profile.mortgage;
    if (!(m.balance > 0)) return null;
    const end = FP.mortgage.monthIndex(m.fixEnds);
    if (end == null) return null;
    const d = now || new Date();
    const monthsLeft = end - (d.getFullYear() * 12 + d.getMonth());
    if (monthsLeft < 0 || monthsLeft > 12) return null;
    const loan = FP.loan.forMortgage(profile);
    const term = FP.summary.mortgageMonths(loan);
    // Start comparing deals six months before it ends: by the end of that month (or now, if that's passed).
    const by = end - 6;
    const compareBy = by < d.getFullYear() * 12 + d.getMonth() ? isoDate(d) : isoDate(new Date(Math.floor(by / 12), (by % 12) + 1, 0));
    const out = { fixEnds: m.fixEnds, when: FP.mortgage.monthName(m.fixEnds), monthsLeft, compareBy, paymentNow: null, paymentAfter: null, rise: null };
    if (loan.error || !(term > 0)) return out;
    const paymentNow = FP.mortgage.monthlyPayment(m.balance, loan.rate, term);
    out.paymentNow = paymentNow;
    if (m.rateAfterFix == null) return out;
    // The balance once the fix is over, with any overpayments, then the payment at the new rate.
    let bal = m.balance;
    const over = m.monthlyOverpayment || 0;
    const months = Math.min(term, monthsLeft + 1);
    for (let k = 0; k < months && bal > 0.005; k += 1) bal = Math.max(0, bal * (1 + loan.rate / 1200) - paymentNow - over);
    out.paymentAfter = FP.mortgage.monthlyPayment(bal, m.rateAfterFix, term - months);
    out.rise = out.paymentAfter - paymentNow;
    return out;
  }

  // ---------- Steps with figures, due dates and commitments ----------

  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // The next `day` of `month` (1-12) on or after `now`, as 'YYYY-MM-DD'.
  function nextDate(month, day, now) {
    const today = dayStart(now || new Date());
    let d = new Date(today.getFullYear(), month - 1, day);
    if (d < today) d = new Date(today.getFullYear() + 1, month - 1, day);
    return isoDate(d);
  }
  // Whole days from `now` until a 'YYYY-MM-DD' date.
  function daysUntil(iso, now) {
    const [y, mo, d] = iso.split('-').map(Number);
    return Math.round((new Date(y, mo - 1, d) - dayStart(now || new Date())) / 86400000);
  }
  // "5 April 2027".
  function longDate(iso) {
    const [y, mo, d] = iso.split('-').map(Number);
    return `${d} ${FP.mortgage.monthName(`${y}-${String(mo).padStart(2, '0')}`)}`;
  }

  /*
   * A pension contribution change for person `i`: from and to (% of
   * salary), what goes in a month (gross) and what it costs in take-home a
   * month, after tax relief (and NI, with salary sacrifice), for their tax
   * band and how their pension is paid.
   */
  function pensionChange(profile, patch, i) {
    const own = FP.profile.asPerson(profile, i || 0);
    const from = own.assumptions.employeePensionPct || 0;
    const add = patch[0].op === 'add' ? patch[0].value : patch[0].value - from;
    const after = FP.profile.asPerson(FP.patch.applyPatch(profile, patch), i || 0);
    const goingIn = (FP.tax.forProfile(after).employeePension - FP.tax.forProfile(own).employeePension) / 12;
    const cost = (FP.tax.forProfile(own).takeHome - FP.tax.forProfile(after).takeHome) / 12;
    return { from, to: Math.round((from + add) * 10) / 10, goingIn, cost };
  }
  function pensionDetail(profile, patch, i) {
    if (!patch) return null;
    const c = pensionChange(profile, patch, i);
    const your = i ? `${FP.profile.whose(profile, i)}` : 'your';
    const you = i ? FP.profile.who(profile, i) : 'you';
    return {
      steps: [
        `Ask payroll or HR to raise ${your} contribution from ${pctText(c.from)}% to ${pctText(c.to)}%: about ${money(c.goingIn)} a month going in, costing ${you} about ${money(c.cost)} after tax relief.`,
        PENSION_STEPS[1],
        `Check ${i ? 'the' : 'your'} next payslip: about ${money(c.goingIn)} more a month should be going in.`,
      ],
      what: `Raise ${your} pension contribution from ${pctText(c.from)}% to ${pctText(c.to)}%`,
      amount: c.goingIn,
      per: 'month',
    };
  }

  // The new ISA payments a patch adds, a month.
  const isaAdded = (profile, patch) => (patch[0].value || []).slice(profile.savings.length).reduce((t, r) => t + (r.monthly || 0), 0);
  function isaDetail(profile, patch, room, now) {
    if (!patch) return null;
    const monthly = isaAdded(profile, patch);
    const due = nextDate(4, 5, now);
    const days = daysUntil(due, now);
    return {
      steps: [
        `Set up ${money(monthly)} a month into a stocks & shares ISA (or a cash ISA for money you\u2019ll need within five years). Open one, or top up one you already have.`,
        `You have about ${money(room)} of this year\u2019s allowance left, and ${days} ${days === 1 ? 'day' : 'days'} until it resets on ${longDate(due)}.`,
        'Set the payment for payday so it happens without thinking about it.',
      ],
      what: `Pay ${money(monthly)} a month into an ISA`,
      amount: monthly,
      per: 'month',
    };
  }

  function mortgageDetail(profile, patch) {
    if (!patch) return null;
    const extra = patch[0].value;
    const a = profile.assumptions;
    const limit = (profile.mortgage.balance || 0) * (a.overpaymentLimitPct || 0) / 100;
    return {
      steps: [
        `Ask your lender to set up a regular overpayment of ${money(extra)} a month (${money(extra * 12)} a year).`,
        `Stay within your deal\u2019s yearly limit, often ${a.overpaymentLimitPct}% of the balance: about ${money(limit)} this year. Above it you may pay an early repayment charge.`,
        'Ask whether overpaying shortens your term or lowers your monthly payment.',
      ],
      what: `Overpay your mortgage by ${money(extra)} a month`,
      amount: extra,
      per: 'month',
    };
  }

  /*
   * A debt's new monthly payment, and the month it's cleared at that rate
   * ("March 2028", or null if it never is).
   */
  function debtClears(profile, at, patch, now) {
    const d = profile.debts[at];
    const loan = FP.loan.forDebt(d, profile.assumptions);
    const pay = (d.monthlyPayment || loan.payment || 0) + patch[0].value;
    const months = FP.loan.monthsFor(d.balance, FP.loan.monthlyRate(loan.rate, 'apr'), pay);
    if (!Number.isFinite(months)) return { from: d.monthlyPayment || loan.payment || 0, pay, cleared: null };
    const t = now || new Date();
    const i = t.getFullYear() * 12 + t.getMonth() + Math.max(0, Math.ceil(months - 1e-9) - 1);
    return { from: d.monthlyPayment || loan.payment || 0, pay, cleared: FP.mortgage.monthName(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`) };
  }
  function debtDetail(profile, at, patch, now) {
    if (!patch) return null;
    const d = profile.debts[at];
    const c = debtClears(profile, at, patch, now);
    return {
      steps: [
        `Raise your monthly payment on ${d.name || 'this debt'} from ${money(c.from)} to ${money(c.pay)}${c.cleared ? `: at that rate it\u2019s cleared by ${c.cleared}` : ''}.`,
        HOW_TO.debt[1],
        HOW_TO.debt[2],
      ],
      what: `Pay ${money(c.pay)} a month off ${d.name || 'your debt'}${c.cleared ? `, cleared by ${c.cleared}` : ''}`,
      amount: c.pay,
      per: 'month',
    };
  }

  function claimDetail(profile, i, c, due) {
    const your = FP.profile.whose(profile, i);
    return {
      steps: [
        `If ${i ? `${FP.profile.who(profile, i)} doesn\u2019t` : 'you don\u2019t'} already send a Self Assessment return, register for one on GOV.UK.`,
        `On the return, enter ${your} pension contributions (about ${money(c.contribution)} a year, including the basic-rate relief) to get the extra ${money(c.claim)}. Returns are due by ${longDate(due)}.`,
        `Or ask HMRC to adjust ${your} tax code so the relief comes through ${your} pay each month.`,
      ],
      what: `Claim ${money(c.claim)} of higher-rate pension relief through Self Assessment`,
      amount: c.claim,
      per: 'year',
    };
  }

  function fixDetail(fix) {
    return {
      steps: [
        `By ${longDate(fix.compareBy)}, start comparing deals: your lender\u2019s offers for existing customers, and what a broker can find.`,
        `Most offers can be secured up to six months ahead, so you can move straight onto a new rate when your fix ends in ${fix.when}.`,
        fix.rise == null ? 'Add the rate you expect after in Your figures to see how your payments could change.'
          : `Budget for the change: about ${money(Math.abs(fix.rise))} a month ${fix.rise >= 0 ? 'more' : 'less'} at the rate you expect.`,
      ],
      what: `Compare mortgage deals before your fix ends in ${fix.when}`,
      amount: null,
    };
  }

  function statePensionDetail(profile, i, g) {
    return {
      steps: [
        `Check ${i ? `${FP.profile.whose(profile, i)}` : 'your'} State Pension forecast and National Insurance record on GOV.UK.`,
        'Look for gaps: you can usually pay voluntary contributions for the last six years.',
        `Before paying, check how much it would add (the full amount is ${money(g.full)} a year).`,
      ],
      what: `Check ${i ? `${FP.profile.whose(profile, i)}` : 'your'} State Pension record for gaps`,
      amount: null,
    };
  }

  /*
   * An idea's value a year in £, what it's ranked by: interest saved a year,
   * extra retirement income a year (today's money) or tax saved a year, for
   * the change you can afford (see affordability). Null when it has none.
   */
  function valuePerYear(idea) {
    if (idea.value !== undefined) return idea.value;
    const af = idea.afford;
    const imp = af && af.scaled ? af.scaled.impact : idea.impact;
    const patch = af && af.scaled ? af.scaled.patch : idea.patch;
    if (!imp || !patch) return null;
    if (idea.kind === 'interest') return imp.change.interestSavedPerYear == null ? null : Math.max(0, imp.change.interestSavedPerYear);
    if (idea.kind === 'tax') return Math.max(0, taxSaved(idea.from, patch, idea.person));
    if (idea.kind === 'retirement') return Number.isFinite(imp.change.retirementSpend) ? imp.change.retirementSpend * 12 : null;
    return null;
  }

  /*
   * Whether you can afford an idea's change from what's left over each month.
   * Returns null when it costs nothing a month or fits; else { cost, left,
   * scaled: { patch, impact, monthly } (the change scaled to what you can
   * afford) or null, none: true when nothing useful fits }. Worked out when read.
   */
  function affordability(idea, left) {
    let done;
    let result;
    return Object.defineProperty({}, 'value', { get: () => {
      if (done) return result;
      done = true;
      const imp = idea.impact;
      const cost = imp && Number.isFinite(imp.change.leftover) ? -imp.change.leftover : 0;
      if (!(cost > left + 0.5)) { result = null; return result; }
      result = { cost, left, scaled: null, none: true };
      if (!idea.scale || left < MIN_AFFORDABLE) return result;
      // Scale down until it fits.
      let f = left / cost;
      for (let k = 0; k < 8; k += 1) {
        const patch = idea.scale(Math.floor(cost * f), f);
        if (!patch) break;
        const scaled = FP.patch.impact(idea.from, patch);
        const c = -scaled.change.leftover;
        if (c <= left + 0.5) {
          if (c >= MIN_AFFORDABLE - 0.5) result = { cost, left, scaled: { patch, impact: scaled, monthly: c }, none: false };
          break;
        }
        f *= 0.95 * (left / c);
      }
      return result;
    } });
  }

  // A pension patch ('add' to a contribution %) scaled by f, to 0.1%.
  const pensionScale = (patch) => (gbp, f) => {
    const v = Math.floor(patch[0].value * f * 10) / 10;
    return v > 0 ? [{ ...patch[0], value: v }] : null;
  };

  /*
   * The order to show actions in: deciding what to do with unallocated money
   * left over first, then safety problems (short each month, no emergency
   * fund, debt over 20% APR), then by value a year, biggest first; ideas with
   * no value in £ after those. Returns { main, smaller (worth under £100 a
   * year), later (nothing affordable now: for when you have room) }.
   */
  function groupActions(list) {
    const val = (x) => valuePerYear(x);
    const rank = (x) => (x.decide ? 0 : x.safety ? 1 : 2);
    // Safety problems in their own order: short each month, the emergency fund, then debt.
    const sorted = list.map((x, i) => ({ x, i, v: val(x) })).sort((p, q) => rank(p.x) - rank(q.x)
      || (rank(p.x) === 1 ? SAFETY_ORDER.indexOf(p.x.id) - SAFETY_ORDER.indexOf(q.x.id) : 0)
      || (q.v == null ? -Infinity : q.v) - (p.v == null ? -Infinity : p.v) || (q.x.patch ? 1 : 0) - (p.x.patch ? 1 : 0) || p.i - q.i);
    const out = { main: [], smaller: [], later: [] };
    sorted.forEach(({ x, v }) => {
      const af = x.afford;
      if (rank(x) < 2) out.main.push(x);
      else if (af && af.none) out.later.push(x);
      else if (v != null && v < SMALL_VALUE) out.smaller.push(x);
      else out.main.push(x);
    });
    return out;
  }
  // The same, as one list: main, then smaller ideas, then for when you have room.
  function rankActions(list) {
    const g = groupActions(list);
    return g.main.concat(g.smaller, g.later);
  }

  /*
   * Every action for a plan: the ideas worth acting on (not the "already
   * fine" ones), the suggested split (when it differs from yours, and isn't
   * already the emergency fund's change) and the typical mix for your risk
   * level. opts as for analyse.
   */
  function actions(profile, opts) {
    const r = analyse(profile, opts);
    const list = r.suggestions.filter((s) => s.tone !== 'good');
    // "Build your emergency fund" with a split of your own already means
    // using the suggested split: one card, making exactly that change.
    const fund = list.find((s) => s.id === 'emergency');
    const split = fund && !r.unallocated ? null : r.splitIdea;
    const mix = mixAction(profile, r);
    return (split ? [split] : []).concat(list, mix || []);
  }

  /*
   * An idea: { id, tone, title, text, patch, impact, howTo, safety, kind,
   * link, afford }. impact re-runs the plan (from `from`, the plan as it
   * was), so it's only worked out when read; so is afford (see
   * affordability). extra: { safety, kind ('interest' | 'retirement' |
   * 'tax' | 'payment'), value (a fixed value a year), person, scale(£ a
   * month, fraction) → a smaller patch, link: { href, text }, noImpact,
   * due ('YYYY-MM-DD'), detail(patch) → { steps (with figures worked out
   * from the change made), what, amount, per ('month' | 'year') } }.
   */
  function makeIdea(from, id, tone, title, text, patch, extra) {
    const x = extra || {};
    const idea = { id, tone, title, text, patch: patch || null };
    let impact;
    Object.defineProperty(idea, 'impact', {
      enumerable: true,
      get: () => {
        if (impact === undefined) impact = idea.patch && !x.noImpact ? FP.patch.impact(from, idea.patch) : null;
        return impact;
      },
    });
    // The change you'd actually make: the part you can afford, if that's smaller.
    const made = () => (idea.afford && idea.afford.scaled ? idea.afford.scaled.patch : idea.patch);
    let detail;
    const detailOf = () => {
      if (detail === undefined) detail = x.detail ? x.detail(made()) : null;
      return detail;
    };
    let howTo;
    Object.defineProperty(idea, 'howTo', {
      enumerable: true,
      get: () => {
        if (!howTo) howTo = (detailOf() && detailOf().steps) || (HOW_TO[id] || []).slice();
        return howTo;
      },
    });
    // A date to do it by ('YYYY-MM-DD'), or null.
    idea.due = x.due || null;
    // What you'd commit to by applying it or marking it done: { action, what, amount, per, due }.
    Object.defineProperty(idea, 'commitment', {
      value: () => {
        const d = detailOf() || {};
        return { action: id, what: d.what || title, amount: d.amount == null ? null : d.amount, per: d.amount == null ? null : d.per || 'month', due: idea.due };
      },
    });
    idea.safety = !!x.safety;
    idea.kind = x.kind || null;
    if (x.value !== undefined) idea.value = x.value;
    if (x.link) idea.link = x.link;
    if (x.person) idea.person = x.person;
    // Not saved or compared: how to work out a smaller change, and the plan it's measured on.
    Object.defineProperty(idea, 'scale', { value: x.scale || null });
    Object.defineProperty(idea, 'from', { value: from });
    let afford = null;
    Object.defineProperty(idea, 'afford', {
      enumerable: true,
      get: () => (afford ? afford.value : null),
      set: (v) => { afford = v; },
    });
    return idea;
  }

  /*
   * How to make each kind of change, in a few plain steps. General: no
   * providers or products.
   */
  const PENSION_STEPS = [
    'Ask payroll or HR how to pay more into your workplace pension. Most schemes let you change it at any time.',
    'If they offer salary sacrifice, ask about it: it saves National Insurance as well as tax.',
    'Check your next payslip to see the new amount going in.',
  ];
  const HOW_TO = {
    relief: PENSION_STEPS,
    taper: PENSION_STEPS,
    isa: [
      'Decide between a cash ISA and a stocks & shares ISA (for money you won\u2019t need for at least five years).',
      'Open one, or top up one you already have. The allowance runs from 6 April to 5 April.',
      'Set up a monthly payment on payday so it happens without thinking about it.',
    ],
    mortgage: [
      'Check your lender\u2019s yearly overpayment limit first (often 10% of the balance), so you don\u2019t pay an early repayment charge.',
      'Ask whether overpaying shortens your term or lowers your monthly payment.',
      'Set it up with your lender as a regular monthly amount or a lump sum.',
    ],
    mix: [
      'Check what each pot is invested in now: your provider\u2019s app or latest statement lists its funds and how much is in shares, bonds and cash.',
      'Most providers let you change funds online. Many workplace pensions have ready-made options at different risk levels.',
      'Compare the charges before you switch, and consider regulated advice if you\u2019re unsure.',
    ],
    debt: [
      'Pay more than the minimum each month, starting with the most expensive debt.',
      'For a credit card, consider a 0% balance transfer: check the fee and how long the 0% lasts.',
      'Set up a direct debit for the higher amount so it\u2019s never late.',
    ],
  };

  /*
   * The suggested split as an action, so the advice and the plan can't disagree:
   * applying its patch does exactly what "Use this split" does. Null when
   * there's no suggestion or you're already using it.
   */
  function splitAction(profile, r) {
    r = r || analyse(profile);
    return r.splitIdea || null;
  }
  // The split action for analyse(). With nothing chosen for money left over,
  // it's the first thing to decide: "Decide what to do with your £X left over".
  function makeSplitIdea(profile, r, unallocated) {
    const left = Math.max(0, r.left || 0);
    const now = FP.projection.splitAsPct(profile.leftover, left);
    if (FP.projection.SPLIT_KEYS.every((k) => Math.abs((now[k] || 0) - r.split[k]) < 0.5)) return null;
    const next = FP.projection.setSplitFromPct({ ...profile.leftover }, r.split, left);
    const patch = FP.projection.SPLIT_KEYS.map((k) => ({ path: `leftover.${k}`, op: 'set', value: next[k] }));
    // Nothing chosen yet means nothing is saved: that's a problem to fix, not a tip.
    const idea = makeIdea(JSON.parse(JSON.stringify(profile)), 'split', unallocated ? 'warn' : 'tip',
      unallocated ? `Decide what to do with your ${money(left)} left over` : 'Use the suggested split',
      `${unallocated ? 'Until you choose, your plan treats it as spent. A suggested split: ' : ''}${FP.projection.SPLIT_KEYS.filter((k) => r.split[k] > 0).map((k) => `${r.split[k]}% ${SPLIT_NAMES[k]}`).join(', ')}. ${r.splitReason}`,
      patch, { kind: 'retirement' });
    idea.decide = unallocated;
    return idea;
  }
  /*
   * The model mix for your risk level as an action: applying it gives your
   * pension, ISAs and any other pots with money in them that mix, so it can be
   * tried as a scenario first. An illustration for people with that risk
   * level, not a recommendation. Null without a risk level, or when every pot
   * has the mix already. Also carries tradeOff (one line) and notice.
   * With r (from analyse), it's measured on top of the suggested split as
   * the other ideas are.
   */
  function mixAction(profile, r) {
    const level = profile.about.riskAppetite;
    const m = FP.mix.model(level);
    const patch = m ? FP.mix.useAllPatch(profile, level) : null;
    if (!patch) return null;
    const names = FP.mix.shownPots(profile).filter((x) => patch.some((c) => c.path === x.path)).map((x) => x.short);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const idea = makeIdea(r && r.base ? r.base : JSON.parse(JSON.stringify(profile)), 'mix', 'tip', `Use a typical ${level} mix`,
      `${FP.profile.capital(FP.mix.describe(m))} for your ${list}. A typical mix for people with a ${level} risk level.`, patch, { kind: 'retirement' });
    idea.tradeOff = FP.mix.tradeOffText(m, profile.assumptions);
    idea.notice = FP.mix.NOTICE;
    return idea;
  }

  const SPLIT_NAMES = { emergency: 'emergency fund', debts: 'paying off debts', cash: 'cash savings', invest: 'investments', mortgage: 'mortgage', pension: 'pension' };

  // The figure an idea's value a year is shown as.
  const VALUE_KEYS = { interest: 'interestPerYear', tax: 'taxPerYear', retirement: 'retirementPerYear', payment: 'paymentRise' };

  /*
   * Up to two figures that say what an action does: its value a year (see
   * valuePerYear), then what it costs: less left over each month now, or else
   * whatever gets worse (less to spend in retirement, more interest, debt-free
   * later), or else its next gain (debt-free sooner, money lasting longer, more
   * in savings and pensions when you retire). For a change scaled to what you
   * can afford, the figures are for that. The emergency fund is shown in
   * months of cover: now, and how soon it reaches your target.
   * Returns [{ key, value }]: value is the size of the change (always positive).
   */
  function highlights(idea) {
    if (!idea) return [];
    if (idea.cover) {
      return [{ key: 'coverNow', value: idea.cover.now },
        idea.cover.monthsToFill > 0 ? { key: 'coverIn', value: idea.cover.monthsToFill, target: idea.cover.target } : null].filter(Boolean);
    }
    const v = valuePerYear(idea);
    const main = v >= 1 && VALUE_KEYS[idea.kind] ? { key: VALUE_KEYS[idea.kind], value: idea.kind === 'payment' ? v / 12 : v } : null;
    const af = idea.afford;
    const impact = af && af.scaled ? af.scaled.impact : idea.impact;
    if (!impact) return main ? [main] : [];
    const c = impact.change;
    const gains = [
      !main && c.retirementSpend >= 1 ? { key: 'retirementPerYear', value: c.retirementSpend * 12 } : null,
      c.debtFreeAge < 0 ? { key: 'debtFreeSooner', value: -c.debtFreeAge } : null,
      c.lastsTo > 0 ? { key: 'lastsLonger', value: c.lastsTo } : null,
      c.atRetirement >= 1 ? { key: 'atRetirement', value: c.atRetirement } : null,
    ].filter(Boolean);
    const costs = [
      c.leftover <= -1 ? { key: 'leftoverCost', value: -c.leftover } : null,
      c.retirementSpend <= -1 ? { key: 'retirementSpendCost', value: -c.retirementSpend } : null,
      c.interest >= 1 ? { key: 'interestCost', value: c.interest } : null,
      c.debtFreeAge > 0 ? { key: 'debtFreeLater', value: c.debtFreeAge } : null,
    ].filter(Boolean);
    const first = main || gains.shift();
    return [first, costs[0] || gains[0]].filter(Boolean);
  }

  // More into person `i`'s workplace pension (you, or 1 for your partner): `pct`
  // more of salary (up to 100% in all), or null.
  function pensionPatch(profile, pct, i) {
    const own = FP.profile.asPerson(profile, i || 0);
    const room = 100 - (own.assumptions.employeePensionPct || 0);
    const value = Math.min(pct, room);
    return value > 0 && (own.income.grossSalary || 0) > 0 ? [{ path: FP.profile.personPath(i || 0, 'assumptions.employeePensionPct'), op: 'add', value }] : null;
  }

  // A sensible starting split for the leftover money (adds up to 100%). It always
  // includes the emergency fund: mostly while it's short, and a small share once
  // it's full so it keeps up with rising costs (the projection passes on
  // anything beyond the target).
  function suggestSplit(s) {
    const months = s.emergency.targetMonths || EMERGENCY_MIN_MONTHS;
    if (s.emergency.short && s.expensive) {
      return {
        split: { emergency: 50, debts: 40, cash: 0, invest: 0, mortgage: 0, pension: 10 },
        reason: `Split between your emergency fund (until it covers ${months} months) and clearing expensive debts. In your projection, each share moves to your other choices once it\u2019s done.`,
      };
    }
    if (s.emergency.short) {
      return {
        split: { emergency: 80, debts: 0, cash: 0, invest: 10, mortgage: 0, pension: 10 },
        reason: `Mostly into your emergency fund until it covers ${months} months. In your projection, this share moves to your other choices once the fund is full.`,
      };
    }
    if (s.expensive) {
      return {
        split: { emergency: 10, debts: 70, cash: 0, invest: 10, mortgage: 0, pension: 10 },
        reason: 'Mostly towards clearing expensive debts, with a top-up to keep your emergency fund at its target. In your projection, the debt share moves to your other choices once they\u2019re paid off.',
      };
    }
    if (s.inTaper) {
      return { split: { emergency: 10, debts: 0, cash: 0, invest: 20, mortgage: 0, pension: 70 }, reason: 'Mostly pension, to win back the personal allowance you lose between £100,000 and £125,140, with a top-up to keep your emergency fund at its target.' };
    }
    const emergency = 10;
    const pension = s.topRate >= 40 ? 40 : 20;
    const mortgage = s.hasMortgage && s.mortgageBeatsCash ? (s.topRate >= 40 ? 10 : 20) : 0;
    return {
      split: { emergency, debts: 0, cash: 0, invest: 100 - emergency - pension - mortgage, mortgage, pension },
      reason: [
        'A top-up to keep your emergency fund at its target as costs rise',
        s.topRate >= 40 ? 'a bigger pension share for higher-rate tax relief' : 'some pension for tax relief',
        mortgage ? 'some mortgage overpayment because it costs more than cash earns' : null,
        'and the rest invested for the long term (ISA first)',
      ].filter(Boolean).join(', ').replace(/, and/, ' and') + '.',
    };
  }

  FP.suggest = {
    analyse, actions, suggestSplit, splitAction, mixAction, rankActions, groupActions, highlights, valuePerYear, duration,
    taxTrap, reliefToClaim, statePensionGap, fixEnding, pensionChange, debtClears, nextDate, daysUntil, HOW_TO, EMERGENCY_MIN_MONTHS, EMERGENCY_MAX_MONTHS, SMALL_VALUE, SAFETY_DEBT_APR, STATE_PENSION_LINK,
  };
})(globalThis.FP = globalThis.FP || {});
