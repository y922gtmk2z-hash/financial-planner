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
to a screen, such as `…/#plan/year-by-year`, work and need no server rules. The `/docs` folder
holds the build plan only, not the site, so don't choose it as the Pages folder.
`npm test` checks that every path in `index.html` stays relative.

**Privacy on github.io:** browser storage belongs to the whole `<user>.github.io`
origin, so every Pages site under the same account can read and change the
planner's saved figures. Publish it from an account with no other Pages sites, or
use a custom domain, if that matters to you.

**Publishing an update:** every script and the stylesheet in `index.html` end in the
same `?v=` version (for example `?v=2026-10-24.1`). Change it in every tag when you
publish, so browsers fetch the new files instead of a cached copy (GitHub Pages lets
browsers keep files for about 10 minutes). `npm test` checks they all match.

The first time you open it, it starts **empty**, on a **front page**: the app's name,
three steps (answer six quick questions, see your first plan, add detail when you're
ready), a **Get started** button, links to a fictional example or to import a backup,
an **example result** from the fictional sample household (when it's debt-free, its
retirement verdict and its top action, worked out live), and the not-advice notice. Adding
detail is honest about effort: "About 20 to 30 minutes with your payslip and pension
statements. Rough figures are fine, and it saves as you go." It has no header, tabs or footer. Get started opens the
**Quick start**: first, who the plan is for (**Just me** or **Me and a partner**);
then your age, salary, everything going out each month (including
mortgage, bills and debt payments; an estimate is fine), retirement
age, (optionally) what you'd like to spend in retirement, and **Roughly what's in your
pensions and savings now?** (one money box; leave it blank for **Not sure**). That last
figure goes into your pension pots, flagged **Rough** in Your figures (Assets) until you
edit it, and while it's rough it doesn't count towards the plan detail meter or take you
past the first look. With a partner, four
more questions appear after your salary: their name (optional), age, salary and
when they'd like to retire. Those answers give a
**first look** at Plan: what you take home and have left each month, and for
retirement a verdict marked **Rough**: "On course for about £X by 60. You'd need
about £Y." then "Short by about £Z" or "On course". Both figures are in today's
money, from the same calculation Plan uses later: what the projection says
you'd have (with the default 5% + 3% workplace pension) against what you'd need to
spend your goal to the end of your plan. A line says it's based on your answers and
either that it includes your rough figure for pensions and savings or, if you left
that blank, that pensions and savings you already have aren't included yet; the button under it
is **Add your pensions and savings**. It opens Your figures where the gaps are: the
first of Assets, Debts, Income (beyond your salary) and Outgoings (itemised) you
haven't been to yet, or if you've been to them all, the first that's still empty
(never About you, which the quick start has filled).

