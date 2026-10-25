/*
 * Golden snapshots: today's results for each fixture profile in tests/fixtures/,
 * saved in tests/golden/ so later changes can prove they changed nothing.
 * Used by golden.test.js (compare) and golden-update.js (rewrite).
 */
const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');
const GOLDEN = path.join(__dirname, 'golden');

/*
 * The projection starts from today's date, so every snapshot is taken as if it
 * were noon on this day. Call before loading the FP scripts.
 */
const CLOCK = '2026-10-24T12:00:00Z';
function fixClock() {
  const Real = Date;
  const fixed = new Real(CLOCK).getTime();
  class FixedDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(fixed); else super(...args);
    }
    static now() { return fixed; }
  }
  globalThis.Date = FixedDate;
}

fixClock();
const FP = require('./load');

const names = () => fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();

// A fixture as the app would hold it: cleaned up, with the rest of your
// estimate brought up to date as editing it in Your figures does.
function profileFrom(input) {
  const p = FP.profile.normalise(input);
  FP.summary.syncOutgoings(p);
  return p;
}

const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));

// Money to the penny, so floating-point noise doesn't fail the tests.
// Functions are dropped; Infinity and NaN are kept as text.
function clean(v) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    const r = Math.round(v * 100) / 100;
    return Object.is(r, -0) ? 0 : r;
  }
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach((k) => {
      if (typeof v[k] === 'function' || v[k] === undefined) return;
      out[k] = clean(v[k]);
    });
    return out;
  }
  return v;
}

function snapshot(profile) {
  const pay = FP.tax.forProfile(profile);
  const ideas = FP.suggest.analyse(profile);
  // A household's take-home is both people's together; with just you, it's yours.
  const household = FP.tax.household(profile);
  return clean({
    tax: pay,
    ...(profile.partner ? { taxPartner: household.people[1], household: { takeHome: household.takeHome, takeHomeMonthly: household.takeHomeMonthly } } : {}),
    summary: FP.summary.compute(profile, household.takeHomeMonthly),
    projection: FP.projection.project(profile),
    retirementSpend: FP.projection.retirementSpend(profile),
    retirementNeed: FP.projection.retirementNeed(profile),
    potNeeded: FP.projection.potNeeded(profile),
    suggest: {
      suggestions: ideas.suggestions.map((x) => {
        const { id, tone, title, text, patch, impact, howTo, due, safety, kind, link } = x;
        const af = x.afford;
        return {
          id, tone, title, text, patch, impact, howTo, due, safety, kind, link,
          commitment: x.commitment ? x.commitment() : null,
          valuePerYear: FP.suggest.valuePerYear(x),
          highlights: FP.suggest.highlights(x),
          afford: af ? { cost: af.cost, left: af.left, none: af.none, scaled: af.scaled ? { patch: af.scaled.patch, monthly: af.scaled.monthly } : null } : null,
        };
      }),
      split: ideas.split,
      unallocated: ideas.unallocated,
      // The Actions screen's order: each group's ids.
      actions: (() => {
        const g = FP.suggest.groupActions(FP.suggest.actions(profile));
        return { main: g.main.map((x) => x.id), smaller: g.smaller.map((x) => x.id), later: g.later.map((x) => x.id) };
      })(),
    },
    // What would it take to spend 20% more in retirement, by each lever.
    goalSeek: goalSeek(profile),
  });
}

function goalSeek(profile) {
  const rs = FP.projection.retirementSpend(profile);
  if (!rs) return null;
  const goal = { id: 'spend', value: Math.ceil((rs.monthly * 1.2) / 100) * 100 };
  return { goal, levers: Object.fromEntries(['pension', 'retireAge', 'spending'].map((l) => [l, FP.goalSeek.solve(profile, goal, l)])) };
}

const goldenPath = (name) => path.join(GOLDEN, `${name}.json`);
const readGolden = (name) => JSON.parse(fs.readFileSync(goldenPath(name), 'utf8'));

// Every value that differs: [{ path, old, new }]. A missing value is undefined.
function diff(a, b, at, out) {
  out = out || [];
  at = at || '';
  const isObj = (x) => x && typeof x === 'object';
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach((k) => diff(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k, out));
  } else if (a !== b) {
    out.push({ path: at || '(root)', old: a, new: b });
  }
  return out;
}

const show = (v) => (v === undefined ? '(missing)' : JSON.stringify(v));
function describe(changes, limit) {
  const shown = changes.slice(0, limit || 50).map((c) => `  ${c.path}: ${show(c.old)} → ${show(c.new)}`);
  if (changes.length > shown.length) shown.push(`  …and ${changes.length - shown.length} more`);
  return shown.join('\n');
}

module.exports = { FP, CLOCK, names, readFixture, profileFrom, snapshot, clean, goldenPath, readGolden, diff, describe };
