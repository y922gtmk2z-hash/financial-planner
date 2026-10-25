// Scenarios as the baseline plus a patch (js/model/scenarios.js), and migration 8 → 9.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const S = FP.scenarios;
const json = (x) => JSON.stringify(x);
const fixture = (name) => G.profileFrom(G.readFixture(name));

test('a patch from the differences rebuilds the scenario exactly, for every fixture', () => {
  G.names().forEach((name) => {
    const base = fixture(name);
    const p = JSON.parse(json(base));
    p.assumptions.retirementAge += 2;
    p.spending[0].monthly += 50;
    p.debts.push(FP.profile.newDebt());
    p.owners = { ...p.owners, 'assets.other': p.owners['assets.other'] === 'joint' ? 'partner' : 'joint' };
    p.ideas.isa = 'applied';
    const patch = S.diffPatch(base, p);
    assert.equal(json(S.materialise(base, patch)), json(FP.profile.normalise(p)), name);
    assert.ok(patch.some((c) => c.path === 'assumptions.retirementAge' && c.value === base.assumptions.retirementAge + 2), name);
    assert.ok(patch.some((c) => c.path === `spending.#${base.spending[0].id}.monthly`), `${name}: a row by its id`);
    assert.ok(patch.some((c) => c.path === 'debts'), `${name}: a list with a new row is set whole`);
    assert.ok(patch.some((c) => c.path === 'owners'), `${name}: owners (keys with dots) set whole`);
    assert.deepEqual(S.diffPatch(base, base), [], `${name}: no changes, no patch`);
  });
});

test('a row patched by id follows that row when the baseline’s list changes, and is dropped once it’s gone', () => {
  const base = fixture('sample');
  const p = JSON.parse(json(base));
  p.spending[2].monthly = 999;
  const patch = S.diffPatch(base, p);
  const moved = JSON.parse(json(base));
  moved.spending.reverse();
  const out = S.materialise(moved, patch);
  assert.equal(out.spending.find((r) => r.id === base.spending[2].id).monthly, 999);
  assert.equal(out.spending.filter((r) => r.monthly === 999).length, 1);
  const gone = JSON.parse(json(base));
  gone.spending.splice(2, 1);
  assert.equal(json(S.materialise(gone, patch)), json(FP.profile.normalise(gone)));
});

test('patches read from a file keep only well-formed changes', () => {
  const clean = S.cleanPatch([
    { path: 'assumptions.retirementAge', op: 'set', value: 60 },
    { path: '__proto__.polluted', op: 'set', value: 1 },
    { path: 'spending.#__proto__.monthly', op: 'set', value: 1 },
    { path: 'a..b', op: 'set', value: 1 },
    { path: 'assumptions.inflation', op: 'add', value: 'x' },
    { path: 'assumptions.inflation', op: 'delete' },
    null, 'text',
  ]);
  assert.deepEqual(clean, [{ path: 'assumptions.retirementAge', op: 'set', value: 60 }]);
  assert.deepEqual(S.cleanPatch('nonsense'), []);
  const ws = S.normalise({ scenarios: [{ profile: fixture('sample') }, { patch: [{ path: '__proto__.x', op: 'set', value: 1 }, { path: 'assumptions.retirementAge', op: 'set', value: 60 }] }] });
  assert.equal(ws.scenarios[1].profile.assumptions.retirementAge, 60);
  assert.equal({}.x, undefined);
});

test('applying an action to the baseline carries into every scenario, and their differences stay the same', () => {
  const ws = FP.sampleWorkspace();
  S.sync(ws);
  const diffsBefore = ws.scenarios.slice(1).map((sc) => json(S.differences(ws.scenarios[0].profile, sc.profile)));
  const patchesBefore = ws.scenarios.slice(1).map((sc) => json(sc.patch));
  const base = ws.scenarios[0];
  const isa = FP.suggest.analyse(base.profile).suggestions.find((x) => x.id === 'isa');
  assert.equal(isa.title, 'Use your ISA allowance');
  base.profile = FP.patch.applyPatch(base.profile, isa.patch);
  base.profile.ideas.isa = 'applied';
  S.sync(ws);
  ws.scenarios.slice(1).forEach((sc, i) => {
    assert.equal(json(S.differences(base.profile, sc.profile)), diffsBefore[i], sc.name);
    assert.equal(json(sc.patch), patchesBefore[i], `${sc.name}: patch unchanged`);
    assert.equal(json(sc.profile.savings), json(base.profile.savings), `${sc.name}: has the ISA saving`);
    assert.equal(sc.profile.ideas.isa, 'applied');
  });
});

