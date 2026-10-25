# Personal finance planner — build plan

A single-page, mobile-first UK personal finance planner in plain HTML/CSS/JS.
No framework, no build step, no backend, no accounts, no network calls.

> Planning illustration only — not financial advice. Projections are not guaranteed.

## Principles

- **Privacy:** all data lives in the browser's `localStorage` (key `ukfp.v1`). Nothing is
  sent anywhere. JSON export/import and "clear all data" are on the Data screen.
  `.gitignore` excludes exported files so user data is never committed.
- **One data model:** a single `profile` object holds every input *and* every
  assumption. Screens read and write that object; nothing is entered twice. Where a
  value appears on two screens (e.g. mortgage rate in Setup and Assumptions) both
  controls edit the same key.
- **Calculation separate from UI:** `js/calc/*` are pure functions (no DOM) and are
  unit-tested with Node's built-in test runner (`npm test`, no dependencies).
- **Every model number is an assumption:** `js/config/assumptions.js` defines each
  one with label, unit, default, valid range, help text and the date the default was
  set. Results show the assumptions they depend on.
- **Works from `file://`:** scripts are classic scripts sharing one `FP` namespace
  (ES modules would be blocked when opening `index.html` directly).

## File layout

```
index.html               shell, nav, disclaimer
css/styles.css           mobile-first styles, light/dark tokens
js/config/assumptions.js assumption definitions + defaults (dated)
js/config/tax-*.js       (Stage 2) UK tax/NI/student-loan config, labelled by tax year
js/model/profile.js      blank profile, path get/set, parsing, validation, normalisation
js/model/sample.js       fictional sample household
js/model/store.js        localStorage load/save, export/import, clear
js/calc/mortgage.js      payment + amortisation (with overpayments, rate change)
js/calc/summary.js       net worth, home equity, monthly cash flow
js/calc/tax.js           (Stage 2) take-home pay
js/calc/projection.js    (Stage 3) year-by-year engine
js/ui/*.js               one module per screen + format/chart helpers
js/app.js                routing and wiring
tests/*.test.js          node --test
```

## Data model (schema v7)

```
profile = {
  schemaVersion, isSample,
  about:      { age },
  assets:     { homeValue, cashSavings, isa, gia, pension, other },
  mortgage:   { balance, remainingTermYears, monthlyOverpayment },
  debts:      [{ id, name, balance, rate|null, monthlyPayment }],   // blank rate → assumption
  income:     { grossSalary, bonuses: [{ id, amount, month }], studentLoanPlan, region, pensionMethod },
  spending:   [{ id, category, monthly }],
  assumptions:{ inflation, salaryGrowth, ..., sharesReturn, bondsReturn, cashReturn, marketShift, mortgageRate, ... },
  mixes:      { isa, gia, pension }   // each { shares, bonds, cash }, % adding up to 100
}
```

Stage 4 wraps this in a workspace, `{ activeId, scenarios: [{ id, name, profile }] }`;
a scenario is a full copy of the profile, so any input or assumption can differ.
Bonuses are a list since Stage 2. Saved files carry a `schemaVersion`: 1 held one
profile, 2 a workspace, 3 a workspace with every profile in today's shape, 4 the same
with ideas that can also be marked `applied`, 5 a workspace that also keeps your check-ins
(`workspace.checkins`, see `js/model/checkins.js`), 6 profiles that can have a `partner`, more
`pensions` and `owners` (you stay in the profile's own fields; `FP.profile.people` gives both of
you in one shape), 7 a mix on every ISA, investment and pension pot (`mixes`, `partner.pensionMix`,
`pensions[].mix`), replacing the investment and pension return assumptions.
`js/model/migrate.js` upgrades older files one numbered step at a time (`{ from, to,
up }`), so `profile.normalise` only checks and cleans today's shape. Any change to
the saved shape adds a step and a test.

## Stages (one PR each) — all complete

1. ✅ **Setup + Today + Assumptions** (#1) — data model, storage, sample data, export/import/
   clear, Setup form with validation, Today dashboard (net worth, assets vs
   liabilities chart, home equity, mortgage payoff, monthly outgoings), Assumptions
   panel with reset. Take-home pay shows as "arrives in Stage 2".
2. ✅ **Income** (#2; added later: bonus month, multiple bonuses) — `tax-2026-27` config (rUK + Scotland), take-home calculator (income
   tax with PA taper, employee NI, pension, student loan), wired into Today's cash flow
   so surplus is computed.
3. ✅ **Future** (#3; added: tax thresholds frozen/inflation, State Pension, drawdown) — projection engine (≤40 years, to end age), per-item rules, savings
   split for surplus, nominal/real toggle, net worth line + stacked component chart,
   equity line.
4. ✅ **Scenarios** (#4) — save baseline, clone, edit any input/assumption, side-by-side table
   and overlay chart.
5. ✅ **Tests, README, polish** (#5) — fuller tests for tax, compound growth, amortisation and
   projection; README; accessibility and mobile polish.
