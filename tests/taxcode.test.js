const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const T = FP.tax;

function input(salary, taxCode, extra) {
  return { salary, bonuses: [], employeePensionPct: 0, employerPensionPct: 0, pensionMethod: 'netPay', studentLoanPlan: 'none', region: 'rUK', taxCode, ...extra };
}

test('parsing tax codes', () => {
  assert.deepEqual(
    ['1257L', 's1257l', 'K475', 'BR', 'D0', 'SD2', '0T', 'NT', '1257L W1', 'C1257L', '1100M'].map((c) => {
      const r = T.parseTaxCode(c);
      return [r.code, r.kind, r.allowance ?? r.flat ?? null, r.region];
    }),
    [
      ['1257L', 'allowance', 12570, null],
      ['S1257L', 'allowance', 12570, 'scotland'],
      ['K475', 'allowance', -4750, null],
      ['BR', 'flat', 20, null],
      ['D0', 'flat', 40, null],
      ['SD2', 'flat', 45, 'scotland'],
      ['0T', 'zero', 0, null],
      ['NT', 'none', null, null],
      ['1257L W1', 'allowance', 12570, null],
      ['C1257L', 'allowance', 12570, 'rUK'],
      ['1100M', 'allowance', 11000, null],
    ]);
  assert.equal(T.parseTaxCode('').empty, true);
  assert.equal(T.parseTaxCode('ABC').ok, false);
  assert.equal(T.parseTaxCode('D2').ok, false); // Scotland only
  assert.equal(FP.profile.parseValue(FP.profile.fieldFor('income.taxCode'), ' s1257l ').value, 'S1257L');
  assert.equal(FP.profile.parseValue(FP.profile.fieldFor('income.taxCode'), 'nonsense').ok, false);
});

test('1257L matches the standard calculation; a lower code taxes more', () => {
  const std = T.takeHome(input(40000, ''));
  close(T.takeHome(input(40000, '1257L')).incomeTax, std.incomeTax);
  const lower = T.takeHome(input(40000, '1157L'));
  close(lower.incomeTax - std.incomeTax, 200); // £1,000 less allowance at 20%
  close(lower.personalAllowance, 11570);
});

test('K codes add to taxable pay, capped at half your pay', () => {
  const std = T.takeHome(input(30000, ''));
  const k = T.takeHome(input(30000, 'K475'));
  close(k.incomeTax - std.incomeTax, (12570 + 4750) * 0.2);
  close(k.taxable, 34750);
  const tiny = T.takeHome(input(2000, 'K5000'));
  close(tiny.incomeTax, 1000);
});

test('BR, D0 and NT tax everything at one rate (or not at all)', () => {
  close(T.takeHome(input(20000, 'BR')).incomeTax, 4000);
  close(T.takeHome(input(20000, 'D0')).incomeTax, 8000);
  close(T.takeHome(input(20000, 'NT')).incomeTax, 0);
  close(T.takeHome(input(20000, '0T')).incomeTax, 4000);
  const br = T.takeHome(input(20000, 'BR'));
  assert.equal(br.taxByBand.find((b) => b.amount > 0).rate, 20);
});

test('an S code uses Scottish rates even if the region says otherwise', () => {
  const scot = T.takeHome(input(40000, '', { region: 'scotland' }));
  const s = T.takeHome(input(40000, 'S1257L'));
  close(s.incomeTax, scot.incomeTax);
  assert.equal(s.region, 'scotland');
});

test('a tax code replaces the £100k taper (HMRC builds it into the code)', () => {
  const std = T.takeHome(input(110000, ''));
  close(std.personalAllowance, 7570);
  const coded = T.takeHome(input(110000, '757L'));
  close(coded.incomeTax, std.incomeTax);
});

test('benefits collected through the tax code are not counted twice', () => {
  const base = input(40000, '1157L', { benefitInKind: 1000 });
  const payroll = T.takeHome(base);
  const viaCode = T.takeHome({ ...base, benefitsInCode: true });
  close(payroll.incomeTax - viaCode.incomeTax, 200);
  close(viaCode.incomeTax, T.takeHome(input(40000, '1157L')).incomeTax);
});

test('projection: the code applies while you work and keeps its gap from the standard allowance', () => {
  const p = FP.profile.blank();
  p.about.age = 40;
  p.income.grossSalary = 40000;
  p.spending = [{ id: 's', category: 'All', monthly: 1000 }];
  p.assumptions.salaryGrowth = 0;
  p.assumptions.taxThresholds = 'inflation';
  const std = FP.projection.project(p).rows;
  p.income.taxCode = '1157L';
  const coded = FP.projection.project(p).rows;
  // £1,000 less allowance at 20% in every working year, even as thresholds rise.
  close(std[1].takeHome - coded[1].takeHome, 200, 0.5);
  close(std[10].takeHome - coded[10].takeHome, 200, 0.5);
  // Retired: State Pension and drawdown use the standard allowance.
  const r = coded.find((x, i) => i > 0 && !x.working);
  const s = std.find((x, i) => i > 0 && !x.working);
  close(r.statePensionTax, s.statePensionTax);
  // Import keeps it, and cleans it up.
  assert.equal(FP.profile.normalise({ income: { taxCode: 'k475' } }).income.taxCode, 'K475');
  assert.equal(FP.profile.normalise({ income: { taxCode: 'junk' } }).income.taxCode, '');
});
