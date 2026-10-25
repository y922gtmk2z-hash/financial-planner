/*
 * Upgrades saved data (a browser save or an exported backup) to the current
 * version, one numbered step at a time. Each step takes the file's data as
 * saved by version `from` and returns it in the shape of version `to`; then
 * FP.scenarios.normalise checks and cleans it up. Pure: no DOM, no storage.
 *
 * Versions (the file's schemaVersion):
 *   1  { profile }: one plan.
 *   2  { workspace }: a workspace of scenarios. Files saved at 2 can still
 *      hold older shapes inside a profile, so step 2 → 3 looks for each one.
 *   3  { workspace }, every profile in today's shape.
 *   4  Ideas can also be marked 'applied' (made to your plan from Actions).
 *   5  The workspace keeps your check-ins (snapshots of your balances).
 *   6  Household mode: a profile can have a partner, more pensions, and owners
 *      on assets and debts. Nothing moves: you stay in the profile's own fields.
 *   7  Each ISA, other investment and pension pot has a mix of shares, bonds
 *      and cash, which sets how it grows. The two old return assumptions
 *      (investmentReturn, pensionGrowth) become mixes and a market shift that
 *      give exactly the same rates.
 *   8  Life events (profile.events). Older plans have none.
 *   9  Scenarios are the baseline plus a patch: every scenario after the
 *      first keeps only what differs from the baseline, not a whole profile.
 *  10  A mortgage's fixed rate ends in a month and year (mortgage.fixEnds,
 *      'YYYY-MM') with the rate you expect after (mortgage.rateAfterFix),
 *      replacing two assumptions: the rate changing after a number of years
 *      (mortgageRateChangeYear) and the new rate (mortgageRateAfterChange).
 *      Plans can also mark figures as rough answers (profile.rough).
 *  11  Your commitments (profile.commitments): what you said you'd do when
 *      you applied an action or marked it done. Older plans have none.
 *  12  Life events can cut pay (fewer days a week: payPct), stop it for some
 *      months (months), move you to a new home (price, mortgage, term) or be
 *      paid a year at a time (per 'year'). Older events don't use them.
 *      Check-ins keep each pension pot's balance (balances.pots); older
 *      snapshots have only your main pot.
 * A file with no version is read as 2 if it holds a workspace, else 1.
 */
