/*
 * CSV files for spreadsheets: the year-by-year table (in today's money or
 * future money) and your commitments. Pure: text in, text out; the screens
 * download it (FP.dom.download). Amounts to the pound, dates as YYYY-MM-DD.
 */
(function (FP) {
  'use strict';

  // One field: quoted when it holds a comma, quote or line break (quotes doubled).
  function field(v) {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  // Rows (arrays) → CSV text, CRLF line ends as spreadsheets expect.
  const toCsv = (rows) => `${rows.map((r) => r.map(field).join(',')).join('\r\n')}\r\n`;

  /*
   * The year-by-year table's columns: [label, value(row), flow]. Flows are for
   * the year, so today's row has none. Shared with the table on Year by year.
   */
  const YEAR_COLUMNS = [
    ['Income after tax', (x) => x.netIncome + (x.eventsIn || 0), true],
    ['Spending', (x) => x.spending + (x.eventsOut || 0), true],
    ['Mortgage & debts', (x) => x.mortgagePaid + x.debtPaid + (x.studentLoanExtra || 0), true],
    ['Regular savings', (x) => x.regularSaving, true],
    ['Left over', (x) => x.surplus, true],
    ['Cash', (x) => x.cash],
    ['Investments', (x) => x.isa + x.gia],
    ['Pension pots', (x) => x.pension],
    ['Home equity', (x) => x.equity],
    ['Student loan', (x) => x.studentLoan],
    ['Other owed', (x) => x.debts + x.shortfall],
    ['Net worth', (x) => x.netWorth],
  ];

  /*
   * A projection's rows (FP.projection.project) as CSV: view 'real' (today's
   * money) or 'nominal' (future money). Today's row has no flows.
   */
  function yearByYear(proj, view) {
    const rows = view === 'real' ? proj.rows.map(FP.projection.toReal) : proj.rows;
    const money = view === 'real' ? 'today’s money' : 'future money';
    return toCsv([['Age', 'Year'].concat(YEAR_COLUMNS.map(([label]) => `${label} £ (${money})`))]
      .concat(rows.map((x) => [x.age, x.year].concat(YEAR_COLUMNS.map(([, fn, flow]) => {
        const v = fn(x);
        return x.today && flow ? '' : Number.isFinite(v) ? Math.round(v) : '';
      })))));
  }

  // Your commitments as CSV: what, amount, per, due, status, made.
  function commitments(list) {
    return toCsv([['What', 'Amount (£)', 'Per', 'Due', 'Status', 'Made']]
      .concat((list || []).map((c) => [c.what, c.amount == null ? '' : Math.round(c.amount * 100) / 100, c.per || '', c.due || '', c.status === 'done' ? 'Done' : 'To do', c.made || ''])));
  }

  FP.csv = { field, toCsv, YEAR_COLUMNS, yearByYear, commitments };
})(globalThis.FP = globalThis.FP || {});
