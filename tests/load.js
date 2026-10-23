// Loads the browser scripts into Node's global FP namespace, in page order.
const path = require('node:path');

const FILES = [
  'js/config/assumptions.js',
  'js/model/profile.js',
  'js/model/sample.js',
  'js/model/store.js',
  'js/calc/mortgage.js',
  'js/calc/summary.js',
];

FILES.forEach((f) => require(path.join(__dirname, '..', f)));

module.exports = globalThis.FP;
