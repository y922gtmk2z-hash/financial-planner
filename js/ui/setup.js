/*
 * Your figures: enter your numbers once, in five sections: About you, Income,
 * Outgoings, Assets and Debts. Each asks the essentials first, with detail
 * folded away (under Income, everything beyond your salary is under
 * Advanced). Every field writes straight into the shared profile.
 */
(function (FP) {
  'use strict';

  const { h, money } = FP.dom;
  const P = FP.profile;

  // A first-time visitor goes section by section; you can switch to
  // everything on one page at any time.
  // summary(p): one line for the section's heading on the one-page view.
  const sum = (list, key) => (list || []).reduce((t, x) => t + (x[key] || 0), 0);
  const STEPS = [
    { id: 'you', title: 'About you', short: 'About you',
      summary: (p) => `Age ${p.about.age == null ? '\u2014' : p.about.age} \u00b7 retire at ${p.assumptions.retirementAge}` },
    { id: 'income', title: 'Income', short: 'Income',
      summary: (p) => {
        const extras = INCOME_PARTS.filter((part) => part.id !== 'pension' && part.status(p)).length;
        return [p.income.grossSalary > 0 ? `${money(p.income.grossSalary)} salary` : 'No salary', extras ? `${extras} extra${extras === 1 ? '' : 's'}` : null].filter(Boolean).join(' \u00b7 ');
      } },
    { id: 'outgoings', title: 'Outgoings', short: 'Outgoings',
      summary: (p) => [`${money(sum(p.spending, 'monthly'))} a month`, sum(p.savings, 'monthly') > 0 ? `${money(sum(p.savings, 'monthly'))} saved` : null].filter(Boolean).join(' \u00b7 ') },
    { id: 'assets', title: 'Assets', short: 'Assets',
      summary: (p) => { const t = Object.values(p.assets).reduce((a, v) => a + (v || 0), 0); return t > 0 ? money(t) : 'None added'; } },
    { id: 'debts', title: 'Debts', short: 'Debts',
      summary: (p) => { const t = (p.mortgage.balance || 0) + sum(p.debts, 'balance'); return t > 0 ? `${money(t)} owed` : 'None added'; } },
  ];

  // Steps that need something before a projection can be shown.
  function stepMissing(step, p) {
    const ids = { you: ['age'], outgoings: ['spending'] }[step.id] || [];
    return FP.summary.checklist(p).blocking.filter((i) => ids.includes(i.id));
  }

  const section = (id) => P.SECTIONS.find((sec) => sec.id === id);

  // Fields that only matter once something else is set (e.g. a student loan's
  // balance once you've chosen a plan) stay hidden until then.
  const NEEDS = {
    plan: (p) => p.income.studentLoanPlan !== 'none',
    mortgage: (p) => p.mortgage.balance > 0,
  };
  function showNeeded(root, p) {
    Object.entries(NEEDS).forEach(([k, test]) => {
      root.querySelectorAll(`[data-needs="${k}"]`).forEach((el) => { el.hidden = !test(p); });
    });
  }

  function maker(ctx) {
    return (f) => {
      // The tax code says what it means as you type.
      const note = f.type === 'taxcode' ? h('p', { class: 'help tax-code-note', role: 'status' }) : null;
      const explain = () => { if (note) note.textContent = FP.tax.describeTaxCode(P.get(ctx.profile(), f.path)); };
      explain();
      const el = FP.field.render(f, {
        value: P.get(ctx.profile(), f.path),
        nullPlaceholder: f.nullPlaceholder,
        onChange: (v) => { ctx.update(f.path, v); explain(); },
        extra: note,
      });
      const needs = f.needsPlan ? 'plan' : f.needsMortgage ? 'mortgage' : null;
      if (needs) {
        el.dataset.needs = needs;
        el.hidden = !NEEDS[needs](ctx.profile());
      }
      return el;
    };
  }

  // A group's fields, with any `more` fields folded under "More".
  function groupFields(sec, id, make) {
    const fields = sec.fields.filter((f) => f.group === id);
    const more = fields.filter((f) => f.more);
    const intro = P.FIELD_GROUPS[id].intro;
    return [
      intro ? h('p', { class: 'help' }, intro) : null,
      fields.filter((f) => !f.more).map(make),
      more.length ? h('details', { class: 'advanced' }, h('summary', null, 'More'), more.map(make)) : null,
    ];
  }

  // A group under its own heading (Debts: the mortgage).
  function group(sec, id, make) {
    return h('div', { class: 'field-group', role: 'group', 'aria-labelledby': `grp-${id}` },
      h('h3', { id: `grp-${id}` }, P.FIELD_GROUPS[id].title),
      groupFields(sec, id, make));
  }

  // About you: what the quick start asked, plus how you feel about risk.
  function aboutCard(ctx) {
    return h('section', { class: 'card', id: 'about', 'aria-labelledby': 'sec-about' },
      h('h2', { id: 'sec-about' }, 'About you'),
      section('about').fields.map(maker(ctx)));
  }

  /*
   * The parts of Advanced under Income. Each folds away on its own, and its
   * heading says what you've entered so you can see it at a glance.
   * status(p): a short summary, or '' when nothing is set.
   */
  const pct = (n) => `${Number(n || 0)}%`;
  const count = (list, one, many) => (list.length ? `${list.length} ${list.length === 1 ? one : many}` : '');
  const INCOME_PARTS = [
    { id: 'pension', title: 'Workplace pension', group: 'pension',
      status: (p) => `${pct(p.assumptions.employeePensionPct)} + ${pct(p.assumptions.employerPensionPct)} employer` },
    { id: 'studentLoan', title: 'Student loan', group: 'studentLoan',
      status: (p) => (p.income.studentLoanPlan === 'none' ? '' : P.STUDENT_LOAN_PLANS.find((x) => x.value === p.income.studentLoanPlan).label) },
    { id: 'bonus', title: 'Bonuses', editor: () => FP.bonusEditor,
      status: (p) => count(p.income.bonuses, 'bonus', 'bonuses') },
    { id: 'sacrifice', title: 'Salary sacrifice', editor: () => FP.sacrificeEditor,
      status: (p) => count(p.income.sacrifices, 'scheme', 'schemes') },
    { id: 'benefit', title: 'Workplace benefits', editor: () => FP.benefitsEditor,
      status: (p) => count(p.income.benefits || [], 'benefit', 'benefits') },
    { id: 'tax', title: 'Tax code and where you live', group: 'tax',
      status: (p) => [p.income.taxCode, p.income.region === 'scotland' ? 'Scotland' : ''].filter(Boolean).join(', ') },
    { id: 'otherIncome', title: 'Other income', group: 'otherIncome',
      status: (p) => (p.income.otherIncome > 0 || p.income.taxFreeIncome > 0 ? `${money((p.income.otherIncome || 0) + (p.income.taxFreeIncome || 0))} a year` : '') },
  ];

  // Whether you've given any pay details beyond your salary and the default pension.
  function hasPayDetail(p) {
    const d = FP.assumptions.defaults();
    return INCOME_PARTS.some((part) => part.id !== 'pension' && part.status(p))
      || p.assumptions.employeePensionPct !== d.employeePensionPct || p.assumptions.employerPensionPct !== d.employerPensionPct
      || p.income.pensionMethod !== 'netPay';
  }

  // Income: your salary, and everything else about your pay under Advanced.
  function incomeCard(ctx) {
    const p = ctx.profile();
    const sec = section('income');
    const make = maker(ctx);
    const statuses = [];
    const parts = INCOME_PARTS.map((part) => {
      const status = h('span', { class: 'part-status' });
      const draw = () => { status.textContent = part.status(ctx.profile()); };
      draw();
      statuses.push(draw);
      return h('details', { class: 'part', id: part.group === 'otherIncome' ? 'other-income' : `part-${part.id}` },
        h('summary', null, h('span', { id: `${part.id}-h` }, part.title), status),
        part.group ? groupFields(sec, part.group, make) : part.editor().render(ctx));
    });
    const card = h('section', { class: 'card', id: 'income', 'aria-labelledby': 'sec-income' },
      h('h2', { id: 'sec-income' }, 'Income'),
      sec.fields.filter((f) => !f.group).map(make),
      h('details', { class: 'advanced more-details', id: 'pay-details', open: hasPayDetail(p) || null },
        h('summary', null, 'Advanced: pension, student loan, bonuses and more'),
        h('p', { class: 'help' }, 'Optional. Leave this closed if you only want to give your salary: a 5% pension with 3% from your employer is assumed.'),
        h('div', { class: 'parts' }, parts)));
    card.refreshStatus = () => statuses.forEach((d) => d());
    return card;
  }

  // Outgoings: one spending question (split it up if you like), then regular
  // savings; your leftover money follows as its own card.
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
        single
          ? FP.field.render({ path: 'spending.0.monthly', label: 'What you spend in a month', type: 'money', suffix: 'a month',
            help: 'Everything apart from your mortgage and debt payments (those go under Debts). A rough total is fine.' }, {
            value: p.spending[0].monthly,
            onChange: (v) => { ctx.update('spending.0.monthly', v); updateTotal(); },
          })
          : [
            h('h3', null, 'What you spend in a month'),
            h('p', { class: 'help' }, 'Everything apart from your mortgage and debt payments (those go under Debts).'),
            h('div', { class: 'spend-list' }, p.spending.map((r, i) => {
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
          ],
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
      h('h2', { id: 'sec-spend' }, 'Outgoings'),
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
      h('details', { class: 'advanced' }, h('summary', null, 'Other investments and assets'), sec.fields.filter((f) => f.advanced).map(make)));
  }

  /*
   * What a loan's figures need saying beyond the worked-out value, which shows
   * in its own box: figures that don't add up, a payment that never clears
   * it, a rate that had to be assumed, or a prompt for more. '' if nothing.
   * `yearly` describes the rate: '% APR' or '% a year'.
   */
  function loanNote(loan, yearly) {
    if (!(loan.balance > 0)) return '';
    if (loan.error) return loan.error;
    const rate = `${Math.round(loan.rate * 10) / 10}${yearly}`;
    if (loan.months === Infinity) return `At this payment it’s never paid off: the payment doesn’t cover the interest${loan.rateIsDefault ? ` (at an assumed ${rate})` : ''}.`;
    if (loan.worked && loan.rateIsDefault) return `Worked out using an assumed ${rate}. Add your rate if you know it.`;
    if (!(loan.payment > 0)) return 'Give any two of monthly payment, time left and interest rate, and the third is worked out.';
    return '';
  }

  // The worked-out value shown in its empty box (as the placeholder).
  function showWorked(scope, loan, paths) {
    const wrap = (key) => {
      const field = scope.querySelector(`[data-path="${CSS.escape(paths[key])}"]`);
      return field && { field, input: field.querySelector('input'), box: field.querySelector('.input-wrap') };
    };
    Object.keys(paths).forEach((key) => {
      const w = wrap(key);
      if (!w || !w.input) return;
      const worked = loan.balance > 0 && loan.worked === key && Number.isFinite(loan[key]);
      if (!w.input.dataset.placeholder) w.input.dataset.placeholder = w.input.placeholder;
      let text = w.input.dataset.placeholder;
      if (worked && key === 'rate') text = `≈ ${Math.round(loan.rate * 10) / 10} · worked out`;
      if (worked && key === 'payment') text = `≈ ${Math.round(loan.payment).toLocaleString('en-GB')} · worked out`;
      if (worked && key === 'months') {
        const unit = w.field.querySelector('select.term-unit');
        const n = unit && unit.value === 'months' ? Math.ceil(loan.months) : Math.round((loan.months / 12) * 10) / 10;
        text = `≈ ${n} · worked out`;
      }
      w.input.placeholder = text;
      w.box.classList.toggle('worked', worked);
    });
  }

  // "£7,800 · £245 a month · about 3 years left": a loan folded to one line.
  function loanSummary(loan) {
    if (!(loan.balance > 0)) return 'Not added';
    const left = loan.months === Infinity ? 'never paid off' : loan.months > 0 ? `${FP.dom.months(Math.ceil(loan.months))} left` : null;
    return [money(loan.balance), loan.payment > 0 ? `${money(loan.payment)} a month` : null, left].filter(Boolean).join(' · ');
  }

  /*
   * Debts: the mortgage and each other debt fold to a one-line summary once
   * they have a balance (open while empty, so a new one is ready to fill in).
   */
  function debtsCard(ctx) {
    const sec = section('debts');
    const make = maker(ctx);
    // One loan's fold: its summary line, the note and worked-out boxes kept up to date.
    // Returns { fold, draw }.
    const loanFold = (id, title, body, get, paths, yearly) => {
      const sum = h('span', { class: 'part-status' });
      const note = h('p', { class: 'help loan-note', role: 'status' });
      const fold = h('details', { class: 'part', id }, h('summary', null, h('span', null, title()), sum), body, note);
      const draw = () => {
        const loan = get();
        sum.textContent = loanSummary(loan);
        note.textContent = loanNote(loan, yearly);
        note.hidden = !note.textContent;
        showWorked(fold, loan, paths);
      };
      fold.open = !(get().balance > 0);
      return { fold, draw };
    };

    const mortgagePaths = { rate: 'assumptions.mortgageRate', payment: 'mortgage.monthlyPayment', months: 'mortgage.remainingTermYears' };
    const mortgage = loanFold('mortgage-item', () => 'Mortgage',
      [sec.fields.filter((f) => f.group === 'mortgage' && !f.more).map(make),
        h('details', { class: 'advanced' }, h('summary', null, 'Overpayments'), sec.fields.filter((f) => f.group === 'mortgage' && f.more).map(make))],
      () => FP.loan.forMortgage(ctx.profile()), mortgagePaths, '% a year');
    let debtDraws = [];

    const others = h('div', { class: 'field-group', role: 'group', 'aria-labelledby': 'grp-otherDebts', id: 'other-debts' });
    const drawOthers = () => {
      const p = ctx.profile();
      const folds = p.debts.map((d, i) => {
        const paths = { rate: `debts.${i}.rate`, payment: `debts.${i}.monthlyPayment`, months: `debts.${i}.termMonths` };
        const name = () => (ctx.profile().debts[i] || {}).name || `Debt ${i + 1}`;
        const { fold, draw } = loanFold(`debt-${d.id}`, name,
          [P.DEBT_FIELDS.map((f) => FP.field.render({ ...f, path: `debts.${i}.${f.key}` }, {
            value: d[f.key],
            nullPlaceholder: 'Not sure',
            onChange: (v) => {
              ctx.update(`debts.${i}.${f.key}`, v);
              if (f.key === 'name') fold.querySelector('summary > span').textContent = name();
            },
          })),
          h('button', { type: 'button', class: 'link danger', onclick: () => { p.debts.splice(i, 1); ctx.changed(); drawOthers(); } }, 'Remove this debt')],
          () => FP.loan.forDebt(ctx.profile().debts[i] || {}, ctx.profile().assumptions), paths, '% APR');
        return { fold, draw };
      });
      FP.dom.fill(others,
        h('h3', { id: 'grp-otherDebts' }, 'Other debts'),
        h('p', { class: 'help' }, 'Loans, car finance, credit cards.'),
        folds.length ? h('div', { class: 'parts' }, folds.map((x) => x.fold)) : null,
        h('button', { type: 'button', class: 'secondary', onclick: () => { p.debts.push(P.newDebt()); ctx.changed(); drawOthers(); } }, '+ Add a debt'));
      debtDraws = folds.map((x) => x.draw);
      debtDraws.forEach((d) => d());
    };
    drawOthers();
    const card = h('section', { class: 'card', id: 'debts', 'aria-labelledby': 'sec-debts' },
      h('h2', { id: 'sec-debts' }, 'Debts'),
      h('p', { class: 'muted' }, `${sec.intro} For each, give the balance and any two of monthly payment, time left and interest rate: the third is worked out.`),
      h('div', { class: 'parts' }, mortgage.fold),
      others);
    mortgage.draw();
    card.refreshNotes = () => [mortgage.draw, ...debtDraws].forEach((d) => d());
    return card;
  }

  function render(root, ctx) {
    const saved = FP.store.pref('setupMode');
    // Section by section unless you've chosen the one-page view.
    let mode = saved === 'all' ? 'all' : 'steps';
    let current = Math.min(STEPS.length - 1, Number(FP.store.pref('setupStep')) || 0);
    const visited = new Set((FP.store.pref('setupVisited') || '').split(',').filter(Boolean));

    const leftover = FP.leftoverCard.render(ctx, { id: 'leftover', fold: true });
    const income = incomeCard(ctx);
    const debts = debtsCard(ctx);
    const groups = [
      [aboutCard(ctx)],
      [income],
      [spendCard(ctx), leftover],
      [assetsCard(ctx)],
      [debts],
    ].map((cards, i) => h('div', { class: 'setup-step', 'data-step': STEPS[i].id }, cards));
    // On the one-page view each section folds to a heading with a summary; one is open at a time.
    let openAll = current;
    const heads = STEPS.map((st, i) => {
      const head = h('button', { type: 'button', class: 'step-head', 'aria-expanded': 'false',
        onclick: () => { openAll = openAll === i ? -1 : i; draw(); head.scrollIntoView({ block: 'nearest' }); } });
      groups[i].prepend(head);
      return head;
    });
    const nav = h('nav', { class: 'step-nav', 'aria-label': 'Your figures sections' });
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
      root.classList.toggle('one-page', !steps);
      heads.forEach((head, i) => {
        const open = !steps && openAll === i;
        head.hidden = steps;
        head.setAttribute('aria-expanded', String(open));
        FP.dom.fill(head, h('span', { class: 'fold-title' }, STEPS[i].title), h('span', { class: 'fold-sum' }, STEPS[i].summary(pp)));
        [...groups[i].children].forEach((el) => { if (el !== head) el.hidden = !steps && !open; });
      });
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

    FP.dom.add(root, h('h1', null, 'Your figures'), intro, nav, groups, footer, calc);

    // A link to a field in another section (e.g. from Your plan's checklist) opens that section.
    root.addEventListener('fp:reveal', (e) => {
      const g = e.target.closest('[data-step]');
      const i = g ? STEPS.findIndex((st) => st.id === g.dataset.step) : -1;
      if (mode === 'steps' && i >= 0 && i !== current) show(i, false);
      if (mode === 'all' && i >= 0 && i !== openAll) { openAll = i; draw(); }
    });

    const strip = liveStrip(ctx, root);
    let timer = null;
    const refresh = (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!leftover.contains(e.target)) leftover.refresh();
        strip.refresh();
        income.refreshStatus();
        debts.refreshNotes();
        showNeeded(root, ctx.profile());
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

  // Opens the step (and any folded sections) a box is in, then puts you in it.
  function reveal(el) {
    el.dispatchEvent(new CustomEvent('fp:reveal', { bubbles: true }));
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    const input = el.matches('input, select') ? el : el.querySelector('input, select') || el;
    input.focus();
    input.scrollIntoView({ block: 'center' });
  }

  function calculate(ctx, root) {
    // It may be in a step you've moved on from, so open that step first.
    const bad = root.querySelector('[aria-invalid="true"]');
    if (bad) {
      reveal(bad);
      ctx.toast('Fix the highlighted box first.');
      return;
    }
    // Without these, Your plan goes back to the quick start, so point to them here.
    const missing = FP.summary.checklist(ctx.profile()).blocking;
    if (missing.length) {
      const t = missing[0].target;
      const el = root.querySelector(`[data-path="${CSS.escape(t)}"]`) || root.querySelector(`#${CSS.escape(t)}`);
      if (el) reveal(el);
      ctx.toast(`Add ${missing.map((i) => i.label.toLowerCase()).join(' and ')} first.`);
      return;
    }
    ctx.go('overview');
  }

  // Changes save as you type; this takes you to your plan.
  function calculateCard(ctx, root) {
    return h('section', { class: 'card calculate', 'aria-label': 'See my plan' },
      h('button', { type: 'button', class: 'calculate-btn', onclick: () => calculate(ctx, root) }, 'See my plan'),
      h('p', { class: 'help' }, 'Your figures save as you type. You can come back to Your figures at any time from the top of the screen.'));
  }

  FP.screens = FP.screens || {};
  FP.screens.setup = { title: 'Your figures', render };
})(globalThis.FP = globalThis.FP || {});
