const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('./load');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const base = { salary: 0, bonus: 0, employeePensionPct: 0, employerPensionPct: 0, pensionMethod: 'netPay', studentLoanPlan: 'none', region: 'rUK' };
const th = (o) => FP.tax.takeHome({ ...base, ...o });

test('config is labelled with a tax year and sources', () => {
  assert.equal(FP.taxConfig.taxYear, '2026/27');
  assert.equal(FP.taxConfig.personalAllowance, 12570);
  assert.ok(FP.taxConfig.sources.length > 0);
});

test('no tax or NI below the personal allowance', () => {
  const r = th({ salary: 12570 });
  assert.equal(r.incomeTax, 0);
  assert.equal(r.nationalInsurance, 0);
  assert.equal(r.takeHome, 12570);
});

test('basic-rate taxpayer, rest of UK: £30,000', () => {
  const r = th({ salary: 30000 });
  close(r.incomeTax, 3486); // (30,000 - 12,570) x 20%
  close(r.nationalInsurance, 1394.4); // (30,000 - 12,570) x 8%
  close(r.takeHome, 25119.6);
});

test('higher-rate taxpayer, rest of UK: £60,000', () => {
  const r = th({ salary: 60000 });
  close(r.incomeTax, 7540 + 9730 * 0.4); // 11,432
  close(r.nationalInsurance, 3016 + 9730 * 0.02); // 3,210.60
});

test('personal allowance tapers above £100,000', () => {
  assert.equal(FP.tax.personalAllowance(110000, FP.taxConfig), 7570);
  assert.equal(FP.tax.personalAllowance(125140, FP.taxConfig), 0);
  assert.equal(FP.tax.personalAllowance(200000, FP.taxConfig), 0);
  const r = th({ salary: 110000 });
  close(r.incomeTax, 7540 + (102430 - 37700) * 0.4); // 33,432
  close(r.nationalInsurance, 3016 + 59730 * 0.02);
  // The 60% trap: keep only £38 of the next £100 (40% tax + 20% lost allowance + 2% NI)
  close(FP.tax.keepOfNext({ ...base, salary: 110000 }), 38, 0.01);
});

test('additional-rate taxpayer, rest of UK: £150,000', () => {
  const r = th({ salary: 150000 });
  close(r.incomeTax, 7540 + 87440 * 0.4 + 24860 * 0.45); // 53,703
});

test('Scotland uses its own bands: £50,000', () => {
  const r = th({ salary: 50000, region: 'scotland' });
  // taxable 37,430: 3,967@19% + 12,989@20% + 14,136@21% + 6,338@42%
  close(r.incomeTax, 753.73 + 2597.8 + 2968.56 + 2661.96);
  // NI is UK-wide
  close(r.nationalInsurance, th({ salary: 50000 }).nationalInsurance);
});

test('Scotland top rate above £125,140', () => {
  const r = th({ salary: 150000, region: 'scotland' });
  const expected = 3967 * 0.19 + 12989 * 0.2 + 14136 * 0.21 + 31338 * 0.42 + 62710 * 0.45 + 24860 * 0.48;
  close(r.incomeTax, expected);
});

test('student loan plans', () => {
  close(th({ salary: 40000, studentLoanPlan: 'plan2' }).studentLoan, (40000 - 29385) * 0.09);
  close(th({ salary: 40000, studentLoanPlan: 'plan1' }).studentLoan, (40000 - 26900) * 0.09);
  close(th({ salary: 40000, studentLoanPlan: 'plan4' }).studentLoan, (40000 - 33795) * 0.09);
  close(th({ salary: 40000, studentLoanPlan: 'plan5' }).studentLoan, (40000 - 25000) * 0.09);
  close(th({ salary: 40000, studentLoanPlan: 'postgrad' }).studentLoan, (40000 - 21000) * 0.06);
  assert.equal(th({ salary: 20000, studentLoanPlan: 'plan2' }).studentLoan, 0);
});

test('net pay pension reduces tax but not NI', () => {
  const r = th({ salary: 40000, employeePensionPct: 5, employerPensionPct: 3 });
  close(r.incomeTax, (40000 - 2000 - 12570) * 0.2);
  close(r.nationalInsurance, (40000 - 12570) * 0.08);
  close(r.pensionFromPay, 2000);
  close(r.pensionIntoPot, 3200);
  close(r.takeHome, 40000 - 2000 - r.incomeTax - r.nationalInsurance);
});

test('salary sacrifice also reduces NI and student loan', () => {
  const r = th({ salary: 40000, employeePensionPct: 5, pensionMethod: 'salarySacrifice', studentLoanPlan: 'plan2' });
  close(r.nationalInsurance, (38000 - 12570) * 0.08);
  close(r.studentLoan, (38000 - 29385) * 0.09);
  assert.ok(r.takeHome > th({ salary: 40000, employeePensionPct: 5, studentLoanPlan: 'plan2' }).takeHome);
});

test('relief at source: pay 80% from net pay; higher-rate band extended', () => {
  const basic = th({ salary: 40000, employeePensionPct: 5, pensionMethod: 'reliefAtSource' });
  close(basic.incomeTax, (40000 - 12570) * 0.2);
  close(basic.pensionFromPay, 1600);
  close(basic.pensionIntoPot, 2000);
  const higher = th({ salary: 60000, employeePensionPct: 5, pensionMethod: 'reliefAtSource' });
  // basic band widened by the £3,000 gross contribution
  close(higher.incomeTax, 40700 * 0.2 + (47430 - 40700) * 0.4); // 10,832
  // same overall cost as net pay for a higher-rate taxpayer
  const netPay = th({ salary: 60000, employeePensionPct: 5 });
  close(higher.takeHome, netPay.takeHome);
});

test('bonus is taxed with salary; pension is a % of salary only', () => {
  const r = th({ salary: 40000, bonus: 5000, employeePensionPct: 5 });
  close(r.employeePension, 2000);
  close(r.incomeTax, (45000 - 2000 - 12570) * 0.2);
});

test('blank inputs give zero, not NaN', () => {
  const r = FP.tax.takeHome({}, FP.taxConfig);
  assert.equal(r.takeHome, 0);
  assert.equal(r.takeHomeMonthly, 0);
});

test('forProfile reads the shared profile', () => {
  const p = FP.sample();
  const r = FP.tax.forProfile(p);
  assert.equal(r.salary, 56000);
  assert.equal(r.bonus, 2000);
  assert.ok(r.takeHomeMonthly > 2500 && r.takeHomeMonthly < 4000);
});
