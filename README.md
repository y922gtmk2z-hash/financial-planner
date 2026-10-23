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

### Publish on GitHub Pages

The site is plain static files with `index.html` at the repository root. All paths
are relative, so it works from a project subfolder such as
`https://<user>.github.io/<repo>/`. To publish it:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Source: Deploy from a branch**, then
   **Branch: `main`** and folder **`/ (root)`**, and save.
3. After a minute or so the site is live at `https://<user>.github.io/<repo>/`.

`.nojekyll` tells Pages to serve the files exactly as they are, with no Jekyll build.
There is nothing to build or configure. Navigation uses `#` links, so links straight
to a screen, such as `…/#future`, work and need no server rules. The `/docs` folder
holds the build plan only, not the site, so don't choose it as the Pages folder.
`npm test` checks that every path in `index.html` stays relative.

The first time you open it, it shows a **clearly fictional sample household** with two
example scenarios. Use **Start with my own data** in the banner to begin with an empty
form, or **Keep these figures as mine** to edit the sample.

## Screens

**How it's laid out:** the header at the top (with **Setup** and **Your data**) stays
pinned, slides away as you scroll down and comes back as soon as you scroll up, so
you can get back to Setup at any time. When you've entered your figures, **Calculate
my plan** at the bottom of Setup takes you to the **Overview**. The tabs at the bottom
drill into each part of your plan.

