/* Scenarios: copy the baseline, change anything, and compare side by side. */
(function (FP) {
  'use strict';

  const { h, money, pct } = FP.dom;
  const S = FP.scenarios;
  const COLORS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

  const METRICS = [
    { id: 'netWorth', label: 'Net worth', get: (r) => r.netWorth },
    { id: 'pension', label: 'Pension pots', get: (r) => r.pension },
    { id: 'equity', label: 'Home equity', get: (r) => r.equity },
    { id: 'savings', label: 'Cash & investments', get: (r) => r.cash + r.isa + r.gia },
  ];

  let metric = 'netWorth';

  function render(root, ctx) {
    const ws = ctx.workspace();
    if (ws.scenarios.length === 1 && FP.checklist.isEmpty(ctx.profile())) {
      FP.dom.add(root, FP.dom.pageHead('Scenarios', 'What if\u2026'), FP.checklist.emptyCard('and compare what-ifs'));
      return;
    }
    const results = h('div');
    let view = FP.screens.future.getView();
    const draw = () => FP.dom.fill(results, compareView(ctx, view, draw));
    const list = h('div');
    const drawList = () => FP.dom.fill(list, listCard(ctx));

    FP.dom.add(root,
      FP.dom.pageHead('Scenarios', 'What if\u2026'),
      h('p', { class: 'lead' }, 'Copy your plan, change anything — returns, house prices, overpayments, salary, retirement age — and compare the results side by side.'),
      list,
      presetCard(ctx),
      createCard(ctx),
      h('div', { class: 'view-toggle' }, FP.field.render({
        label: 'Show amounts in', type: 'toggle',
        options: [{ value: 'real', label: 'Today’s money' }, { value: 'nominal', label: 'Future money' }],
      }, {
        value: view,
        onChange: (v) => { view = v; FP.screens.future.setView(v); draw(); },
      })),
      results);
    drawList();
    draw();
  }

  function listCard(ctx) {
    const ws = ctx.workspace();
    const base = ws.scenarios[0];
    return h('section', { class: 'card', 'aria-labelledby': 'sc-list-h' },
      h('h2', { id: 'sc-list-h' }, 'Your scenarios'),
      h('p', { class: 'muted' }, 'Every screen shows and edits the scenario you’re editing. Switch at any time with the scenario picker at the top.'),
      ws.scenarios.length >= S.MAX_SCENARIOS
        ? h('p', { class: 'notice info', id: 'sc-full' }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, 'i'),
          `You have ${S.MAX_SCENARIOS} scenarios, the most the planner compares at once (each gets its own chart colour). Delete one to add or duplicate another.`)
        : null,
      h('ul', { class: 'scenario-list' }, ws.scenarios.map((sc, i) => {
        const editing = sc.id === ws.activeId;
        const baseline = i === 0;
        const diffs = baseline ? [] : S.differences(base.profile, sc.profile);
        const nameBox = h('div', { class: 'scenario-name' },
          h('span', { class: 'swatch', style: `background:var(${COLORS[i]})`, 'aria-hidden': 'true' }),
          h('strong', null, sc.name),
          baseline ? h('span', { class: 'badge' }, 'Baseline') : null,
          editing ? h('span', { class: 'badge edited' }, 'Editing') : null);
        const renameBtn = h('button', {
          type: 'button', class: 'link',
          onclick: () => {
            const input = h('input', { type: 'text', value: sc.name, maxlength: 40, 'aria-label': `New name for ${sc.name}` });
            const done = () => { S.rename(ws, sc.id, input.value); ctx.changed(); ctx.rerender(); };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') ctx.rerender(); });
            FP.dom.fill(nameBox, h('div', { class: 'input-wrap rename' }, input),
              h('button', { type: 'button', class: 'small', onclick: done }, 'Save'));
            input.focus();
            input.select();
          },
        }, 'Rename');
        return h('li', { class: `scenario-item${editing ? ' is-active' : ''}` },
          nameBox,
          baseline
            ? h('p', { class: 'muted small' }, 'Your main plan. Other scenarios are compared with it.')
            : diffList(diffs),
          h('div', { class: 'scenario-actions' },
            editing ? null : h('button', { type: 'button', class: 'small', onclick: () => { ctx.setActive(sc.id); ctx.toast(`Now editing “${sc.name}”`); } }, 'Edit this'),
            h('button', {
              type: 'button', class: 'small secondary', disabled: ws.scenarios.length >= S.MAX_SCENARIOS,
              'aria-describedby': ws.scenarios.length >= S.MAX_SCENARIOS ? 'sc-full' : null,
              onclick: () => { const c = S.clone(ws, sc.id); ctx.changed(); ctx.rerender(); ctx.toast(`Created “${c.name}” — now editing it`); },
            }, 'Duplicate'),
            renameBtn,
            baseline ? null : h('button', {
              type: 'button', class: 'link danger',
              onclick: () => {
                if (!confirm(`Delete “${sc.name}”? This can’t be undone.`)) return;
                S.remove(ws, sc.id);
                ctx.changed();
                ctx.rerender();
              },
            }, 'Delete')));
      })));
  }

  function diffList(diffs) {
    if (!diffs.length) return h('p', { class: 'muted small' }, 'Same as the baseline so far. Edit it to see a difference.');
    const fmt = (d, v) => (d.kind === 'money' ? money(v) : d.kind === 'pct' ? pct(v, 2) : v == null ? 'Not set' : String(v));
    const shown = diffs.slice(0, 6);
    return h('ul', { class: 'diff-list', 'aria-label': 'Differences from the baseline' },
      shown.map((d) => h('li', null, d.kind === 'note'
        ? `${d.label} changed`
        : [h('span', null, d.label), ' ', h('span', { class: 'diff-from' }, fmt(d, d.from)), ' → ', h('strong', null, fmt(d, d.to))])),
      diffs.length > shown.length ? h('li', { class: 'muted' }, `and ${diffs.length - shown.length} more`) : null);
  }

  // One tap adds a what-if next to your baseline.
  function presetCard(ctx) {
    const ws = ctx.workspace();
    const base = ws.scenarios[0];
    const full = ws.scenarios.length >= S.MAX_SCENARIOS;
    const presets = S.PRESETS.filter((x) => x.applies(base.profile));
    if (!presets.length) return null;
    return h('section', { class: 'card', 'aria-labelledby': 'sc-preset-h' },
      h('h2', { id: 'sc-preset-h' }, 'Try a what-if'),
      h('p', { class: 'muted' }, `Each adds a copy of \u201c${base.name}\u201d with one change, and shows it side by side below.`),
      full ? h('p', { class: 'muted' }, `You can have up to ${S.MAX_SCENARIOS} scenarios. Delete one to add another.`) : null,
      h('div', { class: 'preset-row' }, presets.map((x) => h('button', {
        type: 'button', class: 'secondary small', disabled: full,
        onclick: () => {
          const c = S.fromPreset(ws, x.id);
          if (!c) return;
          ctx.changed();
          ctx.rerender();
          ctx.toast(`Added \u201c${c.name}\u201d \u2014 compare it below`);
          const table = document.getElementById('cmp-h');
          if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, x.label))));
  }

  function createCard(ctx) {
    const ws = ctx.workspace();
    const full = ws.scenarios.length >= S.MAX_SCENARIOS;
    const nameInput = h('input', { type: 'text', id: 'new-sc-name', maxlength: 40, placeholder: 'e.g. Retire at 60', autocomplete: 'off' });
    const from = h('select', { id: 'new-sc-from' }, ws.scenarios.map((sc) => h('option', { value: sc.id, selected: sc.id === ws.activeId }, sc.name)));
    const create = () => {
      const c = S.clone(ws, from.value, nameInput.value);
      if (!c) return;
      ctx.changed();
      ctx.rerender();
      ctx.toast(`Created “${c.name}” — now editing it`);
      const quick = document.getElementById('quick-h');
      if (quick) quick.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
    return h('section', { class: 'card', 'aria-labelledby': 'sc-new-h' },
      h('h2', { id: 'sc-new-h' }, 'Create a scenario'),
      full
        ? h('p', { class: 'muted' }, `You can have up to ${S.MAX_SCENARIOS} scenarios. Delete one to add another.`)
        : [
          h('div', { class: 'field' }, h('label', { for: 'new-sc-name' }, 'Name'), h('div', { class: 'input-wrap' }, nameInput)),
          h('div', { class: 'field' }, h('label', { for: 'new-sc-from' }, 'Start from a copy of'), h('div', { class: 'input-wrap' }, from)),
          h('button', { type: 'button', onclick: create }, 'Create and edit'),
          h('p', { class: 'help' }, 'The copy includes every input and assumption. Change it in Setup and Assumptions while it\u2019s selected \u2014 or tap any figure on Your plan, try changes there and save them as a scenario.'),
        ]);
  }

  function studentLoanText(sl) {
    if (!sl || !sl.tracked) return '\u2014';
    if (sl.clearedRow) return `Repaid at ${sl.clearedRow.age}`;
    if (sl.writtenOffRow) return `Written off at ${sl.writtenOffAge}`;
    return 'Still owing';
  }

  function compareView(ctx, view, redraw) {
    const ws = ctx.workspace();
    const real = view === 'real';
    const sums = ws.scenarios.map((sc) => ({ sc, s: FP.compare.summarise(sc.profile, real) }));
    const ok = sums.filter((x) => x.s.ok);
    if (!ok.length) {
      if (FP.checklist.isEmpty(ctx.profile())) return FP.checklist.emptyCard('projections side by side');
      return FP.checklist.card(ctx.profile(), { what: 'projections side by side' })
        || h('section', { class: 'card' }, h('p', null, 'Enter your age in Setup to compare projections.'), h('a', { href: '#setup' }, 'Go to Setup'));
    }
    const commonAge = FP.compare.commonEndAge(sums.map((x) => x.s));
    const base = sums[0].s;
    const moneyNote = real ? 'today’s money' : 'future pounds';

    const delta = (v, b) => {
      if (!Number.isFinite(v) || !Number.isFinite(b) || Math.abs(v - b) < 0.5) return null;
      return h('small', { class: v > b ? 'positive' : 'negative' }, `${v > b ? '+' : '−'}${money(Math.abs(v - b))}`);
    };
    const ageText = (v, none) => (v === undefined ? 'No mortgage' : v == null ? none : `Age ${v}`);
    const rows = [
      { label: 'Take-home pay (a month, now)', cell: (s) => [money(s.takeHomeMonthly), delta(s.takeHomeMonthly, base.takeHomeMonthly)] },
      { label: 'Left over each month (now)', cell: (s) => [money(s.surplusMonthly), delta(s.surplusMonthly, base.surplusMonthly)] },
      { label: 'Retirement age', cell: (s) => String(s.retirementAge) },
      { label: 'Net worth at retirement', cell: (s) => (s.atRetirement ? [money(s.atRetirement.netWorth), delta(s.atRetirement.netWorth, base.atRetirement && base.atRetirement.netWorth)] : '—') },
      { label: 'Pension pot at retirement', cell: (s) => (s.atRetirement ? [money(s.atRetirement.pension), delta(s.atRetirement.pension, base.atRetirement && base.atRetirement.pension)] : '—') },
      { label: 'Could spend in retirement (a month, today\u2019s money)', cell: (s) => (s.retirementSpend ? [money(s.retirementSpend.monthly), delta(s.retirementSpend.monthly, base.retirementSpend && base.retirementSpend.monthly)] : '\u2014') },
      { label: 'Mortgage-free', cell: (s) => ageText(s.mortgageFreeAge, 'Not in projection') },
      { label: 'Student loan', cell: (s) => studentLoanText(s.studentLoan) },
      { label: 'Money runs short', cell: (s) => (s.runsOutAge ? h('span', { class: 'negative' }, `Age ${s.runsOutAge}`) : 'No') },
      commonAge ? {
        label: `Net worth at ${commonAge}`,
        cell: (s) => {
          const r = FP.compare.rowAtAge(s, commonAge);
          const b = FP.compare.rowAtAge(base, commonAge);
          return r ? [money(r.netWorth), delta(r.netWorth, b && b.netWorth)] : '—';
        },
      } : null,
    ].filter(Boolean);

    const table = h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Scenario comparison table' }, h('table', { class: 'data-table compare-table' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Measure')),
        sums.map(({ sc }, i) => h('th', { scope: 'col', class: `num${sc.id === ws.activeId ? ' is-active' : ''}` },
          h('span', { class: 'swatch', style: `background:var(${COLORS[i]})`, 'aria-hidden': 'true' }), sc.name)))),
      h('tbody', null, rows.map((row) => h('tr', null,
        h('th', { scope: 'row' }, row.label),
        sums.map(({ s }) => h('td', { class: 'num' }, s.ok ? row.cell(s) : '—')))))));

    // First: how each scenario differs from the baseline, in a few key figures.
    const years = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'year' : 'years'}`;
    const moneyDelta = (v, b, unit) => {
      if (!Number.isFinite(v) || !Number.isFinite(b)) return null;
      if (Math.abs(v - b) < 0.5) return h('span', { class: 'delta changed' }, 'Same');
      return h('span', { class: `delta ${v > b ? 'better' : 'worse'}` }, `${v > b ? '+' : '\u2212'}${money(Math.abs(v - b))}${unit || ''}`);
    };
    const deltaRows = (s) => [
      ['Net worth at retirement', s.atRetirement && base.atRetirement ? moneyDelta(s.atRetirement.netWorth, base.atRetirement.netWorth) : null],
      ['Could spend in retirement', s.retirementSpend && base.retirementSpend ? moneyDelta(s.retirementSpend.monthly, base.retirementSpend.monthly, ' a month') : null],
      ['Retirement age', s.retirementAge === base.retirementAge ? h('span', { class: 'delta changed' }, 'Same')
        : h('span', { class: 'delta changed' }, `${years(s.retirementAge - base.retirementAge)} ${s.retirementAge > base.retirementAge ? 'later' : 'earlier'}`)],
      ['Mortgage-free', Number.isFinite(s.mortgageFreeAge) && Number.isFinite(base.mortgageFreeAge)
        ? (s.mortgageFreeAge === base.mortgageFreeAge ? h('span', { class: 'delta changed' }, 'Same')
          : h('span', { class: `delta ${s.mortgageFreeAge < base.mortgageFreeAge ? 'better' : 'worse'}` }, `${years(s.mortgageFreeAge - base.mortgageFreeAge)} ${s.mortgageFreeAge < base.mortgageFreeAge ? 'sooner' : 'later'}`))
        : null],
      ['Money runs short', s.runsOutAge && !base.runsOutAge ? h('span', { class: 'delta worse' }, `At ${s.runsOutAge}`)
        : !s.runsOutAge && base.runsOutAge ? h('span', { class: 'delta better' }, 'No longer') : null],
    ].filter((r) => r[1]);
    const others = sums.slice(1);
    const deltas = others.length
      ? h('ul', { class: 'delta-list' }, others.map(({ sc, s }) => h('li', null,
        h('p', { class: 'scenario-name' }, h('span', { class: 'swatch', style: `background:var(${COLORS[sums.findIndex((x) => x.sc === sc)]})`, 'aria-hidden': 'true' }), h('strong', null, sc.name)),
        s.ok ? h('dl', { class: 'facts delta-facts' }, deltaRows(s).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))))
          : h('p', { class: 'muted small' }, 'Not enough figures to project this scenario.'))))
      : h('p', { class: 'muted' }, 'Add a what-if above to see how it differs from your baseline.');

    // Overlay chart, aligned by age.
    const ages = [];
    const minAge = Math.min(...ok.map((x) => x.s.rows[0].age));
    const maxAge = Math.max(...ok.map((x) => x.s.end.age));
    for (let a = minAge; a <= maxAge; a += 1) ages.push(a);
    const m = METRICS.find((x) => x.id === metric) || METRICS[0];
    const series = sums.map(({ sc, s }, i) => ({
      label: sc.name, color: COLORS[i], dashed: i >= 4,
      values: ages.map((age) => { const r = s.ok ? FP.compare.rowAtAge(s, age) : null; return r ? m.get(r) : null; }),
    }));
    const metricSelect = h('select', { id: 'compare-metric' }, METRICS.map((x) => h('option', { value: x.id, selected: x.id === m.id }, x.label)));
    metricSelect.addEventListener('change', () => { metric = metricSelect.value; redraw(); });

    return [
      h('section', { class: 'card', 'aria-labelledby': 'cmp-h' },
        h('h2', { id: 'cmp-h' }, `Compared with ${sums[0].sc.name}`),
        h('p', { class: 'muted small' }, `Differences from the baseline, in ${moneyNote}. Green is better, red is worse.`),
        deltas,
        h('details', { class: 'table-toggle all-figures' },
          h('summary', null, 'Show all figures'),
          h('p', { class: 'muted small' }, `Projected amounts in ${moneyNote}. Coloured figures show the difference from the baseline.`),
          table),
        sums.some(({ s }) => s.ok && s.projection.warnings.some((w) => w.key === 'shortfall'))
          ? h('p', { class: 'notice warn' }, 'At least one scenario runs short of money. Open it on the Future screen to see when.')
          : null),
      h('section', { class: 'card', 'aria-labelledby': 'ovl-h' },
        h('h2', { id: 'ovl-h' }, 'Over time'),
        h('div', { class: 'field compact' }, h('label', { for: 'compare-metric' }, 'Show'), h('div', { class: 'input-wrap' }, metricSelect)),
        FP.chart.keys(series.map((x) => ({ label: x.label, color: x.color, line: true, dashed: x.dashed }))),
        FP.chart.timeChart({
          type: 'line', series,
          xLabels: ages.map(String),
          xTitle: (i) => `Age ${ages[i]}`,
          ariaLabel: `Line chart comparing ${m.label.toLowerCase()} by age across scenarios, in ${moneyNote}`,
        }),
        h('p', { class: 'muted small' }, 'Ages along the bottom. Each scenario uses its own assumptions.')),
    ];
  }

  FP.screens = FP.screens || {};
  FP.screens.scenarios = { title: 'Scenarios', render };
})(globalThis.FP = globalThis.FP || {});
