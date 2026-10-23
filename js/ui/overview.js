/*
 * Overview: the headline results after Setup, each linking to the tab with the
 * detail. Reuses the dashboard, take-home and projection engines.
 */
(function (FP) {
  'use strict';

  const { h, money, pct } = FP.dom;

  function render(root, ctx) {
    const p = ctx.profile();
    const real = FP.screens.future.getView() === 'real';
    const pay = FP.tax.forProfile(p);
    const today = FP.summary.compute(p, pay.takeHomeMonthly);
    const proj = FP.projection.project(p);
    const rows = proj.ok ? (real ? proj.rows.map(FP.projection.toReal) : proj.rows) : null;
    const ev = proj.ok ? proj.events : null;
    const a = p.assumptions;
    const moneyNote = real ? 'today’s money' : 'future pounds';

    const warnings = today.warnings.concat(proj.ok ? proj.warnings : []);
    const seen = new Set();
    const notices = warnings.filter((w) => !seen.has(w.text) && seen.add(w.text));

    const cf = today.cashFlow;
    const tiles = [
      tile('#income', 'Take-home pay', `${money(pay.takeHomeMonthly)}`, 'a month'),
      cf.savingsMonthly > 0 ? tile('#today', 'Regular savings', money(cf.savingsMonthly), 'a month') : null,
      tile('#today', cf.surplus < 0 ? 'Monthly shortfall' : 'Monthly surplus', money(Math.abs(cf.surplus)),
        cf.savingsMonthly > 0 ? 'after spending, debts and saving' : 'after spending and debts', cf.surplus < 0),
    ].filter(Boolean);
    if (proj.ok) {
      const retire = ev.retirement ? rows[ev.retirement.y] : null;
      const end = rows[ev.end.y];
      if (retire) {
        tiles.push(tile('#future', `Net worth at ${retire.age}`, money(retire.netWorth), `at retirement, ${moneyNote}`));
        tiles.push(tile('#future', `Pension pot at ${retire.age}`, money(retire.pension), moneyNote));
      }
      if (ev.hasMortgage) {
        tiles.push(tile('#today', 'Mortgage-free', ev.mortgageFree ? `Age ${ev.mortgageFree.age}` : 'Not yet', ev.mortgageFree ? String(ev.mortgageFree.year) : `still owing at ${end.age}`));
      }
      const sl = ev.studentLoan;
      if (sl && sl.tracked) {
        tiles.push(sl.clearedRow
          ? tile('#income', 'Student loan repaid', `Age ${sl.clearedRow.age}`, String(sl.clearedRow.year))
          : sl.writtenOffRow
            ? tile('#income', 'Student loan written off', `Age ${sl.writtenOffAge}`, `April ${sl.writeOffYear}`)
            : tile('#income', 'Student loan', 'Still owing', `at ${end.age}`));
      }
      tiles.push(ev.runsOut
        ? tile('#future', 'Money runs short', `Age ${ev.runsOut.age}`, String(ev.runsOut.year), true)
        : tile('#future', `Net worth at ${end.age}`, money(end.netWorth), moneyNote));
    }

    FP.dom.add(root,
      h('h1', null, 'Overview'),
      h('p', { class: 'lead' }, 'Your plan at a glance. Tap any figure for the detail, or use the tabs below.'),
      notices.length ? h('ul', { class: 'notices' }, notices.map((w) =>
        h('li', { class: `notice ${w.level}` }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, w.level === 'warn' ? '!' : 'i'), w.text))) : null,
      h('a', { class: 'card hero hero-link', href: '#today' },
        h('span', { class: 'eyebrow' }, 'Net worth today'),
        h('span', { class: `hero-number${today.netWorth < 0 ? ' negative' : ''}` }, money(today.netWorth)),
        h('span', { class: 'muted' }, `${money(today.assets.total)} owned − ${money(today.liabilities.total)} owed`),
        h('span', { class: 'go', 'aria-hidden': 'true' }, '›')),
      h('div', { class: 'tile-grid' }, tiles),
      proj.ok ? chartCard(rows, ev, a, moneyNote) : h('section', { class: 'card' },
        h('p', null, proj.message), h('a', { href: '#setup' }, 'Go to Setup')),
      h('section', { class: 'card next-steps', 'aria-labelledby': 'next-h' },
        h('h2', { id: 'next-h' }, 'Explore'),
        h('ul', null,
          link('#setup', 'Edit your details', 'Change any figure, then calculate again'),
          link('#scenarios', 'Compare scenarios', 'What if you retired earlier, or overpaid the mortgage?'),
          link('#assumptions', 'Check the assumptions', `Inflation ${pct(a.inflation)}, investments ${pct(FP.growth.netRate(a.investmentReturn, a.investmentFees))} after fees, retire at ${a.retirementAge}`))));
  }

  function tile(href, label, value, sub, warn) {
    return h('a', { class: `tile${warn ? ' tile-warn' : ''}`, href },
      h('span', { class: 'tile-label' }, label),
      h('strong', { class: warn ? 'negative' : null }, value),
      sub ? h('small', null, sub) : null,
      h('span', { class: 'go', 'aria-hidden': 'true' }, '›'));
  }

  function link(href, title, text) {
    return h('li', null, h('a', { href }, h('strong', null, title), h('span', null, text), h('span', { class: 'go', 'aria-hidden': 'true' }, '›')));
  }

  function chartCard(rows, ev, a, moneyNote) {
    const series = [{ label: 'Net worth', color: '--series-7', values: rows.map((x) => x.netWorth) }];
    const markers = [
      ev.retirement ? { index: ev.retirement.y, label: `Retire ${a.retirementAge}` } : null,
      ev.mortgageFree ? { index: ev.mortgageFree.y, label: 'Mortgage-free' } : null,
    ].filter(Boolean);
    return h('section', { class: 'card', 'aria-labelledby': 'ov-chart-h' },
      h('h2', { id: 'ov-chart-h' }, 'Net worth over time'),
      FP.chart.timeChart({
        type: 'line', series, markers,
        xLabels: rows.map((x) => String(x.age)),
        xTitle: (i) => `Age ${rows[i].age} · ${rows[i].year}`,
        ariaLabel: `Line chart of projected net worth by age, in ${moneyNote}`,
      }),
      h('p', { class: 'muted small' }, `Ages along the bottom, in ${moneyNote}. `, h('a', { href: '#future' }, 'See the full projection')));
  }

  FP.screens = FP.screens || {};
  FP.screens.overview = { title: 'Overview', render };
})(globalThis.FP = globalThis.FP || {});
