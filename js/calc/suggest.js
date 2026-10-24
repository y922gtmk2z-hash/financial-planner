/*
 * Ideas for money left over each month, based on the profile. Pure functions,
 * no DOM. These are general rules of thumb to consider - not advice.
 *
 * Returns { left, essentials, emergency, suggestions: [{ id, tone, title, text }],
 *           split: { emergency, debts, cash, invest, mortgage, pension } | null, splitReason }
 * tone: 'warn' (fix first), 'tip' (worth considering), 'good' (already fine).
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

  // "8 months", "about 3 years", "over 10 years".
  function duration(months) {
    if (months <= 24) return `${months} month${months === 1 ? '' : 's'}`;
    if (months > 120) return 'over 10 years';
    return `about ${Math.round(months / 12)} years`;
  }

  function analyse(profile) {
    const a = profile.assumptions;
    const pay = FP.tax.forProfile(profile);
    const today = FP.summary.compute(profile, pay.takeHomeMonthly);
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
    const add = (id, tone, title, text) => out.push({ id, tone, title, text });

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
      add('debt', 'warn', `Clear ${d.name} first`,
        `It costs ${d.rate}% a year, more than savings earn (${a.savingsRate}%), so paying extra off it is a guaranteed return.${expensive.length > 1 ? ` ${expensive.slice(1).map((x) => `${x.name} (${x.rate}%)`).join(' and ')} ${expensive.length > 2 ? 'are' : 'is'} next.` : ''} Put a share of your leftover money into \u201cPaying off debts faster\u201d (most expensive first), or raise the monthly payment in Your figures.`);
    }

    const topRate = Math.max(0, ...pay.taxByBand.filter((b) => b.amount > 0).map((b) => b.rate));
    // Judged on income, not the allowance: a reduced tax code also lowers the allowance.
    const cfg = FP.taxConfig;
    const taperTop = cfg.taperThreshold + cfg.personalAllowance / cfg.taperRate;
    const inTaper = pay.adjustedNetIncome > cfg.taperThreshold && pay.adjustedNetIncome < taperTop;
    const m = today.mortgage;
    const { split, reason } = suggestSplit({ emergency, inTaper, topRate, hasMortgage: !!(m && m.balance > 0), mortgageBeatsCash: !!(m && a.mortgageRate > a.savingsRate), expensive: expensive.length > 0 });

    // 2. Emergency fund
    const aim = `A common aim is ${EMERGENCY_MIN_MONTHS}–${EMERGENCY_MAX_MONTHS} months (${money(emergency.min)}–${money(emergency.max)})`;
    if (emergency.short) {
      const share = split.emergency / 100;
      add('emergency', 'warn', 'Build your emergency fund',
        `Your cash covers about ${months.toFixed(1)} months of essential outgoings; your target is ${targetMonths} (${money(emergency.target)}). ${aim}. Putting ${split.emergency}% of what’s left (${money(left * share)} a month) into your emergency fund gets you there in ${duration(emergency.monthsToFill(share))}${share < 1 ? `, or ${duration(emergency.monthsToFill(1))} with all of it` : ''}.`);
    } else if (essentials > 0) {
      add('emergencyOk', 'good', 'Emergency fund in place',
        `Your cash covers about ${months >= 24 ? 'over 24' : months.toFixed(1)} months of essential outgoings, meeting your ${targetMonths}-month target${months > EMERGENCY_MAX_MONTHS * 2 ? ' — more than you need in easy-access cash; some could work harder in investments or your pension' : ''}. Keep a small share going to it so it keeps up as your costs rise; anything beyond the target goes to your other choices.`);
    }

    // 3. Pension tax relief
    if (inTaper) {
      add('taper', 'tip', 'Use your pension to avoid the 60% band',
        `Between £100,000 and £125,140 you lose some personal allowance, so you keep only about £${Math.round(FP.tax.keepOfNext(FP.tax.inputFromProfile(profile)))} of each extra £100. Pension contributions (or salary sacrifice) bring your income down and win that back.`);
    } else if (topRate >= 40) {
      add('relief', 'tip', 'Higher-rate pension relief',
        `You pay ${topRate}% tax on your top slice of pay, so each £1 into your pension costs you only about ${Math.round(100 - topRate)}p (claim the extra relief through self assessment if your scheme doesn’t give it). Salary sacrifice also saves National Insurance.`);
    }
    if ((a.employerPensionPct || 0) > 0) {
      add('match', 'tip', 'Check for employer matching',
        `Your employer adds ${a.employerPensionPct}%. Many employers add more if you pay more — if yours does, that’s usually the best return available.`);
    }

    // 4. Mortgage vs savings
    const netInvest = FP.growth.netRate(a.investmentReturn, a.investmentFees);
    if (m && m.balance > 0) {
      if (a.mortgageRate > a.savingsRate) {
        add('mortgage', 'tip', 'Overpaying the mortgage beats cash savings',
          `Your mortgage costs ${a.mortgageRate}% and cash earns ${a.savingsRate}%, so overpaying is a guaranteed saving once your emergency fund is in place. Investments are assumed to return ${netInvest.toFixed(1)}% after fees but can fall. Most lenders allow ${a.overpaymentLimitPct}% of the balance a year without a charge.`);
      } else {
        add('mortgageLow', 'tip', 'Your mortgage is cheap',
          `At ${a.mortgageRate}% it costs less than cash earns (${a.savingsRate}%), so there’s little gain in overpaying.`);
      }
    }

    // 5. ISA allowance
    const saving = FP.savings.monthlyTotals(profile.savings);
    const isaRoom = Math.max(0, (a.isaAllowance || 0) - (saving.cashIsa + saving.ssIsa) * 12);
    if (isaRoom > 0) {
      add('isa', 'tip', 'Use your ISA allowance',
        `You have about ${money(isaRoom)} of this year’s ${money(a.isaAllowance)} ISA allowance left. Growth and interest in an ISA are tax-free. For money you won’t need for at least five years, a stocks & shares ISA has historically beaten cash, but can fall in value.`);
    }

    // 6. Student loan
    const proj = FP.projection.project(profile);
    const sl = proj.ok ? proj.events.studentLoan : null;
    if (sl && sl.tracked && sl.writtenOffRow) {
      add('studentLoan', 'tip', 'Don’t rush to overpay your student loan',
        `On these assumptions it’s written off in April ${sl.writeOffYear} before you repay it, so extra payments would mostly be lost. Your leftover money is likely to do more elsewhere.`);
    }

    return { left, essentials, emergency, suggestions: out, split, splitReason: reason, pay, today };
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

  FP.suggest = { analyse, suggestSplit, duration, EMERGENCY_MIN_MONTHS, EMERGENCY_MAX_MONTHS };
})(globalThis.FP = globalThis.FP || {});
