/*
 * What would it take: for a goal (retire at an age, spend an amount a month
 * in retirement, be debt-free by an age), the value of one lever that reaches
 * it, found by bisection as FP.projection's retirement solver does, and
 * offered as a patch (FP.patch) to apply or try as a scenario. Pure, no DOM.
 *
 * Goals: { id: 'retireAt', value: age } | { id: 'spend', value: £ a month,
 * today's money } | { id: 'debtFree', value: age }.
 * Levers: 'pension' (your pension contribution, % of salary), 'retireAge'
 * (your retirement age), 'spending' (what you spend each month now) and, for
 * debt-free, 'overpay' (the same extra a month on each debt still owing at
 * that age: the mortgage, other debts and student loans).
 */
(function (FP) {
  'use strict';

  const GOALS = [
    { id: 'retireAt', label: 'Retire at age', unit: 'age', levers: ['pension', 'spending'] },
    { id: 'spend', label: 'Spend a month in retirement', unit: 'money', levers: ['pension', 'retireAge', 'spending'] },
    { id: 'debtFree', label: 'Be debt-free by age', unit: 'age', levers: ['overpay', 'spending'] },
  ];
  const LEVERS = {
    pension: 'Your pension contribution',
    retireAge: 'When you retire',
    spending: 'What you spend each month',
    overpay: 'Extra payments on what you owe',
  };

  const sum = (list, f) => list.reduce((t, x) => t + (f(x) || 0), 0);
  const spendingNow = (p) => sum(p.spending, (r) => r.monthly);

  // The age every debt (mortgage, other debts, student loan) is gone, to your end age, or null.
  function debtFreeAge(p) {
    const r = FP.projection.project(p, { maxYears: 100 });
    if (!r.ok) return null;
    const free = r.rows.find((x) => x.mortgage + x.debts + x.studentLoan <= 0.5);
    return free ? free.age : null;
  }

  // Whether the goal is met on plan q, or null if it can't be judged.
  function meets(q, goal) {
    if (goal.id === 'retireAt') {
      const need = FP.projection.retirementNeed(q);
      return need ? need.lastsUntil == null : null;
    }
    if (goal.id === 'spend') {
      const rs = FP.projection.retirementSpend(q);
      return rs ? rs.monthly >= goal.value : null;
    }
    const age = debtFreeAge(q);
    return age != null && age <= goal.value;
  }

  // The goal's own change (retiring at the age asked), part of every answer.
  const goalPatch = (goal) => (goal.id === 'retireAt' ? [{ path: 'assumptions.retirementAge', op: 'set', value: goal.value }] : []);

  /*
   * Where extra payments go: every debt still owing at `age` as things are,
   * [{ path (of what's paid each month), now, label }]. The same extra goes
   * on each of them.
   */
  function overpayTargets(p, age) {
    const r = FP.projection.project(p, { maxYears: 100 });
    if (!r.ok) return [];
    const row = r.rows.find((x) => x.age === age) || r.rows[r.rows.length - 1];
    const out = [];
    if (row.mortgage > 0.5) out.push({ path: 'mortgage.monthlyOverpayment', now: p.mortgage.monthlyOverpayment || 0, label: 'your mortgage' });
    if (row.debts > 0.5) {
      p.debts.forEach((d, i) => { if ((d.balance || 0) > 0) out.push({ path: `debts.${i}.monthlyPayment`, now: d.monthlyPayment || 0, label: d.name || `debt ${i + 1}` }); });
    }
    const loans = row.people ? row.people.map((x) => x.studentLoan) : [row.studentLoan];
    loans.forEach((bal, i) => {
      if (bal > 0.5) {
        const path = FP.profile.personPath(i, 'income.studentLoanOverpayment');
        out.push({ path, now: FP.profile.get(p, path) || 0, label: `${FP.profile.whose(p, i)} student loan` });
      }
    });
    return out;
  }

  // Whether money left over each month goes to debts or the mortgage at all.
  function splitPaysDebts(p) {
    const left = FP.summary.compute(p, FP.tax.household(p).takeHomeMonthly).cashFlow.surplus;
    const s = FP.projection.splitShares(p.leftover, Math.max(0, left));
    return s.debts + s.mortgage > 0;
  }

  /*
   * Each lever: whether it can be used for this plan and goal, its range,
   * the patch for a value, and which way helps. `up`: a higher value helps.
   * `step`: answers are rounded to it, the way that still meets the goal.
   */
  function lever(p, id, goal) {
    const a = p.assumptions;
    if (id === 'pension') {
      if (!((p.income.grossSalary || 0) > 0)) return { why: 'Add your salary in Your figures to use your pension contribution.' };
      const now = a.employeePensionPct || 0;
      return { now, lo: now, hi: 100, up: true, step: 0.5, patch: (v) => [{ path: 'assumptions.employeePensionPct', op: 'set', value: v }] };
    }
    if (id === 'retireAge') {
      const now = a.retirementAge;
      return { now, lo: Math.max(40, (p.about.age || 0) + 1), hi: 80, up: true, step: 1, patch: (v) => [{ path: 'assumptions.retirementAge', op: 'set', value: v }] };
    }
    if (id === 'spending') {
      const now = spendingNow(p);
      if (!(now > 0)) return { why: 'Add what you spend in Your figures first.' };
      if (goal.id === 'debtFree' && !splitPaysDebts(p)) {
        return { why: 'Spending less only clears debts sooner if some of your money left over each month goes to paying them off. Choose that under Money left over each month, or use extra payments instead.' };
      }
      // Down to a quarter of what you spend now: retirement spending is
      // measured against it, so it can't go to nothing.
      return { now, lo: Math.ceil(now / 4 / 10) * 10, hi: now, up: false, step: 10, patch: (v) => spendingPatch(p, v) };
    }
    if (id === 'overpay') {
      const targets = overpayTargets(p, goal.value);
      if (!targets.length) return { why: 'You don’t have a mortgage or other debt to pay extra on.' };
      const owed = (p.mortgage.balance || 0) + sum(p.debts, (d) => d.balance)
        + sum(FP.profile.people(p), (x) => x.income.studentLoanBalance);
      return {
        now: 0, lo: 0, hi: Math.max(100, owed), up: true, step: 10, targets: targets.map((t) => t.label),
        patch: (v) => targets.map((t) => ({ path: t.path, op: 'set', value: t.now + v })),
      };
    }
    return { why: 'Not a lever.' };
  }

  /*
   * Spending `total` a month instead of what you spend now: every spending
   * row scaled by the same factor, and your estimate of everything going out
   * moved by the same amount, so the rest of your estimate stays scaled too.
   */
  function spendingPatch(p, total) {
    const now = spendingNow(p);
    const f = now > 0 ? total / now : 1;
    const patch = p.spending.map((r, i) => ({ path: `spending.${i}.monthly`, op: 'set', value: Math.round((r.monthly || 0) * f * 100) / 100 }));
    if (p.outgoings && p.outgoings.estimate != null) {
      patch.push({ path: 'outgoings.estimate', op: 'set', value: Math.max(0, Math.round((p.outgoings.estimate - (now - total)) * 100) / 100) });
    }
    return patch;
  }

  /*
   * What it would take: { ok, goal, lever, now, value, patch, already } or
   * { ok: false, reason }. value is the lever's new setting (a %, an age or
   * £ a month); patch makes it (with retiring at the goal's age, for that
   * goal). already: the goal is met as things are (patch is then just the
   * goal's own change, if any).
   */
  function solve(profile, goal, leverId) {
    const g = GOALS.find((x) => x.id === goal.id);
    if (!g || !Number.isFinite(goal.value)) return { ok: false, reason: 'Choose a goal first.' };
    if (!g.levers.includes(leverId)) return { ok: false, reason: `${LEVERS[leverId] || 'That'} can’t be changed to reach this goal.` };
    if (profile.about.age == null) return { ok: false, reason: 'Enter your age in Your figures first.' };
    if (goal.id !== 'spend' && goal.value <= profile.about.age) return { ok: false, reason: 'Choose an age after your age now.' };
    const L = lever(profile, leverId, goal);
    if (L.why) return { ok: false, reason: L.why };
    const base = FP.patch.applyPatch(profile, goalPatch(goal));
    const at = (v) => FP.patch.applyPatch(base, L.patch(v));
    const test = (v) => meets(at(v), goal);
    const start = meets(base, goal);
    if (start === null) return { ok: false, reason: 'Your plan needs your age, what you spend and a retirement within the projection to work this out.' };
    if (start) return { ok: true, already: true, goal, lever: leverId, now: L.now, value: L.now, patch: goalPatch(goal) };

    // Bisection between a value that misses (bad: where you are now) and one
    // that meets it (good: the furthest the lever goes).
    const best = L.up ? L.hi : L.lo;
    if (!test(best)) return { ok: false, reason: unreachable(leverId, L) };
    let bad = L.now;
    let good = best;
    if (leverId === 'retireAge') {
      // Whole years: the first age that meets it.
      while (good - bad > 1) {
        const mid = Math.floor((good + bad) / 2);
        if (test(mid)) good = mid; else bad = mid;
      }
    } else {
      for (let i = 0; i < 30 && Math.abs(good - bad) > L.step / 4; i += 1) {
        const mid = (good + bad) / 2;
        if (test(mid)) good = mid; else bad = mid;
      }
      // Rounded to the lever's step, the way that still meets it.
      const r = L.up ? Math.ceil(good / L.step) * L.step : Math.floor(good / L.step) * L.step;
      good = L.up ? Math.min(L.hi, r) : Math.max(L.lo, r);
      if (!test(good)) good = L.up ? Math.min(L.hi, good + L.step) : Math.max(L.lo, good - L.step);
    }
    return {
      ok: true, already: false, goal, lever: leverId, now: L.now, value: good,
      targets: L.targets || null,
      patch: goalPatch(goal).concat(L.patch(good)),
    };
  }

  function unreachable(id, L) {
    if (id === 'pension') return 'Not even with all of your salary going into your pension, on these assumptions.';
    if (id === 'retireAge') return `Not by retiring as late as ${L.hi}, on these assumptions.`;
    if (id === 'spending') return 'Not even by spending a quarter of what you spend now, on these assumptions.';
    return 'Not even by paying off everything you owe within a year, on these assumptions.';
  }

  FP.goalSeek = { GOALS, LEVERS, solve, meets, debtFreeAge, spendingPatch, overpayTargets };
})(globalThis.FP = globalThis.FP || {});
