const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const sample = () => FP.sampleWorkspace().scenarios[0].profile;
const o = (id) => FP.outcomes.byId(id);

test('every outcome evaluates the sample and lists drivers that exist', () => {
  const p = sample();
  FP.outcomes.OUTCOMES.forEach((x) => {
    const r = x.evaluate(p);
    assert.equal(r.ok, true, x.id);
    assert.ok(r.headline, x.id);
    x.drivers(p).forEach((path) => {
      const v = FP.profile.get(p, path);
      assert.notEqual(v, undefined, `${x.id}: ${path}`);
    });
  });
});

test('changing a driver on a copy shows what changes, and leaves the plan alone', () => {
  const p = sample();
  const before = o('studentLoan').evaluate(p);
  const q = FP.outcomes.copy(p);
  q.income.grossSalary += 15000;
  const diff = FP.outcomes.compare(before, o('studentLoan').evaluate(q));
  assert.equal(diff[0].label, 'Repaid at');
  assert.ok(diff[0].after < diff[0].before);
  assert.equal(diff[0].change, 'better');
  assert.equal(p.income.grossSalary, sample().income.grossSalary);
});

test('levers report their effect on the headline figure', () => {
  const p = sample();
  const effects = FP.outcomes.leverEffects('retirement', p);
  const later = effects.find((e) => /Retire 1 year later/.test(e.lever.label));
  assert.ok(later.diff.after > later.diff.before);
  assert.equal(later.diff.change, 'better');
  const m = FP.outcomes.leverEffects('mortgage', p).find((e) => /£100/.test(e.lever.label));
  assert.ok(m.diff.after <= m.diff.before);
});

test('goal: what you set, or what you spend now', () => {
  const p = sample();
  const spend = p.spending.reduce((t, x) => t + x.monthly, 0);
  assert.equal(FP.outcomes.goalMonthly(p), spend);
  p.goals.retirementIncome = 2500;
  assert.equal(FP.outcomes.goalMonthly(p), 2500);
  assert.equal(FP.profile.normalise({ goals: { retirementIncome: '2,000' } }).goals.retirementIncome, 2000);
});

test('moving leftover share keeps the split at 100%', () => {
  const p = sample();
  FP.outcomes.moveShare(p, 'pension', 10);
  const total = FP.projection.SPLIT_KEYS.reduce((t, k) => t + (p.leftover[k] || 0), 0);
  assert.ok(Math.abs(total - 100) < 0.5, String(total));
});

test('ideas are grouped with their outcome', () => {
  const p = sample();
  const ids = FP.outcomes.ideasFor('retirement', p).map((s) => s.id);
  assert.ok(ids.includes('relief'));
  assert.ok(!ids.includes('debt'));
});
