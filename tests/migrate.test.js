// Saved data and backups from every earlier version load, upgraded step by step.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test.afterEach(() => { delete globalThis.localStorage; });

// Each fixture as the app holds it, as plain saved data.
const saved = (name) => JSON.parse(JSON.stringify(G.profileFrom(G.readFixture(name))));

// Files as each version wrote them.
const files = {
  'version 1 save': (profile) => ({ schemaVersion: 1, savedAt: '2025-01-01T00:00:00.000Z', profile }),
  'version 1 export': (profile) => ({ app: 'uk-finance-planner', schemaVersion: 1, exportedAt: '2025-01-01T00:00:00.000Z', profile }),
  'version 2 save': (profile) => ({ schemaVersion: 2, savedAt: '2026-01-01T00:00:00.000Z', workspace: { activeId: 'a', scenarios: [{ id: 'a', name: 'Baseline', profile }] } }),
  'version 2 export': (profile) => ({ app: 'uk-finance-planner', schemaVersion: 2, exportedAt: '2026-01-01T00:00:00.000Z', workspace: { activeId: 'a', scenarios: [{ id: 'a', name: 'Baseline', profile }] } }),
};

function open(kind, file) {
  if (kind.endsWith('save')) {
    globalThis.localStorage = fakeStorage({ [FP.store.KEY]: JSON.stringify(file) });
    const r = FP.store.load();
    assert.equal(r.source, 'saved');
    assert.equal(r.error, undefined);
    return r.workspace;
  }
  const r = FP.store.importJson(JSON.stringify(file));
  assert.equal(r.ok, true, r.error);
  return r.workspace;
}

function matchesGolden(name, profile) {
  const changes = G.diff(G.readGolden(name), G.snapshot(profile));
  assert.ok(!changes.length, `${name}: ${changes.length} value(s) changed:\n${G.describe(changes)}`);
}

test('the steps run in order, one version at a time, up to the current version', () => {
  FP.migrate.STEPS.forEach((s, i) => {
    assert.equal(s.from, i + 1);
    assert.equal(s.to, s.from + 1);
    assert.equal(typeof s.up, 'function');
  });
  assert.equal(FP.migrate.STEPS.at(-1).to, FP.migrate.CURRENT);
  assert.equal(FP.migrate.CURRENT, 7);
  assert.equal(FP.store.STORE_VERSION, FP.migrate.CURRENT);
  assert.equal(FP.profile.blank().schemaVersion, FP.migrate.CURRENT);
});

G.names().forEach((name) => {
  Object.entries(files).forEach(([kind, make]) => {
    test(`a ${kind} of ${name} loads and matches the golden results`, () => {
      const ws = open(kind, make(saved(name)));
      assert.equal(ws.scenarios.length, 1);
      assert.equal(ws.scenarios[0].name, 'Baseline');
      matchesGolden(name, ws.scenarios[0].profile);
    });
  });
});

// Shapes only older versions wrote: one spending total with no estimate, a
// single bonus, and the leftover split as four assumptions.
function oldShape(name) {
  const p = saved(name);
  const total = p.outgoings.estimate;
  delete p.outgoings;
  p.spending = [{ id: 'old', category: 'Everything', monthly: total }];
  if (p.income.bonuses.length === 1) {
    p.income.bonus = p.income.bonuses[0].amount;
    p.income.bonusMonth = p.income.bonuses[0].month;
    delete p.income.bonuses;
  }
  const l = p.leftover;
  Object.assign(p.assumptions, { splitCash: l.cash, splitInvest: l.invest, splitMortgage: l.mortgage, splitPension: l.pension });
  delete p.leftover;
  return p;
}

['quickstart', 'taper'].forEach((name) => {
  ['version 1 save', 'version 1 export'].forEach((kind) => {
    test(`a ${kind} of ${name} in the oldest shapes loads and matches the golden results`, () => {
      const old = oldShape(name);
      if (name === 'taper') assert.equal(old.income.bonus, 12000);
      const p = open(kind, files[kind](old)).scenarios[0].profile;
      assert.equal(p.spending.length, 1);
      assert.equal(p.spending[0].rest, true);
      matchesGolden(name, p);
    });
  });
});

test('a save from this version loads unchanged', () => {
  globalThis.localStorage = fakeStorage();
  const ws = FP.sampleWorkspace();
  assert.ok(FP.store.save(ws));
  assert.equal(JSON.parse(globalThis.localStorage.getItem(FP.store.KEY)).schemaVersion, FP.migrate.CURRENT);
  assert.deepEqual(FP.store.load().workspace, ws);
  assert.equal(JSON.parse(FP.store.exportJson(ws)).schemaVersion, FP.migrate.CURRENT);
});

test('a save from a newer version is refused with the existing message, and a copy kept', () => {
  const raw = JSON.stringify(files['version 2 save'](saved('sample')));
  const newer = raw.replace('"schemaVersion":2', `"schemaVersion":${FP.migrate.CURRENT + 1}`);
  globalThis.localStorage = fakeStorage({ [FP.store.KEY]: newer });
  const r = FP.store.load();
  assert.equal(r.error, 'Your figures were saved by a newer version of the planner. Reload the page to get it; a copy of what was saved is kept in Your data.');
  assert.equal(FP.store.unreadBackup(), newer);
});

test('a backup from a newer version is refused with the existing message', () => {
  const file = { ...files['version 2 export'](saved('sample')), schemaVersion: FP.migrate.CURRENT + 1 };
  assert.deepEqual(FP.store.importJson(JSON.stringify(file)), { ok: false, error: 'That file is from a newer version of the planner.' });
});

test('files with no version are read by what they hold', () => {
  assert.equal(FP.migrate.versionOf({ profile: {} }), 1);
  assert.equal(FP.migrate.versionOf({ workspace: { scenarios: [] } }), 2);
  assert.equal(FP.migrate.versionOf({ schemaVersion: 2, profile: {} }), 1);
  assert.equal(FP.migrate.versionOf({ schemaVersion: 9, profile: {} }), 9);
  assert.equal(FP.migrate.versionOf({ schemaVersion: 1, workspace: {} }), 2);
  assert.equal(FP.migrate.versionOf({ schemaVersion: 0.5, workspace: {} }), 2);
  assert.equal(FP.migrate.versionOf({ schemaVersion: 2.5, workspace: {} }), 2);
  const ws = FP.migrate.upgrade({ profile: saved('stretched') }).workspace;
  matchesGolden('stretched', ws.scenarios[0].profile);
});

test('upgrading never changes the data it was given', () => {
  const file = files['version 1 save'](oldShape('taper'));
  const before = JSON.stringify(file);
  const up = FP.migrate.upgrade(file);
  assert.equal(up.from, 1);
  assert.equal(up.newer, false);
  assert.equal(JSON.stringify(file), before);
});

test('a version 2 profile that already has an estimate keeps its spending as it is', () => {
  const p = saved('stretched');
  p.spending = [{ id: 'x', category: 'Everything', monthly: 500 }];
  p.outgoings = { estimate: 900 };
  const up = FP.migrate.upgrade(files['version 2 save'](p)).workspace.scenarios[0].profile;
  assert.equal(up.outgoings.estimate, 900);
  assert.equal(up.spending[0].category, 'Everything');
  assert.notEqual(up.spending[0].rest, true);
});
