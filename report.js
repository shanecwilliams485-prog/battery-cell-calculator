// Volt Energy Systems — Battery Cell Calculator: PDF report (preview and print)
// Uses the shared functions in app.js (computeAll, resultSections, headlineData …).
"use strict";

const REPORT_SECTIONS = [
  ["summary", "Summary"],
  ["notes", "Project notes"],
  ["cell", "Cell"],
  ["module", "Module"],
  ["pack", "Pack"],
  ["limits", "Pack limits"],
  ["density", "Mass & energy density"],
  ["vehicle", "Vehicle"],
  ["range", "Vehicle range"],
  ["chart", "Simulation graph"],
  ["speedtable", "Range at constant speed"],
  ["performance", "Performance at the limits"],
  ["charging", "Charging"],
  ["requirements", "Requirement check"],
  ["lifetime", "Lifetime & duty cycle"],
  ["inputs", "All inputs (appendix)"],
  ["method", "Method & assumptions"]
];

const REPORT_TEMPLATES = {
  customer: {
    label: "Customer spec sheet",
    docTitle: "Battery specification sheet",
    blurb: "Short summary for sharing: headline figures, pack, range and performance.",
    sections: ["summary", "notes", "cell", "pack", "vehicle", "range", "chart", "speedtable", "performance", "charging", "method"]
  },
  engineering: {
    label: "Full engineering report",
    docTitle: "Battery engineering report",
    blurb: "Everything: every level, limits and their sources, checks, lifetime and all inputs.",
    sections: REPORT_SECTIONS.map(([key]) => key)
  }
};

function reportSelected() {
  const template = REPORT_TEMPLATES[state.reportTemplate] || REPORT_TEMPLATES.customer;
  const list = String(state.reportSections || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (list.length) return new Set(list);
  const set = new Set(template.sections);
  // A module-based build needs its module section even on the short template.
  const r = range();
  if (r.start === "module" || r.end === "module") { set.add("module"); set.add("density"); }
  return set;
}

// --- All-inputs appendix ----------------------------------------------------
function inputValueText(field) {
  const value = state[field.id];
  if (field.type === "switch") return value ? "Yes" : null;
  if (field.type === "wltpinfo") return null;
  if (field.type === "profile") return state.customProfileName ? esc(state.customProfileName) : (String(value || "").trim() ? "Loaded" : null);
  if (field.type === "ocv") {
    const parsed = Sim.parseOcvTable(value || "");
    if (!parsed.points.length) return null;
    const a = parsed.points[0], z = parsed.points[parsed.points.length - 1];
    return `${parsed.points.length} points, ${fmt(a.v, 2)} V at ${fmt(a.soc, 0)} % to ${fmt(z.v, 2)} V at ${fmt(z.soc, 0)} %`;
  }
  if (value === "" || value === null || value === undefined) return null;
  if (field.type === "select") {
    const opt = field.options.find(([v]) => v === value);
    return opt && opt[0] !== "" ? esc(opt[1]) : null;
  }
  if (field.type === "speedlist") return `${esc(speedListToDisplay(value))} ${unitLabel("speed")}`;
  if (["text", "textarea", "date", "tyre"].includes(field.type)) return String(value).trim() ? esc(value) : null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 0 && (field.optional || field.zeroMeansNone !== false)) return null;
  if (field.kind) return `${fmt(toDisplay(field.kind, n), field.kind === "perDistance" ? 3 : 1).replace(/\.0$/, "")} ${unitLabel(field.kind)}`;
  return `${String(Math.round(n * 10000) / 10000)}${field.unit ? ` ${esc(field.unit)}` : ""}`;
}

function inputsAppendixHtml() {
  const groups = [];
  for (const step of visibleSteps()) {
    if (!step.blocks || step.id === "project") continue;
    if (step.optional && !state[step.optional]) continue;
    const rows = [];
    for (const block of step.blocks) {
      if (block.showIf && !block.showIf(state)) continue;
      for (const field of block.fields) {
        if (field.showIf && !field.showIf(state)) continue;
        if (field.id === step.optional) continue;
        const text = inputValueText(field);
        if (text !== null) rows.push([field.label || block.title, text]);
      }
    }
    if (rows.length) groups.push(`<div class="r-input-group"><h4>${esc(step.title)}</h4>${rowsHtml(rows)}</div>`);
  }
  return `<div class="r-inputs">${groups.join("")}</div>`;
}

