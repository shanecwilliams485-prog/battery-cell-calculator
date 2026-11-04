// Volt Energy Systems — Battery Cell Calculator: libraries and design comparison.
// Uses the shared functions in app.js. Everything is stored in this browser only.
"use strict";

const LIBRARY_KEY = "voltBatteryCalculator.library.v1";
const SNAPSHOT_KEY = "voltBatteryCalculator.snapshots.v1";
const LIBRARY_FILE_TYPE = "volt-battery-calculator-library";
const COMPANY_FILE = "company-library.js";
const MAX_ITEMS = 200;

// Which inputs each library type holds, and where its bar appears.
const LIBRARY_TYPES = {
  cells: { label: "cell", block: "cell-0", fields: () => stepFieldIds("cell"), name: (s) => [s.cellManufacturer, s.cellModel].filter(Boolean).join(" ") },
  modules: { label: "module", block: "module-1", fields: () => [...blockFieldIds("module", 1), ...blockFieldIds("module", 4)], name: (s) => s.mdName },
  vehicles: { label: "vehicle", block: "vehicle-0", fields: () => stepFieldIds("vehicle"), name: (s) => s.vehName }
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
// Company library: company-library.js in the same folder as the calculator,
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
    <select data-lib-select aria-label="Saved ${t.label}s"></select>
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
    if (shared.length) html += `<optgroup label="Company library${updated ? ` (updated ${esc(updated)})` : ""}">${opts(shared)}</optgroup>`;
    if (mine.length) html += shared.length ? `<optgroup label="My library (this browser)">${opts(mine)}</optgroup>` : opts(mine);
    select.innerHTML = html || `<option value="">No saved ${t.label}s yet</option>`;
    const all = [...shared, ...mine];
    if (all.some((i) => i.id === current)) select.value = current;
    select.disabled = !all.length;
    bar.querySelector("[data-lib-load]").disabled = !all.length;
    updateDeleteButton(bar);
  }
}

function updateDeleteButton(bar) {
  const id = bar.querySelector("[data-lib-select]").value;
  const del = bar.querySelector("[data-lib-delete]");
  del.disabled = !id || id.startsWith("co:");
  del.title = id.startsWith("co:") ? "Company items are changed by updating company-library.js" : "";
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
  applyInputs({ ...state, ...cleanValues(type, item.values) }, currentStep);
  showToast(`Loaded ${t.label} “${item.name}”${item.company ? " from the company library" : ""}`);
}

function deleteFromLibrary(type, id) {
  const t = LIBRARY_TYPES[type];
  if (String(id).startsWith("co:")) { showToast("Company items are changed by updating company-library.js"); return; }
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

// Builds company-library.js: the current company library plus everything in
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
  const data = { type: LIBRARY_FILE_TYPE, version: 1, updatedAt: new Date().toISOString(), library: merged };
  const text = "// Volt Energy Systems — Battery Cell Calculator: company library.\n"
    + "// Shared with everyone who opens the calculator. Made with the calculator's\n"
    + "// \"Make company library file\" button; upload it next to index.html to update.\n"
    + `window.VOLT_COMPANY_LIBRARY = ${JSON.stringify(data, null, 2)};\n`;
  const blob = new Blob([text], { type: "text/javascript" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = COMPANY_FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast(`${COMPANY_FILE} downloaded: upload it to GitHub to share it`);
}

// Loads company-library.js with a cache-buster so an update shows on the next refresh.
function loadCompanyFile() {
  const script = document.createElement("script");
  script.src = `${COMPANY_FILE}?t=${Date.now()}`;
  script.onload = refreshLibraryBars;
  script.onerror = () => { /* no company library on this site */ };
  document.head.appendChild(script);
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
      ["AC charge 0–100 %", (a) => num(a.build.charging?.acHours, 1, "h")],
      ["DC charge 10–80 %", (a) => num(a.build.charging?.dcMinutes, 0, "min")]
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
    if (!bar) return;
    const type = bar.dataset.lib;
    const id = bar.querySelector("[data-lib-select]").value;
    if (e.target.closest("[data-lib-save]")) saveToLibrary(type);
    else if (e.target.closest("[data-lib-load]") && id) loadFromLibrary(type, id);
    else if (e.target.closest("[data-lib-delete]") && id) deleteFromLibrary(type, id);
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
