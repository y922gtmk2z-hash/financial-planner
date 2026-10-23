# UK personal finance planner

A single-page, mobile-first personal finance planner in plain HTML, CSS and JavaScript.
No framework, no build step, no backend, no accounts, no network calls.

> **Planning illustration only — not financial advice.** Projections are not guaranteed.

## Run it

Open `index.html` in a browser (double-clicking works), or serve the folder with any
static server, e.g. `python3 -m http.server`.

## Your data

Everything is saved in your browser's local storage on this device only. Use the
**Your data** screen (link in the header) to export a JSON backup, import one, load the fictional sample data,
or clear everything. Exported files are git-ignored so they are never committed.

## Tax rules

All income tax, National Insurance and student loan rates and thresholds live in one
file per tax year: `js/config/tax-2026-27.js`. **Check every figure against HMRC,
gov.scot and gov.uk at the start of each tax year**, then copy the file to the new
year, update it, and change the `<script>` tag in `index.html` and `tests/load.js`.

## Tests

```
npm test   # Node 18+, no dependencies
```

## Status

Built in stages — see [docs/PLAN.md](docs/PLAN.md).

- [x] Stage 1: Setup, Today dashboard, Assumptions panel, data export/import
- [x] Stage 2: UK take-home pay calculator wired into cash flow
- [x] Stage 3: Future projection
- [ ] Stage 4: Scenarios
- [ ] Stage 5: Tests, README and polish