| Screen | What it does |
| --- | --- |
| **Overview** (first tab) | Your plan at a glance: net worth, take-home pay, monthly surplus, net worth and pension at retirement, when the mortgage and student loan end, any warnings, and a net-worth chart. Every figure links to the tab with the detail. |
| **Today** | Net worth, a chart of what you own vs what you owe (with a table view), home equity and loan-to-value, mortgage payment and payoff date (with and without overpayments), and monthly cash flow: take-home pay − spending − mortgage − other debts = surplus. |
| **Setup** (header) | Enter everything once: age, assets (home, cash, ISA, other investments, pensions, other), mortgage (balance, rate, remaining term, monthly overpayment), other debts, income (salary, pension %, student loan plan, balance and the year you were first due to repay, any number of bonuses with the month each is paid, salary sacrifice schemes), monthly spending by category, **regular savings**, and **your leftover money** (what's left each month, what to do with it, and suggestions). Ends with **Calculate my plan**. |
| **Income** | UK take-home pay: income tax by band (rest of UK or Scotland), National Insurance, pension (net pay, salary sacrifice or relief at source) and student loan. Shows a regular month and each bonus month, how much of your next £100 pay rise you'd keep, and your student loan: interest, repayments, write-off date and when it should be repaid. Feeds Today's cash flow automatically. |
| **Future** | Year-by-year projection (up to 40 years, to your end age), in today's money or future money. Net worth and home-equity lines, a stacked chart by component, headline figures, your leftover money and a full year-by-year table. |
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
- **On GitHub Pages**, browser storage is shared by every project site under the same
  `<user>.github.io` address. Your figures still never leave your browser, but another
  page you publish there could read them. Use **Clear all data** when you're done on a
  shared computer, or host the planner on its own domain if that matters to you.

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
| Student loan interest in future years | current rates (or follow inflation) |
| State Pension | £12,547.60 a year (£241.30 a week, 2026/27) from age 67, rising with inflation |
| Pension access age | 57 |
| ISA allowance | £20,000 a year |
| Cash ISA limit (from 6 April 2027, under-65s) | £12,000 a year |
| Leftover money (your choice, in Setup) | 10% emergency fund (target: 3 months of outgoings), 20% cash, 50% investments, 10% mortgage overpayment, 10% pension |

## Tax rules — check every tax year

All income tax, National Insurance and student loan rates and thresholds live in one
file per tax year: **`js/config/tax-2026-27.js`** (6 April 2026 – 5 April 2027). It
includes rest-of-UK and Scottish bands, the personal allowance taper over £100,000,
employee NI, student loan plans 1, 2, 4, 5 and postgraduate (thresholds, interest
margins, the current interest year's published rates and write-off terms), and links
to the official sources.

**These figures must be checked against HMRC, gov.scot and gov.uk at the start of
each tax year.** The Income screen shows a warning once today's date is outside the
tax year in the file. To update:

1. Copy the file to `js/config/tax-YYYY-YY.js` and update every figure, `taxYear`,
   `yearStart`, `yearEnd` and `checkedOn`.
2. Point the `<script>` tag in `index.html` and the entry in `tests/load.js` at the new
   file.
3. Update the expected values in `tests/tax.test.js` and run `npm test`.

## Your leftover money

At the end of Setup (and on Future), **Your leftover money** shows how much is left
each month after spending, mortgage and debts, and regular savings. Bonus months add
more. You then choose what to do with it: your **emergency fund**, **cash savings**,
**investments** (ISA first), **mortgage overpayments** or **extra pension
contributions**. Each choice shows what it comes to in £ a month, and the projection
shares out each year's leftover money the same way. Anything you don't allocate goes
to cash.

The **emergency fund** has a target you set, in months of essential outgoings
(spending, mortgage and debt payments; 3 by default). The card shows how many months
your cash covers and how long your share takes to fill the gap. In the projection,
that share goes to cash until your cash savings reach the target for that year; then
it goes to your other choices in proportion, so it only tops up as costs rise.

Below that are **ideas based on your figures**, general rules of thumb rather than
advice:

- clear debts that cost more than savings earn;
- build an emergency fund of 3–6 months of essential outgoings;
- higher-rate pension tax relief, and avoiding the 60% band between £100k and £125k;
- checking for employer pension matching;
- overpaying a mortgage that costs more than cash earns;
- using the ISA allowance;
- not rushing to repay a student loan that will be written off.

A **suggested split** follows from these, and always includes the emergency fund:
80% while it's below your target, then 10% to keep it topped up. **Use this split** applies it. This used to be the "surplus
split" in Assumptions; existing saved splits carry over.

## Regular savings

Under **Regular savings** in Setup, add monthly amounts into **cash savings**, a
**cash ISA** or a **stocks & shares ISA**. Each can stay the same or rise with your
pay. They:

- come out of what's left after spending and debts. Today shows "left after spending
  and debts", then your savings, then the surplus, and warns if they don't fit;
- go into your balances each year until you retire. Cash and cash ISAs go to cash
  savings at the savings rate; stocks & shares ISAs go to ISA investments at the
  investment return after fees;
- use the **ISA allowance** (£20,000) before your leftover money is shared out. Anything over it
  is still saved, outside an ISA;
- respect the **cash ISA limit** of £12,000 a year for under-65s from 6 April 2027 (an
  editable assumption). Cash above it stays as ordinary cash savings.

Anything left over after regular savings is shared out as you choose under **Your
leftover money**.

## Salary sacrifice

Add car schemes, cycle to work and other schemes (e.g. tech or extra holiday) under
**Salary sacrifice** in Setup or on Income. Give each a monthly amount and, optionally,
the months left. The sacrificed pay comes off before income tax, National Insurance
and student loan, so each scheme shows what it **really costs you a month** after
those savings. A car scheme also takes the car's list price (P11D value) and
benefit-in-kind rate (default 4%, the 2026/27 rate for fully electric cars; 5% in
2027/28). The benefit is added to taxable pay, with no employee NI. Lower taxable
pay also helps with the personal allowance taper over £100,000.

Pension contributions stay based on your full salary, as most employers do.
Projections stop each scheme when its months run out. If a scheme replaces something
you pay for now (such as a car lease), take that out of your spending. Salary
sacrifice can't take your pay below the National Minimum Wage. Pension salary
sacrifice is set separately, under "How your pension is paid".

## Student loans

Enter your plan, your **balance** (from your Student Loans Company account) and the
**year you were first due to repay** (the April after you left your course). The
projection then adds interest and takes repayments from your pay each month. Once
the loan is repaid, repayments stop and your take-home pay rises. Any balance left is
**written off** in April, 25 years after your first repayment year (Plan 1), 30 years
(Plans 2 and 4, postgraduate) or 40 years (Plan 5). The Income and Future screens and
the scenario comparison show when it ends. The loan counts as a debt in your net
worth until then.

Choose your plan under **Student loan** in Setup or on Income (the help text says
which plan you're likely to be on). Interest is RPI plus a margin:

| Plan | Interest |
| --- | --- |
| Plan 1, Plan 4 | RPI (strictly the lower of RPI and base rate + 1%; base rate isn't modelled) |
| Plan 2 | RPI, rising to RPI + 3% as income goes from £29,385 to £52,885 |
| Plan 5 | RPI |
| Postgraduate | RPI + 3% |

The current published rates (1 September 2026 to 31 August 2027) are RPI 4.1%, with a
temporary 6% cap on Plan 2 and postgraduate loans. **By default the projection keeps
these current rates** (Plan 2 still moves with your income). In Assumptions you can
instead choose **Student loan interest in future years → Follow inflation**. That
uses your inflation assumption as RPI from September 2027, plus the plan's margin,
with no cap. Entering your own rate in Setup overrides both. Without a balance,
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

129 tests cover:

- **Income tax:** rest-of-UK and Scottish bands, the allowance taper and the 60%
  effective rate, all five student loan plans, the three ways a pension can be paid,
  bonuses spread evenly or paid in a month, and thresholds raised with inflation.
- **Leftover money and suggestions:** what's left, each suggestion's trigger
  (shortfall, emergency fund, expensive debts, higher rate, the 60% band, mortgage, ISA
  room, student loan write-off), the suggested splits always adding up to 100% and
  including the emergency fund, the fund filling to your target then passing its share on, and
  older saved splits carrying over.
- **Regular savings:** totals by type, contributions to the right balances, the ISA
  allowance and cash ISA limit (from April 2027, not for over-65s), amounts rising
  with pay, savings reducing the surplus, stopping at retirement, and import checks.
- **Salary sacrifice:** tax and NI savings at basic and higher rate, car benefit in
  kind, the £100k taper, student loans, pension on full salary, schemes ending,
  bonus months and import checks.
- **Student loans:** current (default) and inflation-based interest by plan (Plan 2 by
  income, the temporary cap ending), write-off years and timing, repayment until
  cleared (then take-home rises), write-off of what's left, balances that grow, custom
  rates, and higher inflation delaying payoff.
- **Compound growth and inflation** conversion.
- **Mortgage amortisation:** payment formula, overpayments, rate changes, the
  overpayment limit, and no term left.
- **Projection engine:** each asset's growth, the mortgage matching the standalone
  calculator, how leftover money is shared out and the ISA allowance, salary and bonus growth, retirement,
  shortfalls, State Pension, taxed pension drawdown, the pension access age, negative
  equity, and debts being paid off.
- **Scenarios:** copying, the limit, rename and delete, differences, comparison,
  upgrading older data.
- **Data handling:** parsing and validation, cleaning up imported data,
  export/import round trips.
- **Checks on the source:** no code can make network requests, every script is
  loaded, every path stays relative (for GitHub Pages), and every route has a screen,
  with Setup in the header and the views as tabs.

## Accessibility

Checked with axe-core on every screen in light and dark mode (WCAG 2.1 AA, no
violations). Inputs have labels and help text, errors are announced, charts have a
table or keyboard readout (arrow keys), colour is never the only signal, and the layout
works from 320px wide with no sideways scrolling.
