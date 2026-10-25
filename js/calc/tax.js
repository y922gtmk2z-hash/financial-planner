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

  // Flat-rate codes: every pound of pay taxed at one rate, no allowance.
  const FLAT_RATES = {
    rUK: { BR: 20, D0: 40, D1: 45 },
    scotland: { BR: 20, D0: 21, D1: 42, D2: 45, D3: 48 },
  };

  /*
   * A PAYE tax code, e.g. 1257L, S1257L, K475, BR, D0, 0T, NT, 1257L W1.
   * Returns { ok, code, region ('scotland' | 'rUK' | null), kind, allowance,
   * flat, emergency, error }:
   *   kind 'allowance': `allowance` tax-free (negative for K codes: added to pay)
   *   kind 'zero' (0T): no allowance, normal bands
   *   kind 'flat' (BR, D0...): all pay taxed at `flat`%
   *   kind 'none' (NT): no tax
   * The S prefix means Scottish rates, C Welsh (the same as England). W1, M1
   * and X (emergency, non-cumulative) are accepted but don't change a year's figures.
   */
  function parseTaxCode(raw) {
    const text = String(raw == null ? '' : raw).toUpperCase().replace(/\s+/g, '');
    if (!text) return { ok: false, empty: true };
    const m = text.match(/^(S|C)?(K\d{1,4}|\d{1,4}[LMNT]|BR|D[0-3]|0T|NT)(W1|M1|X)?$/);
    const bad = { ok: false, error: 'That doesn\u2019t look like a tax code. Examples: 1257L, S1257L, K475, BR, D0, 0T or NT.' };
    if (!m) return bad;
    const [, prefix, body, suffix] = m;
    const region = prefix === 'S' ? 'scotland' : prefix === 'C' ? 'rUK' : null;
    const base = { ok: true, code: `${prefix || ''}${body}${suffix ? ` ${suffix}` : ''}`, region, emergency: !!suffix };
    if (body === 'NT') return { ...base, kind: 'none' };
    if (body === '0T') return { ...base, kind: 'zero', allowance: 0 };
    if (body === 'BR' || body[0] === 'D') {
      const rates = FLAT_RATES[region || 'rUK'];
      if (rates[body] == null) return { ok: false, error: `${body} is only used in Scotland (with an S in front).` };
      return { ...base, kind: 'flat', flat: rates[body] };
    }
    if (body[0] === 'K') return { ...base, kind: 'allowance', allowance: -Number(body.slice(1)) * 10, k: true };
    return { ...base, kind: 'allowance', allowance: Number(body.slice(0, -1)) * 10, letter: body.slice(-1) };
  }

  // What a tax code means, in a sentence.
  function describeTaxCode(raw, cfg) {
    cfg = cfg || FP.taxConfig;
    const c = parseTaxCode(raw);
    if (!c.ok) return c.empty ? `Standard: ${money(cfg.personalAllowance)} tax-free (1257L).` : c.error;
    const where = c.region === 'scotland' ? ' Scottish rates.' : '';
    const emergency = c.emergency ? ' (An emergency code: it usually changes once HMRC has your details.)' : '';
    let text;
    if (c.kind === 'none') text = 'No tax taken from this pay.';
    else if (c.kind === 'zero') text = 'No tax-free allowance: all your pay is taxed at the usual rates.';
    else if (c.kind === 'flat') text = `All your pay is taxed at ${c.flat}%, with no tax-free allowance. Usually for a second job.`;
    else if (c.k) text = `${money(-c.allowance)} is added to your taxable pay (a K code, usually for benefits or tax owed). Tax taken is capped at half your pay.`;
    else {
      const diff = c.allowance - cfg.personalAllowance;
      text = `${money(c.allowance)} tax-free${diff === 0 ? ', the standard allowance.' : diff < 0 ? `, ${money(-diff)} less than standard (often for benefits, tax owed or the \u00a3100k taper).` : `, ${money(diff)} more than standard (e.g. Marriage Allowance or expenses).`}`;
    }
    return text + where + emergency;
  }

  function money(n) {
    return `\u00a3${Math.round(n).toLocaleString('en-GB')}`;
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
  // input.bonus here is the year's total bonus; input.otherSacrifice is the
  // year's non-pension salary sacrifice (car, cycle...) and
  // input.benefitInKind taxable benefits (a salary-sacrifice car, private medical
  // insurance...). input.otherIncome is other taxable income a year (income tax
  // only, no NI or student loan) and input.taxFreeIncome income that isn't taxed.
  function yearly(input, cfg) {
    const salary = Math.max(0, input.salary || 0);
    const bonus = Math.max(0, input.bonus || 0);
    const gross = salary + bonus;
    const method = input.pensionMethod || 'netPay';
    // A tax code (if given) sets your allowance, or a flat rate, and S means Scottish rates.
    const code = input.taxCode ? parseTaxCode(input.taxCode) : null;
    const tc = code && code.ok ? code : null;
    const region = tc && tc.region ? tc.region : input.region === 'scotland' ? 'scotland' : 'rUK';
    const bands = cfg.bands[region];

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
      // Higher-rate relief, claimed through Self Assessment, extends your bands
      // (input.reliefNotClaimed: as if it isn't claimed, to see what it's worth).
      bandExtension = input.reliefNotClaimed ? 0 : pensionGross;
      adjustedNetIncome = gross - pensionGross;
    } else {
      payForTax = gross - pensionGross;
      pensionFromPay = pensionGross;
      adjustedNetIncome = payForTax;
    }

    // Other salary sacrifice (car, cycle to work...) comes off pay before tax,
    // NI and student loan. A car's benefit in kind is taxed but has no employee NI.
    // Pension contributions stay based on full salary.
    const sacrificedPension = method === 'salarySacrifice' ? pensionGross : 0;
    const otherSacrifice = Math.min(Math.max(0, input.otherSacrifice || 0), Math.max(0, gross - sacrificedPension));
    // Benefits already allowed for in your tax code aren't added to your pay as well.
    const benefitInKind = tc && input.benefitsInCode ? 0 : Math.max(0, input.benefitInKind || 0);
    payForTax += benefitInKind - otherSacrifice;
    payForNi -= otherSacrifice;
    adjustedNetIncome += benefitInKind - otherSacrifice;
    const otherIncome = Math.max(0, input.otherIncome || 0);
    const taxFreeIncome = Math.max(0, input.taxFreeIncome || 0);
    payForTax += otherIncome;
    adjustedNetIncome += otherIncome;

    // With a tax code, its allowance replaces the standard one (and its taper:
    // HMRC builds that into your code). It moves with the standard allowance in
    // future years, so a code £1,000 below standard stays £1,000 below.
    let allowance;
    let tax;
    if (tc && (tc.kind === 'flat' || tc.kind === 'none')) {
      allowance = 0;
      const rate = tc.kind === 'none' ? 0 : tc.flat;
      const pay = Math.max(0, payForTax);
      let placed = false;
      const byBand = bands.map((b) => {
        const here = !placed && b.rate === rate;
        if (here) placed = true;
        return { name: b.name, rate: b.rate, grossLabel: b.grossLabel, amount: here ? pay : 0, tax: here ? pay * rate / 100 : 0 };
      });
      tax = { total: pay * rate / 100, byBand };
    } else {
      allowance = tc ? tc.allowance + (cfg.personalAllowance - FP.taxConfig.personalAllowance) : personalAllowance(adjustedNetIncome, cfg);
      if (tc && tc.kind === 'zero') allowance = 0;
      tax = incomeTax(Math.max(0, payForTax - allowance), bands, bandExtension, cfg.reliefAtSourceRate);
      // K codes: tax taken can't be more than half your pay.
      if (tc && tc.k) tax = { ...tax, total: Math.min(tax.total, Math.max(0, payForTax) * 0.5) };
    }
    // Taxed income (with a K code, more than your pay).
    const taxable = Math.max(0, payForTax - allowance);
    const ni = nationalInsurance(payForNi, cfg.nationalInsurance);
    // Student loan is based on pay after salary sacrifice, but before other pension.
    const sl = studentLoan(payForNi, input.studentLoanPlan, cfg);
    const sacrificed = sacrificedPension;
    const net = gross - sacrificed - otherSacrifice - pensionFromPay - tax.total - ni - sl + otherIncome + taxFreeIncome;

    return {
      taxYear: cfg.taxYear,
      region,
      taxCode: tc ? tc.code : null,
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
      salarySacrifice: round2(otherSacrifice),
      benefitInKind: round2(benefitInKind),
      // Other income you receive (taxable and tax-free), before its tax.
      otherIncome: round2(otherIncome + taxFreeIncome),
      takeHome: round2(net),
      takeHomeMonthly: round2(net / 12),
      niablePay: payForNi,
      // For the £100k allowance taper (whatever the tax code says).
      adjustedNetIncome,
    };
  }

  const PAYSLIP_KEYS = ['gross', 'otherIncome', 'salarySacrifice', 'pensionFromPay', 'incomeTax', 'nationalInsurance', 'studentLoan', 'takeHome'];

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
      const net = gross + reg.otherIncome - reg.salarySacrifice - reg.pensionFromPay - tax - ni - sl;
      return {
        month: l.month,
        amount: l.amount,
        pay: payslip({ gross, otherIncome: reg.otherIncome, salarySacrifice: reg.salarySacrifice, pensionFromPay: reg.pensionFromPay, incomeTax: tax, nationalInsurance: ni, studentLoan: sl, takeHome: net }),
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

  /*
   * Salary sacrifice arrangements (car, cycle to work, other) for one year of
   * a projection: yearIndex 0 is the next 12 months. Each arrangement has a
   * monthly amount and optionally the months left; a car also has its list
   * price (P11D value) and benefit-in-kind percentage.
   * Returns { sacrifice, benefitInKind } as yearly amounts.
   */
  function sacrificeForYear(list, yearIndex) {
    let sacrifice = 0;
    let benefitInKind = 0;
    (list || []).forEach((a) => {
      const months = a.monthsLeft == null ? 12 : Math.min(12, Math.max(0, a.monthsLeft - 12 * (yearIndex || 0)));
      sacrifice += Math.max(0, a.monthly || 0) * months;
      if (a.type === 'car') benefitInKind += Math.max(0, a.carValue || 0) * Math.max(0, a.bikRate || 0) / 100 * months / 12;
    });
    return { sacrifice, benefitInKind };
  }

  // Taxable benefits in kind (private medical insurance, other) a year.
  function benefitsTotal(list) {
    return (list || []).reduce((t, b) => t + Math.max(0, b.yearly || 0), 0);
  }

  // Take-home inputs for one person (see FP.profile.people): their pay, as of today.
  function inputFromPerson(person) {
    const inc = person.income;
    return {
      salary: inc.grossSalary,
      bonuses: inc.bonuses,
      ...(() => {
        const ss = sacrificeForYear(inc.sacrifices, 0);
        return { otherSacrifice: ss.sacrifice, benefitInKind: ss.benefitInKind + benefitsTotal(inc.benefits) };
      })(),
      otherIncome: inc.otherIncome || 0,
      taxCode: inc.taxCode || '',
      benefitsInCode: inc.benefitsTaxed === 'code',
      taxFreeIncome: inc.taxFreeIncome || 0,
      employeePensionPct: person.employeePensionPct,
      employerPensionPct: person.employerPensionPct,
      pensionMethod: inc.pensionMethod,
      studentLoanPlan: inc.studentLoanPlan,
      region: inc.region,
    };
  }

  // Your take-home inputs (person 1).
  function inputFromProfile(profile) {
    return inputFromPerson(FP.profile.people(profile)[0]);
  }

  // Your take-home pay (person 1). For the household's, see household().
  function forProfile(profile, cfg) {
    return takeHome(inputFromProfile(profile), cfg);
  }

  /*
   * The household's take-home: each person's worked out on its own (their own
   * allowance, bands, NI, student loan and taper), then added together.
   * Returns { people: [takeHome result per person], takeHome, takeHomeMonthly }.
   */
  function household(profile, cfg) {
    const people = FP.profile.people(profile).map((x) => takeHome(inputFromPerson(x), cfg));
    if (people.length === 1) return { people, takeHome: people[0].takeHome, takeHomeMonthly: people[0].takeHomeMonthly };
    // Each person's monthly take-home is their regular month (bonus months add more), so add those.
    return { people, takeHome: people.reduce((t, r) => t + r.takeHome, 0), takeHomeMonthly: people.reduce((t, r) => t + r.takeHomeMonthly, 0) };
  }

  FP.tax = {
    personalAllowance, incomeTax, nationalInsurance, studentLoan, parseTaxCode, describeTaxCode,
    MONTHS, bonusList, sacrificeForYear, benefitsTotal, takeHome, keepOfNext, inputFromPerson, inputFromProfile, forProfile, household,
  };
})(globalThis.FP = globalThis.FP || {});

