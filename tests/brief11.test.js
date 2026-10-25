// Market paths, life events and "what would it take".
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const fixture = (name) => G.profileFrom(G.readFixture(name));
const copy = (x) => JSON.parse(JSON.stringify(x));
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// ---------- Market paths ----------

test('the seeded generator repeats exactly, and different seeds differ', () => {
  const a = FP.paths.rng(42);
  const b = FP.paths.rng(42);
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(Array.from({ length: 5 }, b), xs);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(Array.from({ length: 5 }, FP.paths.rng(43)), xs);
  // Normal draws average about 0 with spread about 1.
  const r = FP.paths.rng(7);
  const n = Array.from({ length: 20000 }, () => FP.paths.normal(r));
  const mean = n.reduce((t, x) => t + x, 0) / n.length;
  const sd = Math.sqrt(n.reduce((t, x) => t + (x - mean) ** 2, 0) / n.length);
  close(mean, 0, 0.03);
  close(sd, 1, 0.03);
});

test('a seeded run is repeatable: the same plan always gives the same paths', () => {
  const p = fixture('sample');
  const one = FP.paths.run(p, { paths: 60 });
  const two = FP.paths.run(copy(p), { paths: 60 });
  assert.deepEqual(G.clean(one), G.clean(two));
  assert.equal(FP.paths.seedOf(p), FP.paths.seedOf(copy(p)));
  // Run in chunks, it's the same as all at once.
  const chunked = FP.paths.runner(p, { paths: 60 });
  while (!chunked.next(7));
  assert.deepEqual(G.clean(chunked.result()), G.clean(one));
  // Cut down part way, the paths already run are kept and it stops there.
  const cut = FP.paths.runner(p, { paths: 60 });
  cut.next(10);
  cut.limit(30);
  while (!cut.next(4));
  assert.equal(cut.result().paths, 30);
  assert.deepEqual(G.clean(cut.result()), G.clean(FP.paths.run(p, { paths: 30 })));
  // A different plan gives different paths.
  const q = copy(p);
  q.assets.isa += 1;
  assert.notEqual(FP.paths.seedOf(q), FP.paths.seedOf(p));
});

test('with zero volatility every path equals the fixed-rate projection', () => {
  const p = fixture('sample');
  Object.assign(p.assumptions, { sharesVolatility: 0, bondsVolatility: 0, cashVolatility: 0 });
  const r = FP.paths.run(p, { paths: 25 });
  r.rows.forEach((x, i) => {
    assert.equal(x.low, r.fixed.rows[i].netWorth);
    assert.equal(x.mid, r.fixed.rows[i].netWorth);
    assert.equal(x.high, r.fixed.rows[i].netWorth);
  });
  // Each path itself, not just its percentiles.
  const years = r.fixed.rows.length - 1;
  const opts = { maxYears: 100, retirementSpending: FP.paths.goalFactor(p, FP.projection.project(p, { maxYears: 100 })) };
  [1, 2, 3].forEach((seed) => {
    const path = FP.paths.drawPath(p.assumptions, years, seed);
    assert.deepEqual(FP.projection.project(p, { ...opts, returnsPath: path }), r.fixed);
  });
  assert.equal(r.lasting, r.paths);
});

test('paths spread around the fixed line, and say how many last to the end age', () => {
  const p = fixture('sample');
  const r = FP.paths.run(p, { paths: 200 });
  const y = r.fixed.events.retirement.y;
  const row = r.rows[y];
  assert.ok(row.low < row.mid && row.mid < row.high);
  const fixed = r.fixed.rows[y].netWorth;
  assert.ok(row.low < fixed && fixed < row.high);
  assert.equal(r.paths, 200);
  assert.ok(r.lasting >= 0 && r.lasting <= 200);
  assert.equal(r.endAge, 95);
  // The stretched household runs short in most paths.
  const s = FP.paths.run(fixture('stretched'), { paths: 50 });
  assert.ok(s.lasting < 25);
  assert.ok(s.midLastsTo < s.endAge);
});

