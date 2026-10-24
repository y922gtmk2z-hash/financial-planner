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
      h('p', { class: 'muted' }, 'It takes about five minutes in Setup, and a rough figure is fine for anything you\u2019re not sure of.'),
      h('a', { class: 'button', href: '#setup' }, 'Get started'));
  }

  FP.checklist = { card, note, isEmpty, emptyCard };
})(globalThis.FP = globalThis.FP || {});
