/*
 * Side-by-side scenario comparison. Pure functions, no DOM.
 * Reuses the take-home, dashboard and projection engines for each scenario.
 */
(function (FP) {
  'use strict';

  /*
   * Key results for one scenario's profile.
   * real: true to express projected amounts in today's money.
   */
  function summarise(profile, real) {
    const pay = FP.tax.forProfile(profile);
    const today = FP.summary.compute(profile, pay.takeHomeMonthly);
    const proj = FP.projection.project(profile);
    const out = {
      takeHomeMonthly: pay.takeHomeMonthly,
      surplusMonthly: today.cashFlow.surplus,
      netWorthToday: today.netWorth,
      projection: proj,
      ok: proj.ok && FP.summary.checklist(profile).ready,
    };
    if (!out.ok) return out;
    const rows = real ? proj.rows.map(FP.projection.toReal) : proj.rows;
    const at = (row) => (row ? rows[row.y] : null);
    const ev = proj.events;
    return {
      ...out,
      rows,
      retirementAge: profile.assumptions.retirementAge,
      atRetirement: at(ev.retirement),
      end: at(ev.end),
      mortgageFreeAge: ev.hasMortgage ? (ev.mortgageFree ? ev.mortgageFree.age : null) : undefined,
      runsOutAge: ev.runsOut ? ev.runsOut.age : null,
      studentLoan: ev.studentLoan,
    };
  }

  // The latest age every scenario's projection reaches (for a like-for-like figure).
  function commonEndAge(summaries) {
    const ends = summaries.filter((s) => s.ok).map((s) => s.end.age);
    return ends.length ? Math.min(...ends) : null;
  }

  function rowAtAge(summary, age) {
    return summary.ok ? summary.rows.find((r) => r.age === age) || null : null;
  }

  FP.compare = { summarise, commonEndAge, rowAtAge };
})(globalThis.FP = globalThis.FP || {});
