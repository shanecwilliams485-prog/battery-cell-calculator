const DEFAULT_INPUTS = {
  nominalVoltage: 3.6,
  maxVoltage: 4.2,
  minVoltage: 3.0,
  capacityAh: 5.0,
  maxDischargeCurrentA: 18.0,
  continuousDischargeCurrentA: 8.0,
  maxChargeCurrentA: 5.0,
  cellWeightG: 70.0,
  seriesCount: 96,
  parallelCount: 24,
  moduleCount1: 0,
  moduleConfiguration: "",
  useSecondModuleConfiguration: false,
  moduleCount2: 0,
  secondModuleConfiguration: "",
  usableEnergyFactor: 0.88,
  variableCurrentSimulationEnabled: false,
  driveCycle: 'mixed',
  vehicleMassKg: 1300,
  dragCoefficient: 0.34,
  frontalAreaM2: 2.1,
  rollingResistanceCoefficient: 0.013,
  drivetrainEfficiencyPercent: 90,
  assumedLoadKW: 1.0,
  simulationTimeStepMinutes: 10,
};

const STORAGE_KEY = 'batteryCellCalculator.inputs.v1';
const inputEls = {};
let lastResults = null;
let animationFrame = null;
let chartPointCount = 1;
let driveCycleRunId = 0;
const CHART_ANIMATION_DELAY_MS = 135; // Increase this value to make the variable discharge graph draw more slowly.

const fields = [
  ['nominalVoltage', 'number'],
  ['maxVoltage', 'number'],
  ['minVoltage', 'number'],
  ['capacityAh', 'number'],

  ['maxDischargeCurrentA', 'number'],
  ['continuousDischargeCurrentA', 'number'],
  ['maxChargeCurrentA', 'number'],
  ['cellWeightG', 'number'],

  ['seriesCount', 'int'],
  ['parallelCount', 'int'],
  ['moduleCount1', 'int'],
  ['moduleConfiguration', 'text'],
  ['useSecondModuleConfiguration', 'checkbox'],
  ['moduleCount2', 'int'],
  ['secondModuleConfiguration', 'text'],

  ['usableEnergyFactor', 'number'],

  ['variableCurrentSimulationEnabled', 'checkbox'],
  ['driveCycle', 'text'],
  ['vehicleMassKg', 'number'],
  ['dragCoefficient', 'number'],
  ['frontalAreaM2', 'number'],
  ['rollingResistanceCoefficient', 'number'],
  ['drivetrainEfficiencyPercent', 'number'],
  ['assumedLoadKW', 'number'],
  ['simulationTimeStepMinutes', 'number']
];

function fmt(value, decimals = 1) {
  if (!Number.isFinite(value)) value = 0;
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function loadInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...DEFAULT_INPUTS, ...(saved || {}) };
  } catch { return { ...DEFAULT_INPUTS }; }
}
function saveInputs(inputs) { localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs)); }
function getInputs() {
  const data = {};

  for (const [name, type] of fields) {
    const el = inputEls[name] || document.getElementById(name);

    if (!el) {
      data[name] = DEFAULT_INPUTS[name];
      continue;
    }

    if (type === 'checkbox') data[name] = el.checked;
    else if (type === 'int') data[name] = Math.max(0, Math.round(clampNumber(el.value, DEFAULT_INPUTS[name])));
    else if (type === 'text') data[name] = el.value;
    else data[name] = clampNumber(el.value, DEFAULT_INPUTS[name]);
  }

  return data;
}
function setInputs(inputs) {
  for (const [name, type] of fields) {
    const el = document.getElementById(name);
    inputEls[name] = el;
    if (!el) continue;
    if (type === 'checkbox') el.checked = !!inputs[name];
    else if (type === 'text') el.value = inputs[name] || "";
    else el.value = inputs[name];
  }
  toggleSimulationOptions();
}

function parseModuleConfigurationValue(value) {
  const match = String(value || "").match(/^(\d+)S(\d+)P$/);
  if (!match) return null;

  return {
    series: Number(match[1]),
    parallel: Number(match[2])
  };
}

function makeModuleValue(series, parallel) {
  return `${series}S${parallel}P`;
}

function makeModuleLabel(series, parallel) {
  return `${series}S${parallel}P`;
}

function setSelectOptions(select, options, preferredValue = "") {
  if (!select) return "";

  select.innerHTML = options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  if (options.some(option => String(option.value) === String(preferredValue))) {
    select.value = preferredValue;
  } else {
    select.value = options[0]?.value || "";
  }

  return select.value;
}

function getSeriesAndParallel() {
  const series = Math.max(1, Math.round(clampNumber(document.getElementById("seriesCount")?.value, DEFAULT_INPUTS.seriesCount)));
  const parallel = Math.max(1, Math.round(clampNumber(document.getElementById("parallelCount")?.value, DEFAULT_INPUTS.parallelCount)));

  return { series, parallel };
}

