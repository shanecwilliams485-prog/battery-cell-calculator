// Unit tests for simulation.js. Run with:  node tests/simulation.test.js
// No dependencies. Exits with code 1 if any check fails.

const path = require("path");
const Sim = require(path.join(__dirname, "..", "simulation.js"));

let failures = 0;
function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const base = {
  nominalVoltage: 3.6, maxVoltage: 4.2, minVoltage: 3.0, capacityAh: 5,
  maxDischargeCurrentA: 18, continuousDischargeCurrentA: 8, maxChargeCurrentA: 5,
  seriesCount: 96, parallelCount: 24, usableEnergyFactor: 0.88,
  vehicleMassKg: 1300, dragCoefficient: 0.34, frontalAreaM2: 2.1, rollingResistanceCoefficient: 0.013,
  drivetrainEfficiencyPercent: 90, assumedLoadKW: 1, simulationTimeStepSeconds: 10,
  regenEnabled: true, regenEfficiencyPercent: 65, regenDisableAboveSocPercent: 95,
  driveCycle: "wltp3b"
};
const OCV = "0,3.00\n5,3.30\n10,3.45\n20,3.55\n30,3.60\n40,3.65\n50,3.70\n60,3.78\n70,3.88\n80,3.97\n90,4.08\n100,4.20";

// 1. WLTC data integrity (UN GTR 15 Class 3b)
const trace = Sim.WLTC_CLASS3B_KMH;
const sum = trace.reduce((a, b) => a + b, 0);
let distKm = 0;
for (let i = 0; i < trace.length - 1; i++) distKm += (trace[i] + trace[i + 1]) / 2 / 3600;
check("WLTC 3b has 1801 samples", trace.length === 1801);
check("WLTC 3b checksum 83758.6", near(sum, 83758.6, 0.05), sum.toFixed(1));
check("WLTC 3b distance 23.266 km", near(distKm, 23.266, 0.002), distKm.toFixed(3));
check("WLTC 3b max speed 131.3 km/h", Math.max(...trace) === 131.3);

// 2. Simulated vehicle follows the full WLTC distance when unconstrained
const unconstrained = Sim.simulateDriveCycle({ ...base, regenEnabled: false });
const kmPerCycle = unconstrained.distanceMiles * 1.609344 / unconstrained.cyclesCompleted;
check("No trace misses for a capable vehicle", unconstrained.secondsTraceMissed === 0);
check("Distance per WLTC cycle = 23.27 km", near(kmPerCycle, 23.266, 0.05), kmPerCycle.toFixed(3));

// 3. Constant 70 mph against a hand calculation
const v = 70 * 0.44704;
const force = 1300 * 9.81 * 0.013 + 0.5 * 1.225 * 0.34 * 2.1 * v * v;
const handWhPerMile = ((force * v / 0.9 + 1000) / 1000) / 70 * 1000;
const motorway = Sim.simulateDriveCycle({ ...base, driveCycle: "motorway70" });
check("70 mph consumption matches road-load hand calc", near(motorway.consumptionKWhPerMile * 1000, handWhPerMile, 0.5),
  `${(motorway.consumptionKWhPerMile * 1000).toFixed(1)} vs ${handWhPerMile.toFixed(1)} Wh/mile`);

// 4. Range is independent of pack voltage for the same energy (no electrical model)
const ranges = [[96, 24], [24, 96], [192, 12]].map(([s, p]) => Sim.simulateDriveCycle({ ...base, seriesCount: s, parallelCount: p }).distanceMiles);
check("Range independent of series/parallel split", Math.max(...ranges) - Math.min(...ranges) < 0.01, ranges.map(r => r.toFixed(2)).join(" / "));

// 5. Deterministic
const r1 = Sim.simulateDriveCycle(base).distanceMiles;
const r2 = Sim.simulateDriveCycle(base).distanceMiles;
check("Same inputs give identical results", r1 === r2);

// 6. Energy balance with the equivalent-circuit model
const ecm = Sim.simulateDriveCycle({ ...base, advancedCellEnabled: true, cellOcvTable: OCV, cellDcirMilliOhm: 30 });
const expectedNet = ecm.pack.usableEnergyAtOcvKWh - ecm.packLossKWh;
check("Net pack energy = OCV energy in window − I²R losses", near(ecm.netEnergyKWh, expectedNet, 0.05),
  `${ecm.netEnergyKWh.toFixed(3)} vs ${expectedNet.toFixed(3)} kWh`);
