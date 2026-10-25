// What each pot is invested in: mixes, their growth and falls, model mixes, the action, and upgrading older saves.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./golden-lib');

const { FP } = G;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const defaults = () => FP.assumptions.defaults();
const fixture = (name) => G.profileFrom(G.readFixture(name));

function plan() {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.spending = [];
  Object.assign(p.assets, { isa: 10000, gia: 10000, pension: 10000 });
  return p;
}

test('asset-class assumptions: a return and a volatility each, dated, with a market shift', () => {
  ['shares', 'bonds', 'cash'].forEach((k) => {
    ['Return', 'Volatility'].forEach((x) => {
      const d = FP.assumptions.def(`${k}${x}`);
      assert.ok(d, `${k}${x}`);
      assert.match(d.setOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof d.default, 'number');
    });
  });
  assert.equal(FP.assumptions.def('marketShift').default, 0);
  assert.equal(FP.assumptions.def('investmentReturn'), undefined);
  assert.equal(FP.assumptions.def('pensionGrowth'), undefined);
  // Fees stay, one for investments and one for pensions.
  assert.equal(FP.assumptions.def('investmentFees').default, 0.4);
  assert.equal(FP.assumptions.def('pensionFees').default, 0.5);
});

test('the default mix grows exactly as every pot did before mixes: 5% before fees', () => {
  const a = defaults();
  assert.deepEqual(FP.assumptions.DEFAULT_MIX, { shares: 40, bonds: 60, cash: 0 });
  assert.equal(FP.mix.grossRate(FP.assumptions.DEFAULT_MIX, FP.mix.returnsOf(a)), 5);
  assert.equal(FP.mix.netRate(FP.assumptions.DEFAULT_MIX, a, 'invest'), 4.6);
  assert.equal(FP.mix.netRate(FP.assumptions.DEFAULT_MIX, a, 'pension'), 4.5);
  // A new plan's pots all have it.
  const p = FP.profile.blank();
  assert.deepEqual(p.mixes, { isa: { shares: 40, bonds: 60, cash: 0 }, gia: { shares: 40, bonds: 60, cash: 0 }, pension: { shares: 40, bonds: 60, cash: 0 } });
  assert.deepEqual(FP.profile.newPension('dc').mix, FP.assumptions.DEFAULT_MIX);
  assert.deepEqual(FP.profile.newPartner(p).pensionMix, FP.assumptions.DEFAULT_MIX);
});

test('a mix grows at its weighted return, with the market shift on shares and bonds only', () => {
  const a = { ...defaults(), sharesReturn: 7, bondsReturn: 3, cashReturn: 2 };
  close(FP.mix.grossRate({ shares: 50, bonds: 25, cash: 25 }, FP.mix.returnsOf(a)), 3.5 + 0.75 + 0.5);
  close(FP.mix.grossRate({ shares: 0, bonds: 0, cash: 100 }, FP.mix.returnsOf({ ...a, marketShift: -2 })), 2);
  close(FP.mix.grossRate({ shares: 100, bonds: 0, cash: 0 }, FP.mix.returnsOf({ ...a, marketShift: -2 })), 5);
  close(FP.mix.netRate({ shares: 100, bonds: 0, cash: 0 }, { ...a, pensionFees: 1 }, 'pension'), 6);
});