function buildSingleModuleConfigurationOptions(series, parallel) {
  const options = [];

  for (let moduleSeries = 1; moduleSeries <= series; moduleSeries++) {
    if (series % moduleSeries === 0) {
      options.push({
        value: makeModuleValue(moduleSeries, parallel),
        label: makeModuleLabel(moduleSeries, parallel)
      });
    }
  }

  return options;
}

function buildMixedModuleConfigurationOptions(series, parallel, excludeSeries = null) {
  const options = [];

  for (let moduleSeries = 1; moduleSeries < series; moduleSeries++) {
    if (moduleSeries === excludeSeries) continue;

    options.push({
      value: makeModuleValue(moduleSeries, parallel),
      label: makeModuleLabel(moduleSeries, parallel)
    });
  }

  return options;
}

function buildValidModuleCountPairs(totalSeries, moduleSeries1, moduleSeries2) {
  const pairs = [];

  for (let count1 = 1; count1 <= totalSeries; count1++) {
    const usedByConfig1 = count1 * moduleSeries1;
    const remainingSeries = totalSeries - usedByConfig1;

    if (remainingSeries <= 0) break;

    if (remainingSeries % moduleSeries2 === 0) {
      const count2 = remainingSeries / moduleSeries2;

      if (count2 > 0) {
        pairs.push({ count1, count2 });
      }
    }
  }

  return pairs;
}

function countOption(count) {
  return {
    value: String(count),
    label: `${count} module${count === 1 ? "" : "s"}`
  };
}

function uniqueCountOptions(values) {
  return [...new Set(values)]
    .sort((a, b) => a - b)
    .map(countOption);
}

function updateModuleConfigurationOptions() {
  const moduleConfig1Select = document.getElementById("moduleConfiguration");
  const moduleCount1Select = document.getElementById("moduleCount1");
  const secondEnabled = document.getElementById("useSecondModuleConfiguration")?.checked || false;

  if (!moduleConfig1Select || !moduleCount1Select) return;

  const { series, parallel } = getSeriesAndParallel();

  const currentConfig1 = moduleConfig1Select.value;
  const currentCount1 = moduleCount1Select.value;

  const config1Options = secondEnabled
    ? buildMixedModuleConfigurationOptions(series, parallel)
    : buildSingleModuleConfigurationOptions(series, parallel);

  const selectedConfig1 = setSelectOptions(moduleConfig1Select, config1Options, currentConfig1);
  const config1 = parseModuleConfigurationValue(selectedConfig1);

  if (!secondEnabled && config1) {
    const automaticCount1 = series / config1.series;

    setSelectOptions(moduleCount1Select, [countOption(automaticCount1)], String(automaticCount1));
  }

  if (secondEnabled) {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
  }

  updateSecondModuleConfigurationOptions();
  saveInputs(getInputs());
}

function updateModuleCount1FromConfiguration() {
  const moduleConfig1Select = document.getElementById("moduleConfiguration");
  const moduleCount1Select = document.getElementById("moduleCount1");
  const secondEnabled = document.getElementById("useSecondModuleConfiguration")?.checked || false;

  if (!moduleConfig1Select || !moduleCount1Select) return;

  const { series } = getSeriesAndParallel();
  const config1 = parseModuleConfigurationValue(moduleConfig1Select.value);

  if (!config1) return;

  if (!secondEnabled) {
    const automaticCount1 = series / config1.series;

    if (Number.isInteger(automaticCount1)) {
      setSelectOptions(moduleCount1Select, [countOption(automaticCount1)], String(automaticCount1));
    }
  } else {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
    updateSecondModuleConfigurationOptions();
  }

  saveInputs(getInputs());
}