// --- Report document ----------------------------------------------------------
function reportDocHtml(all, opts) {
  const b = all.build;
  const template = REPORT_TEMPLATES[opts.template] || REPORT_TEMPLATES.customer;
  const theme = opts.theme === "dark" ? "dark" : "light";
  const selected = opts.selected;
  const sections = resultSections(all);
  const sim = all.vehicle?.sim;
  const logo = theme === "dark" ? "assets/logo-white.png" : "assets/logo-black.png";
  const parts = [];
  const sec = (key, title, html, cls = "") => parts.push(`<section class="r-sec${cls ? ` ${cls}` : ""}" data-r="${key}"><h2>${esc(title)}</h2>${html}</section>`);

  if (selected.has("summary")) {
    const head = headlineData(all);
    const kp = head.kpis.map(([label, value, unit]) => `<div class="r-kpi"><span>${esc(label)}</span><strong>${value}${unit ? ` <small>${esc(unit)}</small>` : ""}</strong></div>`).join("");
    sec("summary", "Summary", `<p class="r-headline">${head.headline} <span>${head.accent}</span></p><div class="r-kpis">${kp}</div>`
      + (b.warnings.length ? `<div class="r-note"><strong>Unusual values flagged:</strong> ${b.warnings.map((w) => esc(w.text)).join(" ")}</div>` : ""), "r-summary");
  }
  if (selected.has("notes") && String(state.notes || "").trim()) {
    sec("notes", "Project notes", `<p class="r-notes">${esc(state.notes).replace(/\n/g, "<br>")}</p>`);
  }
  const pairs = [];
  for (const s of sections) {
    if (!selected.has(s.key)) continue;
    if (s.key === "range" && selected.has("chart") && sim) {
      pairs.push(s);
      pairs.push({ key: "chart" });
      continue;
    }
    pairs.push(s);
  }
  if (selected.has("chart") && sim && !pairs.some((x) => x.key === "chart")) pairs.push({ key: "chart" });
  for (const s of pairs) {
    if (s.key === "chart") {
      const img = chartImage(chartSimInfo(sim, all.packModel), theme);
      sec("chart", "Simulation: 100 % to 0 % charge", `<img class="r-chart" src="${img}" alt="Simulation graph">`
        + `<p class="help">${esc(sim.driveCycleLabel)}, repeated until the usable energy is used: ${esc(dist(sim.distanceMiles))} in ${esc(formatDuration(sim.runtimeMinutes * 60))} of driving. Bars show the peak current in each interval; charge is shown as the driver sees it.</p>`, "r-wide");
    } else {
      sec(s.key, s.title, s.html, s.wide || ["speedtable", "density", "requirements"].includes(s.key) ? "r-wide" : "");
    }
  }
  if (selected.has("inputs")) sec("inputs", "All inputs", inputsAppendixHtml(), "r-wide r-appendix");
  if (selected.has("method")) {
    const items = assumptionsList(all);
    sec("method", "Method & assumptions", `<ul class="r-list">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`, "r-wide");
  }

  const meta = [
    ["Project", state.projectName || "Untitled project"],
    state.customer ? ["Customer", state.customer] : null,
    state.revision ? ["Revision", state.revision] : null,
    ["Date", state.projectDate || today()],
    state.reportPreparedBy ? ["Prepared by", state.reportPreparedBy] : null,
    ["Scope", pathLabel()]
  ].filter(Boolean).map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");

  const confidential = opts.confidential ? "Confidential · " : "";
  const running = `${confidential}${esc(state.projectName || "Untitled project")}${state.revision ? ` · Rev ${esc(state.revision)}` : ""}`;
  const disclaimer = "Calculated estimate for engineering discussion, based on the inputs shown. Not a specification, warranty or commitment by Volt Energy Systems. Validate by test.";

  return `<div class="report ${theme}">
    <table class="r-frame"><thead><tr><td><div class="r-run-head"><img src="${logo}" alt="Volt Energy Systems"><span>${running}</span></div></td></tr></thead>
    <tfoot><tr><td><div class="r-run-foot"><span>${disclaimer}</span><span>${opts.confidential ? "CONFIDENTIAL" : ""}</span></div></td></tr></tfoot>
    <tbody><tr><td>
      <header class="r-cover">
        <p class="r-eyebrow">${esc(template.docTitle)}</p>
        <h1>${esc(state.projectName || "Untitled project")}</h1>
        <div class="r-meta">${meta}</div>
      </header>
      <div class="r-body">${parts.join("")}</div>
      <p class="r-end">${disclaimer}${opts.confidential ? " This document contains confidential information; do not share outside the intended recipients." : ""}</p>
    </td></tr></tbody></table>
  </div>`;
}

