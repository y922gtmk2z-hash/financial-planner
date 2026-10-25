/*
 * "Finish your plan": what's still missing, each linking to where it's entered
 * in Setup. Shown instead of a projection until the essentials are in.
 */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  function item(i) {
    return h('li', { class: i.done ? 'done' : null },
      h('a', { href: `#setup/${i.target}` }, h('strong', null, i.label), h('span', null, i.why), h('span', { class: 'go', 'aria-hidden': 'true' }, '›')));
  }

  // Returns the card, or null when nothing essential is missing and `always` isn't set.
  function card(profile, opts) {
    opts = opts || {};
    const c = FP.summary.checklist(profile);
    if (c.ready && !opts.always) return null;
    return h('section', { class: 'card checklist', 'aria-labelledby': 'checklist-h' },
      h('h2', { id: 'checklist-h' }, c.ready ? 'Worth adding' : 'Finish your plan'),
      c.ready ? null : h('p', null, `Add ${c.blocking.length === 1 ? 'this' : 'these'} to see ${opts.what || 'your projection'}:`),
      c.ready ? null : h('ul', { class: 'link-list' }, c.blocking.map(item)),
      c.optional.length ? [
        c.ready ? null : h('p', { class: 'muted' }, 'Also worth adding:'),
        h('ul', { class: 'link-list' }, c.optional.map(item)),
      ] : null);
  }

  // One line naming optional figures still blank (or null).
  function note(profile) {
    const c = FP.summary.checklist(profile);
    if (!c.ready || !c.optional.length) return null;
    return h('p', { class: 'muted small checklist-note' }, 'Not entered yet: ',
      c.optional.map((i, n) => [n ? ', ' : '', h('a', { href: `#setup/${i.target}` }, i.label.replace(/^Your /, '').toLowerCase())]),
      '. Fine if you have none.');
  }

  // Nothing entered at all yet (a first visit, or after clearing your data).
  function isEmpty(p) {
    const sum = (list, key) => (list || []).reduce((t, x) => t + (x[key] || 0), 0);
    return p.about.age == null && !(p.income.grossSalary > 0) && !(sum(p.spending, 'monthly') > 0)
      && !Object.values(p.assets).some((v) => v > 0) && !(p.mortgage.balance > 0) && !(p.debts || []).length;
  }

  // Shown instead of results until you've added something.
  function emptyCard(what) {
    return h('section', { class: 'card empty-plan' },
      h('h2', null, `Add your figures to see ${what}`),
      h('p', { class: 'muted' }, FP.welcome.EFFORT),
      h('a', { class: 'button', href: '#setup' }, 'Get started'));
  }

  const visited = () => (FP.store.pref('setupVisited') || '').split(',').filter(Boolean);

  /*
   * How much of your plan is in: the checklist's items, plus your debts (done
   * once you've added any, or been through Debts, so "none" counts too).
   * Returns { items, done, total, next } (next: the first item still missing).
   */
  function detail(p) {
    const items = FP.summary.checklist(p).items.concat({
      id: 'debts', label: 'Your debts', target: 'debts', blocking: false,
      done: p.mortgage.balance > 0 || (p.debts || []).length > 0 || visited().includes('debts'),
    });
    const done = items.filter((i) => i.done).length;
    return { items, done, total: items.length, next: items.find((i) => !i.done) || null };
  }

  // "Plan detail: 3 of 6 · Next: your pension pots", with a bar.
  function meter(p) {
    const d = detail(p);
    return h('div', { class: 'detail-meter' },
      h('p', null, h('strong', null, `Plan detail: ${d.done} of ${d.total}`),
        d.next ? [' \u00b7 ', h('a', { href: `#setup/${d.next.target}` }, `Next: ${d.next.label.replace(/^Your /, 'your ').replace(/^What /, 'what ')}`)]
          : ' \u00b7 Everything\u2019s in'),
      h('div', { class: 'meter-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round((d.done / d.total) * 100)}%` })));
  }

  /*
   * Where "Add your pensions and savings" (and any "add more detail" link) opens
   * Your figures, in this order: Assets, Debts, Income (beyond your salary) and
   * Outgoings (itemised). The first section you haven't been to yet; if you've
   * been to them all, the first that's still empty; otherwise Assets. Never
   * About you, which the quick start has filled.
   */
  const GAPS = [
    { step: 'assets', target: 'assets', empty: (p) => !Object.values(p.assets).some((v) => v > 0) },
    { step: 'debts', target: 'debts', empty: (p) => !(p.mortgage.balance > 0) && !(p.debts || []).length },
    { step: 'income', target: 'pay-details', empty: (p) => !(FP.screens.setup && FP.screens.setup.hasPayDetail(p)) },
    { step: 'outgoings', target: 'out-bills', empty: (p) => !p.spending.some((r) => !r.rest && r.monthly > 0) },
  ];
  function nextSection(p) {
    const seen = visited();
    const gap = GAPS.find((g) => !seen.includes(g.step)) || GAPS.find((g) => g.empty(p)) || GAPS[0];
    return `#setup/${gap.target}`;
  }

  // Whether your cash savings have been answered: some entered, or you've been through Assets.
  const cashKnown = (p) => (p.assets.cashSavings || 0) > 0 || visited().includes('assets');

  FP.checklist = { card, note, isEmpty, emptyCard, meter, nextSection, cashKnown };
})(globalThis.FP = globalThis.FP || {});
