# Battery Cell Calculator — Volt Energy Systems

Cell → module → pack → vehicle battery calculator. Static website: no server, database or build step. All calculation and storage happen in the user's browser.

## Files (upload all together)
- `index.html` — the calculator
- `readme.html` — the ReadMe page (method, equations, sources)
- `app.js` — interface: inputs, navigation, results, graph, saving
- `calc.js` — cell / module / pack calculations
- `simulation.js` — vehicle simulation (WLTP Class 2, 3a and 3b data included)
- `report.js` — PDF report preview and printing
- `tools.js` — libraries and design comparison
- `readme-content.js` — ReadMe text, shared by `readme.html` and the "i" pop-ups
- `styles.css` — Black Engineering style
- `assets/` — logos and icons
- `.nojekyll` — stops GitHub Pages altering files (keep it)

`index.html` checks the engine version and shows a clear message if an old `simulation.js` is still on the server. After uploading, refresh with Ctrl+F5.

## Tests
```
node tests/calc.test.js
node tests/simulation.test.js
node tests/readme.test.js
```

## Features
- Build from a cell or a module datasheet, up to a module, pack or vehicle; optional "More detail" sections.
- Mass overhead as a percentage or itemised; mixed module types; BMS limits (weakest component); miles or km.
- Vehicle presets by body style; motor, torque, rpm, gearing and tyre-size helper; AC/DC charging.
- Drive cycles: WLTP Class 3b, 3a and 2, constant speed, or an uploaded CSV speed profile; constant-speed range table.
- Simulation from 100 % to 0 % displayed charge, with a replayable graph; performance at full and low (15 %) charge.
- Optional design requirement checks and lifetime & duty cycle.
- PDF report: Customer spec sheet or Full engineering report, section choice, light or dark, confidential marking.
- ReadMe page and "i" pop-ups explaining every step and equation.
- Libraries of cells, module datasheets and vehicles (export/import as JSON); design snapshots and side-by-side comparison.
- Auto-remember in the browser, save/open project files, example project (fictional values).

## Storage
Inputs, libraries and snapshots are kept in the browser's local storage on each computer. They are not shared between computers or users; use project files and library export/import to move them.

## Version
v2.3 — all five stages complete (structure and results; graph, presets and cycles; PDF report; ReadMe; libraries and compare). Engine version 14.
