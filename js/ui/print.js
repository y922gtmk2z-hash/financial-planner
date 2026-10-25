/*
 * A one- or two-page printed summary of Your plan: the verdicts, the monthly
 * picture, debt-free ages, retirement figures, the top three actions, key
 * assumptions with their dates, and the not-advice notice. It's built when you
 * print (Print or save as PDF, or the browser's own Print), and only shows on
 * paper; the print stylesheet hides everything else.
 */
(function (FP) {
  'use strict';

  const { h, money, pct, measure, lastsTo } = FP.dom;

  const ahead = (p) => FP.dom.far(p.assumptions.retirementAge - p.about.age);

  function table(caption, rows) {
    return h('table', { class: 'print-table' },
      h('caption', null, caption),
      h('tbody', null, rows.filter(Boolean).map(([k, v, sub]) => h('tr', null,
        h('th', { scope: 'row' }, k, sub ? h('small', null, sub) : null),
        h('td', null, v)))));
  }

  // Key assumptions: your value and, for a default, the date it was set.
  function assumptionRows(p) {
    const a = p.assumptions;
    const row = (key, text) => {
      const d = FP.assumptions.def(key);
      const yours = a[key] !== d.default;
      return [d.label, text, yours ? 'your figure' : `default, set ${FP.dom.date(d.setOn)}`];
    };
    const cfg = FP.taxConfig;
    return [
      row('inflation', pct(a.inflation)),
      row('salaryGrowth', pct(a.salaryGrowth)),
      row('spendingGrowth', pct(a.spendingGrowth)),
      row('housePriceGrowth', pct(a.housePriceGrowth)),
      row('savingsRate', pct(a.savingsRate)),
      row('investmentReturn', `${pct(a.investmentReturn)} (${pct(FP.growth.netRate(a.investmentReturn, a.investmentFees))} after fees)`),
      row('pensionGrowth', `${pct(a.pensionGrowth)} (${pct(FP.growth.netRate(a.pensionGrowth, a.pensionFees))} after fees)`),
      row('retirementAge', String(a.retirementAge)),
      row('statePension', `${money(a.statePension)} a year from ${a.statePensionAge}`),
      row('taxThresholds', (FP.assumptions.def('taxThresholds').options.find((o) => o.value === a.taxThresholds) || {}).label || a.taxThresholds),
      ['Tax rules', `${cfg.taxYear} (UK and Scotland)`, `checked ${FP.dom.date(cfg.checkedOn)}`],
    ];
  }

  function build(ctx, root) {
    const p = ctx.profile();
    const a = p.assumptions;
    const ws = ctx.workspace();
    const sc = FP.scenarios.active(ws);
    const pay = FP.tax.household(p);
    const cf = FP.summary.compute(p, pay.takeHomeMonthly).cashFlow;
    const proj = FP.projection.project(p, { maxYears: a.endAge - p.about.age });
    const need = FP.projection.retirementNeed(p);
    const rs = FP.projection.retirementSpend(p);
    const far = { approx: ahead(p) };
    // The verdicts, word for word as on screen.
    const verdicts = [...root.querySelectorAll('.outcome')].map((c) => [c.querySelector('h2').textContent, c.querySelector('.verdict').textContent.replace(/^[✓!•]\s*/, '').replace(/^Rough\s*/i, '')]);
    const ev = proj.ok ? proj.events : null;
    const debts0 = (p.debts || []).reduce((t, d) => t + (d.balance || 0), 0);
    const debtsFree = proj.ok && debts0 > 0 ? proj.rows.find((r, i) => i > 0 && r.debts <= 0) : null;
    const sl = ev && ev.studentLoan;
    const actions = FP.suggest.rankActions(FP.screens.actions.openActions(p)).slice(0, 3);
    const notice = document.querySelector('#disclaimer p').textContent;
    return h('div', { class: 'print-body' },
      h('h1', null, 'Your plan: summary'),
      h('p', { class: 'print-meta' }, `Printed ${FP.dom.date(new Date().toISOString().slice(0, 10))} · ${sc.name}${p.isSample ? ' · a fictional example household' : ''}`),
      h('section', null, h('h2', null, 'In short'),
        h('ul', { class: 'print-verdicts' }, verdicts.map(([t, v]) => h('li', null, h('strong', null, `${t}: `), v)))),
      h('div', { class: 'print-cols' },
        table('Each month', [
          ['Take-home pay', money(pay.takeHomeMonthly)],
          ['Spending', `−${money(cf.spendingMonthly)}`],
          ['Mortgage and debts', `−${money(cf.mortgageMonthly + cf.debtMonthly)}`],
          cf.savingsMonthly > 0 ? ['Regular savings', `−${money(cf.savingsMonthly)}`] : null,
          [cf.surplus < 0 ? 'Short each month' : 'Left over', money(Math.abs(cf.surplus))],
        ]),
        table('Debt-free', [
          ev && ev.hasMortgage ? ['Mortgage-free', ev.mortgageFree ? `Age ${ev.mortgageFree.age} (${ev.mortgageFree.year})` : 'Not within the plan'] : null,
          sl && sl.tracked ? ['Student loan', sl.clearedRow ? `Repaid at ${sl.clearedRow.age}` : sl.writtenOffRow ? `Written off at ${sl.writtenOffAge}` : 'Still owing'] : null,
          debts0 > 0 ? ['Other debts cleared', debtsFree ? `Age ${debtsFree.age} (${debtsFree.year})` : 'Not within the plan'] : null,
          !(ev && ev.hasMortgage) && !(sl && sl.tracked) && !(debts0 > 0) ? ['Debts', 'None entered'] : null,
        ])),
      need ? table(`Retirement at ${a.retirementAge}, in today’s money`, [
        [measure('moneyLastsTo'), lastsTo(need), `at ${money(need.goal)} a month`],
        rs ? [measure('couldSpend'), `${money(rs.monthly, far)} a month`, `to ${rs.endAge}`] : null,
        [measure('savingsPensions', a.retirementAge), money(need.have, far), 'on course to have'],
        [`Needed by ${a.retirementAge}`, money(need.needed, far), `to last to ${need.endAge}`],
      ]) : null,
      actions.length ? h('section', null, h('h2', null, 'Top actions'),
        h('ol', { class: 'print-actions' }, actions.map((x) => h('li', null, h('strong', null, x.title),
          ' — ', x.patch ? FP.suggest.highlights(x).map((f) => FP.screens.actions.figureText(f, p)).join('; ') || x.text.match(/^.*?[.!?](?=\s|$)/)[0] : x.text.match(/^.*?[.!?](?=\s|$)/)[0])))) : null,
      table('Key assumptions', assumptionRows(p)),
      h('p', { class: 'print-note' }, h('strong', null, 'Planning illustration only — not financial advice. '), notice),
      h('p', { class: 'print-note' }, 'Figures five or more years ahead are rounded. Made with the UK finance planner; your figures stay in your browser.'));
  }

  // Fills the summary on the page (built fresh each time you print).
  function fill(ctx, root) {
    const el = root.querySelector('.print-summary');
    if (el) FP.dom.fill(el, build(ctx, root));
  }

  // The summary's placeholder on Your plan, the button, and the browser's own Print.
  function attach(ctx, root) {
    window.onbeforeprint = () => { if (root.isConnected) fill(ctx, root); };
    return h('section', { class: 'print-summary', 'aria-hidden': 'true' });
  }

  function button(ctx, root) {
    return h('button', { type: 'button', class: 'secondary print-btn', onclick: () => { fill(ctx, root); window.print(); } }, 'Print or save as PDF');
  }

  FP.print = { attach, button, fill, build };
})(globalThis.FP = globalThis.FP || {});