(function (FP) {
  'use strict';

  const CURRENT = FP.profile.SCHEMA_VERSION;

  const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
  const profilesOf = (data) => (isObj(data.workspace) && Array.isArray(data.workspace.scenarios)
    ? data.workspace.scenarios.filter(isObj).map((s) => s.profile).filter(isObj)
    : []);

  const STEPS = [
    {
      from: 1, to: 2,
      // One plan becomes the Baseline of a workspace. Before that, a plan had
      // a single bonus (and later a month for it) rather than a list.
      up(data) {
        const profile = isObj(data.profile) ? data.profile : {};
        const inc = profile.income;
        if (isObj(inc) && !Array.isArray(inc.bonuses) && inc.bonus !== undefined) {
          const r = FP.profile.parseValue(FP.profile.BONUS_FIELDS[0], inc.bonus);
          inc.bonuses = r.ok && r.value > 0 ? [{ amount: r.value, month: inc.bonusMonth }] : [];
        }
        if (isObj(inc)) {
          delete inc.bonus;
          delete inc.bonusMonth;
        }
        const out = { ...data, workspace: { scenarios: [{ name: 'Baseline', profile }] } };
        delete out.profile;
        return out;
      },
    },
    {
      from: 2, to: 3,
      up(data) {
        profilesOf(data).forEach((p) => {
          const a = isObj(p.assumptions) ? p.assumptions : {};
          // The leftover split used to be four assumptions (splitCash, ...).
          if (!isObj(p.leftover)) {
            const old = { cash: a.splitCash, invest: a.splitInvest, mortgage: a.splitMortgage, pension: a.splitPension };
            const kept = Object.entries(old).filter(([, v]) => v !== undefined);
            if (kept.length) p.leftover = Object.fromEntries(kept);
          }
          ['splitCash', 'splitInvest', 'splitMortgage', 'splitPension'].forEach((k) => delete a[k]);
          // Splits saved before the emergency fund share existed keep adding up as they did.
          if (isObj(p.leftover) && p.leftover.emergency === undefined
            && FP.profile.LEFTOVER_FIELDS.some((f) => p.leftover[f.key] !== undefined)) {
            p.leftover.emergency = 0;
          }
          // Saved before the estimate: one total (which left out mortgage and debt
          // payments) becomes your estimate, with the payments added back in.
          const rows = Array.isArray(p.spending) ? p.spending.filter(isObj).slice(0, 40) : [];
          const only = rows.length === 1 && rows[0];
          const category = only ? String(only.category == null ? '' : only.category).trim() : '';
          if (!p.outgoings && only && only.rest !== true && (category === 'Everything' || !category)) {
            Object.assign(only, { rest: true, group: 'other', category: FP.profile.REST_CATEGORY });
            p.spending = [only];
            const clean = FP.profile.normalise(p);
            if (clean.spending[0].monthly > 0 && FP.summary) {
              p.outgoings = { estimate: Math.round(FP.summary.compute(clean).cashFlow.outgoings * 100) / 100 };
            }
          }
        });
        return data;
      },
    },
    {
      from: 3, to: 4,
      // A new mark, 'applied', for ideas. Nothing saved before it needs changing.
      up: (data) => data,
    },
    {
      from: 4, to: 5,
      // Check-ins started: older workspaces have none yet.
      up(data) {
        if (isObj(data.workspace) && !isObj(data.workspace.checkins)) data.workspace.checkins = { snapshots: [], projection: null };
        return data;
      },
    },
    {
      from: 5, to: 6,
      // Household mode started: every plan so far is just you, with one pension pot.
      up(data) {
        profilesOf(data).forEach((p) => {
          if (p.partner === undefined) p.partner = null;
          if (!Array.isArray(p.pensions)) p.pensions = [];
        });
        return data;
      },
    },
    {
      from: 6, to: 7,
      // Growth used to be one rate for ISAs and other investments and one for
      // pensions. Each pot gets a mix, with a market shift (and, only if the
      // two were far apart, shares and bonds returns) that reproduce them.
      up(data) {
        const defs = FP.assumptions.defaults();
        const rate = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= -20 && v <= 20 ? v : d);
        profilesOf(data).forEach((p) => {
          if (!isObj(p.assumptions)) p.assumptions = {};
          const a = p.assumptions;
          const got = FP.mix.fromRates(rate(a.investmentReturn, 5), rate(a.pensionGrowth, 5), defs);
          delete a.investmentReturn;
          delete a.pensionGrowth;
          if (got.marketShift) a.marketShift = got.marketShift;
          if (got.sharesReturn !== defs.sharesReturn) a.sharesReturn = got.sharesReturn;
          if (got.bondsReturn !== defs.bondsReturn) a.bondsReturn = got.bondsReturn;
          p.mixes = { isa: { ...got.invest }, gia: { ...got.invest }, pension: { ...got.pension } };
          if (isObj(p.partner)) p.partner.pensionMix = { ...got.pension };
          if (Array.isArray(p.pensions)) p.pensions.filter(isObj).forEach((x) => { x.mix = { ...got.pension }; });
        });
        return data;
      },
    },
    {
      from: 7, to: 8,
      // Life events started: older plans have none yet.
      up(data) {
        profilesOf(data).forEach((p) => { if (!Array.isArray(p.events)) p.events = []; });
        return data;
      },
    },
    {
      from: 8, to: 9,
      // Each scenario's patch is what differs from the baseline. The baseline
      // is cleaned up first, so rows it gave new ids keep them.
      up(data) {
        if (!isObj(data.workspace) || !Array.isArray(data.workspace.scenarios)) return data;
        const list = data.workspace.scenarios.filter(isObj);
        if (!list.length) return data;
        const base = FP.profile.normalise(list[0].profile);
        list[0].profile = base;
        list.slice(1).forEach((sc) => {
          sc.patch = FP.scenarios.diffPatch(base, FP.profile.normalise(sc.profile));
          delete sc.profile;
        });
        data.workspace.scenarios = list;
        return data;
      },
    },
    {
      from: 9, to: 10,
      // "Rate changes after N years" becomes the month the fix ends: N years
      // from this month, less one (the new rate starts the month after, as
      // before). Scenario patches that changed either move with them.
      up(data, now) {
        const d = now || new Date();
        const fixEnds = (years) => {
          const i = d.getFullYear() * 12 + d.getMonth() + Math.round(years) * 12 - 1;
          return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
        };
        const okYears = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 40;
        const okRate = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 25;
        profilesOf(data).forEach((p) => {
          const a = isObj(p.assumptions) ? p.assumptions : {};
          if (okYears(a.mortgageRateChangeYear) || okRate(a.mortgageRateAfterChange)) {
            if (!isObj(p.mortgage)) p.mortgage = {};
            if (okYears(a.mortgageRateChangeYear)) p.mortgage.fixEnds = fixEnds(a.mortgageRateChangeYear);
            if (okRate(a.mortgageRateAfterChange)) p.mortgage.rateAfterFix = a.mortgageRateAfterChange;
          }
          delete a.mortgageRateChangeYear;
          delete a.mortgageRateAfterChange;
        });
        if (isObj(data.workspace) && Array.isArray(data.workspace.scenarios)) {
          data.workspace.scenarios.filter((sc) => isObj(sc) && Array.isArray(sc.patch)).forEach((sc) => {
            sc.patch = sc.patch.map((c) => {
              if (!isObj(c) || c.op !== 'set') return c;
              if (c.path === 'assumptions.mortgageRateChangeYear') return { path: 'mortgage.fixEnds', op: 'set', value: okYears(c.value) ? fixEnds(c.value) : null };
              if (c.path === 'assumptions.mortgageRateAfterChange') return { path: 'mortgage.rateAfterFix', op: 'set', value: okRate(c.value) ? c.value : null };
              return c;
            }).filter((c) => !(isObj(c) && /^assumptions\.mortgageRate(ChangeYear|AfterChange)$/.test(c.path)));
          });
        }
        return data;
      },
    },
    {
      from: 10, to: 11,
      // Commitments started: older plans have none yet.
      up(data) {
        profilesOf(data).forEach((p) => { if (!Array.isArray(p.commitments)) p.commitments = []; });
        return data;
      },
    },
    {
      from: 11, to: 12,
      // New kinds of life event, with their own fields. Nothing saved before needs changing.
      up: (data) => data,
    },
  ];

  // The version a file was saved at. Up to this version, what the file holds
  // decides between 1 and 2, whatever it says.
  function versionOf(data) {
    if (!isObj(data)) return 1;
    const n = data.schemaVersion;
    if (typeof n === 'number' && n > CURRENT) return n;
    if (!isObj(data.workspace)) return 1;
    return Number.isInteger(n) && n >= 2 ? n : 2;
  }

  /*
   * Any saved or exported data → { workspace, from, newer }. `from` is the
   * version it was saved at; `newer` is true when that's after this version,
   * in which case nothing is upgraded and the workspace is a best guess.
   * The data passed in is never changed.
   */
  function upgrade(input) {
    const from = versionOf(input);
    let data = JSON.parse(JSON.stringify(isObj(input) ? input : {}));
    const newer = from > CURRENT;
    let at = from;
    STEPS.forEach((step) => {
      if (newer || step.from !== at) return;
      data = { ...step.up(data), schemaVersion: step.to };
      at = step.to;
    });
    return { workspace: FP.scenarios.normalise(data.workspace), from, newer };
  }

  FP.migrate = { CURRENT, STEPS, versionOf, upgrade };
})(globalThis.FP = globalThis.FP || {});
