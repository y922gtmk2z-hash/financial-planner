// The projection as initState + stepYear: same results, rates by year, and speed.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));
const same = (a, b, label) => {
  const changes = G.diff(G.clean(a), G.clean(b));
  assert.ok(!changes.length, `${label}: ${changes.length} value(s) changed:\n${G.describe(changes)}`);
};

test('a returnsPath equal to the assumptions gives identical output', () => {
  G.names().forEach((name) => {
    const p = fixture(name);
    const a = p.assumptions;
    const path = Array.from({ length: 100 }, () => ({ cash: a.savingsRate, house: a.housePriceGrowth, shares: a.sharesReturn + a.marketShift, bonds: a.bondsReturn + a.marketShift, cashFund: a.cashReturn }));
    assert.deepEqual(FP.projection.project(p, { returnsPath: path }), FP.projection.project(p), name);
    assert.deepEqual(FP.projection.project(p, { returnsPath: path, maxYears: 100 }), FP.projection.project(p, { maxYears: 100 }), `${name} to end age`);
  });
});

test('a returnsPath changes growth only in the years and rates it gives', () => {
  const p = fixture('sample');
  const base = FP.projection.project(p);
  const strong = FP.projection.project(p, { returnsPath: [{ shares: 20 }] });
  // The first year's ISA and pension (both part shares) grow faster; cash and home are unchanged that year.
  assert.ok(strong.rows[1].isa > base.rows[1].isa);
  assert.ok(strong.rows[1].pension > base.rows[1].pension);
  ['cash', 'home'].forEach((k) => assert.equal(strong.rows[1][k], base.rows[1][k], k));
  // Later years use the assumptions again, from a higher starting point.
  const growth = (r, y) => r.rows[y].isa;
  assert.ok(growth(strong, 2) > growth(base, 2));
  // A crash in shares and bonds in year 3 only.
  const crash = FP.projection.project(p, { returnsPath: [{}, {}, { shares: -40, bonds: -20 }] });
  assert.equal(crash.rows[2].pension, base.rows[2].pension);
  assert.ok(crash.rows[3].pension < base.rows[3].pension * 0.8);
  // Rates that aren't numbers are ignored.
  assert.deepEqual(FP.projection.project(p, { returnsPath: [{ shares: 'lots', cash: NaN }, null] }), base);
});

test('fees still come off investment and pension returns from a returnsPath', () => {
  const p = fixture('near-retirement');
  p.assumptions.pensionFees = 1;
  const r = FP.projection.project(p, { returnsPath: [{ shares: 10, bonds: 10 }] });
  const zero = FP.projection.project({ ...p, assumptions: { ...p.assumptions, pensionFees: 0 } }, { returnsPath: [{ shares: 10, bonds: 10 }] });
  assert.ok(r.rows[1].pension < zero.rows[1].pension);
});

test('each year gets its returns and the events passed in', () => {
  const p = fixture('quickstart');
  const state = FP.projection.initState(p, {});
  assert.equal(state.ok, true);
  assert.equal(state.age0, 38);
  assert.equal(state.years, 40);
  const events = [{ age: 50, type: 'example' }];
  const row = FP.projection.stepYear(state, 1, { returns: FP.projection.returnsFor(p.assumptions, null, 1), events });
  assert.equal(row.age, 39);
  assert.deepEqual(FP.projection.project(p, { events }), FP.projection.project(p), 'events change nothing yet');
  assert.deepEqual(FP.projection.returnsFor(p.assumptions, [{ house: 1 }], 1),
    { cash: p.assumptions.savingsRate, house: 1, shares: p.assumptions.sharesReturn, bonds: p.assumptions.bondsReturn, cashFund: p.assumptions.cashReturn });
});

test('stepping the years by hand gives the same rows as project', () => {
  G.names().forEach((name) => {
    const p = fixture(name);
    const state = FP.projection.initState(p, {});
    const rows = [];
    for (let y = 1; y <= state.years; y += 1) rows.push(FP.projection.stepYear(state, y, { returns: FP.projection.returnsFor(p.assumptions, null, y), events: [] }));
    same(rows, FP.projection.project(p).rows.slice(1), name);
  });
});

test('maxYears runs up to the projection end age; 40 years are shown by default', () => {
  const p = fixture('quickstart'); // age 38, end age 95
  assert.equal(FP.projection.project(p).rows.length, 41);
  assert.equal(FP.projection.project(p, { maxYears: 57 }).rows.length, 58);
  assert.equal(FP.projection.project(p, { maxYears: 100 }).rows.length, 58);
  assert.equal(FP.projection.project(p, { maxYears: 100 }).rows.at(-1).age, 95);
  assert.equal(FP.projection.project(p, { maxYears: 10 }).rows.length, 11);
  assert.equal(FP.projection.initState({ ...p, about: { age: null } }, {}).reason, 'age');
});

test('1,000 projections of the sample household run in under 3 seconds', () => {
  const p = fixture('sample');
  FP.projection.project(p);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1000; i += 1) FP.projection.project(p);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 3000, `${Math.round(ms)} ms`);
  console.log(`# 1,000 projections of the sample: ${Math.round(ms)} ms`);
});
