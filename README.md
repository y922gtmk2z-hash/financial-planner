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

**Publishing an update:** every script and the stylesheet in `index.html` end in the
same `?v=` version (for example `?v=2026-10-24.1`). Change it in every tag when you
publish, so browsers fetch the new files instead of a cached copy (GitHub Pages lets
browsers keep files for about 10 minutes). `npm test` checks they all match.

The first time you open it, it starts **empty**, with a short welcome that says what
the planner does and a **Quick start**: your age, salary, monthly spending and
retirement age. Those four answers give a first look at Your plan, marked "Based on 4
answers" until you add savings, pensions or debts. The same four questions sit at the
top of Your figures until they're answered. You can also fill in all your figures, or **Load
sample data** (a clearly fictional household, with a banner saying so) from the
welcome screen or Your data. Until you add figures, every screen says to add them to
see results; no illustrative data is used.

## Screens

**How it's laid out:** four tabs at the bottom (**Your plan**, **Today**, **Future**,
**Scenarios**) and a header that stays pinned, slides away as you scroll down and
comes back as soon as you scroll up, with **Your figures** and a **More** menu (Assumptions,
Your data). On a phone the tabs step aside while you type in a field, so the keyboard
has room. From 900px wide the tabs become a side menu next to a wider page.

**Your journey:**

1. **Your figures**, in four sections (section by section the first time, then on one page):
   - **About you:** your age, when you'd like to retire, what you'd like to spend in
     retirement, your salary and (optionally) your **tax code**. **More about your pay** (folded away) has your
     pension, bonuses, salary sacrifice, **workplace benefits** (private medical
     insurance or another taxable benefit) and **other income**.
   - **What you spend and save:** one question on what you spend in a month (split it
     into categories if you like), one on what you save each month, then **money
     left over each month**.
   - **Assets:** what you own today.
   - **Debts:** what you owe: mortgage, student loan and other debts.
