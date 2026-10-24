// Loads the browser scripts into Node's global FP namespace, in page order.
const path = require('node:path');

const FILES = [
  'js/config/assumptions.js',
  'js/config/tax-2026-27.js',
  'js/model/profile.js',
  'js/model/scenarios.js',
  'js/model/sample.js',
  'js/model/store.js',
  'js/calc/mortgage.js',
  'js/calc/summary.js',
  'js/calc/tax.js',
  'js/calc/studentloan.js',
  'js/calc/savings.js',
  'js/calc/growth.js',
  'js/calc/projection.js',
  'js/calc/compare.js',
  'js/calc/suggest.js',
  'js/calc/outcomes.js',
];

FILES.forEach((f) => require(path.join(__dirname, '..', f)));

module.exports = globalThis.FP;
