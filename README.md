# UK personal finance planner

A single-page, mobile-first personal finance planner in plain HTML, CSS and JavaScript.
No framework, no build step, no backend, no accounts, no network calls.

> **Planning illustration only — not financial advice.** Projections are not guaranteed.

## Run it

Open `index.html` in a browser (double-clicking works), or serve the folder with any
static server, e.g. `python3 -m http.server`.

## Your data

Everything is saved in your browser's local storage on this device only. Use the
**Data** screen to export a JSON backup, import one, load the fictional sample data,
or clear everything. Exported files are git-ignored so they are never committed.

## Tests

```
npm test   # Node 18+, no dependencies
```

## Status

Built in stages — see [docs/PLAN.md](docs/PLAN.md).

- [x] Stage 1: Setup, Today dashboard, Assumptions panel, data export/import
- [ ] Stage 2: UK take-home pay calculator wired into cash flow
- [ ] Stage 3: Future projection
- [ ] Stage 4: Scenarios
- [ ] Stage 5: Tests, README and polish
