/*
 * Patches: exactly what an idea or a what-if changes in the plan, so its
 * effect can be measured and applied. Pure functions, no DOM.
 *
 * patch = [{ path, op: 'set' | 'add', value }], paths as in FP.profile.get/set
 * (e.g. { path: 'assumptions.employeePensionPct', op: 'add', value: 3 }).
 * 'set' replaces the value; 'add' adds a number to it (a blank counts as 0).
 */
(function (FP) {
  'use strict';

  const copy = (x) => JSON.parse(JSON.stringify(x));
  const OPS = ['set', 'add'];

  // A changed deep copy of the profile. The profile passed in is never changed.
  function applyPatch(profile, patch) {
    const out = copy(profile);
    (patch || []).forEach((c) => {
      if (!c || typeof c.path !== 'string' || !c.path || !OPS.includes(c.op)) {
        throw new Error(`Not a valid patch change: ${JSON.stringify(c)}`);
      }
      if (c.op === 'set') {
        FP.profile.set(out, c.path, c.value === undefined ? c.value : copy(c.value));
      } else {
        const now = FP.profile.get(out, c.path);
        FP.profile.set(out, c.path, (typeof now === 'number' ? now : 0) + c.value);
      }
    });
    return out;
  }

  const sum = (rows, f) => rows.reduce((t, r) => t + (f(r) || 0), 0);

  /*
   * Interest paid over the projection on the mortgage, other debts and the
   * student loan (future money). Each balance only changes by interest and
   * payments, so interest = payments − (opening balance − closing balance).
   */
  function interestPaid(proj) {
    const rows = proj.rows;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const flows = rows.slice(1);
    const mortgage = sum(flows, (r) => r.mortgagePaid + r.toMortgage) - (first.mortgage - last.mortgage);
    const debts = sum(flows, (r) => r.debtPaid + r.toDebts) - (first.debts - last.debts);
    const studentLoan = sum(flows, (r) => r.studentLoanInterest);
    return Math.max(0, mortgage) + Math.max(0, debts) + studentLoan;
  }

  // Interest paid in each year of the projection (as interestPaid, year by year).
  function interestByYear(proj) {
    return proj.rows.slice(1).map((r, i) => {
      const prev = proj.rows[i];
      return Math.max(0, r.mortgagePaid + r.toMortgage - (prev.mortgage - r.mortgage))
        + Math.max(0, r.debtPaid + r.toDebts - (prev.debts - r.debts)) + r.studentLoanInterest;
    });
  }

  /*
   * Interest saved a year by a change: the total saved, spread over the years
   * it makes a difference in (where a year's interest changes by £1 or more).
   * 0 if it saves none.
   */
  function interestSavedPerYear(before, after) {
    if (!before.ok || !after.ok) return null;
    const a = interestByYear(before);
    const b = interestByYear(after);
    const diffs = a.map((x, i) => x - (b[i] || 0));
    const saved = diffs.reduce((t, x) => t + x, 0);
    const years = diffs.filter((x) => Math.abs(x) >= 1).length;
    return saved > 0 && years ? saved / years : 0;
  }

  /*
   * The figures an idea or what-if is judged on, for one profile:
   * leftover (a month), retirementSpend (could spend a month from retirement,
   * today's money), atRetirement (savings, investments and pensions when you
   * retire, today's money), lastsTo (age your money lasts to at your
   * retirement goal; your end age if it lasts), debtFreeAge (age the mortgage,
   * other debts and student loan are all gone, or null if not within the
   * projection) and interest (total interest paid over the projection).
   * Any figure that can't be worked out yet is null.
   */
  function measure(profile) {
    return measured(profile).figures;
  }
  // The figures, and the projection they came from.
  function measured(profile) {
    const leftover = FP.summary.compute(profile, FP.tax.household(profile).takeHomeMonthly).cashFlow.surplus;
    const proj = FP.projection.project(profile);
    const spend = FP.projection.retirementSpend(profile);
    const need = FP.projection.retirementNeed(profile);
    let atRetirement = null;
    let debtFreeAge = null;
    let interest = null;
    if (proj.ok) {
      const ret = proj.events.retirement;
      if (ret) {
        const r = FP.projection.toReal(proj.rows[ret.y]);
        atRetirement = r.cash + r.isa + r.gia + r.pension;
      }
      const free = proj.rows.find((r) => r.mortgage + r.debts + r.studentLoan <= 0.5);
      debtFreeAge = free ? free.age : null;
      interest = interestPaid(proj);
    }
    const figures = {
      leftover: leftover == null ? null : leftover,
      retirementSpend: spend ? spend.monthly : null,
      atRetirement,
      lastsTo: need ? (need.lastsUntil == null ? need.endAge : need.lastsUntil) : null,
      debtFreeAge,
      interest,
    };
    return { figures, proj };
  }

  /*
   * What a patch would change: { before, after, change }, each with the
   * figures from measure(). change is after − before, or null where either
   * is missing, plus interestSavedPerYear (see above).
   */
  function impact(profile, patch) {
    const was = measured(profile);
    const now = measured(applyPatch(profile, patch));
    const before = was.figures;
    const after = now.figures;
    const change = {};
    Object.keys(before).forEach((k) => {
      change[k] = typeof before[k] === 'number' && typeof after[k] === 'number' ? after[k] - before[k] : null;
    });
    change.interestSavedPerYear = interestSavedPerYear(was.proj, now.proj);
    return { before, after, change };
  }

  FP.patch = { applyPatch, impact, measure, interestPaid, interestByYear, interestSavedPerYear };
})(globalThis.FP = globalThis.FP || {});
