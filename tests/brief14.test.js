// Brief 14: actions ranked by value a year, affordability, the rough stage,
// big-ticket checks, a rough pension figure from the quick start, the fixed
// rate moving into Debts (schema 10) and goal-seek limits.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));
const copy = (x) => JSON.parse(JSON.stringify(x));
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
// The golden clock: noon on 24 October 2026.
const NOW = new Date('2026-10-24T12:00:00Z');

function person(o) {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.income.grossSalary = o.salary || 40000;
  p.assets.cashSavings = o.cash == null ? 30000 : o.cash;
  p.spending = [{ id: 's', category: 'All', monthly: o.spend == null ? 1200 : o.spend }];
  Object.assign(p.income, o.income || {});
  Object.assign(p.assumptions, o.assumptions || {});
  if (o.mortgage) Object.assign(p.mortgage, { balance: 200000, remainingTermYears: 20, monthlyOverpayment: 0 }, o.mortgage);
  if (o.mortgageRate != null) p.assumptions.mortgageRate = o.mortgageRate;
  return p;
}
const ids = (r) => r.suggestions.map((s) => s.id);

// ---------- Ranking and safety ----------

test('debt over 20% APR is a safety problem at the top; cheaper expensive debt is ranked by value', () => {
  const card = person({});
  card.debts = [{ id: 'c', name: 'Card', balance: 3000, rate: 24, monthlyPayment: 100 }];
  const g = FP.suggest.groupActions(FP.suggest.actions(card));
  const d = g.main.find((x) => x.id === 'debt');
  assert.equal(d.safety, true);
  assert.equal(d.tone, 'warn');
  const loan = person({});
  loan.debts = [{ id: 'l', name: 'Loan', balance: 3000, rate: 9, monthlyPayment: 100 }];
  const d2 = FP.suggest.analyse(loan).suggestions.find((x) => x.id === 'debt');
  assert.equal(d2.safety, false);
  assert.equal(d2.tone, 'tip');
  assert.equal(d2.kind, 'interest');
  assert.ok(FP.suggest.valuePerYear(d2) > 0);
});

test('value a year: interest saved, retirement income a year, or tax saved', () => {
  const p = fixture('sample');
  const r = FP.suggest.analyse(p);
  const relief = r.suggestions.find((x) => x.id === 'relief');
  const scaled = relief.afford.scaled.impact;
  close(FP.suggest.valuePerYear(relief), scaled.change.retirementSpend * 12, 0.001);
  const m = r.suggestions.find((x) => x.id === 'mortgage');
  close(FP.suggest.valuePerYear(m), m.afford.scaled.impact.change.interestSavedPerYear, 0.001);
  const taper = FP.suggest.analyse(fixture('taper')).suggestions.find((x) => x.id === 'taper');
  assert.equal(taper.kind, 'tax');
  assert.ok(FP.suggest.valuePerYear(taper) > 10000);
});

test('interest saved a year is the total saved over the years it makes a difference in', () => {
  const p = person({ mortgage: {}, mortgageRate: 5 });
  const imp = FP.patch.impact(p, [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: 100 }]);
  const years = (() => {
    const a = FP.patch.interestByYear(FP.projection.project(p));
    const b = FP.patch.interestByYear(FP.projection.project(FP.patch.applyPatch(p, [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: 100 }])));
    return a.filter((x, i) => Math.abs(x - b[i]) >= 1).length;
  })();
  close(imp.change.interestSavedPerYear * years, -imp.change.interest, 1);
});

test('actions worth under £100 a year are smaller ideas', () => {
  const g = FP.suggest.groupActions(FP.suggest.actions(fixture('sample')));
  assert.ok(g.smaller.length > 0);
  g.smaller.forEach((x) => assert.ok(FP.suggest.valuePerYear(x) < 100, x.id));
});

// ---------- Rough stage ----------

test('the emergency fund action waits until cash savings have been answered', () => {
  const p = person({ cash: 0 });
  assert.ok(!ids(FP.suggest.analyse(p)).includes('emergency'));
  assert.equal(FP.suggest.analyse(p).emergency.known, false);
  assert.ok(ids(FP.suggest.analyse(p, { cashKnown: true })).includes('emergency'));
  p.assets.cashSavings = 500;
  assert.ok(ids(FP.suggest.analyse(p)).includes('emergency'));
});

