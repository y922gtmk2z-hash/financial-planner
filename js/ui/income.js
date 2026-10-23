/* Income: UK take-home pay calculator. Feeds Today's cash flow automatically. */
(function (FP) {
  'use strict';

  const { h, money, pct, chips } = FP.dom;

  const PLAN_LABELS = { plan1: 'Plan 1', plan2: 'Plan 2', plan4: 'Plan 4', plan5: 'Plan 5', postgrad: 'Postgraduate' };

  function render(root, ctx) {
    const p = ctx.profile();
    const results = h('div', { 'aria-live': 'polite' });
    const draw = () => FP.dom.fill(results, resultsView(ctx.profile()));

    const sec = FP.profile.SECTIONS.find((x) => x.id === 'income');
    const make = (f) => FP.field.render(f, {
      value: FP.profile.get(p, f.path),
      onChange: (v) => { ctx.update(f.path, v); draw(); },
    });

    FP.dom.add(root,
      h('h1', null, 'Income'),
      h('p', { class: 'lead' }, 'Your take-home pay after income tax, National Insurance, pension and student loan. It feeds your cash flow on Today automatically.'),
      taxYearNotice(),
      h('section', { class: 'card', 'aria-labelledby': 'inc-in' },
        h('h2', { id: 'inc-in' }, 'Your pay'),
        h('p', { class: 'muted' }, 'These are the same figures as in Setup — changing them here changes them everywhere.'),
        sec.fields.filter((f) => !f.advanced).map(make),
        h('details', { class: 'advanced' }, h('summary', null, 'Advanced'), sec.fields.filter((f) => f.advanced).map(make))),
      results);
    draw();
  }

  function taxYearNotice() {
    const cfg = FP.taxConfig;
    const today = new Date().toISOString().slice(0, 10);
    const stale = today > cfg.yearEnd || today < cfg.yearStart;
    return h('aside', { class: `tax-year${stale ? ' stale' : ''}`, role: 'note' },
      h('strong', null, stale
        ? `These are the ${cfg.taxYear} tax rules, but today is outside that tax year. Update the tax config file before relying on these figures.`
        : `Tax rules for ${cfg.taxYear} (${FP.dom.date(cfg.yearStart)} to ${FP.dom.date(cfg.yearEnd)}).`),
      ` Last checked ${FP.dom.date(cfg.checkedOn)}. Rates and thresholds change — they must be checked against HMRC each tax year.`,
      h('details', null, h('summary', null, 'Official sources'),
        h('ul', null, cfg.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.label))))));
  }

  function resultsView(p) {
    const input = FP.tax.inputFromProfile(p);
    const r = FP.tax.takeHome(input);
    const cfg = FP.taxConfig;

    if (r.gross <= 0) {
      return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Enter your gross salary above to see your take-home pay.'));
    }

    const regular = r.bonus > 0 ? FP.tax.takeHome({ ...input, bonus: 0 }) : null;
    const keep = FP.tax.keepOfNext(input);
    const deductions = r.incomeTax + r.nationalInsurance + r.studentLoan;

    const segs = [
      { label: 'Take-home', value: r.takeHome, color: '--series-1' },
      { label: 'Income tax', value: r.incomeTax, color: '--series-2' },
      { label: 'National Insurance', value: r.nationalInsurance, color: '--series-3' },
      { label: 'Student loan', value: r.studentLoan, color: '--series-4' },
      { label: 'Your pension', value: r.pensionFromPay, color: '--series-5' },
    ];

    const methodNote = {
      netPay: 'Pension taken before tax (net pay): saves income tax, not NI.',
      salarySacrifice: 'Salary sacrifice: saves income tax and NI.',
      reliefAtSource: `Relief at source: you pay ${100 - cfg.reliefAtSourceRate}% from take-home pay and the provider adds ${cfg.reliefAtSourceRate}% tax relief. Higher-rate relief is shown as if claimed.`,
    }[r.pensionMethod];

    return [
      h('section', { class: 'card hero', 'aria-labelledby': 'th-h' },
        h('h2', { id: 'th-h', class: 'eyebrow' }, 'Take-home pay'),
        h('p', { class: 'hero-number' }, `${money(r.takeHomeMonthly)}`, h('span', { class: 'per' }, ' a month')),
        h('p', { class: 'muted' }, `${money(r.takeHome)} a year from ${money(r.gross)} gross`,
          regular ? ` · ${money(regular.takeHomeMonthly)} in a month without bonus` : ''),
        FP.chart.stackedBars([{ label: 'Where your pay goes', total: r.gross, segments: segs }], { ariaLabel: 'Bar showing how gross pay splits into take-home, tax, NI, student loan and pension' }),
        FP.chart.legend(segs.filter((x) => x.value > 0)),
        h('div', { class: 'stat-grid' },
          h('div', null, h('span', null, 'Tax + NI + loan'), h('strong', null, `${pct((deductions / r.gross) * 100, 1)} of gross`)),
          h('div', null, h('span', null, 'Of your next £100 pay rise'), h('strong', null, `you keep ${money(keep)}`))),
        chips([
          `Tax year ${r.taxYear}`,
          r.region === 'scotland' ? 'Scottish income tax' : 'Rest-of-UK income tax',
          `Pension ${pct(input.employeePensionPct, 1)} of salary`,
          input.studentLoanPlan !== 'none' ? `Student loan ${PLAN_LABELS[input.studentLoanPlan]}` : 'No student loan',
        ])),
      breakdownCard(r),
      bandsCard(r),
      h('section', { class: 'card', 'aria-labelledby': 'notes-h' },
        h('h2', { id: 'notes-h' }, 'How this is worked out'),
        h('ul', { class: 'notes' },
          h('li', null, methodNote),
          h('li', null, 'Pension contributions are a percentage of salary, not bonus.'),
          h('li', null, 'Worked out on yearly pay. Payroll calculates NI and student loan each pay period, so a bonus paid in one month can make the real figures differ slightly.'),
          h('li', null, 'Employment income only, with a standard tax code. Savings, dividends, rental income, benefits in kind, Marriage Allowance and the High Income Child Benefit Charge are not included.'),
          h('li', null, 'Rates and thresholds come from the tax config file and are not adjusted by the Assumptions panel.'))),
      rulesCard(r)];
  }

  function breakdownCard(r) {
    const row = (label, year, cls) => h('tr', { class: cls || null },
      h('th', { scope: 'row' }, label),
      h('td', { class: 'num' }, money(year)),
      h('td', { class: 'num' }, money(year / 12)));
    return h('section', { class: 'card', 'aria-labelledby': 'bd-h' },
      h('h2', { id: 'bd-h' }, 'Breakdown'),
      h('table', { class: 'data-table breakdown' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, ''), h('th', { scope: 'col', class: 'num' }, 'Year'), h('th', { scope: 'col', class: 'num' }, 'Month'))),
        h('tbody', null,
          row('Salary', r.salary),
          r.bonus > 0 ? row('Bonus', r.bonus) : null,
          r.pensionFromPay > 0 ? row(`− Your pension${r.pensionMethod === 'salarySacrifice' ? ' (sacrificed)' : ''}`, r.pensionFromPay, 'minus') : null,
          row('− Income tax', r.incomeTax, 'minus'),
          row('− National Insurance', r.nationalInsurance, 'minus'),
          r.studentLoan > 0 ? row('− Student loan', r.studentLoan, 'minus') : null,
          row('Take-home pay', r.takeHome, 'result'),
          r.employerPension > 0 ? row('Employer adds to your pension', r.employerPension, 'aside') : null,
          r.pensionIntoPot > 0 ? row('Total paid into your pension', r.pensionIntoPot, 'aside') : null)));
  }

  function bandsCard(r) {
    const used = r.taxByBand.filter((b) => b.amount > 0);
    return h('section', { class: 'card', 'aria-labelledby': 'bands-h' },
      h('h2', { id: 'bands-h' }, 'Income tax by band'),
      h('table', { class: 'data-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Band'), h('th', { scope: 'col', class: 'num' }, 'Income'), h('th', { scope: 'col', class: 'num' }, 'Tax'))),
        h('tbody', null,
          h('tr', null, h('td', null, 'Personal allowance (0%)'), h('td', { class: 'num' }, money(r.personalAllowance)), h('td', { class: 'num' }, money(0))),
          used.map((b) => h('tr', null,
            h('td', null, `${b.name} (${b.rate}%)`), h('td', { class: 'num' }, money(b.amount)), h('td', { class: 'num' }, money(b.tax)))),
          h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Total'), h('td', { class: 'num' }, money(r.personalAllowance + r.taxable)), h('td', { class: 'num' }, money(r.incomeTax))))),
      r.personalAllowance < FP.taxConfig.personalAllowance
        ? h('p', { class: 'notice warn' }, `Your personal allowance is reduced to ${money(r.personalAllowance)} because your income is over ${money(FP.taxConfig.taperThreshold)}. Pension contributions can bring it back down.`)
        : null);
  }

  function rulesCard(r) {
    const cfg = FP.taxConfig;
    const ni = cfg.nationalInsurance;
    const bands = cfg.bands[r.region];
    return h('details', { class: 'card rules' },
      h('summary', null, h('strong', null, `Rules used (${cfg.taxYear})`)),
      h('p', { class: 'muted' }, 'Read-only here. To update them for a new tax year, edit the tax config file (js/config/).'),
      h('table', { class: 'data-table' },
        h('caption', null, r.region === 'scotland' ? 'Scottish income tax' : 'Income tax (England, Wales, NI)'),
        h('tbody', null,
          h('tr', null, h('td', null, 'Personal allowance'), h('td', { class: 'num' }, `${money(cfg.personalAllowance)}, reduced by £1 for every £2 over ${money(cfg.taperThreshold)}`)),
          bands.map((b) => h('tr', null, h('td', null, `${b.name} ${b.rate}%`), h('td', { class: 'num' }, b.grossLabel))))),
      h('table', { class: 'data-table' },
        h('caption', null, 'Employee National Insurance'),
        h('tbody', null,
          h('tr', null, h('td', null, `${ni.mainRate}%`), h('td', { class: 'num' }, `${money(ni.primaryThreshold)} to ${money(ni.upperEarningsLimit)}`)),
          h('tr', null, h('td', null, `${ni.upperRate}%`), h('td', { class: 'num' }, `over ${money(ni.upperEarningsLimit)}`)))),
      h('table', { class: 'data-table' },
        h('caption', null, 'Student loan repayment thresholds'),
        h('tbody', null, Object.entries(cfg.studentLoans).map(([k, v]) => h('tr', null,
          h('td', null, PLAN_LABELS[k]), h('td', { class: 'num' }, `${v.rate}% over ${money(v.threshold)}`))))));
  }

  FP.screens = FP.screens || {};
  FP.screens.income = { title: 'Income', render };
})(globalThis.FP = globalThis.FP || {});