function updateSecondModuleConfigurationOptions(changedCount = "") {
  const checkbox = document.getElementById("useSecondModuleConfiguration");
  const wrap = document.getElementById("secondModuleConfigurationWrap");
  const moduleConfig1Select = document.getElementById("moduleConfiguration");
  const moduleCount1Select = document.getElementById("moduleCount1");
  const moduleConfig2Select = document.getElementById("secondModuleConfiguration");
  const moduleCount2Select = document.getElementById("moduleCount2");

  if (!checkbox || !wrap || !moduleConfig1Select || !moduleCount1Select || !moduleConfig2Select || !moduleCount2Select) return;

  const enabled = checkbox.checked;
  wrap.hidden = !enabled;

  if (!enabled) {
    moduleCount2Select.value = "";
    moduleConfig2Select.value = "";
    return;
  }

  const { series, parallel } = getSeriesAndParallel();

  const config1 = parseModuleConfigurationValue(moduleConfig1Select.value);

  if (!config1) {
    setSelectOptions(moduleConfig2Select, [{ value: "", label: "Select config 1 first" }], "");
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
    setSelectOptions(moduleCount2Select, [{ value: "", label: "Select config 2 first" }], "");
    return;
  }

  const currentConfig2 = moduleConfig2Select.value;
  const config2Options = buildMixedModuleConfigurationOptions(series, parallel, config1.series);
  const selectedConfig2 = setSelectOptions(moduleConfig2Select, config2Options, currentConfig2);
  const config2 = parseModuleConfigurationValue(selectedConfig2);

  if (!config2) {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
    setSelectOptions(moduleCount2Select, [{ value: "", label: "Select config 2 first" }], "");
    return;
  }

  const pairs = buildValidModuleCountPairs(series, config1.series, config2.series);

  if (!pairs.length) {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "No valid count" }], "");
    setSelectOptions(moduleCount2Select, [{ value: "", label: "No valid count" }], "");
    return;
  }

  const currentCount1 = moduleCount1Select.value;
  const currentCount2 = moduleCount2Select.value;

  const validCount1Options = uniqueCountOptions(pairs.map(pair => pair.count1));
  const validCount2Options = uniqueCountOptions(pairs.map(pair => pair.count2));

  if (changedCount === "moduleCount1" && currentCount1) {
    const matchingPairs = pairs.filter(pair => String(pair.count1) === String(currentCount1));

    setSelectOptions(moduleCount1Select, validCount1Options, currentCount1);
    setSelectOptions(moduleCount2Select, uniqueCountOptions(matchingPairs.map(pair => pair.count2)), "");
    return;
  }

  if (changedCount === "moduleCount2" && currentCount2) {
    const matchingPairs = pairs.filter(pair => String(pair.count2) === String(currentCount2));

    setSelectOptions(moduleCount2Select, validCount2Options, currentCount2);
    setSelectOptions(moduleCount1Select, uniqueCountOptions(matchingPairs.map(pair => pair.count1)), "");
    return;
  }

  setSelectOptions(moduleCount1Select, validCount1Options, currentCount1);
  setSelectOptions(moduleCount2Select, validCount2Options, currentCount2);
}