test('growth against falls: model mixes grow more and fall further as the risk level rises', () => {
  const a = defaults();
  const t = FP.mix.LEVELS.map((l) => FP.mix.tradeOff(FP.mix.model(l), a));
  // Cautious 20/60/20, balanced 60/35/5, adventurous 90/10/0, before fees.
  close(t[0].growth, 4.4);
  close(t[1].growth, 5.475);
  close(t[2].growth, 6.25);
  close(t[0].volatility, 7);
  close(t[1].volatility, 11.75);
  close(t[2].volatility, 15);
  close(t[1].fall, 1.645 * 11.75 - 5.475);
  assert.ok(t[0].growth < t[1].growth && t[1].growth < t[2].growth);
  assert.ok(t[0].fall < t[1].fall && t[1].fall < t[2].fall);
  assert.equal(FP.mix.tradeOffText(FP.mix.model('balanced'), a),
    'Grows about 5.5% a year before fees on average. In a bad year (about 1 in 20) it could fall by about 14%.');
  assert.equal(FP.mix.tradeOffText(FP.mix.model('balanced'), a, 'pension'),
    'Grows about 5.0% a year after fees on average. In a bad year (about 1 in 20) it could fall by about 14%.');
  assert.equal(FP.mix.tradeOffText({ shares: 0, bonds: 0, cash: 100 }, a), 'Grows about 3.5% a year before fees on average. It’s unlikely to fall much in a year.');
  // Model mixes add up to 100 and are copies.
  FP.mix.LEVELS.forEach((l) => { const m = FP.mix.model(l); assert.equal(m.shares + m.bonds + m.cash, 100); m.shares = 0; });
  assert.equal(FP.mix.model('balanced').shares, 60);
  assert.equal(FP.mix.model(''), null);
  assert.equal(FP.mix.model('reckless'), null);
});

test('mixes in plain words, and the notice beside every model mix', () => {
  assert.equal(FP.mix.describe({ shares: 40, bonds: 60, cash: 0 }), '40% shares, 60% bonds');
  assert.equal(FP.mix.describe({ shares: 60, bonds: 35, cash: 5 }), '60% shares, 35% bonds, 5% cash');
  assert.equal(FP.mix.NOTICE, 'An illustration for people with this risk level, not a recommendation for you. Consider regulated advice.');
  // No 'you should' anywhere in what's shown with a mix.
  const words = [FP.mix.NOTICE].concat(FP.mix.LEVELS.map((l) => FP.mix.tradeOffText(FP.mix.model(l), defaults())), FP.suggest.HOW_TO.mix).join(' ');
  assert.doesNotMatch(words, /you should/i);
});

test('saved mixes are checked: each 0 to 100, adding up to 100, or the default', () => {
  const p = FP.profile.normalise({
    mixes: { isa: { shares: 60, bonds: 35, cash: 5 }, gia: { shares: 60, bonds: 60, cash: 0 }, pension: { shares: '50', bonds: 50, cash: 0 } },
    partner: { pensionMix: { shares: 100, bonds: 0, cash: 0 } },
    pensions: [{ type: 'dc', value: 1, mix: { shares: -10, bonds: 110, cash: 0 } }, { type: 'dc', value: 1, mix: { shares: 0, bonds: 0, cash: 100 } }],
  });
  assert.deepEqual(p.mixes.isa, { shares: 60, bonds: 35, cash: 5 });
  assert.deepEqual(p.mixes.gia, FP.assumptions.DEFAULT_MIX);
  assert.deepEqual(p.mixes.pension, FP.assumptions.DEFAULT_MIX);
  assert.deepEqual(p.partner.pensionMix, { shares: 100, bonds: 0, cash: 0 });
  assert.deepEqual(p.pensions[0].mix, FP.assumptions.DEFAULT_MIX);
  assert.deepEqual(p.pensions[1].mix, { shares: 0, bonds: 0, cash: 100 });
  assert.deepEqual(FP.profile.normalise({}).mixes, FP.profile.blank().mixes);
});

test('each pot grows at its own mix, less its fees', () => {
  const p = plan();
  Object.assign(p.assumptions, { sharesReturn: 8, bondsReturn: 4, cashReturn: 2, investmentFees: 0.5, pensionFees: 1, inflation: 0 });
  p.mixes = { isa: { shares: 100, bonds: 0, cash: 0 }, gia: { shares: 0, bonds: 0, cash: 100 }, pension: { shares: 50, bonds: 50, cash: 0 } };
  const y1 = FP.projection.project(p).rows[1];
  close(y1.isa, 10000 * 1.075, 1e-6);
  close(y1.gia, 10000 * 1.015, 1e-6);
  close(y1.pension, 10000 * 1.05, 1e-6);
});

