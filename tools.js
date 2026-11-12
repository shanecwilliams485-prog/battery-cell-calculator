// Volt Energy Systems — Battery Cell Calculator: libraries and design comparison.
// Uses the shared functions in app.js. Everything is stored in this browser only.
"use strict";

const LIBRARY_KEY = "voltBatteryCalculator.library.v1";
const SNAPSHOT_KEY = "voltBatteryCalculator.snapshots.v1";
const LIBRARY_FILE_TYPE = "volt-battery-calculator-library";
const COMPANY_FILE = "company-library.json";
const COMPANY_FILE_LEGACY = "company-library.js";
const MAX_ITEMS = 200;

// Which inputs each library type holds, and where its bar appears.
// Cell figures that live in other steps but come from the cell supplier, so they are saved with the cell (v2.12).
const CELL_EXTRA_FIELDS = ["cellTaperEnabled", "cellTaperStartPct", "cellTaperEndPct", "cellResIncreasePct", "cellResIncreaseSource"];
const LIBRARY_TYPES = {
  cells: { label: "cell", block: "cell-0", fields: () => [...stepFieldIds("cell"), ...CELL_EXTRA_FIELDS], name: (s) => [s.cellManufacturer, s.cellModel].filter(Boolean).join(" ") },
  modules: { label: "module", block: "module-1", fields: () => [...blockFieldIds("module", 1), ...blockFieldIds("module", 5)], name: (s) => s.mdName },
  vehicles: { label: "vehicle", block: "vehicle-0", fields: () => stepFieldIds("vehicle").filter((id) => !CELL_EXTRA_FIELDS.includes(id)), name: (s) => s.vehName }
};

function stepFieldIds(stepId) {
  const step = STEPS.find((s) => s.id === stepId);
  return step.blocks.flatMap((b) => b.fields.map((f) => f.id)).filter((id) => id in BLANK);
}
function blockFieldIds(stepId, index) {
  const step = STEPS.find((s) => s.id === stepId);
  return step.blocks[index].fields.map((f) => f.id).filter((id) => id in BLANK);
}

function readStore(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { showToast("Could not save: browser storage is full or unavailable"); return false; }
}

function loadLibrary() {
  const lib = readStore(LIBRARY_KEY, {});
  const out = {};
  for (const type of Object.keys(LIBRARY_TYPES)) out[type] = Array.isArray(lib[type]) ? lib[type].filter(validItem).slice(0, MAX_ITEMS) : [];
  return out;
}
// Company library: company-library.json in the same folder as the calculator,
// shared by everyone who opens the site. Read-only in the calculator.
function loadCompanyLibrary() {
  const data = window.VOLT_COMPANY_LIBRARY;
  const out = {};
  const ok = data && data.type === LIBRARY_FILE_TYPE && data.library && typeof data.library === "object";
  for (const type of Object.keys(LIBRARY_TYPES)) {
    const list = ok && Array.isArray(data.library[type]) ? data.library[type].filter(validItem).slice(0, MAX_ITEMS) : [];
    out[type] = list.map((item, i) => ({ id: `co:${i}`, name: String(item.name).trim().slice(0, 120) || "Unnamed", savedAt: item.savedAt, values: item.values, company: true }));
  }
  return out;
}
function companyUpdatedText() {
  const d = window.VOLT_COMPANY_LIBRARY?.updatedAt;
  const date = d ? new Date(d) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
}
function findLibraryItem(type, id) {
  const list = String(id).startsWith("co:") ? loadCompanyLibrary()[type] : loadLibrary()[type];
  return list.find((i) => i.id === id);
}

