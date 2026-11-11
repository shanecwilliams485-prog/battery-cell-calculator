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
- `company-library.json` — company library of cells, modules and vehicles shared with everyone (see below)
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
- Mass overhead as a percentage or itemised; optional module and pack current ratings (as limits or as a validated rating) through the chain cell → module → pack → vehicle; miles or km.
- Vehicle presets by body style; motor, torque, rpm, gearing and tyre-size helper; AC/DC charging worked out step by step, with optional charging taper and on-board charger efficiency, and an animated charge-power graph.
- Drive cycles: WLTP Class 3b, 3a and 2, constant speed, or an uploaded CSV speed profile; constant-speed range table.
- Simulation from 100 % to 0 % displayed charge, with a replayable graph; performance at full and low (15 %) charge.
- Optional design requirement checks at every level (cell, module, pack, inverter & motor) with margins, including a cooling check, and lifetime & duty cycle.
- End-of-life check: enter the resistance increase at end of life and switch every result between beginning and end of life; choose which age the requirements must be met at.
- Heat from the cells (I²R) at the main operating points, with optional extra pack resistance.
- PDF report: Customer spec sheet or Full engineering report, section choice, light or dark, confidential marking.
- ReadMe page and "i" pop-ups explaining every step and equation.
- Libraries of cells, module datasheets and vehicles (export/import as JSON); cells also keep their taper and end-of-life resistance figures. Design snapshots and side-by-side comparison.
- Auto-remember in the browser, save/open project files, example project (fictional values).

## Company library
`company-library.json` holds the cells, module datasheets and vehicles everyone sees under "Company library". To update it:
1. In the calculator, save the items to your own library (Save this cell / module / vehicle).
2. Press **Make company library file** in the sidebar. The file contains the current company library plus your library; your version replaces a company item with the same name.
3. Upload the downloaded `company-library.json` to the repository, replacing the old one. Users see it on their next refresh (allow a few minutes for GitHub Pages).

The company library loads only when the calculator is opened from the website (GitHub Pages), not when index.html is opened straight from a folder.

To remove a company item, delete it from the file's JSON (or rebuild the file from a browser that has only the items you want). Check that the library contains only information approved for everyone with access to the site.

## Storage
Inputs, libraries and snapshots are kept in the browser's local storage on each computer. They are not shared between computers or users; use project files and library export/import to move them.

## Version
v2.12.5 — switch labels sit next to their switches; "ratings" renamed "limits" for modules and packs; clearer vehicle mass wording.

v2.12.4 — enclosure volume from CAD or made of several boxes (overall size removed); library list drawn by the page (readable on Windows).

v2.12 — charging taper and on-board charger efficiency, end-of-life check, heat from the cells and cooling check. Engine version 17.

v2.11 — all five stages complete, plus a shared company library (structure and results; graph, presets and cycles; PDF report; ReadMe; libraries and compare).