function calculate(input) {
  const series = Math.max(input.seriesCount, 0);
  const parallel = Math.max(input.parallelCount, 0);

  const packEnergyKWh = (input.nominalVoltage * series * input.capacityAh * parallel) / 1000.0;
  const packCapacityAh = input.capacityAh * parallel;
  const nominalVoltageV = input.nominalVoltage * series;
  const maxVoltageV = input.maxVoltage * series;
  const minVoltageV = input.minVoltage * series;
  const numberOfCells = Math.max(input.seriesCount, 0) * Math.max(input.parallelCount, 0);

  const module1Match = String(input.moduleConfiguration || "").match(/^(\d+)S(\d+)P$/);
  const module1Series = module1Match ? Number(module1Match[1]) : series;
  const module1Parallel = module1Match ? Number(module1Match[2]) : parallel;
  const module1Config = `${module1Series}S${module1Parallel}P`;

  let moduleCount1 = Math.max(0, Math.round(input.moduleCount1 || 0));

  if (!input.useSecondModuleConfiguration && module1Series > 0) {
    moduleCount1 = series / module1Series;
  }

  const moduleNominalVoltageV = input.nominalVoltage * module1Series;
  const moduleCapacityAh = input.capacityAh * module1Parallel;
  const moduleEnergyKWh = moduleNominalVoltageV * moduleCapacityAh / 1000;
  const moduleCellCount = module1Series * module1Parallel;

  const module2Match = String(input.secondModuleConfiguration || "").match(/^(\d+)S(\d+)P$/);
  const hasSecondModule = !!input.useSecondModuleConfiguration && !!module2Match;

  const module2Series = hasSecondModule ? Number(module2Match[1]) : 0;
  const module2Parallel = hasSecondModule ? Number(module2Match[2]) : 0;
  const module2Config = hasSecondModule ? `${module2Series}S${module2Parallel}P` : "";
  const moduleCount2 = hasSecondModule ? Math.max(0, Math.round(input.moduleCount2 || 0)) : 0;

  const module2NominalVoltageV = input.nominalVoltage * module2Series;
  const module2CapacityAh = input.capacityAh * module2Parallel;
  const module2EnergyKWh = module2NominalVoltageV * module2CapacityAh / 1000;
  const module2CellCount = module2Series * module2Parallel;

  const totalModuleSeries =
    moduleCount1 * module1Series +
    moduleCount2 * module2Series;

  const totalCellWeightKG = (input.cellWeightG * series * parallel) / 1000.0;
  const maxDischargeCurrentA = input.maxDischargeCurrentA * parallel;
  const continuousDischargeCurrentA = input.continuousDischargeCurrentA * parallel;
  const maxChargeCurrentA = input.maxChargeCurrentA * parallel;

  const maxDischargePowerKW = (input.nominalVoltage * series * input.maxDischargeCurrentA * parallel) / 1000.0;
  const continuousDischargePowerKW = (input.nominalVoltage * series * input.continuousDischargeCurrentA * parallel) / 1000.0;
  const maxChargePowerKW = (input.nominalVoltage * series * input.maxChargeCurrentA * parallel) / 1000.0;

  const maxDischargeCRating = input.capacityAh === 0 ? 0 : input.maxDischargeCurrentA / input.capacityAh;
  const maxChargeCRating = input.capacityAh === 0 ? 0 : input.maxChargeCurrentA / input.capacityAh;

  const usableEnergyKWh = packEnergyKWh * input.usableEnergyFactor;
  const usableBatteryWhSpreadsheet = input.nominalVoltage * series * input.capacityAh * parallel * input.usableEnergyFactor;
  const runtimeAtContinuousDischargeMinutes = maxVoltageV <= 0 ? 0 : usableBatteryWhSpreadsheet / maxVoltageV;
  const runtimeAtAssumedLoadMinutes = input.assumedLoadKW > 0 ? usableEnergyKWh / input.assumedLoadKW * 60.0 : null;

  const variableSimulation = input.variableCurrentSimulationEnabled
? simulateVariableCurrentRuntime(usableEnergyKWh, nominalVoltageV, input, maxDischargeCurrentA)
    : null;

  const sohRows = [100, 95, 90, 85, 80].map(percentage => ({
    percentage,
    usableEnergyKWh: usableEnergyKWh * percentage / 100.0
  }));

  return {
    packEnergyKWh,
    packCapacityAh,
    maxDischargeCurrentA,
    maxDischargePowerKW,
    continuousDischargeCurrentA,
    continuousDischargePowerKW,
    maxChargeCurrentA,
    maxChargePowerKW,
    maxVoltageV,
    minVoltageV,
    nominalVoltageV,
    numberOfCells,
    totalCellWeightKG,
    maxDischargeCRating,
    maxChargeCRating,
    usableEnergyKWh,
    runtimeAtContinuousDischargeMinutes,
    runtimeAtAssumedLoadMinutes,

    moduleConfig: module1Config,
    moduleCount1,
    moduleNominalVoltageV,
    moduleCapacityAh,
    moduleEnergyKWh,
    moduleCellCount,

    hasSecondModule,
    module2Config,
    moduleCount2,
    module2NominalVoltageV,
    module2CapacityAh,
    module2EnergyKWh,
    module2CellCount,
    totalModuleSeries,

    variableSimulationEnabled: input.variableCurrentSimulationEnabled,
    variableAverageCurrentA: variableSimulation?.averageCurrentA ?? null,
    variableAveragePowerKW: variableSimulation?.averagePowerKW ?? null,
    variableRuntimeMinutes: variableSimulation?.runtimeMinutes ?? null,
    variableZeroSOCMinute: variableSimulation?.zeroSOCMinute ?? null,
    variableProfileSampleNumber: variableSimulation?.profileSampleNumber ?? null,
    variableSimulationRows: variableSimulation?.rows ?? [],
    sohRows
  };
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mphToMps(mph) {
  return mph * 0.44704;
}

function getVehicleDriveCycle(cycleName) {
  const cycles = {
    city: [
      { seconds: 0, mph: 0, mode: "Stopped" },
      { seconds: 10, mph: 15, mode: "City acceleration" },
      { seconds: 35, mph: 30, mode: "City cruise" },
      { seconds: 55, mph: 10, mode: "Slowing traffic" },
      { seconds: 70, mph: 0, mode: "Stopped" },
      { seconds: 85, mph: 25, mode: "City acceleration" },
      { seconds: 120, mph: 35, mode: "City cruise" },
      { seconds: 145, mph: 0, mode: "Braking" }
    ],

    mixed: [
      { seconds: 0, mph: 0, mode: "Stopped" },
      { seconds: 15, mph: 25, mode: "Pull away" },
      { seconds: 45, mph: 45, mode: "A-road cruise" },
      { seconds: 80, mph: 60, mode: "Faster road" },
      { seconds: 115, mph: 40, mode: "Traffic slowing" },
      { seconds: 150, mph: 65, mode: "Acceleration" },
      { seconds: 190, mph: 50, mode: "Cruise" },
      { seconds: 220, mph: 0, mode: "Braking" }
    ],

    motorway: [
      { seconds: 0, mph: 0, mode: "Stopped" },
      { seconds: 20, mph: 30, mode: "Slip road" },
      { seconds: 45, mph: 55, mode: "Acceleration" },
      { seconds: 75, mph: 70, mode: "Motorway cruise" },
      { seconds: 150, mph: 70, mode: "Motorway cruise" },
      { seconds: 190, mph: 60, mode: "Traffic easing" },
      { seconds: 230, mph: 70, mode: "Motorway cruise" },
      { seconds: 260, mph: 0, mode: "Braking" }
    ],

    performance: [
      { seconds: 0, mph: 0, mode: "Launch" },
      { seconds: 6, mph: 30, mode: "Hard acceleration" },
      { seconds: 14, mph: 60, mode: "Hard acceleration" },
      { seconds: 28, mph: 80, mode: "Performance pull" },
      { seconds: 45, mph: 45, mode: "Braking" },
      { seconds: 58, mph: 70, mode: "Acceleration" },
      { seconds: 75, mph: 100, mode: "High speed pull" },
      { seconds: 105, mph: 50, mode: "Braking" },
      { seconds: 125, mph: 0, mode: "Stopped" }
    ]
  };

  return cycles[cycleName] || cycles.mixed;
}

function buildVehicleSpeedProfile(input) {
  const cycle = getVehicleDriveCycle(input.driveCycle);
  const stepSeconds = Math.max(1, clampNumber(input.simulationTimeStepMinutes, 10));
  const profile = [];

  for (let i = 0; i < cycle.length - 1; i++) {
    const start = cycle[i];
    const end = cycle[i + 1];
    const duration = Math.max(1, end.seconds - start.seconds);

    for (let t = 0; t < duration; t += stepSeconds) {
      const sampleSeconds = Math.min(stepSeconds, duration - t);
      const progress = duration > 0 ? t / duration : 0;
      const nextProgress = duration > 0 ? (t + sampleSeconds) / duration : 1;

      const mph = start.mph + (end.mph - start.mph) * progress;
      const nextMph = start.mph + (end.mph - start.mph) * nextProgress;

      profile.push({
        durationSeconds: sampleSeconds,
        speedMph: mph,
        nextSpeedMph: nextMph,
        mode: end.mode
      });
    }
  }

  return profile;
}

function simulateVariableCurrentRuntime(usableEnergyKWh, nominalVoltageV, input, maxDischargeCurrentA) {
  const massKg = Math.max(1, clampNumber(input.vehicleMassKg, 1300));
  const cd = Math.max(0.1, clampNumber(input.dragCoefficient, 0.34));
  const frontalAreaM2 = Math.max(0.5, clampNumber(input.frontalAreaM2, 2.1));
  const crr = Math.max(0.001, clampNumber(input.rollingResistanceCoefficient, 0.013));
  const efficiency = clamp(clampNumber(input.drivetrainEfficiencyPercent, 90) / 100, 0.5, 0.98);
  const accessoryLoadKW = Math.max(0, clampNumber(input.assumedLoadKW, 1.0));
  const currentLimitA = Math.max(0, maxDischargeCurrentA || 0);

  const airDensity = 1.225;
  const gravity = 9.81;
  const speedProfile = buildVehicleSpeedProfile(input);

  if (usableEnergyKWh <= 0 || nominalVoltageV <= 0 || !speedProfile.length) {
    return {
      averageCurrentA: 0,
      averagePowerKW: 0,
      runtimeMinutes: 0,
      zeroSOCMinute: 0,
      profileSampleNumber: driveCycleRunId,
      rows: []
    };
  }

  driveCycleRunId += 1;

  const driveRows = speedProfile.map(sample => {
    const speedMps = mphToMps(sample.speedMph);
    const nextSpeedMps = mphToMps(sample.nextSpeedMph);
    const durationSeconds = Math.max(1, sample.durationSeconds);
    const accelerationMps2 = (nextSpeedMps - speedMps) / durationSeconds;

    const rollingForceN = massKg * gravity * crr;
    const aeroForceN = 0.5 * airDensity * cd * frontalAreaM2 * speedMps * speedMps;
    const accelerationForceN = massKg * accelerationMps2;

    const totalForceN = rollingForceN + aeroForceN + accelerationForceN;
    const wheelPowerKW = Math.max(0, totalForceN * speedMps / 1000);
    const batteryPowerKW = wheelPowerKW / efficiency + accessoryLoadKW;
    const currentA = nominalVoltageV > 0 ? batteryPowerKW * 1000 / nominalVoltageV : 0;

    return {
      durationMinutes: durationSeconds / 60,
      speedMph: sample.speedMph,
      driveMode: sample.mode,
      averageCurrentA: clamp(currentA, 0, currentLimitA || currentA),
      currentLimitA,
      powerKW: batteryPowerKW
    };
  });

  const rows = [];
  let cumulativeEnergyUsedKWh = 0;
  let elapsedMinutes = 0;
  let zeroSOCMinute = null;
  let weightedCurrentSum = 0;
  let weightedPowerSum = 0;
  let measuredMinutes = 0;
  const maxRows = 1500;

  while (cumulativeEnergyUsedKWh < usableEnergyKWh && rows.length < maxRows) {
    for (const sample of driveRows) {
      if (cumulativeEnergyUsedKWh >= usableEnergyKWh || rows.length >= maxRows) break;

      const durationMinutes = sample.durationMinutes;
      const powerKW = sample.powerKW;
      const fullSampleEnergyKWh = powerKW * (durationMinutes / 60);
      const availableEnergyKWh = Math.max(0, usableEnergyKWh - cumulativeEnergyUsedKWh);

      const effectiveDurationMinutes = fullSampleEnergyKWh > availableEnergyKWh && powerKW > 0
        ? (availableEnergyKWh / powerKW) * 60
        : durationMinutes;

      const energyUsedKWh = powerKW * (effectiveDurationMinutes / 60);

      elapsedMinutes += effectiveDurationMinutes;
      cumulativeEnergyUsedKWh += energyUsedKWh;
      weightedCurrentSum += sample.averageCurrentA * effectiveDurationMinutes;
      weightedPowerSum += powerKW * effectiveDurationMinutes;
      measuredMinutes += effectiveDurationMinutes;

      const remainingEnergyKWh = Math.max(0, usableEnergyKWh - cumulativeEnergyUsedKWh);
      const socPercent = usableEnergyKWh > 0 ? remainingEnergyKWh / usableEnergyKWh * 100 : 0;

      if (zeroSOCMinute === null && cumulativeEnergyUsedKWh >= usableEnergyKWh) {
        zeroSOCMinute = elapsedMinutes;
      }

      rows.push({
        minute: elapsedMinutes,
        driveMode: sample.driveMode,
        speedMph: sample.speedMph,
        averageCurrentA: sample.averageCurrentA,
        currentLimitA: sample.currentLimitA,
        powerKW,
        energyUsedKWh,
        cumulativeEnergyUsedKWh,
        remainingEnergyKWh,
        socPercent
      });
    }
  }

  const averageCurrentA = measuredMinutes > 0 ? weightedCurrentSum / measuredMinutes : 0;
  const averagePowerKW = measuredMinutes > 0 ? weightedPowerSum / measuredMinutes : 0;
  const runtimeMinutes = zeroSOCMinute ?? elapsedMinutes;

  return {
    averageCurrentA,
    averagePowerKW,
    runtimeMinutes,
    zeroSOCMinute: zeroSOCMinute ?? runtimeMinutes,
    profileSampleNumber: driveCycleRunId,
    rows
  };
}
function valueRow(label, value) { return `<div class="value-row"><span>${label}</span><strong>${value}</strong></div>`; }
function renderResults(results) {
  document.getElementById('results').hidden = false;
  document.getElementById('resultCards').innerHTML = `
    <article class="result-card"><span>⚡</span><small>Energy</small><strong>${fmt(results.packEnergyKWh, 2)} kWh</strong></article>
    <article class="result-card"><span>🧭</span><small>Nominal Voltage</small><strong>${fmt(results.nominalVoltageV, 1)} V</strong></article>
    <article class="result-card"><span>🔋</span><small>Capacity</small><strong>${fmt(results.packCapacityAh, 1)} Ah</strong></article>
    <article class="result-card"><span>▦</span><small>Cells</small><strong>${results.numberOfCells}</strong></article>`;
  document.getElementById('detailedResults').innerHTML = [
    valueRow('Max discharge', `${fmt(results.maxDischargeCurrentA, 1)} A / ${fmt(results.maxDischargePowerKW, 2)} kW`),
    valueRow('Continuous discharge', `${fmt(results.continuousDischargeCurrentA, 1)} A / ${fmt(results.continuousDischargePowerKW, 2)} kW`),
    valueRow('Max charge', `${fmt(results.maxChargeCurrentA, 1)} A / ${fmt(results.maxChargePowerKW, 2)} kW`),
    valueRow('Voltage range', `${fmt(results.minVoltageV, 1)}–${fmt(results.maxVoltageV, 1)} V`),
    valueRow('Cell weight', `${fmt(results.totalCellWeightKG, 2)} kg`),
    valueRow('Discharge C rating', `${fmt(results.maxDischargeCRating, 0)} C`),
    valueRow('Charge C rating', `${fmt(results.maxChargeCRating, 0)} C`)
  ].join('');
  
const moduleConfigEl = document.getElementById("moduleResultConfig");
const moduleVoltageEl = document.getElementById("moduleResultVoltage");
const moduleCapacityEl = document.getElementById("moduleResultCapacity");
const moduleEnergyEl = document.getElementById("moduleResultEnergy");
const moduleCellsEl = document.getElementById("moduleResultCells");

if (moduleConfigEl) {
  moduleConfigEl.textContent = results.moduleCount1
    ? `${fmt(results.moduleCount1, 0)} module${results.moduleCount1 === 1 ? "" : "s"} of ${results.moduleConfig}`
    : results.moduleConfig;
}

if (moduleVoltageEl) moduleVoltageEl.textContent = `${fmt(results.moduleNominalVoltageV, 1)} V`;
if (moduleCapacityEl) moduleCapacityEl.textContent = `${fmt(results.moduleCapacityAh, 1)} Ah`;
if (moduleEnergyEl) moduleEnergyEl.textContent = `${fmt(results.moduleEnergyKWh, 2)} kWh`;
if (moduleCellsEl) moduleCellsEl.textContent = `${fmt(results.moduleCellCount, 0)} cells`;

const secondModuleResultsEl = document.getElementById("secondModuleResults");
const secondModuleConfigEl = document.getElementById("secondModuleResultConfig");
const secondModuleVoltageEl = document.getElementById("secondModuleResultVoltage");
const secondModuleCapacityEl = document.getElementById("secondModuleResultCapacity");
const secondModuleEnergyEl = document.getElementById("secondModuleResultEnergy");
const secondModuleCellsEl = document.getElementById("secondModuleResultCells");

if (secondModuleResultsEl) {
  secondModuleResultsEl.hidden = !results.hasSecondModule;
}

if (results.hasSecondModule) {
  if (secondModuleConfigEl) {
    secondModuleConfigEl.textContent = results.moduleCount2
      ? `${fmt(results.moduleCount2, 0)} module${results.moduleCount2 === 1 ? "" : "s"} of ${results.module2Config}`
      : results.module2Config;
  }

  if (secondModuleVoltageEl) secondModuleVoltageEl.textContent = `${fmt(results.module2NominalVoltageV, 1)} V`;
  if (secondModuleCapacityEl) secondModuleCapacityEl.textContent = `${fmt(results.module2CapacityAh, 1)} Ah`;
  if (secondModuleEnergyEl) secondModuleEnergyEl.textContent = `${fmt(results.module2EnergyKWh, 2)} kWh`;
  if (secondModuleCellsEl) secondModuleCellsEl.textContent = `${fmt(results.module2CellCount, 0)} cells`;
}
  
  document.getElementById('sohRows').innerHTML = results.sohRows.map(row => `<div class="soh-row"><div><span>${row.percentage}% SOH</span><strong>${fmt(row.usableEnergyKWh, 2)} kWh</strong></div><progress value="${row.percentage}" max="100"></progress></div>`).join('');
  let runtime = valueRow('Spreadsheet runtime', `${fmt(results.runtimeAtContinuousDischargeMinutes, 1)} min`);
  runtime += results.runtimeAtAssumedLoadMinutes !== null ? valueRow('At optional load', `${fmt(results.runtimeAtAssumedLoadMinutes, 1)} min`) : `<p class="muted">Enter an optional load in kW to estimate runtime for a specific motor, inverter, or device load.</p>`;
  if (results.variableSimulationEnabled && results.variableAveragePowerKW !== null) {
  runtime += '<hr>'
    + valueRow('Vehicle average power', `${fmt(results.variableAveragePowerKW, 2)} kW`)
    + valueRow('Vehicle runtime', `${fmt(results.variableRuntimeMinutes, 1)} min`)
    + valueRow('Vehicle 0% SOC', `${fmt(results.variableZeroSOCMinute, 0)} min`);
}
  document.getElementById('runtimeRows').innerHTML = runtime;
  const simSection = document.getElementById('simulationSection');
  if (results.variableSimulationEnabled && results.variableSimulationRows.length) {
    simSection.hidden = false;
    const profileTitle = document.getElementById('profileTitle');
    if (profileTitle) profileTitle.textContent = 'Vehicle Runtime Simulation';
    drawChart(results.variableSimulationRows, results.variableSimulationRows.length);
  } else { simSection.hidden = true; }
}

function driveStyleLabel(mode) {
  const labels = {
    stop: 'Traffic light / idle',
    town: 'Town driving',
    road: 'A-road cruise',
    highway: 'Highway cruise',
    accelerate: 'Acceleration',
    pull: 'Full-throttle pull'
  };
  return labels[mode] || 'Driving';
}
function updateDriverLiveData(row) {
  if (!row) return;
  const timeEl = document.getElementById('liveTimeValue');
  const currentEl = document.getElementById('liveCurrentValue');
  const styleEl = document.getElementById('liveDriveStyleValue');
  if (timeEl) {
    const totalSeconds = Math.round((row.minute || 0) * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = String(totalSeconds % 60).padStart(2, '0');
    timeEl.textContent = `${mins}:${secs}`;
  }
  if (currentEl) currentEl.textContent = `${fmt(row.averageCurrentA, 0)} A`;
  if (styleEl) styleEl.textContent = driveStyleLabel(row.driveMode);
}

function drawChart(rows, count = rows.length) {
  const canvas = document.getElementById('currentChart');
  if (!canvas || !rows?.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(300, rect.width * dpr);
  canvas.height = Math.max(220, rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const pad = { left: 48, right: 18, top: 20, bottom: 34 };
  const visible = rows.slice(0, Math.max(1, count));
  const minA = 0;
  const maxA = Math.max(...rows.map(r => r.averageCurrentA), 1) * 1.15;
  // Use sample spacing on the x-axis so very short 2–8 second hard pulls are
  // visible in the replay. The live data panel still shows the true elapsed time.
  const x = (_row, fallbackIndex = 0) => pad.left + (fallbackIndex / Math.max(rows.length - 1, 1)) * (w - pad.left - pad.right);
  const y = a => pad.top + (1 - ((a - minA) / Math.max(maxA - minA, 1))) * (h - pad.top - pad.bottom);
  ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = pad.top + i * (h - pad.top - pad.bottom) / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(w - pad.right, yy); ctx.stroke();
  }
  ctx.strokeStyle = '#38e06f'; ctx.lineWidth = 3; ctx.beginPath();
  visible.forEach((r, i) => { const px = x(r, i), py = y(r.averageCurrentA); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
  const last = visible[visible.length - 1];
  ctx.fillStyle = '#d7ffe2'; ctx.beginPath(); ctx.arc(x(last, visible.length - 1), y(last.averageCurrentA), 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '12px system-ui';
  ctx.fillText(`${Math.round(maxA)} A`, 8, pad.top + 4); ctx.fillText(`${Math.round(minA)} A`, 8, h - pad.bottom + 4);
  updateDriverLiveData(last);
  const chartStats = document.getElementById('chartStats');
  if (chartStats) chartStats.textContent = `Vehicle runtime simulation • current draw based on speed, mass, drag, rolling resistance and drivetrain efficiency • 0–${fmt(maxA, 0)} A range`;
}
function animateChart() {
  if (!lastResults?.variableSimulationRows?.length) return;
  cancelAnimationFrame(animationFrame);
  chartPointCount = 1;
  let lastTime = 0;
  function step(timestamp) {
    if (timestamp - lastTime > CHART_ANIMATION_DELAY_MS) {
      chartPointCount = Math.min(chartPointCount + 1, lastResults.variableSimulationRows.length);
      drawChart(lastResults.variableSimulationRows, chartPointCount);
      lastTime = timestamp;
    }
    if (chartPointCount < lastResults.variableSimulationRows.length) animationFrame = requestAnimationFrame(step);
  }
  animationFrame = requestAnimationFrame(step);
}
function toggleSimulationOptions() {
  const enabled = document.getElementById('variableCurrentSimulationEnabled')?.checked || false;

  const simulationOptions = document.getElementById('simulationOptions');
  const vehicleSimulationInputs = document.getElementById('vehicleSimulationInputs');

  if (simulationOptions) simulationOptions.hidden = !enabled;
  if (vehicleSimulationInputs) vehicleSimulationInputs.hidden = !enabled;
}
function showLoading() {
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.hidden = false;
}
function hideLoading() {
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.hidden = true;
}
function showCalculatorPage() {
  cancelAnimationFrame(animationFrame);
  document.getElementById('calculatorPage').hidden = false;
  document.getElementById('resultsPage').hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showResultsPage() {
  document.getElementById('calculatorPage').hidden = true;
  document.getElementById('resultsPage').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function handleCalculate(event) {
  event?.preventDefault();

  try {
    const inputs = getInputs();
    saveInputs(inputs);
    lastResults = calculate(inputs);

    showLoading();

    window.setTimeout(() => {
      try {
        showResultsPage();
        renderResults(lastResults);
        hideLoading();
      } catch (error) {
        hideLoading();
        alert("Results error: " + error.message);
        console.error(error);
      }
    }, 2500);

  } catch (error) {
    hideLoading();
    alert("Calculator error: " + error.message);
    console.error(error);
  }
}
function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  setInputs({ ...DEFAULT_INPUTS });
  lastResults = null;
  showCalculatorPage();
}
function init() {
  setInputs(loadInputs());
  updateModuleConfigurationOptions();

  document.getElementById('calculatorForm').addEventListener('submit', handleCalculate);
  document.getElementById('resetBtn').addEventListener('click', resetAll);
  document.getElementById('backBtn').addEventListener('click', showCalculatorPage);
  document.getElementById('variableCurrentSimulationEnabled').addEventListener('change', toggleSimulationOptions);
  document.getElementById('animateBtn').addEventListener('click', animateChart);

  for (const [name] of fields) {
    document.getElementById(name)?.addEventListener('input', () => {
      if (name === "seriesCount" || name === "parallelCount" || name === "useSecondModuleConfiguration") {
        updateModuleConfigurationOptions();
      } else if (name === "moduleConfiguration") {
        updateModuleCount1FromConfiguration();
      } else if (name === "secondModuleConfiguration") {
        updateSecondModuleConfigurationOptions();
        saveInputs(getInputs());
      } else if (name === "moduleCount1" || name === "moduleCount2") {
        updateSecondModuleConfigurationOptions(name);
        saveInputs(getInputs());
      } else {
        saveInputs(getInputs());
      }
    });

    document.getElementById(name)?.addEventListener('change', () => {
      if (name === "seriesCount" || name === "parallelCount" || name === "useSecondModuleConfiguration") {
        updateModuleConfigurationOptions();
      } else if (name === "moduleConfiguration") {
        updateModuleCount1FromConfiguration();
      } else if (name === "secondModuleConfiguration") {
        updateSecondModuleConfigurationOptions();
      } else if (name === "moduleCount1" || name === "moduleCount2") {
        updateSecondModuleConfigurationOptions(name);
      }

      saveInputs(getInputs());
    });
  }

  document.getElementById('calculatorPage').hidden = false;
  document.getElementById('resultsPage').hidden = true;
  hideLoading();
}

document.addEventListener('DOMContentLoaded', init);
