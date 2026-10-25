/*
 * Market paths: the projection run many times with yearly returns drawn at
 * random from each asset class's return and volatility (see FP.mix), to show
 * a range of outcomes instead of one line. Pure, no DOM.
 *
 * Shares, bonds and cash in pots each get a yearly return drawn from a normal
 * distribution with the assumption's average (plus the market shift on shares
 * and bonds) and volatility, independently. Cash savings and house prices stay
 * at their assumptions. Each path spends your retirement goal from
 * retirement, as "money lasts to" does, and runs to your end age.
 *
 * The random numbers are seeded from the plan itself, so the same plan always
 * gives the same results, and path i is the same however many paths are run
 * or however the work is split into chunks.
 */
(function (FP) {
  'use strict';

  const PATHS = 1000;
  const FEWER_PATHS = 500;

  // A 32-bit hash of text (FNV-1a).
  function hash(text) {
    let x = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      x ^= text.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x >>> 0;
  }

  // A seeded random number generator (mulberry32): () → [0, 1).
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Standard normal draws from a uniform generator (Box-Muller).
  function normal(rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }

  // One path's yearly returns: [{ shares, bonds, cashFund }] for `years` years.
  function drawPath(a, years, seed) {
    const rand = rng(seed);
    const m = FP.mix.returnsOf(a);
    const out = [];
    for (let y = 0; y < years; y += 1) {
      out.push({
        shares: m.shares + a.sharesVolatility * normal(rand),
        bonds: m.bonds + a.bondsVolatility * normal(rand),
        cashFund: m.cash + a.cashVolatility * normal(rand),
      });
    }
    return out;
  }

  // The plan's seed: the same plan, the same paths.
  const seedOf = (profile) => hash(JSON.stringify(profile));

  /*
   * How the plan's retirement goal scales spending from retirement (as in
   * FP.projection.retirementNeed), or null when there's no retirement in
   * the projection or no spending.
   */
  function goalFactor(profile, base) {
    if (!base.ok || !base.events.retirement || base.events.retirement.y >= base.rows.length - 1) return null;
    const now = profile.spending.reduce((t, r) => t + (r.monthly || 0), 0);
    if (!(now > 0)) return null;
    const set = profile.goals && profile.goals.retirementIncome > 0;
    const goal = set ? profile.goals.retirementIncome : now;
    const ret = base.events.retirement;
    return goal / (now * FP.growth.compound(1, profile.assumptions.spendingGrowth, ret.y) / ret.inflationFactor);
  }

  // The age a run's money first runs short in retirement, or null if it lasts.
  const shortAge = (rows) => {
    const r = rows.find((row) => row.working === false && row.unfunded > 0.5);
    return r ? r.age : null;
  };

  // The value at fraction q (0-1) of sorted numbers, between neighbours.
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const at = (sorted.length - 1) * q;
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }

  /*
   * Runs paths a few at a time, so a screen can share the work out between
   * frames: runner.next(k) runs up to k more paths and returns true once all
   * `paths` have run; runner.result() gives what's been run so far. Null when
   * the projection can't run.
   * opts: paths (1,000 unless given), seed (the plan's own unless given).
   */
  function runner(profile, opts) {
    opts = opts || {};
    let total = opts.paths || PATHS;
    const seed = opts.seed == null ? seedOf(profile) : opts.seed;
    const base = FP.projection.project(profile, { maxYears: 100 });
    if (!base.ok) return null;
    const factor = goalFactor(profile, base);
    const runOpts = { maxYears: 100, retirementSpending: factor == null ? undefined : factor };
    const fixed = FP.projection.project(profile, runOpts);
    const years = fixed.rows.length - 1;
    const a = profile.assumptions;
    const worth = fixed.rows.map(() => []);
    const shorts = [];
    let done = 0;

    function next(k) {
      const stop = Math.min(total, done + (k == null ? total : k));
      for (; done < stop; done += 1) {
        const r = FP.projection.project(profile, { ...runOpts, returnsPath: drawPath(a, years, (seed + Math.imul(done + 1, 0x9e3779b1)) >>> 0) });
        r.rows.forEach((row, i) => worth[i].push(row.netWorth));
        shorts.push(factor == null ? null : shortAge(r.rows));
      }
      return done >= total;
    }

    /*
     * { paths (run so far), total, rows: [{ y, age, low, mid, high }] (net
     * worth in future pounds, 10th, 50th and 90th percentile),
     * fixed (the projection at the assumptions' rates, spending your goal),
     * lasting (paths whose money lasts to the end age, or null without a
     * retirement goal), endAge, midLastsTo (the middle path's age money lasts
     * to; the end age if it lasts) }
     */
    function result() {
      const rows = fixed.rows.map((row, i) => {
        const s = worth[i].slice().sort((x, y) => x - y);
        return { y: row.y, age: row.age, inflationFactor: row.inflationFactor, low: quantile(s, 0.1), mid: quantile(s, 0.5), high: quantile(s, 0.9) };
      });
      const endAge = fixed.rows[fixed.rows.length - 1].age;
      const ages = shorts.map((x) => (x == null ? endAge : x)).sort((x, y) => x - y);
      return {
        paths: done, total, rows, fixed, endAge,
        lasting: factor == null ? null : shorts.filter((x) => x == null).length,
        midLastsTo: factor == null || !ages.length ? null : quantile(ages, 0.5),
      };
    }

    // Run fewer paths in all (no fewer than have run): the first n are the same either way.
    function limit(n) { total = Math.max(done, Math.min(total, n)); }

    return { next, result, limit, get total() { return total; }, get done() { return done; } };
  }

  // All the paths at once.
  function run(profile, opts) {
    const r = runner(profile, opts);
    if (!r) return null;
    r.next();
    return r.result();
  }

  // "8 of 10": out of 10, with "more than 9" and "fewer than 1" at the ends.
  function outOfTen(count, total) {
    if (!(total > 0)) return null;
    if (count === total) return '10 of 10';
    if (count === 0) return '0 of 10';
    const n = Math.round((count / total) * 10);
    if (n >= 10) return 'more than 9 of 10';
    if (n <= 0) return 'fewer than 1 in 10';
    return `${n} of 10`;
  }

  FP.paths = { PATHS, FEWER_PATHS, hash, rng, normal, drawPath, seedOf, goalFactor, quantile, runner, run, outOfTen };
})(globalThis.FP = globalThis.FP || {});
