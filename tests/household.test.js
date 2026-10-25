// Household mode: a partner, more pensions, owners, and everything worked out per person.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));
const couple = () => fixture('couple');

test('every single-person fixture is still just you, and its golden snapshot is unchanged', () => {
  ['sample', 'quickstart', 'taper', 'near-retirement', 'stretched'].forEach((name) => {
    const p = fixture(name);
    assert.equal(p.partner, null, name);
    assert.deepEqual(p.pensions, [], name);
    assert.equal(FP.profile.people(p).length, 1);
    assert.deepEqual(G.diff(G.readGolden(name), G.snapshot(p)), [], name);
  });
});

test('people: you from your own fields, then your partner in the same shape', () => {
  const [you, partner] = FP.profile.people(couple());
  assert.equal(you.id, 'you');
  assert.equal(you.name, 'Alex');
  assert.equal(you.age, 41);
  assert.equal(you.retirementAge, 63);
  assert.equal(you.pension, 70000);
  assert.equal(partner.id, 'partner');
  assert.equal(partner.name, 'Sam');
  assert.equal(partner.retirementAge, 60);
  assert.equal(partner.income.grossSalary, 38000);
  assert.equal(partner.income.studentLoanPlan, 'plan2');
  assert.equal(partner.statePensionAge, 67);
});

test('tax, NI and student loans are worked out per person, then added together', () => {
  const p = couple();
  const hh = FP.tax.household(p);
  assert.equal(hh.people.length, 2);
  assert.deepEqual(hh.people[0], FP.tax.forProfile(p));
  assert.ok(Math.abs(hh.takeHomeMonthly - (hh.people[0].takeHomeMonthly + hh.people[1].takeHomeMonthly)) < 1e-9);
  assert.ok(hh.people[1].studentLoan > 0, 'Sam repays a Plan 2 loan');
  assert.equal(hh.people[0].studentLoan, 0, 'Alex has none');
  // Two salaries pay less tax than one person earning both.
  const solo = FP.profile.normalise({ ...JSON.parse(JSON.stringify(p)), partner: null, income: { ...p.income, grossSalary: 100000 } });
  assert.ok(hh.takeHome > FP.tax.forProfile(solo).takeHome + 5000);
});

test('the £100k taper is per person', () => {
  const p = couple();
  p.partner.income.grossSalary = 110000;
  const hh = FP.tax.household(p);
  assert.ok(hh.people[1].adjustedNetIncome > 100000);
  assert.ok(hh.people[1].personalAllowance < FP.taxConfig.personalAllowance, 'Sam loses some allowance');
  assert.equal(hh.people[0].personalAllowance, FP.taxConfig.personalAllowance, 'Alex keeps all of it');
});

test('the household retires in stages, and each State Pension starts at its owner’s age', () => {
  const r = FP.projection.project(couple(), { maxYears: 60 });
  const at = (alexAge) => r.rows.find((x) => x.age === alexAge);
  // Sam (2 years younger) stops at 60, when Alex is 62; Alex stops at 63.
  assert.deepEqual(at(62).people.map((x) => x.working), [true, true]);
  assert.deepEqual(at(63).people.map((x) => x.working), [true, false]);
  assert.equal(at(63).working, true, 'the household is still working');
  assert.deepEqual(at(64).people.map((x) => x.working), [false, false]);
  assert.equal(at(64).working, false);
  assert.ok(at(63).salary < at(62).salary * 0.75, 'one salary stops first');
  assert.equal(r.events.retirement.age, 63, 'retirement is when the later of you retires');
  assert.equal(at(67).statePension, 0);
  assert.ok(at(68).people[0].statePension > 0 && at(68).people[1].statePension === 0, 'Alex from 67');
  assert.ok(at(70).people[1].statePension > 0, 'Sam from 67, two years later');
  // Each of you has your own student loan events.
  assert.equal(r.events.studentLoans.length, 2);
  assert.equal(r.events.studentLoans[0].tracked, false);
  assert.equal(r.events.studentLoans[1].tracked, true);
});

test('ISA allowances are per person: regular ISA savings use their owner’s', () => {
  const p = couple();
  p.savings = [
    { id: 'a', type: 'ssIsa', monthly: 1500, grows: 'fixed' },
    { id: 'b', type: 'ssIsa', monthly: 1500, grows: 'fixed', owner: 'partner' },
  ];
  const row = FP.projection.project(p).rows[1];
  assert.equal(row.savedIsa, 36000);
  assert.ok(!FP.projection.project(p).warnings.some((w) => w.key === 'isaAllowance'), '£18,000 each fits');
  p.savings[1].owner = undefined;
  assert.ok(FP.projection.project(FP.profile.normalise(p)).warnings.some((w) => w.key === 'isaAllowance'), '£36,000 for one person doesn’t');
  // Ideas count an allowance each.
  const isa = FP.suggest.analyse(couple()).suggestions.find((s) => s.id === 'isa');
  assert.match(isa.text, /£37,600 of this year’s £20,000/);
});

