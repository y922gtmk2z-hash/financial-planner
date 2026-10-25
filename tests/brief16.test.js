// Brief 16: the earliest you could retire, life what-ifs (new kinds of life
// event), CSV exports, repeating check-in reminders and a box per pension pot.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');
require('../js/ui/ics.js');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));
const close = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const START = { startYear: 2026, startMonth: 10 };
// Rows: row y covers the projection year starting in calendar year 2026 + y - 1.
const rowFor = (r, year) => r.rows[year - 2026 + 1];
const withEvent = (p, e) => FP.profile.normalise({ ...p, events: [{ ...FP.profile.newEvent(e.type), ...e }] });

// ---------- Earliest you could retire ----------

test('the earliest you could retire at your target spending: that age works, a year earlier doesn’t', () => {
  const p = fixture('sample');
  const r = FP.goalSeek.earliestRetirement(p);
  assert.equal(r.now, 67);
  assert.ok(r.age > p.about.age && r.age <= 75);
  const at = (age) => FP.goalSeek.meets(FP.patch.applyPatch(p, [{ path: 'assumptions.retirementAge', op: 'set', value: age }]), { id: 'retireAt', value: age });
  assert.equal(at(r.age), true);
  assert.equal(at(r.age - 1), false);
  // Not even at 75: says so.
  const q = fixture('stretched');
  assert.equal(FP.goalSeek.earliestRetirement(q).age, null);
  assert.equal(FP.goalSeek.earliestRetirement({ ...p, about: { ...p.about, age: null } }), null);
});

// ---------- Life events behind the life what-ifs ----------

test('fewer days a week: pay is that share from the start year, until the end year or for good', () => {
  const p = fixture('sample');
  const base = FP.projection.project(p, START);
  const four = FP.projection.project(withEvent(p, { type: 'partTime', payPct: 80, startYear: 2027, endYear: null }), START);
  close(rowFor(four, 2026).salary, rowFor(base, 2026).salary);
  close(rowFor(four, 2027).salary, rowFor(base, 2027).salary * 0.8);
  close(rowFor(four, 2035).salary, rowFor(base, 2035).salary * 0.8);
  const back = FP.projection.project(withEvent(p, { type: 'partTime', payPct: 80, startYear: 2027, endYear: 2028 }), START);
  close(rowFor(back, 2029).salary, rowFor(base, 2029).salary);
  // Spending carries on as before.
  close(rowFor(four, 2027).spending, rowFor(base, 2027).spending);
});

test('six months out of work: half a year’s pay that year, anything coming in for those months', () => {
  const p = fixture('sample');
  const base = FP.projection.project(p, START);
  const out = FP.projection.project(withEvent(p, { type: 'outOfWork', months: 6, amount: 400, startYear: 2027 }), START);
  close(rowFor(out, 2027).salary, rowFor(base, 2027).salary / 2);
  close(rowFor(out, 2028).salary, rowFor(base, 2028).salary);
  // £400 a month for 6 months, in today's money raised by a year of prices.
  close(rowFor(out, 2027).eventsIn, 400 * 6 * FP.growth.inflationFactor(p.assumptions.inflation, 1), 0.01);
  // Eighteen months: a whole year, then half the next.
  const long = FP.projection.project(withEvent(p, { type: 'outOfWork', months: 18, startYear: 2027 }), START);
  assert.equal(rowFor(long, 2027).salary, 0);
  close(rowFor(long, 2028).salary, rowFor(base, 2028).salary / 2);
});

