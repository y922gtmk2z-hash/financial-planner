/*
 * Scenarios. A workspace holds one or more scenarios. The first is the
 * baseline, your plan; every other scenario is the baseline plus a patch (its
 * changes, as FP.patch changes), so a change to the baseline carries into
 * every scenario and each one keeps only what it changes. Anything can differ.
 * Every screen edits the active scenario.
 *
 * In memory, each scenario also holds its whole profile, so screens can read
 * and edit it like any plan; sync() works out what changed since:
 *   workspace = { activeId, scenarios: [{ id, name, profile, patch? }], checkins }
 * Saved (toSaved), the baseline keeps its profile and the others only a patch:
 *   { activeId, scenarios: [{ id, name, profile }, { id, name, patch }, ...], checkins }
 *
 * A patch's paths can name a row in a list by its id ('spending.#s12.monthly'),
 * so they still point at the same row when the baseline's list changes. A
 * list whose rows were added, removed or reordered is replaced whole.
 */
(function (FP) {
  'use strict';

  const MAX_SCENARIOS = 8; // one chart colour each
  const MAX_NAME = 40;

  let idCounter = 0;
  function newId() {
    idCounter += 1;
    return `sc${Date.now().toString(36)}${idCounter}`;
  }

  function cleanName(name, fallback) {
    const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    return n || fallback;
  }

  const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
  const ROW_ID = /^[\w-]{1,40}$/;
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

  // Lists whose rows match one for one, by id, in the same order.
  function sameRows(a, b) {
    if (a.length !== b.length || !a.length) return false;
    const ids = new Set();
    return a.every((x, i) => isObj(x) && isObj(b[i]) && typeof x.id === 'string' && ROW_ID.test(x.id)
      && x.id === b[i].id && !ids.has(x.id) && ids.add(x.id));
  }

  /*
   * The patch that turns profile `a` into profile `b`: a 'set' for each value
   * that differs, as deep as it can go. Objects whose keys hold dots (owners)
   * are set whole.
   */
  function diffPatch(a, b) {
    const out = [];
    const walk = (x, y, path) => {
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      const join = (k) => (path ? `${path}.${k}` : k);
      if (Array.isArray(x) && Array.isArray(y) && sameRows(x, y)) {
        x.forEach((row, i) => walk(row, y[i], join(`#${row.id}`)));
      } else if (isObj(x) && isObj(y) && ![...Object.keys(x), ...Object.keys(y)].some((k) => k.includes('.') || k.startsWith('#'))) {
        new Set([...Object.keys(x), ...Object.keys(y)]).forEach((k) => walk(x[k], y[k], join(k)));
      } else {
        out.push({ path, op: 'set', value: copy(y) });
      }
    };
    walk(a, b, '');
    return out;
  }

  // A patch read from a file: only well-formed changes, and no paths that could reach past the plan.
  function cleanPatch(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 1000).filter((c) => isObj(c) && typeof c.path === 'string' && c.path.length <= 200
      && c.path.split('.').every((k) => k && !BAD_KEYS.includes(k) && !BAD_KEYS.includes(k.slice(1)))
      && (c.op === 'set' || (c.op === 'add' && typeof c.value === 'number' && Number.isFinite(c.value))))
      .map((c) => ({ path: c.path, op: c.op, value: copy(c.value) }));
  }

  // Row ids in a patch's paths → today's positions in `base`. Changes to rows it no longer has are dropped.
  function resolve(base, patch) {
    return patch.map((c) => {
      let at = base;
      const keys = c.path.split('.').map((k) => {
        let key = k;
        if (k.startsWith('#')) {
          const i = Array.isArray(at) ? at.findIndex((x) => isObj(x) && x.id === k.slice(1)) : -1;
          if (i < 0) return null;
          key = String(i);
        }
        at = at == null ? undefined : at[key];
        return key;
      });
      return keys.includes(null) ? null : { ...c, path: keys.join('.') };
    }).filter(Boolean);
  }

  // The baseline with a scenario's patch made, cleaned up like any plan.
  function materialise(base, patch) {
    return FP.profile.normalise(FP.patch.applyPatch(base, resolve(base, patch || [])));
  }

  /*
   * Brings patches and profiles back into step after edits. A scenario whose
   * profile changed since the last sync was edited: its patch becomes what
   * now differs from the baseline. Otherwise, if the baseline changed, the
   * scenario is the new baseline plus its patch.
   */
  const seen = new WeakMap(); // scenario → its profile as JSON at the last sync
  function sync(ws) {
    const [base, ...others] = ws.scenarios;
    if (!base) return ws;
    const baseJson = JSON.stringify(base.profile);
    const baseChanged = seen.get(base) !== baseJson;
    delete base.patch;
    others.forEach((sc) => {
      if (!Array.isArray(sc.patch) || seen.get(sc) !== JSON.stringify(sc.profile)) sc.patch = diffPatch(base.profile, sc.profile);
      else if (baseChanged) sc.profile = materialise(base.profile, sc.patch);
      seen.set(sc, JSON.stringify(sc.profile));
    });
    seen.set(base, baseJson);
    return ws;
  }

  // The workspace as it's saved and exported: the baseline's profile and every other scenario's patch.
  function toSaved(ws) {
    sync(ws);
    return {
      activeId: ws.activeId,
      scenarios: ws.scenarios.map((sc, i) => (i === 0
        ? { id: sc.id, name: sc.name, profile: sc.profile }
        : { id: sc.id, name: sc.name, patch: sc.patch })),
      checkins: ws.checkins,
    };
  }

  function fromProfile(profile, name) {
    const id = newId();
    return { activeId: id, scenarios: [{ id, name: cleanName(name, 'Baseline'), profile }], checkins: FP.checkins.normalise(null) };
  }

  // Anything → valid workspace. Older saves are upgraded first, by FP.migrate.
  function normalise(input) {
    const src = input && typeof input === 'object' ? input : {};
    if (!Array.isArray(src.scenarios)) return fromProfile(FP.profile.blank());
    const ids = new Set();
    let base = null;
    const scenarios = src.scenarios
      .filter((s) => s && typeof s === 'object')
      .slice(0, MAX_SCENARIOS)
      .map((s, i) => {
        let id = typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newId();
        if (ids.has(id)) id = newId();
        ids.add(id);
        // A scenario is the baseline plus its patch (or, held in memory, a whole profile).
        const profile = i === 0 || isObj(s.profile) ? FP.profile.normalise(s.profile) : materialise(base, cleanPatch(s.patch));
        if (i === 0) base = profile;
        return { id, name: cleanName(s.name, i === 0 ? 'Baseline' : `Scenario ${i + 1}`), profile };
      });
    if (!scenarios.length) return fromProfile(FP.profile.blank());
    const activeId = scenarios.some((s) => s.id === src.activeId) ? src.activeId : scenarios[0].id;
    // Your check-in history belongs to the workspace, not to one scenario.
    return sync({ activeId, scenarios, checkins: FP.checkins.normalise(src.checkins) });
  }

  function find(ws, id) {
    return ws.scenarios.find((s) => s.id === id) || null;
  }

  function active(ws) {
    return find(ws, ws.activeId) || ws.scenarios[0];
  }

  function isBaseline(ws, id) {
    return ws.scenarios[0] && ws.scenarios[0].id === id;
  }

  function uniqueName(ws, name) {
    const taken = new Set(ws.scenarios.map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i += 1) {
      const candidate = `${name.slice(0, MAX_NAME - 4)} (${i})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  // Copy scenario `fromId` as a new scenario and make it active. Returns it, or null at the limit.
  function clone(ws, fromId, name) {
    if (ws.scenarios.length >= MAX_SCENARIOS) return null;
    const source = find(ws, fromId) || active(ws);
    const copy = {
      id: newId(),
      name: uniqueName(ws, cleanName(name, `Copy of ${source.name}`)),
      profile: JSON.parse(JSON.stringify(source.profile)),
    };
    ws.scenarios.push(copy);
    ws.activeId = copy.id;
    return copy;
  }

  function rename(ws, id, name) {
    const s = find(ws, id);
    if (!s) return false;
    const others = { scenarios: ws.scenarios.filter((x) => x.id !== id) };
    s.name = uniqueName(others, cleanName(name, s.name));
    return true;
  }

  // The baseline can't be deleted; deleting the active scenario activates the baseline.
  function remove(ws, id) {
    if (isBaseline(ws, id) || !find(ws, id)) return false;
    ws.scenarios = ws.scenarios.filter((s) => s.id !== id);
    if (ws.activeId === id) ws.activeId = ws.scenarios[0].id;
    return true;
  }

  /*
   * "Make this my plan": scenario `id` becomes the baseline, named Baseline,
   * and the old baseline is kept as "Previous plan (<dateText>)". The new
   * baseline is the one you're editing. Returns false for the baseline itself.
   */
  function makeBaseline(ws, id, dateText) {
    const chosen = find(ws, id);
    if (!chosen || isBaseline(ws, id)) return false;
    sync(ws);
    const old = ws.scenarios[0];
    // The new baseline is the old one plus its patch. The old baseline becomes
    // what differs from it; the others keep their own patches, now on the new one.
    old.patch = diffPatch(chosen.profile, old.profile);
    ws.scenarios.forEach((sc) => {
      if (sc !== old && sc !== chosen) sc.profile = materialise(chosen.profile, sc.patch);
      if (sc !== chosen) seen.set(sc, JSON.stringify(sc.profile));
    });
    const others = (except) => ({ scenarios: ws.scenarios.filter((x) => !except.includes(x)) });
    old.name = uniqueName(others([old, chosen]), cleanName(`Previous plan (${dateText})`, 'Previous plan'));
    chosen.name = uniqueName(others([chosen]), 'Baseline');
    ws.scenarios = [chosen].concat(ws.scenarios.filter((x) => x !== chosen));
    ws.activeId = chosen.id;
    sync(ws);
    return true;
  }

  function setActive(ws, id) {
    if (!find(ws, id)) return false;
    ws.activeId = id;
    return true;
  }

  /*
   * What differs between two profiles, in plain terms:
   * [{ label, from, to, kind: 'money' | 'pct' | 'number' | 'text' | 'note' }]
   * ('note' has no from/to: it just says the item changed.)
   * Lists (debts, spending, bonuses) are compared by their totals.
   */
  function differences(a, b) {
    const out = [];
    const push = (label, from, to, kind) => {
      if (from === to) return;
      if (typeof from === 'number' && typeof to === 'number' && Math.abs(from - to) < 1e-9) return;
      out.push({ label, from, to, kind });
    };
    const optionLabel = (options, v) => (options.find((o) => o.value === v) || { label: v == null ? 'Not set' : String(v) }).label;

    FP.profile.SECTIONS.forEach((sec) => sec.fields.forEach((f) => {
      if (f.path.startsWith('assumptions.')) return; // compared below
      const x = FP.profile.get(a, f.path);
      const y = FP.profile.get(b, f.path);
      if (f.options) push(f.label, optionLabel(f.options, x), optionLabel(f.options, y), 'text');
      else if (f.type === 'taxcode') push(f.label, x || 'Standard', y || 'Standard', 'text');
      else push(f.label, x, y, f.type === 'money' ? 'money' : 'number');
    }));

    const total = (list, key) => list.reduce((s, r) => s + (r[key] || 0), 0);
    push('Other debts (total owed)', total(a.debts, 'balance'), total(b.debts, 'balance'), 'money');
    push('Other debt payments (a month)', total(a.debts, 'monthlyPayment'), total(b.debts, 'monthlyPayment'), 'money');
    push('Monthly spending', total(a.spending, 'monthly'), total(b.spending, 'monthly'), 'money');
    push('Bonuses (a year)', total(a.income.bonuses, 'amount'), total(b.income.bonuses, 'amount'), 'money');
    const savingsOf = (p, type) => (p.savings || []).filter((x) => x.type === type).reduce((t, x) => t + (x.monthly || 0), 0);
    FP.profile.SAVING_TYPES.forEach((t) => push(`Regular saving: ${t.label} (a month)`, savingsOf(a, t.value), savingsOf(b, t.value), 'money'));
    // The split, in the unit each scenario uses (if they differ, that's the difference shown).
    const unit = (p) => ((p.leftover || {}).unit === 'gbp' ? 'gbp' : 'pct');
    if (unit(a) !== unit(b)) {
      push('Leftover money entered as', unit(a) === 'gbp' ? '\u00a3 a month' : '% of what\u2019s left', unit(b) === 'gbp' ? '\u00a3 a month' : '% of what\u2019s left', 'text');
    } else {
      FP.profile.LEFTOVER_FIELDS.forEach((f) => push(`Leftover money: ${f.label}${unit(a) === 'gbp' ? ' (a month)' : ''}`, (a.leftover || {})[f.key], (b.leftover || {})[f.key], unit(a) === 'gbp' ? 'money' : 'pct'));
    }
    push('Emergency fund target (months)', (a.leftover || {}).emergencyMonths, (b.leftover || {}).emergencyMonths, 'number');
    push('Salary sacrifice (a month)', total(a.income.sacrifices, 'monthly'), total(b.income.sacrifices, 'monthly'), 'money');
    // What each pot is invested in, for pots both scenarios have.
    const mixesOf = (p) => new Map(FP.mix.pots(p).map((x) => [x.id, x]));
    const pb = mixesOf(b);
    mixesOf(a).forEach((x, id) => {
      const y = pb.get(id);
      if (y && !FP.mix.sameMix(x.mix, y.mix)) push(`${x.label}: invested in`, FP.mix.describe(x.mix), FP.mix.describe(y.mix), 'text');
    });
    const timing = (p) => p.income.bonuses.filter((x) => x.amount > 0).map((x) => x.month).sort().join(',');
    if (timing(a) !== timing(b) && total(a.income.bonuses, 'amount') === total(b.income.bonuses, 'amount')) {
      out.push({ label: 'Bonus months', kind: 'note' });
    }

    FP.assumptions.DEFS.forEach((d) => {
      const x = a.assumptions[d.key];
      const y = b.assumptions[d.key];
      if (d.unit === 'choice') push(d.label, optionLabel(d.options, x), optionLabel(d.options, y), 'text');
      else push(d.label, x, y, d.unit === 'money' ? 'money' : d.unit.startsWith('pct') ? 'pct' : 'number');
    });
    return out;
  }

  const limit = (key) => FP.assumptions.def(key);
  const gbp = (n) => `\u00a3${Math.round(n).toLocaleString('en-GB')}`;

  /*
   * One-tap what-ifs, each a change to a copy of the baseline.
   * applies(p): whether it makes sense for this profile; patch(p): what it
   * changes, as an FP.patch patch.
   */
  const PRESETS = [
    {
      id: 'retireEarlier', label: 'Retire 2 years earlier',
      applies: (p) => p.about.age != null && p.assumptions.retirementAge - 2 > p.about.age && p.assumptions.retirementAge - 2 >= limit('retirementAge').min,
      name: (p) => `Retire at ${p.assumptions.retirementAge - 2}`,
      patch: () => [{ path: 'assumptions.retirementAge', op: 'add', value: -2 }],
    },
    {
      id: 'workLonger', label: 'Work 2 years longer',
      applies: (p) => p.about.age != null && p.assumptions.retirementAge + 2 < p.assumptions.endAge && p.assumptions.retirementAge + 2 <= limit('retirementAge').max,
      name: (p) => `Retire at ${p.assumptions.retirementAge + 2}`,
      patch: () => [{ path: 'assumptions.retirementAge', op: 'add', value: 2 }],
    },
    {
      id: 'overpay', label: 'Overpay the mortgage £200 a month more',
      applies: (p) => (p.mortgage.balance || 0) > 0,
      name: (p) => `Overpay ${gbp((p.mortgage.monthlyOverpayment || 0) + 200)} a month`,
      patch: () => [{ path: 'mortgage.monthlyOverpayment', op: 'add', value: 200 }],
    },
    {
      id: 'spendLess', label: 'Spend 10% less',
      applies: (p) => p.spending.some((r) => r.monthly > 0),
      name: () => 'Spend 10% less',
      patch: (p) => p.spending.map((r, i) => ({ path: `spending.${i}.monthly`, op: 'set', value: Math.round((r.monthly || 0) * 0.9) })),
    },
    {
      id: 'payRise', label: '10% pay rise',
      applies: (p) => (p.income.grossSalary || 0) > 0,
      name: (p) => `Pay rise to ${gbp(p.income.grossSalary * 1.1)}`,
      patch: (p) => [{ path: 'income.grossSalary', op: 'set', value: Math.round(p.income.grossSalary * 1.1) }],
    },
    {
      id: 'weakerMarkets', label: 'Weaker markets (shares and bonds 2 points lower)',
      applies: (p) => p.assumptions.marketShift - 2 >= limit('marketShift').min,
      name: () => 'Weaker markets',
      patch: () => [{ path: 'assumptions.marketShift', op: 'add', value: -2 }],
    },
  ];

  // Adds `profile` as a new scenario without switching to it. Returns it, or null at the limit.
  function addProfile(ws, profile, name) {
    if (ws.scenarios.length >= MAX_SCENARIOS) return null;
    const sc = { id: newId(), name: uniqueName(ws, cleanName(name, 'What if')), profile: FP.profile.normalise({ ...profile, isSample: false }) };
    ws.scenarios.push(sc);
    return sc;
  }

  // Adds a what-if as a copy of the baseline, keeping the scenario you're on. Returns it, or null.
  function fromPreset(ws, presetId) {
    const preset = PRESETS.find((x) => x.id === presetId);
    const base = ws.scenarios[0];
    if (!preset || !preset.applies(base.profile) || ws.scenarios.length >= MAX_SCENARIOS) return null;
    const keep = ws.activeId;
    const copy = clone(ws, base.id, preset.name(base.profile));
    copy.profile = FP.patch.applyPatch(copy.profile, preset.patch(base.profile));
    copy.profile.isSample = false;
    ws.activeId = keep;
    return copy;
  }

  FP.scenarios = {
    MAX_SCENARIOS, PRESETS, fromProfile, normalise, find, active, isBaseline,
    clone, fromPreset, addProfile, rename, remove, setActive, makeBaseline, differences,
    diffPatch, cleanPatch, materialise, sync, toSaved,
  };
})(globalThis.FP = globalThis.FP || {});
