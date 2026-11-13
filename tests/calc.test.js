// Unit tests for calc.js. Run with:  node tests/calc.test.js
const path = require("path");
const C = require(path.join(__dirname, "..", "calc.js"));
const Sim = require(path.join(__dirname, "..", "simulation.js"));

let failures = 0;
function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 3.6 V 5 Ah 70 g cell, 12S24P modules, 8 in series = 96S24P (the original calculator's default pack)
const base = {
  buildStart: "cell", buildEnd: "vehicle",
  cellNominalV: 3.6, cellMaxV: 4.2, cellMinV: 3.0, cellCapacityAh: 5, cellMaxDischargeA: 18, cellContDischargeA: 8, cellMaxChargeA: 5, cellMassG: 70,
  modSeries: 12, modParallel: 24, modOverheadMode: "percent", modMassOverheadPct: 0,
  packModules: 8, packStrings: 1, packOverheadMode: "percent", packMassOverheadPct: 0,
  // v2.17: a straight-line OCV table (3.0–4.2 V) and BMS voltages at 6 % and 94 % give the old 0.88 window.
  cellOcvTable: "0, 3.0\n100, 4.2", bmsMinV: 294.912, bmsMaxV: 396.288,
  vehMassKg: 1300, vehMassIncludesPack: true, payloadKg: 0, cd: 0.34, frontalAreaM2: 2.1, crr: 0.013, drivetrainEffPct: 90, auxBaseKW: 1,
  regenEnabled: true, regenEffPct: 65, regenDisableAboveSoc: 95, driveCycle: "wltp3b", graphResolutionS: 10
};

// 1. Cell → module → pack arithmetic
const b = C.computeBuild(base);
check("No validation errors for a valid build", b.errors.length === 0, b.errors.map(e => e.text).join("; "));
check("Cell energy 18 Wh", near(b.cell.energyWh, 18, 1e-9));
check("Cell Wh/kg = 18 / 0.07", near(b.cell.whPerKg, 257.142857, 1e-4));
check("Module 12S24P = 43.2 V, 120 Ah, 5.184 kWh", b.module1.config === "12S24P" && near(b.module1.nominalV, 43.2, 1e-9) && near(b.module1.capacityAh, 120, 1e-9) && near(b.module1.energyKWh, 5.184, 1e-9));
check("Pack 96S24P = 345.6 V, 41.472 kWh, 2304 cells", b.pack.config === "96S24P" && near(b.pack.nominalV, 345.6, 1e-9) && near(b.pack.energyKWh, 41.472, 1e-9) && b.pack.cells === 2304);
check("Pack usable = 41.472 × 0.88", near(b.pack.usableKWh, 36.49536, 1e-9));
check("Pack current limits from cells × P", b.pack.peakA === 432 && b.pack.contA === 192 && b.pack.chargeA === 120);
check("Pack cell mass 161.28 kg", near(b.pack.cellMassKg, 161.28, 1e-9));

// 2. Mass overheads
const withOverheads = C.computeBuild({ ...base, modMassOverheadPct: 20, packMassOverheadPct: 25 });
check("Module mass = cells × 1.20", near(withOverheads.module1.massKg, 0.07 * 288 * 1.2, 1e-9));
check("Pack mass = modules × 1.25", near(withOverheads.pack.massKg, 0.07 * 288 * 1.2 * 8 * 1.25, 1e-9), withOverheads.pack.massKg.toFixed(2) + " kg");
const itemised = C.computeBuild({ ...base, modOverheadMode: "itemised", modItemHousingKg: 2, modItemInterconnectKg: 0.5, packOverheadMode: "itemised", packItemEnclosureKg: 30, packItemBmsKg: 3 });
check("Itemised module overhead added", near(itemised.module1.massKg, 20.16 + 2.5, 1e-9));
check("Itemised pack overhead added", near(itemised.pack.massKg, (20.16 + 2.5) * 8 + 33, 1e-9));

// 3. Volume and density
const cyl = C.computeCell({ ...base, cellFormat: "cyl21700" });
check("21700 volume = π × 10.5² × 70 mm³", near(cyl.volumeL, Math.PI * 10.5 ** 2 * 70 / 1e6, 1e-12), (cyl.volumeL * 1000).toFixed(2) + " mL");
const pouch = C.computeCell({ ...base, cellFormat: "pouch", cellLengthMm: 200, cellWidthMm: 100, cellThicknessMm: 10 });
check("Pouch volume = 0.2 L", near(pouch.volumeL, 0.2, 1e-12));
const enclosure = C.computeBuild({ ...base, packLengthMm: 1500, packWidthMm: 1000, packHeightMm: 150 });
check("Pack Wh/L from enclosure", near(enclosure.pack.whPerL, 41472 / 225, 1e-9));
const cad = C.computeBuild({ ...base, packVolumeMethod: "cad", packVolumeL: 190, packLengthMm: 1500, packWidthMm: 1000, packHeightMm: 150 });
check("Enclosure from CAD: Wh/L uses the CAD volume, not the overall size", near(cad.pack.whPerL, 41472 / 190, 1e-9) && cad.pack.overallMm.join() === "1500,1000,150");
const bx = C.computeBuild({ ...base, packVolumeMethod: "boxes", packBoxes: "Main tray, 1400, 900, 120\nRaised section, 500, 600, 150\nbad line", packLengthMm: 1400, packWidthMm: 900, packHeightMm: 270 });
check("Enclosure made of boxes: volumes added, bad lines ignored", near(bx.pack.enclosureL, 196.2, 1e-9) && bx.pack.enclosureBoxes.length === 2 && bx.pack.enclosureBoxes[0].name === "Main tray");
check("No CAD volume entered: no pack Wh/L", C.computeBuild({ ...base, packVolumeMethod: "cad", packLengthMm: 1500, packWidthMm: 1000, packHeightMm: 150 }).pack.whPerL === null);

// Pack voltage window from the BMS (v2.14)
const vw = C.computeBuild({ ...base, bmsEnabled: true, bmsMinV: 300, bmsMaxV: 390 });
check("BMS voltage window narrows the pack voltage", vw.pack.minV === 300 && near(vw.pack.maxV, 390, 1e-9) && vw.pack.minVSource === "pack" && (!vw.engineInput || vw.engineInput.packMinVoltageV === 300));
// v2.17: the BMS voltages are required and set the charge window on the OCV table
check("BMS window outside the cells' limits is an error", C.computeBuild({ ...base, bmsMinV: 100, bmsMaxV: 1000 }).errors.filter((e) => /below the cells'|above the cells'/.test(e.text)).length === 2);
check("Missing BMS voltages are errors", C.computeBuild({ ...base, bmsMinV: "", bmsMaxV: 0 }).errors.filter((e) => /Enter the BMS/.test(e.text)).length === 2);
check("Missing OCV table is an error", C.computeBuild({ ...base, cellOcvTable: "" }).errors.some((e) => /OCV table is required/.test(e.text)));
check("Window 6–94 % from the voltages (usable 0.88)", near(b.pack.socBottom, 6, 1e-3) && near(b.pack.socTop, 94, 1e-3) && near(b.pack.usableFactor, 0.88, 1e-5), `${b.pack.socBottom}–${b.pack.socTop}`);
check("Window reaches the engine", near(Sim.buildPackModel(b.engineInput).socBottom, 6, 1e-3) && near(Sim.buildPackModel(b.engineInput).socTop, 94, 1e-3));
const tbl = "7, 2.956\n9, 3.0\n50, 3.6\n99, 4.131\n100, 4.166";
const wI = Sim.ocvWindow(Sim.parseOcvTable(tbl).points, 3.0, 4.148);
check("Integra-style table: 3.0 V → 9 %, 4.148 V → 99.5 %", near(wI.bottom, 9, 0.011) && near(wI.top, 99.486, 0.02), `${wI.bottom.toFixed(3)}–${wI.top.toFixed(3)}`);
const wC = Sim.ocvWindow(Sim.parseOcvTable(tbl).points, 2.5, 4.2);
check("Voltages beyond the table: 0–100 %, flagged", wC.bottom === 0 && wC.top === 100 && wC.bottomClamped && wC.topClamped);
const mw = C.computeBuild({ ...base, buildStart: "module", mdNominalV: 43.2, mdMaxV: 50.4, mdMinV: 36, mdCapacityAh: 120, mdMaxDischargeA: 432, mdContDischargeA: 192, mdMaxChargeA: 120, mdMassKg: 20.16, mdOcvTable: "" });
check("Module build without a module OCV table is an error", mw.errors.some((e) => /module OCV table/.test(e.text)));
check("BMS min above max is an error", C.computeBuild({ ...base, bmsEnabled: true, bmsMinV: 400, bmsMaxV: 300 }).errors.some((e) => /BMS minimum/.test(e.text)));

// Regen and auxiliary loads (v2.13)
const L0 = C.auxLoads({ auxBaseKW: 0.5, acEnabled: true, heatingEnabled: true, heaterType: "heatPump", climateUsePct: 100 });
check("Old inputs (no kW figures): fixed values used", near(L0.total, 0.5 + 1.5 + 0.75, 1e-12));
const L1 = C.auxLoads({ auxBaseKW: 0.4, acEnabled: true, acKW: 2, heatingEnabled: true, heatingKW: 1.2, climateUsePct: 100 });
check("Entered kW figures are used", near(L1.total, 3.6, 1e-12) && L1.ac === 2 && L1.heat === 1.2);
// Climate control average use (v2.15)
const L2 = C.auxLoads({ auxBaseKW: 0.5, acEnabled: true, acKW: 1.5, heatingEnabled: true, heatingKW: 0.75, climateUsePct: 30 });
check("Climate at 30 %: 0.5 + 2.25 × 0.3 = 1.175 kW", near(L2.total, 1.175, 1e-12) && near(L2.ac, 0.45, 1e-12) && L2.acRated === 1.5 && L2.climateMissing === false);
const L3 = C.auxLoads({ auxBaseKW: 0.5, acEnabled: true, acKW: 1.5, climateUsePct: "" });
check("Climate use blank: AC not counted, flagged", L3.total === 0.5 && L3.climateMissing === true && L3.acRated === 1.5);
check("Climate use blank with AC and heating off: not flagged", C.auxLoads({ auxBaseKW: 0.5, climateUsePct: "" }).climateMissing === false);
check("Climate use 0 %: counted as zero, not flagged", C.auxLoads({ auxBaseKW: 0.5, heatingEnabled: true, heatingKW: 2.5, climateUsePct: 0 }).total === 0.5);
check("Loads switched off add nothing", C.auxLoads({ auxBaseKW: 0.5, acEnabled: false, acKW: 3 }).total === 0.5);
check("Regen off above: displayed 95 % in a 0.9 window = cell 90.5 %", near(C.regenOffCellSoc({ regenOffAboveDisplayPct: 95 }, 0.9), 90.5, 1e-9));
check("Regen off above: old cell value used when no displayed value", C.regenOffCellSoc({ regenDisableAboveSoc: 95 }, 0.9) === 95);
const eiAux = C.computeBuild({ ...base, auxBaseKW: 0.5, acEnabled: true, acKW: 2, climateUsePct: 100 }).engineInput;
check("Engine gets one total auxiliary load", near(eiAux.assumedLoadKW, 2.5, 1e-12) && eiAux.airConditioningEnabled === false);

// 4. BMS limits
const bms = C.computeBuild({ ...base, bmsEnabled: true, bmsPeakA: 350, bmsPeakS: 10, bmsContA: 150, bmsChargeA: 60, bmsNote: "HV connector" });
check("Pack ratings (as limits) cap pack limits", bms.pack.peakA === 350 && bms.pack.contA === 150 && bms.pack.chargeA === 60 && bms.pack.regenA === 60 && bms.pack.peakSource === "pack");
check("BMS peak duration carried", bms.pack.peakDurationS === 10);

// 5. Module ratings: cell → module → pack chain
const modLimit = C.computeBuild({ ...base, cellPulseDurationS: 10, modRatingsEnabled: true, modRatingsMode: "limit", modPeakA: 350, modContA: 220, modChargeA: 100 });
const ml = modLimit.module1;
check("Module limits: peak 350 A from module", ml.maxDischargeA === 350 && ml.ratings.src.peakA === "module");
check("Module limits: continuous 192 A stays with cells (220 entered)", ml.contDischargeA === 192 && ml.ratings.src.contA === "cells");
check("Module limits: charge 100 A from module, regen 96 A (80 % of cells)", ml.maxChargeA === 100 && ml.ratings.regenA === 96);
check("Module limits flow to the pack", modLimit.pack.peakA === 350 && modLimit.pack.contA === 192 && modLimit.pack.peakSource === "module" && modLimit.pack.peakDurationS === 10);
check("No warnings in limit mode", !modLimit.warnings.some((w) => w.id.startsWith("mod")));
const modReplace = C.computeBuild({ ...base, modRatingsEnabled: true, modRatingsMode: "replace", modPeakA: 350, modContA: 220, modChargeA: 100 });
check("Module rating (replace): continuous 220 A used above cells", modReplace.pack.contA === 220 && modReplace.pack.contSource === "module" && modReplace.pack.regenA === 100);
check("Replace above cell figure gives a warning on the field", modReplace.warnings.some((w) => w.id === "modContA"));
const shortPeak = C.computeBuild({ ...base, cellPulseDurationS: 10, modRatingsEnabled: true, modPeakS: 5 });
check("Shorter module peak duration applies", shortPeak.pack.peakDurationS === 5 && shortPeak.pack.peakDurationSource === "module");
const twoStrings = C.computeBuild({ ...base, packModules: 4, packStrings: 2, bmsMinV: 147.456, bmsMaxV: 198.144, modRatingsEnabled: true, modPeakA: 350 });
check("Module ratings × strings at the pack", twoStrings.pack.peakA === 700);
const packLimit = C.computeBuild({ ...base, modRatingsEnabled: true, modPeakA: 350, modContA: 220, modChargeA: 100, bmsEnabled: true, bmsPeakA: 400, bmsContA: 180, bmsChargeA: 150 });
check("Pack rating (limit) 180 A continuous from pack", packLimit.pack.contA === 180 && packLimit.pack.contSource === "pack" && packLimit.pack.peakA === 350 && packLimit.pack.peakSource === "module");
const pm = Sim.buildPackModel(packLimit.engineInput);
check("Engine uses the chain's pack figures", pm.cellDischargeLimitA === 350 && pm.continuousLimitA === 180 && pm.chargeLimitA === 96);
const packReplace = C.computeBuild({ ...base, bmsEnabled: true, bmsMode: "replace", bmsContA: 250 });
check("Pack rating (replace) above modules warns", packReplace.pack.contA === 250 && packReplace.warnings.some((w) => w.id === "bmsContA"));

// 6. Parallel strings
const strings = C.computeBuild({ ...base, packModules: 4, packStrings: 2, bmsMinV: 147.456, bmsMaxV: 198.144 });
check("2 strings of 4 × 12S24P = 48S48P", strings.pack.config === "48S48P" && near(strings.pack.energyKWh, 41.472, 1e-9) && strings.pack.moduleCount === 8);

// 7. Module-datasheet path matches the cell path
const moduleStart = C.computeBuild({
  ...base, buildStart: "module",
  mdNominalV: 43.2, mdMaxV: 50.4, mdMinV: 36, mdCapacityAh: 120, mdMaxDischargeA: 432, mdContDischargeA: 192, mdMaxChargeA: 120, mdMassKg: 20.16, mdOcvTable: "0, 36\n100, 50.4"
});
check("Module-start pack energy equals cell-start", near(moduleStart.pack.energyKWh, b.pack.energyKWh, 1e-9));
const simCell = Sim.simulateDriveCycle(b.engineInput);
const simModule = Sim.simulateDriveCycle(moduleStart.engineInput);
check("Module-start WLTP range equals cell-start", near(simCell.distanceMiles, simModule.distanceMiles, 0.05), `${simCell.distanceMiles.toFixed(2)} vs ${simModule.distanceMiles.toFixed(2)} mi`);
check("WLTP range matches the previous calculator (146.0 mi)", near(simCell.distanceMiles, 146.0, 0.1));

// 8. Pack mass added to vehicle mass when the vehicle figure excludes the pack
const excl = C.computeBuild({ ...base, vehMassIncludesPack: false, vehMassKg: 1140 });
check("Vehicle mass = 1140 + pack 161.28", near(excl.vehicleMassKg, 1301.28, 1e-9));

// 9. Charging
const charge = C.computeBuild({ ...base, acChargerKW: 11, dcChargerKW: 100 });
check("AC 0-100 % hours = usable / 11 kW", near(charge.charging.acHours, 36.49536 / 11, 1e-9));
check("DC limited by pack charge power (120 A × 345.6 V)", charge.charging.dcLimitedBy === "pack" && near(charge.charging.dcKW, 41.472, 1e-9));

// 10. Validation and warnings
check("Min > max voltage is an error", C.computeBuild({ ...base, cellMinV: 4.5 }).errors.length > 0);
check("Cd 0.9 gives a warning", C.computeBuild({ ...base, cd: 0.9 }).warnings.some(w => w.id === "cd"));
check("Module-only build has no pack", C.computeBuild({ ...base, buildEnd: "module" }).pack === null);

// 11. Drive-cycle settings reach the engine
const c60 = Sim.simulateDriveCycle(C.computeBuild({ ...base, driveCycle: "constant", constantSpeedMph: 60 }).engineInput);
const c70 = Sim.simulateDriveCycle(C.computeBuild({ ...base, driveCycle: "constant", constantSpeedMph: 70 }).engineInput);
check("Constant speed setting is used (60 mph range > 70 mph range)", c60.ok && c70.ok && c60.distanceMiles > c70.distanceMiles + 5, `${c60.distanceMiles.toFixed(1)} vs ${c70.distanceMiles.toFixed(1)} mi`);
const prof = ["time,speed", "0,0", "60,50", "300,50", "360,0"].join("\n");
const cp = Sim.simulateDriveCycle(C.computeBuild({ ...base, driveCycle: "custom", customProfileText: prof, customProfileUnit: "kmh" }).engineInput);
check("Uploaded profile reaches the engine", cp.ok === true, cp.reason || "");

// 12. Cell peak charge current (regen)
const pc = C.computeBuild({ ...base, cellPeakChargeA: 15, cellPeakChargeS: 10 });
check("Peak charge × P at the pack (15 A × 24 = 360 A for 10 s)", pc.pack.peakChargeA === 360 && pc.pack.peakChargeS === 10 && pc.pack.chargeA === 120);
check("Regen peak = 80 % of peak (288 A), then 80 % of continuous (96 A)", Math.abs(pc.pack.regenPeakA - 288) < 1e-9 && Math.abs(pc.pack.regenA - 96) < 1e-9);
const pcm = Sim.buildPackModel(pc.engineInput);
check("Engine regen: 288 A peak for 10 s, 96 A continuous", Math.abs(pcm.regenPeakLimitA - 288) < 1e-9 && pcm.regenPeakDurationS === 10 && Math.abs(pcm.chargeLimitA - 96) < 1e-9);
const pcLimit = C.computeBuild({ ...base, cellPeakChargeA: 15, cellPeakChargeS: 10, bmsEnabled: true, bmsChargeA: 200 });
check("Pack charge rating caps the peak charge (200 A)", pcLimit.pack.peakChargeA === 200 && pcLimit.pack.regenPeakA === 200 && pcLimit.pack.chargeA === 120);
const simNo = Sim.simulateDriveCycle(b.engineInput);
const small = { ...base, modParallel: 4 };   // a small pack, so regen is limited by the charge rating
const smallNo = Sim.simulateDriveCycle(C.computeBuild(small).engineInput);
const smallPk = Sim.simulateDriveCycle(C.computeBuild({ ...small, cellPeakChargeA: 15, cellPeakChargeS: 10 }).engineInput);
check("Peak regen recovers more energy when regen is limited", smallPk.regenRecoveredKWh > smallNo.regenRecoveredKWh * 1.02 && smallNo.regenLimitedSeconds > 0, `${smallNo.regenRecoveredKWh.toFixed(3)} → ${smallPk.regenRecoveredKWh.toFixed(3)} kWh`);
check("No peak entered: identical to before", Sim.simulateDriveCycle(C.computeBuild({ ...base, cellPeakChargeA: 0, cellPeakChargeS: 10 }).engineInput).distanceMiles === simNo.distanceMiles);
check("Peak charge below continuous is an error", C.computeBuild({ ...base, cellPeakChargeA: 3 }).errors.some((e) => /peak charge/i.test(e.text)));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
