/* Future: year-by-year projection with nominal / today's-money toggle. */
(function (FP) {
  'use strict';

  const { h, money, pct, chips } = FP.dom;
  const A = FP.assumptions;

  // Viewing preference only (not part of the plan), remembered on this device.
  const VIEW_KEY = 'ukfp.futureView';
  function getView() {
    try { return globalThis.localStorage.getItem(VIEW_KEY) === 'nominal' ? 'nominal' : 'real'; } catch (e) { return 'real'; }
  }
  function setView(v) {
    try { globalThis.localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ }
  }

  const COMPONENTS = [
    { key: 'equity', label: 'Home equity', color: '--series-1' },
    { key: 'cash', label: 'Cash savings', color: '--series-2' },
    { key: 'isa', label: 'ISA investments', color: '--series-3' },
    { key: 'gia', label: 'Other investments', color: '--series-4' },
    { key: 'pension', label: 'Pensions', color: '--series-5' },
    { key: 'other', label: 'Other assets', color: '--series-6' },
    { key: 'studentLoan', label: 'Student loan', color: '--series-neutral', negative: true },
    { key: 'owed', label: 'Debts & shortfall', color: '--series-8' },
  ];

  function render(root, ctx) {
    const results = h('div');
    let view = getView();
    const draw = () => FP.dom.fill(results, resultsView(ctx.profile(), view));

    const viewField = {
      label: 'Show amounts in', type: 'toggle',
      options: [{ value: 'real', label: 'Today’s money' }, { value: 'nominal', label: 'Future money' }],
      help: 'Today’s money removes inflation so amounts are comparable with now. Future money shows the actual pounds in each year.',
    };

    FP.dom.add(root,
      h('h1', null, 'Future'),
      h('p', { class: 'lead' }, 'A year-by-year illustration of where your plan could go. It is not a forecast: real returns, prices and pay will differ.'),
      h('div', { class: 'view-toggle' }, FP.field.render(viewField, {
        value: view,
        onChange: (v) => { view = v; setView(v); draw(); },
      })),
      leftoverFold(ctx, draw),
      results);
    draw();
  }

  // The leftover money card, folded away above the results: open it to change
  // what you do with the money and watch the projection update.
  function leftoverFold(ctx, draw) {
    const p = ctx.profile();
    if (!FP.summary.checklist(p).ready) return null;
    const left = FP.summary.compute(p, FP.tax.forProfile(p).takeHomeMonthly).cashFlow.surplus;
    if (!(left > 0)) return null;
    return h('details', { class: 'leftover-fold' },
      h('summary', null, h('span', null, 'Your leftover money: ', h('strong', null, `${FP.dom.money(left)} a month`)), h('span', { class: 'muted small' }, 'Change what you do with it')),
      FP.leftoverCard.render(ctx, { onChange: draw }));
  }

  function resultsView(p, view) {
    const missing = FP.checklist.card(p);
    if (missing) return missing;
    const r = FP.projection.project(p);
    if (!r.ok) {
      return h('section', { class: 'card' }, h('p', null, r.message), h('a', { href: '#setup' }, 'Go to Setup'));
    }
    const a = p.assumptions;
    const real = view === 'real';
    const rows = real ? r.rows.map(FP.projection.toReal) : r.rows;
    const at = (row) => (row ? rows[row.y] : null);
    const ev = r.events;
    const sl = ev.studentLoan;
    const idx = (row) => (row ? row.y : null);
    const xTitle = (i) => `Age ${rows[i].age} · ${rows[i].year}${i === 0 ? ' (today)' : ''}`;
    const moneyNote = real ? 'in today’s money' : 'in future pounds';

    const markers = [
      ev.retirement ? { index: ev.retirement.y, label: `Retire ${a.retirementAge}` } : null,
      ev.mortgageFree ? { index: ev.mortgageFree.y, label: 'Mortgage-free' } : null,
      sl.clearedRow ? { index: sl.clearedRow.y, label: 'Loan repaid' } : null,
      sl.writtenOffRow ? { index: sl.writtenOffRow.y - 1, label: 'Loan written off' } : null,
    ].filter(Boolean);

    const keyAssumptions = chips([
      real ? `Inflation ${pct(a.inflation)} removed` : `Inflation ${pct(a.inflation)}`,
      `Salary +${pct(a.salaryGrowth)}`,
      `Spending +${pct(a.spendingGrowth)}`,
      `House prices +${pct(a.housePriceGrowth)}`,
      `Savings ${pct(a.savingsRate)}`,
      `Investments ${pct(FP.growth.netRate(a.investmentReturn, a.investmentFees))} after fees`,
      `Pension ${pct(FP.growth.netRate(a.pensionGrowth, a.pensionFees))} after fees`,
      `Retire at ${a.retirementAge}`,
      `State Pension ${money(a.statePension)} from ${a.statePensionAge}`,
      a.taxThresholds === 'inflation' ? 'Tax thresholds rise with inflation' : 'Tax thresholds frozen',
    ]);

    const end = at(ev.end);
    const retire = at(ev.retirement);
    const tiles = [
      retire ? tile(`Net worth at ${retire.age}`, money(retire.netWorth), 'at retirement') : null,
      retire ? tile(`Pension pot at ${retire.age}`, money(retire.pension), 'at retirement') : null,
      ev.hasMortgage
        ? tile('Mortgage-free', ev.mortgageFree ? `Age ${ev.mortgageFree.age}` : 'Not yet', ev.mortgageFree ? String(ev.mortgageFree.year) : `still owing at ${end.age}`)
        : null,
      studentLoanTile(sl, rows, end),
      ev.runsOut
        ? tile('Money runs short', `Age ${ev.runsOut.age}`, String(ev.runsOut.year), true)
        : tile(`Net worth at ${end.age}`, money(end.netWorth), String(end.year)),
    ].filter(Boolean);

    // Net worth if investment and pension returns are 2 points a year lower or higher.
    const range = (shift) => {
      const q = JSON.parse(JSON.stringify(p));
      q.assumptions.investmentReturn += shift;
      q.assumptions.pensionGrowth += shift;
      const rr = FP.projection.project(q);
      return (real ? rr.rows.map(FP.projection.toReal) : rr.rows).map((x) => x.netWorth);
    };
    const band = { label: 'Returns \u00b12 points', color: '--series-7', low: range(-2), high: range(2) };
    const netSeries = [
      { label: 'Net worth', color: '--series-7', values: rows.map((x) => x.netWorth) },
      { label: 'Home equity', color: '--series-1', values: rows.map((x) => x.equity) },
    ];
    const compSeries = COMPONENTS.map((c) => ({
      label: c.label, color: c.color,
      values: rows.map((x) => (c.key === 'owed' ? -(x.debts + x.shortfall) : c.negative ? -x[c.key] : x[c.key])),
    })).filter((ser) => ser.values.some((v) => Math.abs(v) > 0.5));

    return [
      r.warnings.length ? h('ul', { class: 'notices' }, r.warnings.map((w) =>
        h('li', { class: `notice ${w.level}` }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, w.level === 'warn' ? '!' : 'i'), w.text))) : null,
      h('div', { class: 'stat-grid tiles' }, tiles),
      h('p', { class: 'muted small' }, `Amounts ${moneyNote}. Projection runs ${r.years} years, to age ${end.age}.`),

      h('section', { class: 'card', 'aria-labelledby': 'nw-chart-h' },
        h('h2', { id: 'nw-chart-h' }, 'Net worth and home equity'),
        FP.chart.keys(netSeries.map((x) => ({ label: x.label, color: x.color, line: true }))
          .concat({ label: 'If returns are 2 points lower or higher', color: '--series-7', band: true })),
        FP.chart.timeChart({
          type: 'line', series: netSeries, markers, band,
          xLabels: rows.map((x) => String(x.age)), xTitle,
          ariaLabel: `Line chart of net worth and home equity by age, ${moneyNote}`,
        }),
        h('p', { class: 'muted small' }, `Ages along the bottom. Home equity = home value minus mortgage. The shaded range shows net worth if investments and pensions grow 2 points a year slower or faster than your assumptions (by ${end.age}: ${money(band.low[band.low.length - 1])} to ${money(band.high[band.high.length - 1])}). Real returns vary from year to year, so the actual path could fall outside it.`),
        keyAssumptions),

      h('section', { class: 'card', 'aria-labelledby': 'comp-chart-h' },
        h('h2', { id: 'comp-chart-h' }, 'What your net worth is made of'),
        FP.chart.keys(compSeries.map((x) => ({ label: x.label, color: x.color }))),
        FP.chart.timeChart({
          type: 'area', series: compSeries, markers, totalLabel: 'Net worth',
          xLabels: rows.map((x) => String(x.age)), xTitle,
          ariaLabel: `Stacked area chart of net worth by component, ${moneyNote}`,
        }),
        h('p', { class: 'muted small' }, 'Debts, your student loan and any unfunded shortfall are shown below zero.')),

      tableCard(rows, a, moneyNote),
      notesCard(a, p.leftover)];
  }

  // When the student loan ends, if a balance was entered.
  function studentLoanTile(sl, rows, end) {
    if (!sl.tracked) return null;
    if (sl.clearedRow) return tile('Student loan repaid', `Age ${sl.clearedRow.age}`, String(sl.clearedRow.year));
    if (sl.writtenOffRow) {
      const left = rows[sl.writtenOffRow.y].studentLoanWrittenOff;
      return tile('Student loan written off', `Age ${sl.writtenOffAge}`, `${money(left)} left, April ${sl.writeOffYear}`);
    }
    return tile('Student loan', 'Still owing', `${money(rows[end.y].studentLoan)} at ${end.age}`);
  }

  function tile(label, value, sub, warn) {
    return h('div', { class: warn ? 'tile-warn' : null },
      h('span', null, label), h('strong', { class: warn ? 'negative' : null }, value), sub ? h('small', null, sub) : null);
  }

  function tableCard(rows, a, moneyNote) {
    // Flows (first four) have no value for today's row.
    const cols = [
      ['Income after tax', (x) => x.netIncome, true],
      ['Spending', (x) => x.spending, true],
      ['Mortgage & debts', (x) => x.mortgagePaid + x.debtPaid, true],
      ['Regular savings', (x) => x.regularSaving, true],
      ['Surplus', (x) => x.surplus, true],
      ['Cash', (x) => x.cash],
      ['Investments', (x) => x.isa + x.gia],
      ['Pension', (x) => x.pension],
      ['Home equity', (x) => x.equity],
      ['Student loan', (x) => x.studentLoan],
      ['Other owed', (x) => x.debts + x.shortfall],
      ['Net worth', (x) => x.netWorth],
    ];
    return h('details', { class: 'card' },
      h('summary', null, h('strong', null, 'Year-by-year table')),
      h('p', { class: 'muted small' }, `Amounts ${moneyNote}. Flows (income, spending, surplus) are for the year; balances are at the end of it.`),
      h('div', { class: 'table-scroll tall', tabindex: '0', role: 'region', 'aria-label': 'Year-by-year table' }, h('table', { class: 'data-table year-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Age'), h('th', { scope: 'col' }, 'Year'),
          cols.map(([label]) => h('th', { scope: 'col', class: 'num' }, label)))),
        h('tbody', null, rows.map((x) => h('tr', { class: x.age === a.retirementAge ? 'retire' : null },
          h('th', { scope: 'row' }, String(x.age)), h('td', null, String(x.year)),
          cols.map(([, fn]) => {
            const v = fn(x);
            return h('td', { class: `num${v < 0 ? ' negative' : ''}` }, x.today && v === undefined ? '—' : Number.isFinite(v) ? money(v) : '—');
          })))))));
  }

  function notesCard(a, leftover) {
    return h('section', { class: 'card', 'aria-labelledby': 'proj-notes-h' },
      h('h2', { id: 'proj-notes-h' }, 'How this is worked out'),
      h('ul', { class: 'notes' },
        h('li', null, 'Each year: your salary and bonuses rise with salary growth and are taxed with this year’s rules; spending rises with spending growth; balances grow at their own rates; the mortgage and other debts are paid down month by month.'),
        h('li', null, `Tax ${a.taxThresholds === 'inflation' ? 'thresholds rise with inflation each year' : 'thresholds stay frozen at today’s levels'}; tax rates stay as they are today. Change this in Assumptions.`),
        h('li', null, 'Any money left over first repays an earlier shortfall, then is shared out as you choose below. Extra pension contributions get 20% basic-rate relief; higher-rate relief isn’t added.'),
        h('li', null, `Salary and workplace pension contributions stop at ${a.retirementAge}. State Pension starts at ${a.statePensionAge} and rises with inflation. Spending carries on at the same level in retirement.`),
        h('li', null, `In retirement, a shortfall is met from your pension first (from age ${a.pensionAccessAge}; 25% of each withdrawal tax-free, the rest taxed as income), then cash, then investments. Before then, from cash and investments only.`),
        h('li', null, `Student loan: with a balance entered, interest is added and repayments come from pay each month until it\u2019s repaid; anything left is written off in April of the write-off year. ${a.studentLoanInterest === 'inflation' ? 'Interest uses the current published rates until August 2027, then your inflation assumption as RPI plus the plan\u2019s margin (Plan 2: 0\u20133% depending on income; postgraduate: 3%).' : 'Interest stays at the current published rates (Plan 2 depends on income); you can make it follow inflation in Assumptions.'} Without a balance, repayments carry on until you retire.`),
        h('li', null, 'Regular savings are added while you work: cash and cash ISAs to cash savings, stocks & shares ISAs to your ISA (anything over the ISA allowance to a general investment account). They use the ISA allowance before your leftover money is shared out, and from April 2027 under-65s\u2019 cash ISA payments are limited (see Assumptions).'),
        h('li', null, `Your emergency fund share goes to cash until your cash savings cover ${leftover.emergencyMonths} months of that year\u2019s spending, mortgage and debt payments. Extra debt payments clear the most expensive debt first. ${a.capOverpayments === 'none' ? 'Mortgage overpayments from leftover money have no limit.' : `Mortgage overpayments from leftover money stay within ${a.overpaymentLimitPct}% of the balance a year.`} When a choice can\u2019t take its share (the fund is full, a debt is paid off, or you\u2019ve retired), the share goes to your other choices in proportion, or to cash if there are none.`),
        h('li', null, `\u201cYou could spend in retirement\u201d on Your plan is the most you could spend each month from retirement, in today\u2019s money, so that your money lasts to age ${a.endAge} (this runs past the 40-year limit of the charts). It doesn\u2019t sell your home, and your mortgage and debt payments are on top.`),
        h('li', null, 'Contributions and withdrawals happen at the end of each year, so they don’t earn growth until the next year.'),
        h('li', null, 'Not included: tax on savings and investments, inheritance, the pension lifetime lump-sum limit, student loans taken from pension income, or changes to your mortgage after the term ends.')));
  }

  // Shows whether the leftover split adds up to 100% (used by the leftover card).
  function drawSplitStatus(el, split) {
    const sh = FP.projection.splitShares(split);
    el.className = `split-status ${sh.status === 'ok' ? 'ok' : 'off'}`;
    el.textContent = sh.status === 'ok'
      ? 'Adds up to 100%.'
      : sh.status === 'under'
        ? `Adds up to ${sh.total}% \u2014 the other ${100 - sh.total}% goes to cash savings.`
        : `Adds up to ${sh.total}% \u2014 each share is scaled down to make 100%.`;
  }

  FP.screens = FP.screens || {};
  FP.screens.future = { title: 'Future', render, drawSplitStatus, getView, setView };
})(globalThis.FP = globalThis.FP || {});
