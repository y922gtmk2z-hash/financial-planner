/* Scenarios: copy the baseline, change anything, and compare side by side. */
(function (FP) {
  'use strict';

  const { h, money, pct, measure, lastsTo } = FP.dom;
  const S = FP.scenarios;
  const COLORS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

  const METRICS = [
    { id: 'netWorth', label: 'Net worth', get: (r) => r.netWorth },
    { id: 'savingsPensions', label: FP.dom.MEASURES.savingsPensions.label, get: FP.dom.MEASURES.savingsPensions.of },
    { id: 'pension', label: FP.dom.MEASURES.pensionPots.label, get: FP.dom.MEASURES.pensionPots.of },
    { id: 'equity', label: 'Home equity', get: (r) => r.equity },
  ];

  let metric = 'netWorth';

  function render(root, ctx) {
    const ws = ctx.workspace();
    if (ws.scenarios.length === 1 && FP.checklist.isEmpty(ctx.profile())) {
      FP.dom.add(root, FP.dom.pageHead('What if', 'Try a change and compare'), FP.checklist.emptyCard('and compare what-ifs'));
      return;
    }
    const results = h('div');
    let view = FP.yearByYear.getView();
    const draw = () => FP.dom.fill(results, compareView(ctx, view, draw));
    const list = h('div');
    const drawList = () => FP.dom.fill(list, listCard(ctx));

    // The comparison comes first once there's something to compare; until
    // then, the one-tap what-ifs. Managing scenarios and making your own follow.
    const compare = [
      h('div', { class: 'view-toggle' }, FP.field.render({
        label: 'Show amounts in', type: 'toggle',
        options: [{ value: 'real', label: 'Today’s money' }, { value: 'nominal', label: 'Future money' }],
      }, {
        value: view,
        onChange: (v) => { view = v; FP.yearByYear.setView(v); draw(); },
      })),
      results];
    const several = ws.scenarios.length > 1;
    FP.dom.add(root,
      FP.dom.pageHead('What if', 'Try a change and compare'),
      several ? null : h('p', { class: 'lead' }, 'Try a change to your plan \u2014 retire earlier, overpay the mortgage, weaker markets \u2014 and compare it side by side.'),
      several ? compare : presetCard(ctx),
      several ? list : null,
      several ? presetCard(ctx) : null,
      FP.goalSeekUi.card(ctx),
      createCard(ctx),
      several ? null : compare);
    drawList();
    draw();
  }

  // Your scenarios, one compact row each; Duplicate, Rename and Delete sit in a "⋯" menu.
  function listCard(ctx) {
    const ws = ctx.workspace();
    const base = ws.scenarios[0];
    return h('section', { class: 'card', 'aria-labelledby': 'sc-list-h' },
      h('h2', { id: 'sc-list-h' }, 'Your scenarios'),
      h('p', { class: 'muted small' }, 'Every screen shows and edits the one marked Editing.'),
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
        const menu = h('details', { class: 'row-menu' },
          h('summary', { 'aria-label': `More for \u201c${sc.name}\u201d` }, '\u22ef'),
          h('div', { class: 'row-menu-list' },
            h('button', {
              type: 'button', class: 'link', disabled: ws.scenarios.length >= S.MAX_SCENARIOS,
              'aria-describedby': ws.scenarios.length >= S.MAX_SCENARIOS ? 'sc-full' : null,
              onclick: () => { const c = S.clone(ws, sc.id); ctx.changed(); ctx.rerender(); ctx.toast(`Created “${c.name}” — now editing it`); },
            }, 'Duplicate'),
            renameBtn,
            baseline ? null : h('button', {
              type: 'button', class: 'link',
              onclick: () => {
                const d = new Date();
                const when = FP.dom.date(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                if (!confirm(`Make \u201c${sc.name}\u201d your plan? It becomes your Baseline, and \u201c${base.name}\u201d is kept as \u201cPrevious plan (${when})\u201d.`)) return;
                S.makeBaseline(ws, sc.id, when);
                ctx.changed();
                ctx.rerender();
                ctx.toast('This is now your plan. Your previous plan is kept under What if.');
              },
            }, 'Make this my plan'),
            baseline ? null : h('button', {
              type: 'button', class: 'link danger',
              onclick: () => {
                if (!confirm(`Delete “${sc.name}”? This can’t be undone.`)) return;
                S.remove(ws, sc.id);
                ctx.changed();
                ctx.rerender();
              },
            }, 'Delete')));
        renameBtn.addEventListener('click', () => { menu.open = false; });
        return h('li', { class: `scenario-item${editing ? ' is-active' : ''}` },
          h('div', { class: 'scenario-head' }, nameBox,
            editing ? null : h('button', { type: 'button', class: 'small secondary', onclick: () => { ctx.setActive(sc.id); ctx.toast(`Now editing “${sc.name}”`); } }, 'Edit'),
            menu),
          baseline
            ? h('p', { class: 'muted small' }, 'Your main plan. The others are compared with it.')
            : diffList(diffs));
      })));
  }

  function diffList(diffs) {
    if (!diffs.length) return h('p', { class: 'muted small' }, 'Same as the baseline so far. Edit it to see a difference.');
    const fmt = (d, v) => (d.kind === 'money' ? money(v) : d.kind === 'pct' ? pct(v, 2) : v == null ? 'Not set' : String(v));
    const shown = diffs.slice(0, 2);
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
    return FP.dom.foldCard('sc-new', 'Make your own scenario', 'Copy your plan, then change anything',
      full
        ? h('p', { class: 'muted' }, `You can have up to ${S.MAX_SCENARIOS} scenarios. Delete one to add another.`)
        : [
          h('div', { class: 'field' }, h('label', { for: 'new-sc-name' }, 'Name'), h('div', { class: 'input-wrap' }, nameInput)),
          h('div', { class: 'field' }, h('label', { for: 'new-sc-from' }, 'Start from a copy of'), h('div', { class: 'input-wrap' }, from)),
          h('button', { type: 'button', onclick: create }, 'Create and edit'),
          h('p', { class: 'help' }, 'The copy includes every input and assumption. Change it in Your figures and Assumptions while it\u2019s selected \u2014 or tap any figure on Your plan, try changes there and save them as a scenario.'),
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
        || h('section', { class: 'card' }, h('p', null, 'Enter your age in Your figures to compare projections.'), h('a', { href: '#setup' }, 'Go to Your figures'));
    }
    const base = sums[0].s;
    const moneyNote = real ? 'today’s money' : 'future pounds';
    // Each scenario run to its end age (for the chart and like-for-like ages),
    // and how long its money lasts at its retirement goal.
    sums.forEach((x) => {
      if (!x.s.ok) return;
      const p = x.sc.profile;
      const full = FP.projection.project(p, { maxYears: p.assumptions.endAge - p.about.age });
      x.rows = real ? full.rows.map(FP.projection.toReal) : full.rows;
      x.need = FP.projection.retirementNeed(p);
    });
    const baseX = sums[0];
    // Wealth is compared at one age for every scenario: the baseline's retirement age.
    const fixedAge = base.ok ? base.retirementAge : null;
    const rowAt = (x, age) => (x.rows ? x.rows.find((r) => r.age === age) || null : null);
    // Rounded when the figure is five or more years ahead.
    const fmtAt = (n, row) => money(n, { approx: !!row && FP.dom.far(row.y) });
    const atRetire = (x) => (x.rows ? rowAt(x, x.s.retirementAge) : null);

    const delta = (v, b, row) => {
      if (!Number.isFinite(v) || !Number.isFinite(b) || Math.abs(v - b) < 0.5) return null;
      return h('small', { class: v > b ? 'positive' : 'negative' }, `${v > b ? '+' : '−'}${fmtAt(Math.abs(v - b), row)}`);
    };
    const ageText = (v, none) => (v === undefined ? 'No mortgage' : v == null ? none : `Age ${v}`);
    const atFixed = (get) => (x) => {
      const r = rowAt(x, fixedAge);
      const b = rowAt(baseX, fixedAge);
      return r ? [fmtAt(get(r), r), delta(get(r), b && get(b), r)] : '\u2014';
    };
    const M = FP.dom.MEASURES;
    const spendCell = (x) => {
      const rs = x.s.retirementSpend;
      const b = base.retirementSpend;
      const row = atRetire(x);
      return rs ? [`${fmtAt(rs.monthly, row)} a month`, delta(rs.monthly, b && b.monthly, row)] : '\u2014';
    };
    const rows = [
      { label: measure('moneyLastsTo'), cell: (x) => (x.need ? h('span', { class: x.need.lastsUntil ? 'negative' : null }, lastsTo(x.need)) : '\u2014') },
      { label: `${measure('couldSpend')} (today\u2019s money)`, cell: spendCell },
      fixedAge != null ? { label: measure('netWorth', fixedAge), cell: atFixed(M.netWorth.of) } : null,
      fixedAge != null ? { label: measure('savingsPensions', fixedAge), cell: atFixed(M.savingsPensions.of) } : null,
      fixedAge != null ? { label: measure('pensionPots', fixedAge), cell: atFixed(M.pensionPots.of) } : null,
      { label: 'Retirement age', cell: (x) => String(x.s.retirementAge) },
      { label: 'Take-home pay (a month, now)', cell: (x) => [money(x.s.takeHomeMonthly), delta(x.s.takeHomeMonthly, base.takeHomeMonthly)] },
      { label: 'Left over each month (now)', cell: (x) => [money(x.s.surplusMonthly), delta(x.s.surplusMonthly, base.surplusMonthly)] },
      { label: 'Mortgage-free', cell: (x) => ageText(x.s.mortgageFreeAge, 'Not in projection') },
      { label: 'Student loan', cell: (x) => studentLoanText(x.s.studentLoan) },
    ].filter(Boolean);

    const table = h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Scenario comparison table' }, h('table', { class: 'data-table compare-table' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Measure')),
        sums.map(({ sc }, i) => h('th', { scope: 'col', class: `num${sc.id === ws.activeId ? ' is-active' : ''}` },
          h('span', { class: 'swatch', style: `background:var(${COLORS[i]})`, 'aria-hidden': 'true' }), sc.name)))),
      h('tbody', null, rows.map((row) => h('tr', null,
        h('th', { scope: 'row' }, row.label),
        sums.map((x) => h('td', { class: 'num' }, x.s.ok ? row.cell(x) : '—')))))));

    // First: how each scenario differs from the baseline, in a few key figures.
    const years = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'year' : 'years'}`;
    const moneyDelta = (v, b, row, unit) => {
      if (!Number.isFinite(v) || !Number.isFinite(b)) return null;
      if (Math.abs(v - b) < 0.5) return h('span', { class: 'delta changed' }, 'Same');
      return h('span', { class: `delta ${v > b ? 'better' : 'worse'}` }, `${v > b ? '+' : '\u2212'}${fmtAt(Math.abs(v - b), row)}${unit || ''}`);
    };
    // Later is better: lasting to the end of the plan counts as the latest.
    const lastsDelta = (n, b) => {
      if (!n || !b) return null;
      const age = (x) => x.lastsUntil || Infinity;
      if (age(n) === age(b)) return h('span', { class: 'delta changed' }, 'Same');
      if (!n.lastsUntil) return h('span', { class: 'delta better' }, `Lasts to ${n.endAge}+`);
      if (!b.lastsUntil) return h('span', { class: 'delta worse' }, `Runs short at ${n.lastsUntil}`);
      return h('span', { class: `delta ${age(n) > age(b) ? 'better' : 'worse'}` }, `${years(age(n) - age(b))} ${age(n) > age(b) ? 'later' : 'sooner'}`);
    };
    const deltaRows = (x) => {
      const s = x.s;
      const r = rowAt(x, fixedAge);
      const b = rowAt(baseX, fixedAge);
      return [
        [measure('moneyLastsTo'), lastsDelta(x.need, baseX.need)],
        [measure('couldSpend'), s.retirementSpend && base.retirementSpend ? moneyDelta(s.retirementSpend.monthly, base.retirementSpend.monthly, atRetire(x), ' a month') : null],
        [measure('netWorth', fixedAge), r && b ? moneyDelta(r.netWorth, b.netWorth, r) : null],
        ['Retirement age', s.retirementAge === base.retirementAge ? h('span', { class: 'delta changed' }, 'Same')
          : h('span', { class: 'delta changed' }, `${years(s.retirementAge - base.retirementAge)} ${s.retirementAge > base.retirementAge ? 'later' : 'earlier'}`)],
        ['Mortgage-free', Number.isFinite(s.mortgageFreeAge) && Number.isFinite(base.mortgageFreeAge)
          ? (s.mortgageFreeAge === base.mortgageFreeAge ? h('span', { class: 'delta changed' }, 'Same')
            : h('span', { class: `delta ${s.mortgageFreeAge < base.mortgageFreeAge ? 'better' : 'worse'}` }, `${years(s.mortgageFreeAge - base.mortgageFreeAge)} ${s.mortgageFreeAge < base.mortgageFreeAge ? 'sooner' : 'later'}`))
          : null],
      ].filter((row) => row[1]);
    };
    const others = sums.slice(1);
    const deltas = others.length
      ? h('ul', { class: 'delta-list' }, others.map((x) => h('li', null,
        h('p', { class: 'scenario-name' }, h('span', { class: 'swatch', style: `background:var(${COLORS[sums.indexOf(x)]})`, 'aria-hidden': 'true' }), h('strong', null, x.sc.name)),
        x.s.ok ? h('dl', { class: 'facts delta-facts' }, deltaRows(x).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))))
          : h('p', { class: 'muted small' }, 'Not enough figures to project this scenario.'))))
      : h('p', { class: 'muted' }, 'Add a what-if above to see how it differs from your baseline.');

    // Overlay chart, aligned by age.
    const ages = [];
    const okRows = sums.filter((x) => x.rows);
    const minAge = Math.min(...okRows.map((x) => x.rows[0].age));
    const maxAge = Math.max(...okRows.map((x) => x.rows[x.rows.length - 1].age));
    for (let a = minAge; a <= maxAge; a += 1) ages.push(a);
    const m = METRICS.find((x) => x.id === metric) || METRICS[0];
    const series = sums.map((x, i) => ({
      label: x.sc.name, color: COLORS[i], dashed: i >= 4,
      values: ages.map((age) => { const r = rowAt(x, age); return r ? m.get(r) : null; }),
    }));
    const metricSelect = h('select', { id: 'compare-metric' }, METRICS.map((x) => h('option', { value: x.id, selected: x.id === m.id }, x.label)));
    metricSelect.addEventListener('change', () => { metric = metricSelect.value; redraw(); });

    return [
      h('section', { class: 'card', 'aria-labelledby': 'cmp-h' },
        h('h2', { id: 'cmp-h' }, `Compared with ${sums[0].sc.name}`),
        h('p', { class: 'muted small' }, `Differences from the baseline, in ${moneyNote}${fixedAge != null ? `, with net worth for everyone at ${fixedAge} (the baseline\u2019s retirement age)` : ''}. Green is better, red is worse.`),
        deltas,
        h('details', { class: 'table-toggle all-figures' },
          h('summary', null, 'Show all figures'),
          h('p', { class: 'muted small' }, `Projected amounts in ${moneyNote}. Coloured figures show the difference from the baseline.`),
          table),
        sums.some(({ s }) => s.ok && s.projection.warnings.some((w) => w.key === 'shortfall'))
          ? h('p', { class: 'notice warn' }, 'At least one scenario runs short of money. Open it and see Year by year on your plan to see when.')
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
  FP.screens['what-if'] = { title: 'What if', render };
})(globalThis.FP = globalThis.FP || {});