check("Terminal voltage never below pack minimum", ecm.minTerminalVoltageV >= ecm.pack.vMin - 1e-6, `${ecm.minTerminalVoltageV.toFixed(1)} V`);
check("Terminal voltage never above pack maximum", ecm.maxTerminalVoltageV <= ecm.pack.vMax + 1e-6, `${ecm.maxTerminalVoltageV.toFixed(1)} V`);

// 7. Resistance costs range
const noR = Sim.simulateDriveCycle({ ...base, advancedCellEnabled: true, cellOcvTable: OCV, cellDcirMilliOhm: 0 });
check("Internal resistance reduces range", ecm.distanceMiles < noR.distanceMiles,
  `${ecm.distanceMiles.toFixed(1)} vs ${noR.distanceMiles.toFixed(1)} miles`);

// 8. Regen improves WLTP range and never exceeds the pack charge limit
check("Regen increases WLTP range", r1 > unconstrained.distanceMiles);
const packChargeLimit = 5 * 24 * 0.8;
check("Peak regen current within pack charge limit", Sim.simulateDriveCycle(base).peakChargeCurrentA <= packChargeLimit + 1e-6);

// 9. Controller limit caps discharge current
const motor = { motorLimitsEnabled: true, controllerMaxCurrentA: 60 };
const limited = Sim.simulateDriveCycle({ ...base, ...motor });
check("Controller current limit respected", limited.peakDischargeCurrentA <= 60 + 1e-6, `${limited.peakDischargeCurrentA.toFixed(1)} A`);
check("Limited vehicle reports missed trace", limited.secondsTraceMissed > 0, `${limited.secondsTraceMissed} s`);

// 10. Full-power test: physics sanity and SOC dependence
const wot = { motorLimitsEnabled: true, motorPeakPowerKW: 150, motorPeakTorqueNm: 310, gearRatio: 9.7, tyreRadiusMm: 330,
  advancedCellEnabled: true, cellOcvTable: OCV, cellDcirMilliOhm: 30 };
const top = Sim.fullPowerTest({ ...base, ...wot }, 94);
const bottom = Sim.fullPowerTest({ ...base, ...wot }, 6);
const torqueLimitedAccel = (310 * 9.7 / 0.33) / 1300; // m/s², upper bound from torque
const lowerBound = 60 * 0.44704 / torqueLimitedAccel;
check("0-60 not faster than torque-limited bound", top.zeroToSixtySeconds >= lowerBound, `${top.zeroToSixtySeconds.toFixed(2)} s >= ${lowerBound.toFixed(2)} s`);
check("0-60 slower at low SOC (voltage sag)", bottom.zeroToSixtySeconds > top.zeroToSixtySeconds,
  `${top.zeroToSixtySeconds.toFixed(2)} s vs ${bottom.zeroToSixtySeconds.toFixed(2)} s`);

// 11. OCV table parsing
const parsedPct = Sim.parseOcvTable("SOC,V\n0,3.0\n50,3.7\n100,4.2");
const parsedFrac = Sim.parseOcvTable("0;3.0\n0.5;3.7\n1;4.2");
const parsedSwap = Sim.parseOcvTable("3.0 0\n3.7 50\n4.2 100");
check("OCV parse: % with header", parsedPct.points.length === 3 && parsedPct.errors.length === 0);
check("OCV parse: fractional SOC", parsedFrac.points[1].soc === 50);
check("OCV parse: swapped columns", parsedSwap.points[2].soc === 100 && parsedSwap.points[2].v === 4.2);
check("OCV parse: rejects falling voltage", Sim.parseOcvTable("0,4.2\n100,3.0").errors.length > 0);

// 12. Tyre size parsing
const tyre = Sim.parseTyreSize("205/55 R16 91V");
check("Tyre 205/55 R16 unloaded radius 315.95 mm", tyre && near(tyre.unloadedRadiusMm, 315.95, 0.01), tyre && tyre.unloadedRadiusMm.toFixed(2));
check("Tyre rolling radius = 98 % of unloaded", tyre && near(tyre.rollingRadiusMm, 315.95 * 0.98, 0.01));
check("Tyre flotation 31x10.50R15 = 393.7 mm unloaded", near(Sim.parseTyreSize("31x10.50R15").unloadedRadiusMm, 393.7, 0.01));
check("Tyre size rejects incomplete input", Sim.parseTyreSize("205/55") === null && Sim.parseTyreSize("abc") === null);

