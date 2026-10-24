/*
 * Setup: enter your numbers once, in four sections: About you, What you spend
 * and save, Assets and Debts. Each asks the essentials first, with more detail
 * folded away. Every field writes straight into the shared profile.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const P = FP.profile;

  // A first-time visitor goes section by section; you can switch to
  // everything on one page at any time.
  const STEPS = [
    { id: 'you', title: 'About you', short: 'You' },
    { id: 'spend', title: 'What you spend and save', short: 'Spend & save' },
    { id: 'assets', title: 'Assets', short: 'Assets' },
    { id: 'debts', title: 'Debts', short: 'Debts' },
  ];

  // Steps that need something before a projection can be shown.
  function stepMissing(step, p) {
    const ids = { you: ['age'], spend: ['spending'] }[step.id] || [];
    return FP.summary.checklist(p).blocking.filter((i) => ids.includes(i.id));
  }

  const section = (id) => P.SECTIONS.find((sec) => sec.id === id);

  function maker(ctx) {
    return (f) => {
      // The tax code says what it means as you type.
      const note = f.type === 'taxcode' ? h('p', { class: 'help tax-code-note', role: 'status' }) : null;
      const explain = () => { if (note) note.textContent = FP.tax.describeTaxCode(P.get(ctx.profile(), f.path)); };
      explain();
      return FP.field.render(f, {
        value: P.get(ctx.profile(), f.path),
        nullPlaceholder: f.nullPlaceholder,
        onChange: (v) => { ctx.update(f.path, v); explain(); },
        extra: note,
      });
    };
  }

  // A group's fields under its heading, with any `more` fields folded under "More".
  function group(sec, id, make, extra) {
    const g = P.FIELD_GROUPS[id];
    const fields = sec.fields.filter((f) => f.group === id);
    const main = fields.filter((f) => !f.more);
    const more = fields.filter((f) => f.more);
    return h('div', { class: 'field-group', role: 'group', 'aria-labelledby': `grp-${id}` },
      h('h3', { id: `grp-${id}` }, g.title),
      g.intro ? h('p', { class: 'help' }, g.intro) : null,
      main.map(make),
      more.length ? h('details', { class: 'advanced' }, h('summary', null, 'More'), more.map(make)) : null,
      extra || null);
  }

  // Whether you've given any pay details beyond your salary (to open that part).
  function hasPayDetail(p) {
    const inc = p.income;
    return inc.bonuses.length > 0 || inc.sacrifices.length > 0 || (inc.benefits || []).length > 0
      || (inc.otherIncome || 0) > 0 || (inc.taxFreeIncome || 0) > 0
      || inc.region === 'scotland' || inc.pensionMethod !== 'netPay';
  }

  // About you: age, retirement target and salary; everything else about your pay folded away.
  function aboutCard(ctx) {
    const p = ctx.profile();
    const sec = section('about');
    const make = maker(ctx);
    const pay = P.FIELD_GROUPS.pay;
    const other = P.FIELD_GROUPS.otherIncome;
    return h('section', { class: 'card', id: 'about', 'aria-labelledby': 'sec-about' },
      h('h2', { id: 'sec-about' }, 'About you'),
      sec.fields.filter((f) => !f.group).map(make),
      h('details', { class: 'advanced more-details', id: 'pay-details', open: hasPayDetail(p) || null },
        h('summary', null, pay.title),
        h('p', { class: 'help' }, pay.intro),
        sec.fields.filter((f) => f.group === 'pay').map(make),
        FP.bonusEditor.render(ctx),
        FP.sacrificeEditor.render(ctx),
        FP.benefitsEditor.render(ctx),
        h('div', { class: 'field-group', role: 'group', 'aria-labelledby': 'grp-otherIncome', id: 'other-income' },
          h('h3', { id: 'grp-otherIncome' }, other.title),
          h('p', { class: 'help' }, other.intro),
          sec.fields.filter((f) => f.group === 'otherIncome').map(make))));
  }

  // What you spend and save: one spending question (split it up if you like),
  // then regular savings; your leftover money follows as its own card.
  function spendCard(ctx) {
    const card = h('section', { class: 'card', id: 'spending', 'aria-labelledby': 'sec-spend' });
    const spend = h('div', { class: 'spend-part' });
    const total = h('strong');
    const updateTotal = () => {
      total.textContent = `${money(ctx.profile().spending.reduce((t, r) => t + (r.monthly || 0), 0))} a month`;
    };
    const drawSpend = () => {
      const p = ctx.profile();
      const single = p.spending.length <= 1;
      if (!p.spending.length) p.spending.push(P.newSpending());
      FP.dom.fill(spend,
        h('h3', null, 'What you spend'),
        h('p', { class: 'help' }, 'What you typically spend in a month, apart from your mortgage and debt payments (those come from Debts). A rough total is fine.'),
        single
          ? FP.field.render({ path: 'spending.0.monthly', label: 'What you spend in a month', type: 'money', suffix: 'a month' }, {
            value: p.spending[0].monthly,
            onChange: (v) => { ctx.update('spending.0.monthly', v); updateTotal(); },
          })
          : h('div', { class: 'spend-list' }, p.spending.map((r, i) => {
            // Each row's labels are hidden, so name the inputs after the category.
            const amountName = (cat) => `${cat || `Category ${i + 1}`} amount per month`;
            const amount = FP.field.render(P.SPENDING_FIELDS[1], {
              value: r.monthly, compact: true, ariaLabel: amountName(r.category),
              onChange: (v) => { ctx.update(`spending.${i}.monthly`, v); updateTotal(); },
            });
            return h('div', { class: 'spend-row' },
              FP.field.render(P.SPENDING_FIELDS[0], {
                value: r.category, compact: true, ariaLabel: `Category name ${i + 1}`,
                onChange: (v) => { ctx.update(`spending.${i}.category`, v); amount.querySelector('input').setAttribute('aria-label', amountName(v)); },
              }),
              amount,
              h('button', {
                type: 'button', class: 'icon-btn', 'aria-label': `Remove ${r.category || 'this category'}`,
                onclick: () => { p.spending.splice(i, 1); ctx.changed(); drawSpend(); },
              }, '×'));
          })),
        h('button', {
          type: 'button', class: single ? 'link' : 'secondary',
          onclick: () => {
            // Splitting one total: keep it as the first category.
            if (single && p.spending[0] && (!p.spending[0].category || p.spending[0].category === 'Everything')) p.spending[0].category = 'Everything else';
            p.spending.push(P.newSpending());
            ctx.changed();
            drawSpend();
            const rows = spend.querySelectorAll('.spend-row input[type="text"]:not([inputmode])');
            if (rows.length) rows[rows.length - 1].focus();
          },
        }, single ? '+ Split it into categories' : '+ Add a category'),
        single ? null : h('div', { class: 'total-row' }, h('span', null, 'Total spending'), total));
      updateTotal();
    };
    drawSpend();
    FP.dom.fill(card,
      h('h2', { id: 'sec-spend' }, 'What you spend and save'),
      spend,
      FP.savingsEditor.render(ctx, { embedded: true }));
    return card;
  }

  function assetsCard(ctx) {
    const sec = section('assets');
    const make = maker(ctx);
    return h('section', { class: 'card', id: 'assets', 'aria-labelledby': 'sec-assets' },
      h('h2', { id: 'sec-assets' }, 'Assets'),
      h('p', { class: 'muted' }, sec.intro),
      sec.fields.filter((f) => !f.advanced).map(make),
      h('details', { class: 'advanced' }, h('summary', null, 'More'), sec.fields.filter((f) => f.advanced).map(make)));
  }

  function debtsCard(ctx) {
    const sec = section('debts');
    const make = maker(ctx);
    const others = h('div', { class: 'field-group', role: 'group', 'aria-labelledby': 'grp-otherDebts', id: 'other-debts' });
    const drawOthers = () => {
      const p = ctx.profile();
      FP.dom.fill(others,
        h('h3', { id: 'grp-otherDebts' }, 'Other debts'),
        h('p', { class: 'help' }, 'Loans, car finance, credit cards. Leave the rate blank to use the default in Assumptions.'),
        p.debts.length ? null : h('p', { class: 'empty' }, 'No other debts added.'),
        p.debts.map((d, i) => h('fieldset', { class: 'row-card' },
          h('legend', null, d.name || `Debt ${i + 1}`),
          P.DEBT_FIELDS.map((f) => FP.field.render(f, {
            value: d[f.key],
            compact: f.key !== 'rate',
            nullPlaceholder: `Default ${p.assumptions.otherDebtRate}%`,
            onChange: (v) => ctx.update(`debts.${i}.${f.key}`, v),
          })),
          h('button', { type: 'button', class: 'link danger', onclick: () => { p.debts.splice(i, 1); ctx.changed(); drawOthers(); } }, 'Remove this debt'))),
        h('button', { type: 'button', class: 'secondary', onclick: () => { p.debts.push(P.newDebt()); ctx.changed(); drawOthers(); } }, '+ Add a debt'));
    };
    drawOthers();
    return h('section', { class: 'card', id: 'debts', 'aria-labelledby': 'sec-debts' },
      h('h2', { id: 'sec-debts' }, 'Debts'),
      h('p', { class: 'muted' }, sec.intro),
      group(sec, 'mortgage', make),
      group(sec, 'studentLoan', make),
      others);
  }

  function render(root, ctx) {
    const p = ctx.profile();
    const saved = FP.store.pref('setupMode');
    let mode = saved === 'all' || saved === 'steps' ? saved : (FP.summary.checklist(p).ready ? 'all' : 'steps');
    let current = Math.min(STEPS.length - 1, Number(FP.store.pref('setupStep')) || 0);
    const visited = new Set((FP.store.pref('setupVisited') || '').split(',').filter(Boolean));

    const leftover = FP.leftoverCard.render(ctx, { id: 'leftover' });
    const groups = [
      [aboutCard(ctx)],
      [spendCard(ctx), leftover],
      [assetsCard(ctx)],
      [debtsCard(ctx)],
    ].map((cards, i) => h('div', { class: 'setup-step', 'data-step': STEPS[i].id }, cards));
    const nav = h('nav', { class: 'step-nav', 'aria-label': 'Setup sections' });
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
        const heading = groups[current].querySelector('h2');
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }

    function setMode(m) {
      mode = m;
      FP.store.pref('setupMode', m);
      draw();
      window.scrollTo(0, 0);
    }

    function draw() {
      const steps = mode === 'steps';
      const pp = ctx.profile();
      FP.dom.fill(nav, h('ol', null, STEPS.map((st, i) => {
        const missing = stepMissing(st, pp);
        // Ticked once you've been to a section (and it has what the projection needs).
        const state = !visited.has(st.id) ? '' : missing.length ? 'todo' : 'done';
        const target = groups[i].querySelector('h2').closest('section').id;
        return h('li', null, h('a', {
          href: `#setup/${target}`,
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
          ? `${current + 1} of ${STEPS.length}. Changes save automatically on this device. Leave anything that doesn’t apply blank.`
          : 'Changes save automatically on this device. Blank boxes count as £0.'),
        h('button', { type: 'button', class: 'link', onclick: () => setMode(steps ? 'all' : 'steps') },
          steps ? 'Show everything on one page' : 'Go section by section'));
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

    const quick = FP.summary.checklist(p).ready ? null : FP.welcome.quickStart(ctx, root);
    FP.dom.add(root, h('h1', null, 'Setup'), quick, intro, nav, groups, footer, calc);

    // A link to a field in another section (e.g. from Your plan's checklist) opens that section.
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
        // Typing in a section counts as having been there.
        const g = e.target.closest && e.target.closest('[data-step]');
        if (g && e.type !== 'click') {
          visited.add(g.dataset.step);
          FP.store.pref('setupVisited', [...visited].join(','));
        }
        // Step ticks and the "still needed" note follow what you've entered.
        if (!nav.contains(e.target) && !footer.contains(e.target)) draw();
      }, 200);
    };
    root.addEventListener('input', refresh);
    root.addEventListener('change', refresh);
    root.addEventListener('click', refresh);
    root.appendChild(strip);
    draw();

    // On the one-page view, a section counts as visited once you've scrolled to it.
    if (typeof IntersectionObserver === 'function') {
      const seen = new IntersectionObserver((entries) => {
        if (mode !== 'all') return;
        let changed = false;
        entries.forEach((e) => {
          const id = e.target.dataset.step;
          if (e.isIntersecting && !visited.has(id)) {
            visited.add(id);
            changed = true;
          }
        });
        if (changed) {
          FP.store.pref('setupVisited', [...visited].join(','));
          draw();
        }
      }, { rootMargin: '-45% 0px -45% 0px' }); // when it crosses the middle of the screen
      groups.forEach((g) => seen.observe(g));
    }
  }

  // Shows the result of what you've entered so far, pinned above the tabs.
  function liveStrip(ctx, root) {
    const figures = h('p', { class: 'live-figures', role: 'status', 'aria-live': 'polite' });
    const strip = h('div', { class: 'live-strip', role: 'group', 'aria-label': 'Each month, from what you’ve entered' }, figures,
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
      bad.closest('details') && (bad.closest('details').open = true);
      bad.focus();
      bad.scrollIntoView({ block: 'center' });
      ctx.toast('Fix the highlighted box first.');
      return;
    }
    ctx.go('overview');
  }

  // Changes save as you type; this takes you to your plan.
  function calculateCard(ctx, root) {
    return h('section', { class: 'card calculate', 'aria-label': 'See my plan' },
      h('button', { type: 'button', class: 'calculate-btn', onclick: () => calculate(ctx, root) }, 'See my plan'),
      h('p', { class: 'help' }, 'Your figures save as you type. You can come back to Setup at any time from the top of the screen.'));
  }

  FP.screens = FP.screens || {};
  FP.screens.setup = { title: 'Setup', render };
})(globalThis.FP = globalThis.FP || {});