function validItem(item) {
  return item && typeof item.name === "string" && item.values && typeof item.values === "object";
}
// Only known inputs of that type, cleaned to the right types.
function cleanValues(type, values) {
  const ids = LIBRARY_TYPES[type].fields();
  const cleaned = cleanInputs(values);
  return Object.fromEntries(ids.filter((id) => Object.prototype.hasOwnProperty.call(values, id)).map((id) => [id, cleaned[id]]));
}
function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// --- Library bars -----------------------------------------------------------
function libraryBarHtml(type) {
  const t = LIBRARY_TYPES[type];
  return `<div class="lib-bar" data-lib="${type}">
    <span class="lib-label">Library</span>
    <select data-lib-select class="lib-native" aria-hidden="true" tabindex="-1"></select>
    <div class="lib-pick">
      <button type="button" class="lib-pick-btn" data-lib-open aria-haspopup="listbox" aria-expanded="false" aria-label="Saved ${t.label}s"><span></span></button>
      <div class="lib-pick-list" role="listbox" aria-label="Saved ${t.label}s" hidden></div>
    </div>
    <button type="button" class="text-button" data-lib-load>Load</button>
    <button type="button" class="text-button" data-lib-save>Save this ${t.label}</button>
    <button type="button" class="text-button" data-lib-delete>Delete</button>
  </div>`;
}

function refreshLibraryBars() {
  const lib = loadLibrary();
  const company = loadCompanyLibrary();
  const updated = companyUpdatedText();
  for (const [type, t] of Object.entries(LIBRARY_TYPES)) {
    const bar = document.querySelector(`.lib-bar[data-lib="${type}"]`);
    if (!bar) continue;
    const mine = lib[type];
    const shared = company[type];
    const select = bar.querySelector("[data-lib-select]");
    const current = select.value;
    const opts = (items) => items.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
    let html = "";
    if (shared.length) html += `<optgroup label="Company library${updated ? ` · ${esc(updated)}` : ""}">${opts(shared)}</optgroup>`;
    if (mine.length) html += shared.length ? `<optgroup label="My library">${opts(mine)}</optgroup>` : opts(mine);
    select.innerHTML = html || `<option value="">No saved ${t.label}s yet</option>`;
    const all = [...shared, ...mine];
    if (all.some((i) => i.id === current)) select.value = current;
    select.disabled = !all.length;
    bar.querySelector("[data-lib-load]").disabled = !all.length;
    renderLibraryPicker(bar);
    updateDeleteButton(bar);
  }
}

// The list of saved items is drawn by the page itself (v2.12.2): a native <select> list is
// drawn by the operating system and can come out unreadable on a dark page in Windows.
// The hidden <select> keeps the chosen value, so the rest of the code is unchanged.
function renderLibraryPicker(bar) {
  const select = bar.querySelector("[data-lib-select]");
  const btn = bar.querySelector("[data-lib-open]");
  const list = bar.querySelector(".lib-pick-list");
  const chosen = select.selectedOptions[0];
  btn.querySelector("span").textContent = chosen ? chosen.textContent : "";
  btn.disabled = select.disabled;
  let html = "";
  for (const node of select.children) {
    if (node.tagName === "OPTGROUP") {
      html += `<div class="lib-pick-group">${esc(node.label)}</div>`;
      for (const o of node.children) html += pickOption(o, select.value);
    } else if (node.value) html += pickOption(node, select.value);
  }
  list.innerHTML = html;
}
function pickOption(o, current) {
  return `<button type="button" role="option" class="lib-pick-opt" data-value="${esc(o.value)}" aria-selected="${o.value === current}">${esc(o.textContent)}</button>`;
}
function closeLibraryPickers(except) {
  $$(".lib-pick-list").forEach((list) => {
    if (list === except) return;
    list.hidden = true;
    list.closest(".lib-pick").querySelector("[data-lib-open]").setAttribute("aria-expanded", "false");
  });
}

function updateDeleteButton(bar) {
  const id = bar.querySelector("[data-lib-select]").value;
  const del = bar.querySelector("[data-lib-delete]");
  del.disabled = !id || id.startsWith("co:");
  del.title = id.startsWith("co:") ? "Company items are changed by updating company-library.json" : "";
}