// 13. Peak (pulse) duration limits
const wotNoLimit = Sim.fullPowerTest({ ...base, ...wot }, 94);
const wotCell3 = Sim.fullPowerTest({ ...base, ...wot, cellPulseDurationSeconds: 3 }, 94);
const wotCell10 = Sim.fullPowerTest({ ...base, ...wot, cellPulseDurationSeconds: 10 }, 94);
const wotMotor3 = Sim.fullPowerTest({ ...base, ...wot, motorContinuousPowerKW: 70, motorPeakDurationSeconds: 3 }, 94);
check("3 s cell pulse rating slows 0-60", wotCell3.zeroToSixtySeconds > wotNoLimit.zeroToSixtySeconds + 0.5,
  `${wotNoLimit.zeroToSixtySeconds.toFixed(2)} s -> ${wotCell3.zeroToSixtySeconds.toFixed(2)} s`);
check("Pulse rating longer than the run has no effect", near(wotCell10.zeroToSixtySeconds, wotNoLimit.zeroToSixtySeconds, 0.02));
check("Cell pulse end is reported at 3 s", wotCell3.peakEvents.length === 1 && wotCell3.peakEvents[0].seconds === 3);
check("Current after pulse within continuous rating", wotCell3.limitingFactor === "cellContinuous");
check("3 s motor peak slows 0-60", wotMotor3.zeroToSixtySeconds > wotNoLimit.zeroToSixtySeconds + 0.5,
  `${wotMotor3.zeroToSixtySeconds.toFixed(2)} s`);
const cycleWithPulse = Sim.simulateDriveCycle({ ...base, motorLimitsEnabled: true, cellPulseDurationSeconds: 2, maxDischargeCurrentA: 18, continuousDischargeCurrentA: 2 });
check("Drive cycle respects continuous current after pulse time", cycleWithPulse.limitSeconds.cellContinuous > 0,
  `${cycleWithPulse.limitSeconds.cellContinuous} s on continuous limit`);

// 14. BMS current limits
const bms = { bmsLimitsEnabled: true, bmsPeakDischargeCurrentA: 350, bmsPeakDurationSeconds: 10, bmsContinuousDischargeCurrentA: 150, bmsMaxChargeCurrentA: 60 };
const bmsPack = Sim.buildPackModel({ ...base, ...bms });
check("BMS caps pack peak, continuous and charge limits", bmsPack.dischargeLimitA === 350 && bmsPack.continuousLimitA === 150 && bmsPack.chargeLimitA === 60);
const bmsHigh = Sim.buildPackModel({ ...base, bmsLimitsEnabled: true, bmsPeakDischargeCurrentA: 1000, bmsContinuousDischargeCurrentA: 1000 });
check("BMS above cell capability has no effect", bmsHigh.dischargeLimitA === 432 && bmsHigh.continuousLimitA === 192);
const wotBms = Sim.fullPowerTest({ ...base, ...wot, ...bms }, 94);
check("Full-power test peak current within BMS peak", wotBms.peakCurrentA <= 350 + 1e-6, `${wotBms.peakCurrentA.toFixed(1)} A`);
const wotBms3 = Sim.fullPowerTest({ ...base, ...wot, ...bms, bmsPeakDurationSeconds: 3 }, 94);
check("BMS peak duration slows 0-60", wotBms3.zeroToSixtySeconds > wotBms.zeroToSixtySeconds + 0.5
  && wotBms3.peakEvents.some(e => e.what.startsWith("BMS")), `${wotBms.zeroToSixtySeconds.toFixed(2)} -> ${wotBms3.zeroToSixtySeconds.toFixed(2)} s`);
const cycleBms = Sim.simulateDriveCycle({ ...base, ...bms });
check("Drive cycle regen within BMS charge limit", cycleBms.peakChargeCurrentA <= 60 + 1e-6, `${cycleBms.peakChargeCurrentA.toFixed(1)} A`);

