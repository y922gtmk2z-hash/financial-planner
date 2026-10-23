/* Today: net worth, assets vs liabilities, home equity and monthly cash flow. */
(function (FP) {
  'use strict';

  const { h, money, pct, months, chips } = FP.dom;

  const ASSET_COLORS = {
    homeValue: '--series-1', cashSavings: '--series-2', isa: '--series-3',
    gia: '--series-4', pension: '--series-5', other: '--series-6',
  };
  const LIABILITY_COLORS = { mortgage: '--series-7', debts: '--series-8' };

  function render(root, ctx) {
    const p = ctx.profile();
    const a = p.assumptions;
    // Take-home pay is calculated from Stage 2 onwards.
    const s = FP.summary.compute(p, null);

    FP.dom.add(root,
      h('h1', null, 'Today'),
      s.warnings.length ? h('ul', { class: 'notices' }, s.warnings.map((w) =>
        h('li', { class: `notice ${w.level}` }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, w.level === 'warn' ? '!' : 'i'), w.text))) : null,
      netWorthCard(s),
      chartCard(s),
      homeCard(s, a, p),
      cashFlowCard(s, a, p));
  }

  function netWorthCard(s) {
    return h('section', { class: 'card hero', 'aria-labelledby': 'nw-h' },
      h('h2', { id: 'nw-h', class: 'eyebrow' }, 'Net worth'),
      h('p', { class: 'hero-number' + (s.netWorth < 0 ? ' negative' : '') }, money(s.netWorth)),
      h('p', { class: 'muted' }, `${money(s.assets.total)} owned − ${money(s.liabilities.total)} owed`),
      chips(['Today’s values from Setup', 'No growth applied']));
  }

  function chartCard(s) {
    const assetSegs = s.assets.items.map((i) => ({ label: i.label, value: i.value, color: ASSET_COLORS[i.key] }));
    const liabSegs = s.liabilities.items.map((i) => ({ label: i.label, value: i.value, color: LIABILITY_COLORS[i.key] }));
    const empty = s.assets.total === 0 && s.liabilities.total === 0;

    const table = h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col', class: 'num' }, 'Value'))),
      h('tbody', null,
        assetSegs.map((x) => h('tr', null, h('td', null, x.label), h('td', { class: 'num' }, money(x.value)))),
        h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Total assets'), h('td', { class: 'num' }, money(s.assets.total))),
        liabSegs.map((x) => h('tr', null, h('td', null, x.label), h('td', { class: 'num' }, money(x.value)))),
        h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Total liabilities'), h('td', { class: 'num' }, money(s.liabilities.total)))));

    return h('section', { class: 'card', 'aria-labelledby': 'al-h' },
      h('h2', { id: 'al-h' }, 'What you own vs what you owe'),
      empty
        ? h('p', { class: 'muted' }, 'Add your assets and debts in Setup to see this chart.')
        : [
          FP.chart.stackedBars([
            { label: 'Assets', total: s.assets.total, segments: assetSegs },
            { label: 'Liabilities', total: s.liabilities.total, segments: liabSegs },
          ], { ariaLabel: 'Bar chart of assets and liabilities by type' }),
          h('div', { class: 'legend-cols' },
            FP.chart.legend(assetSegs.filter((x) => x.value > 0)),
            FP.chart.legend(liabSegs.filter((x) => x.value > 0))),
        ],
      h('details', { class: 'table-toggle' }, h('summary', null, 'Show as a table'), table));
  }

  function homeCard(s, a, p) {
    const m = s.mortgage;
    const rows = [
      ['Home value', money(s.home.value)],
      ['Mortgage balance', `− ${money(s.home.mortgageBalance)}`],
    ];
    const body = [
      h('p', { class: 'big-number' + (s.home.equity < 0 ? ' negative' : '') }, money(s.home.equity)),
      h('p', { class: 'muted' }, 'Home equity = home value minus mortgage balance.'),
      dl(rows.concat(s.home.ltvPct != null ? [['Loan to value', pct(s.home.ltvPct, 0)]] : [])),
    ];

    if (m && m.termMonths > 0) {
      const saved = m.overpayment > 0 && m.monthsToClearWithoutOver > m.monthsToClear;
      body.push(
        h('h3', null, 'Mortgage'),
        dl([
          ['Monthly payment', money(m.payment)],
          m.overpayment > 0 ? ['Plus overpayment', money(m.overpayment)] : null,
          ['Mortgage-free in', months(m.monthsToClear)],
          saved ? ['Without overpayments', months(m.monthsToClearWithoutOver)] : null,
          saved ? ['Interest saved', money(m.interestSaved)] : null,
          ['Total interest to pay', money(m.totalInterest)],
        ]));
    }

    const rateChange = a.mortgageRateChangeYear != null && a.mortgageRateAfterChange != null
      ? `Rate changes to ${pct(a.mortgageRateAfterChange, 2)} after ${a.mortgageRateChangeYear} yr` : null;

    return h('section', { class: 'card', 'aria-labelledby': 'home-h' },
      h('h2', { id: 'home-h' }, 'Home equity'),
      s.home.value === 0 && s.home.mortgageBalance === 0
        ? h('p', { class: 'muted' }, 'No home or mortgage entered. If you own a home, add it in Setup.')
        : body,
      m ? chips([
        `Mortgage rate ${pct(a.mortgageRate, 2)}`,
        rateChange,
        `${p.mortgage.remainingTermYears || 0} years left`,
        `Overpayment warning above ${a.overpaymentLimitPct}% a year`,
        'Payment stays fixed; overpayments shorten the term',
      ]) : null);
  }

  function cashFlowCard(s, a, p) {
    const cf = s.cashFlow;
    const defaultRateUsed = s.debts.some((d) => d.rateIsDefault && d.balance > 0);
    return h('section', { class: 'card', 'aria-labelledby': 'cf-h' },
      h('h2', { id: 'cf-h' }, 'Monthly cash flow'),
      h('div', { class: 'pending' },
        h('strong', null, 'Take-home pay: coming in Stage 2.'),
        ` It will be worked out from your ${money(p.income.grossSalary)} salary (income tax, National Insurance, pension and student loan), and your monthly surplus will appear here.`),
      dl([
        ['Spending', money(cf.spendingMonthly)],
        ['Mortgage (incl. overpayment)', money(cf.mortgageMonthly)],
        ['Other debt payments', money(cf.debtMonthly)],
      ]),
      h('div', { class: 'total-row' }, h('span', null, 'Total going out'), h('strong', null, `${money(cf.outgoings)} a month`)),
      h('div', { class: 'total-row' }, h('span', null, 'Surplus (take-home − outgoings)'),
        h('strong', null, cf.surplus == null ? 'Stage 2' : money(cf.surplus))),
      chips([
        `${p.spending.filter((r) => r.monthly > 0).length} spending categories`,
        defaultRateUsed ? `Other debts default rate ${pct(a.otherDebtRate, 1)}` : null,
        `Mortgage rate ${pct(a.mortgageRate, 2)}`,
      ]));
  }

  function dl(rows) {
    return h('dl', { class: 'rows' }, rows.filter(Boolean).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));
  }

  FP.screens = FP.screens || {};
  FP.screens.today = { title: 'Today', render };
})(globalThis.FP = globalThis.FP || {});
