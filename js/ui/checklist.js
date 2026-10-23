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

  FP.checklist = { card, note };
})(globalThis.FP = globalThis.FP || {});
