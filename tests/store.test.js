const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

// A minimal in-memory localStorage.
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

test('unreadable saved data is kept as a copy before anything can overwrite it', () => {
  globalThis.localStorage = fakeStorage({ [FP.store.KEY]: '{not json' });
  const r = FP.store.load();
  assert.equal(r.source, 'new');
  assert.ok(r.error);
  assert.equal(FP.store.unreadBackup(), '{not json');
});

test('data saved by a newer version is kept as a copy', () => {
  const raw = JSON.stringify({ schemaVersion: FP.store.STORE_VERSION + 1, workspace: { scenarios: [] } });
  globalThis.localStorage = fakeStorage({ [FP.store.KEY]: raw });
  const r = FP.store.load();
  assert.match(r.error, /newer version/);
  assert.equal(FP.store.unreadBackup(), raw);
});

test('readable saved data loads with no copy kept', () => {
  globalThis.localStorage = fakeStorage();
  const ws = FP.scenarios.fromProfile(FP.profile.blank());
  FP.store.save(ws);
  const r = FP.store.load();
  assert.equal(r.source, 'saved');
  assert.equal(r.error, undefined);
  assert.equal(FP.store.unreadBackup(), null);
});