// 15. Motor max rpm sets the vehicle speed limit
const rpmVehicle = Sim.buildVehicleModel({ ...base, motorLimitsEnabled: true, motorMaxRpm: 12000, gearRatio: 9.7, tyreRadiusMm: 310 });
const expectedMps = 12000 * 2 * Math.PI * 0.31 / (60 * 9.7);
check("Speed at motor max rpm = rpm x 2pi x r / (60 x G)", near(rpmVehicle.topSpeedMps, expectedMps, 1e-9), `${(expectedMps / 0.44704).toFixed(1)} mph`);
const rpmLow = { ...base, motorLimitsEnabled: true, motorMaxRpm: 8000, gearRatio: 9.7, tyreRadiusMm: 310 };
const sustainedRpm = Sim.maxSustainedSpeedMph(rpmLow, 94);
check("Sustained speed capped by motor rpm", sustainedRpm.limit === "motorRpm" && near(sustainedRpm.mph, 8000 * 2 * Math.PI * 0.31 / (60 * 9.7) / 0.44704, 0.01), `${sustainedRpm.mph.toFixed(1)} mph`);
const wltpRpm = Sim.simulateDriveCycle(rpmLow);
check("Low rpm limit causes WLTP trace misses", wltpRpm.secondsTraceMissed > 0, `${wltpRpm.secondsTraceMissed} s`);

// 16. Top speed from the full-throttle run
const topBase = { ...base, motorLimitsEnabled: true, motorPeakPowerKW: 150, motorContinuousPowerKW: 70, motorPeakTorqueNm: 310, gearRatio: 4, tyreRadiusMm: 310, motorMaxRpm: 18000 };
const topRun = Sim.fullPowerTest(topBase, 94);
const topVehicle = Sim.buildVehicleModel(topBase);
check("Top speed well below gearing limit when power-limited", topRun.topSpeedMph < topVehicle.rpmLimitedSpeedMps / 0.44704 - 50,
  `${topRun.topSpeedMph.toFixed(1)} mph vs gearing ${(topVehicle.rpmLimitedSpeedMps / 0.44704).toFixed(0)} mph`);
// At top speed, road-load power should equal the available wheel power (149.3 kW battery peak - 1 kW aux) x 0.9
const vTop = topRun.topSpeedMph * 0.44704;
const roadW = Sim.roadLoadForceN(topVehicle, vTop) * vTop;
check("Power balance at top speed", near(roadW, (432 * 345.6 - 1000) * 0.9, 1500), `${(roadW / 1000).toFixed(1)} kW road load`);
const topRpm = Sim.fullPowerTest({ ...topBase, motorMaxRpm: 7000 }, 94);
check("Top speed capped by motor rpm when lower", topRpm.topSpeedLimit === "motorRpm", `${topRpm.topSpeedMph.toFixed(1)} mph`);
const topPeak = Sim.fullPowerTest({ ...topBase, motorPeakDurationSeconds: 30 }, 94);
check("Speed falls back after peak power ends", topPeak.topSpeedHeldMph < topPeak.topSpeedMph - 5,
  `${topPeak.topSpeedMph.toFixed(1)} -> ${topPeak.topSpeedHeldMph.toFixed(1)} mph`);

// 17. WLTP Class 2 and 3a traces (UN GTR 15 via EC JRC wltp package; DieselNet tables)
const distKmOf = (t) => { let d = 0; for (let i = 0; i < t.length - 1; i++) d += (t[i] + t[i + 1]) / 2 / 3600; return d; };
const sumOf = (t) => t.reduce((a, b) => a + b, 0);
check("WLTC 3a checksum 83496.9, 23.194 km", near(sumOf(Sim.WLTC_CLASS3A_KMH), 83496.9, 0.05) && near(distKmOf(Sim.WLTC_CLASS3A_KMH), 23.194, 0.002));
check("WLTC 2 checksum 81536.9, 22.649 km, vmax 123.1", near(sumOf(Sim.WLTC_CLASS2_KMH), 81536.9, 0.05) && near(distKmOf(Sim.WLTC_CLASS2_KMH), 22.649, 0.002) && Math.max(...Sim.WLTC_CLASS2_KMH) === 123.1);
const r3a = Sim.simulateDriveCycle({ ...base, driveCycle: "wltp3a" });
const rClass2 = Sim.simulateDriveCycle({ ...base, driveCycle: "wltp2" });
check("Class 3a and 2 simulate to empty", r3a.ok && r3a.reachedEmpty && rClass2.ok && rClass2.reachedEmpty, `${r3a.distanceMiles.toFixed(1)} / ${rClass2.distanceMiles.toFixed(1)} mi`);

