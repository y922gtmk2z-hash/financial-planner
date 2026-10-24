// Actions: how-to steps, the suggested split as an action, ranking, impact figures,
// the 'applied' mark, and making a scenario your plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));

test('each kind of idea says how to do it in 2 to 4 plain steps, naming no providers or products', () => {
  ['relief', 'taper', 'isa', 'mortgage', 'debt'].forEach((id) => {
    const steps = FP.suggest.HOW_TO[id];
    assert.ok(steps.length >= 2 && steps.length <= 4, id);
    steps.forEach((s) => {
      assert.ok(s.length > 20 && /[.!?]$/.test(s), `${id}: ${s}`);
      assert.ok(!/https?:|www\.|\b(Ltd|plc)\b|®|™/.test(s), `${id}: ${s}`);
    });
  });
  assert.match(FP.suggest.HOW_TO.mortgage.join(' '), /overpayment limit/);
  assert.match(FP.suggest.HOW_TO.debt.join(' '), /minimum/);
  assert.match(FP.suggest.HOW_TO.debt.join(' '), /0% balance transfer/);
  assert.match(FP.suggest.HOW_TO.relief.join(' '), /payroll or HR/);
  assert.match(FP.suggest.HOW_TO.relief.join(' '), /salary sacrifice/);
  // Ideas get their own copy of the steps.
  const idea = FP.suggest.analyse(fixture('sample')).suggestions.find((s) => s.id === 'relief');
  assert.deepEqual(idea.howTo, FP.suggest.HOW_TO.relief);
  assert.notEqual(idea.howTo, FP.suggest.HOW_TO.relief);
});

test('the sample household: using the suggested split puts a share towards its debts', () => {
  const p = fixture('sample');
  assert.equal(p.leftover.debts, 0, 'its own split has nothing for debts');
  const act = FP.suggest.splitAction(p);
  assert.equal(act.id, 'split');
  assert.equal(act.title, 'Use the suggested split');
  const q = FP.patch.applyPatch(p, act.patch);
  assert.ok(q.leftover.debts > 0, `debt share ${q.leftover.debts}%`);
  assert.equal(FP.projection.splitShares(q.leftover, 1).total, 100);
  // Once it's used, there's nothing left to apply.
  assert.equal(FP.suggest.splitAction(q), null);
});

test('the split action does exactly what "Use this split" did', () => {
  G.names().forEach((name) => {
    const p = fixture(name);
    const r = FP.suggest.analyse(p);
    const act = FP.suggest.splitAction(p, r);
    if (!act) return;
    const before = FP.projection.setSplitFromPct({ ...p.leftover }, r.split, Math.max(0, r.left));
    assert.deepEqual(FP.patch.applyPatch(p, act.patch).leftover, before, name);
  });
  // In £ a month, it stays in £.
  const p = fixture('sample');
  p.leftover = { ...p.leftover, unit: 'gbp', emergency: 0, debts: 0, cash: 0, invest: 0, mortgage: 0, pension: 0 };
  const q = FP.patch.applyPatch(p, FP.suggest.splitAction(p).patch);
  assert.equal(q.leftover.unit, 'gbp');
  assert.ok(q.leftover.debts > 0);
});

test('nothing chosen for leftover money makes the split action a problem to fix', () => {
  const p = fixture('quickstart');
  assert.equal(FP.suggest.splitAction(p).tone, 'warn');
  assert.equal(FP.suggest.splitAction(fixture('sample')).tone, 'tip');
  assert.equal(FP.suggest.splitAction(fixture('stretched')), null, 'no split when nothing is left over');
});

test('actions are ranked: problems first, then the biggest gain in retirement spending', () => {
  const p = fixture('sample');
  const r = FP.suggest.analyse(p);
  const list = FP.suggest.rankActions(r.suggestions.concat(FP.suggest.splitAction(p, r)).filter((x) => x.tone !== 'good'));
  const warn = list.filter((x) => x.tone === 'warn');
  assert.deepEqual(list.slice(0, warn.length), warn, 'warn first');
  const tips = list.slice(warn.length).filter((x) => x.patch);
  const gains = tips.map((x) => x.impact.change.retirementSpend);
  assert.deepEqual(gains, gains.slice().sort((x, y) => y - x), 'then by gain');
  const noPatch = list.findIndex((x) => !x.patch);
  if (noPatch >= 0) assert.ok(list.slice(noPatch).every((x) => !x.patch || x.tone === 'warn'), 'ideas with nothing to apply last');
});

test('each action shows up to two figures: its main gain, then its cost now', () => {
  const r = FP.suggest.analyse(fixture('sample'));
  const pick = (id) => FP.suggest.highlights(r.suggestions.find((s) => s.id === id)).map((x) => x.key);
  assert.deepEqual(pick('relief'), ['retirementSpend', 'leftoverCost']);
  assert.deepEqual(pick('mortgage'), ['interestSaved', 'leftoverCost']);
  assert.deepEqual(FP.suggest.highlights(r.suggestions.find((s) => s.id === 'match')), []);
  // A trade-off is shown as one: the sample's suggested split adds to savings at
  // retirement but leaves less to spend each month in retirement.
  assert.deepEqual(FP.suggest.highlights(FP.suggest.splitAction(fixture('sample'))).map((x) => x.key), ['atRetirement', 'retirementSpendCost']);
  FP.suggest.highlights(r.suggestions.find((s) => s.id === 'mortgage')).forEach((x) => assert.ok(x.value > 0));
});

test('an idea can be marked applied, and older saves still load', () => {
  const p = FP.profile.normalise({ ideas: { relief: 'applied', debt: 'done', isa: 'hidden', x: 'nonsense' } });
  assert.deepEqual(p.ideas, { relief: 'applied', debt: 'done', isa: 'hidden' });
  const v3 = { schemaVersion: 3, workspace: { scenarios: [{ name: 'Baseline', profile: G.readFixture('sample') }] } };
  const up = FP.migrate.upgrade(v3);
  assert.equal(up.from, 3);
  assert.equal(up.newer, false);
  assert.equal(up.workspace.scenarios[0].profile.about.age, 38);
  assert.equal(FP.migrate.upgrade({ schemaVersion: FP.migrate.CURRENT + 1, workspace: { scenarios: [] } }).newer, true);
});

test('make this my plan: the scenario becomes Baseline and the old one is kept', () => {
  const ws = FP.sampleWorkspace();
  const [base, early] = ws.scenarios;
  const earlyProfile = JSON.stringify(early.profile);
  assert.equal(FP.scenarios.makeBaseline(ws, base.id, '24 Oct 2026'), false, 'not the baseline itself');
  assert.equal(FP.scenarios.makeBaseline(ws, early.id, '24 Oct 2026'), true);
  assert.equal(ws.scenarios.length, 3);
  assert.equal(ws.scenarios[0].id, early.id);
  assert.equal(ws.scenarios[0].name, 'Baseline');
  assert.equal(JSON.stringify(ws.scenarios[0].profile), earlyProfile, 'its figures are unchanged');
  assert.equal(ws.activeId, early.id);
  const old = ws.scenarios.find((s) => s.id === base.id);
  assert.equal(old.name, 'Previous plan (24 Oct 2026)');
  assert.ok(FP.scenarios.isBaseline(ws, early.id));
  // Twice on the same day: names stay unique.
  FP.scenarios.makeBaseline(ws, base.id, '24 Oct 2026');
  const names = ws.scenarios.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names[0], 'Baseline');
});
