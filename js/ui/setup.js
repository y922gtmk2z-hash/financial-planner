/*
 * Your figures: enter your numbers once, in five sections: About you, Income,
 * Outgoings (bills, debt payments and other), Assets and Debts. Each asks the essentials first, with detail
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
      summary: (p) => [`${money(FP.summary.outgoings(p).total)} a month`, sum(p.savings, 'monthly') > 0 ? `${money(sum(p.savings, 'monthly'))} saved` : null].filter(Boolean).join(' \u00b7 ') },
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
        check: FP.welcome.senseCheck(f.path, ctx.profile),
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

  // Kept in the profile, but not asked until a later version uses it.
  const HIDDEN = ['about.riskAppetite'];

  // About you: what the quick start asked.
  function aboutCard(ctx) {
    return h('section', { class: 'card', id: 'about', 'aria-labelledby': 'sec-about' },
      h('h2', { id: 'sec-about' }, 'About you'),
      section('about').fields.filter((f) => !HIDDEN.includes(f.path)).map(maker(ctx)));
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

  /*
   * Outgoings: your estimate of everything going out, then three folds to
   * itemise it: bills, debt payments and other spending. Whatever of the
   * estimate isn't itemised yet counts as other spending. Debt payments are
   * the same figures as under Debts, so what you add here shows there too.
   * Regular savings follow; your leftover money follows as its own card.
   * links: { debtsChanged() (redraw Debts), toDebts(path) (go to a box there) }.
   */
  function outgoingsCard(ctx, links) {
    const make = maker(ctx);
    const status = h('p', { class: 'help outgoings-status', role: 'status' });
    const spendTotal = (p, g) => sum(p.spending.filter((r) => !r.rest && r.group === g), 'monthly');
    const fold = (id, title, body) => {
      const st = h('span', { class: 'part-status' });
      return { el: h('details', { class: 'part', id }, h('summary', null, h('span', null, title), st), body), st };
    };

    // Bills and Other: a list of categories each. Removing a row moves the
    // others' places in the list, so both lists are drawn again.
    const restAmount = h('strong');
    const restRow = h('div', { class: 'total-row rest-row' }, h('span', null, 'Rest of your estimate'), restAmount);
    const lists = [
      { group: 'bills', title: 'Bills', example: 'e.g. Council tax', add: '+ Add a bill',
        help: 'Rent, council tax, energy, water, phone and broadband, insurance, subscriptions.' },
      { group: 'other', title: 'Other', example: 'e.g. Groceries', add: '+ Add something else',
        help: 'Food, travel, childcare, eating out, holidays and anything else.' },
    ].map((l) => ({ ...l, body: h('div') }));
    const drawLists = (focusGroup) => {
      const p = ctx.profile();
      lists.forEach((l) => {
        const rows = p.spending.map((r, i) => ({ r, i })).filter(({ r }) => !r.rest && r.group === l.group);
        FP.dom.fill(l.body,
          h('p', { class: 'help' }, l.help),
          rows.length ? h('div', { class: 'spend-list' }, rows.map(({ r, i }) => {
            // Each row's labels are hidden, so name the inputs after the category.
            const amountName = (cat) => `${cat || `${l.title} ${i + 1}`} amount per month`;
            const amount = FP.field.render(P.SPENDING_FIELDS[1], {
              value: r.monthly, compact: true, ariaLabel: amountName(r.category),
              onChange: (v) => ctx.update(`spending.${i}.monthly`, v),
            });
            return h('div', { class: 'spend-row' },
              FP.field.render({ ...P.SPENDING_FIELDS[0], placeholder: l.example }, {
                value: r.category, compact: true, ariaLabel: `${l.title}: name ${i + 1}`,
                onChange: (v) => { ctx.update(`spending.${i}.category`, v); amount.querySelector('input').setAttribute('aria-label', amountName(v)); },
              }),
              amount,
              h('button', {
                type: 'button', class: 'icon-btn', 'aria-label': `Remove ${r.category || 'this one'}`,
                onclick: () => { p.spending.splice(i, 1); ctx.changed(); drawLists(); },
              }, '×'));
          })) : null,
          l.group === 'other' ? restRow : null,
          h('button', {
            type: 'button', class: 'secondary',
            onclick: () => { p.spending.push(P.newSpending(l.group)); ctx.changed(); drawLists(l.group); },
          }, l.add));
      });
      if (focusGroup) {
        const names = lists.find((l) => l.group === focusGroup).body.querySelectorAll('.spend-row input[type="text"]:not([inputmode])');
        if (names.length) names[names.length - 1].focus();
      }
    };

    // Debt payments: your mortgage, and each other debt's name and payment.
    const mortgagePay = { ...P.fieldFor('mortgage.monthlyPayment'), label: 'Mortgage', needsMortgage: false, nullPlaceholder: '0',
      help: 'Your normal monthly payment. Leave blank if you don’t have one.' };
    const pays = h('div');
    const unpaidNote = h('div', { class: 'notice info small', role: 'status' });
    const drawPays = (focus) => {
      const p = ctx.profile();
      FP.dom.fill(pays,
        h('p', { class: 'help' }, 'Your mortgage, loans, car finance and credit cards. They show under Debts too, where you add what’s left to pay.'),
        make(mortgagePay),
        p.debts.length ? h('div', { class: 'spend-list' }, p.debts.map((d, i) => {
          const named = () => (ctx.profile().debts[i] || {}).name || `Debt ${i + 1}`;
          const amount = FP.field.render({ ...P.DEBT_FIELDS.find((f) => f.key === 'monthlyPayment'), suffix: null, path: `debts.${i}.monthlyPayment` }, {
            value: d.monthlyPayment, compact: true, ariaLabel: `${named()}: monthly payment`,
            onChange: (v) => ctx.update(`debts.${i}.monthlyPayment`, v),
          });
          return h('div', { class: 'spend-row' },
            FP.field.render({ ...P.DEBT_FIELDS.find((f) => f.key === 'name'), path: `debts.${i}.name` }, {
              value: d.name, compact: true, ariaLabel: `Debt name ${i + 1}`,
              onChange: (v) => { ctx.update(`debts.${i}.name`, v); amount.querySelector('input').setAttribute('aria-label', `${named()}: monthly payment`); },
            }),
            amount,
            h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': `Remove ${d.name || 'this debt'} (from Debts too)`,
              onclick: () => { p.debts.splice(i, 1); ctx.changed(); drawPays(); links.debtsChanged(); },
            }, '×'));
        })) : null,
        unpaidNote,
        h('button', {
          type: 'button', class: 'secondary',
          onclick: () => { p.debts.push(P.newDebt()); ctx.changed(); drawPays(true); links.debtsChanged(); },
        }, '+ Add a debt payment'));
      if (focus) {
        const names = pays.querySelectorAll('.spend-row input[type="text"]:not([inputmode])');
        if (names.length) names[names.length - 1].focus();
      }
      refresh();
    };

    const bills = fold('out-bills', 'Bills', lists[0].body);
    const debts = fold('out-debts', 'Debt payments', pays);
    const other = fold('out-other', 'Other', lists[1].body);

    // Totals, the rest of your estimate and payments that don't count yet.
    function refresh() {
      const p = ctx.profile();
      const o = FP.summary.outgoings(p);
      const s = FP.summary.compute(p);
      const perMonth = (n) => (n > 0 ? `${money(n)} a month` : 'None added');
      bills.st.textContent = perMonth(spendTotal(p, 'bills'));
      debts.st.textContent = perMonth(s.cashFlow.mortgageMonthly + s.cashFlow.debtMonthly - s.cashFlow.studentLoanExtraMonthly);
      other.st.textContent = perMonth(spendTotal(p, 'other') + o.rest);
      restRow.hidden = o.estimate == null;
      restAmount.textContent = money(o.rest);
      status.textContent = o.estimate == null
        ? (o.itemised > 0 ? `${money(o.itemised)} a month itemised below.` : 'Give an estimate, or itemise what goes out below.')
        : !(o.itemised > 0) ? 'Your estimate counts as other spending until you itemise it below.'
          : o.itemised < o.estimate ? `${money(o.itemised)} itemised below. The other ${money(o.rest)} of your estimate counts as other spending until you itemise it.`
            : o.itemised === o.estimate ? 'Your estimate is all itemised below.'
              : `What you’ve itemised below (${money(o.itemised)}) is more than your estimate, so that’s what’s used.`;
      // A payment counts once its debt has a balance (under Debts).
      const unpaid = [p.mortgage.monthlyPayment > 0 && !(p.mortgage.balance > 0) ? { name: 'your mortgage', path: 'mortgage.balance' } : null]
        .concat(p.debts.map((d, i) => (d.monthlyPayment > 0 && !(d.balance > 0) ? { name: d.name || `debt ${i + 1}`, path: `debts.${i}.balance` } : null)))
        .filter(Boolean);
      unpaidNote.hidden = !unpaid.length;
      if (unpaid.length) {
        FP.dom.fill(unpaidNote,
          `Add what’s left to pay on ${unpaid.map((u) => u.name).join(' and ')} under Debts, so ${unpaid.length === 1 ? 'its payment counts' : 'their payments count'}${o.estimate == null ? '' : ' (until then, your estimate covers it)'}. `,
          h('button', { type: 'button', class: 'link', onclick: () => links.toDebts(unpaid[0].path) }, 'Go to Debts'));
      }
      showWorked(pays, FP.loan.forMortgage(p), { payment: 'mortgage.monthlyPayment' });
    }

    drawLists();
    const card = h('section', { class: 'card', id: 'spending', 'aria-labelledby': 'sec-spend' },
      h('h2', { id: 'sec-spend' }, 'Outgoings'),
      make(P.fieldFor('outgoings.estimate')),
      status,
      h('div', { class: 'parts' }, bills.el, debts.el, other.el),
      FP.savingsEditor.render(ctx, { embedded: true }));
    drawPays();
    card.refresh = refresh;
    card.redrawPays = () => drawPays();
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
  function debtsCard(ctx, links) {
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
        // The name may have been changed under Outgoings.
        fold.querySelector('summary > span').textContent = title();
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
          h('button', { type: 'button', class: 'link danger', onclick: () => { p.debts.splice(i, 1); ctx.changed(); drawOthers(); links.paymentsChanged(); } }, 'Remove this debt')],
          () => FP.loan.forDebt(ctx.profile().debts[i] || {}, ctx.profile().assumptions), paths, '% APR');
        return { fold, draw };
      });
      FP.dom.fill(others,
        h('h3', { id: 'grp-otherDebts' }, 'Other debts'),
        h('p', { class: 'help' }, 'Loans, car finance, credit cards.'),
        folds.length ? h('div', { class: 'parts' }, folds.map((x) => x.fold)) : null,
        h('button', { type: 'button', class: 'secondary', onclick: () => { p.debts.push(P.newDebt()); ctx.changed(); drawOthers(); links.paymentsChanged(); } }, '+ Add a debt'));
      debtDraws = folds.map((x) => x.draw);
      debtDraws.forEach((d) => d());
    };
    drawOthers();
    const card = h('section', { class: 'card', id: 'debts', 'aria-labelledby': 'sec-debts' },
      h('h2', { id: 'sec-debts' }, 'Debts'),
      h('p', { class: 'muted' }, `${sec.intro} For each, give the balance and any two of monthly payment, time left and interest rate: the third is worked out. Payments you add under Outgoings show here too.`),
      h('div', { class: 'parts' }, mortgage.fold),
      others);
    mortgage.draw();
    card.refreshNotes = () => [mortgage.draw, ...debtDraws].forEach((d) => d());
    card.redraw = drawOthers;
    return card;
  }

  function render(root, appCtx) {
    // What's left of your estimate follows every change to your outgoings.
    const ctx = {
      ...appCtx,
      update(path, value) { P.set(appCtx.profile(), path, value); ctx.changed(); },
      changed() { FP.summary.syncOutgoings(appCtx.profile()); appCtx.changed(); FP.field.recheckAll(root); },
    };
    const saved = FP.store.pref('setupMode');
    // Section by section unless you've chosen the one-page view.
    let mode = saved === 'all' ? 'all' : 'steps';
    let current = Math.min(STEPS.length - 1, Number(FP.store.pref('setupStep')) || 0);
    const visited = new Set((FP.store.pref('setupVisited') || '').split(',').filter(Boolean));

    const leftover = FP.leftoverCard.render(ctx, { id: 'leftover', fold: true });
    const income = incomeCard(ctx);
    // Debt payments under Outgoings and Debts are the same figures.
    let outgoings = null;
    const debts = debtsCard(ctx, { paymentsChanged: () => outgoings.redrawPays() });
    outgoings = outgoingsCard(ctx, {
      debtsChanged: () => debts.redraw(),
      toDebts: (path) => reveal(debts.querySelector(`[data-path="${CSS.escape(path)}"]`) || debts),
    });
    const groups = [
      [aboutCard(ctx)],
      [income],
      [outgoings, leftover],
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
      // Going through Debts counts towards your plan's detail, even with none.
      meter.refresh();
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
      strip.refresh();
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

    // The strip sits above the Back and Next buttons: pinned to the bottom of
    // the screen, it's only ever pushed up from where it sits, so it can't cover them.
    // Leaving from the strip counts as having been through the section you're in, like Next.
    const strip = liveStrip(ctx, root, () => (mode === 'steps' ? STEPS[current].id : openAll >= 0 ? STEPS[openAll].id : null),
      () => { if (mode === 'steps') markVisited(current); });
    // How much is in so far, and what to add next; it follows what you type.
    const meter = h('div', { class: 'setup-meter', role: 'status' }, FP.checklist.meter(ctx.profile()));
    meter.refresh = () => FP.dom.fill(meter, FP.checklist.meter(ctx.profile()));
    FP.dom.add(root, h('h1', null, 'Your figures'), intro, meter, toHand(), nav, groups, strip, footer, calc);

    // A link to a field in another section (e.g. from Your plan's checklist) opens that section.
    root.addEventListener('fp:reveal', (e) => {
      const g = e.target.closest('[data-step]');
      const i = g ? STEPS.findIndex((st) => st.id === g.dataset.step) : -1;
      if (mode === 'steps' && i >= 0 && i !== current) show(i, false);
      if (mode === 'all' && i >= 0 && i !== openAll) { openAll = i; draw(); }
    });

    let timer = null;
    const refresh = (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!leftover.contains(e.target)) leftover.refresh();
        strip.refresh();
        meter.refresh();
        income.refreshStatus();
        debts.refreshNotes();
        outgoings.refresh();
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
    // A box shown in two places (a debt payment, under Outgoings and Debts) keeps both copies the same.
    root.addEventListener('input', (e) => {
      const wrap = e.target.closest && e.target.closest('[data-path]');
      if (!wrap || e.target.type !== 'text') return;
      root.querySelectorAll(`[data-path="${CSS.escape(wrap.dataset.path)}"] input[type="text"]`).forEach((i) => { if (i !== e.target) i.value = e.target.value; });
    });
    root.addEventListener('input', refresh);
    root.addEventListener('change', refresh);
    root.addEventListener('click', refresh);
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

  /*
   * What's worth finding before you start, and which section each fills. Open
   * the first time you see Your figures, then folded to one line.
   */
  const TO_HAND = [
    ['Your latest payslip', 'Income', 'income', 'salary, pension contributions, tax code and any student loan or salary sacrifice'],
    ['Your P60', 'Income', 'income', 'last tax year\u2019s pay and tax code'],
    ['Pension statements (or your pension provider\u2019s app)', 'Assets', 'assets', 'your pension pots'],
    ['Your mortgage statement', 'Debts', 'debts', 'balance, rate and time left'],
    ['Credit card and loan statements', 'Debts', 'debts', 'balances, monthly payments and interest rates'],
    ['Your student loan balance (your Student Loans Company online account)', 'Income', 'income', 'what you owe and when you started repaying'],
  ];
  function toHand() {
    const first = FP.store.pref('seenToHand') !== '1';
    FP.store.pref('seenToHand', '1');
    return h('details', { class: 'card fold-card to-hand', id: 'to-hand', open: first || null },
      h('summary', null, h('span', { class: 'fold-title' }, 'Have these to hand'), h('span', { class: 'fold-sum' }, 'Payslip, P60, pension and debt statements')),
      h('div', { class: 'fold-body' },
        h('p', { class: 'help' }, 'Not essential: a rough figure is fine for anything you don\u2019t have.'),
        h('ul', { class: 'to-hand-list' }, TO_HAND.map(([what, section, id, fills]) => h('li', null,
          h('strong', null, what),
          h('span', null, ' for ', h('a', { href: `#setup/${id}` }, section), `: ${fills}.`))))));
  }

  /*
   * Pinned above the tabs: the result the section you're in changes (About you:
   * what you could spend in retirement; Income: take-home; Outgoings: left over;
   * Assets and Debts: net worth). On the one-page view with nothing open, take-home
   * and left over. section(): the id of the section you're in, or null.
   */
  const STRIP = {
    you: (p) => {
      const rs = FP.summary.checklist(p).ready ? FP.projection.retirementSpend(p) : null;
      return [[FP.dom.measure('couldSpend'), rs ? `${money(rs.monthly, { approx: FP.dom.far(p.assumptions.retirementAge - p.about.age) })} a month` : '\u2014']];
    },
    income: (p) => [['Take-home', `${money(FP.tax.forProfile(p).takeHomeMonthly)} a month`]],
    outgoings: (p) => [leftCell(p)],
    assets: (p) => [netWorthCell(p)],
    debts: (p) => [netWorthCell(p)],
  };
  function leftCell(p) {
    const left = FP.summary.compute(p, FP.tax.forProfile(p).takeHomeMonthly).cashFlow.surplus || 0;
    return [left < 0 ? 'Short by' : 'Left over', `${money(Math.abs(left))} a month`, left < 0];
  }
  function netWorthCell(p) {
    return [FP.dom.measure('netWorth'), money(FP.summary.compute(p, FP.tax.forProfile(p).takeHomeMonthly).netWorth)];
  }

  function liveStrip(ctx, root, section, leaving) {
    const figures = h('p', { class: 'live-figures', role: 'status', 'aria-live': 'polite' });
    const strip = h('div', { class: 'live-strip', role: 'group', 'aria-label': 'From what you’ve entered' }, figures,
      h('button', { type: 'button', class: 'small', onclick: () => { leaving(); calculate(ctx, root); } }, 'See my plan'));
    strip.refresh = () => {
      const p = ctx.profile();
      const show = STRIP[section()];
      const cells = show ? show(p) : [['Take-home', money(FP.tax.forProfile(p).takeHomeMonthly)], leftCell(p)];
      FP.dom.fill(figures, cells.map(([label, value, bad]) => h('span', null, h('small', null, label), h('strong', { class: bad ? 'negative' : null }, value))));
    };
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
  FP.screens.setup = { title: 'Your figures', render, hasPayDetail };
})(globalThis.FP = globalThis.FP || {});
