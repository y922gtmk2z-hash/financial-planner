const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// A minimal profile with every assumption at its default; tweak per test.
function profile(over) {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.spending = [];
  return Object.assign(p, over || {});
}

test('compound growth', () => {
  close(FP.growth.compound(1000, 5, 10), 1628.89);
  close(FP.growth.compound(1000, 0, 10), 1000);
  close(FP.growth.compound(1000, -10, 2), 810);
  close(FP.growth.netRate(5, 0.4), 4.6);
  close(FP.growth.toReal(1280.08, 2.5, 10), 1000);
});

test('needs an age and runs to the end age, capped at 40 years', () => {
  const p = profile();
  p.about.age = null;
  assert.equal(FP.projection.project(p).ok, false);
  const r = FP.projection.project(profile(), { startYear: 2026 });
  assert.equal(r.years, 40); // 95 - 40 = 55, capped at 40
  assert.equal(r.rows.length, 41);
  assert.equal(r.rows[0].age, 40);
  assert.equal(r.rows[40].age, 80);
  assert.equal(r.rows[1].year, 2027);
  const old = profile();
  old.about.age = 80;
  assert.equal(FP.projection.project(old).years, 15);
});

test('each asset grows at its own rate', () => {
  const p = profile();
  p.assets = { homeValue: 300000, cashSavings: 10000, isa: 20000, gia: 5000, pension: 50000, other: 7000 };
  p.assumptions.retirementAge = 40; // no salary or contributions
  p.assumptions.statePension = 0;
  p.assumptions.pensionAccessAge = 75; // keep pension untouched
  const r = FP.projection.project(p).rows;
  close(r[10].home, FP.growth.compound(300000, 3, 10));
  close(r[10].cash, FP.growth.compound(10000, 3.5, 10));
  close(r[10].isa, FP.growth.compound(20000, 4.6, 10));
  close(r[10].gia, FP.growth.compound(5000, 4.6, 10));
  close(r[10].pension, FP.growth.compound(50000, 4.5, 10));
  assert.equal(r[10].other, 7000);
});

test('mortgage amortises like the stand-alone calculator; equity = value - balance', () => {
  const p = profile();
  p.assets.homeValue = 300000;
  p.mortgage = { balance: 200000, remainingTermYears: 25, monthlyOverpayment: 100 };
  p.leftover.mortgage = 0;
  const r = FP.projection.project(p).rows;
  const ref = FP.mortgage.amortise({ balance: 200000, annualRatePct: 4.5, termMonths: 300, monthlyOverpayment: 100 });
  close(r[5].mortgage, ref.yearEndBalances[4], 0.01);
  close(r[5].equity, r[5].home - r[5].mortgage);
  const free = r.findIndex((row) => row.mortgage === 0);
  assert.equal(free, Math.ceil(ref.months / 12));
});

test('mortgage rate change applies from the month after the fixed rate ends', () => {
  const p = profile();
  // The fix ends 23 months from this month, so the new rate starts after 24 months.
  const now = new Date();
  const end = now.getFullYear() * 12 + now.getMonth() + 23;
  p.mortgage = { balance: 200000, remainingTermYears: 25, monthlyOverpayment: 0, fixEnds: `${Math.floor(end / 12)}-${String((end % 12) + 1).padStart(2, '0')}`, rateAfterFix: 6 };
  p.leftover.mortgage = 0;
  const r = FP.projection.project(p).rows;
  const ref = FP.mortgage.amortise({ balance: 200000, annualRatePct: 4.5, termMonths: 300, rateChange: { afterMonths: 24, annualRatePct: 6 } });
  close(r[2].mortgage, ref.yearEndBalances[1], 0.01);
  close(r[6].mortgage, ref.yearEndBalances[5], 0.01);
});

