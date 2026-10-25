/*
 * The single shared data model. Every screen reads and writes one `profile` object.
 * This file owns its shape, field rules (labels, ranges, help text), parsing and
 * normalisation, so validation is identical wherever a value is edited.
 */
(function (FP) {
  'use strict';

  // The version of saved data. Older saves are upgraded by js/model/migrate.js.
  const SCHEMA_VERSION = 6;

  // How you've marked an idea. 'applied' (its change made to your plan) since version 4.
  const IDEA_MARKS = ['done', 'hidden', 'applied'];

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

  const RISK_LEVELS = [
    { value: '', label: 'Not sure yet' },
    { value: 'cautious', label: 'Cautious' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'adventurous', label: 'Adventurous' },
  ];

  /*
   * Your figures fields, in five sections: About you, Income, Outgoings
   * (your estimate here; bills, debt payments, other spending, saving and
   * money left over have their own editors), Assets and Debts. `path` is where the value lives in the profile. Fields
   * under `assumptions.` are the same values shown in the Assumptions panel.
   * Fields with a `group` sit under that group's heading; in Income every
   * group is folded under Advanced, beneath your salary.
   */
  const SECTIONS = [
    {
      id: 'about', title: 'About you',
      fields: [
        { path: 'about.age', label: 'Your age', type: 'int', min: 16, max: 100, suffix: 'years', nullable: true,
          help: 'Your age today, in whole years.' },
        { path: 'assumptions.retirementAge', label: 'When you\u2019d like to retire', type: 'int', min: 40, max: 80, suffix: 'years old',
          help: 'When your salary and workplace pension contributions stop.' },
        { path: 'goals.retirementIncome', label: 'What you\u2019d like to spend in retirement', type: 'money', suffix: 'a month', nullable: true,
          nullPlaceholder: 'Same as now',
          help: 'In today\u2019s money, on top of any mortgage or debts still being paid. Leave blank to aim for what you spend now.' },
        // Not used in the plan yet (see README): stored so it can be later.
        { path: 'about.riskAppetite', label: 'How do you feel about investment risk?', type: 'select', options: RISK_LEVELS,
          help: 'Cautious: you\u2019d rather grow slowly than see big falls. Adventurous: you can ride out falls for higher long-term growth. This doesn\u2019t change your plan yet.' },
      ],
    },
    {
      id: 'income', title: 'Income',
      fields: [
        { path: 'income.grossSalary', label: 'Gross salary', type: 'money', suffix: 'a year',
          help: 'Your yearly salary before tax and deductions. Leave blank if you\u2019re not working.' },
        { path: 'assumptions.employeePensionPct', label: 'Your pension contribution', type: 'pct', min: 0, max: 100, suffix: '% of salary', group: 'pension',
          help: 'What you pay in, from your payslip. 5% is the usual minimum for workplace pensions.', shared: true },
        { path: 'assumptions.employerPensionPct', label: 'Employer pension contribution', type: 'pct', min: 0, max: 100, suffix: '% of salary', group: 'pension',
          help: 'What your employer adds. 3% is the legal minimum; many pay more.', shared: true },
        { path: 'income.pensionMethod', label: 'How your pension is paid', type: 'select', options: PENSION_METHODS, group: 'pension',
          help: 'Check your payslip or ask payroll. Net pay is the most common workplace scheme; salary sacrifice also saves National Insurance.' },
        { path: 'income.studentLoanPlan', label: 'Your plan', type: 'select', options: STUDENT_LOAN_PLANS, group: 'studentLoan',
          help: 'Your Student Loans Company account and payslip show it. As a guide: England or Wales courses from 1998 to 2011 are Plan 1, from 2012 to July 2023 Plan 2, from August 2023 Plan 5; Scotland Plan 4; Northern Ireland Plan 1.' },
        { path: 'income.studentLoanBalance', label: 'Balance', type: 'money', group: 'studentLoan', needsPlan: true,
          help: 'What you owe today, from your Student Loans Company online account. Leave blank and repayments simply carry on until you retire.' },
        { path: 'income.studentLoanStartYear', label: 'Year you were first due to repay', type: 'int', min: 1990, max: 2040, nullable: true, placeholder: 'e.g. 2016', group: 'studentLoan', needsPlan: true,
          help: 'The April after you left your course. Used to work out when any balance left is written off.' },
        { path: 'income.studentLoanRate', label: 'Your own interest rate (optional)', type: 'pct', min: 0, max: 20, nullable: true, suffix: '% a year', group: 'studentLoan', more: true, needsPlan: true,
          help: 'Leave blank to use your plan\u2019s current rate (Plan 2 depends on income). Whether it stays the same or follows inflation in future years is set in Assumptions.' },
        { path: 'income.studentLoanOverpayment', label: 'Extra payments (optional)', type: 'money', suffix: 'a month', group: 'studentLoan', more: true, needsPlan: true,
          help: 'Voluntary payments on top of what comes out of your pay, from your take-home pay. They stop when the loan is repaid or written off. If it\u2019s likely to be written off, extra payments may be money you\u2019d never have had to pay.' },
        { path: 'income.taxCode', label: 'Tax code (optional)', type: 'taxcode', placeholder: 'e.g. 1257L', group: 'tax',
          help: 'On your payslip, P60 or the HMRC app. Leave blank for the standard allowance. A code starting with S uses Scottish rates.' },
        { path: 'income.region', label: 'Where you pay income tax', type: 'toggle', options: REGIONS, group: 'tax',
          help: 'Scotland has its own income tax bands. National Insurance is the same everywhere.' },
        { path: 'income.otherIncome', label: 'Other taxable income', type: 'money', suffix: 'a year', group: 'otherIncome',
          help: 'Before tax: for example rental profit, self-employment or a second job paid gross. Income tax is worked out on it with your salary; National Insurance and student loan on it aren\u2019t modelled.' },
        { path: 'income.taxFreeIncome', label: 'Tax-free income', type: 'money', suffix: 'a year', group: 'otherIncome',
          help: 'Income you don\u2019t pay tax on, for example some benefits or tax-free allowances you receive regularly.' },
        { path: 'income.otherIncomeAfterRetirement', label: 'Does it carry on after you retire?', type: 'toggle', group: 'otherIncome',
          options: [{ value: 'no', label: 'No, it stops' }, { value: 'yes', label: 'Yes' }],
          help: 'Both amounts rise with inflation in your projection.' },
      ],
    },
    {
      id: 'outgoings', title: 'Outgoings',
      fields: [
        { path: 'outgoings.estimate', label: 'Everything going out each month', type: 'money', suffix: 'a month', nullable: true,
          nullPlaceholder: 'Not set',
          help: 'All of it: rent or mortgage, bills, loan and card payments, food, travel and the rest (not what you save). An estimate is fine \u2014 you can refine it later.' },
      ],
    },
    {
      id: 'assets', title: 'Assets',
      intro: 'What you own today. Leave anything that doesn\u2019t apply blank.',
      fields: [
        { path: 'assets.homeValue', label: 'Home value', type: 'money',
          help: 'Roughly what your home would sell for today. Leave blank if you rent.' },
        { path: 'assets.cashSavings', label: 'Cash savings', type: 'money',
          help: 'Current accounts, savings accounts and cash ISAs.' },
        { path: 'assets.pension', label: 'Pension pots', type: 'money',
          help: 'Total of your defined-contribution pension pots.' },
        { path: 'assets.isa', label: 'Investments in ISAs', type: 'money',
          help: 'Stocks & shares ISAs and Lifetime ISAs.' },
        { path: 'assets.gia', label: 'Other investments (GIA)', type: 'money', advanced: true,
          help: 'General investment accounts held outside an ISA or pension.' },
        { path: 'assets.other', label: 'Other assets', type: 'money', advanced: true,
          help: 'Anything else you would count, such as a car. Treated as not growing.' },
      ],
    },
    {
      id: 'debts', title: 'Debts',
      intro: 'What you owe. Leave anything that doesn\u2019t apply blank. Your student loan is under Income, as it\u2019s repaid from your pay.',
      fields: [
        { path: 'mortgage.balance', label: 'Mortgage balance', type: 'money', group: 'mortgage',
          help: 'How much you still owe, from your latest statement. Leave blank if you don\u2019t have one.' },
        { path: 'assumptions.mortgageRate', label: 'Interest rate (yearly rate, not APRC)', type: 'pct', min: 0, max: 25, suffix: '% a year', group: 'mortgage', needsMortgage: true, nullable: true,
          nullPlaceholder: 'Not sure',
          help: 'The rate on your current deal, from your mortgage offer or statement (not the APRC, which includes fees).' },
        { path: 'mortgage.remainingTermYears', label: 'Time left', type: 'term', store: 'years', min: 0, max: 40, group: 'mortgage', needsMortgage: true,
          help: 'How long until it\u2019s paid off, from your statement.' },
        { path: 'mortgage.monthlyPayment', label: 'Monthly payment', type: 'money', suffix: 'a month', group: 'mortgage', needsMortgage: true, nullable: true,
          nullPlaceholder: 'Not sure',
          help: 'Your normal payment, without overpayments. Also under Debt payments in Outgoings.' },
        { path: 'mortgage.monthlyOverpayment', label: 'Monthly overpayment', type: 'money', group: 'mortgage', more: true, needsMortgage: true,
          help: 'Extra paid on top of your normal payment each month. Most lenders allow up to 10% of the balance a year without a charge.' },
      ],
    },
  ];

  // Headings for groups of fields.
  const FIELD_GROUPS = {
    pension: { title: 'Workplace pension', intro: 'Usually on your payslip.' },
    studentLoan: { title: 'Student loan', intro: 'Repayments come out of your pay. Add your balance to see when the loan will be repaid or written off.' },
    tax: { title: 'Tax code and where you live' },
    otherIncome: { title: 'Other income', intro: 'Income on top of your salary.' },
    mortgage: { title: 'Mortgage' },
  };

  const DEBT_FIELDS = [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Car loan' },
    { key: 'balance', label: 'Balance', type: 'money' },
    { key: 'monthlyPayment', label: 'Monthly payment', type: 'money', suffix: 'a month' },
    { key: 'termMonths', label: 'Time left', type: 'term', store: 'months', min: 0, max: 600, nullable: true,
      help: 'Until it\u2019s paid off, if it has a fixed end (not for credit cards).' },
    { key: 'rate', label: 'Interest rate (APR)', type: 'pct', min: 0, max: 100, nullable: true, suffix: '% APR',
      help: 'From your statement (for a credit card, the purchase APR). Not sure? Leave it blank.' },
  ];

  // Taxable workplace benefits (benefits in kind): taxed as income, no employee NI.
  const BENEFIT_TYPES = [
    { value: 'medical', label: 'Private medical insurance' },
    { value: 'other', label: 'Other taxable benefit' },
  ];
  const MAX_BENEFITS = 6;
  const BENEFIT_FIELDS = [
    { key: 'type', label: 'Benefit', type: 'select', options: BENEFIT_TYPES },
    { key: 'yearly', label: 'Taxable value', type: 'money', suffix: 'a year',
      help: 'The cash equivalent on your P11D or payslip. For medical cover it\u2019s usually what your employer pays for it.' },
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
  // Nothing is saved until you choose: unchosen leftover money is treated as spent.
  const LEFTOVER_DEFAULT = { unit: 'pct', emergency: 0, debts: 0, cash: 0, invest: 0, mortgage: 0, pension: 0, emergencyMonths: 3 };
  // A leftover choice as % of what's left (unit 'pct') or £ a month (unit 'gbp').
  function leftoverField(f, unit) {
    return unit === 'gbp' ? { ...f, type: 'money', min: 0, max: undefined, suffix: 'a month' } : f;
  }
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

  // Spending under Outgoings is in two folds: bills, and everything else.
  const SPENDING_GROUPS = [
    { value: 'other', label: 'Other' },
    { value: 'bills', label: 'Bills' },
  ];
  const SPENDING_FIELDS = [
    { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Groceries' },
    { key: 'monthly', label: 'Per month', type: 'money' },
    { key: 'group', label: 'Kind', type: 'select', options: SPENDING_GROUPS },
  ];

  /*
   * The rest of your estimate: a spending row of its own (rest: true) holding
   * whatever of your estimate of everything going out isn't itemised yet.
   * FP.summary.syncOutgoings keeps it up to date.
   */
  const REST_CATEGORY = 'Rest of your estimate';
  const newRest = () => ({ id: newId('s'), category: REST_CATEGORY, monthly: 0, group: 'other', rest: true });

  let idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return `${prefix}${Date.now().toString(36)}${idCounter}`;
  }

  function blank() {
    return {
      schemaVersion: SCHEMA_VERSION,
      isSample: false,
      about: { age: null, riskAppetite: '', name: '' },
      assets: { homeValue: 0, cashSavings: 0, isa: 0, gia: 0, pension: 0, other: 0 },
      mortgage: { balance: 0, remainingTermYears: 0, monthlyPayment: null, monthlyOverpayment: 0 },
      debts: [],
      income: {
        grossSalary: 0, bonuses: [], sacrifices: [], benefits: [], otherIncome: 0, taxFreeIncome: 0, otherIncomeAfterRetirement: 'no', studentLoanPlan: 'none', studentLoanBalance: 0, studentLoanStartYear: null,
        studentLoanRate: null, studentLoanOverpayment: 0, taxCode: '', benefitsTaxed: 'payroll', region: 'rUK', pensionMethod: 'netPay',
      },
      savings: [],
      leftover: { ...LEFTOVER_DEFAULT },
      // What you're aiming for. retirementIncome: a month in today's money, or null for "what you spend now".
      goals: { retirementIncome: null },
      // estimate: everything going out a month (spending, mortgage and debt payments), or null.
      outgoings: { estimate: null },
      // Ideas you've marked done, hidden or applied to your plan: { [idea id]: 'done' | 'hidden' | 'applied' }.
      ideas: {},
      spending: [newRest()],
      assumptions: FP.assumptions.defaults(),
      // A partner, planned together with you (see partnerOf), or null for just you.
      partner: null,
      // Pensions besides your main pot (assets.pension) and your partner's (see PENSION_FIELDS).
      pensions: [],
      // Who owns an asset or the mortgage, where it isn't you: { 'assets.isa': 'partner', mortgage: 'joint' }.
      owners: {},
    };
  }

  /*
   * Household mode: up to two people. You are person 1, in the profile's own
   * fields (about, income, and retirement and State Pension in assumptions);
   * a partner, if there is one, is profile.partner, in the same shape:
   * { name, age, retirementAge, statePension, statePensionAge,
   *   employeePensionPct, employerPensionPct, pension (their main pot), income }.
   */
  const OWNERS = ['you', 'partner', 'joint'];
  const MAX_PENSIONS = 12;
  const PENSION_TYPES = [
    { value: 'dc', label: 'Defined contribution (a pot)' },
    { value: 'db', label: 'Defined benefit (a yearly income)' },
  ];
  // Pensions besides the main pots. A pot (dc) grows and you draw on it from its
  // access age; a defined benefit pension (db) pays a yearly income from its start age.
  const PENSION_FIELDS = [
    { key: 'type', label: 'Type', type: 'select', options: PENSION_TYPES },
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Old workplace pension' },
    { key: 'value', label: 'Value today', type: 'money' },
    { key: 'income', label: 'Income', type: 'money', suffix: 'a year',
      help: 'From your statement, in today\u2019s money. It rises with inflation and is taxed as income.' },
    { key: 'accessAge', label: 'From age', type: 'int', min: 50, max: 80, nullable: true, placeholder: 'e.g. 57' },
    { key: 'monthly', label: 'You pay in', type: 'money', suffix: 'a month',
      help: 'From your take-home pay, with 20% tax relief added, until its owner retires.' },
  ];

  // Who the plan is for: asked first in the quick start and About you.
  const HOUSEHOLD_FIELD = {
    path: 'household', label: 'Who is this plan for?', type: 'toggle',
    options: [{ value: 'me', label: 'Just me' }, { value: 'couple', label: 'Me and a partner' }],
    help: 'With a partner, each of you has your own pay, tax, pensions and State Pension; spending and savings are worked out together.',
  };
  const NAME_FIELD = { path: 'about.name', label: 'Your name (optional)', type: 'text', placeholder: 'e.g. Alex',
    help: 'Shown on the switch between your figures and your partner’s.' };
  // Your partner's figures in About you (and the first four in the quick start).
  const PARTNER_FIELDS = [
    { path: 'partner.name', label: 'Your partner’s name (optional)', type: 'text', placeholder: 'e.g. Sam',
      help: 'So results can say whose is whose, as in “Sam’s ISA allowance”.' },
    { path: 'partner.age', label: 'Their age', type: 'int', min: 16, max: 100, suffix: 'years', nullable: true,
      help: 'Their age today, in whole years. Left blank, they’re taken to be your age.' },
    { path: 'partner.income.grossSalary', label: 'Their gross salary', type: 'money', suffix: 'a year',
      help: 'Their yearly salary before tax. Leave blank if they’re not working.' },
    { path: 'partner.retirementAge', label: 'When they’d like to retire', type: 'int', min: 40, max: 80, suffix: 'years old',
      help: 'When their salary and workplace pension contributions stop. Your plan’s retirement goal starts once you’ve both retired.' },
    { path: 'partner.statePension', label: 'Their State Pension', type: 'money', max: 50000, suffix: 'a year', more: true,
      help: 'In today’s money, from their forecast on GOV.UK. The full new State Pension is the default.' },
    { path: 'partner.statePensionAge', label: 'Their State Pension age', type: 'int', min: 60, max: 75, suffix: 'years old', more: true,
      help: 'From their forecast. It depends on their date of birth.' },
  ];

  // Each person, in the same shape: you (from your own fields), then any partner.
  function people(p) {
    const a = p.assumptions;
    const you = {
      index: 0, id: 'you', name: (p.about && p.about.name) || '', age: p.about.age,
      retirementAge: a.retirementAge, statePension: a.statePension, statePensionAge: a.statePensionAge,
      employeePensionPct: a.employeePensionPct, employerPensionPct: a.employerPensionPct,
      pension: p.assets.pension || 0, income: p.income,
    };
    return p.partner ? [you, { index: 1, id: 'partner', ...p.partner }] : [you];
  }

  /*
   * Names for results: person 0 is always "you" (the planner speaks to you);
   * a partner goes by their name, or "your partner" without one.
   * whose(p, 1) → "Sam’s"; who(p, 1) → "Sam"; whose(p, 0) → "your".
   */
  function who(p, index) {
    if (!index) return 'you';
    return (p.partner && p.partner.name) || 'your partner';
  }
  function whose(p, index) {
    if (!index) return 'your';
    return p.partner && p.partner.name ? `${p.partner.name}’s` : 'your partner’s';
  }
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Where a field of yours lives for a person: income.* and your pension and
  // retirement figures under partner.* for your partner; unchanged for you.
  const PARTNER_PATHS = {
    'about.age': 'partner.age', 'about.name': 'partner.name', 'assets.pension': 'partner.pension',
    'assumptions.retirementAge': 'partner.retirementAge', 'assumptions.statePension': 'partner.statePension',
    'assumptions.statePensionAge': 'partner.statePensionAge',
    'assumptions.employeePensionPct': 'partner.employeePensionPct', 'assumptions.employerPensionPct': 'partner.employerPensionPct',
  };
  function personPath(index, path) {
    if (!index) return path;
    if (PARTNER_PATHS[path]) return PARTNER_PATHS[path];
    return path.startsWith('income.') ? `partner.${path}` : null;
  }

  /*
   * The plan as one person's alone, in your own fields, so pay and tax can be
   * worked out (and edited) for them with the same code as yours. Their income
   * object is shared, not copied: edits to its lists land in the plan.
   */
  function asPerson(p, index) {
    if (!index || !p.partner) return p;
    const x = p.partner;
    return {
      ...p,
      about: { ...p.about, age: x.age == null ? p.about.age : x.age, name: x.name },
      income: x.income,
      assets: { ...p.assets, pension: x.pension },
      assumptions: { ...p.assumptions, retirementAge: x.retirementAge, statePension: x.statePension, statePensionAge: x.statePensionAge,
        employeePensionPct: x.employeePensionPct, employerPensionPct: x.employerPensionPct },
      partner: null,
    };
  }

  /*
   * Adds a partner (or brings back the one `kept` holds), or takes yours off
   * the plan. Taking them off returns what's needed to bring them back: their
   * figures, their pensions, and what they owned. What they owned becomes
   * yours; their pensions go with them.
   */
  function addPartner(p, kept) {
    if (p.partner) return;
    if (!kept) { p.partner = newPartner(p); return; }
    p.partner = kept.partner;
    p.pensions = p.pensions.concat(kept.pensions);
    kept.rows.forEach(([list, id, owner]) => { const r = (p[list] || []).find((x) => x.id === id); if (r) r.owner = owner; });
    Object.assign(p.owners, kept.owners);
  }
  function removePartner(p) {
    if (!p.partner) return null;
    const kept = { partner: p.partner, pensions: p.pensions.filter((x) => x.owner === 'partner'), rows: [], owners: { ...p.owners } };
    ['debts', 'savings'].forEach((list) => (p[list] || []).forEach((r) => {
      if (r.owner) { kept.rows.push([list, r.id, r.owner]); delete r.owner; }
    }));
    p.pensions = p.pensions.filter((x) => x.owner !== 'partner');
    p.owners = {};
    p.partner = null;
    return kept;
  }

  function newPension(type, owner) {
    return { id: newId('pn'), type: type || 'dc', name: '', value: 0, income: 0, accessAge: null, monthly: 0, owner: owner || 'you' };
  }

  function newPartner(p) {
    const a = (p && p.assumptions) || FP.assumptions.defaults();
    return {
      name: '', age: null, retirementAge: a.retirementAge, statePension: a.statePension, statePensionAge: a.statePensionAge,
      employeePensionPct: FP.assumptions.def('employeePensionPct').default, employerPensionPct: FP.assumptions.def('employerPensionPct').default,
      pension: 0, income: blank().income,
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
    if (field.type === 'taxcode') {
      const c = FP.tax.parseTaxCode(raw);
      if (c.empty) return { ok: true, value: '' };
      return c.ok ? { ok: true, value: c.code } : { ok: false, error: c.error };
    }
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
   * Turn anything into a valid profile in today's shape. Unknown keys are
   * dropped; missing or invalid values fall back to blanks/defaults. Older
   * saves are upgraded to today's shape first, by FP.migrate.
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
    }
    if (Array.isArray(srcIncome.sacrifices)) {
      p.income.sacrifices = srcIncome.sacrifices.filter((x) => x && typeof x === 'object').slice(0, MAX_SACRIFICES)
        .map((x) => normaliseRow(x, SACRIFICE_FIELDS, 'ss'));
    }
    if (srcIncome.benefitsTaxed === 'code') p.income.benefitsTaxed = 'code';
    if (Array.isArray(srcIncome.benefits)) {
      p.income.benefits = srcIncome.benefits.filter((x) => x && typeof x === 'object').slice(0, MAX_BENEFITS)
        .map((x) => normaliseRow(x, BENEFIT_FIELDS, 'bk'));
    }
    const leftoverSrc = src.leftover && typeof src.leftover === 'object' ? src.leftover : {};
    p.leftover.unit = leftoverSrc.unit === 'gbp' ? 'gbp' : 'pct';
    LEFTOVER_FIELDS.forEach((f) => {
      if (leftoverSrc[f.key] !== undefined) p.leftover[f.key] = coerce(leftoverField(f, p.leftover.unit), leftoverSrc[f.key], LEFTOVER_DEFAULT[f.key]);
    });
    if (leftoverSrc.emergencyMonths !== undefined) {
      p.leftover.emergencyMonths = coerce(EMERGENCY_MONTHS_FIELD, leftoverSrc.emergencyMonths, LEFTOVER_DEFAULT.emergencyMonths);
    }
    if (src.ideas && typeof src.ideas === 'object') {
      Object.entries(src.ideas).slice(0, 40).forEach(([k, v]) => {
        if (/^[a-zA-Z]{1,30}$/.test(k) && IDEA_MARKS.includes(v)) p.ideas[k] = v;
      });
    }
    if (Array.isArray(src.savings)) {
      p.savings = src.savings.filter((x) => x && typeof x === 'object').slice(0, MAX_SAVINGS)
        .map((x) => normaliseRow(x, SAVING_FIELDS, 'sv'));
    }
    p.about.name = typeof (src.about || {}).name === 'string' ? src.about.name.replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    // Owners other than you, on rows (debts, regular savings) and on assets and the mortgage.
    const ownerOf = (v) => (v === 'partner' || v === 'joint' ? v : null);
    if (Array.isArray(src.debts)) src.debts.filter((d) => d && typeof d === 'object').slice(0, 20).forEach((d, i) => { if (ownerOf(d.owner)) p.debts[i].owner = d.owner; });
    if (Array.isArray(src.savings)) src.savings.filter((x) => x && typeof x === 'object').slice(0, MAX_SAVINGS).forEach((x, i) => { if (ownerOf(x.owner)) p.savings[i].owner = x.owner; });
    if (src.owners && typeof src.owners === 'object') {
      ['assets.homeValue', 'assets.cashSavings', 'assets.isa', 'assets.gia', 'assets.other', 'mortgage'].forEach((k) => { if (ownerOf(src.owners[k])) p.owners[k] = src.owners[k]; });
    }
    p.partner = normalisePartner(src.partner, p);
    if (Array.isArray(src.pensions)) {
      p.pensions = src.pensions.filter((x) => x && typeof x === 'object').slice(0, MAX_PENSIONS).map((x) => {
        const row = normaliseRow(x, PENSION_FIELDS, 'pn');
        // A partner's pension only while there's a partner.
        row.owner = x.owner === 'partner' && p.partner ? 'partner' : 'you';
        return row;
      });
    }
    if (Array.isArray(src.spending)) {
      const rows = src.spending.filter((s) => s && typeof s === 'object').slice(0, 40);
      const restAt = rows.findIndex((s) => s.rest === true);
      p.spending = rows.map((s, i) => {
        const row = normaliseRow(s, SPENDING_FIELDS, 's');
        if (i === restAt) Object.assign(row, { rest: true, group: 'other', category: REST_CATEGORY });
        return row;
      });
    }
    return p;
  }

  // A partner's figures, cleaned up like your own (their pay with the same rules), or null.
  function normalisePartner(src, p) {
    if (!src || typeof src !== 'object') return null;
    const d = newPartner(p);
    const field = (f, v, fallback) => (v === undefined ? fallback : coerce(f, v, fallback));
    return {
      name: typeof src.name === 'string' ? src.name.replace(/\s+/g, ' ').trim().slice(0, 30) : '',
      age: field({ type: 'int', min: 16, max: 100, nullable: true }, src.age, null),
      retirementAge: field(assumptionField('retirementAge'), src.retirementAge, d.retirementAge),
      statePension: field(assumptionField('statePension'), src.statePension, d.statePension),
      statePensionAge: field(assumptionField('statePensionAge'), src.statePensionAge, d.statePensionAge),
      employeePensionPct: field(assumptionField('employeePensionPct'), src.employeePensionPct, d.employeePensionPct),
      employerPensionPct: field(assumptionField('employerPensionPct'), src.employerPensionPct, d.employerPensionPct),
      pension: field({ type: 'money' }, src.pension, 0),
      income: normalise({ income: src.income }).income,
    };
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
    return { id: newId('d'), name: '', balance: 0, rate: null, monthlyPayment: 0, termMonths: null };
  }

  function newBenefit(type) {
    return { id: newId('bk'), type: type || 'medical', yearly: 0 };
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

  function newSpending(group) {
    return { id: newId('s'), category: '', monthly: 0, group: group || 'other' };
  }

  FP.profile = {
    SCHEMA_VERSION, IDEA_MARKS, OWNERS, PENSION_TYPES, PENSION_FIELDS, MAX_PENSIONS, people, newPartner, newPension, addPartner, removePartner,
    who, whose, capital, personPath, asPerson, PARTNER_FIELDS, NAME_FIELD, HOUSEHOLD_FIELD, SECTIONS, FIELD_GROUPS, RISK_LEVELS, DEBT_FIELDS, SPENDING_FIELDS, SPENDING_GROUPS, REST_CATEGORY, STUDENT_LOAN_PLANS, REGIONS, PENSION_METHODS, BONUS_MONTHS, BONUS_FIELDS, MAX_BONUSES, SACRIFICE_TYPES, SACRIFICE_FIELDS, MAX_SACRIFICES, BENEFIT_TYPES, BENEFIT_FIELDS, MAX_BENEFITS, SAVING_TYPES, SAVING_FIELDS, MAX_SAVINGS, LEFTOVER_FIELDS, LEFTOVER_DEFAULT, EMERGENCY_MONTHS_FIELD, leftoverField,
    blank, get, set, fieldFor, assumptionField, parseValue, normalise, newDebt, newBonus, newBenefit, newSacrifice, newSaving, newSpending, newRest,
  };
})(globalThis.FP = globalThis.FP || {});
