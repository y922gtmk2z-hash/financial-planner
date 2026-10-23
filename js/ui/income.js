/* Income: UK take-home pay calculator. Feeds Today's cash flow automatically. */
(function (FP) {
  'use strict';

  const { h, money, pct, chips } = FP.dom;

  const monthName = (v) => (FP.profile.BONUS_MONTHS.find((m) => m.value === v) || { label: v }).label;

  const PLAN_LABELS = { plan1: 'Plan 1', plan2: 'Plan 2', plan4: 'Plan 4', plan5: 'Plan 5', postgrad: 'Postgraduate' };

  function render(root, ctx) {
    const p = ctx.profile();
    FP.dom.add(root,
      h('h1', null, 'Income'),
      h('p', { class: 'lead' }, 'Your take-home pay after income tax, National Insurance, pension and student loan. It feeds your cash flow on Today automatically.'),
      taxYearNotice(),
      resultsView(p),
      yourPayCard(p));
  }

  // What the figures above are based on, each with a link to change it in Setup.
  function yourPayCard(p) {
    const inc = p.income;
    const a = p.assumptions;
    const total = (list, key) => list.reduce((t, x) => t + (x[key] || 0), 0);
    const method = (FP.profile.PENSION_METHODS.find((m) => m.value === inc.pensionMethod) || {}).label;
    const bonuses = inc.bonuses.filter((b) => b.amount > 0);
    const rows = [
      ['Where you pay income tax', inc.region === 'scotland' ? 'Scotland' : 'England, Wales or NI', 'income.region'],
      ['Gross salary', inc.grossSalary > 0 ? `${money(inc.grossSalary)} a year` : 'Not entered', 'income.grossSalary'],
      ['Your pension', `${pct(a.employeePensionPct, 1)} of salary${method ? ` \u00b7 ${method}` : ''}`, 'assumptions.employeePensionPct'],
      ['Employer pension', `${pct(a.employerPensionPct, 1)} of salary`, 'assumptions.employerPensionPct'],
      ['Bonuses', bonuses.length ? `${money(total(bonuses, 'amount'))} a year (${bonuses.map((b) => monthName(b.month)).join(', ')})` : 'None', 'bonuses'],
      ['Salary sacrifice', inc.sacrifices.length ? `${money(total(inc.sacrifices, 'monthly'))} a month` : 'None', 'sacrifices'],
      ['Student loan', inc.studentLoanPlan !== 'none'
        ? `${PLAN_LABELS[inc.studentLoanPlan]}${inc.studentLoanBalance > 0 ? ` \u00b7 ${money(inc.studentLoanBalance)} owed` : ''}`
        : 'None', 'income.studentLoanPlan'],
    ];
    return h('section', { class: 'card', 'aria-labelledby': 'inc-in' },
      h('h2', { id: 'inc-in' }, 'Based on'),
      h('dl', { class: 'facts' }, rows.map(([label, value, target]) => h('div', null,
        h('dt', null, label),
        h('dd', null, value, ' ', h('a', { href: `#setup/${target}`, class: 'edit-link', 'aria-label': `Change ${label.toLowerCase()} in Setup` }, 'Change'))))),
      h('p', { class: 'muted small' }, 'Your figures are all entered in Setup, so there\u2019s one place to change them.'));
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
      return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Enter your gross salary in Setup to see your take-home pay.'), h('a', { href: '#setup/income.grossSalary' }, 'Add your salary'));
    }

    // Take-home in a month with no bonus at all, when bonuses are spread evenly.
    const regular = r.bonusSpread > 0 ? FP.tax.takeHome({ ...input, bonuses: [] }) : null;
    const keep = FP.tax.keepOfNext(input);
    const deductions = r.incomeTax + r.nationalInsurance + r.studentLoan;

    const segs = [
      { label: 'Take-home', value: r.takeHome, color: '--series-1' },
      { label: 'Income tax', value: r.incomeTax, color: '--series-2' },
      { label: 'National Insurance', value: r.nationalInsurance, color: '--series-3' },
      { label: 'Student loan', value: r.studentLoan, color: '--series-4' },
      { label: 'Your pension', value: r.pensionFromPay, color: '--series-5' },
      { label: 'Salary sacrifice', value: r.salarySacrifice, color: '--series-6' },
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
          regular ? ` \u00b7 ${money(r.bonusSpread)} of bonus spread evenly; ${money(regular.takeHomeMonthly)} a month without it` : ''),
        r.bonusPayments.length ? h('ul', { class: 'bonus-callout' }, r.bonusPayments.map((b) => h('li', null,
          h('strong', null, `+ ${money(b.extra)} extra in ${monthName(b.month)}`),
          ` from ${money(b.amount)} of bonus \u2014 you take home ${money(b.pay.takeHome)} that month.`))) : null,
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
      studentLoanCard(p, r),
      bandsCard(r),
      h('section', { class: 'card', 'aria-labelledby': 'notes-h' },
        h('h2', { id: 'notes-h' }, 'How this is worked out'),
        h('ul', { class: 'notes' },
          h('li', null, methodNote),
          h('li', null, 'Pension contributions are a percentage of salary, not bonus.'),
          r.salarySacrifice > 0
            ? h('li', null, `Salary sacrifice of ${money(r.salarySacrifice)} a year comes off your pay before income tax, NI and student loan; pension contributions stay based on your full salary.${r.benefitInKind > 0 ? ` A car\u2019s benefit in kind (${money(r.benefitInKind)} a year) is added to your taxable pay, with no employee NI.` : ''} Salary sacrifice can\u2019t take your pay below the National Minimum Wage.`)
            : null,
          r.bonusPayments.length
            ? h('li', null, 'Bonuses paid in a month: NI and student loan are worked out on that month\u2019s pay, as payroll does. Income tax uses your yearly position, so bonus months carry the extra tax; real payslips can spread it slightly differently depending on the month.')
            : null,
          r.bonusSpread > 0
            ? h('li', null, 'Bonuses set to \u201cspread evenly\u201d are averaged across all 12 months.')
            : null,
          h('li', null, 'Employment income only, with a standard tax code. Savings, dividends, rental income, benefits in kind, Marriage Allowance and the High Income Child Benefit Charge are not included.'),
          h('li', null, 'Rates and thresholds come from the tax config file and are not adjusted by the Assumptions panel.'))),
      rulesCard(r)];
  }

  function breakdownCard(r) {
    const reg = r.regularMonth;
    const bps = r.bonusPayments;
    const months = [reg, ...bps.map((b) => b.pay)];
    // values: [year, ...one per month column]
    const row = (label, values, cls) => h('tr', { class: cls || null },
      h('th', { scope: 'row' }, label),
      values.map((v) => h('td', { class: 'num' }, money(v))));
    const each = (key) => months.map((m) => m[key]);
    const lumpy = bps.length > 0;
    return h('section', { class: 'card', 'aria-labelledby': 'bd-h' },
      h('h2', { id: 'bd-h' }, 'Breakdown'),
      h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Pay breakdown table' }, h('table', { class: 'data-table breakdown' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Item')),
          h('th', { scope: 'col', class: 'num' }, 'Year'),
          h('th', { scope: 'col', class: 'num' }, lumpy ? 'Regular month' : 'Month'),
          bps.map((b) => h('th', { scope: 'col', class: 'num' }, monthName(b.month))))),
        h('tbody', null,
          row('Salary', [r.salary, ...months.map(() => r.salary / 12)]),
          r.bonus > 0 ? row('Bonus', [r.bonus, r.bonusSpread / 12, ...bps.map((b) => b.amount + r.bonusSpread / 12)]) : null,
          r.salarySacrifice > 0 ? row('\u2212 Salary sacrifice (car, cycle\u2026)', [r.salarySacrifice, ...each('salarySacrifice')], 'minus') : null,
          r.pensionFromPay > 0 ? row(`\u2212 Your pension${r.pensionMethod === 'salarySacrifice' ? ' (sacrificed)' : ''}`, [r.pensionFromPay, ...each('pensionFromPay')], 'minus') : null,
          row('\u2212 Income tax', [r.incomeTax, ...each('incomeTax')], 'minus'),
          row('\u2212 National Insurance', [r.nationalInsurance, ...each('nationalInsurance')], 'minus'),
          r.studentLoan > 0 ? row('\u2212 Student loan', [r.studentLoan, ...each('studentLoan')], 'minus') : null,
          row('Take-home pay', [r.takeHome, ...each('takeHome')], 'result'),
          r.benefitInKind > 0 ? row('Car benefit in kind (taxed, not paid)', [r.benefitInKind, ...months.map(() => r.benefitInKind / 12)], 'aside') : null,
          r.employerPension > 0 ? row('Employer adds to your pension', [r.employerPension, ...months.map(() => r.employerPension / 12)], 'aside') : null,
          r.pensionIntoPot > 0 ? row('Total paid into your pension', [r.pensionIntoPot, ...months.map(() => r.pensionIntoPot / 12)], 'aside') : null))),
      lumpy ? h('p', { class: 'muted small' },
        `The year is ${12 - bps.length} regular month${12 - bps.length === 1 ? '' : 's'} plus ${bps.map((b) => monthName(b.month)).join(', ')}.`) : null);
  }

  // Balance, interest and when the loan ends (from the projection).
  function studentLoanCard(p, r) {
    const inc = p.income;
    const plan = inc.studentLoanPlan;
    if (plan === 'none') return null;
    const head = h('h2', { id: 'sl-h' }, 'Your student loan');
    const writeOff = FP.studentLoan.writeOffYear(plan, inc.studentLoanStartYear);
    if (!FP.studentLoan.tracked(p)) {
      return h('section', { class: 'card', 'aria-labelledby': 'sl-h' }, head,
        h('p', null, `You\u2019re repaying ${money(r.studentLoan)} a year (${money(r.studentLoan / 12)} a month).`),
        h('p', { class: 'muted' }, 'Add your balance and the year you were first due to repay (above) to see when your loan will be repaid or written off. Until then, the projection keeps repayments going until you retire.'));
    }
    const override = inc.studentLoanRate;
    const rate = FP.studentLoan.interestRate(plan, r.niablePay, FP.taxConfig, { override });
    const later = FP.studentLoan.interestRate(plan, r.niablePay, FP.taxConfig, { override, rpi: p.assumptions.inflation });
    const followInflation = p.assumptions.studentLoanInterest === 'inflation';
    const interest = inc.studentLoanBalance * rate / 100;
    const until = FP.taxConfig.studentLoanInterest.until.split('-').map(Number);
    const laterFrom = FP.dom.date(`${until[1] === 12 ? until[0] + 1 : until[0]}-${String(until[1] === 12 ? 1 : until[1] + 1).padStart(2, '0')}-01`).replace(/^1 /, '');
    const proj = FP.projection.project(p);
    const sl = proj.ok ? proj.events.studentLoan : null;
    let outcome = null;
    if (sl && sl.clearedRow) {
      outcome = `On these assumptions you\u2019d repay it in ${sl.clearedRow.year}, at age ${sl.clearedRow.age}${writeOff ? ` \u2014 about ${writeOff - sl.clearedRow.year} years before it would be written off` : ''}.`;
    } else if (sl && sl.writtenOffRow) {
      const left = FP.projection.toReal(proj.rows[sl.writtenOffRow.y]).studentLoanWrittenOff;
      outcome = `On these assumptions it wouldn\u2019t be repaid in full: about ${money(left)} (in today\u2019s money) would be written off in April ${writeOff}, at age ${sl.writtenOffAge}.`;
    } else if (sl) {
      outcome = `On these assumptions you\u2019d still owe about ${money(FP.projection.toReal(proj.rows[proj.years]).studentLoan)} (today\u2019s money) at ${proj.rows[proj.years].age}.`;
    }
    return h('section', { class: 'card', 'aria-labelledby': 'sl-h' }, head,
      h('dl', { class: 'rows' }, [
        ['Balance today', money(inc.studentLoanBalance)],
        ['Interest rate now', `${pct(rate, 2)}${plan === 'plan2' && override == null ? ' (depends on income)' : ''}`],
        followInflation
          ? [`From ${laterFrom}`, override == null ? `${pct(later, 2)} (inflation ${pct(p.assumptions.inflation, 1)} + ${pct(later - p.assumptions.inflation, 2)})` : pct(later, 2)]
          : null,
        ['Interest this year (about)', money(interest)],
        ['Repaying this year', money(r.studentLoan)],
        ['Written off', writeOff ? `April ${writeOff}` : 'Add the year you were first due to repay'],
      ].filter(Boolean).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
      r.studentLoan < interest ? h('p', { class: 'notice info' }, 'Your repayments are currently less than the interest, so the balance is growing.') : null,
      outcome ? h('p', { class: 'sl-outcome' }, outcome, ' ', h('a', { href: '#future' }, 'See it on Future')) : h('p', { class: 'muted' }, 'Enter your age in Setup to project when it ends.'),
      chips([
        followInflation
          ? `Current rates until August 2027, then your ${pct(p.assumptions.inflation, 1)} inflation as RPI + plan margin`
          : 'Current rates held in projections (change in Assumptions)',
        plan === 'plan1' || plan === 'plan4' ? 'Plan 1 and 4: base-rate limit not modelled' : null,
        'Check your balance and dates with the Student Loans Company',
      ]));
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