test('a defined benefit pension adds taxable income from its start age', () => {
  const p = fixture('defined-benefit');
  const r = FP.projection.project(p, { maxYears: 50 });
  const at = (age) => r.rows.find((x) => x.age === age);
  // It starts at 60 while still working: taxed with pay, so take-home rises by less than it pays.
  const before = at(60).takeHome;
  const after = at(61).takeHome;
  const paid = at(61).people ? null : 9500 * at(61).inflationFactor / FP.growth.inflationFactor(p.assumptions.inflation, 1);
  assert.ok(after - before > 5000 && after - before < paid, `${after - before} of ${paid}`);
  // Retired: it's taxable income alongside the State Pension.
  assert.equal(at(63).working, false);
  assert.ok(at(63).netIncome > 11000 && at(63).netIncome < 12500);
  assert.ok(at(68).netIncome > at(67).netIncome + 10000, 'the State Pension joins it');
  // It pays an income, so it isn't a pot in your net worth.
  assert.equal(FP.summary.compute(p).assets.items.find((x) => x.key === 'pension').value, 60000 + 35000);
});

test('other pension pots grow, take contributions while you work, and are drawn from their access age', () => {
  const p = fixture('defined-benefit');
  p.pensions[1].monthly = 100;
  const base = FP.projection.project(fixture('defined-benefit'), { maxYears: 50 });
  const r = FP.projection.project(p, { maxYears: 50 });
  assert.equal(r.rows[1].pensionSaving, 1200);
  assert.ok(Math.abs((base.rows[1].surplus - r.rows[1].surplus) - 1200) < 1e-6, 'paid from take-home');
  assert.ok(r.rows[1].pension - base.rows[1].pension > 1499, '£1,200 with 20% relief added');
  assert.ok(r.rows.filter((x) => !x.working).some((x) => x.fromPension > 0));
});

test('a partner’s pension pot and leftover pension share go into their own pot', () => {
  const p = couple();
  const r = FP.projection.project(p);
  const summary = FP.summary.compute(p, FP.tax.household(p).takeHomeMonthly);
  assert.equal(summary.assets.items.find((x) => x.key === 'pension').value, 70000 + 28000);
  assert.equal(r.rows[0].pension, 98000);
  assert.ok(r.rows[1].pensionFromPay > FP.projection.project({ ...p, partner: null }).rows[1].pensionFromPay, 'both pay in from their pay');
});

test('owners: kept where they aren’t you, and cleaned up on the way in', () => {
  const p = couple();
  assert.deepEqual(p.owners, { 'assets.homeValue': 'joint', 'assets.cashSavings': 'joint', 'assets.isa': 'joint', mortgage: 'joint' });
  assert.equal(p.savings[0].owner, 'partner');
  const q = FP.profile.normalise({ debts: [{ name: 'Card', balance: 1, owner: 'partner' }, { name: 'Loan', balance: 1, owner: 'you' }], owners: { 'assets.isa': 'nobody', x: 'joint' }, pensions: [{ type: 'dc', value: 1, owner: 'partner' }] });
  assert.equal(q.debts[0].owner, 'partner');
  assert.equal(q.debts[1].owner, undefined, 'you is the default, not stored');
  assert.deepEqual(q.owners, {});
  assert.equal(q.pensions[0].owner, 'you', 'no partner, so it’s yours');
});

test('version 5 saves load as just you, with no other pensions', () => {
  const v5 = { schemaVersion: 5, workspace: { scenarios: [{ name: 'Baseline', profile: G.readFixture('sample') }], checkins: { snapshots: [] } } };
  const up = FP.migrate.upgrade(v5);
  assert.equal(up.from, 5);
  const p = up.workspace.scenarios[0].profile;
  assert.equal(p.partner, null);
  assert.deepEqual(p.pensions, []);
  assert.deepEqual(G.diff(G.readGolden('sample'), G.snapshot(p)), []);
  // A couple survives export and import.
  const ws = FP.scenarios.fromProfile(couple());
  const back = FP.store.importJson(FP.store.exportJson(ws));
  assert.deepEqual(back.workspace.scenarios[0].profile, ws.scenarios[0].profile);
});
