/*
 * Ideas for money left over each month, based on the profile. Pure functions,
 * no DOM. These are general rules of thumb to consider - not advice.
 *
 * Returns { left, essentials, emergency, suggestions: [{ id, tone, title, text, patch, impact, howTo }],
 *           split: { emergency, debts, cash, invest, mortgage, pension } | null, splitReason }
 * tone: 'warn' (fix first), 'tip' (worth considering), 'good' (already fine).
 * patch: the one change to the plan the idea suggests (see FP.patch), or null
 * when there isn't one. impact: FP.patch.impact of that change, or null; it
 * re-runs the plan, so it's only worked out the first time it's read.
 * howTo: steps to make the change (none yet).
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

  function analyse(profile) {
    const a = profile.assumptions;
    // Your pay (for your tax band and the taper); the household's take-home for what's left.
    const pay = FP.tax.forProfile(profile);
    const today = FP.summary.compute(profile, FP.tax.household(profile).takeHomeMonthly);
    const cf = today.cashFlow;
    const left = cf.surplus;
    const essentials = cf.outgoings;
    const cash = profile.assets.cashSavings || 0;
    const months = essentials > 0 ? cash / essentials : Infinity;
    const targetMonths = profile.leftover.emergencyMonths || EMERGENCY_MIN_MONTHS;
    const emergency = {
      months,
      targetMonths,
      target: essentials * targetMonths,
      min: essentials * EMERGENCY_MIN_MONTHS,
      max: essentials * EMERGENCY_MAX_MONTHS,
      short: essentials > 0 && months < targetMonths,
    };
    // Months to fill the fund from `share` (a fraction) of what's left each month.
    emergency.monthsToFill = (share) => (emergency.short && share > 0 && left > 0
      ? Math.ceil((emergency.target - cash) / (left * share)) : 0);
    const out = [];
    // The plan as it is now, for working out each idea's impact later.
    let asNow = null;
    const add = (id, tone, title, text, patch) => {
      if (patch && !asNow) asNow = JSON.parse(JSON.stringify(profile));
      out.push(makeIdea(asNow, id, tone, title, text, patch));
    };

    // Nothing left over: that comes first.
    if (!(left > 0)) {
      add('noSurplus', 'warn', 'Nothing left over each month',
        left < 0
          ? `You’re ${money(-left)} a month short after spending, debts and regular savings. Look at your biggest spending categories, or reduce regular savings until it balances.`
          : 'Everything you take home is already spoken for. Small cuts to spending would give you room to save.');
      return { left, essentials, emergency, suggestions: out, split: null, splitReason: null, pay, today };
    }

    // 1. Expensive debts
    const expensive = today.debts
      .filter((d) => d.balance > 0 && d.rate >= (a.savingsRate || 0) + EXPENSIVE_DEBT_MARGIN)
      .sort((x, y) => y.rate - x.rate);
    if (expensive.length) {
      const d = expensive[0];
      const at = profile.debts.findIndex((x) => x.id === d.id);
      add('debt', 'warn', `Clear ${d.name} first`,
        `It costs ${pctText(d.rate)}% a year, more than savings earn (${a.savingsRate}%), so paying extra off it is a guaranteed return.${expensive.length > 1 ? ` ${expensive.slice(1).map((x) => `${x.name} (${pctText(x.rate)}%)`).join(' and ')} ${expensive.length > 2 ? 'are' : 'is'} next.` : ''} Put a share of your leftover money into \u201cPaying off debts faster\u201d (most expensive first), or raise the monthly payment in Your figures.`,
        at >= 0 ? [{ path: `debts.${at}.monthlyPayment`, op: 'add', value: 50 }] : null);
    }

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
        topRate: Math.max(0, ...own.taxByBand.filter((b) => b.amount > 0).map((b) => b.rate)),
        inTaper: own.adjustedNetIncome > cfg.taperThreshold && own.adjustedNetIncome < taperTop,
      };
    });
    const forPension = bands.find((b) => b.inTaper) || bands.find((b) => b.topRate >= 40) || bands[0];
    const { topRate, inTaper } = forPension;
    // "your" or "Sam’s", for the person an idea is about.
    const whose = (i) => FP.profile.whose(profile, i);
    const who = (i) => FP.profile.who(profile, i);
    const m = today.mortgage;
    const { split, reason } = suggestSplit({ emergency, inTaper, topRate, hasMortgage: !!(m && m.balance > 0), mortgageBeatsCash: !!(m && m.rate > a.savingsRate), expensive: expensive.length > 0 });

    // 2. Emergency fund
    const aim = `A common aim is ${EMERGENCY_MIN_MONTHS}–${EMERGENCY_MAX_MONTHS} months (${money(emergency.min)}–${money(emergency.max)})`;
    if (emergency.short) {
      const share = split.emergency / 100;
      add('emergency', 'warn', 'Build your emergency fund',
        `Your cash covers about ${months.toFixed(1)} months of essential outgoings; your target is ${targetMonths} (${money(emergency.target)}). ${aim}. Putting ${split.emergency}% of what’s left (${money(left * share)} a month) into your emergency fund gets you there in ${duration(emergency.monthsToFill(share))}${share < 1 ? `, or ${duration(emergency.monthsToFill(1))} with all of it` : ''}.`,
        [{ path: 'leftover.unit', op: 'set', value: 'pct' }].concat(FP.projection.SPLIT_KEYS.map((k) => ({ path: `leftover.${k}`, op: 'set', value: split[k] }))));
    } else if (essentials > 0) {
      add('emergencyOk', 'good', 'Emergency fund in place',
        `Your cash covers about ${months >= 24 ? 'over 24' : months.toFixed(1)} months of essential outgoings, meeting your ${targetMonths}-month target${months > EMERGENCY_MAX_MONTHS * 2 ? ' — more than you need in easy-access cash; some could work harder in investments or your pension' : ''}. Keep a small share going to it so it keeps up as your costs rise; anything beyond the target goes to your other choices.`);
    }

    // 3. Pension tax relief
    const pi = forPension.i;
    if (inTaper && pi) {
      add('taper', 'tip', `Use ${whose(pi)} pension to avoid the 60% band`,
        `Between £100,000 and £125,140 ${who(pi)} loses some personal allowance, so keeps only about £${Math.round(FP.tax.keepOfNext(FP.tax.inputFromProfile(FP.profile.asPerson(profile, pi))))} of each extra £100. ${FP.profile.capital(whose(pi))} pension contributions (or salary sacrifice) bring ${whose(pi)} income down and win that back.`,
        taperPatch(profile, cfg.taperThreshold, pi));
    } else if (inTaper) {
      add('taper', 'tip', 'Use your pension to avoid the 60% band',
        `Between £100,000 and £125,140 you lose some personal allowance, so you keep only about £${Math.round(FP.tax.keepOfNext(FP.tax.inputFromProfile(profile)))} of each extra £100. Pension contributions (or salary sacrifice) bring your income down and win that back.`,
        taperPatch(profile, cfg.taperThreshold));
    } else if (topRate >= 40 && pi) {
      add('relief', 'tip', `Higher-rate pension relief for ${who(pi)}`,
        `${FP.profile.capital(who(pi))} pays ${topRate}% tax on the top slice of pay, so each £1 into ${whose(pi)} pension costs only about ${Math.round(100 - topRate)}p (claim the extra relief through self assessment if the scheme doesn’t give it). Salary sacrifice also saves National Insurance.`,
        pensionPatch(profile, 3, pi));
    } else if (topRate >= 40) {
      add('relief', 'tip', 'Higher-rate pension relief',
        `You pay ${topRate}% tax on your top slice of pay, so each £1 into your pension costs you only about ${Math.round(100 - topRate)}p (claim the extra relief through self assessment if your scheme doesn’t give it). Salary sacrifice also saves National Insurance.`,
        pensionPatch(profile, 3));
    }
    if ((a.employerPensionPct || 0) > 0) {
      add('match', 'tip', 'Check for employer matching',
        `Your employer adds ${a.employerPensionPct}%. Many employers add more if you pay more — if yours does, that’s usually the best return available.`);
    }

    // 4. Mortgage vs savings
    const netInvest = FP.mix.netRate(profile.mixes.isa, a, 'invest');
    if (m && m.balance > 0) {
      if (m.rate > a.savingsRate) {
        add('mortgage', 'tip', 'Overpaying the mortgage beats cash savings',
          `Your mortgage costs ${pctText(m.rate)}% and cash earns ${a.savingsRate}%, so overpaying is a guaranteed saving once your emergency fund is in place. Investments are assumed to return ${netInvest.toFixed(1)}% after fees but can fall. Most lenders allow ${a.overpaymentLimitPct}% of the balance a year without a charge.`,
          [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: 200 }]);
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
    if (isaRoom > 0 && people.length > 1) {
      // What's left over, in £10s: into your allowance first, then your partner's.
      const total = Math.floor(Math.min(isaRoom / 12, left) / 10) * 10;
      const mine = Math.min(total, Math.floor(rooms[0] / 12 / 10) * 10);
      const theirs = Math.min(total - mine, Math.floor(rooms[1] / 12 / 10) * 10);
      const rows = [mine >= 10 ? { id: 'idea-isa', type: 'ssIsa', monthly: mine, grows: 'fixed' } : null,
        theirs >= 10 ? { id: 'idea-isa-2', type: 'ssIsa', monthly: theirs, grows: 'fixed', owner: 'partner' } : null].filter(Boolean);
      const each = money(a.isaAllowance);
      const lead = rooms[0] > 0 && rooms[1] > 0
        ? `You have about ${money(rooms[0])} of your ISA allowance left this year, and ${who(1)} has ${money(rooms[1])} (${each} each).`
        : rooms[0] > 0
          ? `You have about ${money(rooms[0])} of your ${each} ISA allowance left this year (${whose(1)} is used up).`
          : `${FP.profile.capital(who(1))} has about ${money(rooms[1])} of ${whose(1)} ${each} ISA allowance left this year (yours is used up).`;
      add('isa', 'tip', rooms[0] > 0 && rooms[1] > 0 ? 'Use your ISA allowances' : rooms[0] > 0 ? 'Use your ISA allowance' : `Use ${whose(1)} ISA allowance`,
        `${lead} Growth and interest in an ISA are tax-free. For money you won’t need for at least five years, a stocks & shares ISA has historically beaten cash, but can fall in value.`,
        rows.length ? [{ path: 'savings', op: 'set', value: profile.savings.concat(rows) }] : null);
    } else if (isaRoom > 0) {
      // Into a stocks & shares ISA: what's left over, up to the allowance, in £10s.
      const isaMonthly = Math.floor(Math.min(isaRoom / 12, left) / 10) * 10;
      add('isa', 'tip', 'Use your ISA allowance',
        `You have about ${money(isaRoom)} of this year’s ${money(a.isaAllowance)} ISA allowance left. Growth and interest in an ISA are tax-free. For money you won’t need for at least five years, a stocks & shares ISA has historically beaten cash, but can fall in value.`,
        isaMonthly >= 10 ? [{ path: 'savings', op: 'set', value: profile.savings.concat({ id: 'idea-isa', type: 'ssIsa', monthly: isaMonthly, grows: 'fixed' }) }] : null);
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
        (profile.partner.income.studentLoanOverpayment || 0) > 0 ? [{ path: 'partner.income.studentLoanOverpayment', op: 'set', value: 0 }] : null);
    } else if (sl && sl.tracked && sl.writtenOffRow) {
      add('studentLoan', 'tip', 'Don’t rush to overpay your student loan',
        `On these assumptions it’s written off in April ${sl.writeOffYear} before you repay it, so extra payments would mostly be lost. Your leftover money is likely to do more elsewhere.`,
        (profile.income.studentLoanOverpayment || 0) > 0 ? [{ path: 'income.studentLoanOverpayment', op: 'set', value: 0 }] : null);
    }

    return { left, essentials, emergency, suggestions: out, split, splitReason: reason, pay, today };
  }

  /*
   * An idea: { id, tone, title, text, patch, impact, howTo }. impact re-runs the
   * plan (from `from`, the plan as it was), so it's only worked out when read.
   */
  function makeIdea(from, id, tone, title, text, patch) {
    const idea = { id, tone, title, text, patch: patch || null };
    let impact;
    Object.defineProperty(idea, 'impact', {
      enumerable: true,
      get: () => {
        if (impact === undefined) impact = idea.patch ? FP.patch.impact(from, idea.patch) : null;
        return impact;
      },
    });
    idea.howTo = (HOW_TO[id] || []).slice();
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
    if (!r.split) return null;
    const left = Math.max(0, r.left || 0);
    const now = FP.projection.splitAsPct(profile.leftover, left);
    if (FP.projection.SPLIT_KEYS.every((k) => Math.abs((now[k] || 0) - r.split[k]) < 0.5)) return null;
    const next = FP.projection.setSplitFromPct({ ...profile.leftover }, r.split, left);
    const patch = FP.projection.SPLIT_KEYS.map((k) => ({ path: `leftover.${k}`, op: 'set', value: next[k] }));
    // Nothing chosen yet means nothing is saved: that's a problem to fix, not a tip.
    const tone = FP.projection.splitShares(profile.leftover, left).total === 0 ? 'warn' : 'tip';
    return makeIdea(JSON.parse(JSON.stringify(profile)), 'split', tone, 'Use the suggested split',
      `${FP.projection.SPLIT_KEYS.filter((k) => r.split[k] > 0).map((k) => `${r.split[k]}% ${SPLIT_NAMES[k]}`).join(', ')}. ${r.splitReason}`, patch);
  }
  /*
   * The model mix for your risk level as an action: applying it gives your
   * pension, ISAs and any other pots with money in them that mix, so it can be
   * tried as a scenario first. An illustration for people with that risk
   * level, not a recommendation. Null without a risk level, or when every pot
   * has the mix already. Also carries tradeOff (one line) and notice.
   */
  function mixAction(profile) {
    const level = profile.about.riskAppetite;
    const m = FP.mix.model(level);
    const patch = m ? FP.mix.useAllPatch(profile, level) : null;
    if (!patch) return null;
    const names = FP.mix.shownPots(profile).filter((x) => patch.some((c) => c.path === x.path)).map((x) => x.short);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const idea = makeIdea(JSON.parse(JSON.stringify(profile)), 'mix', 'tip', `Use a typical ${level} mix`,
      `${FP.profile.capital(FP.mix.describe(m))} for your ${list}. A typical mix for people with a ${level} risk level.`, patch);
    idea.tradeOff = FP.mix.tradeOffText(m, profile.assumptions);
    idea.notice = FP.mix.NOTICE;
    return idea;
  }

  const SPLIT_NAMES = { emergency: 'emergency fund', debts: 'paying off debts', cash: 'cash savings', invest: 'investments', mortgage: 'mortgage', pension: 'pension' };

  /*
   * Actions in order: ones that fix a problem (tone 'warn') first, then the
   * biggest gain in what you could spend in retirement. Ideas with no change to
   * make go last. Reads each impact, so it re-runs the plan for each.
   */
  function rankActions(list) {
    const gain = (x) => {
      const c = x.impact && x.impact.change.retirementSpend;
      return Number.isFinite(c) ? c : -Infinity;
    };
    return list.map((x, i) => ({ x, i, g: gain(x) })).sort((p, q) => (p.x.tone === 'warn' ? 0 : 1) - (q.x.tone === 'warn' ? 0 : 1)
      || (q.x.patch ? 1 : 0) - (p.x.patch ? 1 : 0) || q.g - p.g || p.i - q.i).map((e) => e.x);
  }

  /*
   * Up to two figures that say what an action does: its main gain, then what it
   * costs: less left over each month now, or else whatever gets worse (less to
   * spend in retirement, more interest, debt-free later), or else its next gain.
   * The main gain is the interest saved for a change to the mortgage or debts,
   * else more to spend in retirement, then debt-free sooner, money lasting
   * longer or more in savings and pensions when you retire.
   * Returns [{ key, value }]: value is the size of the change (always positive).
   */
  function highlights(idea) {
    const impact = idea && idea.impact;
    if (!impact) return [];
    const c = impact.change;
    const onDebt = idea.patch.some((x) => /^(mortgage|debts)\./.test(x.path));
    const spend = c.retirementSpend >= 1 ? { key: 'retirementSpend', value: c.retirementSpend } : null;
    const saved = c.interest <= -1 ? { key: 'interestSaved', value: -c.interest } : null;
    const gains = (onDebt ? [saved, spend] : [spend, saved]).concat([
      c.debtFreeAge < 0 ? { key: 'debtFreeSooner', value: -c.debtFreeAge } : null,
      c.lastsTo > 0 ? { key: 'lastsLonger', value: c.lastsTo } : null,
      c.atRetirement >= 1 ? { key: 'atRetirement', value: c.atRetirement } : null,
    ]).filter(Boolean);
    const costs = [
      c.leftover <= -1 ? { key: 'leftoverCost', value: -c.leftover } : null,
      c.retirementSpend <= -1 ? { key: 'retirementSpendCost', value: -c.retirementSpend } : null,
      c.interest >= 1 ? { key: 'interestCost', value: c.interest } : null,
      c.debtFreeAge > 0 ? { key: 'debtFreeLater', value: c.debtFreeAge } : null,
    ].filter(Boolean);
    return [gains[0], costs[0] || gains[1]].filter(Boolean);
  }

  // Pay `pct` more of your salary into your pension (up to 100%), or null.
  // More into person `i`'s workplace pension (you, or 1 for your partner), or null.
  function pensionPatch(profile, pct, i) {
    const own = FP.profile.asPerson(profile, i || 0);
    const room = 100 - (own.assumptions.employeePensionPct || 0);
    const value = Math.min(pct, room);
    return value > 0 && (own.income.grossSalary || 0) > 0 ? [{ path: FP.profile.personPath(i || 0, 'assumptions.employeePensionPct'), op: 'add', value }] : null;
  }

  // The smallest whole % more into your pension that brings your income down
  // to where the allowance starts to go (or as close as 100% gets), or null.
  function taperPatch(profile, threshold, i) {
    const own = FP.profile.asPerson(profile, i || 0);
    const room = 100 - (own.assumptions.employeePensionPct || 0);
    if (!((own.income.grossSalary || 0) > 0) || room <= 0) return null;
    let n = 1;
    while (n < room && FP.tax.forProfile(FP.profile.asPerson(FP.patch.applyPatch(profile, pensionPatch(profile, n, i)), i || 0)).adjustedNetIncome > threshold) n += 1;
    return pensionPatch(profile, n, i);
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

  FP.suggest = { analyse, suggestSplit, splitAction, mixAction, rankActions, highlights, duration, HOW_TO, EMERGENCY_MIN_MONTHS, EMERGENCY_MAX_MONTHS };
})(globalThis.FP = globalThis.FP || {});
