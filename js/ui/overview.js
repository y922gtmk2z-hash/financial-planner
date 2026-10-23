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
    const ready = FP.summary.checklist(p).ready;
    const proj = ready ? FP.projection.project(p) : { ok: false };
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
      tile('#setup/leftover', cf.surplus < 0 ? 'Monthly shortfall' : 'Left over each month', money(Math.abs(cf.surplus)),
        cf.savingsMonthly > 0 ? 'after spending, debts and saving' : 'after spending and debts', cf.surplus < 0),
    ].filter(Boolean);
    if (proj.ok) {
      const retire = ev.retirement ? rows[ev.retirement.y] : null;
      const end = rows[ev.end.y];
      const rs = FP.projection.retirementSpend(p);
      if (rs) {
        const short = rs.factor < 1;
        tiles.push(tile('#future', short ? 'Retirement spending' : 'You could spend in retirement',
          `${money(rs.monthly)} a month`,
          short
            ? `lasts to ${rs.endAge}: less than the ${money(rs.now)} you spend now`
            : `to age ${rs.endAge}, today\u2019s money (you spend ${money(rs.now)} now)`, short));
      }
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
        : tile('#future', `Net worth at ${end.age}`, money(end.netWorth), end.age < a.endAge ? `end of the 40-year projection, ${moneyNote}` : moneyNote));
    }

    FP.dom.add(root,
      h('h1', null, 'Overview'),
      h('p', { class: 'lead' }, 'Your plan at a glance. Tap any figure for the detail, or use the tabs below.'),
      noticeList(notices),
      FP.backup.nudge(ctx),
      h('a', { class: 'card hero hero-link', href: '#today' },
        h('span', { class: 'eyebrow' }, 'Net worth today'),
        h('span', { class: `hero-number${today.netWorth < 0 ? ' negative' : ''}` }, money(today.netWorth)),
        h('span', { class: 'muted' }, `${money(today.assets.total)} owned − ${money(today.liabilities.total)} owed`),
        h('span', { class: 'go', 'aria-hidden': 'true' }, '›')),
      FP.checklist.card(p),
      h('div', { class: 'tile-grid' }, tiles),
      ready ? FP.checklist.note(p) : null,
      proj.ok ? chartCard(rows, ev, a, moneyNote) : ready ? h('section', { class: 'card' },
        h('p', null, proj.message), h('a', { href: '#setup' }, 'Go to Setup')) : null,
      ready ? ideasCard(p) : null,
      h('section', { class: 'card next-steps', 'aria-labelledby': 'next-h' },
        h('h2', { id: 'next-h' }, 'Explore'),
        h('ul', null,
          link('#setup', 'Edit your details', 'Change any figure, then calculate again'),
          link('#scenarios', 'Compare scenarios', 'What if you retired earlier, or overpaid the mortgage?'),
          link('#assumptions', 'Check the assumptions', `Inflation ${pct(a.inflation)}, investments ${pct(FP.growth.netRate(a.investmentReturn, a.investmentFees))} after fees, retire at ${a.retirementAge}`))));
  }

  // The first notice in full; any others behind "N more".
  function noticeList(notices) {
    if (!notices.length) return null;
    const item = (w) => h('li', { class: `notice ${w.level}` }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, w.level === 'warn' ? '!' : 'i'), w.text);
    const sorted = notices.slice().sort((x, y) => (x.level === 'warn' ? 0 : 1) - (y.level === 'warn' ? 0 : 1));
    return [
      h('ul', { class: 'notices' }, item(sorted[0])),
      sorted.length > 1 ? h('details', { class: 'more-notices' },
        h('summary', null, `${sorted.length - 1} more ${sorted.length === 2 ? 'note' : 'notes'}`),
        h('ul', { class: 'notices' }, sorted.slice(1).map(item))) : null,
    ];
  }

  function firstSentence(text) {
    const m = text.match(/^.*?[.!?](?=\s|$)/);
    return m ? m[0] : text;
  }

  // The ideas you haven't ticked off or hidden yet, most pressing first.
  function ideasCard(p) {
    const r = FP.suggest.analyse(p);
    const marks = p.ideas || {};
    const open = r.suggestions.filter((x) => x.tone !== 'good' && !marks[x.id])
      .sort((x, y) => (x.tone === 'warn' ? 0 : 1) - (y.tone === 'warn' ? 0 : 1));
    if (!open.length) return null;
    return h('section', { class: 'card next-steps', 'aria-labelledby': 'ideas-h' },
      h('h2', { id: 'ideas-h' }, `${open.length} ${open.length === 1 ? 'idea' : 'ideas'} to look at`),
      h('ul', null, open.slice(0, 3).map((x) => h('li', null, h('a', { href: '#setup/ideas' },
        h('strong', null, `${x.tone === 'warn' ? '! ' : ''}${x.title}`), h('span', null, firstSentence(x.text)), h('span', { class: 'go', 'aria-hidden': 'true' }, '›'))))),
      h('p', { class: 'muted small' }, open.length > 3 ? `And ${open.length - 3} more. ` : '', h('a', { href: '#setup/ideas' }, 'See all ideas'), ' \u2014 general rules of thumb, not advice.'));
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