test('"8 of 10" in words, with the ends kept honest', () => {
  assert.equal(FP.paths.outOfTen(800, 1000), '8 of 10');
  assert.equal(FP.paths.outOfTen(1000, 1000), '10 of 10');
  assert.equal(FP.paths.outOfTen(996, 1000), 'more than 9 of 10');
  assert.equal(FP.paths.outOfTen(3, 1000), 'fewer than 1 in 10');
  assert.equal(FP.paths.outOfTen(0, 500), '0 of 10');
  assert.equal(FP.paths.quantile([1, 2, 3, 4, 5], 0.5), 3);
  close(FP.paths.quantile([0, 10], 0.1), 1);
});

// ---------- Life events ----------

function plan() {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.income.grossSalary = 50000;
  p.spending = [{ id: 's', category: 'All', monthly: 1500 }];
  p.assets.cashSavings = 100000;
  Object.assign(p.assumptions, { inflation: 0, spendingGrowth: 0, salaryGrowth: 0, savingsRate: 0 });
  return p;
}
const START = new Date().getFullYear();

test('life events: a lump sum costs once, a monthly amount each year it runs, in today’s money', () => {
  const p = plan();
  const base = FP.projection.project(p).rows;
  p.events = [
    { ...FP.profile.newEvent('car'), amount: 12000, startYear: START + 1 },
    { ...FP.profile.newEvent('childcare'), amount: 500, startYear: START + 2, endYear: START + 3 },
  ];
  const rows = FP.projection.project(p).rows;
  close(base[1].surplus - rows[1].surplus, 0);
  close(base[2].surplus - rows[2].surplus, 12000);
  close(rows[2].eventsOut, 12000);
  close(base[3].surplus - rows[3].surplus, 6000);
  close(base[4].surplus - rows[4].surplus, 6000);
  close(base[5].surplus - rows[5].surplus, 0);
  assert.equal(rows[5].eventsOut, undefined);
  // With inflation, a cost in today's money rises with prices.
  const q = copy(p);
  q.assumptions.inflation = 3;
  const r = FP.projection.project(q).rows;
  close(r[2].eventsOut, 12000 * 1.03);
  // Rows in today's money use the year-end price level, as spending does.
  close(FP.projection.toReal(r[2]).eventsOut, 12000 / 1.03);
});

test('an inheritance goes into cash savings; events before the projection are ignored', () => {
  const p = plan();
  const base = FP.projection.project(p).rows;
  p.events = [{ ...FP.profile.newEvent('inheritance'), amount: 50000, startYear: START + 2 }, { ...FP.profile.newEvent('wedding'), amount: 9000, startYear: START - 3 }];
  const rows = FP.projection.project(p).rows;
  close(rows[3].cash - base[3].cash, 50000);
  close(rows[3].eventsLump, 50000);
  close(rows[3].surplus, base[3].surplus);
  close(rows[2].cash, base[2].cash);
});

test('a career break stops its owner’s pay and workplace pension, with money still coming in', () => {
  const p = plan();
  const base = FP.projection.project(p).rows;
  p.events = [{ ...FP.profile.newEvent('careerBreak'), amount: 700, startYear: START + 1, endYear: START + 1 }];
  const rows = FP.projection.project(p).rows;
  assert.equal(rows[2].salary, 0);
  assert.equal(rows[2].pensionFromPay, 0);
  assert.equal(rows[2].working, true);
  close(rows[2].eventsIn, 8400);
  assert.ok(rows[2].netIncome < base[2].netIncome);
  close(rows[3].salary, base[3].salary);
  // A partner's break leaves your pay alone.
  FP.profile.addPartner(p);
  p.partner.age = 40;
  p.partner.income.grossSalary = 30000;
  p.events[0].owner = 'partner';
  const both = FP.projection.project(p).rows;
  close(both[2].people[0].salary, 50000);
  assert.equal(both[2].people[1].salary, 0);
});

