// Sense checks (js/ui/welcome.js): figures typed in the wrong period, and ones that can't be right.
const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

// The checks only build elements when a screen draws them, so they load in Node.
require('../js/ui/dom.js');
require('../js/ui/welcome.js');

const quick = () => {
  const p = FP.profile.normalise({ about: { age: 38 }, income: { grossSalary: 85000 }, outgoings: { estimate: 3200 }, assumptions: { retirementAge: 60 }, goals: { retirementIncome: 3000 } });
  FP.summary.syncOutgoings(p);
  return p;
};
const check = (path, p) => FP.welcome.senseCheck(path, () => p);

test('the quick-start persona passes every check', () => {
  assert.deepEqual(FP.welcome.failedChecks(quick()), []);
});

test('£40,000 a month in retirement asks whether it was a yearly figure', () => {
  const p = quick();
  const c = check('goals.retirementIncome', p)(40000);
  assert.equal(c.error, undefined);
  assert.match(c.text, /That’s £480,000 a year\. Did you mean £40,000 a year \(£3,333 a month\)\?/);
  p.goals.retirementIncome = 40000;
  assert.deepEqual(FP.welcome.failedChecks(p).map((x) => [x.path, x.error]), [['goals.retirementIncome', false]]);
});

test('retirement spending over £100,000 a month is an error, not a question', () => {
  const p = quick();
  assert.equal(check('goals.retirementIncome', p)(100000).error, undefined);
  assert.match(check('goals.retirementIncome', p)(100001).error, /More than £100,000 a month can’t be right/);
});

test('outgoings over £200,000 a month are an error, not a question', () => {
  const p = quick();
  assert.ok(check('outgoings.estimate', p)(200000).text, 'still asks');
  assert.equal(check('outgoings.estimate', p)(200000).error, undefined);
  assert.match(check('outgoings.estimate', p)(200001).error, /More than £200,000 a month can’t be right/);
});

test('an impossible figure saved before it was refused shows on Plan as one to check', () => {
  const p = quick();
  p.outgoings.estimate = 250000;
  const failed = FP.welcome.failedChecks(p);
  assert.deepEqual(failed.map((x) => [x.path, x.label, x.shown, x.error]), [['outgoings.estimate', 'Everything going out each month', '£250,000 a month', true]]);
});

test('your partner’s salary is checked too, by name', () => {
  const p = quick();
  FP.profile.addPartner(p);
  p.partner.name = 'Sam';
  p.partner.income.grossSalary = 500;
  const failed = FP.welcome.failedChecks(p);
  assert.deepEqual(failed.map((x) => [x.path, x.label]), [['partner.income.grossSalary', 'Sam’s salary']]);
});
