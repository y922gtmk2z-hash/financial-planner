// Patches: what an idea or what-if changes, applying it, and measuring its impact.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

test('applyPatch sets and adds values by path, on a copy', () => {
  const p = fixture('sample');
  const q = FP.patch.applyPatch(p, [
    { path: 'assumptions.employeePensionPct', op: 'add', value: 3 },
    { path: 'income.grossSalary', op: 'set', value: 60000 },
    { path: 'spending.2.monthly', op: 'set', value: 400 },
    { path: 'mortgage.monthlyPayment', op: 'add', value: 50 }, // blank counts as 0
  ]);
  assert.equal(q.assumptions.employeePensionPct, p.assumptions.employeePensionPct + 3);
  assert.equal(q.income.grossSalary, 60000);
  assert.equal(q.spending[2].monthly, 400);
  assert.equal(p.mortgage.monthlyPayment, null);
  assert.equal(q.mortgage.monthlyPayment, 50);
  assert.notEqual(q, p);
});

test('applyPatch never changes the profile or the patch it was given', () => {
  const p = deepFreeze(fixture('taper'));
  const rows = [{ id: 'x', type: 'cash', monthly: 10, grows: 'fixed' }];
  const patch = deepFreeze([{ path: 'savings', op: 'set', value: rows }, { path: 'about.age', op: 'add', value: 1 }]);
  const before = JSON.stringify(p);
  const q = FP.patch.applyPatch(p, patch);
  assert.equal(JSON.stringify(p), before);
  q.savings[0].monthly = 99;
  assert.equal(rows[0].monthly, 10, 'set values are copied, not shared');
  assert.deepEqual(FP.patch.applyPatch(p, []), p);
  assert.deepEqual(FP.patch.applyPatch(p, null), p);
});

test('patches round trip: undoing each change gives back the same profile', () => {
  const p = fixture('sample');
  const there = [
    { path: 'assumptions.employeePensionPct', op: 'add', value: 3 },
    { path: 'mortgage.monthlyOverpayment', op: 'add', value: 200 },
    { path: 'income.region', op: 'set', value: 'scotland' },
  ];
  const back = [
    { path: 'assumptions.employeePensionPct', op: 'add', value: -3 },
    { path: 'mortgage.monthlyOverpayment', op: 'add', value: -200 },
    { path: 'income.region', op: 'set', value: p.income.region },
  ];
  assert.deepEqual(FP.patch.applyPatch(FP.patch.applyPatch(p, there), back), p);
  // A patched profile is still a valid profile, unchanged by cleaning up.
  const q = FP.patch.applyPatch(p, there);
  assert.deepEqual(FP.profile.normalise(JSON.parse(JSON.stringify(q))), q);
});

test('applyPatch refuses changes it doesn’t understand', () => {
  const p = fixture('quickstart');
  assert.throws(() => FP.patch.applyPatch(p, [{ path: 'about.age', op: 'multiply', value: 2 }]));
  assert.throws(() => FP.patch.applyPatch(p, [{ path: '', op: 'set', value: 1 }]));
  assert.throws(() => FP.patch.applyPatch(p, [null]));
});

test('impact: paying more into your pension lowers left over and raises retirement spend', () => {
  ['sample', 'quickstart', 'taper'].forEach((name) => {
    const r = FP.patch.impact(fixture(name), [{ path: 'assumptions.employeePensionPct', op: 'add', value: 3 }]);
    assert.ok(r.change.leftover < 0, `${name}: left over goes down`);
    assert.ok(r.change.retirementSpend > 0, `${name}: could spend more in retirement`);
    assert.ok(r.change.atRetirement > 0, `${name}: more saved by retirement`);
    assert.ok(r.change.lastsTo >= 0, `${name}: money lasts at least as long`);
  });
});

test('impact: overpaying the mortgage cuts interest and doesn’t make you debt-free later', () => {
  const r = FP.patch.impact(fixture('sample'), [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: 200 }]);
  assert.ok(Math.abs(r.change.leftover + 200) < 0.01);
  assert.ok(r.change.interest < 0);
  assert.ok(r.change.debtFreeAge <= 0);
  assert.equal(r.after.leftover - r.before.leftover, r.change.leftover);
});

test('impact: no change, no difference; figures not available yet are null', () => {
  const p = fixture('sample');
  const r = FP.patch.impact(p, []);
  Object.values(r.change).forEach((v) => assert.equal(v, 0));
  const blank = FP.patch.impact(FP.profile.blank(), [{ path: 'income.grossSalary', op: 'set', value: 30000 }]);
  assert.equal(blank.before.retirementSpend, null);
  assert.equal(blank.change.retirementSpend, null);
  assert.equal(blank.change.debtFreeAge, null);
});

