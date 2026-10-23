/* Compound growth and inflation helpers. Pure functions, no DOM. Rates are % a year. */
(function (FP) {
  'use strict';

  // Value after `years` of compound growth at `ratePct` a year.
  function compound(value, ratePct, years) {
    return value * Math.pow(1 + (ratePct || 0) / 100, years);
  }

  // Growth after fees, e.g. 5% return minus 0.4% fees = 4.6%.
  function netRate(grossPct, feePct) {
    return (grossPct || 0) - (feePct || 0);
  }

  // How much prices have risen after `years` (1 = no change).
  function inflationFactor(inflationPct, years) {
    return compound(1, inflationPct, years);
  }

  // A future (nominal) amount in today's money.
  function toReal(nominal, inflationPct, years) {
    return nominal / inflationFactor(inflationPct, years);
  }

  FP.growth = { compound, netRate, inflationFactor, toReal };
})(globalThis.FP = globalThis.FP || {});