test('your partner’s pension and other pots grow at their own mixes', () => {
  const p = plan();
  p.assets.pension = 0;
  Object.assign(p.assumptions, { sharesReturn: 8, bondsReturn: 4, cashReturn: 2, pensionFees: 0 });
  FP.profile.addPartner(p);
  p.partner.age = 40;
  p.partner.pension = 10000;
  p.partner.pensionMix = { shares: 100, bonds: 0, cash: 0 };
  const flat = FP.projection.project(p).rows[1].pension;
  close(flat, 10800, 1e-6);
  p.partner.pension = 0;
  p.pensions = [{ ...FP.profile.newPension('dc'), value: 10000, mix: { shares: 0, bonds: 0, cash: 100 } }];
  close(FP.projection.project(p).rows[1].pension, 10200, 1e-6);
  // A partner taken off and brought back keeps their mix.
  p.partner.pensionMix = { shares: 90, bonds: 10, cash: 0 };
  const kept = FP.profile.removePartner(p);
  FP.profile.addPartner(p, kept);
  assert.deepEqual(p.partner.pensionMix, { shares: 90, bonds: 10, cash: 0 });
});

test('the market shift moves every pot by the same points when it has no cash', () => {
  const p = fixture('sample');
  const up = JSON.parse(JSON.stringify(p));
  up.assumptions.marketShift = 2;
  const a = up.assumptions;
  close(FP.mix.netRate(up.mixes.isa, a, 'invest'), 6.6);
  close(FP.mix.netRate(up.mixes.pension, a, 'pension'), 6.5);
  assert.ok(FP.projection.project(up).rows[10].pension > FP.projection.project(p).rows[10].pension);
});

test('the pots with a mix: your pension and ISAs always, others once they have money in', () => {
  const p = plan();
  p.assets.gia = 0;
  assert.deepEqual(FP.mix.shownPots(p).map((x) => x.path), ['mixes.pension', 'mixes.isa']);
  p.assets.gia = 5;
  FP.profile.addPartner(p);
  p.partner.name = 'Sam';
  p.partner.pension = 1;
  p.pensions = [{ ...FP.profile.newPension('dc'), name: 'Old job', value: 2 }, { ...FP.profile.newPension('db'), income: 5000 }, { ...FP.profile.newPension('dc', 'partner'), value: 3 }];
  const pots = FP.mix.shownPots(p);
  assert.deepEqual(pots.map((x) => x.path), ['mixes.pension', 'partner.pensionMix', 'mixes.isa', 'mixes.gia', 'pensions.0.mix', 'pensions.2.mix']);
  assert.deepEqual(pots.map((x) => x.label), ['Your pension pots', 'Sam’s pension pots', 'Investments in ISAs', 'Other investments', 'Old job', 'Pension 3']);
  assert.deepEqual(pots.map((x) => x.kind), ['pension', 'pension', 'invest', 'invest', 'pension', 'pension']);
  assert.equal(pots[5].owner, 1);
  // Defined benefit pensions have no mix.
  assert.ok(!FP.mix.pots(p).some((x) => x.path === 'pensions.1.mix'));
});

