// Today's results for each fixture must match the saved golden snapshots.
// If a change is meant to move the numbers: GOLDEN_UPDATE=1 npm run golden:update
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./golden-lib');

test('every fixture has a golden snapshot, and every snapshot a fixture', () => {
  const golden = fs.readdirSync(require('node:path').dirname(G.goldenPath('x'))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(golden, G.names());
});

G.names().forEach((name) => {
  test(`golden: ${name} matches its snapshot`, () => {
    const changes = G.diff(G.readGolden(name), G.snapshot(G.profileFrom(G.readFixture(name))));
    assert.ok(!changes.length, `${changes.length} value(s) changed (path: old → new):\n${G.describe(changes)}`);
  });
});

test('golden: the comparison reports each changed value by path', () => {
  const changes = G.diff({ a: { b: [1, 2] }, c: 'x' }, { a: { b: [1, 3] }, d: 'y' });
  assert.deepEqual(changes, [
    { path: 'a.b[1]', old: 2, new: 3 },
    { path: 'c', old: 'x', new: undefined },
    { path: 'd', old: undefined, new: 'y' },
  ]);
  assert.match(G.describe(changes), /a\.b\[1\]: 2 → 3/);
});

test('golden: money is rounded to the penny before comparing', () => {
  assert.deepEqual(G.clean({ x: 0.1 + 0.2, y: -0.001, z: Infinity, f: () => 1 }), { x: 0.3, y: 0, z: 'Infinity' });
});
