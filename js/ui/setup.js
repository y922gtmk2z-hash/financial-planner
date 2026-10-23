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
    root.appendChild(FP.savingsEditor.render(ctx));
    // Leftover money updates as you change anything above it.
    const leftover = FP.leftoverCard.render(ctx, { id: 'leftover' });
    root.appendChild(leftover);
    const strip = liveStrip(ctx, root);
    let timer = null;
    const refresh = (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!leftover.contains(e.target)) leftover.refresh();
        strip.refresh();
      }, 200);
    };
    root.addEventListener('input', refresh);
    root.addEventListener('change', refresh);
    root.addEventListener('click', refresh);
    root.appendChild(calculateCard(ctx, root));
    root.appendChild(strip);
  }

  // Shows the result of what you've entered so far, pinned above the tabs.
  function liveStrip(ctx, root) {
    const figures = h('p', { class: 'live-figures', role: 'status', 'aria-live': 'polite' });
    const strip = h('div', { class: 'live-strip' }, figures,
      h('button', { type: 'button', class: 'small', onclick: () => calculate(ctx, root) }, 'See my plan'));
    strip.refresh = () => {
      const p = ctx.profile();
      const pay = FP.tax.forProfile(p);
      const left = FP.summary.compute(p, pay.takeHomeMonthly).cashFlow.surplus;
      FP.dom.fill(figures,
        h('span', null, h('small', null, 'Take-home a month'), h('strong', null, money(pay.takeHomeMonthly))),
        h('span', null, h('small', null, left < 0 ? 'Short each month' : 'Left over a month'), h('strong', { class: left < 0 ? 'negative' : null }, money(Math.abs(left || 0)))));
    };
    strip.refresh();
    return strip;
  }

  function calculate(ctx, root) {
    const bad = root.querySelector('[aria-invalid="true"]');
    if (bad) {
      bad.focus();
      bad.scrollIntoView({ block: 'center' });
      ctx.toast('Fix the highlighted box first.');
      return;
    }
    ctx.go('overview');
  }

  // Changes save as you type; Calculate takes you to the results.
  function calculateCard(ctx, root) {
    return h('section', { class: 'card calculate', 'aria-label': 'Calculate' },
      h('button', { type: 'button', class: 'calculate-btn', onclick: () => calculate(ctx, root) }, 'Calculate my plan'),
      h('p', { class: 'help' }, 'Your figures save as you type. Calculate shows your overview — you can come back to Setup at any time from the top of the screen.'));
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
      FP.field.sectionBody(sec, make, sec.id === 'income' ? [FP.bonusEditor.render(ctx), FP.sacrificeEditor.render(ctx)] : null));
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
    const card = h('section', { class: 'card', id: 'spending', 'aria-labelledby': 'sec-spend' });
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