test('use this mix: a patch for one pot, or every pot, that applies on a copy', () => {
  const p = plan();
  assert.deepEqual(FP.mix.usePatch('mixes.isa', 'balanced'), [{ path: 'mixes.isa', op: 'set', value: { shares: 60, bonds: 35, cash: 5 } }]);
  assert.equal(FP.mix.usePatch('mixes.isa', ''), null);
  const after = FP.patch.applyPatch(p, FP.mix.usePatch('mixes.isa', 'adventurous'));
  assert.deepEqual(after.mixes.isa, { shares: 90, bonds: 10, cash: 0 });
  assert.deepEqual(p.mixes.isa, FP.assumptions.DEFAULT_MIX);
  const all = FP.mix.useAllPatch(p, 'cautious');
  assert.deepEqual(all.map((c) => c.path), ['mixes.pension', 'mixes.isa', 'mixes.gia']);
  const done = FP.patch.applyPatch(p, all);
  assert.equal(FP.mix.useAllPatch(done, 'cautious'), null);
  // Its impact: a cautious mix grows less, so less to spend in retirement.
  p.income.grossSalary = 40000;
  p.spending = [{ id: 's', category: 'All', monthly: 1500 }];
  const impact = FP.patch.impact(p, FP.mix.useAllPatch(p, 'cautious'));
  assert.ok(impact.change.retirementSpend < 0);
  assert.equal(impact.change.leftover, 0);
});

test('the model mix as an action: only with a risk level, with its trade-off and notice', () => {
  const p = fixture('sample');
  assert.equal(p.about.riskAppetite, '');
  assert.equal(FP.suggest.mixAction(p), null);
  p.about.riskAppetite = 'balanced';
  const x = FP.suggest.mixAction(p);
  assert.equal(x.id, 'mix');
  assert.equal(x.tone, 'tip');
  assert.equal(x.title, 'Use a typical balanced mix');
  assert.equal(x.text, '60% shares, 35% bonds, 5% cash for your pension, ISAs and other investments. A typical mix for people with a balanced risk level.');
  assert.equal(x.notice, FP.mix.NOTICE);
  assert.match(x.tradeOff, /^Grows about 5\.5% a year before fees on average\. In a bad year \(about 1 in 20\) it could fall by about 14%\.$/);
  assert.deepEqual(x.patch, FP.mix.useAllPatch(p, 'balanced'));
  assert.deepEqual(x.howTo, FP.suggest.HOW_TO.mix);
  assert.ok(x.impact.change.retirementSpend > 0);
  // Not offered once every pot has the mix.
  assert.equal(FP.suggest.mixAction(FP.patch.applyPatch(p, x.patch)), null);
  // The ideas for money left over (and so the golden snapshots) don't include it.
  assert.ok(!FP.suggest.analyse(p).suggestions.some((s) => s.id === 'mix'));
});

test('upgrading: two old rates become mixes and a shift that give exactly the same rates', () => {
  const a = defaults();
  const check = (invest, pension) => {
    const r = FP.mix.fromRates(invest, pension, a);
    const b = { ...a, marketShift: r.marketShift, sharesReturn: r.sharesReturn, bondsReturn: r.bondsReturn };
    [r.invest, r.pension].forEach((m) => {
      assert.ok(m.shares >= 0 && m.bonds >= 0 && m.cash === 0, JSON.stringify(m));
      close(m.shares + m.bonds, 100, 1e-6);
    });
    close(FP.mix.grossRate(r.invest, FP.mix.returnsOf(b)), invest, 1e-6);
    close(FP.mix.grossRate(r.pension, FP.mix.returnsOf(b)), pension, 1e-6);
    return r;
  };
  // The same rate keeps the default mix; the difference from 5% is the shift.
  assert.deepEqual(check(5, 5), { invest: FP.assumptions.DEFAULT_MIX, pension: FP.assumptions.DEFAULT_MIX, marketShift: 0, sharesReturn: 6.5, bondsReturn: 4 });
  assert.equal(check(7, 7).marketShift, 2);
  assert.equal(check(3, 3).marketShift, -2);
  assert.equal(check(-20, -20).marketShift, -25);
  // Different rates: different mixes, with a shift only if needed.
  assert.deepEqual(check(5, 6).invest, { shares: 40, bonds: 60, cash: 0 });
  assert.equal(check(5, 6).marketShift, 0);
  assert.ok(check(7, 8).marketShift > 0);
  assert.ok(check(2, 3).marketShift < 0);
  // Too far apart for one shift: shares and bonds returns change instead.
  const wide = check(9, 3);
  assert.deepEqual([wide.sharesReturn, wide.bondsReturn, wide.marketShift], [9, 3, 0]);
});

