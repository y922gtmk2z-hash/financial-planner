/*
 * Scenarios. A workspace holds one or more scenarios; each scenario is a full,
 * independent copy of the profile (every input and assumption), so anything can
 * differ between them. The first scenario is the baseline. Every screen edits
 * the active scenario.
 *
 * workspace = { activeId, scenarios: [{ id, name, profile }] }
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

  function fromProfile(profile, name) {
    const id = newId();
    return { activeId: id, scenarios: [{ id, name: cleanName(name, 'Baseline'), profile }] };
  }

  // Anything (a save, an import, an older single-profile save) → valid workspace.
  function normalise(input) {
    const src = input && typeof input === 'object' ? input : {};
    if (!Array.isArray(src.scenarios)) {
      return fromProfile(FP.profile.normalise(src.profile || {}));
    }
    const seen = new Set();
    const scenarios = src.scenarios
      .filter((s) => s && typeof s === 'object')
      .slice(0, MAX_SCENARIOS)
      .map((s, i) => {
        let id = typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newId();
        if (seen.has(id)) id = newId();
        seen.add(id);
        return { id, name: cleanName(s.name, i === 0 ? 'Baseline' : `Scenario ${i + 1}`), profile: FP.profile.normalise(s.profile) };
      });
    if (!scenarios.length) return fromProfile(FP.profile.blank());
    const activeId = scenarios.some((s) => s.id === src.activeId) ? src.activeId : scenarios[0].id;
    return { activeId, scenarios };
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

  const gbp = (n) => `\u00a3${Math.round(n).toLocaleString('en-GB')}`;

  /*
   * One-tap what-ifs, each a change to a copy of the baseline.
   * applies(p): whether it makes sense for this profile; apply(p) changes the copy.
   */
  const PRESETS = [
    {
      id: 'retireEarlier', label: 'Retire 2 years earlier',
      applies: (p) => p.about.age != null && p.assumptions.retirementAge - 2 > p.about.age,
      name: (p) => `Retire at ${p.assumptions.retirementAge - 2}`,
      apply: (p) => { p.assumptions.retirementAge -= 2; },
    },
    {
      id: 'workLonger', label: 'Work 2 years longer',
      applies: (p) => p.about.age != null && p.assumptions.retirementAge + 2 < p.assumptions.endAge,
      name: (p) => `Retire at ${p.assumptions.retirementAge + 2}`,
      apply: (p) => { p.assumptions.retirementAge += 2; },
    },
    {
      id: 'overpay', label: 'Overpay the mortgage £200 a month more',
      applies: (p) => (p.mortgage.balance || 0) > 0,
      name: (p) => `Overpay ${gbp((p.mortgage.monthlyOverpayment || 0) + 200)} a month`,
      apply: (p) => { p.mortgage.monthlyOverpayment = (p.mortgage.monthlyOverpayment || 0) + 200; },
    },
    {
      id: 'spendLess', label: 'Spend 10% less',
      applies: (p) => p.spending.some((r) => r.monthly > 0),
      name: () => 'Spend 10% less',
      apply: (p) => { p.spending.forEach((r) => { r.monthly = Math.round((r.monthly || 0) * 0.9); }); },
    },
    {
      id: 'payRise', label: '10% pay rise',
      applies: (p) => (p.income.grossSalary || 0) > 0,
      name: (p) => `Pay rise to ${gbp(p.income.grossSalary * 1.1)}`,
      apply: (p) => { p.income.grossSalary = Math.round(p.income.grossSalary * 1.1); },
    },
    {
      id: 'weakerMarkets', label: 'Weaker markets (returns 2 points lower)',
      applies: () => true,
      name: () => 'Weaker markets',
      apply: (p) => {
        p.assumptions.investmentReturn -= 2;
        p.assumptions.pensionGrowth -= 2;
      },
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
    preset.apply(copy.profile);
    copy.profile.isSample = false;
    ws.activeId = keep;
    return copy;
  }

  FP.scenarios = {
    MAX_SCENARIOS, PRESETS, fromProfile, normalise, find, active, isBaseline,
    clone, fromPreset, addProfile, rename, remove, setActive, differences,
  };
})(globalThis.FP = globalThis.FP || {});
