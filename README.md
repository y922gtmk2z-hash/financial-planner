# UK personal finance planner

A single-page, mobile-first personal finance planner for the UK, in plain HTML, CSS
and JavaScript. No framework, no build step, no backend, no accounts and no network
calls.

> **Planning illustration only — not financial advice.** Results depend on the
> assumptions you set. Projections are not guaranteed; investments can fall as well as
> rise. Consider speaking to a regulated financial adviser before making decisions.

## Run it

- **Double-click `index.html`.** It works straight from your file system.
- Or serve the folder with any static server, e.g. `python3 -m http.server`, and open
  <http://localhost:8000>.

The first time you open it, it shows a **clearly fictional sample household** with two
example scenarios. Use **Start with my own data** in the banner to begin with an empty
form, or **Keep these figures as mine** to edit the sample.

## Screens

| Screen | What it does |
| --- | --- |
| **Today** | Net worth, a chart of what you own vs what you owe (with a table view), home equity and loan-to-value, mortgage payment and payoff date (with and without overpayments), and monthly cash flow: take-home pay − spending − mortgage − other debts = surplus. |
| **Setup** | Enter everything once: age, assets (home, cash, ISA, other investments, pensions, other), mortgage (balance, rate, remaining term, monthly overpayment), other debts, income (salary, pension %, student loan plan, balance and the year you were first due to repay, any number of bonuses with the month each is paid), and monthly spending by category. |
| **Income** | UK take-home pay: income tax by band (rest of UK or Scotland), National Insurance, pension (net pay, salary sacrifice or relief at source) and student loan. Shows a regular month and each bonus month, how much of your next £100 pay rise you'd keep, and your student loan: interest, repayments, write-off date and when it should be repaid. Feeds Today's cash flow automatically. |
| **Future** | Year-by-year projection (up to 40 years, to your end age), in today's money or future money. Net worth and home-equity lines, a stacked chart by component, headline figures, the surplus split and a full year-by-year table. |
| **Scenarios** | Your plan is the **Baseline**. Copy it, change any input or assumption, and compare up to 8 scenarios side by side in a table and an overlay chart. The scenario picker under the header shows which scenario every screen is editing. |
| **Assumptions** | Every number the model depends on, editable, with the date each default was set, per-item reset and **Reset all to defaults**. |
| **Your data** (header link) | Privacy notes, JSON export/import, load sample data, and **Clear all data**. |

Basic inputs are shown first; less common ones are under **Advanced**. Every input
is checked as you type, with plain-English errors. Blank boxes count as £0.

## Your data and privacy

- Everything is saved in your browser's **local storage on this device only**. There
  are no accounts and no server, and the page's Content Security Policy blocks all
  network connections (`connect-src 'none'`).
- **Export** saves every scenario to a JSON file; **Import** loads one back (it is
  checked and cleaned up first, and older single-plan exports still work).
- **Clear all data** removes everything the planner stored in this browser.
- Exported files (`finance-planner-export-*.json`) are git-ignored so personal data is
  never committed. The sample data is fictional.

## Default assumptions

All editable in the Assumptions panel (defaults set 23 Oct 2026):

