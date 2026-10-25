/*
 * What each pot is invested in: its mix of shares, bonds and cash, and the
 * growth and size of falls that come from it. Pure functions, no DOM.
 *
 * mix = { shares, bonds, cash }: percentages adding up to 100.
 * Pots with a mix: your ISAs (mixes.isa), other investments (mixes.gia), your
 * pension (mixes.pension), your partner's pension (partner.pensionMix) and
 * each other pension pot (pensions.N.mix). Defined benefit pensions have none.
 *
 * The model mixes are illustrations for people with each risk level, not
 * recommendations for anyone: no products, providers or funds.
 */
(function (FP) {
  'use strict';

  const A = FP.assumptions;
  const KEYS = A.MIX_KEYS;
  const LEVELS = ['cautious', 'balanced', 'adventurous'];
  // Shown beside every model mix.
  const NOTICE = 'An illustration for people with this risk level, not a recommendation for you. Consider regulated advice.';
  // About 1 year in 20 is worse than this many volatilities below the average.
  const BAD_YEAR_Z = 1.645;

  const copy = (m) => ({ shares: m.shares, bonds: m.bonds, cash: m.cash });
  const defaultMix = () => copy(A.DEFAULT_MIX);
  const sameMix = (x, y) => !!x && !!y && KEYS.every((k) => Math.abs((x[k] || 0) - (y[k] || 0)) < 0.05);

  // A valid mix (each 0-100, adding up to 100), or null. The data model owns the shape.
  const clean = (m) => FP.profile.cleanMix(m);

  // This year's returns for each asset class, % a year before fees: the
  // assumptions, with the market shift on shares and bonds.
  function returnsOf(a) {
    const shift = a.marketShift || 0;
    return { shares: a.sharesReturn + shift, bonds: a.bondsReturn + shift, cash: a.cashReturn };
  }

  // A mix's growth, % a year before fees, at `r` ({ shares, bonds, cash }).
  // Worked out in whole percentages first, so 40% at 6.5% and 60% at 4% is exactly 5.
  function grossRate(mix, r) {
    const m = mix || A.DEFAULT_MIX;
    return (m.shares * r.shares + m.bonds * r.bonds + m.cash * r.cash) / 100;
  }

  // The fees taken off a kind of pot: 'invest' (ISAs and other investments) or 'pension'.
  const feeOf = (a, kind) => (kind === 'pension' ? a.pensionFees : a.investmentFees) || 0;

  // A pot's growth after fees, % a year, on the assumptions.
  function netRate(mix, a, kind) {
    return FP.growth.netRate(grossRate(mix, returnsOf(a)), feeOf(a, kind));
  }

  // How much a mix's yearly return varies, % (taking the three to move
  // together, which if anything overstates it).
  function volatility(mix, a) {
    const m = mix || A.DEFAULT_MIX;
    return (m.shares * a.sharesVolatility + m.bonds * a.bondsVolatility + m.cash * a.cashVolatility) / 100;
  }

  /*
   * Growth against the size of falls for a mix: { growth, fall, volatility }.
   * growth: average % a year (after the pot's fees, or before fees without a
   * kind); fall: how far it could fall in a bad year, about 1 in 20 (0 if it
   * wouldn't fall), as a positive %.
   */
  function tradeOff(mix, a, kind) {
    const growth = kind ? netRate(mix, a, kind) : grossRate(mix, returnsOf(a));
    const vol = volatility(mix, a);
    return { growth, volatility: vol, fall: Math.max(0, BAD_YEAR_Z * vol - growth) };
  }

  // "Grows about 4.6% a year after fees on average. In a bad year (about 1 in 20) it could fall by about 12%."
  function tradeOffText(mix, a, kind) {
    const t = tradeOff(mix, a, kind);
    const growth = `${t.growth < 0 ? 'Shrinks' : 'Grows'} about ${(Math.round(Math.abs(t.growth) * 10) / 10).toFixed(1)}% a year ${kind ? 'after fees' : 'before fees'} on average.`;
    const fall = Math.round(t.fall);
    return `${growth} ${fall >= 1 ? `In a bad year (about 1 in 20) it could fall by about ${fall}%.` : 'It’s unlikely to fall much in a year.'}`;
  }

  // "40% shares, 60% bonds" (parts at 0% left out).
  function describe(mix) {
    const m = mix || A.DEFAULT_MIX;
    const parts = KEYS.filter((k) => m[k] > 0).map((k) => `${Math.round(m[k] * 10) / 10}% ${k}`);
    return parts.length ? parts.join(', ') : 'nothing';
  }

  // The model mix for a risk level ('cautious', 'balanced', 'adventurous'), or null.
  function model(level) {
    return LEVELS.includes(level) ? copy(A.MODEL_MIXES[level]) : null;
  }

  /*
   * Every pot that has a mix: [{ id, path (of its mix), valuePath, label,
   * short (its name mid-sentence), kind ('invest' | 'pension'), owner (0 you,
   * 1 your partner), value, mix }].
   * Your ISAs and pension are always listed; other investments and other pots
   * once they have a value.
   */
  function pots(p) {
    const whose = (i) => FP.profile.capital(FP.profile.whose(p, i));
    const mixes = p.mixes || {};
    const out = [
      { id: 'pension', path: 'mixes.pension', valuePath: 'assets.pension', label: p.partner ? 'Your pension pots' : 'Pension pots', short: 'pension', kind: 'pension', owner: 0, value: p.assets.pension || 0, mix: mixes.pension },
    ];
    if (p.partner) {
      out.push({ id: 'partnerPension', path: 'partner.pensionMix', valuePath: 'partner.pension', label: `${whose(1)} pension pots`, short: `${FP.profile.whose(p, 1)} pension`, kind: 'pension', owner: 1, value: p.partner.pension || 0, mix: p.partner.pensionMix });
    }
    out.push({ id: 'isa', path: 'mixes.isa', valuePath: 'assets.isa', label: 'Investments in ISAs', short: 'ISAs', kind: 'invest', owner: 0, value: p.assets.isa || 0, mix: mixes.isa });
    out.push({ id: 'gia', path: 'mixes.gia', valuePath: 'assets.gia', label: 'Other investments', short: 'other investments', kind: 'invest', owner: 0, value: p.assets.gia || 0, mix: mixes.gia });
    (p.pensions || []).forEach((x, i) => {
      if (x.type !== 'dc') return;
      out.push({ id: `pot${i}`, path: `pensions.${i}.mix`, valuePath: `pensions.${i}.value`, label: x.name || `Pension ${i + 1}`, short: x.name || `pension ${i + 1}`, kind: 'pension', owner: x.owner === 'partner' && p.partner ? 1 : 0, value: x.value || 0, mix: x.mix });
    });
    return out.map((x) => ({ ...x, mix: clean(x.mix) || defaultMix() }));
  }

  // Pots worth showing a mix for: your pension and ISAs, and anything with money in it.
  const shownPots = (p) => pots(p).filter((x) => x.value > 0 || x.id === 'pension' || x.id === 'isa');

  // The change that gives one pot (by its mix path) the model mix for `level`.
  function usePatch(path, level) {
    const m = model(level);
    return m ? [{ path, op: 'set', value: m }] : null;
  }

  // The change that gives every pot you have money in (and your pension and
  // ISAs) the model mix for `level`, or null when they all have it already.
  function useAllPatch(p, level) {
    const m = model(level);
    if (!m) return null;
    const list = shownPots(p).filter((x) => !sameMix(x.mix, m));
    return list.length ? list.map((x) => ({ path: x.path, op: 'set', value: copy(m) })) : null;
  }

  /*
   * For upgrading saves from before mixes, which had one growth rate for ISAs
   * and other investments (`invest`) and one for pensions (`pension`), both
   * before fees. Finds mixes, a market shift and (only if needed) shares and
   * bonds returns that give exactly those rates:
   * { invest: mix, pension: mix, marketShift, sharesReturn, bondsReturn }.
   * The same rate for both (the usual case, and the default 5%) keeps the
   * default mix, with any difference from 5% as the market shift.
   */
  function fromRates(invest, pension, a) {
    const S = a.sharesReturn;
    const B = a.bondsReturn;
    const base = grossRate(A.DEFAULT_MIX, { shares: S, bonds: B, cash: a.cashReturn });
    const out = { invest: defaultMix(), pension: defaultMix(), marketShift: 0, sharesReturn: S, bondsReturn: B };
    if (invest === pension) {
      out.marketShift = Math.round((invest - base) * 1e9) / 1e9;
      return out;
    }
    const lo = Math.min(invest, pension);
    const hi = Math.max(invest, pension);
    // Shares and bonds only (no cash): a rate r is (r - B - d) / (S - B) shares.
    const mixAt = (r, s, b, d) => {
      const shares = Math.round(((r - d - b) / (s - b)) * 100 * 1e6) / 1e6;
      return { shares, bonds: Math.round((100 - shares) * 1e6) / 1e6, cash: 0 };
    };
    if (hi - lo <= S - B) {
      const inRange = lo >= B && hi <= S;
      const d = inRange ? 0 : Math.min(lo - B, Math.max(hi - S, (lo + hi) / 2 - base));
      out.marketShift = Math.round(d * 1e9) / 1e9;
      out.invest = mixAt(invest, S, B, d);
      out.pension = mixAt(pension, S, B, d);
      return out;
    }
    // Too far apart for one mix of shares and bonds: the lower rate is all
    // bonds and the higher all shares.
    out.bondsReturn = lo;
    out.sharesReturn = hi;
    out.invest = mixAt(invest, hi, lo, 0);
    out.pension = mixAt(pension, hi, lo, 0);
    return out;
  }

  FP.mix = {
    LEVELS, NOTICE, BAD_YEAR_Z, defaultMix, sameMix, clean, returnsOf, grossRate, netRate, feeOf, volatility,
    tradeOff, tradeOffText, describe, model, pots, shownPots, usePatch, useAllPatch, fromRates,
  };
})(globalThis.FP = globalThis.FP || {});