test('interest paid on a mortgage matches the mortgage calculator', () => {
  const p = FP.profile.normalise({
    about: { age: 40 },
    income: { grossSalary: 50000 },
    mortgage: { balance: 150000, remainingTermYears: 20 },
    spending: [{ category: 'Everything else', monthly: 1000 }],
    assumptions: { mortgageRate: 4.5 },
  });
  const proj = FP.projection.project(p);
  const calc = FP.mortgage.amortise({ balance: 150000, annualRatePct: 4.5, termMonths: 240, monthlyOverpayment: 0 });
  assert.ok(Math.abs(FP.patch.interestPaid(proj) - calc.totalInterest) < 1, `${FP.patch.interestPaid(proj)} vs ${calc.totalInterest}`);
  assert.equal(FP.patch.measure(p).debtFreeAge, 60);
});

test('every idea has a patch (or null), an impact and how-to steps; id, tone, title and text unchanged', () => {
  G.names().forEach((name) => {
    const r = FP.suggest.analyse(fixture(name));
    const golden = G.readGolden(name).suggest.suggestions;
    assert.deepEqual(r.suggestions.map(({ id, tone, title, text }) => ({ id, tone, title, text })),
      golden.map(({ id, tone, title, text }) => ({ id, tone, title, text })));
    r.suggestions.forEach((s) => {
      assert.ok(s.patch === null || Array.isArray(s.patch), `${name} ${s.id}`);
      assert.deepEqual(s.howTo, []);
      if (s.patch) assert.deepEqual(Object.keys(s.impact), ['before', 'after', 'change']);
      else assert.equal(s.impact, null);
    });
  });
  const none = FP.suggest.analyse(fixture('stretched')).suggestions.find((s) => s.id === 'noSurplus');
  assert.equal(none.patch, null);
  assert.equal(none.impact, null);
});

test('an idea’s impact is worked out from the plan as it was, only when read', () => {
  const p = fixture('sample');
  const idea = FP.suggest.analyse(p).suggestions.find((s) => s.id === 'relief');
  const expected = FP.patch.impact(fixture('sample'), idea.patch);
  p.income.grossSalary = 1; // a later edit doesn't change it
  assert.deepEqual(idea.impact, expected);
  assert.equal(idea.impact, idea.impact, 'worked out once');
});

test('the taper idea pays in just enough to bring your income down to £100,000', () => {
  const p = fixture('taper');
  const idea = FP.suggest.analyse(p).suggestions.find((s) => s.id === 'taper');
  const n = idea.patch[0].value;
  const ani = (k) => FP.tax.forProfile(FP.patch.applyPatch(p, [{ path: 'assumptions.employeePensionPct', op: 'add', value: k }])).adjustedNetIncome;
  assert.ok(ani(n) <= FP.taxConfig.taperThreshold);
  assert.ok(ani(n - 1) > FP.taxConfig.taperThreshold);
});

// The what-ifs as they were written before patches, to prove nothing changed.
const OLD = {
  retireEarlier: (p) => { p.assumptions.retirementAge -= 2; },
  workLonger: (p) => { p.assumptions.retirementAge += 2; },
  overpay: (p) => { p.mortgage.monthlyOverpayment = (p.mortgage.monthlyOverpayment || 0) + 200; },
  spendLess: (p) => { p.spending.forEach((r) => { r.monthly = Math.round((r.monthly || 0) * 0.9); }); },
  payRise: (p) => { p.income.grossSalary = Math.round(p.income.grossSalary * 1.1); },
  weakerMarkets: (p) => { p.assumptions.investmentReturn -= 2; p.assumptions.pensionGrowth -= 2; },
};

test('one-tap what-ifs create the same scenarios as before', () => {
  assert.deepEqual(FP.scenarios.PRESETS.map((x) => x.id).sort(), Object.keys(OLD).sort());
  let checked = 0;
  G.names().forEach((name) => {
    FP.scenarios.PRESETS.forEach((preset) => {
      const ws = FP.scenarios.fromProfile(fixture(name));
      if (!preset.applies(ws.scenarios[0].profile)) return;
      const keep = ws.activeId;
      const made = FP.scenarios.fromPreset(ws, preset.id);
      const want = JSON.parse(JSON.stringify(ws.scenarios[0].profile));
      OLD[preset.id](want);
      want.isSample = false;
      assert.deepEqual(made.profile, want, `${name}: ${preset.id}`);
      assert.equal(made.name, preset.name(ws.scenarios[0].profile));
      assert.equal(ws.activeId, keep);
      checked += 1;
    });
  });
  assert.ok(checked >= 20, `${checked} what-ifs checked`);
});