| Assumption | Default |
| --- | --- |
| Inflation (CPI) | 2.5% a year |
| Salary growth | 3.0% a year (bonuses grow with salary) |
| Spending growth | 2.5% a year |
| House price growth | 3.0% a year |
| Savings interest | 3.5% (enter it after tax; savings tax isn't modelled) |
| Investment return | 5.0% a year, minus 0.4% fees |
| Pension growth | 5.0% a year, minus 0.5% fees |
| Mortgage rate | 4.5%, with an optional change to a new rate after N years |
| Pension contributions | 5% employee, 3% employer |
| Retirement age / projection end age | 67 / 95 |
| Default rate for other debts | 7.0% |
| Overpayment warning | above 10% of the balance a year |
| Tax thresholds in future years | frozen (or rise with inflation) |
| State Pension | £12,547.60 a year (£241.30 a week, 2026/27) from age 67, rising with inflation |
| Pension access age | 57 |
| ISA allowance | £20,000 a year |
| Surplus split | 30% cash, 50% investments, 10% mortgage overpayment, 10% pension |

## Tax rules — check every tax year

All income tax, National Insurance and student loan rates and thresholds live in one
file per tax year: **`js/config/tax-2026-27.js`** (6 April 2026 – 5 April 2027). It
includes rest-of-UK and Scottish bands, the personal allowance taper over £100,000,
employee NI, student loan plans 1, 2, 4, 5 and postgraduate (thresholds, interest
rates and write-off terms), and links to the official sources.

**These figures must be checked against HMRC, gov.scot and gov.uk at the start of
each tax year.** The Income screen shows a warning once today's date is outside the
tax year in the file. To update:

1. Copy the file to `js/config/tax-YYYY-YY.js` and update every figure, `taxYear`,
   `yearStart`, `yearEnd` and `checkedOn`.
2. Point the `<script>` tag in `index.html` and the entry in `tests/load.js` at the new
   file.
3. Update the expected values in `tests/tax.test.js` and run `npm test`.

## Student loans

Enter your plan, your **balance** (from your Student Loans Company account) and the
**year you were first due to repay** (the April after you left your course). The
projection then adds interest and takes repayments from your pay each month. Once
the loan is repaid, repayments stop and your take-home pay rises. Any balance left is
**written off** in April, 25 years after your first repayment year (Plan 1), 30 years
(Plans 2 and 4, postgraduate) or 40 years (Plan 5). The Income and Future screens and
the scenario comparison show when it ends. The loan counts as a debt in your net
worth until then.

Interest rates for the year from 1 September 2026 are in the tax config: RPI 4.1%.
Plan 2 slides from 4.1% to a temporary 6% cap with income (between £29,385 and
£52,885). Postgraduate loans are 6%. You can enter your own rate under **Advanced**.
Rates are reset every September and are held at today's level in projections. Some
older Plan 1 and Plan 4 loans are written off at 65 instead. Without a balance,
repayments simply carry on until you retire.

## How the projection works

Each year, in order:

1. **Income** — salary and bonuses grow with salary growth and are taxed with that
   year's rules (thresholds frozen or raised with inflation). Student loan repayments
   stop once the loan is repaid or written off. Salary and workplace
   pension contributions stop at retirement age; State Pension starts at State Pension
   age.
2. **Growth** — home, cash, investments (after fees) and pension (after fees) grow at
   their own rates.
3. **Debts** — the mortgage is paid down month by month (fixed payment plus
   overpayments, so overpayments shorten the term; the payment is recalculated if the
   rate changes). Other debts are paid until cleared.
4. **Spending** grows with spending growth and carries on unchanged in retirement.
5. **Surplus** first repays any earlier shortfall, then is split between cash,
   investments (ISA first, up to the allowance), a mortgage lump sum and pension (with
   20% relief added).
6. **Deficit** — in retirement, drawn from your pension first (from the access age;
   25% of each withdrawal tax-free, the rest taxed as income), then cash, then
   investments. Anything left is shown as an unfunded shortfall, with a warning.

**Not modelled:** tax on savings and investments, higher-rate relief on extra pension
contributions, student loan repayments on pension income, holding both an
undergraduate and a postgraduate loan, the pension lump-sum allowance, inheritance, and changes to your mortgage
after its term. Money moves at the end of each year, so contributions start growing
the following year.

## Project layout

```
index.html                 shell, navigation, disclaimer, CSP
css/styles.css             mobile-first styles; light and dark themes
js/config/assumptions.js   every assumption: label, unit, default, range, help, date set
js/config/tax-2026-27.js   UK tax, NI and student loan rules for one tax year
js/model/profile.js        the shared data model: fields, parsing, validation, normalising
js/model/scenarios.js      workspace of scenarios: copy, rename, delete, differences
js/model/sample.js         fictional sample household and example scenarios
js/model/store.js          localStorage, export/import, clear
js/calc/*.js               pure calculations (no DOM): mortgage, summary, tax,
                           student loan, growth, projection, compare
js/ui/*.js                 one file per screen, plus field, chart and DOM helpers
js/app.js                  routing, saving and the scenario picker
tests/*.test.js            node:test unit tests
docs/PLAN.md               build plan
```

Scripts are classic scripts sharing one `FP` namespace (not ES modules), so the page
works when opened from `file://`. Calculation and model code never touches the DOM,
so the tests load it straight into Node.

## Tests

```
npm test   # Node 18+, no dependencies to install
```

83 tests cover:

- **Income tax:** rest-of-UK and Scottish bands, the allowance taper and the 60%
  effective rate, all five student loan plans, the three ways a pension can be paid,
  bonuses spread evenly or paid in a month, and thresholds raised with inflation.
- **Student loans:** interest by plan (Plan 2 by income), write-off years, repayment
  until cleared (then take-home rises), write-off of what's left, balances that grow,
  and custom rates.
- **Compound growth and inflation** conversion.
- **Mortgage amortisation:** payment formula, overpayments, rate changes, the
  overpayment limit, and no term left.
- **Projection engine:** each asset's growth, the mortgage matching the standalone
  calculator, the surplus split and ISA allowance, salary and bonus growth, retirement,
  shortfalls, State Pension, taxed pension drawdown, the pension access age, negative
  equity, and debts being paid off.
- **Scenarios:** copying, the limit, rename and delete, differences, comparison,
  upgrading older data.
- **Data handling:** parsing and validation, cleaning up imported data,
  export/import round trips.
- **Checks on the source:** no code can make network requests, and every script is
  loaded.

## Accessibility

Checked with axe-core on every screen in light and dark mode (WCAG 2.1 AA, no
violations). Inputs have labels and help text, errors are announced, charts have a
table or keyboard readout (arrow keys), colour is never the only signal, and the layout
works from 320px wide with no sideways scrolling.
