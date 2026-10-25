// Brief 15: figures in every how-to step, due dates, commitments (schema 11)
// and your State Pension in Your figures.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));
const close = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
// The golden clock: noon on 24 October 2026.
const NOW = new Date('2026-10-24T12:00:00Z');

function person(o) {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.income.grossSalary = o.salary || 40000;
  p.assets.cashSavings = 30000;
  p.spending = [{ id: 's', category: 'All', monthly: o.spend == null ? 1200 : o.spend }];
  Object.assign(p.income, o.income || {});
  Object.assign(p.assumptions, o.assumptions || {});
  if (o.mortgage) Object.assign(p.mortgage, { balance: 200000, remainingTermYears: 20, monthlyOverpayment: 0 }, o.mortgage);
  if (o.debts) p.debts = o.debts;
  return p;
}
const plus3 = [{ path: 'assumptions.employeePensionPct', op: 'add', value: 3 }];

// ---------- Figures in every step ----------

test('a pension step: from and to, what goes in, and the cost after tax relief for the band and method', () => {
  // Basic rate, net pay: 3% of £40,000 is £100 a month, costing £80 (20% relief).
  const basic = FP.suggest.pensionChange(person({}), plus3, 0);
  assert.deepEqual([basic.from, basic.to], [5, 8]);
  close(basic.goingIn, 100);
  close(basic.cost, 80);
  // Higher rate: £175 going in costs £105.
  const higher = FP.suggest.pensionChange(person({ salary: 70000 }), plus3, 0);
  close(higher.goingIn, 175);
  close(higher.cost, 105);
  // Salary sacrifice saves National Insurance too (8% at this pay): £72.
  const sacrifice = FP.suggest.pensionChange(person({ income: { pensionMethod: 'salarySacrifice' } }), plus3, 0);
  close(sacrifice.cost, 72);
  // Relief at source: the provider adds the 20%, so the same £80.
  close(FP.suggest.pensionChange(person({ income: { pensionMethod: 'reliefAtSource' } }), plus3, 0).cost, 80);
  // On the card, worked out from the change it would make.
  const relief = FP.suggest.analyse(person({ salary: 70000 })).suggestions.find((x) => x.id === 'relief');
  assert.equal(relief.howTo[0], 'Ask payroll or HR to raise your contribution from 5% to 8%: about £175 a month going in, costing you about £105 after tax relief.');
  assert.deepEqual(relief.commitment(), { action: 'relief', what: 'Raise your pension contribution from 5% to 8%', amount: relief.commitment().amount, per: 'month', due: null });
  close(relief.commitment().amount, 175);
});

test('an ISA step: the monthly amount, the allowance left and the days until 5 April', () => {
  const isa = FP.suggest.analyse(person({}), { now: NOW }).suggestions.find((x) => x.id === 'isa');
  const monthly = isa.patch[0].value.at(-1).monthly;
  assert.match(isa.howTo[0], new RegExp(`^Set up £${monthly.toLocaleString('en-GB')} a month into a stocks & shares ISA`));
  assert.equal(isa.howTo[1], 'You have about £20,000 of this year’s allowance left, and 163 days until it resets on 5 April 2027.');
  assert.equal(isa.due, '2027-04-05');
});

test('a mortgage step: the monthly overpayment and the yearly 10% limit in £', () => {
  const m = FP.suggest.analyse(person({ spend: 800, mortgage: {}, assumptions: { mortgageRate: 5 } })).suggestions.find((x) => x.id === 'mortgage');
  assert.equal(m.howTo[0], 'Ask your lender to set up a regular overpayment of £200 a month (£2,400 a year).');
  assert.match(m.howTo[1], /often 10% of the balance: about £20,000 this year/);
});

test('a debt step: the new monthly payment and the month it’s cleared', () => {
  const debts = [{ id: 'c', name: 'Card', balance: 1200, rate: 24, monthlyPayment: 100 }];
  const p = person({ debts });
  const c = FP.suggest.debtClears(p, 0, [{ path: 'debts.0.monthlyPayment', op: 'add', value: 50 }], NOW);
  assert.equal(c.pay, 150);
  // £1,200 at 24% APR, £150 a month: 9 payments, October 2026 to June 2027.
  const n = Math.ceil(FP.loan.monthsFor(1200, FP.loan.monthlyRate(24, 'apr'), 150));
  assert.equal(n, 9);
  assert.equal(c.cleared, 'June 2027');
  const d = FP.suggest.analyse(p, { now: NOW }).suggestions.find((x) => x.id === 'debt');
  assert.equal(d.howTo[0], 'Raise your monthly payment on Card from £100 to £150: at that rate it’s cleared by June 2027.');
  assert.equal(d.commitment().what, 'Pay £150 a month off Card, cleared by June 2027');
});

test('a scaled action’s steps are for the part you can afford', () => {
  const m = FP.suggest.analyse(fixture('sample')).suggestions.find((x) => x.id === 'mortgage');
  assert.ok(m.afford.scaled);
  assert.match(m.howTo[0], /overpayment of £44 a month/);
  assert.equal(m.commitment().amount, 44);
});

// ---------- Deadlines ----------