test('life events are checked when loaded, and saved as profile.events', () => {
  const p = FP.profile.normalise({ events: [
    { type: 'car', per: 'lump', amount: 9000, startYear: 2030, endYear: 2035, owner: 'partner' },
    { type: 'nonsense', per: 'month', amount: '200', startYear: 2031, endYear: 2029 },
    { type: 'childcare', per: 'month', amount: -5, startYear: 2031, endYear: 2034 },
    'junk',
  ] });
  assert.equal(p.events.length, 3);
  assert.equal(p.events[0].endYear, null); // a lump sum is once
  assert.equal(p.events[0].owner, 'you'); // no partner
  assert.equal(p.events[1].type, 'other');
  assert.equal(p.events[1].endYear, null); // can't end before it starts
  assert.equal(p.events[2].amount, 0);
  assert.deepEqual(FP.profile.blank().events, []);
  const e = FP.profile.newEvent('schoolFees', new Date(2026, 5, 1));
  assert.deepEqual([e.per, e.startYear, e.endYear], ['month', 2027, 2033]);
  assert.equal(FP.profile.EVENT_TYPES.length, 12);
  ['houseMove', 'childcare', 'schoolFees', 'university', 'careerBreak', 'car', 'wedding', 'inheritance'].forEach((t) => assert.ok(FP.profile.EVENT_TYPES.some((x) => x.value === t), t));
});

test('version 7 saves load with no life events and the same results', () => {
  G.names().forEach((name) => {
    const raw = copy(G.readFixture(name));
    const up = FP.migrate.upgrade({ schemaVersion: 7, workspace: { activeId: 'a', scenarios: [{ id: 'a', name: 'Baseline', profile: raw }], checkins: { snapshots: [], projection: null } } });
    assert.equal(up.from, 7);
    const p = up.workspace.scenarios[0].profile;
    assert.deepEqual(p.events, []);
    FP.summary.syncOutgoings(p);
    const changes = G.diff(G.readGolden(name), G.snapshot(p));
    assert.ok(!changes.length, `${name}: ${G.describe(changes)}`);
  });
});

test('taking a partner off keeps their events to bring back', () => {
  const p = plan();
  FP.profile.addPartner(p);
  p.events = [{ ...FP.profile.newEvent('careerBreak'), owner: 'partner' }];
  const kept = FP.profile.removePartner(p);
  assert.equal(p.events[0].owner, undefined);
  FP.profile.addPartner(p, kept);
  assert.equal(p.events[0].owner, 'partner');
});

// ---------- What would it take ----------

const within = (goal, q) => {
  if (goal.id === 'spend') return FP.projection.retirementSpend(q).monthly >= goal.value - 10;
  if (goal.id === 'retireAt') return q.assumptions.retirementAge === goal.value && FP.projection.retirementNeed(q).lastsUntil >= q.assumptions.endAge - 1;
  return FP.goalSeek.debtFreeAge(q) <= goal.value + 1;
};
const lastsOrNull = (q) => { const n = FP.projection.retirementNeed(q); return n.lastsUntil == null ? q.assumptions.endAge : n.lastsUntil; };

test('goal-seek answers meet their goal within £10 a month or one year', () => {
  const p = fixture('sample');
  const rs = FP.projection.retirementSpend(p).monthly;
  const cases = [
    // The sample has only £44 left over a month, so the pension can only go a little higher.
    [{ id: 'spend', value: Math.round(rs + 10) }, 'pension'],
    [{ id: 'spend', value: Math.round(rs + 600) }, 'retireAge'],
    [{ id: 'spend', value: Math.round(rs + 200) }, 'spending'],
    [{ id: 'debtFree', value: 50 }, 'overpay'],
  ];
  const q = copy(p);
  q.goals.retirementIncome = 3000;
  cases.forEach(([goal, lever]) => {
    const r = FP.goalSeek.solve(p, goal, lever);
    assert.ok(r.ok && !r.already && r.reachable, `${goal.id}/${lever}: ${r.reason}`);
    assert.ok(within(goal, FP.patch.applyPatch(p, r.patch)), `${goal.id}/${lever} = ${r.value}`);
  });
  // With room to spare (the quick-start household), a bigger pension goal.
  const roomy = fixture('quickstart');
  const big = { id: 'spend', value: Math.round(FP.projection.retirementSpend(roomy).monthly + 600) };
  const rb = FP.goalSeek.solve(roomy, big, 'pension');
  assert.ok(rb.ok && rb.reachable, rb.reason);
  assert.ok(within(big, FP.patch.applyPatch(roomy, rb.patch)), `pension = ${rb.value}`);
  // Retiring at 58 on £2,500 a month: by spending less (the sample) or paying
  // more into the pension (the quick-start household, which has room to).
  q.goals.retirementIncome = 2500;
  const qs = fixture('quickstart');
  qs.goals.retirementIncome = 2500;
  [['spending', q], ['pension', qs]].forEach(([lever, plan]) => {
    const goal = { id: 'retireAt', value: 58 };
    const r = FP.goalSeek.solve(plan, goal, lever);
    const q = plan;
    assert.ok(r.ok && !r.already && r.reachable, `${lever}: ${r.reason}`);
    const after = FP.patch.applyPatch(q, r.patch);
    assert.equal(after.assumptions.retirementAge, 58);
    assert.ok(lastsOrNull(after) >= q.assumptions.endAge - 1);
  });
});

