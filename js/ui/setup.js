/* Setup: enter your numbers once. Every field writes straight into the shared profile. */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;

  function render(root, ctx) {
    const p = ctx.profile();
    FP.dom.add(root,
      h('h1', null, 'Setup'),
      h('p', { class: 'lead' }, 'Enter your numbers once — every screen uses them. Changes save automatically on this device. Blank boxes count as £0.'));

    FP.profile.SECTIONS.forEach((sec) => {
      root.appendChild(sectionCard(sec, ctx));
      if (sec.id === 'mortgage') root.appendChild(debtsCard(ctx));
    });
    root.appendChild(spendingCard(ctx, p));
  }

  function sectionCard(sec, ctx) {
    const p = ctx.profile();
    const make = (f) => FP.field.render(f, {
      value: FP.profile.get(p, f.path),
      onChange: (v) => ctx.update(f.path, v),
    });
    return h('section', { class: 'card', 'aria-labelledby': `sec-${sec.id}` },
      h('h2', { id: `sec-${sec.id}` }, sec.title),
      sec.intro ? h('p', { class: 'muted' }, sec.intro) : null,
      FP.field.sectionBody(sec, make, sec.id === 'income' ? FP.bonusEditor.render(ctx) : null));
  }

  function debtsCard(ctx) {
    const card = h('section', { class: 'card', 'aria-labelledby': 'sec-debts' });
    const draw = () => {
      const p = ctx.profile();
      FP.dom.fill(card,
        h('h2', { id: 'sec-debts' }, 'Other debts'),
        h('p', { class: 'muted' }, 'Loans, car finance, credit cards. Leave the rate blank to use the default in Assumptions.'),
        p.debts.length ? null : h('p', { class: 'empty' }, 'No other debts added.'),
        p.debts.map((d, i) => h('fieldset', { class: 'row-card' },
          h('legend', null, d.name || `Debt ${i + 1}`),
          FP.profile.DEBT_FIELDS.map((f) => FP.field.render(f, {
            value: d[f.key],
            compact: f.key !== 'rate',
            nullPlaceholder: `Default ${p.assumptions.otherDebtRate}%`,
            onChange: (v) => ctx.update(`debts.${i}.${f.key}`, v),
          })),
          h('button', { type: 'button', class: 'link danger', onclick: () => { p.debts.splice(i, 1); ctx.changed(); draw(); } }, 'Remove this debt'))),
        h('button', { type: 'button', class: 'secondary', onclick: () => { p.debts.push(FP.profile.newDebt()); ctx.changed(); draw(); } }, '+ Add a debt'));
    };
    draw();
    return card;
  }

  function spendingCard(ctx) {
    const card = h('section', { class: 'card', 'aria-labelledby': 'sec-spend' });
    const total = h('strong');
    const updateTotal = () => {
      total.textContent = `${money(ctx.profile().spending.reduce((s, r) => s + (r.monthly || 0), 0))} a month`;
    };
    const draw = () => {
      const p = ctx.profile();
      FP.dom.fill(card,
        h('h2', { id: 'sec-spend' }, 'Monthly spending'),
        h('p', { class: 'muted' }, 'Typical monthly spend by category. Don’t include your mortgage or debt payments — those are added from above.'),
        h('div', { class: 'spend-list' }, p.spending.map((r, i) => h('div', { class: 'spend-row' },
          FP.field.render(FP.profile.SPENDING_FIELDS[0], {
            value: r.category, compact: true,
            onChange: (v) => ctx.update(`spending.${i}.category`, v),
          }),
          FP.field.render(FP.profile.SPENDING_FIELDS[1], {
            value: r.monthly, compact: true,
            onChange: (v) => { ctx.update(`spending.${i}.monthly`, v); updateTotal(); },
          }),
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Remove ${r.category || 'this category'}`,
            onclick: () => { p.spending.splice(i, 1); ctx.changed(); draw(); },
          }, '×')))),
        h('button', { type: 'button', class: 'secondary', onclick: () => { p.spending.push(FP.profile.newSpending()); ctx.changed(); draw(); } }, '+ Add a category'),
        h('div', { class: 'total-row' }, h('span', null, 'Total spending'), total));
      updateTotal();
    };
    draw();
    return card;
  }

  FP.screens = FP.screens || {};
  FP.screens.setup = { title: 'Setup', render };
})(globalThis.FP = globalThis.FP || {});