test('surplus is split by the savings split; ISA first, then GIA', () => {
  const p = profile();
  p.income.grossSalary = 60000;
  p.assumptions.isaAllowance = 5000;
  Object.assign(p.leftover, { emergency: 0, cash: 40, invest: 50, mortgage: 0, pension: 10 });
  const r = FP.projection.project(p).rows[1];
  assert.ok(r.surplus > 0);
  close(r.netIncome, FP.tax.forProfile(p).takeHome);
  close(r.toCash, r.surplus * 0.4);
  close(r.toInvest, r.surplus * 0.5);
  close(r.isa, 5000);
  close(r.gia, r.surplus * 0.5 - 5000);
  // pension: contributions from pay + surplus share with 20% relief added
  close(r.pension, FP.tax.forProfile(p).pensionIntoPot + (r.surplus * 0.1) / 0.8);
});

test('split under 100%: the rest isn\u2019t saved; over 100% is scaled', () => {
  const under = FP.projection.splitShares({ cash: 0, invest: 50, mortgage: 0, pension: 0 });
  assert.equal(under.status, 'under');
  close(under.cash, 0);
  close(under.unallocated, 0.5);
  const over = FP.projection.splitShares({ cash: 100, invest: 100, mortgage: 0, pension: 0 });
  assert.equal(over.status, 'over');
  close(over.cash, 0.5);
  close(over.invest, 0.5);
  assert.equal(FP.projection.splitShares(undefined).unallocated, 1); // nothing chosen: nothing saved
});

test('leftover money isn\u2019t saved until you choose what to do with it', () => {
  const p = profile();
  p.income.grossSalary = 50000;
  const r = FP.projection.project(p).rows[1];
  assert.ok(r.surplus > 0);
  close(r.notSaved, r.surplus);
  close(r.cash, 0);
  close(r.isa + r.gia, 0);
  assert.ok(FP.projection.project(p).warnings.some((w) => w.key === 'split'));
});

test('older saves keep their split (it used to be four assumptions)', () => {
  const v2 = (profile) => FP.migrate.upgrade({ schemaVersion: 2, workspace: { scenarios: [{ profile }] } }).workspace.scenarios[0].profile;
  const p = v2({ assumptions: { splitCash: 10, splitInvest: 60, splitMortgage: 0, splitPension: 30 } });
  assert.deepEqual(p.leftover, { unit: 'pct', emergency: 0, debts: 0, cash: 10, invest: 60, mortgage: 0, pension: 30, emergencyMonths: 3 });
  assert.equal(p.assumptions.splitCash, undefined);
  // Saved before the emergency fund share: it starts at 0 so the split still adds up.
  const q = v2({ leftover: { cash: 30, invest: 50, mortgage: 10, pension: 10 } });
  assert.equal(q.leftover.emergency, 0);
  assert.deepEqual(FP.profile.blank().leftover, { unit: 'pct', emergency: 0, debts: 0, cash: 0, invest: 0, mortgage: 0, pension: 0, emergencyMonths: 3 });
  assert.equal(FP.profile.normalise({ leftover: { emergencyMonths: 99 } }).leftover.emergencyMonths, 3);
});

test('a share a choice can\u2019t use goes to the others in proportion', () => {
  const shares = FP.projection.splitShares({ cash: 20, invest: 40, mortgage: 40 });
  const caps = { emergency: 0, debts: 0, cash: Infinity, invest: Infinity, mortgage: 100, pension: 0 };
  const out = FP.projection.allocate(1000, shares, caps);
  close(out.mortgage, 100);
  close(out.cash, 300); // the other £900 shared 20:40
  close(out.invest, 600);
  // None of your choices can take it: it isn't saved.
  const none = FP.projection.allocate(500, FP.projection.splitShares({ mortgage: 100 }), { ...caps, mortgage: 0 });
  close(none.cash, 0);
  close(none.unallocated, 500);
  // The unchosen part isn't shared out.
  const half = FP.projection.allocate(1000, FP.projection.splitShares({ invest: 50 }), caps);
  close(half.invest, 500);
  close(half.unallocated, 500);
});

