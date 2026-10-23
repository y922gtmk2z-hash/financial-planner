const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

test('parseValue accepts friendly formats and treats blanks as zero', () => {
  const money = FP.profile.fieldFor('assets.homeValue');
  assert.deepEqual(FP.profile.parseValue(money, '£250,000'), { ok: true, value: 250000 });
  assert.deepEqual(FP.profile.parseValue(money, ''), { ok: true, value: 0 });
  assert.equal(FP.profile.parseValue(money, '-5').ok, false);
  assert.equal(FP.profile.parseValue(money, 'abc').ok, false);
  assert.equal(FP.profile.parseValue(money, '1.2.3').ok, false);
});

test('parseValue enforces ranges and nullable fields', () => {
  const age = FP.profile.fieldFor('about.age');
  assert.deepEqual(FP.profile.parseValue(age, ''), { ok: true, value: null });
  assert.equal(FP.profile.parseValue(age, '200').ok, false);
  assert.equal(FP.profile.parseValue(age, '38.5').ok, false);
  const rate = FP.profile.DEBT_FIELDS.find((f) => f.key === 'rate');
  assert.deepEqual(FP.profile.parseValue(rate, ''), { ok: true, value: null });
  assert.deepEqual(FP.profile.parseValue(rate, '6.9%'), { ok: true, value: 6.9 });
});

test('normalise fills gaps, drops junk and keeps valid values', () => {
  const p = FP.profile.normalise({
    assets: { homeValue: '300000', isa: -1, hacked: 5 },
    assumptions: { inflation: 3, mortgageRate: 999 },
    debts: [{ name: 'Loan', balance: 1000, rate: 'x' }, null],
    extra: 'ignored',
  });
  assert.equal(p.assets.homeValue, 300000);
  assert.equal(p.assets.isa, 0);
  assert.equal(p.assets.hacked, undefined);
  assert.equal(p.extra, undefined);
  assert.equal(p.assumptions.inflation, 3);
  assert.equal(p.assumptions.mortgageRate, 4.5);
  assert.equal(p.debts.length, 1);
  assert.equal(p.debts[0].rate, null);
});

test('export then import round-trips the workspace', () => {
  const ws = FP.sampleWorkspace();
  const r = FP.store.importJson(FP.store.exportJson(ws));
  assert.equal(r.ok, true);
  assert.deepEqual(r.workspace, ws);
  assert.equal(FP.store.importJson('{"profile":{}}').ok, false);
  assert.equal(FP.store.importJson('not json').ok, false);
  assert.equal(FP.store.importJson('{"app":"uk-finance-planner","schemaVersion":99,"workspace":{}}').ok, false);
});

test('older single-profile exports import as a one-scenario workspace', () => {
  const old = JSON.stringify({ app: 'uk-finance-planner', schemaVersion: 1, profile: FP.sample() });
  const r = FP.store.importJson(old);
  assert.equal(r.ok, true);
  assert.equal(r.workspace.scenarios.length, 1);
  assert.equal(r.workspace.scenarios[0].name, 'Baseline');
  assert.deepEqual(r.workspace.scenarios[0].profile, FP.sample());
});

test('every assumption has a default inside its range and a set-on date', () => {
  FP.assumptions.DEFS.forEach((d) => {
    assert.match(d.setOn, /^\d{4}-\d{2}-\d{2}$/, d.key);
    if (d.unit === 'choice') assert.ok(d.options.some((o) => o.value === d.default), d.key);
    else if (d.default != null) assert.ok(d.default >= d.min && d.default <= d.max, d.key);
  });
});

test('summary: net worth, equity and outgoings for the sample household', () => {
  const p = FP.sample();
  const s = FP.summary.compute(p, null);
  assert.equal(s.assets.total, 325000 + 14000 + 22000 + 3500 + 61000 + 6000);
  assert.equal(s.liabilities.total, 198000 + 7800 + 1200 + 41000); // includes the student loan
  assert.equal(s.netWorth, s.assets.total - s.liabilities.total);
  assert.equal(s.home.equity, 325000 - 198000);
  assert.equal(s.cashFlow.surplus, null);
  assert.equal(s.cashFlow.spendingMonthly, 1480);
  assert.equal(s.cashFlow.debtMonthly, 345);
  assert.ok(s.mortgage.monthsToClear < s.mortgage.monthsToClearWithoutOver);
  // credit card with a blank rate uses the default other-debt rate
  assert.equal(s.debts[1].rate, 7);
  const withPay = FP.summary.compute(p, 3000);
  assert.equal(withPay.cashFlow.available, 3000 - withPay.cashFlow.outgoings);
  assert.equal(withPay.cashFlow.savingsMonthly, 75); // the sample's stocks & shares ISA
  assert.equal(withPay.cashFlow.surplus, withPay.cashFlow.available - 75);
});

test('summary copes with an empty profile', () => {
  const s = FP.summary.compute(FP.profile.blank(), null);
  assert.equal(s.netWorth, 0);
  assert.equal(s.mortgage, null);
  assert.equal(s.home.ltvPct, null);
  assert.equal(s.cashFlow.outgoings, 0);
});

test('bonuses are stored as a list and validated', () => {
  assert.deepEqual(FP.profile.blank().income.bonuses, []);
  const p = FP.profile.normalise({ income: { bonuses: [{ amount: '1,500', month: 'mar' }, { amount: 200, month: 'smarch' }, 'junk'] } });
  assert.equal(p.income.bonuses.length, 2);
  assert.equal(p.income.bonuses[0].amount, 1500);
  assert.equal(p.income.bonuses[0].month, 'mar');
  assert.equal(p.income.bonuses[1].month, 'spread');
  assert.ok(p.income.bonuses[0].id);
});

test('older saves with a single bonus are converted to the list', () => {
  const p = FP.profile.normalise({ income: { bonus: 2000, bonusMonth: 'jun' } });
  assert.equal(p.income.bonuses.length, 1);
  assert.equal(p.income.bonuses[0].amount, 2000);
  assert.equal(p.income.bonuses[0].month, 'jun');
  assert.equal(p.income.bonus, undefined);
  assert.deepEqual(FP.profile.normalise({ income: { bonus: 0 } }).income.bonuses, []);
});

test('checklist: age and spending are needed before a projection; others are optional', () => {
  const p = FP.profile.blank();
  let c = FP.summary.checklist(p);
  assert.equal(c.ready, false);
  assert.deepEqual(c.blocking.map((i) => i.id), ['age', 'spending']);
  p.about.age = 30;
  p.spending = [{ id: 's', category: 'All', monthly: 900 }];
  c = FP.summary.checklist(p);
  assert.equal(c.ready, true);
  assert.deepEqual(c.optional.map((i) => i.id), ['salary', 'pension', 'cash']);
  // Retired: no salary expected.
  p.about.age = 70;
  assert.ok(!FP.summary.checklist(p).optional.some((i) => i.id === 'salary'));
  // Not ready: comparisons have no projection either.
  p.spending = [];
  assert.equal(FP.compare.summarise(p).ok, false);
});

test('ideas you mark done or hidden are kept; anything else is dropped', () => {
  const p = FP.profile.normalise({ ideas: { isa: 'done', match: 'hidden', relief: 'maybe', 'bad key!': 'done' } });
  assert.deepEqual(p.ideas, { isa: 'done', match: 'hidden' });
  assert.deepEqual(FP.profile.blank().ideas, {});
});