test('goal-seek finds the least change: a step less would miss the goal', () => {
  const p = fixture('sample');
  const goal = { id: 'spend', value: Math.round(FP.projection.retirementSpend(p).monthly + 600) };
  const roomy = fixture('quickstart');
  const big = { id: 'spend', value: Math.round(FP.projection.retirementSpend(roomy).monthly + 600) };
  const pen = FP.goalSeek.solve(roomy, big, 'pension');
  const less = FP.patch.applyPatch(roomy, [{ path: 'assumptions.employeePensionPct', op: 'set', value: pen.value - 0.5 }]);
  assert.ok(FP.projection.retirementSpend(less).monthly < big.value);
  const age = FP.goalSeek.solve(p, goal, 'retireAge');
  const sooner = FP.patch.applyPatch(p, [{ path: 'assumptions.retirementAge', op: 'set', value: age.value - 1 }]);
  assert.ok(FP.projection.retirementSpend(sooner).monthly < goal.value);
  // Debt-free: extra goes on each debt still owing, including the student loan.
  const d = FP.goalSeek.solve(p, { id: 'debtFree', value: 50 }, 'overpay');
  assert.deepEqual(d.targets, ['your mortgage', 'your student loan']);
  assert.ok(d.patch.some((c) => c.path === 'income.studentLoanOverpayment'));
});

test('goal-seek says plainly when it can’t help, or nothing is needed', () => {
  const p = fixture('sample');
  const already = FP.goalSeek.solve(p, { id: 'spend', value: 100 }, 'pension');
  assert.equal(already.already, true);
  assert.deepEqual(already.patch, []);
  const far = FP.goalSeek.solve(p, { id: 'spend', value: 900000 }, 'pension');
  assert.equal(far.reachable, false);
  assert.ok(far.closest.reaches < 900000);
  assert.match(FP.goalSeek.solve(p, { id: 'retireAt', value: 60 }, 'retireAge').reason, /can’t be changed/);
  assert.match(FP.goalSeek.solve(p, { id: 'debtFree', value: 30 }, 'overpay').reason, /after your age now/);
  // Spending less only clears debts sooner if leftover money goes to them.
  const q = copy(p);
  Object.assign(q.leftover, { debts: 0, mortgage: 0 });
  assert.match(FP.goalSeek.solve(q, { id: 'debtFree', value: 50 }, 'spending').reason, /money left over each month goes to paying them off/);
});

test('the spending lever scales every row and the estimate, so it sticks', () => {
  const p = fixture('quickstart');
  const before = FP.goalSeek.spendingPatch(p, 0) && p.spending.reduce((t, r) => t + r.monthly, 0);
  const after = FP.patch.applyPatch(p, FP.goalSeek.spendingPatch(p, before - 300));
  close(after.spending.reduce((t, r) => t + r.monthly, 0), before - 300, 0.05);
  // Bringing the rest of your estimate up to date (as editing does) keeps it.
  FP.summary.syncOutgoings(after);
  close(after.spending.reduce((t, r) => t + r.monthly, 0), before - 300, 0.05);
});