test('leftover overpayments stay within the limit unless you turn it off', () => {
  const p = profile();
  p.income.grossSalary = 80000;
  Object.assign(p.mortgage, { balance: 100000, remainingTermYears: 20, monthlyOverpayment: 0 });
  Object.assign(p.leftover, { emergency: 0, cash: 0, invest: 0, mortgage: 100, pension: 0 });
  const r = FP.projection.project(p);
  const r1 = r.rows[1];
  close(r1.toMortgage, 100000 * 0.10); // 10% of the balance at the start of the year
  close(r1.notSaved, r1.surplus - 10000); // nothing else you chose can take it
  assert.ok(!r.warnings.some((w) => w.key === 'overpay'));
  p.assumptions.capOverpayments = 'none';
  const u = FP.projection.project(p);
  assert.ok(u.rows[1].toMortgage > 10000);
  assert.ok(u.warnings.some((w) => w.key === 'overpay'));
});

test('paying off debts faster clears the most expensive first, then passes its share on', () => {
  const p = profile();
  p.income.grossSalary = 50000;
  p.debts = [
    { id: 'a', name: 'Loan', balance: 3000, rate: 6, monthlyPayment: 0 },
    { id: 'b', name: 'Card', balance: 2000, rate: 20, monthlyPayment: 0 },
  ];
  Object.assign(p.leftover, { emergency: 0, debts: 50, cash: 0, invest: 50, mortgage: 0, pension: 0 });
  const plain = FP.projection.project({ ...p, debts: [] }).rows[1];
  const r1 = FP.projection.project(p).rows[1];
  // Half of the leftover money is more than the debts owe after a year's
  // interest (rates are APRs, so a year adds exactly the APR), so they're
  // cleared and the rest is invested.
  const owed = 3000 * 1.06 + 2000 * 1.20;
  assert.ok(plain.surplus / 2 > owed);
  close(r1.toDebts, owed);
  assert.equal(r1.debts, 0);
  close(r1.toInvest, r1.surplus - owed);
  // A smaller share goes to the card (20%) first.
  p.leftover.debts = 5; p.leftover.invest = 95;
  const small = FP.projection.project(p).rows[1];
  assert.ok(small.toDebts < 2000);
  const card = 2000 * 1.20 - small.toDebts;
  close(small.debts, 3000 * 1.06 + card, 0.5);
});

test('the emergency fund share fills cash to the target, then goes to the other choices', () => {
  const p = profile();
  p.income.grossSalary = 40000;
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  p.assets.cashSavings = 0;
  Object.assign(p.leftover, { emergency: 50, cash: 0, invest: 50, mortgage: 0, pension: 0, emergencyMonths: 1 });
  const rows = FP.projection.project(p).rows;
  const r1 = rows[1];
  close(r1.emergencyTarget, 1000);
  // Only the gap (one month of outgoings) goes to the fund; the rest of its share is invested.
  close(r1.toEmergency, 1000);
  close(r1.toInvest, r1.surplus - 1000);
  close(r1.cash, 1000);
  // Year 2: the fund only needs topping up for rising costs (plus the interest it already earned).
  const r2 = rows[2];
  close(r2.toEmergency, Math.max(0, r2.emergencyTarget - 1000 * (1 + p.assumptions.savingsRate / 100)));
  // No other choices: once the fund is full, the rest isn't saved.
  Object.assign(p.leftover, { emergency: 100, invest: 0 });
  const r = FP.projection.project(p).rows[1];
  close(r.toEmergency + r.notSaved, r.surplus);
  close(r.toCash, 0);
});

test('salary and bonuses grow; salary stops at retirement', () => {
  const p = profile();
  p.income.grossSalary = 40000;
  p.income.bonuses = [{ id: 'b', amount: 2000, month: 'mar' }];
  p.assumptions.retirementAge = 45;
  const r = FP.projection.project(p).rows;
  close(r[1].salary, 40000);
  close(r[3].salary, 40000 * 1.03 ** 2);
  close(r[3].bonus, 2000 * 1.03 ** 2);
  assert.equal(r[5].working, true); // age 44 at start of year 5
  assert.equal(r[6].working, false);
  assert.equal(r[6].salary, 0);
});