A **plan detail meter** ("Plan detail: 3 of 6 · Next: your pension pots", with a
bar) sits on Plan (in that card on the first look, under Next steps after)
and at the top of Your figures, where it follows what you type. It counts your age,
what goes out, your salary, pension pots, cash savings and your debts (done once
you've added any or been through Debts, so having none counts), and names the next
one missing. Your figures also starts with **Have these to hand** (folded to one line until you open it): your latest
payslip and P60 (for Income), pension statements or your provider's app (Assets),
your State Pension forecast (About you), your mortgage statement and credit card and
loan statements (Debts) and your student loan balance (Income). Where it helps, each
links to GOV.UK, opening in a new tab: [State Pension forecast](https://www.gov.uk/check-state-pension),
[find old pensions](https://www.gov.uk/find-pension-contact-details),
[student loan balance](https://www.gov.uk/sign-in-to-manage-your-student-loan-balance) and
your tax code in your [personal tax account](https://www.gov.uk/personal-tax-account) (or the
HMRC app). The same links are under "Where do I find this?" on those boxes.
`npm run check:links` checks every GOV.UK link in the code resolves; CI runs it on every
pull request.

**Help me estimate**, under "Everything going out each month" (in the quick start and
Outgoings), works the figure out either from one number (the total money out of your
current account last month) or from four boxes that add up (housing, bills, debt
payments, everything else). **Use £X a month** puts the total in the box. It's open the first time, then folded to one line. Next steps, ideas and the net-worth chart wait
until you've added more (savings, pensions, debts or pay details, or been through
Assets and Debts). The quick-start answers then live under About you in Your figures.

**Sense checks** (in the quick start and Your figures) catch figures typed in the
wrong period. Every monthly money box shows the yearly figure underneath in small
text ("£36,000 a year"), and every yearly box the monthly one. If what you'd like to
spend in retirement is more than twice what goes out now, or more than you take home,
it asks: "That's £480,000 a year. Did you mean £40,000 a year (£3,333 a month)?",
with a button to use that figure. The same goes for everything going out each month
when it's more than 50% over your take-home, and for a salary under £1,000 (did you
mean that a month?) or over £1,000,000 (did you mean a tenth of it?). These never
stop you carrying on. Figures that can't be right are errors instead, shown in red
under the box and not kept: more than £100,000 a month to spend in retirement, or more
than £200,000 a month going out ("More than £100,000 a month can't be right. Check the
figure: is it a yearly amount?"). The quick start won't go on until they're fixed. While
any figure fails a sense check, **Plan** shows one warning line above the verdicts, naming
the figure ("This figure looks wrong, so the results below may be too: what you'd like to
spend in retirement (£40,000 a month). Check it"), with a link to the box.

**Money boxes** show thousands separators except while you're in them. Tab or
Shift+Tab into a box selects the whole figure, so typing replaces it; a click puts the
caret by the digit you clicked.

**The planner opens up in stages**, so there's only a little to take in at a time:

1. **Before the quick start:** just the welcome and quick start. No tabs, no Your
   figures; the More menu has only Your data (to import a backup) and Settings.
2. **After it:** the **Plan** and **Actions** tabs (Plan with its three detail
   sheets), and Your figures.
3. **Once you've added more detail** (savings, pensions, debts or pay details, or
   been through Assets and Debts): the **What if** and **Progress** tabs, Plan's
   **Year by year** and Assumptions too.

A link to a screen that isn't open yet goes to Plan instead. You can also **Load
sample data** (a clearly fictional household, with a banner saying so) from the
welcome screen or Your data. Until you add figures, every screen says to add them to
see results; no illustrative data is used.

## Screens

**Keeping it light:** every screen leads with the answer and folds the rest away.
Explanations ("How this is worked out", "Based on", tax rules, the year-by-year table)
are one-line folds with a summary of what's inside; Assumptions groups fold to their
values, one open at a time; a form box's help shows while the box is empty or you're
in it, then steps aside behind a small "i" by its label. Sections you open or close
stay that way while you move between screens. The sample-data banner (one sentence)
is shown in full once in this browser, then as one line.

**Figures ahead are rounded:** anything five or more years ahead (at retirement, in
the charts, the year-by-year table and the "So what" lines) is shown to three
significant figures, such as £4.20bn, £1.20m, £292k or £3,800 a month (never as an
exponent), so it doesn't look more
exact than an estimate can be. Today's figures stay to the pound.

**How it's laid out:** four tabs, one for each step of the journey: **Plan** (where
you are and where you're heading), **Actions** (what to do next), **What if** (try a
change before you make it) and **Progress** (how it's going). A header stays pinned
(it slides away as you scroll down and comes back as soon as you scroll up) with
**Your figures** and a **More** menu (Assumptions, Your data, Settings). On a phone
the tabs step aside while you type in a field, so the keyboard has room. From 900px
wide the tabs become a side menu next to a wider page.

**Your journey:**

1. **Your figures** (header), in five sections (section by section unless you choose
   one page):
   - **About you:** your age, when you'd like to retire, what you'd like to spend
     in retirement and **how you feel about investment risk** (cautious, balanced,
     adventurous or not sure yet). Under it, the three typical mixes, each with its
     trade-off in one line and the not-a-recommendation notice (see
     [What each pot is invested in](#what-each-pot-is-invested-in)).
   - **Income:** your salary, then the rest of your pay, each part shown
     folded with a one-line summary: workplace pension, **student
     loan** (repaid from your pay, so it lives here rather than under Debts),
     bonuses, salary sacrifice, **workplace benefits**, tax code and where you live,
     and other income.
   - **Outgoings:** your estimate of everything going out each month, then three
     folds to itemise it: **Bills**, **Debt payments** (your mortgage payment and
     each other debt's name and payment, which show under Debts too) and
     **Other**. Whatever of your estimate isn't itemised yet counts as other
     spending ("Rest of your estimate"); if you itemise more than your estimate,
     what you've itemised is used. A debt payment counts once its debt has a
     balance under Debts. Then what you save each month, then **money left over each month**: a
     suggested split to use in one tap, with your own split and ideas folded away.
   - **Assets:** what you own today. Under each pension, ISA and other investment,
     **What it's invested in** folds open to its mix of shares, bonds and cash.
   - **Debts:** your mortgage and other debts. For each, give the **balance** and
     any two of **monthly payment**, **time left** (in months or years) and
     **interest rate**, and the third is worked out and shown under it (for example
     "Interest rate worked out from your payment and time left: about 6.6% APR").
     Loans and cards ask for the **APR**, the true yearly cost, so interest is
     charged monthly at (1 + APR)^(1/12) − 1. The mortgage asks for the **yearly
     rate on your deal, not the APRC**, charged at rate ÷ 12 a month, as lenders do.
     A blank rate that can't be worked out uses the default (other debts: the
     Assumptions rate; mortgage: 4.5%), and the note says so.
2. **Plan** answers four questions, each with a verdict and its top
   recommendation: **Each month** (take-home, what's left over, emergency fund),
   **Debt-free** (mortgage, student loan, other debts), **Retirement** (the
   **earliest you could retire at your target spending**, worked out by goal-seek on
   your retirement age up to 75 with nothing else changed; how long your money lasts
   across **market paths**, "Lasts to 95 in 9 of 10"; money lasts to, could spend in
   retirement, savings and pensions when you retire, and how much you'd need) and
   **Next steps**. Each card ends with a link to the figures behind
   it.
   - **Where you stand today** opens as a detail sheet over your plan, from the
     links under Each month ("In detail: Cash flow this month · What you own and owe
     · Pay and tax") or from your net worth today: **This month** (cash flow),
     **What you own and owe** (net worth, owned against owed, home equity and the
     mortgage) and **Pay and tax**. Closing a sheet takes you back to your plan.
   - **Net worth over time** is a stacked chart of what it's made of: home
     equity, cash savings, ISAs, other investments, pensions and other assets,
     with debts, your student loan and any shortfall below zero.
   - **See year by year** (under the net worth chart) opens the full projection,
     with a link back to your plan.
3. **Tap any figure** to open its detail panel: the result and a chart, the inputs
   and assumptions that drive it (change them right there), a before-and-after
   comparison as you type, the changes that would help most (**Try it**), and the
   recommendations for it. **Apply to my plan**, **Save as a scenario**, or undo.
   Nothing changes in your plan until you choose; closing a panel with changes you
   haven't applied or saved asks first.
4. **Actions** lists what to do next, ranked, with Apply, Try as a scenario and a
   reminder for each (see [Actions](#actions)).
5. **What if** tries changes side by side before you make them, and works out what
   it would take to reach a goal.
6. **Progress**: check in every three months, or when your pension statements
   arrive, with your balances, and see what you have against what your plan expected.

Every figure has one home in Your figures; other screens link straight to the field (for
example `#setup/income.grossSalary`). Until your age and monthly spending are entered,
Plan, Year by year and What if show a **Finish your plan** checklist instead of a
projection. The disclaimer is shown in full on your first visit (unless you came from
the front page, which shows it), then as one line you can open; this is remembered in
this browser. The scenario picker appears once you have more than one scenario, with
the first one shown as "Baseline"; its **Compare** link opens What if. Each tab opens
with a one-line subtitle (Plan: "Four questions, answered"; Actions: "What to do next,
most valuable first"; What if: "Try a change and compare"; Progress: "What you have
against your plan"). **Your figures** is always in the header, so the screens don't
repeat it as a button; cards end with an **Edit your figures** link instead. On a
390 × 844 phone the first figure on Plan starts within the top 45% of the screen,
with or without the sample. Each chart has a one-line "So what" under it.

### Glossary

The same measure has the same name on every screen (the names live in one place,
`FP.dom.MEASURES` in `js/ui/dom.js`), and detail panels say what each includes:

| Name | What it is |
| --- | --- |
| **Savings and pensions** | Cash, ISAs, other investments and pensions. Not your home. |
| **Pension pots** | Your pensions only. |
| **Net worth** | Everything you own, your home too, minus everything you owe. |
| **Money lasts to** | The age your savings and pensions last to, spending your retirement goal each month; "95+" when they last to the end of your plan. |
| **Could spend in retirement** | The most you could spend each month from retirement, in today's money, without running short. |

| Screen | Where | What it does |
| --- | --- | --- |
| **Plan** | first tab, `#plan` | The four outcome cards above, each figure opening a detail panel; your net worth today and over time; next steps; any notes. |
| **This month** | sheet on Plan, `#plan/cash-flow` | Cash flow: take-home − spending − mortgage − other debts − regular savings = left over, with bonus months. |
| **What you own and owe** | sheet on Plan, `#plan/own-and-owe` | Net worth, what you own against what you owe (with a table), home equity, and mortgage payoff with and without overpayments. |
| **Pay and tax** | sheet on Plan, `#plan/pay-and-tax` | Income tax by band for the rest of the UK or Scotland, National Insurance, pension method, student loan, each bonus month, how much of a £100 rise you'd keep, and the figures it's based on with Change links. With a partner, a **Whose pay?** switch and what you take home together. |
| **Year by year** | from Plan, `#plan/year-by-year` | The projection to your end age (95 unless you change it), in today's or future money: **Life events** and money left over each month (folded above the results), headline figures (money lasts to; savings and pensions, pension pots and net worth when you retire; mortgage-free; student loan), net worth and home equity with the **market paths** (a dashed middle path, a shaded range holding 8 in 10 paths; how long your money lasts across them is on Plan's retirement card), a stacked chart by component, life events marked on both charts, and a full year-by-year table with **Download CSV** in today's money or future money. |
| **Actions** | second tab, `#actions` | One card per idea, ranked, with Apply, Try as a scenario, Done, Not for me, how to do it and a reminder. |
| **What if** | third tab, `#what-if` | Your plan is the **Baseline**. Try a one-tap **what-if** (retire 2 years earlier, work 2 years longer, overpay £200 a month more, spend 10% less, a 10% pay rise, weaker markets: shares and bonds 2 points lower), a **life what-if** (go four days a week, six months out of work, move house, have a child, help a child through university: each a life event starting next year that you can edit, from **Edit it**), work out **what it would take** to reach a goal, save one from any detail panel or Actions, or copy your plan and change anything; compare up to 8. Each scenario is your Baseline plus its own changes, so a change to the Baseline (in Your figures, or an action you apply) carries into every scenario, and each scenario's list of differences stays just its own; editing a scenario changes only that scenario. **Make this my plan** (in a scenario's ⋯ menu) makes it your Baseline after you confirm, and the other scenarios keep their own changes on top of it; the old Baseline is kept as "Previous plan (date)". The comparison opens on what's different from the Baseline, leading with **money lasts to** and **could spend in retirement**, then net worth at one age for every scenario (the Baseline's retirement age, named in the label), in £ and years, green better, red worse; **Show all figures** opens the full table; an overlay chart follows. At 8 the page says why you can't add more. |
| **Progress** | fourth tab, `#progress` | Since last time, a chart of what you had against what your plan expected, and every check-in. **Check in** is `#checkin`. |
| **Your figures** | header, `#setup` | Five sections: **About you** (age, retirement age, spending goal, your State Pension amount and age under a fold, with the link to check your forecast, and risk), **Income** (salary, then each part folded: pension, student loan, bonuses, salary sacrifice, workplace benefits, tax code, other income), **Outgoings** (an estimate of everything going out, itemised under Bills, Debt payments and Other; regular savings; money left over each month), **Assets** (with what each pot is invested in) and **Debts** (mortgage, other debts, each folding to a one-line summary once it has a balance). Section by section, or on one page as five headings with summaries, one open at a time. A strip above the tabs shows what the section you're in changes, as you type: About you, what you could spend in retirement; Income, take-home; Outgoings, what's left over; Assets and Debts, net worth. The Back and Next buttons sit straight under the section, above the strip. |
| **Assumptions** | More menu, `#assumptions` | Economic assumptions only (growth, inflation, returns, fees, tax policy), editable, with the date each default was set, per-item reset and **Reset all to defaults**. Personal facts entered in Your figures (retirement age, State Pension amount and age, mortgage rate, pension %) are listed in one line with a link there, and resetting leaves them alone. |
| **Settings** | More menu, `#settings` | Theme (System, Light or Dark) and whether projections show today's or future money, saved in this browser only. |
| **Your data** | More menu, `#data` | Privacy notes, when you last exported a backup, JSON export/import, load sample data, and **Clear all data**. |

**Older links still work:** `#overview` and `#now` open Plan; `#now/month`,
`#now/own` and `#now/pay` (and the even older `#today` and `#income`) open the
matching detail sheet; `#future` opens Year by year; `#scenarios` opens What if.

Basic inputs are shown first; less common ones are folded away. Opening a folded
section closes the others beside it, so one is open at a time. Every input
is checked as you type, with plain-English errors. Blank boxes count as £0.

## Your data and privacy

- Everything is saved in your browser's **local storage on this device only**. There
  are no accounts and no server, and the page's Content Security Policy blocks all
  network connections (`connect-src 'none'`).
- **Export** saves every scenario to a JSON file (your Baseline in full, and each
  other scenario as just what it changes); **Import** loads one back (it is
  checked and cleaned up first). Saves and backups from every earlier version still
  load: each is upgraded one numbered step at a time (`js/model/migrate.js`). A save
  or backup from a newer version than the page is refused with a message saying so.
- **Clear all data** removes everything the planner stored in this browser. It says what
  will go and asks you to type DELETE first.
- **Export a backup** is also on Plan. Once you've changed your figures, Plan
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
| Shares, bonds, cash in a pot (set 25 Oct 2026) | 6.5%, 4.0% and 3.5% a year before fees; volatility 16%, 6% and 1% |
| What each pot is invested in | 40% shares, 60% bonds (5.0% a year before fees) |
| Change to shares and bonds returns | 0 points |
| Fees | 0.4% on ISAs and other investments, 0.5% on pensions |
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
| Outgoings (new plan) | one estimate of everything going out; itemise it if you like |
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

At the end of Your figures (and on Year by year), **Money left over each month** shows how much is left
each month after spending, mortgage and debts, and regular savings. Bonus months add
more. You then choose what to do with it: your **emergency fund**, **paying off debts
faster** (most expensive first), **cash savings**, **investments** (ISA first),
**mortgage overpayments** or **extra pension contributions**. Each choice shows what it
comes to in £ a month, and the projection shares out each year's left-over money the
same way. Enter your choices as **% of what's left** or as **£ a month**: switching
converts what you've entered, each choice shows the other unit alongside, and £ amounts
rise with prices in the projection (if they add up to more than is left in a year,
they're scaled down to fit). **Nothing is saved until you choose:** a new plan starts with nothing chosen,
and any part you don't allocate is treated as spent, not put into savings. Plan
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

Behind the scenes, each idea that comes down to one change in your plan carries it
as a **patch** (for example "pay 3% more into your pension"), and the planner can
work out its **impact**: what it does to what's left over each month, what you could
spend in retirement, your savings and pensions when you retire, the age your money
lasts to, when you're debt-free and the total interest you pay. The one-tap what-ifs
in What if are patches too.

## Actions

**Actions** (the second tab, `#actions`, open once you've done the quick start; also
from **Next steps** on Plan) has one card per idea, ranked by its **value a year in £**:
interest saved a year (for the mortgage or a debt: the interest it saves, spread over
the years it makes a difference), extra retirement income a year (today's money), or tax
saved a year. The order is:

1. **Decide what to do with your £X left over**, whenever money left over has no job
   yet (nothing chosen under Money left over each month). It applies the suggested
   split. Every other action's figures are then measured **on top of that split**, so
   their gains aren't just "start saving" counted again.
2. **Safety problems**, whatever their value: short each month, no emergency fund
   (shown in **months of cover**, never in retirement income), and debt over 20% APR.
3. Everything else, most valuable first. Ideas with no figure in £ (check for employer
   matching, the State Pension check) come after.
4. **Smaller ideas**: worth under £100 a year, folded away.
5. **When you have room**: changes that cost more each month than you have left over,
   with nothing smaller worth doing, shown without Apply.

When a change costs more than is left over but a smaller one fits, the card offers it:
**Apply £44 a month (what you can afford)**, with its own figures. Each card says why in
one line and shows up to two figures: its value a year, then what it costs ("saves about
£222 interest a year", "£44 a month less left over now"). The emergency fund waits until
you've answered your cash savings (entered some, or been through Assets).

Big-ticket checks also appear here:

- **Your fixed rate ends in March 2027**, when the fix (Debts › Mortgage, **Fixed rate
  ends** and **Rate you expect after**) ends within 12 months: how much payments could
  rise, and when to start comparing deals.
- **The £100k tax trap**: with adjusted net income between £100,000 and £125,140, the
  pension contribution that brings it to £100,000 (to 0.1% of salary) and the tax saved.
- **Claim higher-rate pension relief**: with a relief-at-source pension and a 40% or
  higher rate, the £ a year to claim through Self Assessment.
- **Check your State Pension record**: below the full amount, with a link to
  [Check your State Pension](https://www.gov.uk/check-state-pension).

Then:

- **Apply** makes the change in the scenario you're editing. A message offers
  **Undo** for 10 seconds, and the card moves to a folded list marked **Applied**,
  with Undo there too for the rest of your visit (as long as nothing has changed
  since).
- **Try as a scenario** adds a copy of the scenario you're editing with the change
  made, and opens What if to compare.
- **✓ Done** or **Not for me** moves it to the same folded list, which you can bring
  ideas back from.
- **How to do it** gives two to four steps with the figures worked out from the change
  (or the part you can afford), naming no providers or products:
  - pension: "Ask payroll or HR to raise your contribution from 5% to 8%: about £146 a
    month going in, costing you about £88 after tax relief" (the cost follows your tax
    band and how your pension is paid: salary sacrifice also saves NI and student loan);
  - ISA: the monthly amount, the allowance left and the days until 5 April;
  - mortgage overpayment: the monthly amount and the yearly 10% limit in £;
  - debt: the new monthly payment and the month it's cleared;
  - claiming relief at source, a fixed rate ending, and the State Pension check have steps too.
- **By** a date, where there is one: ISA, 5 April; claiming higher-rate relief through
  Self Assessment, 31 January; a fixed rate ending, six months before it ends.
- **Remind me** downloads a calendar reminder (an `.ics` file, made in your browser,
  nothing sent) for a date you pick (its due date to start with), with the steps in it.

**Your commitments.** Applying an action, or marking it done, records a commitment in the
scenario: `{ action, what, amount, due, status }` ("Overpay your mortgage by £44 a month",
to do or done). Plan shows a **Your commitments** card (what, how much, by when, done or
not, ticked off there); bringing an action back takes its commitment off.

**Use the suggested split** (or, with nothing chosen yet, **Decide what to do with your
£X left over**) is an action too, making exactly the change **Use this split** makes, so
the advice and your plan can't disagree. When your emergency fund is short and you've
chosen a split of your own, "Build your emergency fund" makes that change instead (it's
the same split). Plan's other screens still show ideas under Money left over each month.

A **suggested split** follows from these, and always includes the emergency fund:
80% while it's below your target (50% with 40% to expensive debts if you have both),
then 10% to keep it topped up, with 70% to paying off expensive debts if you have any.
**Use this split** applies it (the same change as the action). This used to be the "surplus split" in Assumptions;
existing saved splits carry over.

## What each pot is invested in

Each pension pot (yours, your partner's and each other pot), your ISAs and your other
investments has a **mix**: how much is in shares, bonds and cash. Under each one in
Assets, **What it's invested in** shows the mix and what it grows at after fees
("40% shares, 60% bonds · about 4.6% a year after fees"). Open it to change the
shares and bonds percentages (cash is the rest), with a line on growth against the
size of falls: "Grows about 4.6% a year after fees on average. In a bad year (about
1 in 20) it could fall by about 12%."

- **Growth comes from the mix:** each asset class has a return and a volatility in
  Assumptions (**Shares, bonds & cash**, set 25 Oct 2026). A pot grows at its mix's
  average return, less its fees (investment or pension fees). **Change to shares and
  bonds returns** (in its Advanced part) adds points to both, for weaker or stronger
  markets. The main projection uses the averages. Volatility sizes the falls (taking
  the three asset classes to fall together) and drives the market paths on Year by year.
- **A new pot is 40% shares, 60% bonds**, which grows at 5% a year before fees, as
  every pot did before mixes.
- **Saves from before mixes** keep exactly the same growth: their investment and
  pension returns become mixes and a change to shares and bonds returns that give
  the same rates (version 6 → 7).

**Your risk level** (About you) shows **a typical mix for this risk level** beside
each pot: cautious 20% shares, 60% bonds, 20% cash; balanced 60% shares, 35% bonds,
5% cash; adventurous 90% shares, 10% bonds. These are illustrations for people with
that risk level, in the spirit of the FCA's targeted support (suggestions for people
with common characteristics, not personal recommendations), and name no products,
providers or funds. Beside every one: "An illustration for people with this risk
level, not a recommendation for you. Consider regulated advice."

- **Use this mix** (beside a pot) gives that pot the typical mix, with Undo; **Try as
  a scenario** adds a copy of your plan with the change and opens What if.
- **Actions** has **Use a typical cautious (balanced, adventurous) mix** once you've answered the risk
  question, for every pot that doesn't have it yet (your pension and ISAs, and any
  other pot with money in it), with its trade-off, the notice, Apply, Try as a
  scenario and how to do it. It's a patch like every other action.
- What if lists a changed mix among a scenario's differences.

## Market paths

The net worth chart on Year by year shows a range, not just one line. Your plan is run 1,000
times with each year's returns for shares, bonds and cash in pots drawn at random
around their averages, as far as their volatility in Assumptions says (each asset
class on its own; cash savings and house prices stay at their averages). Each path
spends your retirement goal from retirement, as "money lasts to" does.

- **The chart** keeps the solid net worth line (average returns every year, the
  figure every other screen uses) and adds the **middle path** as a dashed line and a
  shaded range holding **8 in 10 paths** (10th to 90th percentile). The middle path is
  usually a little below the solid line: ups and downs cost growth even when they
  average out.
- **The headline**, on Plan's retirement card: "Lasts to 95 in 8 of 10" market paths,
  and if not every path lasts, the age the middle path runs short. (Year by year keeps
  the chart.)
- **Same plan, same answer:** the random numbers are seeded from your plan, so the
  same figures always give the same paths.
- **Never while you type:** the paths start 0.6 seconds after you stop, a slice at a
  time between frames so the page stays responsive ("Working out market paths… 40%"),
  and are remembered for that plan. If the first 50 paths show that 1,000 would take
  your device more than 300ms, it runs 500 instead. (On a desktop 1,000 take about a
  second, so most devices run 500.)

## Life events

Under **Life events** on Year by year (also linked from Outgoings in Your figures, as
`#plan/year-by-year/events`), add costs you can see coming, or money you expect,
in today's money: a **house move**, **moving to a new home**, **childcare**, **school
fees**, **university help**, a **career break**, **fewer days a week**, **time out of
work**, a **car**, a **wedding**, an **inheritance** or something else. Each has a name
(optional), an amount (a month or a year for some years, or a lump sum once), the
years and, with a partner, whose it is. Presets fill in a sensible shape
(childcare: a month for 4 years; a wedding: a lump sum).

- A cost is added to that year's spending, rising with prices. Money coming in each
  month is added to that year's income; an inheritance goes into cash savings.
- A **career break** stops its owner's salary, bonuses, salary sacrifice, benefits
  and workplace pension contributions for those years (other income carries on), with
  anything still coming in each month added after tax.
- **Fewer days a week** pays the share you set (four days: 80%) of salary, bonuses and
  workplace pension, from its start year until its end year, or until you retire.
- **Time out of work** stops pay for the months you set (six by default) from the start
  of that year; spending carries on.
- **Moving to a new home** sells your home at the start of that year and buys the new
  one at its price, with a new mortgage over its term at your current rate; what's left
  of the sale goes into cash, or a bigger deposit comes out of it, with the moving costs.
- What if's **life what-ifs** add one of these to a copy of your plan: four days a week
  from next year, six months out of work next year, a move to a home a quarter dearer,
  childcare for ages 1 to 4 for a child born next year (£1,000 a month), or £5,000 a year
  for three years of university help.
- Each event is marked on both Year by year charts in the year it starts, and its amounts
  are in the year-by-year table (in Income and Spending).

## What would it take

On What if, **What would it take to…** asks for a goal: **retire at an age** (with
your money lasting to your end age), **spend an amount a month in retirement** (today's
money) or **be debt-free by an age**, and one thing to change:

| Goal | What can change |
| --- | --- |
| Retire at an age | your pension contribution, or what you spend each month |
| Spend in retirement | your pension contribution, when you retire, or what you spend each month |
| Be debt-free | extra payments (the same amount a month on each debt still owing at that age: mortgage, other debts and student loan), or what you spend each month (only if some of your leftover money goes to debts or the mortgage) |

It finds the least change that reaches the goal by bisection (the same approach as
"could spend in retirement"), rounded so it still does: pension to 0.5%, spending and
payments to £10, ages to a year. Each lever stays within what you could do:

- your pension contribution: no more than what's left over each month plus what you
  pay in now, and within the £60,000 annual allowance including your employer's;
- when you retire: no later than 75;
- what you spend: no lower than your bills (your debt payments aren't touched). Bills
  stay as they are and every other category, and your estimate, change by the same
  share. With no bills itemised, a quarter of what you spend now is the floor.

The answer ("To spend £3,500 a month in retirement, you'd need to pay 9.5% of your
salary into your pension (now 5%)") comes with **Apply** (with Undo) and **Try as a
scenario**. If the goal can't be reached within those limits it says **Not reachable
by changing this alone. Closest: …** (for the sample household's £4,600 a month by the
pension: paying 6.5%, the most it can afford, which gets about £3,816 a month) and
offers only **Try as a scenario**. When the goal is already met, it says so.

## Check-ins and Progress

Every three months, or when your pension statements arrive, **Check in** (`#checkin`,
from Progress or Next steps on Plan): today's balances are filled in from your plan
(cash savings, ISAs, other investments, pension pots, the mortgage and each debt; with
more than one pension, a box for each pot, added up as you type), with what you entered last time under
each. Confirm or change each one and save; it takes about two minutes. If you have
commitments still to do, it asks **Did you do these?** and ticks off the ones you have. The new
balances go into every scenario (they're facts, not what-ifs), and a snapshot is
kept: the date, your balances, net worth, savings and pensions, the actions you'd
applied, and what your plan expected for that date at the previous check-in. Every
snapshot is kept for 24 months, then one per quarter. They're in your exports and
come back when you import one.

**Progress** (`#progress`, also from Next steps) shows **Commitments kept** ("2 of 3",
with what's still to do and anything past its date), **Since last time** (change
in net worth, debts paid down, actions applied, and how far ahead of or behind your
plan your savings and pensions are), a chart of what you had against what your plan
expected, and a table of every check-in.

**Add quarterly check-ins to my calendar** (on Progress, including straight after a
check-in) downloads a repeating calendar reminder (`RRULE:FREQ=MONTHLY;INTERVAL=3`,
or every month if you choose) from a day you pick, made in your browser.

Plan prompts you to **update your balances** once your last check-in is three months
(90 days) old, and says when a **new tax year** has started (on or after 6 April) but the
tax rules are still last year's. "Not now" puts either off for 30 days.

## Printing

**Print or save as PDF** (under Next steps on Plan) prints **your plan on a page**, one
A4 page: who it's for, income, each pension (and State Pension), debts, the verdicts,
retirement figures, your commitments (or, with none yet, the top three actions), only
the assumptions you've changed, then "All other assumptions are defaults set on
<date>", and the not-advice notice. **Include every assumption** adds a second page with
every economic assumption in one line each. The browser's own Print gives the same.
No header, tabs or buttons, and always black on white, even in dark mode. A journey test
saves it as a PDF and checks it's one page, and at most two with every assumption.

**CSV for spreadsheets:** the year-by-year table (Year by year, in today's money or
future money) and your commitments (Plan) download as CSV files, made in your browser
like the JSON backup.

## Households

The planner can plan for **you and a partner** together, and for **more than one
pension**. A plan with just you works exactly as before: every result is the same,
to the penny.

On screen:

- **Quick start and About you** ask who the plan is for, **Just me** or **Me and a
  partner**. Your partner's questions only appear once you choose a partner. About
  you then also has your name and theirs (both optional), their age and retirement
  age, and their State Pension (amount and age) under a fold. Switching back to Just
  me asks first if you've entered anything for them; their figures are kept until you
  close the planner, so choosing a partner again brings them back.
- **Income** in Your figures has a **Whose pay?** switch: the same boxes and editors
  (pension, student loan, bonuses, salary sacrifice, benefits, tax code, other
  income) for you or for your partner. The **Pay and tax** sheet on Plan has the same switch,
  each payslip on its owner's own allowance, and what you take home together.
- **Assets** has each of your pension pots, a **Who owns what** fold (you, your
  partner or both of you), and **Other pensions**, with **Add a pension**: each is a
  pot (its value, the age it can be taken from, and anything paid in each month) or a
  defined benefit pension (what it pays a year, and from what age). With a partner,
  each pension, debt and regular saving says whose it is.
- **Results name the person where it matters:** "Sam's ISA allowance", "Use Sam's
  pension to avoid the 60% band", "Sam's student loan written off", and retirement
  "once you've both retired (you at 63 and Sam at 60)". You are always "you"; your
  partner goes by their name, or "your partner" without one. The pension and student
  loan ideas are for whichever of you they apply to (you first); the ISA idea fills
  your allowance, then your partner's.

How a couple is worked out:

- **Each of you** has your own salary, bonuses, salary sacrifice, tax code, where you
  pay tax, student loan, other income, retirement age and State Pension (amount and
  age). Income tax, National Insurance, student loan repayments and the personal
  allowance taper over £100,000 are worked out for each of you separately (no
  marriage allowance), then added together for the household's take-home.
- **Spending, money left over, regular savings and the emergency fund** are the
  household's. Each regular saving uses its owner's ISA allowance; money left over
  for investments fills your ISA allowance, then your partner's. Its pension share is
  split equally between those of you still working.
- **Retirement comes in stages:** each salary stops at that person's retirement age,
  and each State Pension starts at its owner's State Pension age. Your retirement
  goal, and "money lasts to", start when the later of you retires. Ages on the charts
  and the plan's end age are yours.
- **Pensions:** besides each of your main pots, a pension can be a **pot** (defined
  contribution: its value, the age you can draw it from, 57 unless you say, and
  anything you pay in each month from your take-home pay, with 20% relief added) or a
  **defined benefit pension** (a yearly income in today's money from its start age,
  rising with inflation and taxed as its owner's income, with your pay if you're still
  working; no lump sum). A shortfall in retirement is met from pots whose owner has
  retired and reached the pot's access age, shared in proportion to their size, each
  taxed with that owner's income.
- **Who owns what** (you, your partner or joint) is recorded on assets, the mortgage,
  debts and regular savings. Apart from ISAs and pensions, which follow their owner,
  it doesn't change the figures.

## Regular savings

Under **Regular savings** in Your figures, add monthly amounts into **cash savings**, a
**cash ISA** or a **stocks & shares ISA**. Each can stay the same or rise with your
pay. They:

- come out of what's left after spending and debts. Plan's This month sheet shows "left after spending
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
(Plans 2 and 4, postgraduate) or 40 years (Plan 5). The Pay and tax sheet, Year by year and
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
each month (shown on Plan's This month sheet with your debt payments), and stop once the loan is repaid or
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
2. **Growth** — home and cash grow at their own rates; each ISA, other investment and
   pension pot grows at the rate its mix gives, after fees.
3. **Debts** — the mortgage is paid down month by month (fixed payment plus
   overpayments, so overpayments shorten the term; the payment is recalculated from
   the month after your fixed rate ends, at the rate you expect after). Other debts are paid until cleared.
4. **Spending** grows with spending growth and carries on unchanged in retirement.
   Life events that year are added on (or, for money coming in, added to income; an
   inheritance goes straight into cash savings).
5. **Leftover money** first repays any earlier shortfall, then is shared out as you
   chose: the emergency fund (cash, up to your target), extra debt payments (most
   expensive first), cash, investments (ISA first, up to the allowance), a mortgage lump
   sum (within the overpayment limit) and pension (with 20% relief added). A share a
   choice can't take goes to the others in proportion.
6. **Deficit** — in retirement, drawn from your pension first (from the access age;
   25% of each withdrawal tax-free, the rest taxed as income), then cash, then
   investments. Anything left is shown as an unfunded shortfall, with a warning.

In the code, `initState` sets up where you start and `stepYear` runs one year in
the order above; `project` loops it. Each year gets its rates of return (before
fees: cash savings, your home, and shares, bonds and cash in pots) from the
assumptions, or from an optional year-by-year path (the market paths use one), and
your life events.

**Not modelled:** tax on savings and investments, higher-rate relief on extra pension
contributions, student loan repayments on pension income, holding both an
undergraduate and a postgraduate loan, the pension lump-sum allowance, inheritance tax (enter an inheritance after it), and changes to your mortgage
after its term. Money moves at the end of each year, so contributions start growing
the following year.

**Could spend in retirement** (Plan and What if) re-runs the projection
to your end age, the same age the charts run to, to find the highest monthly
spending from retirement (in today's money) that never runs short. It doesn't sell your
home; mortgage and debt payments are on top. The **range on the net worth chart** comes
from the market paths (below).

## Project layout

```
index.html                 shell, navigation, disclaimer, CSP
css/styles.css             mobile-first styles; light and dark themes
js/config/assumptions.js   every assumption: label, unit, default, range, help, date set
js/config/tax-2026-27.js   UK tax, NI and student loan rules for one tax year
js/model/profile.js        the shared data model: fields, parsing, validation, normalising
js/calc/csv.js             CSV files: the year-by-year table and your commitments
js/model/commitments.js    your commitments from Actions: record, tick off, count kept
js/model/scenarios.js      workspace of scenarios: the Baseline plus a patch each; copy, rename,
                           delete, differences
js/model/sample.js         fictional sample household and example scenarios
js/model/migrate.js        numbered steps that upgrade older saves and backups
js/model/store.js          localStorage, export/import, clear
js/calc/*.js               pure calculations (no DOM): mortgage, summary, tax,
                           student loan, growth, projection, compare
js/calc/mix.js             what each pot is invested in: growth, falls, model mixes
js/calc/paths.js           market paths: seeded random returns, percentiles
js/calc/goalseek.js        what would it take: one lever to reach a goal
js/calc/patch.js           patches: what an idea or what-if changes, applying it, its impact
js/calc/outcomes.js        the results you can tap into: drivers, levers, before/after
js/ui/*.js                 one file per screen, plus field, chart, checklist, panel
                           (sheet.js, explore.js) and DOM helpers
js/app.js                  routing, saving and the scenario picker
tests/*.test.js            node:test unit tests
tests/fixtures/*.json      five example households for the golden snapshots
tests/golden/*.json        today's results for each fixture (see Tests)
tests/journey/*.spec.js    journey tests in a real browser (Playwright, axe-core)
docs/PLAN.md               build plan
```

Scripts are classic scripts sharing one `FP` namespace (not ES modules), so the page
works when opened from `file://`. Calculation and model code never touches the DOM,
so the tests load it straight into Node.

## Tests

```
npm test               # Node 18+, no dependencies needed
npm run test:journey   # needs `npm install` and `npx playwright install chromium`
```

Playwright and axe-core are development dependencies for the journey tests only;
the site loads nothing new. A GitHub Actions workflow (`.github/workflows/tests.yml`)
runs both on every pull request.

**Journey tests** (`tests/journey/*.spec.js`) open the planner from `file://` in
Chromium at 390px and 1280px wide, and fail on any console error:

- the quick-start persona (38, £85,000, £3,200 a month, retire at 60, £3,000 a month)
  reaching a verdict;
- Tab, Shift+Tab, click and select-all on every money box in the quick start, with
  the typed figure replacing the old one;
- £40,000 a month in retirement showing the yearly check and Plan's warning line,
  and impossible figures as errors;
- the sample household with **Use your ISA allowance** applied to the Baseline: the
  other scenarios' change summaries on What if stay the same;
- old links (`#now`, `#now/month`, `#future`, `#scenarios`, `#overview`) landing on
  the right screen;
- printing Plan in at most 3 pages;
- every screen opening without console errors, and axe-core on every screen in light
  and dark mode with no serious or critical violations.

342 unit tests cover:

- **Scenarios as patches:** a scenario's patch rebuilding it exactly (every fixture),
  rows patched by id following the row, patches from files cleaned, an action applied
  to the Baseline reaching every scenario with their differences unchanged, editing a
  scenario changing only its patch, Make this my plan keeping the others' patches,
  saving and exporting only patches, and version 8 workspaces upgrading (migration 9)
  with the same figures and golden results.
- **Sense checks and big figures:** the yearly check at £40,000 a month, errors over
  £100,000 (retirement) and £200,000 (outgoings) a month, Plan's warning line naming
  the figure, and £bn rounding (£116bn, £4.20bn) with no exponent.

- **Market paths, life events and what would it take:** the seeded generator and a
  seeded run repeating exactly (in chunks or all at once, and cut to fewer paths),
  every path equal to the fixed-rate projection with zero volatility, paths spreading
  around the fixed line, "8 of 10" in words; lump sums once and monthly amounts each
  year in today's money, an inheritance into cash, a career break stopping its
  owner's pay and pension only, events checked on load, version 7 saves matching the
  golden results, a partner's events kept; goal-seek answers meeting their goal within
  £10 a month or a year, being the least change, saying when nothing's needed or it
  can't be done, and the spending change sticking.
- **Ranking, affordability and big-ticket checks** (`tests/brief14.test.js`): debt over
  20% APR as a safety problem, value a year by kind, interest saved a year, smaller
  ideas, the emergency fund waiting for your cash savings, the £100k tax trap (the
  contribution and tax saved), relief at source to claim, the State Pension check,
  a fixed rate ending (when, and the payment rise) and its effect on the projection,
  month-and-year fields, migration 10 (the old "rate changes after N years" becoming
  the month the fix ends, in plans and scenario patches), rough figures, and goal-seek
  limits (the sample household's £4,600 a month by the pension is out of reach and
  never 52.5%; the annual allowance; retiring by 75; spending no lower than bills).
  The golden snapshots also hold each idea's value a year, affordability and figures,
  the Actions order, and what it would take to spend 20% more by each lever.
- **Plan answers, life what-ifs, CSV and check-ins** (`tests/brief16.test.js`): the
  earliest retirement age (that age works, a year earlier doesn't), fewer days a week,
  months out of work, moving home (price, mortgage, what's left of the sale), yearly
  amounts, the five life what-ifs, CSV quoting and both kinds of money, repeating
  calendar reminders, a check-in balance for each pension pot, and migration 12.
  Journey tests: the retirement card, a life what-if edited under Life events, CSV and
  calendar downloads, and the plan on a page's page count.
- **Steps, deadlines and commitments** (`tests/brief15.test.js`): pension steps with
  what goes in and the cost after relief for each band and method, ISA days to 5 April,
  the mortgage limit in £, the month a debt is cleared, steps for the part you can
  afford, due dates (5 April, 31 January, six months before a fix ends), commitments
  (one per action, ticked off, counted, saved and loaded), migration 11, and your State
  Pension in About you. The golden snapshots also hold each idea's steps, due date and
  commitment.

- **What each pot is invested in:** the asset-class assumptions, the default mix
  giving exactly 5% before fees, each pot (yours, your partner's, other pots)
  growing at its own mix less fees, the market shift, model mixes trading growth
  against falls, the notice and no "you should", saved mixes checked, Use this mix
  for one pot or all as a patch on a copy, the action (only with a risk level, and
  not among the ideas in the golden snapshots), version 6 saves loading with the
  same results (every fixture against its golden snapshot) and with changed returns
  keeping exactly the same growth, and Weaker markets matching an old save with
  returns 2 points lower.

- **Golden snapshots:** five households in `tests/fixtures/` (the sample, a quick
  start, a taper case in Scotland with Plan 2, pension salary sacrifice, a bonus and
  a car scheme, someone near retirement, and a stretched budget with debts). For
  each, `tests/golden/` holds today's take-home pay, today's summary, every projection
  row, what you could spend in retirement, how much you'd need, the pot you'd need,
  and the ideas and suggested split, to the penny, as if run on 24 Oct 2026. Any
  change is listed by path with its old and new value. If results are meant to
  change, run `GOLDEN_UPDATE=1 npm run golden:update` (it refuses without
  `GOLDEN_UPDATE=1`) and say in the pull request which values moved and why.
- **Patches:** setting and adding values by path on a copy (never the original),
  undoing a patch, refusing unknown changes, impact signs (a pension increase lowers
  what's left over and raises retirement spending; overpaying cuts interest), interest
  paid matching the mortgage calculator, each idea's patch and impact, the taper idea
  paying in just enough, and the one-tap what-ifs creating the same scenarios as before.
- **Projection years:** stepping the years one at a time gives the same rows as the
  full projection, a year-by-year returns path equal to the assumptions changes
  nothing, a path changes only the years and rates it gives (fees still apply),
  the projection runs to your end age when asked, and 1,000 projections of the
  sample household take under 3 seconds.
- **Actions:** how-to steps for each kind of idea (2 to 4, no providers), the
  suggested split as an action (for the sample household it puts 70% towards its
  debts, and does exactly what Use this split did), ranking (deciding about money left
  over first, then safety problems, then value a year; under £100 a year in Smaller
  ideas), gains measured on top of the suggested split, scaling to what you can afford, the two figures on each card, the Applied mark (and saves from
  version 3 loading), making a scenario your plan, and the calendar file (dates,
  escaping, 75-octet lines).
- **Households:** every single-person result unchanged; you and your partner in the
  same shape; tax, NI, student loans and the taper per person, added together;
  retiring in stages with each State Pension at its owner's age; an ISA allowance
  each; defined benefit income from its start age (taxed with pay while working);
  other pots taking contributions and being drawn; owners; version 5 saves
  loading; names ("you", "Sam's", "your partner's"); your partner's figures as a plan
  of their own; taking a partner off and bringing them back; and the pension, ISA and
  student loan ideas for whichever of you they apply to. Two more golden fixtures: a couple and a defined benefit pension.
- **Check-ins:** balances prefilled and put into every scenario, what the plan
  expected (from the previous check-in, between yearly points), a second check-in
  in a day replacing the first, since last time (net worth, debts paid down,
  actions applied), keeping 24 months then one a quarter, export and import, and
  version 4 saves loading.
- **Money formatting:** today's figures to the pound, figures five or more years
  ahead to three significant figures (£1.20m, £292k, £3,800), and the shared measure
  names used by the detail panels.
- **Upgrading saved data:** saves and exports from versions 1 and 2, including the
  oldest shapes (a single bonus, one spending total, the split as assumptions), load
  and match the golden results; a save or backup from a newer version is refused.

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
- **What if (scenarios):** copying, the limit, rename and delete, differences, comparison,
  one-tap what-ifs, upgrading older data.
- **Detail panels:** every outcome evaluates and lists drivers that exist, changes on a
  copy show before and after without touching your plan, levers report their effect,
  your retirement goal, moving leftover shares, and ideas grouped by outcome.
- **Data handling:** parsing and validation, cleaning up imported data (including ideas
  you've ticked off), export/import round trips, and the "Finish your plan" checklist.
- **Checks on the source:** no code can make network requests, every script is
  loaded, every path stays relative (for GitHub Pages), every asset carries the same
  version, and every route has a screen,
  with Your figures in the header and Plan, Actions, What if and Progress as the tabs.

## Accessibility

Checked with axe-core on every screen and in an open detail panel, in light and dark mode (WCAG 2.1 AA, no
violations); the journey tests re-check every screen in both modes on each pull request. Inputs have labels and help text, errors are announced, charts have a
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