// 18. Constant speed and the old motorway70 name
const c70 = Sim.simulateDriveCycle({ ...base, driveCycle: "constant", constantSpeedMph: 70 });
const legacy = Sim.simulateDriveCycle({ ...base, driveCycle: "motorway70" });
check("Constant 70 mph equals legacy motorway70", near(c70.distanceMiles, legacy.distanceMiles, 1e-9) && near(c70.distanceMiles, motorway.distanceMiles, 1e-9));
const table = Sim.constantSpeedTable(base, [30, 50, 70]);
check("Constant-speed table: range falls as speed rises", table.length === 3 && table[0].rangeMiles > table[1].rangeMiles && table[1].rangeMiles > table[2].rangeMiles,
  table.map(t => `${t.mph} mph ${t.rangeMiles.toFixed(0)} mi`).join(", "));

// 19. Uploaded speed profiles
const prof = Sim.parseSpeedProfile("time,speed\n0,0\n10,36\n70,36\n80,0", "kmh");
check("Profile resampled to 1 Hz (81 points)", prof.speedsMps.length === 81 && prof.errors.length === 0);
check("Profile distance = 0.5×10×10 + 60×10 + 0.5×10×10 m = 0.7 km", near(prof.distanceKm, 0.7, 1e-9), prof.distanceKm.toFixed(4) + " km");
const single = Sim.parseSpeedProfile("0\n10\n20\n20\n20\n20\n20\n20\n20\n20\n10\n0", "mph");
check("Single-column profile treated as 1 Hz mph", single.speedsMps.length === 12 && near(single.speedsMps[2], 20 * 0.44704, 1e-9));
const custom = Sim.simulateDriveCycle({ ...base, driveCycle: "custom", customProfileText: "0,0\n10,36\n70,36\n80,0", customProfileUnit: "kmh" });
check("Uploaded profile simulates to empty", custom.ok && custom.reachedEmpty, `${custom.distanceMiles.toFixed(1)} mi`);
const noProfile = Sim.simulateDriveCycle({ ...base, driveCycle: "custom", customProfileText: "" });
check("Missing profile gives a clear message", !noProfile.ok && /speed profile/i.test(noProfile.reason));

// 20. Charging step model (v17)
check("Engine version 19", Sim.ENGINE_VERSION === 19);
const cp0 = Sim.buildPackModel({ ...base, advancedCellEnabled: false });            // nominal voltage, no resistance
const usableAh = cp0.capacityAh * (cp0.socTop - cp0.socBottom) / 100;
const usableKWh = usableAh * cp0.ocv(50) / 1000;
const flat = Sim.chargeSession(cp0, { chargerKW: 11, currentLimitA: 1000, fromPct: 0, toPct: 100 });
check("No resistance, no taper: time = usable energy ÷ charger power", near(flat.minutes, usableKWh / 11 * 60, 0.01), `${flat.minutes.toFixed(2)} min`);
check("No resistance: no heat, stored = socket", near(flat.heatKWh, 0, 1e-9) && near(flat.storedKWh, flat.socketKWh, 1e-6));
const eff = Sim.chargeSession(cp0, { chargerKW: 11, efficiencyPct: 90, currentLimitA: 1000, fromPct: 0, toPct: 100 });
check("90 % charger efficiency: time ÷ 0.9, socket energy ÷ 0.9", near(eff.minutes, flat.minutes / 0.9, 0.01) && near(eff.socketKWh, usableKWh / 0.9, 0.01));
const dc80 = Sim.chargeSession(cp0, { chargerKW: 50, currentLimitA: 1000, fromPct: 10, toPct: 80 });
check("DC 10–80 % = 0.7 × usable ÷ power", near(dc80.minutes, 0.7 * usableKWh / 50 * 60, 0.01));
check("Taper factor: 1 below start, end share at 100 %, halfway between", Sim.chargeTaperFactor(70, { startPct: 80, endPct: 10 }) === 1
  && near(Sim.chargeTaperFactor(100, { startPct: 80, endPct: 10 }), 0.1, 1e-12) && near(Sim.chargeTaperFactor(90, { startPct: 80, endPct: 10 }), 0.55, 1e-12));