test('deadlines: ISA by 5 April, Self Assessment by 31 January, a fix six months before it ends', () => {
  assert.equal(FP.suggest.nextDate(4, 5, NOW), '2027-04-05');
  assert.equal(FP.suggest.nextDate(1, 31, NOW), '2027-01-31');
  assert.equal(FP.suggest.nextDate(10, 24, NOW), '2026-10-24', 'today counts');
  assert.equal(FP.suggest.daysUntil('2027-04-05', NOW), 163);
  const ras = person({ salary: 70000, income: { pensionMethod: 'reliefAtSource' } });
  const claim = FP.suggest.analyse(ras, { now: NOW }).suggestions.find((x) => x.id === 'claimRelief');
  assert.equal(claim.due, '2027-01-31');
  assert.match(claim.howTo[1], /Returns are due by 31 January 2027\./);
  assert.equal(claim.commitment().per, 'year');
  // Ends in August 2027: compare by the end of February 2027.
  const later = person({ mortgage: { fixEnds: '2027-08', rateAfterFix: 6 }, assumptions: { mortgageRate: 4 } });
  assert.equal(FP.suggest.fixEnding(later, NOW).compareBy, '2027-02-28');
  const fix = FP.suggest.analyse(later, { now: NOW }).suggestions.find((x) => x.id === 'fixEnds');
  assert.equal(fix.due, '2027-02-28');
  // Ends in March 2027: six months before has passed, so now.
  const soon = person({ mortgage: { fixEnds: '2027-03', rateAfterFix: 6 }, assumptions: { mortgageRate: 4 } });
  assert.equal(FP.suggest.fixEnding(soon, NOW).compareBy, '2026-10-24');
});

// ---------- Commitments ----------

test('commitments: recorded once per action, ticked off, and counted', () => {
  const p = FP.profile.blank();
  const c = { action: 'isa', what: 'Pay £200 a month into an ISA', amount: 200, per: 'month', due: '2027-04-05' };
  FP.commitments.record(p, c, 'open', '2026-10-24');
  FP.commitments.record(p, { ...c, amount: 150 }, 'open', '2026-10-25');
  assert.equal(p.commitments.length, 1, 'one per action');
  assert.equal(p.commitments[0].amount, 150);
  FP.commitments.record(p, { action: 'debt', what: 'Pay more off Card', amount: null, due: '2026-01-01' }, 'open', '2026-10-24');
  assert.deepEqual(FP.commitments.kept(p, '2026-10-24'), { done: 0, open: 2, total: 2, overdue: 1 });
  FP.commitments.setStatus(p, p.commitments[0].id, 'done');
  assert.deepEqual(FP.commitments.kept(p, '2026-10-24'), { done: 1, open: 1, total: 2, overdue: 1 });
  FP.commitments.remove(p, 'debt');
  assert.equal(p.commitments.length, 1);
  // Saved and loaded back the same; nonsense dropped.
  const back = FP.profile.normalise(JSON.parse(JSON.stringify({ ...p, commitments: p.commitments.concat({ action: 'no way!', what: 'x' }, 'junk') })));
  assert.deepEqual(back.commitments, p.commitments);
  assert.deepEqual(FP.profile.blank().commitments, []);
});

test('migration 11: older plans start with no commitments; scenarios keep their own', () => {
  const v10 = { schemaVersion: 10, workspace: { activeId: 'a', scenarios: [{ id: 'a', name: 'Baseline', profile: G.readFixture('sample') }], checkins: { snapshots: [], projection: null } } };
  const up = FP.migrate.upgrade(v10);
  assert.equal(up.from, 10);
  assert.deepEqual(up.workspace.scenarios[0].profile.commitments, []);
  assert.equal(FP.migrate.CURRENT, 12);
  // A commitment made in a scenario is part of its patch, not the Baseline's.
  const ws = FP.sampleWorkspace();
  const sc = ws.scenarios[1];
  FP.commitments.record(sc.profile, { action: 'isa', what: 'Pay into an ISA', amount: 100, per: 'month' }, 'open', '2026-10-24');
  const saved = FP.scenarios.toSaved(ws);
  assert.ok(saved.scenarios[1].patch.some((c) => c.path.startsWith('commitments')));
  assert.deepEqual(ws.scenarios[0].profile.commitments, []);
  assert.equal(FP.scenarios.normalise(JSON.parse(JSON.stringify(saved))).scenarios[1].profile.commitments.length, 1);
});

// ---------- Personal facts out of Assumptions ----------

test('your State Pension amount and age are in Your figures › About you, so Assumptions only links to them', () => {
  const about = FP.profile.SECTIONS.find((s) => s.id === 'about').fields.map((f) => f.path);
  assert.ok(about.includes('assumptions.statePension'));
  assert.ok(about.includes('assumptions.statePensionAge'));
  // Your partner's are with their figures.
  const theirs = FP.profile.PARTNER_FIELDS.map((f) => f.path);
  assert.ok(theirs.includes('partner.statePension') && theirs.includes('partner.statePensionAge'));
  // Still read the same way: a saved State Pension is kept.
  assert.equal(FP.profile.normalise({ assumptions: { statePension: 9000, statePensionAge: 68 } }).assumptions.statePension, 9000);
});