function saveToLibrary(type) {
  const t = LIBRARY_TYPES[type];
  const suggested = t.name(state) || `${t.label[0].toUpperCase()}${t.label.slice(1)} ${new Date().toLocaleDateString("en-GB")}`;
  const name = window.prompt(`Name for this ${t.label}:`, suggested);
  if (name === null) return;
  const clean = name.trim().slice(0, 120);
  if (!clean) return;
  const lib = loadLibrary();
  const values = Object.fromEntries(t.fields().map((id) => [id, state[id]]));
  const existing = lib[type].find((i) => i.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    if (!window.confirm(`Replace the saved ${t.label} “${existing.name}”?`)) return;
    existing.values = values;
    existing.savedAt = new Date().toISOString();
  } else {
    if (lib[type].length >= MAX_ITEMS) { showToast(`Library is full (${MAX_ITEMS} ${t.label}s)`); return; }
    lib[type].push({ id: newId(), name: clean, savedAt: new Date().toISOString(), values });
    lib[type].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (writeStore(LIBRARY_KEY, lib)) { refreshLibraryBars(); showToast(`Saved “${clean}” to the ${t.label} library`); }
}

function loadFromLibrary(type, id) {
  const t = LIBRARY_TYPES[type];
  const item = findLibraryItem(type, id);
  if (!item) return;
  // A cell saved before v2.12 has no taper or ageing figures: clear them rather than keep the last cell's.
  const blanks = type === "cells" ? Object.fromEntries(CELL_EXTRA_FIELDS.map((id) => [id, BLANK[id]])) : {};
  applyInputs({ ...state, ...blanks, ...cleanValues(type, item.values) }, currentStep);
  showToast(`Loaded ${t.label} “${item.name}”${item.company ? " from the company library" : ""}`);
}

function deleteFromLibrary(type, id) {
  const t = LIBRARY_TYPES[type];
  if (String(id).startsWith("co:")) { showToast("Company items are changed by updating company-library.json"); return; }
  const lib = loadLibrary();
  const item = lib[type].find((i) => i.id === id);
  if (!item || !window.confirm(`Delete the saved ${t.label} “${item.name}” from this browser's library?`)) return;
  lib[type] = lib[type].filter((i) => i.id !== id);
  if (writeStore(LIBRARY_KEY, lib)) { refreshLibraryBars(); showToast(`Deleted “${item.name}”`); }
}

function exportLibrary() {
  const lib = loadLibrary();
  const count = Object.values(lib).reduce((n, list) => n + list.length, 0);
  if (!count) { showToast("The library is empty"); return; }
  const data = { type: LIBRARY_FILE_TYPE, version: 1, exportedAt: new Date().toISOString(), library: lib };
  downloadJson(data, `battery-calculator-library-${today()}.json`);
  showToast(`Exported ${count} library item${count === 1 ? "" : "s"}`);
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || data.type !== LIBRARY_FILE_TYPE || typeof data.library !== "object") throw new Error("type");
      const lib = loadLibrary();
      let added = 0, replaced = 0;
      for (const type of Object.keys(LIBRARY_TYPES)) {
        const incoming = Array.isArray(data.library[type]) ? data.library[type].filter(validItem) : [];
        for (const item of incoming) {
          const clean = { id: newId(), name: String(item.name).trim().slice(0, 120) || "Unnamed", savedAt: String(item.savedAt || new Date().toISOString()).slice(0, 40), values: cleanValues(type, item.values) };
          const existing = lib[type].findIndex((i) => i.name.toLowerCase() === clean.name.toLowerCase());
          if (existing >= 0) { lib[type][existing] = { ...clean, id: lib[type][existing].id }; replaced++; }
          else if (lib[type].length < MAX_ITEMS) { lib[type].push(clean); added++; }
        }
        lib[type].sort((a, b) => a.name.localeCompare(b.name));
      }
      if (writeStore(LIBRARY_KEY, lib)) { refreshLibraryBars(); showToast(`Library imported: ${added} added, ${replaced} updated`); }
    } catch {
      showToast("That file is not a Battery Calculator library");
    }
  };
  reader.readAsText(file);
}

