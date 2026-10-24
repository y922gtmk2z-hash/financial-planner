/*
 * Check in (#checkin): confirm or update today's balances, about two minutes.
 * Progress (#progress): what you have against what the plan expected, and
 * what's changed since your last check-in. Snapshots live in the workspace
 * (js/model/checkins.js).
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const C = FP.checkins;

  // Today as YYYY-MM-DD, in your time zone.
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function checkin(root, ctx) {
    const ws = ctx.workspace();
    const plan = ws.scenarios[0].profile;
    const b = C.balancesOf(plan);
    const last = C.latest(ws);
    const was = (get) => (last ? `Last time (${FP.dom.date(last.date)}): ${money(get(last.balances) || 0)}.` : null);
    // What you entered last time stays in view under each box, to check against.
    const box = (label, value, set, wasText, help) => FP.field.render({ label, type: 'money', help }, {
      value, onChange: set, extra: wasText ? h('p', { class: 'help was' }, wasText) : null,
    });
    const debtBox = (d) => box(d.name || 'Debt', d.balance, (v) => { d.balance = v; },
      last ? was((x) => (x.debts.find((y) => y.id === d.id) || {}).balance) : null, 'What you owe today.');
    const form = h('form', { class: 'card checkin-form', novalidate: true },
      h('h2', null, 'Today’s balances'),
      h('p', { class: 'help' }, 'Each is filled in from your plan. Check it against your latest statement or app, and change it if it’s moved.'),
      box('Cash savings', b.cash, (v) => { b.cash = v; }, was((x) => x.cash), 'Current and savings accounts, and cash ISAs.'),
      box('ISAs', b.isa, (v) => { b.isa = v; }, was((x) => x.isa), 'Stocks & shares ISAs and Lifetime ISAs, together.'),
      box('Other investments', b.gia, (v) => { b.gia = v; }, was((x) => x.gia), 'General investment accounts.'),
      box('Pension pots', b.pension, (v) => { b.pension = v; }, was((x) => x.pension), 'All your defined-contribution pots, from your statements or apps.'),
      b.mortgage > 0 || (last && last.balances.mortgage > 0) ? box('Mortgage balance', b.mortgage, (v) => { b.mortgage = v; }, was((x) => x.mortgage), 'What you still owe.') : null,
      b.debts.map(debtBox),
      h('div', { class: 'button-row' }, h('button', { type: 'submit' }, 'Save check-in')),
      h('p', { class: 'help' }, 'This updates these balances in every scenario, and keeps a snapshot for Progress.'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = form.querySelector('[aria-invalid="true"]');
      if (bad) { bad.focus(); ctx.toast('Fix the highlighted box first.'); return; }
      C.record(ws, today(), b);
      ctx.changed();
      ctx.go('progress');
      ctx.toast('Check-in saved');
    });
    FP.dom.add(root,
      FP.dom.pageHead('Check in', 'Update today’s balances: about two minutes'),
      h('p', { class: 'lead' }, last
        ? `Your last check-in was on ${FP.dom.date(last.date)}. Confirm or update each balance, then save.`
        : 'Your first check-in. Confirm or update each balance, then save. Next time, Progress will compare it with what your plan expected.'),
      form);
  }

  function progress(root, ctx) {
    const ws = ctx.workspace();
    const snaps = (ws.checkins || { snapshots: [] }).snapshots;
    const head = FP.dom.pageHead('Progress', 'What you have against your plan');
    const checkLink = h('a', { class: 'button', href: '#checkin' }, snaps.length ? 'Check in again' : 'Check in now');
    if (!snaps.length) {
      FP.dom.add(root, head, h('section', { class: 'card' },
        h('h2', null, 'No check-ins yet'),
        h('p', null, 'Every month or so, update your balances. Progress then shows your savings and pensions against what your plan expected, and what’s changed since last time.'),
        checkLink));
      return;
    }
    const since = C.sinceLast(ws);
    const M = FP.dom.MEASURES.savingsPensions;
    const label = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const series = [
      { label: `${M.label}: what you had`, color: '--series-7', values: snaps.map((s) => s.savingsAndPensions) },
      { label: `${M.label}: what your plan expected`, color: '--series-2', dashed: true, values: snaps.map((s) => (s.planned ? s.planned.savingsAndPensions : null)) },
    ];
    const latest = snaps[snaps.length - 1];
    const gap = latest.planned ? latest.savingsAndPensions - latest.planned.savingsAndPensions : null;
    const applied = since ? since.applied.map((id) => FP.screens.actions.nameOf(id, ws.scenarios[0].profile)) : [];
    const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
    FP.dom.add(root, head,
      h('section', { class: 'card', 'aria-labelledby': 'since-h' },
        h('h2', { id: 'since-h' }, since ? `Since ${FP.dom.date(since.from)}` : 'Since last time'),
        since ? h('dl', { class: 'facts' },
          h('div', null, h('dt', null, 'Net worth'), h('dd', { class: since.netWorth >= 0 ? 'positive' : 'negative' }, signed(since.netWorth))),
          h('div', null, h('dt', null, 'Debts paid down'), h('dd', null, money(since.debtsPaid))),
          h('div', null, h('dt', null, 'Actions applied'), h('dd', null, applied.length ? applied.join(', ') : 'None'))) : h('p', null, `Your first check-in was on ${FP.dom.date(latest.date)}. Check in again in a month or so to see what’s changed.`),
        gap != null ? FP.dom.soWhat(`your ${M.label.toLowerCase()} are ${money(Math.abs(gap))} ${gap >= 0 ? 'ahead of' : 'behind'} what your plan expected for ${FP.dom.date(latest.date)}.`) : null,
        h('div', { class: 'button-row' }, checkLink)),
      snaps.length >= 2 ? h('section', { class: 'card', 'aria-labelledby': 'prog-chart-h' },
        h('h2', { id: 'prog-chart-h' }, `${M.label} over time`),
        FP.chart.keys(series.map((x) => ({ label: x.label, color: x.color, line: true, dashed: x.dashed }))),
        FP.chart.timeChart({
          type: 'line', series, approxFrom: Infinity,
          xLabels: snaps.map((s) => label(s.date)),
          xTitle: (i) => FP.dom.date(snaps[i].date),
          ariaLabel: `Line chart of your ${M.label.toLowerCase()} at each check-in, with what your plan expected`,
        }),
        h('p', { class: 'muted small' }, `${M.includes} What your plan expected is from the plan as it was at the check-in before.`)) : null,
      FP.dom.foldCard('prog-table', 'Every check-in', `${snaps.length} so far`,
        h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Check-ins table' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ['Date', M.label, 'Plan expected', 'Net worth'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : null }, t)))),
          h('tbody', null, snaps.slice().reverse().map((s) => h('tr', null,
            h('th', { scope: 'row' }, FP.dom.date(s.date)),
            h('td', { class: 'num' }, money(s.savingsAndPensions)),
            h('td', { class: 'num' }, s.planned ? money(s.planned.savingsAndPensions) : '—'),
            h('td', { class: 'num' }, money(s.netWorth)))))))));
  }

  FP.screens = FP.screens || {};
  FP.screens.checkin = { title: 'Check in', render: checkin };
  FP.screens.progress = { title: 'Progress', render: progress };
})(globalThis.FP = globalThis.FP || {});