test('editing a scenario edits only its own patch', () => {
  const ws = FP.sampleWorkspace();
  S.sync(ws);
  const [base, early, markets] = ws.scenarios;
  const baseJson = json(base.profile);
  const marketsPatch = json(markets.patch);
  early.profile.income.grossSalary = 60000;
  S.sync(ws);
  assert.equal(json(base.profile), baseJson, 'baseline unchanged');
  assert.equal(json(markets.patch), marketsPatch, 'other scenario unchanged');
  assert.deepEqual(early.patch.map((c) => c.path).sort(), ['assumptions.retirementAge', 'income.grossSalary']);
  // A baseline change it already overrides doesn't reach it; others do.
  base.profile.income.grossSalary = 58000;
  base.profile.assumptions.inflation = 3;
  S.sync(ws);
  assert.equal(early.profile.income.grossSalary, 60000);
  assert.equal(early.profile.assumptions.inflation, 3);
  assert.equal(markets.profile.income.grossSalary, 58000);
});

test('Make this my plan: the new baseline is the old one plus that patch, and the others keep their own', () => {
  const ws = FP.sampleWorkspace();
  S.sync(ws);
  const [oldBase, early, markets] = ws.scenarios;
  const oldProfile = json(oldBase.profile);
  const marketsPatch = json(markets.patch);
  assert.equal(S.makeBaseline(ws, early.id, '25 Oct 2026'), true);
  assert.equal(ws.scenarios[0], early);
  assert.equal(early.profile.assumptions.retirementAge, 60);
  assert.equal(json(markets.patch), marketsPatch);
  assert.equal(markets.profile.assumptions.retirementAge, 60, 'the other scenario now builds on the new plan');
  assert.equal(markets.profile.assumptions.marketShift, 2);
  assert.equal(json(oldBase.profile), oldProfile, 'the previous plan keeps its figures');
  assert.deepEqual(oldBase.patch.map((c) => c.path), ['assumptions.retirementAge']);
});

test('saved, only the baseline keeps a profile; it loads back the same', () => {
  const ws = FP.sampleWorkspace();
  const saved = JSON.parse(json(S.toSaved(ws)));
  assert.ok(saved.scenarios[0].profile);
  saved.scenarios.slice(1).forEach((sc) => { assert.equal(sc.profile, undefined); assert.ok(Array.isArray(sc.patch)); });
  const back = S.normalise(saved);
  ws.scenarios.forEach((sc, i) => assert.equal(json(back.scenarios[i].profile), json(sc.profile), sc.name));
  const exported = JSON.parse(FP.store.exportJson(ws));
  assert.equal(exported.schemaVersion, 9);
  assert.equal(exported.workspace.scenarios[1].profile, undefined);
  const imported = FP.store.importJson(json(exported));
  assert.equal(imported.ok, true);
  ws.scenarios.forEach((sc, i) => assert.equal(json(imported.workspace.scenarios[i].profile), json(sc.profile), sc.name));
});

test('migration 9: a version 8 workspace’s scenarios become patches of their differences, with the same figures', () => {
  const base = fixture('sample');
  const early = JSON.parse(json(base));
  early.assumptions.retirementAge = 60;
  const couple = JSON.parse(json(fixture('couple')));
  const v8 = { app: 'uk-finance-planner', schemaVersion: 8, workspace: { activeId: 'b', scenarios: [
    { id: 'a', name: 'Baseline', profile: base }, { id: 'b', name: 'Retire at 60', profile: early }, { id: 'c', name: 'Another household', profile: couple }],
  checkins: { snapshots: [], projection: null } } };
  const step = FP.migrate.STEPS.find((s) => s.from === 8);
  const up = step.up(JSON.parse(json(v8)));
  assert.equal(up.workspace.scenarios[1].profile, undefined);
  assert.deepEqual(up.workspace.scenarios[1].patch, [{ path: 'assumptions.retirementAge', op: 'set', value: 60 }]);
  const r = FP.store.importJson(json(v8));
  assert.equal(r.ok, true);
  assert.equal(r.workspace.activeId, 'b');
  [base, early, couple].forEach((p, i) => assert.equal(json(r.workspace.scenarios[i].profile), json(FP.profile.normalise(p)), `scenario ${i}`));
  ['sample', 'couple'].forEach((name, i) => {
    const changes = G.diff(G.readGolden(name), G.snapshot(r.workspace.scenarios[i * 2].profile));
    assert.equal(changes.length, 0, G.describe(changes));
  });
});