2. **Your plan** answers four questions, each with a verdict and its top
   recommendation: **Each month** (take-home, what's left over, emergency fund),
   **Debt-free** (mortgage, student loan, other debts), **Retirement** (what you could
   spend against your goal, pension pot) and **Next steps**.
3. **Tap any figure** to open its detail panel: the result and a chart, the inputs
   and assumptions that drive it (change them right there), a before-and-after
   comparison as you type, the changes that would help most (**Try it**), and the
   recommendations for it. **Apply to my plan**, **Save as a scenario**, or undo.
   Nothing changes in your plan until you choose; closing a panel with changes you
   haven't applied or saved asks first.

Every figure has one home in Your figures; other screens link straight to the field (for
example `#setup/income.grossSalary`). Until your age and monthly spending are entered,
Your plan, Future and Scenarios show a **Finish your plan** checklist instead of a
projection. The disclaimer is shown in full on your first visit, then as one line you
can open. The scenario picker appears once you have more than one scenario. Each tab
opens with a one-line subtitle (Your plan: "Four questions, answered"; Today: "Where you
stand this month"; Future: "Year by year"; Scenarios: "What if…"), and Your plan,
Today and Future have an **Edit your figures** button. Each chart has a
one-line "So what" under it.

| Screen | What it does |
| --- | --- |
| **Your plan** (first tab) | The four outcome cards above, each figure opening a detail panel; your net worth today and over time; any notes. |
| **Today** (`#now`) | Where you stand this month, in three parts: **This month** (cash flow: take-home − spending − mortgage − other debts − regular savings = left over), **Own and owe** (net worth, what you own vs owe, home equity, mortgage payoff with and without overpayments) and **Pay and tax** (income tax by band for the rest of the UK or Scotland, National Insurance, pension method, student loan, each bonus month, how much of a £100 rise you'd keep, and the figures it's based on with Change links). |
| **Your figures** (header, `#setup`) | Four sections, plus **Projections** (show amounts in today's or future money): **About you** (age, retirement goal, salary, and folded away: pension, bonuses, salary sacrifice, workplace benefits, other income), **What you spend and save** (spending as one total or categories, regular savings, money left over each month), **Assets** and **Debts** (mortgage, student loan, other debts). Section by section the first time, then one page. A strip above the tabs shows take-home and what's left over as you type. |
| **Future** | Year-by-year projection (up to 40 years, to your end age), in today's money or future money. Net worth and home-equity lines with a shaded range for returns 2 points lower or higher, a stacked chart by component, headline figures, money left over each month (folded above the results) and a full year-by-year table. |
| **Scenarios** | Your plan is the **Baseline**. Try a one-tap **what-if** (retire 2 years earlier, work 2 years longer, overpay £200 a month more, spend 10% less, a 10% pay rise, weaker markets), save one from any detail panel, or copy your plan and change anything; compare up to 8. The comparison opens on what's different from the Baseline (£ and years, green better, red worse); **Show all figures** opens the full table; an overlay chart follows. At 8 the page says why you can't add more. |
| **Assumptions** (More menu) | Every number the model depends on, editable, with the date each default was set, per-item reset and **Reset all to defaults**. The few entered in Your figures (retirement age, mortgage rate, pension %) link there. |
| **Settings** (More menu) | Theme (System, Light or Dark), saved in this browser only. |
| **Your data** (More menu) | Privacy notes, when you last exported a backup, JSON export/import, load sample data, and **Clear all data**. |

Old links to `#today` and `#income` open the matching part of **Today** (its link is still `#now`).

Basic inputs are shown first; less common ones are under **Advanced**. Every input
is checked as you type, with plain-English errors. Blank boxes count as £0.

## Your data and privacy

- Everything is saved in your browser's **local storage on this device only**. There
  are no accounts and no server, and the page's Content Security Policy blocks all
  network connections (`connect-src 'none'`).
- **Export** saves every scenario to a JSON file; **Import** loads one back (it is
  checked and cleaned up first, and older single-plan exports still work).
- **Clear all data** removes everything the planner stored in this browser. It says what
  will go and asks you to type DELETE first.
- **Export a backup** is also on Your plan. Once you've changed your figures, Your plan
  reminds you to export if you haven't in 30 days (or ever), or after 15 or so edits since
  your last export; "Not now" puts it off for 30 days.
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
| Overpaying from money left over each month | stays within the overpayment limit (or no limit) |
| Tax thresholds in future years | frozen (or rise with inflation) |
| Student loan interest in future years | current rates (or follow inflation) |
| State Pension | £12,547.60 a year (£241.30 a week, 2026/27) from age 67, rising with inflation |
| Pension access age | 57 |
| ISA allowance | £20,000 a year |
| Cash ISA limit (from 6 April 2027, under-65s) | £12,000 a year |
| Retirement goal (in Your figures) | what you spend now (or a monthly amount you set) |
| Monthly spending (new plan) | one total; add categories if you like |
| Money left over each month (your choice, in Your figures) | nothing chosen, so nothing saved (emergency fund target: 3 months of outgoings). The sample household uses 10% emergency fund, 20% cash, 50% investments, 10% mortgage, 10% pension |

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

## Money left over each month

At the end of Your figures (and on Future), **Money left over each month** shows how much is left
each month after spending, mortgage and debts, and regular savings. Bonus months add
more. You then choose what to do with it: your **emergency fund**, **paying off debts
faster** (most expensive first), **cash savings**, **investments** (ISA first),
**mortgage overpayments** or **extra pension contributions**. Each choice shows what it
comes to in £ a month, and the projection shares out each year's left-over money the
same way. Enter your choices as **% of what's left** or as **£ a month**: switching
converts what you've entered, each choice shows the other unit alongside, and £ amounts
rise with prices in the projection (if they add up to more than is left in a year,
they're scaled down to fit). **Nothing is saved until you choose:** a new plan starts with nothing chosen,
and any part you don't allocate is treated as spent, not put into savings. Your plan
says when you haven't chosen yet, and the suggested split is one tap away.

When a choice can't take its share in a year, the share goes to your other choices in
proportion (and isn't saved if none of them can take it): the emergency fund once it's full, debts and
the mortgage once they're paid off, pension contributions once you retire, and
mortgage overpayments above your lender's limit (10% of the balance a year by default;
you can turn this off in Assumptions).

The **emergency fund** has a target you set, in months of essential outgoings
(spending, mortgage and debt payments; 3 by default). The card shows how many months
your cash covers and how long your share takes to fill the gap. In the projection,
that share goes to cash until your cash savings reach the target for that year; then
it goes to your other choices in proportion, so it only tops up as costs rise.

Below that are **ideas based on your figures**, general rules of thumb rather than
advice:

- clear debts that cost at least 2 points more than savings earn;
- build an emergency fund of 3–6 months of essential outgoings;
- higher-rate pension tax relief, and avoiding the 60% band between £100k and £125k;
- checking for employer pension matching;
- overpaying a mortgage that costs more than cash earns;
- using the ISA allowance;
- not rushing to repay a student loan that will be written off.

Mark an idea **✓ Done** or **Not for me** and it moves into a folded list you can bring
it back from; Overview shows how many are left and the top three.

A **suggested split** follows from these, and always includes the emergency fund:
80% while it's below your target (50% with 40% to expensive debts if you have both),
then 10% to keep it topped up, with 70% to paying off expensive debts if you have any.
**Use this split** applies it. This used to be the "surplus split" in Assumptions;
existing saved splits carry over.

## Regular savings

Under **Regular savings** in Your figures, add monthly amounts into **cash savings**, a
**cash ISA** or a **stocks & shares ISA**. Each can stay the same or rise with your
pay. They:

- come out of what's left after spending and debts. Today shows "left after spending
  and debts", then your savings, then what's left over each month, and warns if they don't fit;
- go into your balances each year until you retire. Cash and cash ISAs go to cash
  savings at the savings rate; stocks & shares ISAs go to ISA investments at the
  investment return after fees;
- use the **ISA allowance** (£20,000) before what's left over each month is shared out. Anything over it
  is still saved, outside an ISA;
- respect the **cash ISA limit** of £12,000 a year for under-65s from 6 April 2027 (an
  editable assumption). Cash above it stays as ordinary cash savings.

Anything left over after regular savings is shared out as you choose under **Money
left over each month**.

## Tax code

Enter your tax code in **About you** (from your payslip, P60 or the HMRC app), or leave
it blank for the standard allowance (1257L). As you type, it says what the code means.

- **Number codes** (1257L, 1100M, 1357T...): that many tens of pounds tax-free. A lower
  code means more tax; it replaces the standard allowance and the £100k taper, which
  HMRC builds into your code.
- **K codes** (K475): that amount is added to your taxable pay; tax taken is capped at
  half your pay.
- **BR, D0, D1** (and Scottish SD0–SD3): all pay taxed at one rate, no allowance.
  **0T**: no allowance, normal bands. **NT**: no tax.
- **S** in front means Scottish rates (overriding where you said you pay tax); **C** is
  Wales (the same as England). Emergency suffixes (W1, M1, X) are accepted.

In the projection the code applies to your pay every year you work, and keeps the same
gap from the standard allowance as thresholds change. In retirement, State Pension and
pension income use the standard allowance. If you have workplace benefits, choose
whether their tax is collected **through your pay** or **through your tax code**, so
they're only counted once. Pay and tax shows the code you're using, and the take-home
panel lets you try another.

## Workplace benefits and other income

Under **About you → More about your pay**:

- **Workplace benefits:** private medical insurance or another taxable benefit, with its
  yearly taxable value (from your P11D or payslip). It's taxed as income with your pay,
  with no employee National Insurance, and the editor shows what it costs you in tax a
  month. In the projection it rises with prices.
- **Other income:** other taxable income a year (for example rental profit or
  self-employment; income tax is worked out with your salary, but National Insurance
  and student loan on it aren't modelled) and tax-free income, and whether it carries
  on after you retire. Both rise with prices; after you retire they're taxed together
  with your State Pension and any pension you draw.

## Salary sacrifice

Add car schemes, cycle to work and other schemes (e.g. tech or extra holiday) under
**Salary sacrifice** in Your figures or on Income. Give each a monthly amount and, optionally,
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

Choose your plan under **Student loan** in Your figures or on Income (the help text says
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
with no cap. Entering your own rate in Your figures overrides both. Without a balance,
repayments simply carry on until you retire.

**Extra payments** (optional, a month) are voluntary payments on top of what comes out
of your pay. They're paid from your take-home pay, so they come out of what's left over
each month (shown on Today with your debt payments), and stop once the loan is repaid or
written off. The student loan panel shows the effect: when you'd repay the loan anyway,
"Pay £100 a month extra" shows how much sooner it ends and how much less you repay;
when it's likely to be written off, extra payments aren't suggested, because you'd be
paying money that would otherwise be written off.

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
5. **Leftover money** first repays any earlier shortfall, then is shared out as you
   chose: the emergency fund (cash, up to your target), extra debt payments (most
   expensive first), cash, investments (ISA first, up to the allowance), a mortgage lump
   sum (within the overpayment limit) and pension (with 20% relief added). A share a
   choice can't take goes to the others in proportion.
6. **Deficit** — in retirement, drawn from your pension first (from the access age;
   25% of each withdrawal tax-free, the rest taxed as income), then cash, then
   investments. Anything left is shown as an unfunded shortfall, with a warning.

**Not modelled:** tax on savings and investments, higher-rate relief on extra pension
contributions, student loan repayments on pension income, holding both an
undergraduate and a postgraduate loan, the pension lump-sum allowance, inheritance, and changes to your mortgage
after its term. Money moves at the end of each year, so contributions start growing
the following year.

**What you could spend in retirement** (Overview and Scenarios) re-runs the projection
to your end age, past the 40-year limit of the charts, to find the highest monthly
spending from retirement (in today's money) that never runs short. It doesn't sell your
home; mortgage and debt payments are on top. The **range on the net worth chart** re-runs
it with investment and pension returns 2 points a year lower and higher.

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
js/calc/outcomes.js        the results you can tap into: drivers, levers, before/after
js/ui/*.js                 one file per screen, plus field, chart, checklist, panel
                           (sheet.js, explore.js) and DOM helpers
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

166 tests cover:

- **Income tax:** rest-of-UK and Scottish bands, the allowance taper and the 60%
  effective rate, all five student loan plans, the three ways a pension can be paid,
  bonuses spread evenly or paid in a month, and thresholds raised with inflation.
- **Tax codes:** parsing (number, K, BR/D, 0T, NT, S and C prefixes, emergency
  suffixes, invalid codes), 1257L matching the standard calculation, lower codes, K
  codes and their 50% cap, flat-rate codes, S codes using Scottish rates, codes
  replacing the taper, benefits not counted twice, and the code in the projection.
- **Workplace benefits and other income:** medical insurance taxed with no NI, other
  income taxed with your salary (into the higher rate), tax-free income, bonus months
  still adding up, carrying on after retirement only when chosen, and import checks.
- **Leftover money and suggestions:** what's left, each suggestion's trigger
  (shortfall, emergency fund, expensive debts, higher rate, the 60% band, mortgage, ISA
  room, student loan write-off), the suggested splits always adding up to 100% and
  including the emergency fund (and debts when they're expensive), the fund filling to
  your target then passing its share on, leftover money not saved until you choose,
  and older saved splits carrying over.
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
  calculator, how leftover money is shared out (a share a choice can't use going to the
  others, extra debt payments most expensive first, overpayments within the limit) and
  the ISA allowance, what you could spend in retirement, salary and bonus growth, retirement,
  shortfalls, State Pension, taxed pension drawdown, the pension access age, negative
  equity, and debts being paid off.
- **Scenarios:** copying, the limit, rename and delete, differences, comparison,
  one-tap what-ifs, upgrading older data.
- **Detail panels:** every outcome evaluates and lists drivers that exist, changes on a
  copy show before and after without touching your plan, levers report their effect,
  your retirement goal, moving leftover shares, and ideas grouped by outcome.
- **Data handling:** parsing and validation, cleaning up imported data (including ideas
  you've ticked off), export/import round trips, and the "Finish your plan" checklist.
- **Checks on the source:** no code can make network requests, every script is
  loaded, every path stays relative (for GitHub Pages), every asset carries the same
  version, and every route has a screen,
  with Your figures in the header and the views as tabs.

## Accessibility

Checked with axe-core on every screen and in an open detail panel, in light and dark mode (WCAG 2.1 AA, no
violations). Inputs have labels and help text, errors are announced, charts have a
table or keyboard readout (arrow keys), colour is never the only signal, and the layout
works from 320px wide with no sideways scrolling.

- Chart colours are at least 3:1 against the background in both themes. Stacked areas
  have a 2px gap between them and are named on the chart. Scenario lines 5 to 8 are
  dashed, and the legend shows the same dash.
- Buttons and links used often on a phone are at least 44px tall (40px for the header
  and small buttons). Text that carries information is at least 0.8rem.
- Focused fields get a solid 2px ring in the focus colour.
- **Theme:** More → Settings sets System, Light or Dark. The choice is saved in
  this browser. System follows the device setting.
