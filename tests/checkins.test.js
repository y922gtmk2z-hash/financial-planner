// Check-ins: snapshots of your balances, what the plan expected, keeping them, and saving them.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const C = FP.checkins;
const sampleWs = () => FP.scenarios.normalise(JSON.parse(JSON.stringify(FP.sampleWorkspace())));

test('a check-in prefills today’s balances and puts edits into every scenario', () => {
  const ws = sampleWs();
  const b = C.balancesOf(ws.scenarios[0].profile);
  assert.deepEqual(Object.keys(b), ['cash', 'isa', 'gia', 'pension', 'pots', 'mortgage', 'debts']);
  assert.deepEqual(b.pots, [], 'just one pot');
  assert.equal(b.pension, 61000);
  assert.deepEqual(b.debts.map((d) => d.id), ['sample-car', 'sample-card']);
  b.pension = 64000;
  b.debts[1].balance = 900;
  const snap = C.record(ws, '2026-10-24', b);
  ws.scenarios.forEach((sc) => {
    assert.equal(sc.profile.assets.pension, 64000, sc.name);
    assert.equal(sc.profile.debts.find((d) => d.id === 'sample-card').balance, 900, sc.name);
  });
  // The scenarios keep their own changes.
  assert.equal(ws.scenarios[1].profile.assumptions.retirementAge, 60);
  assert.equal(snap.savingsAndPensions, 14000 + 22000 + 3500 + 64000);
  assert.equal(snap.netWorth, Math.round(FP.summary.compute(ws.scenarios[0].profile).netWorth));
  assert.equal(snap.planned, null, 'nothing planned before the first check-in');
});

test('the next check-in records what the plan expected for its date', () => {
  const ws = sampleWs();
  C.record(ws, '2026-10-24', C.balancesOf(ws.scenarios[0].profile));
  const path = ws.checkins.projection;
  assert.equal(path.from, '2026-10-24');
  assert.equal(path.points[0].date, '2026-10-24');
  assert.equal(path.points[1].date, '2027-10-24');
  // Half a year on: halfway between the first two points.
  const mid = C.plannedAt(path, '2027-04-24');
  const a = path.points[0].savingsAndPensions;
  const z = path.points[1].savingsAndPensions;
  assert.ok(Math.abs(mid.savingsAndPensions - (a + (z - a) * (182 / 365))) < 2);
  const b = C.balancesOf(ws.scenarios[0].profile);
  b.cash += 1000;
  const snap = C.record(ws, '2027-04-24', b);
  assert.deepEqual(snap.planned, mid);
  assert.equal(ws.checkins.snapshots.length, 2);
  assert.equal(C.plannedAt(path, '2026-01-01'), null, 'nothing before the path starts');
});

test('checking in twice in a day replaces that day’s snapshot', () => {
  const ws = sampleWs();
  C.record(ws, '2026-10-24', C.balancesOf(ws.scenarios[0].profile));
  C.record(ws, '2027-01-24', C.balancesOf(ws.scenarios[0].profile));
  const planned = ws.checkins.snapshots[1].planned;
  const b = C.balancesOf(ws.scenarios[0].profile);
  b.cash = 500;
  C.record(ws, '2027-01-24', b);
  assert.equal(ws.checkins.snapshots.length, 2);
  assert.equal(ws.checkins.snapshots[1].balances.cash, 500);
  assert.deepEqual(ws.checkins.snapshots[1].planned, planned);
});

test('since last time: net worth, debts paid down and actions applied', () => {
  const ws = sampleWs();
  C.record(ws, '2026-10-24', C.balancesOf(ws.scenarios[0].profile));
  assert.equal(C.sinceLast(ws), null);
  ws.scenarios[0].profile.ideas = { relief: 'applied', isa: 'done' };
  const b = C.balancesOf(ws.scenarios[0].profile);
  b.mortgage -= 2000;
  b.debts[0].balance -= 700;
  b.cash += 300;
  C.record(ws, '2026-12-01', b);
  const s = C.sinceLast(ws);
  assert.equal(s.from, '2026-10-24');
  assert.equal(s.to, '2026-12-01');
  assert.equal(s.debtsPaid, 2700);
  assert.equal(s.netWorth, 2000 + 700 + 300);
  assert.deepEqual(s.applied, ['relief']);
  assert.equal(C.daysSince(ws, '2026-12-31'), 30);
});

test('every snapshot is kept for 24 months, then one per quarter', () => {
  const snaps = [];
  for (let m = 0; m < 48; m += 1) {
    const d = new Date(Date.UTC(2023, m, 15)).toISOString().slice(0, 10);
    snaps.push({ date: d });
    if (m % 5 === 0) snaps.push({ date: new Date(Date.UTC(2023, m, 20)).toISOString().slice(0, 10) });
  }
  const kept = C.thin(snaps, '2026-12-31');
  const old = kept.filter((s) => s.date < '2024-12-31');
  const recent = kept.filter((s) => s.date >= '2024-12-31');
  assert.equal(recent.length, snaps.filter((s) => s.date >= '2024-12-31').length, 'all recent kept');
  const quarters = old.map((s) => `${s.date.slice(0, 4)}Q${Math.floor((+s.date.slice(5, 7) - 1) / 3)}`);
  assert.equal(new Set(quarters).size, quarters.length, 'one per quarter');
  assert.equal(quarters.length, 8);
  // The latest in each quarter is the one kept.
  assert.ok(old.some((s) => s.date === '2023-03-15'));
  assert.ok(!old.some((s) => s.date === '2023-01-15'));
});

test('snapshots survive export and import, and are checked on the way in', () => {
  const ws = sampleWs();
  C.record(ws, '2026-10-24', C.balancesOf(ws.scenarios[0].profile));
  C.record(ws, '2026-12-01', C.balancesOf(ws.scenarios[0].profile));
  const back = FP.store.importJson(FP.store.exportJson(ws));
  assert.equal(back.ok, true);
  assert.deepEqual(back.workspace.checkins, ws.checkins);
  const bad = FP.checkins.normalise({ snapshots: [{ date: 'soon' }, { date: '2026-01-01', netWorth: 'lots', balances: { cash: 5, debts: [null, { id: 'x', balance: 2 }] }, applied: ['ok', '<b>'] }], projection: { from: 'x' } });
  assert.equal(bad.snapshots.length, 1);
  assert.equal(bad.snapshots[0].netWorth, 0);
  assert.equal(bad.snapshots[0].balances.cash, 5);
  assert.deepEqual(bad.snapshots[0].balances.debts, [{ id: 'x', name: '', balance: 2 }]);
  assert.deepEqual(bad.snapshots[0].applied, ['ok']);
  assert.equal(bad.projection, null);
});

test('version 4 saves load with an empty check-in history', () => {
  const v4 = { schemaVersion: 4, workspace: { scenarios: [{ name: 'Baseline', profile: G.readFixture('sample') }] } };
  const up = FP.migrate.upgrade(v4);
  assert.equal(up.from, 4);
  assert.deepEqual(up.workspace.checkins, { snapshots: [], projection: null });
  assert.equal(FP.migrate.STEPS.at(-1).to, FP.migrate.CURRENT);
});