const tap = { startPct: 80, endPct: 10 };
const lowLimit = 50 * 1000 / cp0.ocv(50);                                            // pack limit = charger power
const t80a = Sim.chargeSession(cp0, { chargerKW: 50, currentLimitA: lowLimit, fromPct: 10, toPct: 80 });
const t80b = Sim.chargeSession(cp0, { chargerKW: 50, currentLimitA: lowLimit, taper: tap, fromPct: 10, toPct: 80 });
const t100a = Sim.chargeSession(cp0, { chargerKW: 50, currentLimitA: lowLimit, fromPct: 10, toPct: 100 });
const t100b = Sim.chargeSession(cp0, { chargerKW: 50, currentLimitA: lowLimit, taper: tap, fromPct: 10, toPct: 100 });
check("Taper from 80 % leaves 10–80 % unchanged", near(t80a.minutes, t80b.minutes, 1e-9));
// Analytic: 80–100 % at I = I0 × (1 − 0.9x) takes (20 % of charge ÷ I0) × ln(10)/0.9.
const segMin = usableAh * 0.2 / lowLimit * 60;
check("Taper 80–100 % time matches ln(10)/0.9 × untapered", near(t100b.minutes - t80b.minutes, segMin * Math.log(10) / 0.9, segMin * 0.01),
  `${(t100b.minutes - t80b.minutes).toFixed(2)} vs ${(segMin * Math.log(10) / 0.9).toFixed(2)} min`);
check("Taper makes 10–100 % longer", t100b.minutes > t100a.minutes);
const cpR = Sim.buildPackModel({ ...base, advancedCellEnabled: true, cellDcirMilliOhm: 20, cellOcvTable: OCV });
const withR = Sim.chargeSession(cpR, { chargerKW: 50, currentLimitA: 1000, fromPct: 10, toPct: 80, steps: 400 });
check("With resistance: socket = stored + heat", near(withR.socketKWh, withR.storedKWh + withR.heatKWh, 1e-3), `${withR.heatKWh.toFixed(3)} kWh heat`);
const pt = Sim.chargePointAt(cpR, { chargerKW: 50, currentLimitA: 1000 }, 50);
check("Charge point: P = (OCV + I·R) × I", near((pt.ocv + pt.amps * pt.R) * pt.amps, pt.watts, 1e-6));
const extra = Sim.chargeSession(cpR, { chargerKW: 50, currentLimitA: 1000, fromPct: 10, toPct: 80, extraResistanceOhm: 0.05 });
check("Extra pack resistance adds heat", extra.heatKWh > withR.heatKWh);
const curve = Sim.chargeCurve(cp0, { chargerKW: 50, currentLimitA: lowLimit, taper: tap }, 101);
check("Charge curve: 101 points, flat then falling", curve.length === 101 && near(curve[50].kW, 50, 0.01) && curve[100].kW < 6);

// 21. Pack voltage window (v18)
const pw = Sim.buildPackModel({ ...base, packMaxVoltageV: 390, packMinVoltageV: 300 });
check("Pack voltage window overrides cells × series", pw.vMax === 390 && pw.vMin === 300);
check("Without it, cells × series", Sim.buildPackModel(base).vMax === base.maxVoltage * base.seriesCount);

// 22. Drive ends at the minimum voltage (v19): no stall with the auxiliary load draining the pack
const normal = Sim.simulateDriveCycle({ ...base, assumedLoadKW: 0.5 });
check("Normal run ends at the bottom of the window", normal.endReason === "empty");
const hiMin = Sim.buildPackModel(base).ocv(Sim.buildPackModel(base).socBottom) + 0.03 * base.seriesCount;
const cut = Sim.simulateDriveCycle({ ...base, assumedLoadKW: 0.5, packMinVoltageV: hiMin });
const tr = cut.trace; let stalled = 0; for (let i = 0; i < tr.seconds.length; i++) if (tr.targetMps[i] > 1 && tr.speedMps[i] < 0.5) stalled++;
check("Minimum voltage above the empty OCV: ends at minVoltage", cut.endReason === "minVoltage" && cut.endSoc > Sim.buildPackModel(base).socBottom, cut.endReason);
check("…without a long stall at 0 mph", stalled <= 10, `${stalled} s stalled`);
check("…and shorter than the normal run", cut.runtimeMinutes < normal.runtimeMinutes);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
