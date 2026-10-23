/*
 * The single shared data model. Every screen reads and writes one `profile` object.
 * This file owns its shape, field rules (labels, ranges, help text), parsing and
 * normalisation, so validation is identical wherever a value is edited.
 */
(function (FP) {
  'use strict';

  const SCHEMA_VERSION = 1;

  const STUDENT_LOAN_PLANS = [
    { value: 'none', label: 'None' },
    { value: 'plan1', label: 'Plan 1' },
    { value: 'plan2', label: 'Plan 2' },
    { value: 'plan4', label: 'Plan 4 (Scotland)' },
    { value: 'plan5', label: 'Plan 5' },
    { value: 'postgrad', label: 'Postgraduate loan' },
  ];

  const REGIONS = [
    { value: 'rUK', label: 'England, Wales or NI' },
    { value: 'scotland', label: 'Scotland' },
  ];

  const PENSION_METHODS = [
    { value: 'netPay', label: 'Taken before tax (net pay)' },
    { value: 'salarySacrifice', label: 'Salary sacrifice' },
    { value: 'reliefAtSource', label: 'Taken after tax (relief at source)' },
  ];

  const BONUS_MONTHS = [{ value: 'spread', label: 'Spread evenly' }].concat(
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      .map((m) => ({ value: m.slice(0, 3).toLowerCase(), label: m })));

  // Setup screen fields. `path` is where the value lives in the profile.
  // Fields under `assumptions.` are the same values shown in the Assumptions panel.
  const SECTIONS = [
    {
      id: 'about', title: 'About you',
      intro: 'Used to work out how many years until retirement.',
      fields: [
        { path: 'about.age', label: 'Your age', type: 'int', min: 16, max: 100, suffix: 'years', nullable: true,
          help: 'Your age today, in whole years.' },
      ],
    },
    {
      id: 'assets', title: 'What you own',
      intro: 'Today’s values. Leave anything that doesn’t apply blank.',
      fields: [
        { path: 'assets.homeValue', label: 'Home value', type: 'money',
          help: 'Roughly what your home would sell for today. Leave blank if you rent.' },
        { path: 'assets.cashSavings', label: 'Cash savings', type: 'money',
          help: 'Current accounts, savings accounts and cash ISAs.' },
        { path: 'assets.isa', label: 'Investments in ISAs', type: 'money',
          help: 'Stocks & shares ISAs and Lifetime ISAs.' },
        { path: 'assets.gia', label: 'Other investments (GIA)', type: 'money',
          help: 'General investment accounts held outside an ISA or pension.' },
        { path: 'assets.pension', label: 'Pension pots', type: 'money',
          help: 'Total of your defined-contribution pension pots.' },
        { path: 'assets.other', label: 'Other assets', type: 'money', advanced: true,
          help: 'Anything else you would count, such as a car. Treated as not growing.' },
      ],
    },
    {
      id: 'mortgage', title: 'Mortgage',
      intro: 'Leave the balance blank if you don’t have a mortgage.',
      fields: [
        { path: 'mortgage.balance', label: 'Mortgage balance', type: 'money',
          help: 'How much you still owe, from your latest statement.' },
        { path: 'assumptions.mortgageRate', label: 'Interest rate', type: 'pct', min: 0, max: 25, suffix: '% a year',
          help: 'Your current rate. Shared with the Assumptions panel.', shared: true },
        { path: 'mortgage.remainingTermYears', label: 'Years left on the mortgage', type: 'years', min: 0, max: 40, suffix: 'years',
          help: 'Remaining term, for example 22 or 22.5.' },
        { path: 'mortgage.monthlyOverpayment', label: 'Monthly overpayment', type: 'money', advanced: true,
          help: 'Extra paid on top of your normal payment each month. Most lenders allow up to 10% of the balance a year without a charge.' },
      ],
    },
    {
      id: 'income', title: 'Income',
      intro: 'Used to work out your take-home pay. The Income screen shows the full breakdown.',
      fields: [
        { path: 'income.region', label: 'Where you pay income tax', type: 'toggle', options: REGIONS,
          help: 'Scotland has its own income tax bands. National Insurance is the same everywhere.' },
        { path: 'income.grossSalary', label: 'Gross salary', type: 'money', suffix: 'a year',
          help: 'Your yearly salary before tax and deductions.' },
        { path: 'assumptions.employeePensionPct', label: 'Your pension contribution', type: 'pct', min: 0, max: 100, suffix: '% of salary',
          help: 'Shared with the Assumptions panel.', shared: true },
        { path: 'income.studentLoanPlan', label: 'Your plan', type: 'select', options: STUDENT_LOAN_PLANS, group: 'studentLoan',
          help: 'Your Student Loans Company account and payslip show it. As a guide: England or Wales courses from 1998 to 2011 are Plan 1, from 2012 to July 2023 Plan 2, from August 2023 Plan 5; Scotland Plan 4; Northern Ireland Plan 1.' },
        { path: 'income.studentLoanBalance', label: 'Balance', type: 'money', group: 'studentLoan',
          help: 'What you owe today, from your Student Loans Company online account. Leave blank and repayments simply carry on until you retire.' },
        { path: 'income.studentLoanStartYear', label: 'Year you were first due to repay', type: 'int', min: 1990, max: 2040, nullable: true, placeholder: 'e.g. 2016', group: 'studentLoan',
          help: 'The April after you left your course. Used to work out when any balance left is written off.' },
        { path: 'income.studentLoanRate', label: 'Your own interest rate (optional)', type: 'pct', min: 0, max: 20, nullable: true, suffix: '% a year', group: 'studentLoan',
          help: 'Leave blank to use your plan\u2019s current rate (Plan 2 depends on income). Whether it stays the same or follows inflation in future years is set in Assumptions.' },
        { path: 'assumptions.employerPensionPct', label: 'Employer pension contribution', type: 'pct', min: 0, max: 100, suffix: '% of salary',
          help: 'Shared with the Assumptions panel.', shared: true, advanced: true },
        { path: 'income.pensionMethod', label: 'How your pension is paid', type: 'select', options: PENSION_METHODS, advanced: true,
          help: 'Check your payslip or ask payroll. Net pay is the most common workplace scheme; salary sacrifice also saves National Insurance.' },
      ],
    },
  ];

  // Fields with a `group` are shown together under a heading.
  const FIELD_GROUPS = {
    studentLoan: {
      title: 'Student loan',
      intro: 'Repayments come out of your pay. Add your balance to see when the loan will be repaid or written off.',
    },
  };

  const DEBT_FIELDS = [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Car loan' },
    { key: 'balance', label: 'Balance', type: 'money' },
    { key: 'rate', label: 'Interest rate', type: 'pct', min: 0, max: 100, nullable: true, suffix: '%',
      help: 'Leave blank to use the default rate in Assumptions.' },
    { key: 'monthlyPayment', label: 'Monthly payment', type: 'money' },
  ];

  const SACRIFICE_TYPES = [
    { value: 'car', label: 'Car scheme' },
    { value: 'cycle', label: 'Cycle to work' },
    { value: 'other', label: 'Other (e.g. tech, holiday)' },
  ];
  const MAX_SACRIFICES = 10;
  const SACRIFICE_FIELDS = [
    { key: 'type', label: 'Type', type: 'select', options: SACRIFICE_TYPES },
    { key: 'monthly', label: 'Monthly amount', type: 'money',
      help: 'Taken from your salary before tax each month.' },
    { key: 'monthsLeft', label: 'Months left', type: 'int', min: 0, max: 600, nullable: true, placeholder: 'Ongoing',
      help: 'Leave blank if it carries on.' },
    { key: 'carValue', label: 'Car list price (P11D value)', type: 'money', carOnly: true,
      help: 'From your scheme quote. Used to work out the benefit-in-kind tax.' },
    { key: 'bikRate', label: 'Benefit-in-kind rate', type: 'pct', min: 0, max: 37, suffix: '% of list price', carOnly: true,
      help: 'Fully electric cars: 4% in 2026/27 (5% in 2027/28). Check your scheme quote.' },
  ];

  /*
   * What to do with money left over each month (after spending, debts and
   * regular savings): percentages that the projection shares it out by.
   */
  const LEFTOVER_FIELDS = [
    { key: 'emergency', label: 'Emergency fund', help: 'Easy-access cash until your cash savings cover your target number of months of essential outgoings. Once the fund is full, this share goes to your other choices instead.' },
    { key: 'debts', label: 'Paying off debts faster', help: 'Extra payments on your other debts, most expensive first. Once they\u2019re cleared, this share goes to your other choices.' },
    { key: 'cash', label: 'Cash savings', help: 'Easy-access cash for other goals, earning the savings rate.' },
    { key: 'invest', label: 'Investments', help: 'Into your stocks & shares ISA first, then a general investment account.' },
    { key: 'mortgage', label: 'Mortgage overpayments', help: 'Paid off the mortgage as a yearly lump sum, within your lender\u2019s overpayment limit (see Assumptions). Anything over the limit, or once the mortgage is cleared, goes to your other choices.' },
    { key: 'pension', label: 'Extra pension contributions', help: 'With 20% basic-rate tax relief added. Once you retire, this share goes to your other choices.' },
  ].map((f) => ({ ...f, type: 'pct', min: 0, max: 100, suffix: '% of what\u2019s left' }));
  const LEFTOVER_DEFAULT = { emergency: 10, debts: 0, cash: 20, invest: 50, mortgage: 10, pension: 10, emergencyMonths: 3 };
  // How many months of essential outgoings (spending, mortgage and debts) the emergency fund aims to cover.
  const EMERGENCY_MONTHS_FIELD = {
    key: 'emergencyMonths', label: 'Emergency fund target', type: 'int', min: 1, max: 24, suffix: 'months of outgoings',
    help: 'A common aim is 3 to 6 months. More if your income is irregular or you support others.',
  };

  const SAVING_TYPES = [
    { value: 'cash', label: 'Cash savings' },
    { value: 'cashIsa', label: 'Cash ISA' },
    { value: 'ssIsa', label: 'Stocks & shares ISA' },
  ];
  const MAX_SAVINGS = 12;
  const SAVING_FIELDS = [
    { key: 'type', label: 'Into', type: 'select', options: SAVING_TYPES },
    { key: 'monthly', label: 'Per month', type: 'money' },
    { key: 'grows', label: 'Each year', type: 'select', options: [
      { value: 'fixed', label: 'Stays the same' },
      { value: 'salary', label: 'Rises with pay' },
    ] },
  ];

  const MAX_BONUSES = 12;
  const BONUS_FIELDS = [
    { key: 'amount', label: 'Bonus amount', type: 'money' },
    { key: 'month', label: 'Paid in', type: 'select', options: BONUS_MONTHS },
  ];

  const SPENDING_FIELDS = [
    { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Groceries' },
    { key: 'monthly', label: 'Per month', type: 'money' },
  ];

  const DEFAULT_SPENDING_CATEGORIES = [
    'Bills & utilities', 'Council tax', 'Groceries', 'Transport', 'Childcare',
    'Insurance', 'Eating out & leisure', 'Holidays', 'Other',
  ];

  let idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return `${prefix}${Date.now().toString(36)}${idCounter}`;
  }

  function blank() {
    return {
      schemaVersion: SCHEMA_VERSION,
      isSample: false,
      about: { age: null },
      assets: { homeValue: 0, cashSavings: 0, isa: 0, gia: 0, pension: 0, other: 0 },
      mortgage: { balance: 0, remainingTermYears: 0, monthlyOverpayment: 0 },
      debts: [],
      income: {
        grossSalary: 0, bonuses: [], sacrifices: [], studentLoanPlan: 'none', studentLoanBalance: 0, studentLoanStartYear: null,
        studentLoanRate: null, region: 'rUK', pensionMethod: 'netPay',
      },
      savings: [],
      leftover: { ...LEFTOVER_DEFAULT },
      spending: DEFAULT_SPENDING_CATEGORIES.map((c) => ({ id: newId('s'), category: c, monthly: 0 })),
      assumptions: FP.assumptions.defaults(),
    };
  }

  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function set(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }

  function allFields() {
    return SECTIONS.flatMap((s) => s.fields);
  }

  function fieldFor(path) {
    return allFields().find((f) => f.path === path);
  }

  // Rules for an assumption, in the same shape as a Setup field.
  function assumptionField(key) {
    const d = FP.assumptions.def(key);
    if (!d) return null;
    const base = { path: `assumptions.${key}`, label: d.label, nullable: !!d.nullable };
    if (d.unit === 'choice') return { ...base, type: 'select', options: d.options };
    const type = d.unit === 'money' ? 'money' : d.unit === 'age' || d.unit === 'year' ? 'int' : 'pct';
    return { ...base, type, min: d.min, max: d.max };
  }

  /*
   * Parse what someone typed. Accepts "£250,000", "4.5%", " 12 ". Blank means 0
   * (or "not set" for nullable fields). Returns { ok, value, error }.
   */
  function parseValue(field, raw) {
    if (field.type === 'text') {
      return { ok: true, value: String(raw == null ? '' : raw).trim().slice(0, 60) };
    }
    if (field.type === 'select' || field.type === 'toggle') {
      const ok = field.options.some((o) => o.value === raw);
      return ok ? { ok: true, value: raw } : { ok: false, error: 'Choose an option from the list.' };
    }
    if (typeof raw === 'number') raw = String(raw);
    const text = String(raw == null ? '' : raw).replace(/[£,%\s]/g, '');
    if (text === '') {
      if (field.nullable) return { ok: true, value: null };
      return { ok: true, value: 0 };
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) {
      return { ok: false, error: 'Enter a number, like 1200 or 4.5.' };
    }
    const n = Number(text);
    if (!Number.isFinite(n)) return { ok: false, error: 'Enter a number.' };
    const min = field.min != null ? field.min : 0;
    if (n < min) {
      return { ok: false, error: min === 0 ? 'This can’t be negative.' : `Must be at least ${min}.` };
    }
    if (field.max != null && n > field.max) return { ok: false, error: `Must be ${field.max} or less.` };
    if (field.type === 'money' && n > 1e9) return { ok: false, error: 'That looks too large — check the number.' };
    if (field.type === 'int' && !Number.isInteger(n)) return { ok: false, error: 'Use a whole number.' };
    return { ok: true, value: n };
  }

  function coerce(field, raw, fallback) {
    const r = parseValue(field, raw);
    return r.ok ? r.value : fallback;
  }

  /*
   * Turn anything (an import, an old save) into a valid profile. Unknown keys are
   * dropped; missing or invalid values fall back to blanks/defaults.
   */
  function normalise(input) {
    const src = input && typeof input === 'object' ? input : {};
    const p = blank();
    p.isSample = src.isSample === true;

    allFields().forEach((f) => {
      if (f.path.startsWith('assumptions.')) return;
      const v = get(src, f.path);
      if (v !== undefined) set(p, f.path, coerce(f, v, get(p, f.path)));
    });

    const srcA = src.assumptions && typeof src.assumptions === 'object' ? src.assumptions : {};
    FP.assumptions.DEFS.forEach((d) => {
      if (srcA[d.key] === undefined) return;
      p.assumptions[d.key] = coerce(assumptionField(d.key), srcA[d.key], d.default);
    });

    if (Array.isArray(src.debts)) {
      p.debts = src.debts.filter((d) => d && typeof d === 'object').slice(0, 20).map((d) => normaliseRow(d, DEBT_FIELDS, 'd'));
    }
    const srcIncome = src.income && typeof src.income === 'object' ? src.income : {};
    if (Array.isArray(srcIncome.bonuses)) {
      p.income.bonuses = srcIncome.bonuses.filter((b) => b && typeof b === 'object').slice(0, MAX_BONUSES)
        .map((b) => normaliseRow(b, BONUS_FIELDS, 'b'));
    } else if (srcIncome.bonus !== undefined) {
      // Older saves had a single bonus (and later a month for it).
      const amount = coerce(BONUS_FIELDS[0], srcIncome.bonus, 0);
      if (amount > 0) p.income.bonuses = [normaliseRow({ amount, month: srcIncome.bonusMonth }, BONUS_FIELDS, 'b')];
    }
    if (Array.isArray(srcIncome.sacrifices)) {
      p.income.sacrifices = srcIncome.sacrifices.filter((x) => x && typeof x === 'object').slice(0, MAX_SACRIFICES)
        .map((x) => normaliseRow(x, SACRIFICE_FIELDS, 'ss'));
    }
    // The leftover split used to be four assumptions (splitCash, ...).
    const oldA = src.assumptions && typeof src.assumptions === 'object' ? src.assumptions : {};
    const leftoverSrc = src.leftover && typeof src.leftover === 'object'
      ? src.leftover
      : { cash: oldA.splitCash, invest: oldA.splitInvest, mortgage: oldA.splitMortgage, pension: oldA.splitPension };
    const hasSplit = LEFTOVER_FIELDS.some((f) => leftoverSrc[f.key] !== undefined);
    LEFTOVER_FIELDS.forEach((f) => {
      if (leftoverSrc[f.key] !== undefined) p.leftover[f.key] = coerce(f, leftoverSrc[f.key], LEFTOVER_DEFAULT[f.key]);
    });
    // Splits saved before the emergency fund share existed keep adding up as they did.
    if (hasSplit && leftoverSrc.emergency === undefined) p.leftover.emergency = 0;
    if (leftoverSrc.emergencyMonths !== undefined) {
      p.leftover.emergencyMonths = coerce(EMERGENCY_MONTHS_FIELD, leftoverSrc.emergencyMonths, LEFTOVER_DEFAULT.emergencyMonths);
    }
    if (Array.isArray(src.savings)) {
      p.savings = src.savings.filter((x) => x && typeof x === 'object').slice(0, MAX_SAVINGS)
        .map((x) => normaliseRow(x, SAVING_FIELDS, 'sv'));
    }
    if (Array.isArray(src.spending)) {
      p.spending = src.spending.filter((s) => s && typeof s === 'object').slice(0, 40).map((s) => normaliseRow(s, SPENDING_FIELDS, 's'));
    }
    return p;
  }

  function normaliseRow(src, fields, prefix) {
    const row = { id: typeof src.id === 'string' && src.id ? src.id.slice(0, 40) : newId(prefix) };
    fields.forEach((f) => {
      const fallback = f.type === 'text' ? '' : f.type === 'select' ? f.options[0].value : (f.nullable ? null : 0);
      row[f.key] = src[f.key] === undefined ? fallback : coerce(f, src[f.key], fallback);
    });
    return row;
  }

  function newDebt() {
    return { id: newId('d'), name: '', balance: 0, rate: null, monthlyPayment: 0 };
  }

  function newSacrifice(type) {
    const t = type || 'cycle';
    return {
      id: newId('ss'), type: t, monthly: 0, monthsLeft: null,
      carValue: 0, bikRate: t === 'car' ? FP.taxConfig.electricCarBikPct : 0,
    };
  }

  function newSaving(type) {
    return { id: newId('sv'), type: type || 'cash', monthly: 0, grows: 'fixed' };
  }

  function newBonus() {
    return { id: newId('b'), amount: 0, month: 'spread' };
  }

  function newSpending() {
    return { id: newId('s'), category: '', monthly: 0 };
  }

  FP.profile = {
    SCHEMA_VERSION, SECTIONS, FIELD_GROUPS, DEBT_FIELDS, SPENDING_FIELDS, STUDENT_LOAN_PLANS, REGIONS, PENSION_METHODS, BONUS_MONTHS, BONUS_FIELDS, MAX_BONUSES, SACRIFICE_TYPES, SACRIFICE_FIELDS, MAX_SACRIFICES, SAVING_TYPES, SAVING_FIELDS, MAX_SAVINGS, LEFTOVER_FIELDS, LEFTOVER_DEFAULT, EMERGENCY_MONTHS_FIELD,
    blank, get, set, fieldFor, assumptionField, parseValue, normalise, newDebt, newBonus, newSacrifice, newSaving, newSpending,
  };
})(globalThis.FP = globalThis.FP || {});
