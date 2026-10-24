/* Setup: enter your numbers once. Every field writes straight into the shared profile. */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;

  // Setup in five steps. A first-time visitor goes step by step; you can
  // switch to everything on one page at any time.
  const STEPS = [
    { id: 'you', title: 'You and your pay', short: 'You', sections: ['about', 'income'] },
    { id: 'own', title: 'What you own', short: 'Own', sections: ['assets'] },
    { id: 'owe', title: 'Mortgage and debts', short: 'Owe', sections: ['mortgage', 'debts'] },
    { id: 'spend', title: 'Monthly spending', short: 'Spend', sections: ['spending'] },
    { id: 'save', title: 'Saving and your leftover money', short: 'Save', sections: ['savings', 'leftover'] },
  ];

  // Steps that need something before a projection can be shown.
  function stepMissing(step, p) {
    const ids = { you: ['age'], spend: ['spending'] }[step.id] || [];
    return FP.summary.checklist(p).blocking.filter((i) => ids.includes(i.id));
  }

  // Quick start: the few figures that give you a first answer.
  const QUICK = [
    'about.age', 'assumptions.retirementAge', 'income.grossSalary', 'spending.0.monthly',
    'assets.cashSavings', 'assets.pension', 'assets.isa',
    'mortgage.balance', 'assumptions.mortgageRate', 'mortgage.remainingTermYears',
  ];
  const MORTGAGE_DETAIL = ['assumptions.mortgageRate', 'mortgage.remainingTermYears'];

  function quickStart(root, ctx, setMode) {
    const p = ctx.profile();
    const mortgageDetail = [];
    const field = (path) => {
      let f = FP.profile.fieldFor(path);
      if (path === 'spending.0.monthly') {
        f = { path, label: 'What you spend in a month', type: 'money', suffix: 'a month',
          help: 'Everything except your mortgage and debt payments. A rough total is fine \u2014 you can split it into categories later.' };
      }
      if (path === 'assets.isa') f = { ...f, label: 'Investments (ISAs and others)', help: 'Stocks & shares ISAs and other investment accounts, not pensions.' };
      const el = FP.field.render(f, {
        value: FP.profile.get(p, path),
        onChange: (v) => {
          ctx.update(path, v);
          if (path === 'mortgage.balance') mortgageDetail.forEach((m) => { m.hidden = !(v > 0); });
        },
      });
      if (MORTGAGE_DETAIL.includes(path)) { el.hidden = !(p.mortgage.balance > 0); mortgageDetail.push(el); }
      return el;
    };
    // Several spending categories already: show the total and send you to them.
    const spendField = p.spending.length === 1 ? Object.assign(field('spending.0.monthly'), { id: 'spending' })
      : h('p', null, `Monthly spending: ${money(p.spending.reduce((t, r) => t + (r.monthly || 0), 0))} across ${p.spending.length} categories. `,
        h('button', { type: 'button', class: 'link', onclick: () => setMode('all') }, 'Change them'));
    FP.dom.add(root,
      h('h1', null, 'Quick start'),
      h('p', { class: 'lead' }, 'A few figures give you a first answer. You can add detail \u2014 bonuses, debts, your student loan, regular savings \u2014 at any time.'),
      h('section', { class: 'card', 'aria-labelledby': 'qs-you' },
        h('h2', { id: 'qs-you' }, 'You and your pay'),
        field('about.age'), field('assumptions.retirementAge'), field('income.grossSalary'), spendField),
      h('section', { class: 'card', 'aria-labelledby': 'qs-own' },
        h('h2', { id: 'qs-own' }, 'What you have'),
        h('p', { class: 'muted' }, 'Leave anything that doesn\u2019t apply blank.'),
        field('assets.cashSavings'), field('assets.pension'), field('assets.isa'),
        field('mortgage.balance'), field('assumptions.mortgageRate'), field('mortgage.remainingTermYears')),
      h('div', { class: 'step-footer' }, h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'secondary', onclick: () => setMode('steps') }, 'Add more detail'),
        h('button', { type: 'button', onclick: () => calculate(ctx, root) }, 'See my plan'))));
    const strip = liveStrip(ctx, root);
    let timer = null;
    root.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(strip.refresh, 200); });
    root.appendChild(strip);
  }

  function render(root, ctx) {
    const p = ctx.profile();
    let mode = FP.store.pref('setupMode') || (FP.summary.checklist(p).ready ? 'all' : 'quick');
    // A link to a field that isn't in the quick start opens the full Setup.
    const target = (location.hash.split('/')[1] || '');
    if (mode === 'quick' && target && !QUICK.includes(decodeURIComponent(target)) && target !== 'spending') mode = 'all';
    const switchMode = (m) => {
      FP.store.pref('setupMode', m);
      ctx.rerender();
      window.scrollTo(0, 0);
    };
    if (mode === 'quick') { quickStart(root, ctx, switchMode); return; }
    let current = Math.min(STEPS.length - 1, Number(FP.store.pref('setupStep')) || 0);
    const visited = new Set((FP.store.pref('setupVisited') || '').split(',').filter(Boolean));

    const cards = {};
    FP.profile.SECTIONS.forEach((sec) => { cards[sec.id] = sectionCard(sec, ctx); });
    cards.debts = debtsCard(ctx);
    cards.spending = spendingCard(ctx, p);
    cards.savings = FP.savingsEditor.render(ctx);
    // Leftover money updates as you change anything above it.
    const leftover = FP.leftoverCard.render(ctx, { id: 'leftover' });
    cards.leftover = leftover;

    const groups = STEPS.map((st) => h('div', { class: 'setup-step', id: `step-${st.id}`, 'data-step': st.id, 'aria-labelledby': `step-h-${st.id}` },
      h('h2', { class: 'step-title', id: `step-h-${st.id}` }, st.title),
      st.sections.map((id) => cards[id])));
    const nav = h('nav', { class: 'step-nav', 'aria-label': 'Setup steps' });
    const intro = h('div', { class: 'setup-intro' });
    const footer = h('div', { class: 'step-footer' });
    const calc = calculateCard(ctx, root);

    function markVisited(i) {
      visited.add(STEPS[i].id);
      FP.store.pref('setupVisited', [...visited].join(','));
    }

    function show(i, focus) {
      current = Math.max(0, Math.min(STEPS.length - 1, i));
      FP.store.pref('setupStep', current);
      draw();
      if (focus) {
        window.scrollTo(0, 0);
        groups[current].querySelector('.step-title').setAttribute('tabindex', '-1');
        groups[current].querySelector('.step-title').focus({ preventScroll: true });
      }
    }

    const setMode = switchMode;

    function draw() {
      const steps = mode === 'steps';
      const pp = ctx.profile();
      FP.dom.fill(nav, h('ol', null, STEPS.map((st, i) => {
        const missing = stepMissing(st, pp);
        const state = missing.length ? (visited.has(st.id) ? 'todo' : '') : visited.has(st.id) || !steps ? 'done' : '';
        return h('li', null, h('a', {
          href: `#setup/step-${st.id}`,
          class: `step-chip${steps && i === current ? ' current' : ''}${state ? ` ${state}` : ''}`,
          'aria-current': steps && i === current ? 'step' : null,
          onclick: (e) => {
            if (!steps) return;
            e.preventDefault();
            markVisited(current);
            show(i, true);
          },
        }, h('span', { class: 'step-num', 'aria-hidden': 'true' }, state === 'done' ? '✓' : state === 'todo' ? '!' : String(i + 1)),
        h('span', { class: 'step-label' }, st.short),
        state === 'todo' ? h('span', { class: 'visually-hidden' }, ' (needs something)') : state === 'done' ? h('span', { class: 'visually-hidden' }, ' (done)') : null));
      })));
      FP.dom.fill(intro,
        h('p', { class: 'lead' }, steps
          ? `Step ${current + 1} of ${STEPS.length}. Changes save automatically on this device. Leave anything that doesn\u2019t apply blank.`
          : 'Enter your numbers once \u2014 every screen uses them. Changes save automatically on this device. Blank boxes count as \u00a30.'),
        h('span', { class: 'mode-links' },
          h('button', { type: 'button', class: 'link', onclick: () => setMode(steps ? 'all' : 'steps') },
            steps ? 'Show everything on one page' : 'Go step by step'),
          h('button', { type: 'button', class: 'link', onclick: () => setMode('quick') }, 'Quick start')));
      groups.forEach((g, i) => { g.hidden = steps && i !== current; });
      calc.hidden = steps;
      footer.hidden = !steps;
      if (steps) {
        const last = current === STEPS.length - 1;
        const missing = stepMissing(STEPS[current], pp);
        FP.dom.fill(footer,
          missing.length ? h('p', { class: 'notice info' }, `Still needed for your projection: ${missing.map((m) => m.label.replace(/^Your /, 'your ')).join(' and ')}.`) : null,
          h('div', { class: 'button-row' },
            current > 0 ? h('button', { type: 'button', class: 'secondary', onclick: () => { markVisited(current); show(current - 1, true); } }, 'Back') : null,
            last
              ? h('button', { type: 'button', onclick: () => { markVisited(current); calculate(ctx, root); } }, 'See my plan')
              : h('button', { type: 'button', onclick: () => { markVisited(current); show(current + 1, true); } }, `Next: ${STEPS[current + 1].title}`)));
      }
    }

    FP.dom.add(root, h('h1', null, 'Setup'), intro, nav, groups, footer, calc);

    // A link to a field in another step (e.g. from Overview's checklist) opens that step.
    root.addEventListener('fp:reveal', (e) => {
      const g = e.target.closest('[data-step]');
      const i = g ? STEPS.findIndex((st) => st.id === g.dataset.step) : -1;
      if (mode === 'steps' && i >= 0 && i !== current) show(i, false);
    });

    const strip = liveStrip(ctx, root);
    let timer = null;
    const refresh = (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!leftover.contains(e.target)) leftover.refresh();
        strip.refresh();
        // Step ticks and the "still needed" note follow what you've entered.
        if (!nav.contains(e.target) && !footer.contains(e.target)) draw();
      }, 200);
    };
    root.addEventListener('input', refresh);
    root.addEventListener('change', refresh);
    root.addEventListener('click', refresh);
    root.appendChild(strip);
    draw();
  }

  // Shows the result of what you've entered so far, pinned above the tabs.
  function liveStrip(ctx, root) {
    const figures = h('p', { class: 'live-figures', role: 'status', 'aria-live': 'polite' });
    const strip = h('div', { class: 'live-strip', role: 'group', 'aria-label': 'Each month, from what you\u2019ve entered' }, figures,
      h('button', { type: 'button', class: 'small', onclick: () => calculate(ctx, root) }, 'See my plan'));
    strip.refresh = () => {
      const p = ctx.profile();
      const pay = FP.tax.forProfile(p);
      const left = FP.summary.compute(p, pay.takeHomeMonthly).cashFlow.surplus;
      FP.dom.fill(figures,
        h('span', null, h('small', null, 'Take-home'), h('strong', null, money(pay.takeHomeMonthly))),
        h('span', null, h('small', null, left < 0 ? 'Short by' : 'Left over'), h('strong', { class: left < 0 ? 'negative' : null }, money(Math.abs(left || 0)))));
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
        h('p', { class: 'muted' }, 'What you typically spend in a month. One total is fine, or add categories if it helps you work it out. Don\u2019t include your mortgage or debt payments \u2014 those are added from above.'),
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