// Builds company-library.json: the current company library plus everything in
// this browser's library (a personal item replaces a company item of the same name).
function exportCompanyFile() {
  const company = loadCompanyLibrary();
  const mine = loadLibrary();
  const merged = {};
  let fromCompany = 0, fromMine = 0, replaced = 0;
  for (const type of Object.keys(LIBRARY_TYPES)) {
    const list = company[type].map(({ name, savedAt, values }) => ({ name, savedAt, values: cleanValues(type, values) }));
    fromCompany += list.length;
    for (const item of mine[type]) {
      const clean = { name: item.name, savedAt: item.savedAt, values: cleanValues(type, item.values) };
      const i = list.findIndex((x) => x.name.toLowerCase() === item.name.toLowerCase());
      if (i >= 0) { list[i] = clean; replaced++; } else { list.push(clean); fromMine++; }
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    merged[type] = list.slice(0, MAX_ITEMS);
  }
  const total = Object.values(merged).reduce((n, l) => n + l.length, 0);
  if (!total) { showToast("Nothing to export: save a cell, module or vehicle to your library first"); return; }
  const message = `Create ${COMPANY_FILE} with ${total} item${total === 1 ? "" : "s"}?\n\n`
    + `• ${fromCompany} already in the company library\n• ${fromMine} new from your library${replaced ? `\n• ${replaced} company item${replaced === 1 ? "" : "s"} replaced by your version (same name)` : ""}\n\n`
    + "Check your library holds only items everyone should see, then upload the file to the calculator's GitHub folder, replacing the old one.";
  if (!window.confirm(message)) return;
  const data = { type: LIBRARY_FILE_TYPE, version: 1, company: true, updatedAt: new Date().toISOString(), library: merged };
  downloadJson(data, COMPANY_FILE);
  showToast(`${COMPANY_FILE} downloaded: upload it to GitHub to share it`);
}

// Loads company-library.json (with a cache-buster so an update shows on the
// next refresh). Falls back to an older company-library.js if a site still has one.
function loadCompanyFile() {
  const useLegacy = () => {
    const script = document.createElement("script");
    script.src = `${COMPANY_FILE_LEGACY}?t=${Date.now()}`;
    script.onload = refreshLibraryBars;
    script.onerror = () => { /* no company library on this site */ };
    document.head.appendChild(script);
  };
  // Opened straight from a folder: browsers cannot read the JSON file, so there is no company library.
  if (location.protocol === "file:" || typeof fetch !== "function") return;
  fetch(`${COMPANY_FILE}?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      if (!data || data.type !== LIBRARY_FILE_TYPE) throw new Error("type");
      window.VOLT_COMPANY_LIBRARY = data;
      refreshLibraryBars();
    })
    .catch(useLegacy);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --- Snapshots and comparison ------------------------------------------------
function loadSnapshots() {
  const list = readStore(SNAPSHOT_KEY, []);
  return Array.isArray(list) ? list.filter((s) => s && typeof s.name === "string" && s.inputs && typeof s.inputs === "object").slice(0, MAX_ITEMS) : [];
}
let compareChoice = "";

function addSnapshot(name, inputs) {
  const list = loadSnapshots();
  if (list.length >= MAX_ITEMS) { showToast(`Snapshot list is full (${MAX_ITEMS})`); return null; }
  const snap = { id: newId(), name: name.slice(0, 160), savedAt: new Date().toISOString(), inputs: cleanInputs(inputs) };
  list.unshift(snap);
  return writeStore(SNAPSHOT_KEY, list) ? snap : null;
}

function snapshotName(inputs) {
  return `${inputs.projectName || "Untitled"}${inputs.revision ? ` · Rev ${inputs.revision}` : ""}`;
}

// Compute results for another set of inputs, shown in the current units.
function computeFor(inputs) {
  const saved = state;
  try {
    state = cleanInputs({ ...inputs, units: saved.units });
    return { all: computeAll(), inputs: state };
  } finally {
    state = saved;
  }
}

// Each metric returns { n: number in display units (or null), t: text }.
function compareMetrics() {
  const num = (n, d, unit = "") => (Number.isFinite(n) ? { n, t: `${fmt(n, d)}${unit ? ` ${unit}` : ""}`, d } : { n: null, t: "—" });
  const txt = (t) => ({ n: null, t: t || "—" });
  const pk = (a) => a.build.pack;
  const sim = (a) => a.vehicle?.sim;
  const consumption = (kWhPerMile) => (state.units === "metric" ? kWhPerMile * 1000 / KM_PER_MILE : kWhPerMile * 1000);
  return [
    ["Design", [
      ["Build", (a) => txt(pathLabelFor(a.build.range))],
      ["Cell", (a, s) => txt(a.build.cell ? [s.cellManufacturer, s.cellModel].filter(Boolean).join(" ") || "Unnamed cell" : (s.mdName || "Module datasheet"))],
      ["Pack configuration", (a) => txt(pk(a)?.config)],
      ["Cells", (a) => num(pk(a)?.cells, 0)]
    ]],
    ["Pack", [
      ["Nominal voltage", (a) => num(pk(a)?.nominalV, 1, "V")],
      ["Energy", (a) => num(pk(a)?.energyKWh, 2, "kWh")],
      ["Usable energy", (a) => num(pk(a)?.usableKWh, 2, "kWh")],
      ["Pack mass", (a) => num(pk(a)?.massKg, 1, "kg")],
      ["Pack Wh/kg", (a) => num(pk(a)?.whPerKg, 0)],
      ["Enclosure volume", (a) => num(pk(a)?.enclosureL, 1, "L")],
      ["Pack Wh/L", (a) => num(pk(a)?.whPerL, 0)],
      ["Peak discharge power", (a) => num(pk(a) ? (a.atLimits.hasSag ? a.atLimits.full.powerW / 1000 : pk(a).peakKW) : null, 1, "kW")],
      [`Peak power at low charge (${LOW_CHARGE} %)`, (a) => num(pk(a) && a.atLimits.hasSag ? a.atLimits.low.powerW / 1000 : null, 1, "kW")],
      ["Continuous discharge power", (a) => num(pk(a)?.contKW, 1, "kW")],
      ["Max charge power", (a) => num(pk(a)?.chargeKW, 1, "kW")]
    ]],
    ["Vehicle", [
      ["Drive cycle", (a) => txt(sim(a)?.driveCycleLabel)],
      ["Test mass", (a) => num(a.vehicle?.massKg, 0, "kg")],
      ["Range", (a) => num(sim(a) ? toDisplay("distance", sim(a).distanceMiles) : null, 1, unitLabel("distance"))],
      ["Consumption", (a) => num(sim(a) ? consumption(sim(a).consumptionKWhPerMile) : null, 0, state.units === "metric" ? "Wh/km" : "Wh/mile")],
      ["0–60 mph (full charge)", (a) => num(a.vehicle?.fullTop?.ok ? a.vehicle.fullTop.zeroToSixtySeconds : null, 1, "s")],
      ["50–70 mph (full charge)", (a) => num(a.vehicle?.fullTop?.ok ? a.vehicle.fullTop.fiftyToSeventySeconds : null, 1, "s")],
      ["Top speed (full charge)", (a) => num(a.vehicle?.fullTop?.ok ? toDisplay("speed", a.vehicle.fullTop.topSpeedMph) : null, 0, unitLabel("speed"))],
      ["Max sustained speed", (a) => num(a.vehicle ? toDisplay("speed", a.vehicle.sustainedTop.mph) : null, 0, unitLabel("speed"))],
      ["Auxiliary loads", (a) => num(a.vehicle?.aux?.total, 2, "kW")],
      ["Range cost of auxiliary loads", (a) => num(a.vehicle?.aux?.rangeCostMiles !== null && a.vehicle?.aux ? toDisplay("distance", a.vehicle.aux.rangeCostMiles) : null, 1, unitLabel("distance"))],
      ["Range added by regen", (a) => num(a.vehicle?.regen ? toDisplay("distance", a.vehicle.regen.addedMiles) : null, 1, unitLabel("distance"))],
      ["AC charge 0–100 %", (a) => num(a.charging?.ac?.hours, 1, "h")],
      ["DC charge 10–80 %", (a) => num(a.charging?.dc?.min1080, 0, "min")],
      ["DC charge 10–100 %", (a) => num(a.charging?.dc?.min10100, 0, "min")],
      ["Cell heat over the drive", (a) => num(a.heat?.driveKWh, 2, "kWh")],
      ["Peak pulse heat", (a) => num(a.heat?.rows?.find((r) => r.key === "peak")?.kW, 1, "kW")],
      ["Results at", (a) => txt(a.eolAvailable ? (a.age === "eol" ? "End of life" : "Beginning of life") : "Beginning of life")]
    ]]
  ];
}

function pathLabelFor(r) {
  const names = { cell: "Cell", module: "Module", pack: "Pack", vehicle: "Vehicle" };
  return `${names[r.start]} → ${names[r.end]}`;
}

function diffText(a, b) {
  if (a.n === null || b.n === null) return a.t === b.t ? '<span class="same">same</span>' : '<span class="same">differs</span>';
  const decimals = Math.max(a.d || 0, b.d || 0);
  const round = (x) => Math.round(x * Math.pow(10, decimals)) / Math.pow(10, decimals);
  const d = round(b.n) - round(a.n);
  if (Math.abs(d) < Math.pow(10, -decimals) / 2) return '<span class="same">same</span>';
  const pct = a.n !== 0 ? ` (${d > 0 ? "+" : "−"}${fmt(Math.abs(d / a.n * 100), 1)} %)` : "";
  return `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${fmt(Math.abs(d), decimals)}${pct}</span>`;
}

function renderCompareStep() {
  const body = $("#compareBody");
  if (!body) return;
  const snaps = loadSnapshots();
  if (compareChoice && !snaps.some((s) => s.id === compareChoice)) compareChoice = "";
  if (!compareChoice && snaps.length) compareChoice = snaps[0].id;
  const options = snaps.map((s) => `<option value="${esc(s.id)}"${s.id === compareChoice ? " selected" : ""}>${esc(s.name)} · ${esc(new Date(s.savedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}</option>`).join("");

  let table = `<div class="notice">Save the current design as a snapshot, change it, then compare. You can also open a saved project file as design B.</div>`;
  const snap = snaps.find((s) => s.id === compareChoice);
  if (snap) {
    const A = computeFor(state);
    const B = computeFor(snap.inputs);
    const errA = A.all.build.errors.length, errB = B.all.build.errors.length;
    if (errA || errB) {
      table = `<div class="notice error">${errA ? "The current design has inputs that need checking. " : ""}${errB ? "Design B has inputs that need checking (open it to fix them)." : ""}</div>`;
    } else {
      const rows = compareMetrics().map(([group, list]) => {
        const lines = list.map(([label, fn]) => {
          const a = fn(A.all, A.inputs), b = fn(B.all, B.inputs);
          if (a.t === "—" && b.t === "—") return "";
          return `<tr><td>${esc(label)}</td><td>${esc(a.t)}</td><td>${esc(b.t)}</td><td>${diffText(a, b)}</td></tr>`;
        }).join("");
        return lines ? `<tr class="group"><th colspan="4">${esc(group)}</th></tr>${lines}` : "";
      }).join("");
      table = `<section class="panel wide compare-panel">
        <div class="table-wrap"><table class="data compare-table">
          <thead><tr><th></th><th>A · current design<br><span>${esc(snapshotName(state))}</span></th><th>B · snapshot<br><span>${esc(snap.name)}</span></th><th>B − A</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <p class="help" style="margin:12px 0 0">Both designs are calculated with the current calculator and units. Differences are B minus A. Estimates from the inputs of each design.</p>
      </section>`;
    }
  }

  body.innerHTML = `<div class="step-head"><p class="eyebrow">Output</p><h1 tabindex="-1">Compare designs</h1>
      <p>Compare the current design (A) with a saved snapshot (B). Snapshots are kept in this browser.</p></div>
    <section class="card compare-controls">
      <div class="compare-row">
        <label class="mini-field grow"><span>Design B</span><select id="compareSelect"${snaps.length ? "" : " disabled"}>${options || '<option value="">No snapshots yet</option>'}</select></label>
        <div class="compare-buttons">
          <button type="button" class="button primary" id="snapshotSave">Save current as snapshot</button>
          <label class="button" for="compareFile">Open project file as B</label>
          <input type="file" id="compareFile" accept=".json,application/json" hidden>
          <button type="button" class="button" id="snapshotOpen"${snap ? "" : " disabled"}>Open B in calculator</button>
          <button type="button" class="button" id="snapshotDelete"${snap ? "" : " disabled"}>Delete snapshot</button>
          <button type="button" class="button" id="comparePrint"${snap ? "" : " disabled"}>Print comparison</button>
        </div>
      </div>
    </section>
    ${table}`;

  $("#compareSelect").addEventListener("change", (e) => { compareChoice = e.target.value; renderCompareStep(); });
  $("#snapshotSave").addEventListener("click", () => {
    const name = window.prompt("Name for this snapshot:", snapshotName(state));
    if (name === null || !name.trim()) return;
    const s = addSnapshot(name.trim(), state);
    if (s) { showToast(`Snapshot “${s.name}” saved`); if (!compareChoice) compareChoice = s.id; renderCompareStep(); }
  });
  $("#compareFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || data.type !== PROJECT_FILE_TYPE || typeof data.inputs !== "object") throw new Error("type");
        const s = addSnapshot(`${snapshotName(data.inputs)} (file)`, data.inputs);
        if (s) { compareChoice = s.id; showToast(`Opened “${s.name}” as design B`); renderCompareStep(); }
      } catch { showToast("That file is not a Battery Calculator project"); }
    };
    reader.readAsText(file);
  });
  if (snap) {
    $("#snapshotOpen").addEventListener("click", () => {
      if (!window.confirm(`Replace the current inputs with “${snap.name}”? Save a snapshot of the current design first if you want to keep it.`)) return;
      applyInputs(snap.inputs, "results");
      showToast(`Opened “${snap.name}”`);
    });
    $("#snapshotDelete").addEventListener("click", () => {
      if (!window.confirm(`Delete the snapshot “${snap.name}”?`)) return;
      writeStore(SNAPSHOT_KEY, loadSnapshots().filter((s) => s.id !== snap.id));
      compareChoice = "";
      renderCompareStep();
    });
    $("#comparePrint").addEventListener("click", () => window.print());
  }
}

// --- Start-up -----------------------------------------------------------------
function initTools() {
  for (const [type, t] of Object.entries(LIBRARY_TYPES)) {
    const block = document.querySelector(`[data-block="${t.block}"]`);
    if (!block) continue;
    const anchor = block.querySelector("h2");
    if (anchor) anchor.insertAdjacentHTML("afterend", libraryBarHtml(type));
  }
  document.addEventListener("change", (e) => {
    const bar = e.target.closest(".lib-bar");
    if (bar && e.target.matches("[data-lib-select]")) updateDeleteButton(bar);
  });
  document.addEventListener("click", (e) => {
    const bar = e.target.closest(".lib-bar");
    const open = e.target.closest("[data-lib-open]");
    const opt = e.target.closest(".lib-pick-opt");
    if (open) {
      const list = open.closest(".lib-pick").querySelector(".lib-pick-list");
      const show = list.hidden;
      closeLibraryPickers();
      list.hidden = !show;
      open.setAttribute("aria-expanded", String(show));
      if (show) (list.querySelector('[aria-selected="true"]') || list.querySelector(".lib-pick-opt"))?.focus();
      return;
    }
    if (opt) {
      const select = bar.querySelector("[data-lib-select]");
      select.value = opt.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      renderLibraryPicker(bar);
      closeLibraryPickers();
      bar.querySelector("[data-lib-open]").focus();
      return;
    }
    if (!e.target.closest(".lib-pick")) closeLibraryPickers();
    if (!bar) return;
    const type = bar.dataset.lib;
    const id = bar.querySelector("[data-lib-select]").value;
    if (e.target.closest("[data-lib-save]")) saveToLibrary(type);
    else if (e.target.closest("[data-lib-load]") && id) loadFromLibrary(type, id);
    else if (e.target.closest("[data-lib-delete]") && id) deleteFromLibrary(type, id);
  });
  document.addEventListener("keydown", (e) => {
    const list = e.target.closest && e.target.closest(".lib-pick-list");
    if (e.key === "Escape" && (list || e.target.closest?.(".lib-pick"))) { closeLibraryPickers(); e.target.closest(".lib-pick")?.querySelector("[data-lib-open]").focus(); return; }
    if (!list || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const opts = $$(".lib-pick-opt", list);
    const i = opts.indexOf(document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : Math.min(opts.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)));
    opts[next]?.focus();
  });
  $("#exportLibrary")?.addEventListener("click", exportLibrary);
  $("#exportCompanyLibrary")?.addEventListener("click", exportCompanyFile);
  $("#importLibrary")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) importLibrary(file);
  });
  refreshLibraryBars();
  loadCompanyFile();
}
