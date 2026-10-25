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
 *
 * Each lever stays within what you could really do: your pension
 * contribution up to what's left over each month plus what you pay in now,
 * and within the annual allowance (£60,000, with your employer's); retiring
 * no later than 75; spending no lower than your bills (your debt payments
 * aren't touched). When the goal can't be reached within those limits, the
 * answer says so and gives the closest the lever gets, to try as a scenario.
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
      const salary = p.income.grossSalary || 0;
      if (!(salary > 0)) return { why: 'Add your salary in Your figures to use your pension contribution.' };
      const now = a.employeePensionPct || 0;
      const lim = pensionLimit(p);
      return { now, lo: now, hi: lim.hi, limit: lim.why, up: true, step: 0.5, patch: (v) => [{ path: 'assumptions.employeePensionPct', op: 'set', value: v }] };
    }
    if (id === 'retireAge') {
      const now = a.retirementAge;
      return { now, lo: Math.max(40, (p.about.age || 0) + 1), hi: Math.max(now, MAX_RETIRE_AGE), limit: 'age', up: true, step: 1, patch: (v) => [{ path: 'assumptions.retirementAge', op: 'set', value: v }] };
    }
    if (id === 'spending') {
      const now = spendingNow(p);
      if (!(now > 0)) return { why: 'Add what you spend in Your figures first.' };
      if (goal.id === 'debtFree' && !splitPaysDebts(p)) {
        return { why: 'Spending less only clears debts sooner if some of your money left over each month goes to paying them off. Choose that under Money left over each month, or use extra payments instead.' };
      }
      // No lower than your bills. Without bills itemised, a quarter of what
      // you spend now stands in for them: retirement spending is measured
      // against it, so it can't go to nothing.
      const bills = billsNow(p);
      const lo = Math.min(now, bills > 0 ? Math.ceil(bills / 10) * 10 : Math.ceil(now / 4 / 10) * 10);
      return { now, lo, hi: now, limit: bills > 0 ? 'bills' : 'quarter', up: false, step: 10, patch: (v) => spendingPatch(p, v) };
    }
    if (id === 'overpay') {
      const targets = overpayTargets(p, goal.value);
      if (!targets.length) return { why: 'You don’t have a mortgage or other debt to pay extra on.' };
      const owed = (p.mortgage.balance || 0) + sum(p.debts, (d) => d.balance)
        + sum(FP.profile.people(p), (x) => x.income.studentLoanBalance);
      return {
        now: 0, lo: 0, hi: Math.max(100, owed), limit: 'owed', up: true, step: 10, targets: targets.map((t) => t.label),
        patch: (v) => targets.map((t) => ({ path: t.path, op: 'set', value: t.now + v })),
      };
    }
    return { why: 'Not a lever.' };
  }

  const MAX_RETIRE_AGE = 75;
  const billsNow = (p) => sum(p.spending.filter((r) => r.group === 'bills'), (r) => r.monthly);
  const leftOf = (p) => FP.summary.compute(p, FP.tax.household(p).takeHomeMonthly).cashFlow.surplus;

  /*
   * The most you could pay into your pension, as a % of salary (to 0.1%):
   * no more than what's left over each month plus what you pay in now (the
   * contribution's cost to your take-home, after tax relief), and within the
   * annual allowance with your employer's contribution. { hi, why: 'afford'
   * or 'allowance' }.
   */
  function pensionLimit(p) {
    const a = p.assumptions;
    const salary = p.income.grossSalary || 0;
    const now = a.employeePensionPct || 0;
    const allowance = (FP.taxConfig.pensionAnnualAllowance || Infinity) / salary * 100 - (a.employerPensionPct || 0);
    const at = (v) => FP.patch.applyPatch(p, [{ path: 'assumptions.employeePensionPct', op: 'set', value: v }]);
    let hi = now;
    if (leftOf(p) > 0) {
      // Bisection on the contribution that uses up exactly what's left.
      let ok = now;
      let bad = 100;
      if (leftOf(at(100)) >= 0) ok = 100;
      else {
        for (let i = 0; i < 30 && bad - ok > 0.01; i += 1) {
          const mid = (ok + bad) / 2;
          if (leftOf(at(mid)) >= 0) ok = mid; else bad = mid;
        }
      }
      hi = Math.max(now, Math.floor(ok * 10) / 10);
    }
    const cap = Math.max(now, Math.floor(allowance * 10) / 10);
    return cap < hi ? { hi: cap, why: 'allowance' } : { hi, why: 'afford' };
  }

  /*
   * Spending `total` a month instead of what you spend now: your bills stay
   * as they are and every other spending row is scaled by the same factor
   * (all of them, with no bills itemised), and your estimate of everything
   * going out moves by the same amount, so the rest of your estimate stays
   * scaled too.
   */
  function spendingPatch(p, total) {
    const now = spendingNow(p);
    const bills = billsNow(p);
    const keep = bills > 0 && bills < now;
    const flex = keep ? now - bills : now;
    const f = flex > 0 ? Math.max(0, total - (keep ? bills : 0)) / flex : 1;
    const patch = p.spending.map((r, i) => ({ path: `spending.${i}.monthly`, op: 'set', value: keep && r.group === 'bills' ? r.monthly || 0 : Math.round((r.monthly || 0) * f * 100) / 100 }));
    if (p.outgoings && p.outgoings.estimate != null) {
      patch.push({ path: 'outgoings.estimate', op: 'set', value: Math.max(0, Math.round((p.outgoings.estimate - (now - total)) * 100) / 100) });
    }
    return patch;
  }

  /*
   * What it would take: { ok, goal, lever, now, value, patch, already,
   * reachable } or { ok: false, reason }. value is the lever's new setting
   * (a %, an age or £ a month); patch makes it (with retiring at the goal's
   * age, for that goal). already: the goal is met as things are (patch is
   * then just the goal's own change, if any). reachable: false when the goal
   * can't be met within the lever's limits; value and patch are then the
   * closest it gets (the limit), with closest: { limit, reaches } (reaches:
   * the goal's own measure there: £ a month, an age money lasts to, or the
   * debt-free age, null if none) and canTry (whether that changes anything).
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
    if (start) return { ok: true, already: true, reachable: true, goal, lever: leverId, now: L.now, value: L.now, patch: goalPatch(goal) };

    // Bisection between a value that misses (bad: where you are now) and one
    // that meets it (good: the furthest the lever goes).
    const best = L.up ? L.hi : L.lo;
    if (best === L.now || !test(best)) {
      return {
        ok: true, already: false, reachable: false, goal, lever: leverId, now: L.now, value: best,
        targets: L.targets || null, canTry: best !== L.now,
        closest: { limit: L.limit, reaches: reaches(at(best), goal) },
        patch: goalPatch(goal).concat(best !== L.now ? L.patch(best) : []),
      };
    }
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
      // Rounded to the lever's step, the way that still meets it, within its limit.
      const r = L.up ? Math.ceil(good / L.step) * L.step : Math.floor(good / L.step) * L.step;
      good = L.up ? Math.min(L.hi, r) : Math.max(L.lo, r);
      if (!test(good)) good = best;
    }
    return {
      ok: true, already: false, reachable: true, goal, lever: leverId, now: L.now, value: good,
      targets: L.targets || null,
      patch: goalPatch(goal).concat(L.patch(good)),
    };
  }

  // The goal's own measure on plan q: £ a month you could spend, the age money lasts to, or the debt-free age.
  function reaches(q, goal) {
    if (goal.id === 'spend') {
      const rs = FP.projection.retirementSpend(q);
      return rs ? rs.monthly : null;
    }
    if (goal.id === 'retireAt') {
      const need = FP.projection.retirementNeed(q);
      return need ? (need.lastsUntil == null ? need.endAge : need.lastsUntil) : null;
    }
    return debtFreeAge(q);
  }

  FP.goalSeek = { GOALS, LEVERS, MAX_RETIRE_AGE, solve, meets, debtFreeAge, spendingPatch, overpayTargets, pensionLimit };
})(globalThis.FP = globalThis.FP || {});