test('moving to a new home: the new price and mortgage from that year; what’s left of the sale goes to cash', () => {
  const p = fixture('sample');
  const move = withEvent(p, { type: 'moveHouse', price: 400000, mortgage: 300000, term: 25, amount: 15000, startYear: 2027 });
  const r = FP.projection.project(move, START);
  const base = FP.projection.project(p, START);
  const f = FP.growth.inflationFactor(p.assumptions.inflation, 1);
  const row = rowFor(r, 2027);
  // The new home grows from its price for the year, like any home.
  close(row.home, 400000 * f * (1 + p.assumptions.housePriceGrowth / 100), 1);
  assert.ok(row.mortgage < 300000 * f && row.mortgage > 290000 * f, `${row.mortgage}`);
  // Equity out minus equity in: sold at its value at the start of the year.
  // Here the sale leaves money over (into cash); the moving costs are a cost.
  const before = rowFor(base, 2026);
  const left = (before.home - before.mortgage) - (400000 * f - 300000 * f);
  assert.ok(left > 0);
  close(row.eventsLump, left, 1);
  close(row.eventsOut, 15000 * f, 1);
  // A dearer move needs more deposit than the sale leaves: the gap is a cost too.
  const dear = FP.projection.project(withEvent(p, { type: 'moveHouse', price: 900000, mortgage: 500000, term: 25, amount: 0, startYear: 2027 }), START);
  const gap = (before.home - before.mortgage) - (900000 * f - 500000 * f);
  assert.ok(gap < 0);
  close(rowFor(dear, 2027).eventsOut, -gap, 1);
  // Bought outright with no mortgage: none left.
  const outright = FP.projection.project(withEvent(p, { type: 'moveHouse', price: 100000, mortgage: 0, startYear: 2027 }), START);
  assert.equal(rowFor(outright, 2027).mortgage, 0);
  assert.ok(rowFor(outright, 2027).eventsLump > 0);
});

test('a yearly amount for some years (university help)', () => {
  const p = fixture('sample');
  const r = FP.projection.project(withEvent(p, { type: 'university', per: 'year', amount: 6000, startYear: 2027, endYear: 2029 }), START);
  const f = (y) => FP.growth.inflationFactor(p.assumptions.inflation, y - 2026);
  [2027, 2028, 2029].forEach((y) => close(rowFor(r, y).eventsOut, 6000 * f(y), 1));
  assert.equal(rowFor(r, 2030).eventsOut, undefined);
});

test('the life what-ifs: each adds one editable life event to a copy of the plan', () => {
  const ws = FP.sampleWorkspace();
  const ids = ['fourDays', 'outOfWork', 'moveHouse', 'haveChild', 'university'];
  const next = new Date().getFullYear() + 1;
  ids.forEach((id) => {
    const preset = FP.scenarios.PRESETS.find((x) => x.id === id);
    assert.ok(preset && preset.life, id);
    const w = FP.sampleWorkspace();
    const before = w.scenarios[0].profile.events.length;
    const sc = FP.scenarios.fromPreset(w, id);
    assert.ok(sc, id);
    assert.equal(sc.profile.events.length, before + 1, id);
    const e = sc.profile.events.at(-1);
    assert.equal(w.scenarios[0].profile.events.length, before, 'the Baseline is unchanged');
    if (id === 'fourDays') assert.deepEqual([e.type, e.payPct, e.startYear, e.endYear], ['partTime', 80, next, null]);
    if (id === 'outOfWork') assert.deepEqual([e.type, e.months, e.startYear], ['outOfWork', 6, next]);
    if (id === 'moveHouse') { assert.equal(e.type, 'moveHouse'); assert.ok(e.price > 0 && e.mortgage > 0 && e.amount > 0); }
    if (id === 'haveChild') assert.deepEqual([e.type, e.per, e.startYear, e.endYear], ['childcare', 'month', next + 1, next + 4]);
    if (id === 'university') assert.deepEqual([e.type, e.per, e.endYear - e.startYear], ['university', 'year', 2]);
  });
  assert.ok(ws);
});

// ---------- CSV ----------

