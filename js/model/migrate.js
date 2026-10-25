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