// ---------- Big-ticket checks ----------

test('£100k tax trap: the contribution that brings adjusted net income to £100,000, and the tax saved', () => {
  const p = person({ salary: 112000 });
  const t = FP.suggest.taxTrap(p, 0);
  close(t.ani, FP.tax.forProfile(p).adjustedNetIncome);
  assert.ok(t.contribution >= t.ani - 100000 && t.contribution < t.ani - 100000 + 112000 * 0.001 + 0.01);
  const after = FP.patch.applyPatch(p, t.patch);
  assert.ok(FP.tax.forProfile(after).adjustedNetIncome <= 100000.5);
  const before = FP.tax.forProfile(p);
  const now = FP.tax.forProfile(after);
  close(t.taxSaved, before.incomeTax + before.nationalInsurance - now.incomeTax - now.nationalInsurance);
  // About 60% (40% tax plus the allowance) plus 2% NI on the contribution, for net pay.
  assert.ok(t.taxSaved / t.contribution > 0.59 && t.taxSaved / t.contribution < 0.63, String(t.taxSaved / t.contribution));
  assert.equal(FP.suggest.taxTrap(person({ salary: 90000 }), 0), null);
  assert.equal(FP.suggest.taxTrap(person({ salary: 140000 }), 0), null);
  const idea = FP.suggest.analyse(p).suggestions.find((x) => x.id === 'taper');
  assert.match(idea.text, /brings it to £100,000 and saves about £[\d,]+ tax a year/);
});

test('higher-rate relief at source: the £ a year to claim through Self Assessment', () => {
  const p = person({ salary: 70000, income: { pensionMethod: 'reliefAtSource' }, assumptions: { employeePensionPct: 5 } });
  const c = FP.suggest.reliefToClaim(p, 0);
  // £3,500 gross, all of it in the higher-rate band: another 20%.
  close(c.claim, 700, 0.5);
  assert.equal(c.topRate, 40);
  const idea = FP.suggest.analyse(p).suggestions.find((x) => x.id === 'claimRelief');
  assert.match(idea.title, /Claim £700 a year/);
  assert.match(idea.text, /Self Assessment/);
  assert.equal(idea.patch, null);
  close(FP.suggest.valuePerYear(idea), c.claim);
  // Basic-rate, or net pay: nothing to claim.
  assert.equal(FP.suggest.reliefToClaim(person({ salary: 30000, income: { pensionMethod: 'reliefAtSource' } }), 0), null);
  assert.equal(FP.suggest.reliefToClaim(person({ salary: 70000 }), 0), null);
});

test('State Pension below the full amount: check your record, with the GOV.UK link', () => {
  const p = person({ assumptions: { statePension: 9000 } });
  const g = FP.suggest.statePensionGap(p, 0);
  assert.equal(g.have, 9000);
  close(g.gap, FP.assumptions.def('statePension').default - 9000);
  const idea = FP.suggest.analyse(p).suggestions.find((x) => x.id === 'statePension');
  assert.match(idea.text, /Check your record for gaps; voluntary contributions can add to it/);
  assert.equal(idea.link.href, 'https://www.gov.uk/check-state-pension');
  assert.equal(FP.suggest.statePensionGap(person({}), 0), null);
});

