/* Future: year-by-year projection with nominal / today's-money toggle. */
(function (FP) {
  'use strict';

  const { h, money, pct, chips, measure, lastsTo } = FP.dom;
  // The charts and table run to your end age (95 unless you change it).
  const toEnd = (p) => ({ maxYears: p.assumptions.endAge - p.about.age });
  // A figure y years ahead: to the pound for the next few years, then rounded.
  const at = (n, y) => money(n, { approx: FP.dom.far(y) });
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
      FP.dom.pageHead('Future', 'Year by year'),
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
    const left = FP.summary.compute(p, FP.tax.household(p).takeHomeMonthly).cashFlow.surplus;
    if (!(left > 0)) return null;
    return h('details', { class: 'leftover-fold', id: 'future-leftover' },
      h('summary', null, h('span', null, 'Left over each month: ', h('strong', null, `${FP.dom.money(left)} a month`)), h('span', { class: 'muted small' }, 'Change what you do with it')),
      FP.leftoverCard.render(ctx, { onChange: draw }));
  }

  function resultsView(p, view) {
    if (FP.checklist.isEmpty(p)) return FP.checklist.emptyCard('your projection');
    const missing = FP.checklist.card(p);
    if (missing) return missing;
    const r = FP.projection.project(p, toEnd(p));
    if (!r.ok) {
      return h('section', { class: 'card' }, h('p', null, r.message), h('a', { href: '#setup' }, 'Go to Your figures'));
    }
    const a = p.assumptions;
    const real = view === 'real';
    const rows = real ? r.rows.map(FP.projection.toReal) : r.rows;
    const rowAt = (row) => (row ? rows[row.y] : null);
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

    const end = rowAt(ev.end);
    const retire = rowAt(ev.retirement);
    // The same measure, from the same calculation, as Your plan's retirement card.
    const need = FP.projection.retirementNeed(p);
    const M = FP.dom.MEASURES;
    const tiles = [
      need ? tile(measure('moneyLastsTo'), lastsTo(need), `at ${money(need.goal)} a month`, !!need.lastsUntil) : null,
      retire ? tile(measure('savingsPensions', retire.age), at(M.savingsPensions.of(retire), retire.y), 'when you retire') : null,
      retire ? tile(measure('pensionPots', retire.age), at(M.pensionPots.of(retire), retire.y), 'when you retire') : null,
      retire ? tile(measure('netWorth', retire.age), at(retire.netWorth, retire.y), 'when you retire') : null,
      ev.hasMortgage
        ? tile('Mortgage-free', ev.mortgageFree ? `Age ${ev.mortgageFree.age}` : 'Not yet', ev.mortgageFree ? String(ev.mortgageFree.year) : `still owing at ${end.age}`)
        : null,
      studentLoanTile(sl, rows, end),
    ].filter(Boolean);

    // Net worth if investment and pension returns are 2 points a year lower or higher.
    const range = (shift) => {
      const q = JSON.parse(JSON.stringify(p));
      q.assumptions.investmentReturn += shift;
      q.assumptions.pensionGrowth += shift;
      const rr = FP.projection.project(q, toEnd(q));
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
      h('p', { class: 'muted small' }, `Amounts ${moneyNote}; figures five or more years ahead are rounded. Projection runs ${r.years} years, to age ${end.age}. ${M.savingsPensions.label}: ${M.savingsPensions.includes}`),
      FP.dom.cardFoot('#setup/assets'),

      h('section', { class: 'card', 'aria-labelledby': 'nw-chart-h' },
        h('h2', { id: 'nw-chart-h' }, 'Net worth and home equity'),
        FP.chart.keys(netSeries.map((x) => ({ label: x.label, color: x.color, line: true }))
          .concat({ label: 'If returns are 2 points lower or higher', color: '--series-7', band: true })),
        h('p', { class: 'small chart-note' }, h('span', { class: 'swatch swatch-band', style: 'background:var(--series-7)', 'aria-hidden': 'true' }), ' Shaded area: returns 2 points lower or higher.'),
        FP.chart.timeChart({
          type: 'line', series: netSeries, markers, band, directLabels: true,
          xLabels: rows.map((x) => String(x.age)), xTitle,
          ariaLabel: `Line chart of net worth and home equity by age, ${moneyNote}`,
        }),
        FP.dom.soWhat(`${FP.screens.overview.netWorthSoWhat(rows, ev)} With returns 2 points lower it would be ${at(band.low[ev.retirement ? ev.retirement.y : rows.length - 1], ev.retirement ? ev.retirement.y : rows.length - 1)}.`),
        h('details', { class: 'advanced', id: 'nw-based-on' },
          h('summary', null, `Based on ${keyAssumptions.children.length} assumptions`),
          h('p', { class: 'muted small' }, `Ages along the bottom. Home equity = home value minus mortgage. The shaded range shows net worth if investments and pensions grow 2 points a year slower or faster than your assumptions (by ${end.age}: ${at(band.low[band.low.length - 1], end.y)} to ${at(band.high[band.high.length - 1], end.y)}). Real returns vary from year to year, so the actual path could fall outside it.`),
          keyAssumptions)),

      h('section', { class: 'card', 'aria-labelledby': 'comp-chart-h' },
        h('h2', { id: 'comp-chart-h' }, 'What your net worth is made of'),
        FP.chart.keys(compSeries.map((x) => ({ label: x.label, color: x.color }))),
        FP.chart.timeChart({
          type: 'area', series: compSeries, markers, totalLabel: 'Net worth', directLabels: true,
          xLabels: rows.map((x) => String(x.age)), xTitle,
          ariaLabel: `Stacked area chart of net worth by component, ${moneyNote}`,
        }),
        FP.dom.soWhat(mixSoWhat(compSeries, ev.retirement ? ev.retirement.y : rows.length - 1, rows)),
        h('p', { class: 'muted small' }, 'Debts, your student loan and any unfunded shortfall are shown below zero.')),

      tableCard(rows, a, moneyNote),
      notesCard(a, p.leftover)];
  }

  // Which part of your net worth matters most at retirement (or the end).
  function mixSoWhat(series, y, rows) {
    const pos = series.filter((s) => s.values[y] > 0);
    const total = pos.reduce((t, s) => t + s.values[y], 0);
    if (!pos.length || !(total > 0)) return 'nothing you own is projected to grow yet. Add your savings and pensions in Your figures.';
    const top = pos.reduce((a, b) => (b.values[y] > a.values[y] ? b : a));
    return `at ${rows[y].age}, ${top.label.toLowerCase()} makes up ${Math.round((top.values[y] / total) * 100)}% of what you own, so its growth assumption matters most.`;
  }

  // When the student loan ends, if a balance was entered.
  function studentLoanTile(sl, rows, end) {
    if (!sl.tracked) return null;
    if (sl.clearedRow) return tile('Student loan repaid', `Age ${sl.clearedRow.age}`, String(sl.clearedRow.year));
    if (sl.writtenOffRow) {
      const left = rows[sl.writtenOffRow.y].studentLoanWrittenOff;
      return tile('Student loan written off', `Age ${sl.writtenOffAge}`, `${at(left, sl.writtenOffRow.y)} left, April ${sl.writeOffYear}`);
    }
    return tile('Student loan', 'Still owing', `${at(rows[end.y].studentLoan, end.y)} at ${end.age}`);
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
      ['Mortgage & debts', (x) => x.mortgagePaid + x.debtPaid + (x.studentLoanExtra || 0), true],
      ['Regular savings', (x) => x.regularSaving, true],
      ['Left over', (x) => x.surplus, true],
      ['Cash', (x) => x.cash],
      ['Investments', (x) => x.isa + x.gia],
      ['Pension pots', (x) => x.pension],
      ['Home equity', (x) => x.equity],
      ['Student loan', (x) => x.studentLoan],
      ['Other owed', (x) => x.debts + x.shortfall],
      ['Net worth', (x) => x.netWorth],
    ];
    return FP.dom.foldCard('year-table', 'Year-by-year table', 'Income, spending and balances for every year',
      h('p', { class: 'muted small' }, `Amounts ${moneyNote}, rounded from five years ahead. Flows (income, spending, left over) are for the year; balances are at the end of it.`),
      h('div', { class: 'table-scroll tall', tabindex: '0', role: 'region', 'aria-label': 'Year-by-year table' }, h('table', { class: 'data-table year-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Age'), h('th', { scope: 'col' }, 'Year'),
          cols.map(([label]) => h('th', { scope: 'col', class: 'num' }, label)))),
        h('tbody', null, rows.map((x) => h('tr', { class: x.age === a.retirementAge ? 'retire' : null },
          h('th', { scope: 'row' }, String(x.age)), h('td', null, String(x.year)),
          cols.map(([, fn]) => {
            const v = fn(x);
            return h('td', { class: `num${v < 0 ? ' negative' : ''}` }, x.today && v === undefined ? '—' : Number.isFinite(v) ? at(v, x.y) : '—');
          })))))));
  }

  function notesCard(a, leftover) {
    return FP.dom.foldCard('proj-notes', 'How this is worked out', 'Taxes, growth, retirement and what\u2019s left out',
      h('ul', { class: 'notes' },
        h('li', null, 'Each year: your salary and bonuses rise with salary growth and are taxed with this year’s rules; spending rises with spending growth; balances grow at their own rates; the mortgage and other debts are paid down month by month.'),
        h('li', null, `Tax ${a.taxThresholds === 'inflation' ? 'thresholds rise with inflation each year' : 'thresholds stay frozen at today’s levels'}; tax rates stay as they are today. Change this in Assumptions.`),
        h('li', null, 'Any money left over first repays an earlier shortfall, then is shared out as you choose below. Extra pension contributions get 20% basic-rate relief; higher-rate relief isn’t added.'),
        h('li', null, `Salary and workplace pension contributions stop at ${a.retirementAge}. State Pension starts at ${a.statePensionAge} and rises with inflation. Spending carries on at the same level in retirement.`),
        h('li', null, `In retirement, a shortfall is met from your pension first (from age ${a.pensionAccessAge}; 25% of each withdrawal tax-free, the rest taxed as income), then cash, then investments. Before then, from cash and investments only.`),
        h('li', null, `Student loan: with a balance entered, interest is added and repayments come from pay each month until it\u2019s repaid; anything left is written off in April of the write-off year. ${a.studentLoanInterest === 'inflation' ? 'Interest uses the current published rates until August 2027, then your inflation assumption as RPI plus the plan\u2019s margin (Plan 2: 0\u20133% depending on income; postgraduate: 3%).' : 'Interest stays at the current published rates (Plan 2 depends on income); you can make it follow inflation in Assumptions.'} Without a balance, repayments carry on until you retire.`),
        h('li', null, 'Regular savings are added while you work: cash and cash ISAs to cash savings, stocks & shares ISAs to your ISA (anything over the ISA allowance to a general investment account). They use the ISA allowance before what\u2019s left over each month is shared out, and from April 2027 under-65s\u2019 cash ISA payments are limited (see Assumptions).'),
        h('li', null, `Your emergency fund share goes to cash until your cash savings cover ${leftover.emergencyMonths} months of that year\u2019s spending, mortgage and debt payments. Extra debt payments clear the most expensive debt first. ${a.capOverpayments === 'none' ? 'Mortgage overpayments from leftover money have no limit.' : `Mortgage overpayments from leftover money stay within ${a.overpaymentLimitPct}% of the balance a year.`} When a choice can\u2019t take its share (the fund is full, a debt is paid off, or you\u2019ve retired), the share goes to your other choices in proportion. Leftover money you haven\u2019t chosen anything for isn\u2019t saved: it\u2019s treated as spent.`),
        h('li', null, `\u201cCould spend in retirement\u201d on Your plan is the most you could spend each month from retirement, in today\u2019s money, so that your money lasts to age ${a.endAge} (the charts run to the same age). It doesn\u2019t sell your home, and your mortgage and debt payments are on top.`),
        h('li', null, 'Contributions and withdrawals happen at the end of each year, so they don’t earn growth until the next year.'),
        h('li', null, 'Not included: tax on savings and investments, inheritance, the pension lifetime lump-sum limit, student loans taken from pension income, or changes to your mortgage after the term ends.')));
  }

  // Shows whether the leftover split adds up to 100% (used by the leftover card).
  function drawSplitStatus(el, split, left) {
    const sh = FP.projection.splitShares(split, left);
    const money = FP.dom.money;
    const byAmount = split.unit === 'gbp';
    const chosen = FP.projection.SPLIT_KEYS.reduce((t, k) => t + (split[k] || 0), 0);
    const round = (n) => Math.round(n * 10) / 10;
    el.className = `split-status ${sh.status === 'ok' ? 'ok' : 'off'}`;
    if (sh.total === 0) {
      el.textContent = 'Nothing chosen yet, so none of it is saved \u2014 it\u2019s treated as spent. Choose below, or use the suggested split.';
    } else if (byAmount) {
      el.textContent = sh.status === 'ok'
        ? `${money(chosen)} a month: all of what\u2019s left.`
        : sh.status === 'under'
          ? `${money(chosen)} a month chosen \u2014 the other ${money(Math.max(0, left) - chosen)} isn\u2019t saved (it\u2019s treated as spent).`
          : `${money(chosen)} a month chosen, more than the ${money(Math.max(0, left))} left over \u2014 each is scaled down to fit.`;
    } else {
      el.textContent = sh.status === 'ok'
        ? 'Adds up to 100%.'
        : sh.status === 'under'
          ? `Adds up to ${round(sh.total)}% \u2014 the other ${round(100 - sh.total)}% isn\u2019t saved (it\u2019s treated as spent).`
          : `Adds up to ${round(sh.total)}% \u2014 each share is scaled down to make 100%.`;
    }
  }


  FP.screens = FP.screens || {};
  FP.screens.future = { title: 'Future', render, drawSplitStatus, getView, setView };
})(globalThis.FP = globalThis.FP || {});