test('CSV: fields are quoted when needed, and the year-by-year table comes in both kinds of money', () => {
  assert.equal(FP.csv.toCsv([['a', 'b,c', 'say "hi"', null, 2]]), 'a,"b,c","say ""hi""",,2\r\n');
  const p = fixture('sample');
  const r = FP.projection.project(p, START);
  const real = FP.csv.yearByYear(r, 'real').trim().split('\r\n');
  const future = FP.csv.yearByYear(r, 'nominal').trim().split('\r\n');
  assert.equal(real.length, r.rows.length + 1);
  assert.match(real[0], /^Age,Year,Income after tax £ \(today’s money\),/);
  assert.match(future[0], /,Net worth £ \(future money\)$/);
  // Today has no flows; balances to the pound.
  const today = real[1].split(',');
  assert.deepEqual(today.slice(0, 7), [String(p.about.age), String(r.rows[0].year), '', '', '', '', '']);
  const last = r.rows.at(-1);
  assert.equal(Number(future.at(-1).split(',').at(-1)), Math.round(last.netWorth));
  assert.equal(Number(real.at(-1).split(',').at(-1)), Math.round(last.netWorth / last.inflationFactor));
  const c = FP.csv.commitments([{ what: 'Pay £50, more', amount: 50, per: 'month', due: '2027-04-05', status: 'open', made: '2026-10-24' }]);
  assert.equal(c, 'What,Amount (£),Per,Due,Status,Made\r\n"Pay £50, more",50,month,2027-04-05,To do,2026-10-24\r\n');
});

// ---------- Coming back ----------

test('a repeating check-in reminder: every three months, or every month', () => {
  const q = FP.ics.reminder({ date: '2027-01-24', title: 'Check in', everyMonths: 3, uid: 'x', now: new Date('2026-10-24T12:00:00Z') });
  assert.match(q, /\r\nRRULE:FREQ=MONTHLY;INTERVAL=3\r\n/);
  assert.match(q, /DTSTART;VALUE=DATE:20270124/);
  assert.match(FP.ics.reminder({ date: '2027-01-24', title: 'x', everyMonths: 1 }), /\r\nRRULE:FREQ=MONTHLY\r\n/);
  assert.doesNotMatch(FP.ics.reminder({ date: '2027-01-24', title: 'x' }), /RRULE/);
});

test('a check-in has a balance for each pension pot, and adds them up', () => {
  const p = fixture('couple');
  p.pensions.push({ ...FP.profile.newPension('dc'), name: 'Old job', value: 12000 });
  p.pensions.push({ ...FP.profile.newPension('db'), name: 'Final salary', income: 5000 });
  const ws = FP.scenarios.fromProfile(p);
  const b = FP.checkins.balancesOf(ws.scenarios[0].profile);
  assert.deepEqual(b.pots.map((x) => x.id), ['partner', p.pensions.find((x) => x.name === 'Old job').id], 'pots only, not incomes');
  b.pension = 50000;
  b.pots[0].value = 40000;
  b.pots[1].value = 13000;
  assert.equal(FP.checkins.pensionTotal(b), 103000);
  const snap = FP.checkins.record(ws, '2026-10-24', b);
  const q = ws.scenarios[0].profile;
  assert.equal(q.partner.pension, 40000);
  assert.equal(q.pensions.find((x) => x.name === 'Old job').value, 13000);
  assert.equal(snap.savingsAndPensions, Math.round(b.cash + b.isa + b.gia + 103000));
  // Kept when saved and loaded, and older snapshots load without pots.
  const back = FP.checkins.normalise(JSON.parse(JSON.stringify(ws.checkins)));
  assert.equal(back.snapshots[0].balances.pots.length, 2);
  assert.deepEqual(FP.checkins.normalise({ snapshots: [{ date: '2026-01-01', balances: { pension: 1 } }] }).snapshots[0].balances.pots, []);
});

test('migration 12: older saves load unchanged', () => {
  assert.equal(FP.migrate.CURRENT, 12);
  const v11 = { schemaVersion: 11, workspace: { activeId: 'a', scenarios: [{ id: 'a', name: 'Baseline', profile: G.readFixture('sample') }], checkins: { snapshots: [], projection: null } } };
  const up = FP.migrate.upgrade(v11);
  assert.equal(up.from, 11);
  const changes = G.diff(G.readGolden('sample'), G.snapshot(up.workspace.scenarios[0].profile));
  assert.equal(changes.length, 0, G.describe(changes));
});