test('frozen vs inflation-linked tax thresholds', () => {
  const p = profile();
  p.income.grossSalary = 40000;
  const frozen = FP.projection.project(p).rows[11];
  p.assumptions.taxThresholds = 'inflation';
  const indexed = FP.projection.project(p).rows[11];
  close(frozen.salary, indexed.salary);
  // Frozen thresholds take more tax from the same grown salary
  assert.ok(frozen.takeHome < indexed.takeHome);
  // Indexed: same as today's rules applied to today's salary, scaled up
  const cfg = FP.tax.indexConfig(FP.taxConfig, 1.025 ** 10);
  close(cfg.personalAllowance, 12570 * 1.025 ** 10);
  close(cfg.bands.rUK[0].upTo, 37700 * 1.025 ** 10);
  close(cfg.nationalInsurance.upperEarningsLimit, 50270 * 1.025 ** 10);
  assert.equal(cfg.bands.rUK[0].rate, 20);
  // Indexing everything means take-home grows exactly with (salary growth = inflation)
  p.assumptions.salaryGrowth = 2.5;
  const r = FP.projection.project(p).rows;
  close(r[11].takeHome / 1.025 ** 10, r[1].takeHome, 0.05);
});

test('spending grows; real values divide by inflation', () => {
  const p = profile();
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  p.assets.cashSavings = 1e6;
  const r = FP.projection.project(p).rows;
  close(r[1].spending, 12000);
  close(r[11].spending, 12000 * 1.025 ** 10);
  const real = FP.projection.toReal(r[10]);
  close(real.netWorth, r[10].netWorth / 1.025 ** 10);
  close(real.cash, r[10].cash / r[10].inflationFactor);
});

test('a deficit is drawn from cash then investments, then becomes a shortfall', () => {
  const p = profile();
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  p.assets.cashSavings = 6000;
  p.assets.gia = 3000;
  p.assumptions.savingsRate = 0;
  Object.assign(p.assumptions, { sharesReturn: 0, bondsReturn: 0, cashReturn: 0 });
  p.assumptions.investmentFees = 0;
  const r = FP.projection.project(p);
  const y1 = r.rows[1];
  close(y1.surplus, -12000);
  close(y1.fromCash, 6000);
  close(y1.fromInvest, 3000);
  close(y1.unfunded, 3000);
  close(y1.shortfall, 3000);
  assert.equal(r.events.runsOut.age, 41);
  assert.ok(r.warnings.some((w) => w.key === 'shortfall'));
});

test('in retirement, State Pension is paid and the pension is drawn after tax', () => {
  const p = profile();
  p.about.age = 68;
  p.spending = [{ id: 's', category: 'All', monthly: 2000 }];
  p.assets.pension = 500000;
  Object.assign(p.assumptions, { sharesReturn: 0, bondsReturn: 0, cashReturn: 0 });
  p.assumptions.pensionFees = 0;
  const y1 = FP.projection.project(p).rows[1];
  close(y1.statePension, 12547.6);
  close(y1.statePensionTax, 0); // under the personal allowance
  const need = 24000 - 12547.6;
  // Net from the pension covers the gap exactly
  close(y1.fromPension - y1.pensionTax, need, 0.05);
  // 25% tax-free; the rest taxed at 20% once the allowance is used up
  const taxable = 12547.6 + y1.fromPension * 0.75 - 12570;
  close(y1.pensionTax, taxable * 0.2, 0.05);
  close(y1.pension, 500000 - y1.fromPension);
  assert.equal(y1.unfunded, 0);
});

test('pension cannot be drawn before the access age', () => {
  const p = profile();
  p.about.age = 50;
  p.assumptions.retirementAge = 50;
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  p.assets.pension = 100000;
  const r = FP.projection.project(p).rows;
  assert.equal(r[1].fromPension, 0);
  assert.ok(r[1].unfunded > 0);
  assert.ok(r[8].fromPension > 0); // age 57 at start of year 8
});