const v6 = (profile) => ({ schemaVersion: 6, savedAt: '2026-10-24T00:00:00.000Z', workspace: { activeId: 'a', scenarios: [{ id: 'a', name: 'Baseline', profile }], checkins: { snapshots: [], projection: null } } });

test('version 6 saves load with mixes and give the same results as before', () => {
  G.names().forEach((name) => {
    const raw = JSON.parse(JSON.stringify(G.readFixture(name)));
    const up = FP.migrate.upgrade(v6(raw));
    assert.equal(up.from, 6);
    const p = up.workspace.scenarios[0].profile;
    assert.deepEqual(p.mixes.pension, FP.assumptions.DEFAULT_MIX, name);
    assert.equal(p.assumptions.marketShift, 0, name);
    FP.summary.syncOutgoings(p);
    const changes = G.diff(G.readGolden(name), G.snapshot(p));
    assert.ok(!changes.length, `${name}: ${G.describe(changes)}`);
  });
});

test('version 6 saves with changed returns keep exactly the same growth', () => {
  const base = fixture('sample');
  const old = JSON.parse(JSON.stringify(G.readFixture('sample')));
  Object.assign(old.assumptions, { investmentReturn: 7, pensionGrowth: 6 });
  old.partner = null;
  old.pensions = [{ id: 'pn1', type: 'dc', value: 5000 }];
  const p = FP.migrate.upgrade(v6(old)).workspace.scenarios[0].profile;
  assert.equal(p.assumptions.investmentReturn, undefined);
  close(FP.mix.netRate(p.mixes.isa, p.assumptions, 'invest'), 7 - 0.4, 1e-6);
  close(FP.mix.netRate(p.mixes.gia, p.assumptions, 'invest'), 7 - 0.4, 1e-6);
  close(FP.mix.netRate(p.mixes.pension, p.assumptions, 'pension'), 6 - 0.5, 1e-6);
  close(FP.mix.netRate(p.pensions[0].mix, p.assumptions, 'pension'), 6 - 0.5, 1e-6);
  assert.ok(FP.projection.project(p).rows[5].isa > FP.projection.project(base).rows[5].isa);
  // Bad saved rates count as the old default, 5%.
  const bad = JSON.parse(JSON.stringify(G.readFixture('sample')));
  Object.assign(bad.assumptions, { investmentReturn: 'lots', pensionGrowth: 99 });
  const q = FP.migrate.upgrade(v6(bad)).workspace.scenarios[0].profile;
  assert.equal(q.assumptions.marketShift, 0);
  assert.deepEqual(q.mixes, base.mixes);
});

test('weaker markets gives the same plan as a version 6 save with returns 2 points lower', () => {
  const ws = FP.scenarios.fromProfile(fixture('sample'));
  const weak = FP.scenarios.fromPreset(ws, 'weakerMarkets').profile;
  assert.equal(weak.assumptions.marketShift, -2);
  const old = JSON.parse(JSON.stringify(G.readFixture('sample')));
  Object.assign(old.assumptions, { investmentReturn: 3, pensionGrowth: 3 });
  const fromOld = FP.migrate.upgrade(v6(old)).workspace.scenarios[0].profile;
  FP.summary.syncOutgoings(fromOld);
  const changes = G.diff(G.clean(FP.projection.project(fromOld)), G.clean(FP.projection.project(weak)));
  assert.ok(!changes.length, G.describe(changes));
  // And the sample's Stronger markets scenario is the old 7%.
  const strong = FP.sampleWorkspace().scenarios[2].profile;
  close(FP.mix.netRate(strong.mixes.isa, strong.assumptions, 'invest'), 6.6);
  close(FP.mix.netRate(strong.mixes.pension, strong.assumptions, 'pension'), 6.5);
});