test('a fixed rate ending within 12 months: when, and how much payments could rise', () => {
  const p = person({ mortgage: { fixEnds: '2027-03', rateAfterFix: 7 }, mortgageRate: 4 });
  const f = FP.suggest.fixEnding(p, NOW);
  assert.equal(f.when, 'March 2027');
  assert.equal(f.monthsLeft, 5);
  // The balance after the fix's last month, then the payment at 7% over what's left.
  let bal = 200000;
  const pay = FP.mortgage.monthlyPayment(200000, 4, 240);
  for (let k = 0; k < 6; k += 1) bal = bal * (1 + 4 / 1200) - pay;
  close(f.rise, FP.mortgage.monthlyPayment(bal, 7, 234) - pay);
  assert.ok(f.rise > 200);
  const idea = FP.suggest.analyse(p, { now: NOW }).suggestions.find((x) => x.id === 'fixEnds');
  assert.match(idea.text, /^Your fix ends in March 2027\. Payments could rise by £[\d,]+ a month\. Start comparing deals now/);
  // Six or more months away: start six months before.
  const later = person({ mortgage: { fixEnds: '2027-08', rateAfterFix: 7 }, mortgageRate: 4 });
  assert.match(FP.suggest.analyse(later, { now: NOW }).suggestions.find((x) => x.id === 'fixEnds').text, /Start comparing deals six months before\./);
  // More than 12 months away, already over, or no mortgage: nothing.
  assert.equal(FP.suggest.fixEnding(person({ mortgage: { fixEnds: '2028-01', rateAfterFix: 7 } }), NOW), null);
  assert.equal(FP.suggest.fixEnding(person({ mortgage: { fixEnds: '2026-01', rateAfterFix: 7 } }), NOW), null);
  // No rate after: says so.
  const norate = person({ mortgage: { fixEnds: '2027-03' }, mortgageRate: 4 });
  assert.equal(FP.suggest.fixEnding(norate, NOW).rise, null);
  assert.match(FP.suggest.analyse(norate, { now: NOW }).suggestions.find((x) => x.id === 'fixEnds').text, /Add the rate you expect after/);
});

test('the fixed rate ending changes the mortgage in the projection and today’s figures', () => {
  const p = person({ mortgage: { fixEnds: '2027-03', rateAfterFix: 7 }, mortgageRate: 4 });
  const ref = FP.mortgage.amortise({ balance: 200000, annualRatePct: 4, termMonths: 240, rateChange: { afterMonths: 6, annualRatePct: 7 } });
  const r = FP.projection.project(p, { startYear: 2026, startMonth: 10 }).rows;
  close(r[1].mortgage, ref.yearEndBalances[0], 0.01);
  close(r[3].mortgage, ref.yearEndBalances[2], 0.01);
  assert.deepEqual(FP.mortgage.fixChange(p.mortgage, 2026 * 12 + 9), { afterMonths: 6, annualRatePct: 7 });
  assert.equal(FP.mortgage.fixChange({ fixEnds: '2027-03', rateAfterFix: null }, 0), null);
  assert.equal(FP.mortgage.monthName('2027-03'), 'March 2027');
});

// ---------- Fields and schema 10 ----------

test('a month and year is kept as YYYY-MM, or blank', () => {
  const f = FP.profile.fieldFor('mortgage.fixEnds');
  assert.equal(f.label, 'Fixed rate ends');
  assert.equal(FP.profile.fieldFor('mortgage.rateAfterFix').label, 'Rate you expect after');
  assert.deepEqual(FP.profile.parseValue(f, '2027-3'), { ok: true, value: '2027-03' });
  assert.deepEqual(FP.profile.parseValue(f, ''), { ok: true, value: null });
  assert.equal(FP.profile.parseValue(f, '2027-13').ok, false);
  assert.equal(FP.profile.parseValue(f, 'March').ok, false);
  const p = FP.profile.normalise({ mortgage: { balance: 1, fixEnds: '2027-03', rateAfterFix: 6.5 } });
  assert.equal(p.mortgage.fixEnds, '2027-03');
  assert.equal(p.mortgage.rateAfterFix, 6.5);
  // Not an assumption any more.
  assert.equal(FP.assumptions.def('mortgageRateChangeYear'), undefined);
  assert.equal(FP.assumptions.def('mortgageRateAfterChange'), undefined);
});