test('the sample household projects without gaps and clears its mortgage', () => {
  const r = FP.projection.project(FP.sample(), { startYear: 2026 });
  assert.equal(r.ok, true);
  r.rows.forEach((row) => {
    ['netWorth', 'cash', 'pension', 'home', 'mortgage'].forEach((k) => assert.ok(Number.isFinite(row[k]), `${k} at ${row.age}`));
  });
  assert.ok(r.events.mortgageFree);
  assert.ok(r.rows[r.years].netWorth > r.rows[0].netWorth);
});

test('retirement spending: the most you could spend so the money lasts to the end age', () => {
  const p = profile();
  p.about.age = 50;
  p.income.grossSalary = 50000;
  p.assets.pension = 200000;
  p.spending = [{ id: 's', category: 'All', monthly: 1500 }];
  const rs = FP.projection.retirementSpend(p);
  assert.equal(rs.endAge, 95);
  assert.equal(rs.now, 1500);
  // Runs past the 40-year limit, and spending a little more runs short.
  const run = (f) => FP.projection.project(p, { maxYears: 100, retirementSpending: f });
  assert.equal(run(rs.factor).rows.length - 1, 45);
  assert.ok(run(rs.factor).rows.at(-1).shortfall <= 0.5);
  assert.ok(run(rs.factor * 1.02).rows.at(-1).shortfall > 0.5);
  // In today's money at the start of retirement.
  const ret = run(1).events.retirement;
  close(rs.monthly, 1500 * FP.growth.compound(1, p.assumptions.spendingGrowth, ret.y) / ret.inflationFactor * rs.factor);
  // No retirement in view, or no spending: nothing to say.
  p.about.age = 96;
  assert.equal(FP.projection.retirementSpend(p), null);
});

test('leftover split in £ a month: fixed amounts rising with prices, the rest not saved', () => {
  const p = profile();
  p.income.grossSalary = 50000;
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  Object.assign(p.leftover, { unit: 'gbp', emergency: 0, invest: 300, pension: 100 });
  const rows = FP.projection.project(p).rows;
  const r1 = rows[1];
  close(r1.toInvest, 3600);
  close(r1.toPension, 1200 / 0.8); // with 20% relief added
  close(r1.notSaved, r1.surplus - 4800);
  // Year 3: amounts have risen with prices.
  const f = FP.growth.inflationFactor(p.assumptions.inflation, 2);
  close(rows[3].toInvest, 3600 * f, 0.5);
  // More than is left: scaled down to fit, nothing left unsaved.
  Object.assign(p.leftover, { invest: 100000, pension: 0 });
  const big = FP.projection.project(p).rows[1];
  close(big.toInvest, big.surplus);
  close(big.notSaved, 0);
});

test('switching the split between % and £ keeps the same money', () => {
  const split = { unit: 'pct', emergency: 10, debts: 0, cash: 20, invest: 50, mortgage: 10, pension: 10 };
  const pct = FP.projection.splitAsPct(split, 2000);
  split.unit = 'gbp';
  FP.projection.setSplitFromPct(split, pct, 2000);
  assert.deepEqual([split.emergency, split.cash, split.invest, split.pension], [200, 400, 1000, 200]);
  close(FP.projection.splitAsPct(split, 2000).invest, 50);
  const shares = FP.projection.splitShares(split, 2000);
  assert.equal(shares.status, 'ok');
  // Imports keep £ values (not capped at 100) and the unit.
  const p = FP.profile.normalise({ leftover: { unit: 'gbp', invest: '£1,500' } });
  assert.equal(p.leftover.unit, 'gbp');
  assert.equal(p.leftover.invest, 1500);
  assert.equal(FP.profile.normalise({ leftover: { unit: 'euros', invest: 500 } }).leftover.invest, 0); // % unit: 500 is out of range
});