// --- Report step (controls + preview) -----------------------------------------
function renderReportStep() {
  const body = $("#reportBody");
  if (!body) return;
  const all = computeAll();
  const b = all.build;
  const head = `<div class="step-head"><p class="eyebrow">Output</p><h1 tabindex="-1">PDF report</h1>
    <p>Pick a template and the sections to include, check the preview, then print or save it as a PDF.</p></div>`;
  if (b.errors.length) {
    body.innerHTML = `${head}<div class="notice error"><strong>Some inputs need checking before a report can be made</strong><ul>${b.errors.map((e) => `<li>${esc(e.text)} <a href="#${e.step}" data-goto="${e.step}">Go to ${esc(e.step)}</a></li>`).join("")}</ul></div>`;
    return;
  }
  const available = new Set(["summary", "notes", "inputs", "method", ...resultSections(all).map((s) => s.key)]);
  if (all.vehicle?.sim) available.add("chart");
  const selected = reportSelected();
  const templateCards = Object.entries(REPORT_TEMPLATES).map(([key, t]) => `
    <label class="choice${state.reportTemplate === key ? " on" : ""}"><input type="radio" name="reportTemplate" value="${key}"${state.reportTemplate === key ? " checked" : ""}>
      <strong>${esc(t.label)}</strong><small>${esc(t.blurb)}</small></label>`).join("");
  const checks = REPORT_SECTIONS.map(([key, label]) => {
    const ok = available.has(key);
    return `<label class="check-item${ok ? "" : " na"}"><input type="checkbox" data-report-section="${key}"${selected.has(key) && ok ? " checked" : ""}${ok ? "" : " disabled"}><span>${esc(label)}</span>${ok ? "" : "<small>not in this build</small>"}</label>`;
  }).join("");

  body.innerHTML = `${head}
    <div class="report-layout">
      <aside class="card report-controls">
        <h2>Template</h2>
        <div class="choices">${templateCards}</div>
        <h2>Appearance</h2>
        <div class="units-toggle report-theme" role="group" aria-label="Report theme">
          <button type="button" data-report-theme="light" aria-pressed="${state.reportTheme === "light"}">Light</button>
          <button type="button" data-report-theme="dark" aria-pressed="${state.reportTheme === "dark"}">Dark</button>
        </div>
        <div class="field"><label for="reportPreparedBy"><span>Prepared by <span class="optional">optional</span></span></label>
          <input type="text" id="reportPreparedBy" autocomplete="off" value="${esc(state.reportPreparedBy)}"></div>
        <label class="switch"><input type="checkbox" id="reportConfidential"${state.reportConfidential ? " checked" : ""}><span class="track" aria-hidden="true"></span><span>Mark as confidential</span></label>
        <h2>Sections</h2>
        <div class="check-list">${checks}</div>
        <div class="report-buttons">
          <button type="button" class="button" id="reportReset">Reset to template</button>
          <button type="button" class="button primary" id="reportPrint">Print / save as PDF</button>
        </div>
        <p class="help">In the print window choose “Save as PDF” as the printer. ${state.reportTheme === "dark" ? "The dark theme prints with a black background, which uses a lot of ink on paper." : ""}</p>
      </aside>
      <div class="report-stage" id="reportStage">${reportDocHtml(all, { template: state.reportTemplate, theme: state.reportTheme, selected, confidential: state.reportConfidential })}</div>
    </div>`;
  document.body.dataset.reportTheme = state.reportTheme;

  const rerender = () => { saveState(); renderReportStep(); };
  $$('input[name="reportTemplate"]', body).forEach((el) => el.addEventListener("change", () => {
    state.reportTemplate = el.value;
    state.reportSections = "";
    rerender();
  }));
  $$("[data-report-theme]", body).forEach((el) => el.addEventListener("click", () => { state.reportTheme = el.dataset.reportTheme; rerender(); }));
  $$("[data-report-section]", body).forEach((el) => el.addEventListener("change", () => {
    const set = reportSelected();
    if (el.checked) set.add(el.dataset.reportSection); else set.delete(el.dataset.reportSection);
    state.reportSections = REPORT_SECTIONS.map(([k]) => k).filter((k) => set.has(k)).join(",") || "none";
    rerender();
  }));
  $("#reportPreparedBy", body).addEventListener("change", (e) => { state.reportPreparedBy = e.target.value.slice(0, 200); rerender(); });
  $("#reportConfidential", body).addEventListener("change", (e) => { state.reportConfidential = e.target.checked; rerender(); });
  $("#reportReset", body).addEventListener("click", () => { state.reportSections = ""; rerender(); });
  $("#reportPrint", body).addEventListener("click", printReport);
}

function printReport() {
  document.body.classList.add("printing-report");
  const done = () => { document.body.classList.remove("printing-report"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  const title = document.title;
  document.title = `${state.projectName || "Battery report"}${state.revision ? ` Rev ${state.revision}` : ""}`;
  window.print();
  document.title = title;
  setTimeout(done, 1000);
}
