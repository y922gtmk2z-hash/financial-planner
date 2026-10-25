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
  assert.match(isa.text, /^You have about £20,000 of your ISA allowance left this year, and Sam has £17,600 \(£20,000 each\)\./);
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

test('names: you are always "you"; a partner goes by their name, or "your partner"', () => {
  const p = couple();
  assert.equal(FP.profile.who(p, 0), 'you');
  assert.equal(FP.profile.whose(p, 0), 'your');
  assert.equal(FP.profile.who(p, 1), 'Sam');
  assert.equal(FP.profile.whose(p, 1), 'Sam’s');
  p.partner.name = '';
  assert.equal(FP.profile.whose(p, 1), 'your partner’s');
  assert.equal(FP.profile.capital(FP.profile.whose(p, 1)), 'Your partner’s');
});

test('personPath and asPerson: your partner’s figures in your own fields', () => {
  assert.equal(FP.profile.personPath(0, 'income.grossSalary'), 'income.grossSalary');
  assert.equal(FP.profile.personPath(1, 'income.bonuses.0.amount'), 'partner.income.bonuses.0.amount');
  assert.equal(FP.profile.personPath(1, 'assumptions.employeePensionPct'), 'partner.employeePensionPct');
  assert.equal(FP.profile.personPath(1, 'mortgage.balance'), null, 'not a person’s own');
  const p = couple();
  const sam = FP.profile.asPerson(p, 1);
  assert.equal(sam.partner, null);
  assert.equal(sam.about.age, 39);
  assert.equal(sam.income, p.partner.income, 'shared, so edits land in the plan');
  assert.equal(sam.assumptions.retirementAge, 60);
  assert.deepEqual(FP.tax.forProfile(sam), FP.tax.household(p).people[1]);
  assert.equal(FP.profile.asPerson(p, 0), p);
});

test('taking a partner off keeps what’s needed to bring them back', () => {
  const p = couple();
  p.pensions = [FP.profile.newPension('dc', 'partner'), FP.profile.newPension('db')];
  const before = JSON.parse(JSON.stringify(p));
  const kept = FP.profile.removePartner(p);
  assert.equal(p.partner, null);
  assert.equal(p.pensions.length, 1, 'their pension goes with them');
  assert.equal(p.savings[0].owner, undefined, 'what they owned becomes yours');
  assert.deepEqual(p.owners, {});
  assert.ok(FP.projection.project(p).ok);
  FP.profile.addPartner(p, kept);
  assert.deepEqual(JSON.parse(JSON.stringify(p)), { ...before, pensions: [before.pensions[1], before.pensions[0]] });
  const q = fixture('sample');
  FP.profile.addPartner(q);
  assert.equal(q.partner.income.grossSalary, 0);
  assert.equal(FP.profile.normalise(q).partner.retirementAge, q.assumptions.retirementAge);
});

test('ideas name the person: a partner in the taper gets the pension idea, changing their pension', () => {
  const p = couple();
  p.partner.income.grossSalary = 110000;
  const ideas = FP.suggest.analyse(p).suggestions;
  const taper = ideas.find((s) => s.id === 'taper');
  assert.equal(taper.title, 'Use Sam’s pension to avoid the 60% band');
  assert.match(taper.text, /Sam loses some personal allowance/);
  assert.equal(taper.patch[0].path, 'partner.employeePensionPct');
  const after = FP.patch.applyPatch(p, taper.patch);
  assert.ok(FP.tax.forProfile(FP.profile.asPerson(after, 1)).adjustedNetIncome <= 100000, 'brings their income to the taper');
  assert.equal(after.assumptions.employeePensionPct, p.assumptions.employeePensionPct, 'yours unchanged');
  // Higher-rate (not taper), and you're a basic-rate taxpayer: relief for them.
  p.partner.income.grossSalary = 70000;
  p.income.grossSalary = 40000;
  const relief = FP.suggest.analyse(p).suggestions.find((s) => s.id === 'relief');
  assert.equal(relief.title, 'Higher-rate pension relief for Sam');
  assert.equal(relief.patch[0].path, 'partner.employeePensionPct');
  // Your partner's loan, written off before it's repaid.
  const sl = FP.suggest.analyse(couple()).suggestions.find((s) => s.id === 'studentLoan');
  assert.equal(sl.title, 'Don’t rush to overpay Sam’s student loan');
});

test('the ISA idea fills your allowance, then your partner’s', () => {
  const p = couple();
  const isa = FP.suggest.analyse(p).suggestions.find((s) => s.id === 'isa');
  const added = isa.patch[0].value.filter((x) => String(x.id).startsWith('idea-isa'));
  assert.equal(added[0].owner, undefined);
  assert.equal(added[0].monthly, 1660, 'your £20,000 a year, in £10s');
  assert.equal(added[1].owner, 'partner');
  // Yours used up: only theirs.
  p.savings.push({ id: 'x', type: 'ssIsa', monthly: 20000 / 12, grows: 'fixed' });
  const only = FP.suggest.analyse(p).suggestions.find((s) => s.id === 'isa');
  assert.equal(only.title, 'Use Sam’s ISA allowance');
  assert.match(only.text, /^Sam has about £17,600 of Sam’s £20,000 ISA allowance left this year \(yours is used up\)\./);
});
