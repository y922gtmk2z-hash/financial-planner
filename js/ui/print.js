/*
 * Your plan on a page (one A4 page): who it's for, income, each pension,
 * debts, the verdicts, retirement figures, your commitments (or, with none
 * yet, the top three actions), only the assumptions you've changed, and the
 * not-advice notice. "Include every assumption" adds a second page. It's built when you
 * print (Print or save as PDF, or the browser's own Print), and only shows on
 * paper; the print stylesheet hides everything else.
 */
(function (FP) {
  'use strict';

  const { h, money, pct, measure, lastsTo } = FP.dom;

  const ahead = (p) => FP.dom.far(p.assumptions.retirementAge - p.about.age);

  // Every assumption: one line each, in three columns.
  function wideTable(caption, rows) {
    return h('table', { class: 'print-table print-wide' },
      h('caption', null, caption),
      h('thead', null, h('tr', null, ['Assumption', 'Value', 'Source'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, rows.map(([k, v, sub]) => h('tr', null, h('th', { scope: 'row' }, k), h('td', null, v), h('td', { class: 'src' }, sub)))));
  }

  function table(caption, rows) {
    return h('table', { class: 'print-table' },
      h('caption', null, caption),
      h('tbody', null, rows.filter(Boolean).map(([k, v, sub]) => h('tr', null,
        h('th', { scope: 'row' }, k, sub ? h('small', null, sub) : null),
        h('td', null, v)))));
  }

  // Assumptions entered in Your figures are personal facts, shown with them, not here.
  const personal = () => new Set(FP.profile.SECTIONS.flatMap((sec) => sec.fields)
    .filter((f) => f.path.startsWith('assumptions.')).map((f) => f.path.slice(12)));

  // An assumption's value as text ("2.5%", "£20,000", "stay frozen at today's levels").
  function valueText(d, v) {
    if (v == null) return 'not set';
    if (d.unit === 'choice') return (d.options.find((o) => o.value === v) || {}).label || String(v);
    if (d.unit === 'money') return money(v);
    if (d.unit === 'age') return `age ${v}`;
    if (d.unit === 'year') return `${v} years`;
    if (d.unit === 'pts') return `${v > 0 ? '+' : ''}${v} points`;
    return pct(v);
  }
  // The newest date any default was set on.
  const defaultsDate = () => FP.assumptions.DEFS.map((d) => d.setOn).sort().pop();

  /*
   * The economic assumptions: only those you've changed (with the default
   * alongside), or with `every`, all of them. Mixes count as changed when a
   * pot isn't on the default mix.
   */
  function assumptionRows(p, every) {
    const a = p.assumptions;
    const own = personal();
    const rows = FP.assumptions.DEFS.filter((d) => !own.has(d.key) && (every || a[d.key] !== d.default))
      .map((d) => [d.label, valueText(d, a[d.key]), a[d.key] !== d.default ? `yours; default ${valueText(d, d.default)}` : `default, set ${FP.dom.date(d.setOn)}`]);
    const dm = FP.assumptions.DEFAULT_MIX;
    const mixChanged = ['isa', 'pension'].some((k) => FP.assumptions.MIX_KEYS.some((m) => p.mixes[k][m] !== dm[m]));
    if (every || mixChanged) {
      rows.push(['What your ISAs and pension are invested in', `ISAs ${FP.mix.describe(p.mixes.isa)} (${pct(FP.mix.netRate(p.mixes.isa, a, 'invest'))} after fees); pension ${FP.mix.describe(p.mixes.pension)} (${pct(FP.mix.netRate(p.mixes.pension, a, 'pension'))} after fees)`, mixChanged ? 'yours' : 'default']);
    }
    return rows;
  }

  // "You (38) and Sam (36)", or "You, 38".
  function whoFor(p) {
    const people = FP.profile.people(p);
    const one = (x, i) => `${i ? (x.name || 'your partner') : (x.name ? `${x.name} (you)` : 'You')}, ${x.age == null ? p.about.age : x.age}`;
    return people.map(one).join(' and ');
  }

  // Each person's pay: salary, and take-home a month.
  function incomeRows(p, pay) {
    return FP.profile.people(p).map((x, i) => [
      i ? `${FP.profile.capital(FP.profile.whose(p, i))} pay` : (p.partner ? 'Your pay' : 'Pay'),
      `${money(pay.people[i].takeHomeMonthly)} a month`,
      `${money(x.income.grossSalary || 0)} a year before tax${(x.income.otherIncome || 0) + (x.income.taxFreeIncome || 0) > 0 ? `, plus ${money((x.income.otherIncome || 0) + (x.income.taxFreeIncome || 0))} other income` : ''}`,
    ]);
  }

  // Every pension: main pots with what goes in, other pots and incomes, and each State Pension.
  function pensionRows(p) {
    const people = FP.profile.people(p);
    const whose = (i) => (people.length > 1 ? `${FP.profile.capital(FP.profile.whose(p, i))} ` : '');
    const rows = people.map((x, i) => [`${whose(i)}workplace pension`.replace(/^w/, 'W'), money(x.pension || 0),
      `${pct(x.employeePensionPct || 0)} + ${pct(x.employerPensionPct || 0)} employer`]);
    (p.pensions || []).forEach((x) => {
      const owner = x.owner === 'partner' && p.partner ? 1 : 0;
      rows.push(x.type === 'db'
        ? [`${whose(owner)}${x.name || 'Defined benefit pension'}`, `${money(x.income || 0)} a year`, `from age ${x.accessAge == null ? people[owner].statePensionAge : x.accessAge}`]
        : [`${whose(owner)}${x.name || 'Other pension'}`, money(x.value || 0), x.monthly > 0 ? `${money(x.monthly)} a month going in` : null]);
    });
    people.forEach((x, i) => rows.push([`${whose(i)}State Pension`.replace(/^S/, 'S'), `${money(x.statePension)} a year`, `from age ${x.statePensionAge}`]));
    return rows;
  }

  // The mortgage and each debt: what's owed, the rate and the payment, and when it's cleared.
  function debtRows(p, s, ev, proj) {
    const rows = [];
    if (s.mortgage) {
      rows.push(['Mortgage', money(s.mortgage.balance), `${pct(s.mortgage.rate, 2)}, ${money(s.mortgage.payment + s.mortgage.overpayment)} a month${ev && ev.mortgageFree ? `; mortgage-free at ${ev.mortgageFree.age}` : ''}`]);
      if (p.mortgage.fixEnds) rows.push(['Fixed rate ends', FP.mortgage.monthName(p.mortgage.fixEnds), p.mortgage.rateAfterFix != null ? `then ${pct(p.mortgage.rateAfterFix, 2)}` : null]);
    }
    s.debts.filter((d) => d.balance > 0).forEach((d) => rows.push([d.name || 'Debt', money(d.balance), `${pct(d.rate)} APR, ${money(d.payment)} a month`]));
    const loans = ev ? (p.partner && ev.studentLoans) || [ev.studentLoan] : [];
    loans.forEach((x, i) => {
      if (!x || !x.tracked) return;
      rows.push([p.partner ? `${FP.profile.capital(FP.profile.whose(p, i))} student loan` : 'Student loan', money(FP.profile.people(p)[i].income.studentLoanBalance || 0),
        x.clearedRow ? `repaid at ${x.clearedRow.age}` : x.writtenOffRow ? `written off at ${x.writtenOffAge}` : 'still owing at the end']);
    });
    const debts0 = s.debts.reduce((t, d) => t + (d.balance > 0 ? d.balance : 0), 0);
    const cleared = proj.ok && debts0 > 0 ? proj.rows.find((r, i) => i > 0 && r.debts <= 0) : null;
    if (debts0 > 0) rows.push(['Other debts cleared', cleared ? `age ${cleared.age}` : 'not within the plan']);
    return rows.length ? rows : [['Debts', 'None entered']];
  }

  // Include every assumption (a second page)? Remembered while the page is open.
  let everyAssumption = false;

  function build(ctx, root) {
    const p = ctx.profile();
    const a = p.assumptions;
    const ws = ctx.workspace();
    const sc = FP.scenarios.active(ws);
    const pay = FP.tax.household(p);
    const s = FP.summary.compute(p, pay.takeHomeMonthly);
    const cf = s.cashFlow;
    const proj = FP.projection.project(p, { maxYears: a.endAge - p.about.age });
    const need = FP.projection.retirementNeed(p);
    const rs = FP.projection.retirementSpend(p);
    const far = { approx: ahead(p) };
    const ra = FP.dom.retireAt(p, need);
    // The verdicts, word for word as on screen.
    const verdicts = [...root.querySelectorAll('.outcome')].map((c) => [c.querySelector('h2').textContent, c.querySelector('.verdict').textContent.replace(/^[✓!•]\s*/, '').replace(/^Rough\s*/i, '')]);
    const ev = proj.ok ? proj.events : null;
    const commitments = p.commitments || [];
    // With no commitments yet, the top three actions instead.
    const actions = commitments.length ? [] : FP.suggest.rankActions(FP.screens.actions.openActions(p)).slice(0, 3);
    const changed = assumptionRows(p, false);
    const notice = document.querySelector('#disclaimer p').textContent;
    const cfg = FP.taxConfig;
    return h('div', { class: `print-body${everyAssumption ? ' with-every' : ''}` },
      h('div', { class: 'print-page' },
        h('h1', null, 'Your plan on a page'),
        h('p', { class: 'print-meta' }, `For ${whoFor(p)} · ${sc.name}${p.isSample ? ' · a fictional example household' : ''} · printed ${FP.dom.date(new Date().toISOString().slice(0, 10))}`),
        h('section', null, h('h2', null, 'In short'),
          h('ul', { class: 'print-verdicts' }, verdicts.map(([t, v]) => h('li', null, h('strong', null, `${t}: `), v)))),
        h('div', { class: 'print-cols' },
          table('Income', incomeRows(p, pay).concat([cf.surplus < 0 ? ['Short each month', money(-cf.surplus)] : ['Left over each month', money(cf.surplus), `after ${money(cf.outgoings)} going out${cf.savingsMonthly > 0 ? ` and ${money(cf.savingsMonthly)} saved` : ''}`]])),
          table('Debts', debtRows(p, s, ev, proj))),
        h('div', { class: 'print-cols' },
          table('Pensions', pensionRows(p)),
          need ? table(`Retirement at ${ra}, today’s money`, [
            [measure('moneyLastsTo'), lastsTo(need), `at ${money(need.goal)} a month`],
            rs ? [measure('couldSpend'), `${money(rs.monthly, far)} a month`, `to ${rs.endAge}`] : null,
            [measure('savingsPensions', ra), money(need.have, far), `need ${money(need.needed, far)}`],
          ]) : null),
        commitments.length ? h('section', null, h('h2', null, 'Your commitments'),
          h('ul', { class: 'print-commitments' }, commitments.map((c) => h('li', null,
            h('span', { class: 'print-tick', 'aria-hidden': 'true' }, c.status === 'done' ? '☑' : '☐'), ' ',
            h('strong', null, c.what),
            [c.amount != null ? ` · ${money(c.amount)} a ${c.per || 'month'}` : '', c.due ? ` · by ${FP.dom.date(c.due)}` : '', c.status === 'done' ? ' · done' : ''].join(''))))) : null,
        actions.length ? h('section', null, h('h2', null, 'Next steps'),
          h('ol', { class: 'print-actions' }, actions.map((x) => h('li', null, h('strong', null, x.title),
            ' — ', FP.suggest.highlights(x).map((f) => FP.screens.actions.figureText(f, p)).join('; ') || x.text.match(/^.*?[.!?](?=\s|$)/)[0])))) : null,
        h('section', { class: 'print-assumptions' }, h('h2', null, 'Assumptions'),
          changed.length ? table('You’ve changed', changed) : null,
          h('p', { class: 'print-note tight' }, `${changed.length ? 'All other assumptions are' : 'All assumptions are'} defaults set on ${FP.dom.date(defaultsDate())}. Tax rules for ${cfg.taxYear}, checked ${FP.dom.date(cfg.checkedOn)}.`)),
        h('p', { class: 'print-note' }, h('strong', null, 'Planning illustration only — not financial advice. '), notice, ' Figures five or more years ahead are rounded.')),
      everyAssumption ? h('div', { class: 'print-page print-page-2' },
        h('h2', null, 'Every assumption'),
        wideTable(`Economic assumptions (defaults set on ${FP.dom.date(defaultsDate())})`, assumptionRows(p, true).map(([k, v, sub]) => [k, v, sub.replace(/^default, set /, 'default, ')]))) : null);
  }

  // Fills the summary on the page (built fresh each time you print).
  function fill(ctx, root) {
    const el = root.querySelector('.print-summary');
    if (el) FP.dom.fill(el, build(ctx, root));
  }

  // The summary's placeholder on Your plan, the button, and the browser's own Print.
  function attach(ctx, root) {
    window.onbeforeprint = () => { if (root.isConnected) fill(ctx, root); };
    return h('section', { class: 'print-summary', 'aria-hidden': 'true' });
  }

  // Print or save as PDF: one A4 page, or two with every assumption.
  function button(ctx, root) {
    const id = 'print-every';
    return h('span', { class: 'print-controls' },
      h('button', { type: 'button', class: 'secondary print-btn', onclick: () => { fill(ctx, root); window.print(); } }, 'Print or save as PDF'),
      h('label', { class: 'print-every', for: id },
        h('input', { type: 'checkbox', id, checked: everyAssumption, onchange: (e) => { everyAssumption = e.target.checked; } }),
        ' Include every assumption (adds a page)'));
  }

  FP.print = { attach, button, fill };
})(globalThis.FP = globalThis.FP || {});