test('£ split within £1 of what’s left counts as all of it', () => {
  const sh = FP.projection.splitShares({ unit: 'gbp', invest: 30, pension: 14 }, 44.3);
  assert.equal(sh.status, 'ok');
  close(sh.invest + sh.pension, 1);
  close(sh.invest / sh.pension, 30 / 14);
});

test('what you could spend in retirement keeps every retirement year funded', () => {
  // Retire at 52 with no savings: the pension can't be drawn until 57, and a
  // large State Pension from 60 would otherwise repay the gap by the end.
  const p = FP.profile.blank();
  p.about.age = 50;
  p.income.grossSalary = 40000;
  p.spending[0].monthly = 1500;
  Object.assign(p.assumptions, { retirementAge: 52, pensionAccessAge: 57, statePensionAge: 60, statePension: 40000 });
  const rs = FP.projection.retirementSpend(p);
  const r = FP.projection.project(p, { retirementSpending: rs.factor, maxYears: 100 });
  assert.ok(r.rows.every((row) => row.shortfall <= 0.5));
});

test('retirement need: what you’d need, what you’re on course for and how long it lasts', () => {
  const p = FP.profile.blank();
  p.about.age = 35;
  p.income.grossSalary = 45000;
  p.spending[0].monthly = 2000;
  const n = FP.projection.retirementNeed(p);
  assert.equal(n.goal, 2000);
  assert.equal(n.goalIsSet, false);
  assert.ok(n.needed > n.have && n.have > 0);
  assert.ok(n.lastsUntil > p.assumptions.retirementAge && n.lastsUntil < n.endAge);
  // Topping up to what's needed funds every retirement year at the goal.
  const factor = (FP.projection.retirementSpend(p).factor * 2000) / FP.projection.retirementSpend(p).monthly;
  const topped = FP.projection.project(p, { maxYears: 100, retirementSpending: factor, retirementBoost: n.needed - n.have + 100 });
  assert.ok(topped.rows.every((r) => r.working !== false || r.shortfall <= 0.5));
  // A lower goal needs less, and lasts longer.
  p.goals.retirementIncome = 1000;
  const lower = FP.projection.retirementNeed(p);
  assert.ok(lower.needed < n.needed);
  assert.ok(lower.lastsUntil == null || lower.lastsUntil > n.lastsUntil);
});

test('pot needed: pays for retirement to life expectancy, so less than to the end age', () => {
  const p = FP.profile.blank();
  p.about.age = 35;
  p.spending[0].monthly = 2000;
  assert.equal(p.assumptions.lifeExpectancy, 86);
  const toAverage = FP.projection.potNeeded(p);
  const toEnd = FP.projection.retirementNeed(p);
  assert.equal(toAverage.endAge, 86);
  assert.ok(toAverage.needed > 0 && toAverage.needed < toEnd.needed);
  // It doesn't depend on what you earn or save before you retire.
  p.income.grossSalary = 80000;
  p.assets.pension = 50000;
  assert.equal(FP.projection.potNeeded(p).needed, toAverage.needed);
  // Drawn from a pension it's taxed, so it needs more than tax-free savings would.
  p.assumptions.pensionAccessAge = 68;
  assert.ok(FP.projection.potNeeded(p).needed < toAverage.needed);
  p.assumptions.pensionAccessAge = 57;
  // Retiring after life expectancy: nothing to work out.
  p.assumptions.lifeExpectancy = 66;
  assert.equal(FP.projection.potNeeded(p), null);
});

test('retirement need: nothing needed when the State Pension covers the goal', () => {
  const p = FP.profile.blank();
  p.about.age = 60;
  p.spending[0].monthly = 500;
  Object.assign(p.assumptions, { retirementAge: 67, statePensionAge: 67 });
  const n = FP.projection.retirementNeed(p);
  assert.equal(n.needed, 0);
  assert.equal(n.lastsUntil, null);
});