/*
 * Tax rules for a future year: thresholds either frozen at today's levels or
 * raised by `factor` (e.g. cumulative inflation). Rates never change.
 */
(function (FP) {
  'use strict';

  function indexConfig(cfg, factor) {
    if (!(factor > 0) || factor === 1) return cfg;
    const up = (n) => (n == null ? n : n * factor);
    const bands = {};
    Object.entries(cfg.bands).forEach(([region, list]) => {
      bands[region] = list.map((b) => ({ ...b, upTo: up(b.upTo) }));
    });
    const studentLoans = {};
    Object.entries(cfg.studentLoans).forEach(([plan, rule]) => {
      studentLoans[plan] = { ...rule, threshold: up(rule.threshold), interestUpperThreshold: up(rule.interestUpperThreshold) };
    });
    return {
      ...cfg,
      personalAllowance: up(cfg.personalAllowance),
      taperThreshold: up(cfg.taperThreshold),
      bands,
      nationalInsurance: {
        ...cfg.nationalInsurance,
        primaryThreshold: up(cfg.nationalInsurance.primaryThreshold),
        upperEarningsLimit: up(cfg.nationalInsurance.upperEarningsLimit),
      },
      studentLoans,
    };
  }

  /*
   * Income tax on non-employment income (State Pension, pension drawdown),
   * which has no NI. `taxable` is the yearly taxable amount before allowance.
   */
  function incomeTaxOnly(taxable, region, cfg) {
    cfg = cfg || FP.taxConfig;
    const allowance = FP.tax.personalAllowance(taxable, cfg);
    const bands = cfg.bands[region === 'scotland' ? 'scotland' : 'rUK'];
    return FP.tax.incomeTax(Math.max(0, taxable - allowance), bands, 0, 0).total;
  }

  FP.tax.indexConfig = indexConfig;
  FP.tax.incomeTaxOnly = incomeTaxOnly;
})(globalThis.FP = globalThis.FP || {});