test('migration 10: "rate changes after N years" becomes the month the fix ends, in the baseline and in scenario patches', () => {
  const base = copy(G.readFixture('sample'));
  Object.assign(base.assumptions, { mortgageRateChangeYear: 2, mortgageRateAfterChange: 6 });
  const v9 = { schemaVersion: 9, workspace: { activeId: 'a', scenarios: [
    { id: 'a', name: 'Baseline', profile: base },
    { id: 'b', name: 'Later fix', patch: [{ path: 'assumptions.mortgageRateChangeYear', op: 'set', value: 5 }, { path: 'assumptions.mortgageRateAfterChange', op: 'set', value: 4 }] }],
  checkins: { snapshots: [], projection: null } } };
  const step = FP.migrate.STEPS.find((s) => s.from === 9);
  const up = step.up(copy(v9), NOW);
  const p = up.workspace.scenarios[0].profile;
  // October 2026 + 24 months − 1: the new rate starts after 24 months, as before.
  assert.equal(p.mortgage.fixEnds, '2028-09');
  assert.equal(p.mortgage.rateAfterFix, 6);
  assert.equal(p.assumptions.mortgageRateChangeYear, undefined);
  assert.deepEqual(up.workspace.scenarios[1].patch, [{ path: 'mortgage.fixEnds', op: 'set', value: '2031-09' }, { path: 'mortgage.rateAfterFix', op: 'set', value: 4 }]);
  // Loaded through the store (at today's date), the projection matches the old rule.
  const loaded = FP.migrate.upgrade(v9);
  assert.equal(loaded.from, 9);
  const q = loaded.workspace.scenarios[0].profile;
  const ch = FP.mortgage.fixChange(q.mortgage, new Date().getFullYear() * 12 + new Date().getMonth());
  assert.deepEqual(ch, { afterMonths: 24, annualRatePct: 6 });
  assert.equal(loaded.workspace.scenarios[1].profile.mortgage.rateAfterFix, 4);
});

test('a rough figure is kept only while it has a value', () => {
  assert.deepEqual(FP.profile.normalise({ assets: { pension: 40000 }, rough: { 'assets.pension': true, other: true } }).rough, { 'assets.pension': true });
  assert.deepEqual(FP.profile.normalise({ assets: { pension: 0 }, rough: { 'assets.pension': true } }).rough, {});
  assert.deepEqual(FP.profile.blank().rough, {});
});

test('a rough pension from the quick start counts in the first look but not as your pension pots being in', () => {
  const p = fixture('quickstart');
  const without = FP.projection.retirementNeed(p).have;
  p.assets.pension = 50000;
  p.rough['assets.pension'] = true;
  assert.ok(FP.projection.retirementNeed(p).have > without);
  assert.equal(FP.summary.checklist(p).items.find((i) => i.id === 'pension').done, false);
  delete p.rough['assets.pension'];
  assert.equal(FP.summary.checklist(p).items.find((i) => i.id === 'pension').done, true);
});

// ---------- Goal-seek limits ----------

test('goal-seek: the sample household can’t reach £4,600 a month with its pension, and never suggests 52.5%', () => {
  const p = fixture('sample');
  const r = FP.goalSeek.solve(p, { id: 'spend', value: 4600 }, 'pension');
  assert.equal(r.ok, true);
  assert.equal(r.reachable, false);
  assert.notEqual(r.value, 52.5);
  assert.ok(r.canTry);
  assert.equal(r.closest.limit, 'afford');
  // The closest is no more than it can afford: nothing left over goes negative.
  const q = FP.patch.applyPatch(p, r.patch);
  assert.ok(FP.summary.compute(q, FP.tax.household(q).takeHomeMonthly).cashFlow.surplus >= 0);
  assert.ok(r.closest.reaches < 4600);
});

test('goal-seek: pensions within the annual allowance, retiring by 75, spending no lower than bills', () => {
  const rich = person({ salary: 200000, spend: 1000, assumptions: { employerPensionPct: 10 } });
  const lim = FP.goalSeek.pensionLimit(rich);
  assert.equal(lim.why, 'allowance');
  assert.ok((lim.hi + 10) * 2000 <= 60000 + 1e-6);
  const p = fixture('sample');
  const old = FP.goalSeek.solve(p, { id: 'spend', value: 99999 }, 'retireAge');
  assert.equal(old.reachable, false);
  assert.equal(old.value, 75);
  const sp = FP.goalSeek.solve(p, { id: 'spend', value: 99999 }, 'spending');
  assert.equal(sp.reachable, false);
  const bills = p.spending.filter((x) => x.group === 'bills').reduce((t, x) => t + x.monthly, 0);
  assert.equal(sp.value, Math.ceil(bills / 10) * 10);
  // Bills stay as they are; the rest scales.
  const after = FP.patch.applyPatch(p, FP.goalSeek.spendingPatch(p, 1000));
  p.spending.forEach((x, i) => { if (x.group === 'bills') assert.equal(after.spending[i].monthly, x.monthly); });
  close(after.spending.reduce((t, x) => t + x.monthly, 0), 1000, 0.1);
});
