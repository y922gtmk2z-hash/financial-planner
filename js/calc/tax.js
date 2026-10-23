/*
 * UK take-home pay for an employee. Pure functions, no DOM.
 * All amounts are yearly. Rules come from FP.taxConfig (one tax year).
 *
 * Simplifications (stated on the Income screen):
 * - Worked out on yearly pay; payroll calculates NI per pay period, so a bonus
 *   paid in one month can change the real figure slightly.
 * - Employment income only: no savings, dividend or rental income, no
 *   benefits in kind, no Marriage Allowance, standard tax code.
 */
(function (FP) {
  'use strict';

  const round2 = (n) => Math.round(n * 100) / 100;

  function personalAllowance(adjustedNetIncome, cfg) {
    const over = Math.max(0, adjustedNetIncome - cfg.taperThreshold);
    return Math.max(0, cfg.personalAllowance - over * cfg.taperRate);
  }

  /*
   * Income tax on `taxable` income using `bands`. `extendBy` widens the limit of
   * every band taxed at `extendFromRate` or more - used for relief-at-source
   * pension contributions, which extend the basic and higher rate limits (but
   * not the Scottish starter band, which is below the 20% relief rate).
   */
  function incomeTax(taxable, bands, extendBy, extendFromRate) {
    let lower = 0;
    let total = 0;
    const byBand = bands.map((b) => {
      const extend = b.rate >= (extendFromRate || 0) ? extendBy || 0 : 0;
      const upper = b.upTo == null ? Infinity : b.upTo + extend;
      const amount = Math.max(0, Math.min(taxable, upper) - lower);
      const tax = (amount * b.rate) / 100;
      lower = Math.max(lower, upper);
      total += tax;
      return { name: b.name, rate: b.rate, grossLabel: b.grossLabel, amount, tax };
    });
    return { total, byBand };
  }

  function nationalInsurance(niablePay, ni) {
    const main = Math.max(0, Math.min(niablePay, ni.upperEarningsLimit) - ni.primaryThreshold);
    const upper = Math.max(0, niablePay - ni.upperEarningsLimit);
    return (main * ni.mainRate) / 100 + (upper * ni.upperRate) / 100;
  }

  function studentLoan(pay, plan, cfg) {
    const rule = cfg.studentLoans[plan];
    if (!rule) return 0;
    // Repayments are made in whole pounds per pay period; yearly figure is close enough.
    return Math.max(0, pay - rule.threshold) * rule.rate / 100;
  }

  // Whole-year figures, treating pay as spread evenly over 12 months.
  // input.bonus here is the year's total bonus.
  function yearly(input, cfg) {
    const salary = Math.max(0, input.salary || 0);
    const bonus = Math.max(0, input.bonus || 0);
    const gross = salary + bonus;
    const method = input.pensionMethod || 'netPay';
    const bands = cfg.bands[input.region === 'scotland' ? 'scotland' : 'rUK'];

    // Your contribution, before any tax relief, capped at your pay.
    const pensionGross = Math.min(gross, salary * Math.max(0, input.employeePensionPct || 0) / 100);
    const employerPension = salary * Math.max(0, input.employerPensionPct || 0) / 100;

    let payForTax = gross;
    let payForNi = gross;
    let pensionFromPay = 0; // what actually leaves your pay packet
    let bandExtension = 0;
    let adjustedNetIncome = gross;

    if (method === 'salarySacrifice') {
      payForTax = gross - pensionGross;
      payForNi = gross - pensionGross;
      adjustedNetIncome = payForTax;
    } else if (method === 'reliefAtSource') {
      const reliefRate = cfg.reliefAtSourceRate / 100;
      pensionFromPay = pensionGross * (1 - reliefRate);
      bandExtension = pensionGross;
      adjustedNetIncome = gross - pensionGross;
    } else {
      payForTax = gross - pensionGross;
      pensionFromPay = pensionGross;
      adjustedNetIncome = payForTax;
    }

    const allowance = personalAllowance(adjustedNetIncome, cfg);
    const taxable = Math.max(0, payForTax - allowance);
    const tax = incomeTax(taxable, bands, bandExtension, cfg.reliefAtSourceRate);
    const ni = nationalInsurance(payForNi, cfg.nationalInsurance);
    // Student loan is based on pay after salary sacrifice, but before other pension.
    const sl = studentLoan(payForNi, input.studentLoanPlan, cfg);
    const sacrificed = method === 'salarySacrifice' ? pensionGross : 0;
    const net = gross - sacrificed - pensionFromPay - tax.total - ni - sl;

    return {
      taxYear: cfg.taxYear,
      region: input.region === 'scotland' ? 'scotland' : 'rUK',
      pensionMethod: method,
      salary,
      bonus,
      gross,
      personalAllowance: allowance,
      taxable,
      incomeTax: round2(tax.total),
      taxByBand: tax.byBand,
      nationalInsurance: round2(ni),
      studentLoan: round2(sl),
      // Taken from your pay for your pension (after relief for relief at source,
      // or the sacrificed salary for salary sacrifice).
      pensionFromPay: round2(pensionFromPay + sacrificed),
      // What lands in your pension pot each year.
      pensionIntoPot: round2(pensionGross + employerPension),
      employeePension: round2(pensionGross),
      employerPension: round2(employerPension),
      takeHome: round2(net),
      takeHomeMonthly: round2(net / 12),
      niablePay: payForNi,
    };
  }

  const PAYSLIP_KEYS = ['gross', 'pensionFromPay', 'incomeTax', 'nationalInsurance', 'studentLoan', 'takeHome'];

  function payslip(values) {
    const out = {};
    PAYSLIP_KEYS.forEach((k) => { out[k] = round2(values[k]); });
    return out;
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // Valid bonuses as [{ amount, month }], dropping blanks and zeros.
  function bonusList(input) {
    return (Array.isArray(input.bonuses) ? input.bonuses : [])
      .map((b) => ({ amount: Math.max(0, (b && b.amount) || 0), month: b && MONTHS.includes(b.month) ? b.month : 'spread' }))
      .filter((b) => b.amount > 0);
  }

  /*
   * input: { salary, bonuses: [{ amount, month }], employeePensionPct,
   *          employerPensionPct, pensionMethod, studentLoanPlan,
   *          region: 'rUK' | 'scotland' }
   * Pension contributions are a % of salary (not bonus).
   *
   * A bonus with month 'spread' is spread evenly over the year. A bonus with a
   * month ('jan'...'dec') is paid in that month: NI and student loan are then
   * worked out on that month's pay, as payroll does, and income tax uses the
   * yearly (cumulative PAYE) position, so bonus months carry the extra tax
   * (shared in proportion to the bonus paid in each).
   *
   * takeHomeMonthly is a regular month's pay: it includes spread bonuses but
   * not bonuses paid in a particular month.
   */
  function takeHome(input, cfg) {
    cfg = cfg || FP.taxConfig;
    const bonuses = bonusList(input);
    const total = bonuses.reduce((s, b) => s + b.amount, 0);
    const spread = bonuses.filter((b) => b.month === 'spread').reduce((s, b) => s + b.amount, 0);
    const year = yearly({ ...input, bonus: total }, cfg);

    // Lump sums by month, in calendar order.
    const lumps = MONTHS
      .map((m) => ({ month: m, amount: bonuses.filter((b) => b.month === m).reduce((s, b) => s + b.amount, 0) }))
      .filter((l) => l.amount > 0);

    const shared = { ...year, bonuses, bonusSpread: spread };
    if (!lumps.length) {
      const regular = payslip(Object.fromEntries(PAYSLIP_KEYS.map((k) => [k, year[k] / 12])));
      return { ...shared, regularMonth: regular, bonusPayments: [] };
    }

    // A regular month is 1/12 of the year with only the spread bonuses. NI and
    // student loan thresholds are pro rata per month, so this matches payroll.
    const base = yearly({ ...input, bonus: spread }, cfg);
    const reg = Object.fromEntries(PAYSLIP_KEYS.map((k) => [k, base[k] / 12]));
    const lumpTotal = total - spread;
    const extraTax = year.incomeTax - base.incomeTax;

    const bonusPayments = lumps.map((l) => {
      const monthPay = base.niablePay / 12 + l.amount;
      const ni = nationalInsurance(monthPay * 12, cfg.nationalInsurance) / 12;
      const sl = studentLoan(monthPay * 12, input.studentLoanPlan, cfg) / 12;
      const tax = reg.incomeTax + extraTax * (l.amount / lumpTotal);
      const gross = reg.gross + l.amount;
      const net = gross - reg.pensionFromPay - tax - ni - sl;
      return {
        month: l.month,
        amount: l.amount,
        pay: payslip({ gross, pensionFromPay: reg.pensionFromPay, incomeTax: tax, nationalInsurance: ni, studentLoan: sl, takeHome: net }),
        // Extra take-home that month compared with a regular month.
        extra: round2(net - reg.takeHome),
      };
    });

    const regularCount = 12 - lumps.length;
    const sum = (k) => reg[k] * regularCount + bonusPayments.reduce((s, b) => s + b.pay[k], 0);
    return {
      ...shared,
      nationalInsurance: round2(sum('nationalInsurance')),
      studentLoan: round2(sum('studentLoan')),
      takeHome: round2(sum('takeHome')),
      takeHomeMonthly: round2(reg.takeHome),
      regularMonth: payslip(reg),
      bonusPayments,
    };
  }

  // How much of an extra £100 of salary you'd keep.
  function keepOfNext(input, cfg, step) {
    step = step || 100;
    const a = takeHome(input, cfg);
    const b = takeHome({ ...input, salary: (input.salary || 0) + step }, cfg);
    return b.takeHome - a.takeHome;
  }

  function inputFromProfile(profile) {
    return {
      salary: profile.income.grossSalary,
      bonuses: profile.income.bonuses,
      employeePensionPct: profile.assumptions.employeePensionPct,
      employerPensionPct: profile.assumptions.employerPensionPct,
      pensionMethod: profile.income.pensionMethod,
      studentLoanPlan: profile.income.studentLoanPlan,
      region: profile.income.region,
    };
  }

  function forProfile(profile, cfg) {
    return takeHome(inputFromProfile(profile), cfg);
  }

  FP.tax = {
    personalAllowance, incomeTax, nationalInsurance, studentLoan,
    MONTHS, bonusList, takeHome, keepOfNext, inputFromProfile, forProfile,
  };
})(globalThis.FP = globalThis.FP || {});
