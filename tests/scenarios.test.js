const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

test('a workspace starts with a baseline that is active', () => {
  const ws = FP.scenarios.fromProfile(FP.sample());
  assert.equal(ws.scenarios.length, 1);
  assert.equal(ws.scenarios[0].name, 'Baseline');
  assert.equal(ws.activeId, ws.scenarios[0].id);
  assert.equal(FP.scenarios.isBaseline(ws, ws.activeId), true);
});

test('clone makes an independent copy and activates it', () => {
  const ws = FP.scenarios.fromProfile(FP.sample());
  const base = ws.scenarios[0];
  const copy = FP.scenarios.clone(ws, base.id, 'Retire early');
  assert.equal(ws.activeId, copy.id);
  assert.equal(copy.name, 'Retire early');
  assert.deepEqual(copy.profile, base.profile);
  copy.profile.assumptions.retirementAge = 60;
  copy.profile.spending[0].monthly = 999;
  assert.equal(base.profile.assumptions.retirementAge, 67);
  assert.notEqual(base.profile.spending[0].monthly, 999);
  // default and duplicate names
  assert.equal(FP.scenarios.clone(ws, base.id).name, 'Copy of Baseline');
  assert.equal(FP.scenarios.clone(ws, base.id, 'retire early').name, 'retire early (2)');
});

test('clone stops at the scenario limit', () => {
  const ws = FP.scenarios.fromProfile(FP.profile.blank());
  for (let i = 1; i < FP.scenarios.MAX_SCENARIOS; i += 1) assert.ok(FP.scenarios.clone(ws, ws.activeId));
  assert.equal(FP.scenarios.clone(ws, ws.activeId), null);
  assert.equal(ws.scenarios.length, FP.scenarios.MAX_SCENARIOS);
});

test('rename and remove; the baseline stays', () => {
  const ws = FP.scenarios.fromProfile(FP.sample());
  const base = ws.scenarios[0];
  const copy = FP.scenarios.clone(ws, base.id, 'A');
  assert.equal(FP.scenarios.rename(ws, copy.id, '  New   name '), true);
  assert.equal(copy.name, 'New name');
  FP.scenarios.rename(ws, copy.id, '');
  assert.equal(copy.name, 'New name'); // blank keeps the old name
  assert.equal(FP.scenarios.remove(ws, base.id), false);
  assert.equal(FP.scenarios.remove(ws, copy.id), true);
  assert.equal(ws.scenarios.length, 1);
  assert.equal(ws.activeId, base.id); // active fell back to the baseline
});

test('normalise repairs bad data and upgrades a single profile', () => {
  const up = FP.scenarios.normalise({ profile: { about: { age: 50 } } });
  assert.equal(up.scenarios.length, 1);
  assert.equal(up.scenarios[0].profile.about.age, 50);
  const ws = FP.scenarios.normalise({
    activeId: 'missing',
    scenarios: [{ id: 'x', name: '', profile: {} }, { id: 'x', name: 'Dup id' }, null],
  });
  assert.equal(ws.scenarios.length, 2);
  assert.equal(ws.scenarios[0].name, 'Baseline');
  assert.notEqual(ws.scenarios[0].id, ws.scenarios[1].id);
  assert.equal(ws.activeId, ws.scenarios[0].id);
  assert.equal(FP.scenarios.normalise({ scenarios: [] }).scenarios.length, 1);
});

test('differences lists what changed in plain terms', () => {
  const a = FP.sample();
  const b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(FP.scenarios.differences(a, b), []);
  b.assumptions.retirementAge = 60;
  b.assumptions.investmentReturn = 7;
  b.assumptions.taxThresholds = 'inflation';
  b.income.grossSalary = 60000;
  b.spending[0].monthly += 100;
  b.mortgage.monthlyOverpayment = 300;
  const d = FP.scenarios.differences(a, b);
  const by = (label) => d.find((x) => x.label === label);
  assert.deepEqual(by('Retirement age'), { label: 'Retirement age', from: 67, to: 60, kind: 'number' });
  assert.equal(by('Investment return (before fees)').to, 7);
  assert.equal(by('Tax thresholds in future years').to, 'Rise with inflation');
  assert.equal(by('Gross salary').kind, 'money');
  assert.equal(by('Monthly spending').to - by('Monthly spending').from, 100);
  assert.equal(by('Monthly overpayment').to, 300);
  assert.equal(d.length, 6);
});

test('compare: retiring earlier gives a smaller pension pot at the same age', () => {
  const ws = FP.sampleWorkspace();
  assert.equal(ws.scenarios.length, 3);
  const [base, early, markets] = ws.scenarios.map((s) => FP.compare.summarise(s.profile, true));
  assert.equal(early.retirementAge, 60);
  const age = 67;
  assert.ok(FP.compare.rowAtAge(early, age).pension < FP.compare.rowAtAge(base, age).pension);
  assert.ok(markets.end.netWorth > base.end.netWorth);
  // Today is the same for all three
  assert.equal(base.netWorthToday, early.netWorthToday);
  assert.equal(FP.compare.commonEndAge([base, early, markets]), base.end.age);
});

test('compare: real values are nominal divided by inflation', () => {
  const p = FP.sample();
  const nominal = FP.compare.summarise(p, false);
  const real = FP.compare.summarise(p, true);
  const f = nominal.projection.rows[nominal.end.y].inflationFactor;
  assert.ok(Math.abs(real.end.netWorth - nominal.end.netWorth / f) < 0.01);
});
