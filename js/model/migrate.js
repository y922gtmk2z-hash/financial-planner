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
