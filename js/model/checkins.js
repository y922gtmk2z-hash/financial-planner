/*
 * Check-ins: now and then you update today's balances, and the planner keeps a
 * snapshot, so Progress can compare what you have with what the plan expected.
 * Pure: no DOM, no storage.
 *
 * workspace.checkins = {
 *   snapshots: [{ date: 'YYYY-MM-DD', balances, netWorth, savingsAndPensions,
 *                 planned: { savingsAndPensions, netWorth } | null, applied: [idea id] }],
 *   projection: { from: date, points: [{ date, savingsAndPensions, netWorth }] } | null,
 * }
 * balances = { cash, isa, gia, pension (your main pot), pots: [{ id ('partner', or
 *   the other pension's id), name, value }], mortgage, debts: [{ id, name, balance }] }.
 * pots (since version 12): your partner's main pot and each other pension pot.
 * planned is what the plan projected for that date at the previous check-in;
 * projection is the plan's path from the latest check-in, for the next one.
 * Every snapshot is kept for 24 months, then one per quarter.
 */
(function (FP) {
  'use strict';

  const RECENT_MONTHS = 24;
  const MAX_SNAPSHOTS = 200;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const empty = () => ({ snapshots: [], projection: null });

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e10 ? v : 0);
  const isDate = (d) => typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  const ms = (d) => Date.parse(`${d}T00:00:00Z`);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const sum = (list, f) => list.reduce((t, x) => t + f(x), 0);

  // Today's balances in a profile.
  function balancesOf(p) {
    return {
      cash: p.assets.cashSavings || 0,
      isa: p.assets.isa || 0,
      gia: p.assets.gia || 0,
      pension: p.assets.pension || 0,
      pots: potsOf(p),
      mortgage: p.mortgage.balance || 0,
      debts: (p.debts || []).map((d) => ({ id: d.id, name: d.name || '', balance: d.balance || 0 })),
    };
  }

  // Pension pots besides your main one: your partner's, then each other pot (not defined benefit pensions).
  function potsOf(p) {
    return (p.partner ? [{ id: 'partner', name: `${FP.profile.capital(FP.profile.whose(p, 1))} workplace pension`, value: p.partner.pension || 0 }] : [])
      .concat((p.pensions || []).filter((x) => x.type === 'dc').map((x) => ({ id: x.id, name: x.name || 'Other pension', value: x.value || 0 })));
  }

  // Puts balances into a profile (debts and pots matched by id; others left as they are).
  function setBalances(p, b) {
    p.assets.cashSavings = b.cash;
    p.assets.isa = b.isa;
    p.assets.gia = b.gia;
    p.assets.pension = b.pension;
    (b.pots || []).forEach((x) => {
      if (x.id === 'partner') { if (p.partner) p.partner.pension = x.value; return; }
      const pot = (p.pensions || []).find((y) => y.id === x.id);
      if (pot) pot.value = x.value;
    });
    p.mortgage.balance = b.mortgage;
    (b.debts || []).forEach((x) => {
      const d = (p.debts || []).find((y) => y.id === x.id);
      if (d) d.balance = x.balance;
    });
    return p;
  }

  // Every pension pot together: your main one and the others.
  const pensionTotal = (b) => b.pension + sum(b.pots || [], (x) => x.value);
  const savingsAndPensions = (b) => b.cash + b.isa + b.gia + pensionTotal(b);

  /*
   * The plan's path from `date`: end-of-year balances from the projection (to
   * the end age), in the pounds of each year, so they compare with what you'll
   * actually have then.
   */
  function pathFrom(profile, date) {
    const r = FP.projection.project(profile, { maxYears: profile.assumptions.endAge - profile.about.age });
    if (!r.ok) return null;
    const [y, m, d] = date.split('-').map(Number);
    return {
      from: date,
      points: r.rows.map((row) => ({
        date: iso(Date.UTC(y + row.y, m - 1, d)),
        savingsAndPensions: Math.round(row.cash + row.isa + row.gia + row.pension),
        netWorth: Math.round(row.netWorth),
      })),
    };
  }

  // What that path expected on `date` (between two points, in proportion), or null.
  function plannedAt(path, date) {
    if (!path || !path.points.length || !isDate(date)) return null;
    const t = ms(date);
    const pts = path.points;
    if (t < ms(pts[0].date) || t > ms(pts[pts.length - 1].date)) return null;
    const i = pts.findIndex((x) => ms(x.date) >= t);
    if (ms(pts[i].date) === t || i === 0) return { savingsAndPensions: pts[i].savingsAndPensions, netWorth: pts[i].netWorth };
    const a = pts[i - 1];
    const b = pts[i];
    const f = (t - ms(a.date)) / (ms(b.date) - ms(a.date));
    const mix = (k) => Math.round(a[k] + (b[k] - a[k]) * f);
    return { savingsAndPensions: mix('savingsAndPensions'), netWorth: mix('netWorth') };
  }

  // Every snapshot from the last 24 months; before that, the latest in each quarter.
  function thin(snapshots, today) {
    const [y, m, d] = today.split('-').map(Number);
    const cutoff = ms(iso(Date.UTC(y, m - 1 - RECENT_MONTHS, d)));
    const sorted = snapshots.slice().sort((x, z) => ms(x.date) - ms(z.date));
    const quarter = (date) => `${date.slice(0, 4)}Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3)}`;
    const lastInQuarter = new Map();
    sorted.forEach((s) => { if (ms(s.date) < cutoff) lastInQuarter.set(quarter(s.date), s); });
    const kept = sorted.filter((s) => ms(s.date) >= cutoff || lastInQuarter.get(quarter(s.date)) === s);
    return kept.slice(-MAX_SNAPSHOTS);
  }

  /*
   * Saves a check-in on `date` with `balances`: every scenario takes the new
   * balances (they're facts, not what-ifs), and a snapshot of your plan (the
   * Baseline) is kept. A second check-in on the same day replaces the first.
   * Returns the snapshot.
   */
  function record(ws, date, balances) {
    ws.checkins = normalise(ws.checkins);
    ws.scenarios.forEach((sc) => setBalances(sc.profile, balances));
    const plan = ws.scenarios[0].profile;
    const c = ws.checkins;
    const same = c.snapshots.find((s) => s.date === date);
    const pay = FP.tax.household(plan);
    const snap = {
      date,
      balances: JSON.parse(JSON.stringify(balances)),
      netWorth: Math.round(FP.summary.compute(plan, pay.takeHomeMonthly).netWorth),
      savingsAndPensions: Math.round(savingsAndPensions(balances)),
      // From the plan as it was at the previous check-in (kept if you check in twice in a day).
      planned: same ? same.planned : plannedAt(c.projection, date),
      applied: Object.keys(plan.ideas || {}).filter((k) => plan.ideas[k] === 'applied').sort(),
    };
    c.snapshots = thin(c.snapshots.filter((s) => s !== same).concat(snap), date);
    c.projection = pathFrom(plan, date);
    return snap;
  }

  const latest = (ws) => {
    const s = ws && ws.checkins ? ws.checkins.snapshots : [];
    return s.length ? s[s.length - 1] : null;
  };

  // Days since your last check-in (on `today`), or null if you haven't checked in.
  function daysSince(ws, today) {
    const l = latest(ws);
    return l ? Math.floor((ms(today) - ms(l.date)) / 86400000) : null;
  }

  /*
   * What changed between your last two check-ins: { from, to, netWorth (change),
   * debtsPaid (mortgage and debts paid down), applied (ideas applied since) },
   * or null with fewer than two.
   */
  function sinceLast(ws) {
    const s = (ws.checkins || empty()).snapshots;
    if (s.length < 2) return null;
    const a = s[s.length - 2];
    const b = s[s.length - 1];
    const owed = (x) => x.balances.mortgage + sum(x.balances.debts, (d) => d.balance);
    return {
      from: a.date,
      to: b.date,
      netWorth: b.netWorth - a.netWorth,
      debtsPaid: owed(a) - owed(b),
      applied: b.applied.filter((id) => !a.applied.includes(id)),
    };
  }

  // Anything (a save, an import) → valid check-ins.
  function normalise(src) {
    if (!src || typeof src !== 'object') return empty();
    const snap = (s) => {
      if (!s || typeof s !== 'object' || !isDate(s.date)) return null;
      const b = s.balances && typeof s.balances === 'object' ? s.balances : {};
      const balances = {
        cash: num(b.cash), isa: num(b.isa), gia: num(b.gia), pension: num(b.pension), mortgage: num(b.mortgage),
        pots: (Array.isArray(b.pots) ? b.pots : []).filter((x) => x && typeof x === 'object').slice(0, 20)
          .map((x) => ({ id: String(x.id || '').slice(0, 40), name: String(x.name || '').slice(0, 60), value: num(x.value) })),
        debts: (Array.isArray(b.debts) ? b.debts : []).filter((d) => d && typeof d === 'object').slice(0, 20)
          .map((d) => ({ id: String(d.id || '').slice(0, 40), name: String(d.name || '').slice(0, 60), balance: num(d.balance) })),
      };
      const p = s.planned && typeof s.planned === 'object' ? { savingsAndPensions: num(s.planned.savingsAndPensions), netWorth: num(s.planned.netWorth) } : null;
      return {
        date: s.date,
        balances,
        netWorth: num(s.netWorth),
        savingsAndPensions: num(s.savingsAndPensions),
        planned: p,
        applied: (Array.isArray(s.applied) ? s.applied : []).filter((x) => typeof x === 'string' && /^[a-zA-Z]{1,30}$/.test(x)).slice(0, 40),
      };
    };
    const snapshots = (Array.isArray(src.snapshots) ? src.snapshots : []).map(snap).filter(Boolean)
      .sort((x, z) => ms(x.date) - ms(z.date)).slice(-MAX_SNAPSHOTS);
    const pr = src.projection;
    const projection = pr && typeof pr === 'object' && isDate(pr.from) && Array.isArray(pr.points)
      ? {
        from: pr.from,
        points: pr.points.filter((x) => x && isDate(x.date)).slice(0, 120)
          .map((x) => ({ date: x.date, savingsAndPensions: num(x.savingsAndPensions), netWorth: num(x.netWorth) })),
      }
      : null;
    return { snapshots, projection };
  }

  FP.checkins = { RECENT_MONTHS, balancesOf, setBalances, potsOf, pensionTotal, savingsAndPensions, pathFrom, plannedAt, thin, record, latest, daysSince, sinceLast, normalise };
})(globalThis.FP = globalThis.FP || {});
