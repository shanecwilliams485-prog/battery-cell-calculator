// Cell → module → pack calculations (static, no time simulation).
//
// Pure functions only, so they can be unit tested with Node:
//   node tests/calc.test.js
//
// Hierarchy
//   Cell    : datasheet values.
//   Module  : either built from cells (series × parallel) or entered from a
//             module datasheet.
//   Pack    : modules in series × parallel strings.
//
// Current ratings follow the same chain: the cell sets the module, the module
// sets the pack (optional module ratings can limit or replace the cell-based
// figures), the pack sets what the vehicle can draw (optional pack ratings:
// BMS, fuse, contactors or a validated pack design).
//
// The vehicle simulation (simulation.js) works on a repeating "series element":
// a cell when the build starts from cells, a module when it starts from a
// module datasheet. toEngineInput() produces that mapping.

(function (root) {
  const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const pos = (value) => Math.max(0, num(value));
  const has = (value) => num(value) > 0;

  // Standard cylindrical formats: the name gives diameter and length in mm.
  const CELL_FORMATS = {
    cyl18650: { label: "Cylindrical 18650", shape: "cylindrical", diameterMm: 18, lengthMm: 65 },
    cyl21700: { label: "Cylindrical 21700", shape: "cylindrical", diameterMm: 21, lengthMm: 70 },
    cyl4680: { label: "Cylindrical 4680", shape: "cylindrical", diameterMm: 46, lengthMm: 80 },
    cylCustom: { label: "Cylindrical (other size)", shape: "cylindrical" },
    prismatic: { label: "Prismatic", shape: "box" },
    pouch: { label: "Pouch", shape: "box" }
  };

  const BUILD_STEPS = ["cell", "module", "pack", "vehicle"];

  function buildRange(input) {
    const start = input.buildStart === "module" ? "module" : "cell";
    let end = BUILD_STEPS.includes(input.buildEnd) ? input.buildEnd : "vehicle";
    if (BUILD_STEPS.indexOf(end) < BUILD_STEPS.indexOf("module")) end = "module";
    return {
      start,
      end,
      includes: (step) => BUILD_STEPS.indexOf(step) >= BUILD_STEPS.indexOf(start) && BUILD_STEPS.indexOf(step) <= BUILD_STEPS.indexOf(end)
    };
  }

  // Volume of a box from three mm dimensions, in litres (null if incomplete).
  // A value that has been entered (0 counts), as opposed to blank.
  const given = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));

  // Auxiliary loads (v2.13): each load has its own kW. Inputs saved before v2.13 have no kW
  // figures, so the old fixed values are used for them.
  function auxLoads(input) {
    const base = Math.max(0, num(input.auxBaseKW, 1.0));
    const ac = input.acEnabled ? Math.max(0, given(input.acKW) ? num(input.acKW) : 1.5) : 0;
    const heat = input.heatingEnabled ? Math.max(0, given(input.heatingKW) ? num(input.heatingKW) : (input.heaterType === "heatPump" ? 0.75 : 2.5)) : 0;
    const legacyAccessories = input.accessoriesEnabled ? 0.5 : 0;
    return { base, ac, heat, legacyAccessories, total: base + ac + heat + legacyAccessories };
  }

  // Regen off above a displayed charge (v2.13) → the engine's cell SOC, through the usable window.
  function regenOffCellSoc(input, usableFactor) {
    if (!given(input.regenOffAboveDisplayPct)) return input.regenDisableAboveSoc;
    const uf = Math.min(1, Math.max(0.01, num(usableFactor, 1)));
    const bottom = (1 - uf) * 50, top = 100 - bottom;
    const d = Math.min(100, Math.max(0, num(input.regenOffAboveDisplayPct)));
    return bottom + (top - bottom) * d / 100;
  }

  function boxLitres(l, w, h) {
    return has(l) && has(w) && has(h) ? (num(l) * num(w) * num(h)) / 1e6 : null;
  }

  // Enclosure made of several boxes (v2.12.3): one per line, "name, length, width, height" in mm.
  // The name is optional; the last three numbers on a line are the dimensions.
  function parseBoxes(text) {
    return String(text || "").split(/\r?\n/).map((line) => {
      const parts = line.split(/[,;\t]/).map((x) => x.trim());
      if (parts.length < 3) return null;
      const dims = parts.slice(-3).map(Number);
      if (!dims.every((d) => Number.isFinite(d) && d > 0)) return null;
      const name = parts.slice(0, -3).join(", ").trim();
      return { name, l: dims[0], w: dims[1], h: dims[2], litres: dims[0] * dims[1] * dims[2] / 1e6 };
    }).filter(Boolean);
  }

  // Pack enclosure volume for Wh/L: from CAD, or the sum of several boxes.
  // Inputs without a method (older callers) use the length × width × height box, as before.
  function enclosureVolume(input) {
    const overall = boxLitres(input.packLengthMm, input.packWidthMm, input.packHeightMm);
    const method = input.packVolumeMethod;
    if (method === "cad") return { litres: has(input.packVolumeL) ? num(input.packVolumeL) : null, method, boxes: [], overall };
    if (method === "boxes") {
      const boxes = parseBoxes(input.packBoxes);
      return { litres: boxes.length ? boxes.reduce((sum, b) => sum + b.litres, 0) : null, method, boxes, overall };
    }
    return { litres: overall, method: "overall", boxes: [], overall };
  }

  function overheadMass(baseKg, mode, pct, items) {
    if (mode === "itemised") {
      const extra = items.reduce((sum, value) => sum + pos(value), 0);
      return { totalKg: baseKg + extra, overheadKg: extra };
    }
    const extra = baseKg * pos(pct) / 100;
    return { totalKg: baseKg + extra, overheadKg: extra };
  }

  // ---------------------------------------------------------------------------
  // Cell
  // ---------------------------------------------------------------------------
  function computeCell(input) {
    const fmt = CELL_FORMATS[input.cellFormat] || null;
    const shape = fmt ? fmt.shape : null;
    const diameterMm = fmt && fmt.diameterMm ? fmt.diameterMm : pos(input.cellDiameterMm);
    const lengthMm = fmt && fmt.lengthMm ? fmt.lengthMm : pos(input.cellLengthMm);

    let volumeL = null;
    if (shape === "cylindrical" && diameterMm > 0 && lengthMm > 0) {
      volumeL = Math.PI * (diameterMm / 2) ** 2 * lengthMm / 1e6;
    } else if (shape === "box") {
      volumeL = boxLitres(input.cellLengthMm, input.cellWidthMm, input.cellThicknessMm);
    }

    const nominalV = num(input.cellNominalV);
    const capacityAh = pos(input.cellCapacityAh);
    const energyWh = nominalV * capacityAh;
    const massKg = pos(input.cellMassG) / 1000;

    return {
      formatLabel: fmt ? fmt.label : null,
      shape,
      diameterMm: shape === "cylindrical" ? diameterMm : null,
      lengthMm: shape === "cylindrical" ? lengthMm : (shape === "box" ? pos(input.cellLengthMm) : null),
      widthMm: shape === "box" ? pos(input.cellWidthMm) : null,
      thicknessMm: shape === "box" ? pos(input.cellThicknessMm) : null,
      nominalV,
      maxV: num(input.cellMaxV),
      minV: num(input.cellMinV),
      capacityAh,
      energyWh,
      maxDischargeA: pos(input.cellMaxDischargeA),
      contDischargeA: pos(input.cellContDischargeA),
      maxChargeA: pos(input.cellMaxChargeA),
      maxDischargeC: capacityAh > 0 ? pos(input.cellMaxDischargeA) / capacityAh : 0,
      contDischargeC: capacityAh > 0 ? pos(input.cellContDischargeA) / capacityAh : 0,
      maxChargeC: capacityAh > 0 ? pos(input.cellMaxChargeA) / capacityAh : 0,
      // Optional short-term (peak) charge rating, e.g. for regenerative braking.
      peakChargeA: pos(input.cellPeakChargeA) > pos(input.cellMaxChargeA) ? pos(input.cellPeakChargeA) : 0,
      peakChargeS: pos(input.cellPeakChargeA) > pos(input.cellMaxChargeA) ? pos(input.cellPeakChargeS) : 0,
      peakChargeC: capacityAh > 0 ? pos(input.cellPeakChargeA) / capacityAh : 0,
      massKg,
      volumeL,
      whPerKg: massKg > 0 ? energyWh / massKg : null,
      whPerL: volumeL ? energyWh / volumeL : null,
      dcirMOhm: pos(input.cellDcirMOhm),
      pulseDurationS: pos(input.cellPulseDurationS)
    };
  }

  // ---------------------------------------------------------------------------
  // Current-rating chain
  // ---------------------------------------------------------------------------
  // r = { peakA, peakS (Infinity = no limit), contA, chargeA, regenA, src: {…} }
  // entry = { peakA, peakS, contA, chargeA } (0 = not set); mode "limit" uses
  // the lower figure, "replace" uses the entry (higher or lower).
  const RATING_KEYS = [
    ["peakA", "Peak discharge", "A"],
    ["peakS", "Peak duration", "s"],
    ["contA", "Continuous discharge", "A"],
    ["chargeA", "Max charge", "A"]
  ];

  function scaleRatings(r, k) {
    return { ...r, peakA: r.peakA * k, contA: r.contA * k, chargeA: r.chargeA * k, regenA: r.regenA * k, peakChargeA: r.peakChargeA * k, regenPeakA: r.regenPeakA * k, src: { ...r.src } };
  }

  function applyRatings(prev, entry, mode, level) {
    const out = { ...prev, src: { ...prev.src } };
    const rows = [];
    const warnings = [];
    for (const [key, label, unit] of RATING_KEYS) {
      const before = prev[key];
      const value = has(entry[key]) ? num(entry[key]) : null;
      let used = before;
      if (value !== null) {
        if (mode === "replace" || value < before) {
          used = value;
          out[key] = value;
          out.src[key] = level;
        }
        if (mode === "replace" && value > before + 1e-9) warnings.push({ key, label, unit, value, before });
      }
      rows.push({ key, label, unit, before, entry: value, used, source: out.src[key] });
    }
    // Regen and the peak charge follow the charge rating at each level.
    if (has(entry.chargeA)) {
      const c = num(entry.chargeA);
      if (mode === "replace" || c < out.regenA) { out.regenA = c; out.src.regenA = level; }
      if (mode === "replace" || c < out.peakChargeA) { out.peakChargeA = c; out.src.peakChargeA = level; }
      if (mode === "replace" || c < out.regenPeakA) { out.regenPeakA = c; out.src.regenPeakA = level; }
    }
    // A peak can never be below its continuous figure.
    if (out.peakChargeA < out.chargeA) out.peakChargeA = out.chargeA;
    if (out.regenPeakA < out.regenA) out.regenPeakA = out.regenA;
    // Continuous can never exceed peak.
    if (out.contA > out.peakA) { out.contA = out.peakA; out.src.contA = out.src.peakA; }
    return { ratings: out, rows, warnings };
  }

  function ratingEntry(input, prefix) {
    return prefix === "mod"
      ? { peakA: input.modPeakA, peakS: input.modPeakS, contA: input.modContA, chargeA: input.modChargeA }
      : { peakA: input.bmsPeakA, peakS: input.bmsPeakS, contA: input.bmsContA, chargeA: input.bmsChargeA };
  }

  // ---------------------------------------------------------------------------
  // Module built from cells
  // ---------------------------------------------------------------------------
  function moduleFromCells(cell, series, parallel, input) {
    const s = Math.max(0, Math.round(num(series)));
    const p = Math.max(0, Math.round(num(parallel)));
    const cells = s * p;
    const cellMassKg = cell.massKg * cells;
    const mass = overheadMass(cellMassKg, input.modOverheadMode, input.modMassOverheadPct, [
      input.modItemHousingKg, input.modItemInterconnectKg, input.modItemElectronicsKg, input.modItemOtherKg
    ]);
    const totalKg = mass.totalKg;
    const nominalV = cell.nominalV * s;
    const capacityAh = cell.capacityAh * p;
    const energyKWh = nominalV * capacityAh / 1000;
    const volumeL = boxLitres(input.modLengthMm, input.modWidthMm, input.modHeightMm);
    const cellVolumeL = cell.volumeL !== null ? cell.volumeL * cells : null;

    // Ratings: cell × parallel, then the optional module ratings.
    const base = {
      peakA: cell.maxDischargeA * p,
      peakS: cell.pulseDurationS > 0 ? cell.pulseDurationS : Infinity,
      contA: cell.contDischargeA * p,
      chargeA: cell.maxChargeA * p,
      regenA: cell.maxChargeA * p * 0.8,
      peakChargeA: (cell.peakChargeA || cell.maxChargeA) * p,
      peakChargeS: cell.peakChargeA > 0 && cell.peakChargeS > 0 ? cell.peakChargeS : Infinity,
      regenPeakA: (cell.peakChargeA || cell.maxChargeA) * p * 0.8,
      src: { peakA: "cells", peakS: "cells", contA: "cells", chargeA: "cells", regenA: "cells", peakChargeA: "cells", regenPeakA: "cells" }
    };
    const ratingsOn = !!input.modRatingsEnabled;
    const mode = input.modRatingsMode === "replace" ? "replace" : "limit";
    const applied = ratingsOn ? applyRatings(base, ratingEntry(input, "mod"), mode, "module") : { ratings: base, rows: [], warnings: [] };
    const r = applied.ratings;

    return {
      source: "cells",
      ratings: r,
      ratingRows: applied.rows,
      ratingWarnings: applied.warnings,
      ratingsOn,
      ratingsMode: mode,
      ratingsNote: ratingsOn ? String(input.modRatingsNote || "").trim() : "",
      cellMaxDischargeA: cell.maxDischargeA * p,
      cellContDischargeA: cell.contDischargeA * p,
      cellMaxChargeA: cell.maxChargeA * p,
      config: `${s}S${p}P`,
      series: s,
      parallel: p,
      cells,
      nominalV,
      maxV: cell.maxV * s,
      minV: cell.minV * s,
      capacityAh,
      energyKWh,
      maxDischargeA: r.peakA,
      contDischargeA: r.contA,
      maxChargeA: r.chargeA,
      maxDischargeKW: nominalV * r.peakA / 1000,
      contDischargeKW: nominalV * r.contA / 1000,
      maxChargeKW: nominalV * r.chargeA / 1000,
      cellMassKg,
      massKg: totalKg,
      overheadKg: totalKg - cellMassKg,
      volumeL,
      cellVolumeL,
      whPerKg: totalKg > 0 ? energyKWh * 1000 / totalKg : null,
      whPerL: volumeL ? energyKWh * 1000 / volumeL : null,
      dcirMOhm: cell.dcirMOhm > 0 && p > 0 ? cell.dcirMOhm * s / p : 0,
      pulseDurationS: Number.isFinite(r.peakS) ? r.peakS : 0
    };
  }

  // Module entered from a module datasheet
  function moduleFromDatasheet(input) {
    const nominalV = num(input.mdNominalV);
    const capacityAh = pos(input.mdCapacityAh);
    const energyKWh = nominalV * capacityAh / 1000;
    const massKg = pos(input.mdMassKg);
    const volumeL = boxLitres(input.mdLengthMm, input.mdWidthMm, input.mdHeightMm);
    const peakS = pos(input.mdPulseDurationS);
    const ratings = {
      peakA: pos(input.mdMaxDischargeA),
      peakS: peakS > 0 ? peakS : Infinity,
      contA: pos(input.mdContDischargeA),
      chargeA: pos(input.mdMaxChargeA),
      regenA: pos(input.mdMaxChargeA) * 0.8,
      peakChargeA: pos(input.mdMaxChargeA),
      peakChargeS: Infinity,
      regenPeakA: pos(input.mdMaxChargeA) * 0.8,
      src: { peakA: "module datasheet", peakS: "module datasheet", contA: "module datasheet", chargeA: "module datasheet", regenA: "module datasheet", peakChargeA: "module datasheet", regenPeakA: "module datasheet" }
    };
    return {
      source: "datasheet",
      ratings,
      ratingRows: [],
      ratingWarnings: [],
      ratingsOn: false,
      config: String(input.mdConfig || "").trim() || null,
      cellType: String(input.mdCellType || "").trim() || null,
      series: null,
      parallel: null,
      cells: null,
      nominalV,
      maxV: num(input.mdMaxV),
      minV: num(input.mdMinV),
      capacityAh,
      energyKWh,
      maxDischargeA: pos(input.mdMaxDischargeA),
      contDischargeA: pos(input.mdContDischargeA),
      maxChargeA: pos(input.mdMaxChargeA),
      maxDischargeKW: nominalV * pos(input.mdMaxDischargeA) / 1000,
      contDischargeKW: nominalV * pos(input.mdContDischargeA) / 1000,
      maxChargeKW: nominalV * pos(input.mdMaxChargeA) / 1000,
      cellMassKg: null,
      massKg,
      overheadKg: null,
      volumeL,
      cellVolumeL: null,
      whPerKg: massKg > 0 ? energyKWh * 1000 / massKg : null,
      whPerL: volumeL ? energyKWh * 1000 / volumeL : null,
      dcirMOhm: pos(input.mdDcirMOhm),
      pulseDurationS: pos(input.mdPulseDurationS)
    };
  }

  // ---------------------------------------------------------------------------
  // Pack
  // ---------------------------------------------------------------------------
  function computePack(input, range, cell, mod1) {
    const n1 = Math.max(0, Math.round(num(input.packModules)));
    const strings = Math.max(1, Math.round(num(input.packStrings, 1)));
    const fromCells = range.start === "cell";

    // Series element = cell (cell build) or module (module build), for the voltage model.
    const elementsInSeries = fromCells ? n1 * mod1.series : n1;
    const elementParallel = fromCells ? mod1.parallel * strings : strings;
    const element = fromCells ? cell : mod1;

    const nominalV = element.nominalV * elementsInSeries;
    // Pack voltage window (v2.14): the cells' limits × cells in series, narrowed by the BMS if entered.
    const cellMaxV = element.maxV * elementsInSeries;
    const cellMinV = element.minV * elementsInSeries;
    const bmsMinV = input.bmsEnabled && has(input.bmsMinV) ? num(input.bmsMinV) : null;
    const bmsMaxV = input.bmsEnabled && has(input.bmsMaxV) ? num(input.bmsMaxV) : null;
    const minV = bmsMinV !== null ? Math.max(cellMinV, bmsMinV) : cellMinV;
    const maxV = bmsMaxV !== null ? Math.min(cellMaxV, bmsMaxV) : cellMaxV;
    const capacityAh = element.capacityAh * elementParallel;
    const energyKWh = nominalV * capacityAh / 1000;
    const usableFactor = Math.min(1, Math.max(0, num(input.usableFactor, 1)));

    // Ratings: module × parallel strings, then the optional pack ratings.
    const base = scaleRatings(mod1.ratings, strings);
    const ratingsOn = !!input.bmsEnabled;
    const mode = input.bmsMode === "replace" ? "replace" : "limit";
    const applied = ratingsOn ? applyRatings(base, ratingEntry(input, "pack"), mode, "pack") : { ratings: base, rows: [], warnings: [] };
    const r = applied.ratings;

    const modulesMassKg = n1 * mod1.massKg * strings;
    const moduleCount = n1 * strings;
    const mass = overheadMass(modulesMassKg, input.packOverheadMode, input.packMassOverheadPct, [
      input.packItemEnclosureKg, input.packItemBusbarsKg, input.packItemBmsKg, input.packItemCoolingKg, input.packItemOtherKg
    ]);
    const encl = enclosureVolume(input);
    const enclosureL = encl.litres;
    const modulesVolumeL = mod1.volumeL !== null ? n1 * mod1.volumeL * strings : null;

    const dcirMOhm = element.dcirMOhm > 0 && elementParallel > 0 ? element.dcirMOhm * elementsInSeries / elementParallel : 0;
    const cells = fromCells ? elementsInSeries * elementParallel : null;

    return {
      moduleCount,
      modulesInSeries: n1,
      strings,
      seriesCells: fromCells ? elementsInSeries : null,
      parallelCells: fromCells ? elementParallel : null,
      config: fromCells ? `${elementsInSeries}S${elementParallel}P` : `${n1} modules${strings > 1 ? ` × ${strings} strings` : ""}`,
      cells,
      nominalV,
      maxV,
      minV,
      cellMaxV,
      cellMinV,
      minVSource: bmsMinV !== null && bmsMinV > cellMinV ? "pack" : "cells",
      maxVSource: bmsMaxV !== null && bmsMaxV < cellMaxV ? "pack" : "cells",
      capacityAh,
      energyKWh,
      usableFactor,
      usableKWh: energyKWh * usableFactor,
      moduleRatings: base,
      ratings: r,
      ratingRows: applied.rows,
      ratingWarnings: applied.warnings,
      ratingsOn,
      ratingsMode: mode,
      peakA: r.peakA,
      contA: r.contA,
      chargeA: r.chargeA,
      regenA: r.regenA,
      peakSource: r.src.peakA,
      contSource: r.src.contA,
      chargeSource: r.src.chargeA,
      regenSource: r.src.regenA,
      regenDerated: r.src.regenA === "cells" || r.src.regenA === "module datasheet",
      peakChargeA: r.peakChargeA,
      peakChargeKW: nominalV * r.peakChargeA / 1000,
      peakChargeS: r.peakChargeA > r.chargeA + 1e-9 && Number.isFinite(r.peakChargeS) ? r.peakChargeS : null,
      peakChargeSource: r.src.peakChargeA,
      regenPeakA: r.regenPeakA,
      peakDurationS: Number.isFinite(r.peakS) ? r.peakS : null,
      peakDurationSource: r.src.peakS,
      peakKW: nominalV * r.peakA / 1000,
      contKW: nominalV * r.contA / 1000,
      chargeKW: nominalV * r.chargeA / 1000,
      bmsEnabled: ratingsOn,
      bmsNote: ratingsOn ? String(input.bmsNote || "").trim() : "",
      dcirMOhm,
      modulesMassKg,
      cellMassKg: fromCells ? cell.massKg * cells : null,
      massKg: mass.totalKg,
      overheadKg: mass.overheadKg,
      enclosureL,
      enclosureMethod: encl.method,
      enclosureBoxes: encl.boxes,
      overallMm: encl.overall ? [num(input.packLengthMm), num(input.packWidthMm), num(input.packHeightMm)] : null,
      modulesVolumeL,
      whPerKg: mass.totalKg > 0 ? energyKWh * 1000 / mass.totalKg : null,
      whPerL: enclosureL ? energyKWh * 1000 / enclosureL : null,
      element,
      elementsInSeries,
      elementParallel
    };
  }

  // ---------------------------------------------------------------------------
  // Charging (simple constant-power estimate)
  // ---------------------------------------------------------------------------
  function computeCharging(input, pack) {
    if (!pack) return null;
    const packLimitKW = pack.chargeKW;
    const ac = has(input.acChargerKW) ? Math.min(num(input.acChargerKW), packLimitKW) : null;
    const dc = has(input.dcChargerKW) ? Math.min(num(input.dcChargerKW), packLimitKW) : null;
    return {
      packLimitKW,
      acKW: ac,
      dcKW: dc,
      acLimitedBy: has(input.acChargerKW) ? (num(input.acChargerKW) > packLimitKW ? "pack" : "charger") : null,
      dcLimitedBy: has(input.dcChargerKW) ? (num(input.dcChargerKW) > packLimitKW ? "pack" : "charger") : null,
      // Usable window 0-100 % on AC; 10-80 % on DC.
      acHours: ac ? pack.usableKWh / ac : null,
      dcMinutes: dc ? pack.usableKWh * 0.7 / dc * 60 : null
    };
  }

  // ---------------------------------------------------------------------------
  // Validation and sanity warnings
  // ---------------------------------------------------------------------------
  function validate(input, range) {
    const errors = [];
    if (range.start === "cell") {
      if (!(num(input.cellNominalV) > 0)) errors.push({ step: "cell", text: "Cell nominal voltage must be above zero." });
      if (!(num(input.cellMaxV) > num(input.cellMinV))) errors.push({ step: "cell", text: "Cell max voltage must be higher than min voltage." });
      if (num(input.cellNominalV) > num(input.cellMaxV) || num(input.cellNominalV) < num(input.cellMinV)) errors.push({ step: "cell", text: "Cell nominal voltage should sit between min and max voltage." });
      if (!(num(input.cellCapacityAh) > 0)) errors.push({ step: "cell", text: "Cell capacity must be above zero." });
      if (num(input.cellContDischargeA) > num(input.cellMaxDischargeA)) errors.push({ step: "cell", text: "Cell continuous discharge cannot exceed max discharge." });
      if (has(input.cellPeakChargeA) && num(input.cellPeakChargeA) < num(input.cellMaxChargeA)) errors.push({ step: "cell", text: "Cell peak charge current should not be below the continuous charge current." });
      if (!(num(input.modSeries) >= 1) || !(num(input.modParallel) >= 1)) errors.push({ step: "module", text: "Module series and parallel counts must be at least 1." });
      if (input.modRatingsEnabled && has(input.modContA) && has(input.modPeakA) && num(input.modContA) > num(input.modPeakA)) errors.push({ step: "module", text: "Module continuous rating should not exceed the module peak rating." });
    } else {
      if (!(num(input.mdNominalV) > 0)) errors.push({ step: "module", text: "Module nominal voltage must be above zero." });
      if (!(num(input.mdMaxV) > num(input.mdMinV))) errors.push({ step: "module", text: "Module max voltage must be higher than min voltage." });
      if (!(num(input.mdCapacityAh) > 0)) errors.push({ step: "module", text: "Module capacity must be above zero." });
      if (num(input.mdContDischargeA) > num(input.mdMaxDischargeA)) errors.push({ step: "module", text: "Module continuous discharge cannot exceed max discharge." });
    }
    if (range.includes("pack")) {
      if (!(num(input.packModules) >= 1)) errors.push({ step: "pack", text: "Pack needs at least one module in series." });
      if (!(num(input.usableFactor) > 0 && num(input.usableFactor) <= 1)) errors.push({ step: "pack", text: "Usable factor must be between 0 and 1 (e.g. 0.88)." });
      if (input.bmsEnabled && has(input.bmsContA) && has(input.bmsPeakA) && num(input.bmsContA) > num(input.bmsPeakA)) errors.push({ step: "pack", text: "Pack continuous rating should not exceed the pack peak rating." });
      if (input.bmsEnabled && has(input.bmsMinV) && has(input.bmsMaxV) && num(input.bmsMinV) >= num(input.bmsMaxV)) errors.push({ step: "pack", text: "BMS minimum pack voltage must be below the BMS maximum pack voltage." });
    }
    if (range.includes("vehicle")) {
      if (!(num(input.vehMassKg) > 0)) errors.push({ step: "vehicle", text: "Vehicle mass must be above zero." });
      if (!(num(input.drivetrainEffPct) > 30 && num(input.drivetrainEffPct) <= 100)) errors.push({ step: "vehicle", text: "Drivetrain efficiency should be between 30 and 100 %." });
      if (input.motorEnabled) {
        if (has(input.motorPeakS) && !has(input.motorContKW)) errors.push({ step: "vehicle", text: "Motor peak duration needs a continuous power to drop to." });
        if (has(input.motorMaxRpm) && !(has(input.gearRatio) && has(input.tyreRadiusMm))) errors.push({ step: "vehicle", text: "Motor max rpm needs the gear ratio and tyre radius." });
      }
    }
    return errors;
  }

  // Gentle range checks on values that are allowed but unusual.
  const SANITY = [
    { id: "cellNominalV", lo: 1.2, hi: 4.4, text: "Cell nominal voltage is outside the usual 1.2–4.4 V range." },
    { id: "cellCapacityAh", lo: 0.5, hi: 400, text: "Cell capacity looks unusual (0.5–400 Ah is typical)." },
    { id: "cellMassG", lo: 10, hi: 6000, text: "Cell mass looks unusual (10 g – 6 kg is typical)." },
    { id: "usableFactor", lo: 0.6, hi: 1, text: "Usable factor below 0.6 is unusual." },
    { id: "cd", lo: 0.2, hi: 0.7, text: "Drag coefficient outside 0.20–0.70 is unusual for a road vehicle." },
    { id: "frontalAreaM2", lo: 1.2, hi: 6, text: "Frontal area outside 1.2–6 m² is unusual." },
    { id: "crr", lo: 0.005, hi: 0.02, text: "Rolling resistance outside 0.005–0.020 is unusual for road tyres." },
    { id: "drivetrainEffPct", lo: 70, hi: 97, text: "Battery-to-wheel efficiency outside 70–97 % is unusual." },
    { id: "vehMassKg", lo: 300, hi: 4000, text: "Vehicle mass outside 300–4000 kg is unusual for a car." }
  ];

  function sanityWarnings(input, range) {
    const warnings = [];
    const active = (id) => {
      if (id.startsWith("cell")) return range.start === "cell";
      if (id === "usableFactor") return range.includes("pack");
      return range.includes("vehicle");
    };
    for (const rule of SANITY) {
      if (!active(rule.id)) continue;
      const value = num(input[rule.id], NaN);
      if (Number.isFinite(value) && value !== 0 && (value < rule.lo || value > rule.hi)) warnings.push({ id: rule.id, text: rule.text });
    }
    if (range.start === "cell" && has(input.cellMaxDischargeA) && has(input.cellCapacityAh) && num(input.cellMaxDischargeA) / num(input.cellCapacityAh) > 30) {
      warnings.push({ id: "cellMaxDischargeA", text: "Max discharge above 30C is unusual: check it is amps, not C-rate." });
    }
    return warnings;
  }

  // ---------------------------------------------------------------------------
  // Mapping to the simulation engine's input names
  // ---------------------------------------------------------------------------
  function toEngineInput(input, range, pack, cell) {
    const el = pack.element;
    const fromCells = range.start === "cell";
    const hasDcir = el.dcirMOhm > 0;
    const hasOcv = fromCells && String(input.cellOcvTable || "").trim().length > 0;
    const vehicleMass = pos(input.vehMassKg) + (input.vehMassIncludesPack ? 0 : pack.massKg);
    return {
      nominalVoltage: el.nominalV,
      maxVoltage: el.maxV,
      minVoltage: el.minV,
      packMaxVoltageV: pack.maxV,
      packMinVoltageV: pack.minV,
      capacityAh: el.capacityAh,
      maxDischargeCurrentA: el.maxDischargeA,
      continuousDischargeCurrentA: el.contDischargeA,
      maxChargeCurrentA: el.maxChargeA,
      cellPulseDurationSeconds: el.pulseDurationS,
      advancedCellEnabled: hasDcir || hasOcv,
      cellDcirMilliOhm: el.dcirMOhm,
      cellOcvTable: hasOcv ? input.cellOcvTable : "",
      seriesCount: pack.elementsInSeries,
      parallelCount: pack.elementParallel,
      usableEnergyFactor: pack.usableFactor,
      // Final pack ratings from the cell → module → pack chain.
      packRatingsEnabled: true,
      packPeakCurrentA: pack.peakA,
      packPeakDurationSeconds: pack.peakDurationS || 0,
      packContinuousCurrentA: pack.contA,
      packRegenCurrentA: pack.regenA,
      packRegenPeakCurrentA: pack.regenPeakA,
      packRegenPeakDurationSeconds: pack.regenPeakA > pack.regenA + 1e-9 && pack.peakChargeS ? pack.peakChargeS : 0,
      vehicleMassKg: vehicleMass,
      payloadKg: input.payloadKg,
      dragCoefficient: input.cd,
      frontalAreaM2: input.frontalAreaM2,
      rollingResistanceCoefficient: input.crr,
      drivetrainEfficiencyPercent: input.drivetrainEffPct,
      // All auxiliary loads go to the engine as one total (v2.13).
      assumedLoadKW: auxLoads(input).total,
      airConditioningEnabled: false,
      heatingEnabled: false,
      heaterType: input.heaterType,
      electricalAccessoriesEnabled: false,
      regenEnabled: !!input.regenEnabled,
      regenEfficiencyPercent: input.regenEffPct,
      regenDisableAboveSocPercent: regenOffCellSoc(input, pack.usableFactor),
      motorLimitsEnabled: !!input.motorEnabled,
      motorPeakPowerKW: input.motorPeakKW,
      motorPeakDurationSeconds: input.motorPeakS,
      motorContinuousPowerKW: input.motorContKW,
      controllerMaxCurrentA: input.controllerMaxA,
      motorMaxRegenPowerKW: input.motorRegenKW,
      motorPeakTorqueNm: input.motorTorqueNm,
      motorMaxRpm: input.motorMaxRpm,
      gearRatio: input.gearRatio,
      tyreRadiusMm: input.tyreRadiusMm,
      vehicleTopSpeedMph: input.topSpeedMph,
      driveCycle: input.driveCycle,
      constantSpeedMph: input.constantSpeedMph,
      customProfileText: input.customProfileText,
      customProfileUnit: input.customProfileUnit,
      simulationTimeStepSeconds: input.graphResolutionS
    };
  }

  // ---------------------------------------------------------------------------
  // Whole build
  // ---------------------------------------------------------------------------
  function computeBuild(input) {
    const range = buildRange(input);
    const errors = validate(input, range);
    const warnings = sanityWarnings(input, range);
    const out = { range, errors, warnings, cell: null, module1: null, pack: null, charging: null, engineInput: null, vehicleMassKg: null };
    if (errors.length) return out;

    if (range.start === "cell") {
      out.cell = computeCell(input);
      out.module1 = moduleFromCells(out.cell, input.modSeries, input.modParallel, input);
    } else {
      out.module1 = moduleFromDatasheet(input);
    }

    if (range.includes("pack")) {
      out.pack = computePack(input, range, out.cell, out.module1);
      out.charging = range.includes("vehicle") ? computeCharging(input, out.pack) : null;
      if (range.includes("vehicle")) {
        out.engineInput = toEngineInput(input, range, out.pack, out.cell);
        out.vehicleMassKg = out.engineInput.vehicleMassKg;
      }
    }
    // Ratings entered "as the module/pack rating" above what the level below gives.
    const fieldFor = { mod: { peakA: "modPeakA", peakS: "modPeakS", contA: "modContA", chargeA: "modChargeA" }, pack: { peakA: "bmsPeakA", peakS: "bmsPeakS", contA: "bmsContA", chargeA: "bmsChargeA" } };
    const fmtV = (v, unit) => `${Math.round(v * 10) / 10} ${unit}`;
    for (const w of (out.module1 && out.module1.ratingWarnings) || []) {
      out.warnings.push({ id: fieldFor.mod[w.key], text: `Module ${w.label.toLowerCase()} ${fmtV(w.value, w.unit)} is above what the cells give (${fmtV(w.before, w.unit)}). Check the module design is validated for it.` });
    }
    for (const w of (out.pack && out.pack.ratingWarnings) || []) {
      out.warnings.push({ id: fieldFor.pack[w.key], text: `Pack ${w.label.toLowerCase()} ${fmtV(w.value, w.unit)} is above what the modules give (${fmtV(w.before, w.unit)}). Check the modules and pack design are validated for it.` });
    }
    return out;
  }

  const api = { CELL_FORMATS, BUILD_STEPS, RATING_KEYS, applyRatings, parseBoxes, enclosureVolume, auxLoads, regenOffCellSoc, buildRange, computeCell, moduleFromCells, moduleFromDatasheet, computePack, computeCharging, validate, sanityWarnings, toEngineInput, computeBuild };
  root.VoltCalc = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
