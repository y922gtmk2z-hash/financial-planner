/*
 * The results people come for (when the student loan is repaid, when the
 * mortgage is paid off, what you could spend in retirement...), what drives
 * each one, and the changes that move it most. Pure functions, no DOM: the
 * detail panels use these to show a result, let you change its drivers on a
 * copy of your plan, and compare before and after.
 *
 * Each outcome: {
 *   id, title,
 *   drivers(p): profile paths you can change (inputs and assumptions),
 *   ideas: suggestion ids (from FP.suggest) that belong with it,
 *   evaluate(p): { ok, headline, sub, metrics: [{ label, value, kind, better }], series },
 *   levers: [{ label, applies(p), apply(p) }],
 * }
 * metric kind: 'money' | 'age' | 'months' | 'text'; better: 'higher' | 'lower' | null.
 */
(function (FP) {
  'use strict';

  const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
  const money = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;

  function projectRows(p) {
    if (!FP.summary.checklist(p).ready) return null;
    const r = FP.projection.project(p);
    return r.ok ? r : null;
  }

  function cashFlow(p) {
    return FP.summary.compute(p, FP.tax.forProfile(p).takeHomeMonthly).cashFlow;
  }

  // Ages along the bottom, one value per year.
  function seriesOf(r, label, fn, real) {
    const rows = real ? r.rows.map(FP.projection.toReal) : r.rows;
    return { label, xLabels: rows.map((x) => String(x.age)), values: rows.map(fn), real: !!real };
  }

  const listPaths = (p, list, key) => p[list].map((_, i) => `${list}.${i}.${key}`);

  const OUTCOMES = [
    {
      id: 'retirement',
      title: 'Retirement',
      drivers: (p) => [
        'assumptions.retirementAge', 'goals.retirementIncome',
        'assumptions.employeePensionPct', 'assumptions.employerPensionPct', 'assets.pension',
        'leftover.pension', 'assumptions.pensionGrowth', 'assumptions.investmentReturn',
        'assumptions.statePension', 'assumptions.statePensionAge', 'assumptions.endAge',
      ].concat(listPaths(p, 'spending', 'monthly')),
      ideas: ['taper', 'relief', 'match', 'isa'],
      evaluate(p) {
        const r = projectRows(p);
        if (!r) return { ok: false };
        const rs = FP.projection.retirementSpend(p);
        const ret = r.events.retirement ? FP.projection.toReal(r.rows[r.events.retirement.y]) : null;
        if (!rs) {
          return { ok: true, headline: 'Retirement is beyond the projection', sub: '', metrics: [], series: seriesOf(r, 'Net worth', (x) => x.netWorth, true) };
        }
        const goal = goalMonthly(p);
        return {
          ok: true,
          headline: `You could spend ${money(rs.monthly)} a month`,
          sub: `from age ${p.assumptions.retirementAge} to ${rs.endAge}, in today’s money`,
          metrics: [
            { label: 'You could spend in retirement', value: rs.monthly, kind: 'money', per: 'a month', better: 'higher' },
            { label: 'Your goal', value: goal, kind: 'money', per: 'a month', better: null },
            ret ? { label: 'Pension pot when you retire', value: ret.pension, kind: 'money', better: 'higher' } : null,
          ].filter(Boolean),
          series: seriesOf(r, 'Net worth (today’s money)', (x) => x.netWorth, true),
        };
      },
      levers: [
        { label: 'Retire 1 year later', applies: (p) => p.assumptions.retirementAge < p.assumptions.endAge - 1, apply: (p) => { p.assumptions.retirementAge += 1; } },
        { label: 'Pay 1% more of your salary into your pension', applies: (p) => (p.income.grossSalary || 0) > 0, apply: (p) => { p.assumptions.employeePensionPct += 1; } },
        { label: 'Put 10% more of your leftover money into your pension', applies: (p) => cashFlow(p).surplus > 0 && (p.leftover.pension || 0) <= 90, apply: (p) => moveShare(p, 'pension', 10) },
      ],
    },
    {
      id: 'mortgage',
      title: 'Mortgage',
      drivers: () => [
        'mortgage.balance', 'assumptions.mortgageRate', 'mortgage.remainingTermYears', 'mortgage.monthlyOverpayment',
        'leftover.mortgage', 'assumptions.mortgageRateChangeYear', 'assumptions.mortgageRateAfterChange', 'assumptions.overpaymentLimitPct',
      ],
      ideas: ['mortgage', 'mortgageLow'],
      evaluate(p) {
        const r = projectRows(p);
        if (!r) return { ok: false };
        const m0 = p.mortgage.balance || 0;
        if (!(m0 > 0)) return { ok: true, headline: 'No mortgage', sub: '', metrics: [], series: null };
        const free = r.events.mortgageFree;
        const paid = sum(r.rows.slice(1), (x) => (x.mortgagePaid || 0) + (x.toMortgage || 0));
        const left = r.rows[r.rows.length - 1].mortgage;
        return {
          ok: true,
          headline: free ? `Mortgage-free at ${free.age}` : 'Not paid off in the projection',
          sub: free ? `in ${free.year}` : `${money(left)} still owed at ${r.rows[r.rows.length - 1].age}`,
          metrics: [
            { label: 'Mortgage-free at', value: free ? free.age : null, kind: 'age', better: 'lower' },
            { label: 'Interest you pay', value: Math.max(0, paid - (m0 - left)), kind: 'money', better: 'lower' },
          ],
          series: seriesOf(r, 'Mortgage balance', (x) => x.mortgage, false),
        };
      },
      levers: [
        { label: 'Overpay £100 a month more', applies: (p) => (p.mortgage.balance || 0) > 0, apply: (p) => { p.mortgage.monthlyOverpayment = (p.mortgage.monthlyOverpayment || 0) + 100; } },
        { label: 'Put 10% more of your leftover money into overpayments', applies: (p) => (p.mortgage.balance || 0) > 0 && cashFlow(p).surplus > 0 && (p.leftover.mortgage || 0) <= 90, apply: (p) => moveShare(p, 'mortgage', 10) },
      ],
    },
    {
      id: 'studentLoan',
      title: 'Student loan',
      drivers: () => [
        'income.studentLoanPlan', 'income.studentLoanBalance', 'income.studentLoanOverpayment', 'income.studentLoanStartYear', 'income.studentLoanRate',
        'income.grossSalary', 'assumptions.salaryGrowth', 'assumptions.studentLoanInterest', 'assumptions.inflation', 'assumptions.taxThresholds',
      ],
      ideas: ['studentLoan'],
      evaluate(p) {
        const r = projectRows(p);
        if (!r) return { ok: false };
        const sl = r.events.studentLoan;
        if (!sl || !sl.tracked) {
          return { ok: true, headline: p.income.studentLoanPlan === 'none' ? 'No student loan' : 'Add your balance to see when it ends', sub: '', metrics: [], series: null };
        }
        const repaid = sum(r.rows.slice(1), (x) => x.studentLoanRepaid || 0);
        // One label for when it ends (repaid or written off), so before and after line up.
        // Ending sooner is only better when you repay it: a write-off costs you nothing.
        const metrics = [
          { label: 'Loan ends at', value: sl.clearedRow ? sl.clearedRow.age : sl.writtenOffRow ? sl.writtenOffAge : null, kind: 'age', better: sl.clearedRow ? 'lower' : null },
          { label: 'Total you repay', value: repaid, kind: 'money', better: 'lower' },
          { label: 'Written off', value: sl.writtenOff || 0, kind: 'money', better: null },
        ];
        return {
          ok: true,
          headline: sl.clearedRow ? `Repaid at ${sl.clearedRow.age}` : sl.writtenOffRow ? `Written off at ${sl.writtenOffAge}` : 'Still owing at the end',
          sub: sl.clearedRow ? `in ${sl.clearedRow.year}` : sl.writtenOffRow ? `in April ${sl.writeOffYear}, before you repay it` : '',
          metrics,
          series: seriesOf(r, 'Student loan balance', (x) => x.studentLoan, false),
        };
      },
      levers: [
        { label: 'Pay £100 a month extra', applies: (p) => FP.studentLoan.tracked(p), apply: (p) => { p.income.studentLoanOverpayment = (p.income.studentLoanOverpayment || 0) + 100; } },
      ],
    },
    {
      id: 'takeHome',
      title: 'Take-home pay',
      drivers: () => [
        'income.grossSalary', 'income.taxCode', 'income.region', 'assumptions.employeePensionPct', 'income.pensionMethod', 'income.studentLoanPlan',
      ],
      ideas: ['taper', 'relief', 'match'],
      evaluate(p) {
        const pay = FP.tax.forProfile(p);
        return {
          ok: true,
          headline: `${money(pay.takeHomeMonthly)} a month`,
          sub: `from ${money(pay.gross)} a year before tax`,
          metrics: [
            { label: 'Take-home', value: pay.takeHomeMonthly, kind: 'money', per: 'a month', better: 'higher' },
            { label: 'Income tax and NI', value: pay.incomeTax + pay.nationalInsurance, kind: 'money', per: 'a year', better: 'lower' },
            { label: 'Into your pension', value: pay.pensionIntoPot, kind: 'money', per: 'a year', better: 'higher' },
          ],
          series: null,
        };
      },
      levers: [
        { label: 'Pay your pension by salary sacrifice', applies: (p) => p.income.pensionMethod !== 'salarySacrifice' && (p.assumptions.employeePensionPct || 0) > 0, apply: (p) => { p.income.pensionMethod = 'salarySacrifice'; } },
        { label: 'Pay 1% more of your salary into your pension', applies: (p) => (p.income.grossSalary || 0) > 0, apply: (p) => { p.assumptions.employeePensionPct += 1; } },
      ],
    },
    {
      id: 'leftover',
      title: 'Left over each month',
      drivers: (p) => listPaths(p, 'spending', 'monthly')
        .concat(listPaths(p, 'debts', 'monthlyPayment'), listPaths(p, 'savings', 'monthly'), ['mortgage.monthlyOverpayment', 'income.grossSalary']),
      ideas: ['noSurplus', 'debt', 'emergency', 'isa'],
      evaluate(p) {
        const cf = cashFlow(p);
        return {
          ok: true,
          headline: cf.surplus < 0 ? `${money(-cf.surplus)} short each month` : `${money(cf.surplus)} left over each month`,
          sub: `${money(cf.takeHomeMonthly)} take-home − ${money(cf.spendingMonthly)} spending − ${money(cf.mortgageMonthly + cf.debtMonthly)} mortgage and debts${cf.savingsMonthly > 0 ? ` − ${money(cf.savingsMonthly)} regular savings` : ''}`,
          metrics: [
            { label: 'Left over', value: cf.surplus, kind: 'money', per: 'a month', better: 'higher' },
            { label: 'Spending', value: cf.spendingMonthly, kind: 'money', per: 'a month', better: 'lower' },
          ],
          series: null,
        };
      },
      levers: [
        { label: 'Spend £100 a month less', applies: (p) => p.spending.some((x) => x.monthly >= 100), apply: (p) => { const row = p.spending.slice().sort((x, y) => y.monthly - x.monthly)[0]; row.monthly -= 100; } },
      ],
    },
    {
      id: 'emergency',
      title: 'Emergency fund',
      drivers: (p) => ['assets.cashSavings', 'leftover.emergencyMonths', 'leftover.emergency'].concat(listPaths(p, 'spending', 'monthly')),
      ideas: ['emergency', 'emergencyOk'],
      evaluate(p) {
        const r = FP.suggest.analyse(p);
        const e = r.emergency;
        if (!(r.essentials > 0)) return { ok: false };
        const shares = FP.projection.splitShares(p.leftover);
        const fill = e.monthsToFill(shares.emergency);
        return {
          ok: true,
          headline: `${e.months >= 24 ? 'Over 24' : e.months.toFixed(1)} months covered`,
          sub: `of essential outgoings; your target is ${e.targetMonths} (${money(e.target)})`,
          metrics: [
            { label: 'Months covered', value: Math.min(e.months, 99), kind: 'months', better: 'higher' },
            e.short ? { label: 'Time to reach your target', value: fill || null, kind: 'months', better: 'lower' } : null,
          ].filter(Boolean),
          series: null,
        };
      },
      levers: [
        { label: 'Put 20% more of your leftover money into it', applies: (p) => cashFlow(p).surplus > 0 && (p.leftover.emergency || 0) <= 80, apply: (p) => moveShare(p, 'emergency', 20) },
      ],
    },
  ];

  // Your retirement goal a month (today's money): what you set, or what you spend now.
  function goalMonthly(p) {
    const g = p.goals && p.goals.retirementIncome;
    return g > 0 ? g : sum(p.spending, (x) => x.monthly || 0);
  }

  // Move `points` of the leftover split into `key`: from money you haven't
  // chosen anything for first, then from your other choices in proportion.
  function moveShare(p, key, points) {
    const keys = FP.projection.SPLIT_KEYS.filter((k) => k !== key);
    const free = Math.max(0, 100 - sum(FP.projection.SPLIT_KEYS, (k) => p.leftover[k] || 0));
    const fromFree = Math.min(points, free);
    p.leftover[key] = Math.round(((p.leftover[key] || 0) + fromFree) * 10) / 10;
    points -= fromFree;
    const others = sum(keys, (k) => p.leftover[k] || 0);
    const take = Math.min(points, others);
    keys.forEach((k) => {
      if (others > 0) p.leftover[k] = Math.round(((p.leftover[k] || 0) - take * (p.leftover[k] || 0) / others) * 10) / 10;
    });
    p.leftover[key] = Math.round(((p.leftover[key] || 0) + take) * 10) / 10;
  }

  const byId = (id) => OUTCOMES.find((o) => o.id === id);
  const copy = (p) => JSON.parse(JSON.stringify(p));

  // The change in each metric between two evaluations: [{ label, before, after, kind, better, change }]
  // change: 'better' | 'worse' | 'same' | 'changed'.
  function compare(before, after) {
    if (!before.ok || !after.ok) return [];
    return after.metrics.map((m) => {
      const b = before.metrics.find((x) => x.label === m.label);
      const bv = b ? b.value : null;
      const same = bv === m.value || (bv != null && m.value != null && Math.abs(bv - m.value) < (m.kind === 'money' ? 0.5 : 0.05));
      let change = same ? 'same' : 'changed';
      if (!same && m.better && bv != null && m.value != null) {
        change = (m.value > bv) === (m.better === 'higher') ? 'better' : 'worse';
      }
      return { label: m.label, before: bv, after: m.value, kind: m.kind, per: m.per, better: m.better, change };
    });
  }

  // The levers that would improve the headline metric, and by how much, biggest first.
  function leverEffects(id, p) {
    const o = byId(id);
    const base = o.evaluate(p);
    if (!base.ok || !base.metrics.length) return [];
    return o.levers.filter((l) => l.applies(p)).map((l) => {
      const q = copy(p);
      l.apply(q);
      const diff = compare(base, o.evaluate(q))[0];
      return { lever: l, diff };
    }).filter((x) => x.diff && x.diff.change === 'better')
      .sort((x, y) => Math.abs(y.diff.after - y.diff.before) - Math.abs(x.diff.after - x.diff.before));
  }

  // The suggestions that belong with an outcome.
  function ideasFor(id, p) {
    const o = byId(id);
    return FP.suggest.analyse(p).suggestions.filter((s) => o.ideas.includes(s.id));
  }

  FP.outcomes = { OUTCOMES, byId, compare, leverEffects, ideasFor, goalMonthly, moveShare, copy };
})(globalThis.FP = globalThis.FP || {});
