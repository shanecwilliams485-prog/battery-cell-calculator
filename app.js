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
  simulationTimeStepSeconds: 10,
  advancedVehicleRealismEnabled: false,
  regenEnabled: true,
  maxRegenCurrentA: 120,
  regenEfficiencyPercent: 65,
  regenDisableAboveSocPercent: 95,
  batteryTemperatureC: 25,
  roadGradientProfile: "mixed",
  airConditioningEnabled: false,
  heatingEnabled: false,
  electricalAccessoriesEnabled: false,
  weatherCondition: "dryCold",
  driverAggression: "normal",
  payloadKg: 0,
};

const STORAGE_KEY = 'batteryCellCalculator.inputs.v1';
const inputEls = {};
let lastResults = null;
let animationFrame = null;
let chartPointCount = 1;
let driveCycleRunId = 0;
const CHART_ANIMATION_DELAY_MS = 35; // Increase this value to make the vehicle runtime graph draw more slowly.

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
  ['simulationTimeStepSeconds', 'number'],
  ['advancedVehicleRealismEnabled', 'checkbox'],
  ['regenEnabled', 'checkbox'],
  ['maxRegenCurrentA', 'number'],
  ['regenEfficiencyPercent', 'number'],
  ['regenDisableAboveSocPercent', 'number'],

  ['batteryTemperatureC', 'number'],

  ['roadGradientProfile', 'text'],
  ['airConditioningEnabled', 'checkbox'],
  ['heatingEnabled', 'checkbox'],
  ['electricalAccessoriesEnabled', 'checkbox'],
  ['weatherCondition', 'text'],

  ['driverAggression', 'text'],
  ['payloadKg', 'number'],
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
function toggleAdvancedVehicleRealismOptions() {
  const advancedToggle = document.getElementById('advancedVehicleRealismEnabled');
  const advancedInputs = document.getElementById('advancedVehicleRealismInputs');

  if (!advancedToggle || !advancedInputs) return;

  advancedInputs.hidden = !advancedToggle.checked;
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
function updateCalculatedMaxRegenCurrentInput() {
  const maxChargeInput = document.getElementById('maxChargeCurrentA');
  const parallelInput = document.getElementById('parallelCount');
  const maxRegenInput = document.getElementById('maxRegenCurrentA');

  if (!maxChargeInput || !parallelInput || !maxRegenInput) return;

  const cellMaxChargeCurrentA = clampNumber(maxChargeInput.value, 0);
  const parallelCount = Math.max(0, Math.round(clampNumber(parallelInput.value, 0)));

  const packMaxChargeCurrentA = cellMaxChargeCurrentA * parallelCount;
  const calculatedMaxRegenCurrentA = packMaxChargeCurrentA * 0.8;

  maxRegenInput.value = fmt(calculatedMaxRegenCurrentA, 0);
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
  const calculatedMaxRegenCurrentA = maxChargeCurrentA * 0.8;

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
    usableEnergyFactor: input.usableEnergyFactor,
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
advancedVehicleRealismEnabled: input.advancedVehicleRealismEnabled,

driveCycle: input.driveCycle,
vehicleMassKg: input.vehicleMassKg,
dragCoefficient: input.dragCoefficient,
frontalAreaM2: input.frontalAreaM2,
rollingResistanceCoefficient: input.rollingResistanceCoefficient,
drivetrainEfficiencyPercent: input.drivetrainEfficiencyPercent,
assumedLoadKW: input.assumedLoadKW,

regenEnabled: input.regenEnabled,
maxRegenCurrentA: calculatedMaxRegenCurrentA,
regenEfficiencyPercent: input.regenEfficiencyPercent,
regenDisableAboveSocPercent: input.regenDisableAboveSocPercent,
batteryTemperatureC: input.batteryTemperatureC,
roadGradientProfile: input.roadGradientProfile,
auxiliaryLoadProfile: input.auxiliaryLoadProfile,
weatherCondition: input.weatherCondition,
driverAggression: input.driverAggression,
payloadKg: input.payloadKg,

variableAverageCurrentA: variableSimulation?.averageCurrentA ?? null,
variableAveragePowerKW: variableSimulation?.averagePowerKW ?? null,
variableAverageSpeedMph: variableSimulation?.averageSpeedMph ?? null,
variableRuntimeMinutes: variableSimulation?.runtimeMinutes ?? null,
variableZeroSOCMinute: variableSimulation?.zeroSOCMinute ?? null,
vehicleConsumptionKWhPer100Miles: variableSimulation && variableSimulation.simulatedDistanceMiles > 0
  ? (variableSimulation.simulatedEnergyUsedKWh / variableSimulation.simulatedDistanceMiles) * 100
  : null,

vehicleConsumptionMilesPerKWh: variableSimulation && variableSimulation.simulatedEnergyUsedKWh > 0
  ? variableSimulation.simulatedDistanceMiles / variableSimulation.simulatedEnergyUsedKWh
  : null,

vehicleRangeMiles: variableSimulation && variableSimulation.simulatedEnergyUsedKWh > 0
  ? usableEnergyKWh * (variableSimulation.simulatedDistanceMiles / variableSimulation.simulatedEnergyUsedKWh)
  : null,
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

function makeSeededRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function easeInOut(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

function pickWeighted(random, options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let target = random() * total;

  for (const option of options) {
    target -= option.weight;
    if (target <= 0) return option;
  }

  return options[options.length - 1];
}

function addJourneySegment(segments, fromMph, toMph, seconds, mode, remainingSeconds) {
  const duration = Math.max(4, Math.min(seconds, remainingSeconds));

  segments.push({
    fromMph,
    toMph,
    seconds: duration,
    mode
  });

  return toMph;
}

function getVehicleDriveCycle(cycleName, random, targetSeconds = 30 * 60) {
  const segments = [];
  let elapsedSeconds = 0;
  let speedMph = 0;

  const eventBanks = {
    city: [
      { weight: 18, min: 0, max: 0, seconds: [8, 35], mode: "Traffic lights / queue" },
      { weight: 20, min: 8, max: 22, seconds: [12, 45], mode: "20 mph street" },
      { weight: 24, min: 18, max: 32, seconds: [20, 70], mode: "30 mph urban road" },
      { weight: 12, min: 5, max: 18, seconds: [10, 35], mode: "Roundabout approach" },
      { weight: 10, min: 25, max: 40, seconds: [25, 70], mode: "Urban dual carriageway" },
      { weight: 8, min: 0, max: 8, seconds: [6, 20], mode: "Junction crawl" },
      { weight: 8, min: 12, max: 28, seconds: [15, 50], mode: "Residential traffic" }
    ],

    mixed: [
      { weight: 9, min: 0, max: 0, seconds: [8, 30], mode: "Traffic lights / junction" },
      { weight: 12, min: 18, max: 32, seconds: [20, 70], mode: "Village 30 mph" },
      { weight: 14, min: 35, max: 48, seconds: [30, 100], mode: "B-road bends" },
      { weight: 18, min: 45, max: 62, seconds: [45, 130], mode: "A-road cruise" },
      { weight: 12, min: 55, max: 70, seconds: [40, 120], mode: "National speed limit" },
      { weight: 10, min: 20, max: 38, seconds: [15, 55], mode: "Roundabout / traffic" },
      { weight: 8, min: 8, max: 24, seconds: [10, 45], mode: "Slow vehicle ahead" },
      { weight: 9, min: 50, max: 72, seconds: [12, 35], mode: "Overtake / acceleration" },
      { weight: 8, min: 30, max: 45, seconds: [20, 70], mode: "Roadworks / restriction" }
    ],

    motorway: [
      { weight: 8, min: 35, max: 55, seconds: [20, 50], mode: "Slip road / joining" },
      { weight: 28, min: 63, max: 72, seconds: [70, 220], mode: "Motorway cruise" },
      { weight: 18, min: 58, max: 68, seconds: [45, 150], mode: "Traffic flow" },
      { weight: 12, min: 48, max: 60, seconds: [30, 100], mode: "Middle-lane traffic" },
      { weight: 10, min: 40, max: 52, seconds: [25, 90], mode: "Roadworks 50 mph" },
      { weight: 10, min: 68, max: 76, seconds: [12, 40], mode: "Overtake acceleration" },
      { weight: 8, min: 28, max: 45, seconds: [20, 70], mode: "Congestion building" },
      { weight: 6, min: 0, max: 15, seconds: [10, 40], mode: "Stop-start traffic" }
    ],

    performance: [
      { weight: 12, min: 0, max: 20, seconds: [8, 25], mode: "Slow corner / junction" },
      { weight: 22, min: 35, max: 65, seconds: [10, 35], mode: "Hard acceleration" },
      { weight: 16, min: 45, max: 75, seconds: [15, 55], mode: "Fast A-road" },
      { weight: 14, min: 20, max: 45, seconds: [8, 30], mode: "Braking for bend" },
      { weight: 16, min: 55, max: 90, seconds: [8, 28], mode: "Performance pull" },
      { weight: 10, min: 35, max: 55, seconds: [20, 55], mode: "Cooling cruise" },
      { weight: 10, min: 0, max: 12, seconds: [8, 22], mode: "Junction / reset" }
    ]
  };

  const bank = eventBanks[cycleName] || eventBanks.mixed;

  while (elapsedSeconds < targetSeconds) {
    const event = pickWeighted(random, bank);
    const remainingSeconds = targetSeconds - elapsedSeconds;

    let nextSpeedMph = randomBetween(random, event.min, event.max);
    let durationSeconds = randomBetween(random, event.seconds[0], event.seconds[1]);

    // Avoid robotic jumps. If the next target is very different, create a
    // separate acceleration or slowing segment before the main road section.
    const speedDifference = nextSpeedMph - speedMph;

    if (Math.abs(speedDifference) > 12 && remainingSeconds > 20) {
      const transitionSeconds = clamp(Math.abs(speedDifference) * randomBetween(random, 0.45, 0.9), 6, 35);
      const transitionMode = speedDifference > 0 ? "Acceleration" : "Slowing / braking";

      speedMph = addJourneySegment(
        segments,
        speedMph,
        nextSpeedMph,
        transitionSeconds,
        transitionMode,
        remainingSeconds
      );

      elapsedSeconds += transitionSeconds;
    }

    const updatedRemainingSeconds = targetSeconds - elapsedSeconds;
    if (updatedRemainingSeconds <= 0) break;

    // Small natural speed drift inside a section.
    const sectionEndSpeed = clamp(
      nextSpeedMph + randomBetween(random, -4, 4),
      0,
      cycleName === "performance" ? 95 : 76
    );

    speedMph = addJourneySegment(
      segments,
      speedMph,
      sectionEndSpeed,
      durationSeconds,
      event.mode,
      updatedRemainingSeconds
    );

    elapsedSeconds += Math.min(durationSeconds, updatedRemainingSeconds);
  }

  return segments;
}
function getSegmentSpeedMph(segment, elapsedSeconds, segmentElapsedSeconds, cycleVariation, random) {
  const progress = segment.seconds > 0 ? segmentElapsedSeconds / segment.seconds : 0;
  const smoothProgress = easeInOut(progress);

  let speedMph = segment.fromMph + (segment.toMph - segment.fromMph) * smoothProgress;

  if (speedMph > 1) {
    const trafficWave = Math.sin(elapsedSeconds / 18) * 1.4;
    const smallNoise = (random() - 0.5) * 0.8;
    speedMph = speedMph * cycleVariation + trafficWave + smallNoise;
  }

  return Math.max(0, speedMph);
}
function getAuxiliaryLoadKW(input) {
  if (!input.advancedVehicleRealismEnabled) {
    return Math.max(0, clampNumber(input.assumedLoadKW, 1.0));
  }

  const profile = input.auxiliaryLoadProfile || "normal";

  if (profile === "low") return 0.6;
  if (profile === "winter") return 2.4;

  return Math.max(0.8, clampNumber(input.assumedLoadKW, 1.0));
}

function getTyreRoadMultiplier(input) {
  if (!input.advancedVehicleRealismEnabled) return 1;

  const profile = input.tyreRoadProfile || "normal";

  if (profile === "eco") return 0.90;
  if (profile === "performance") return 1.12;
  if (profile === "wet") return 1.18;

  return 1;
}

function getDriverAggressionFactor(input) {
  if (!input.advancedVehicleRealismEnabled) return 1;

  const aggression = clamp(clampNumber(input.driverAggression, 5), 1, 10);

  return 0.75 + aggression * 0.075;
}

function getTemperaturePowerMultiplier(input) {
  if (!input.advancedVehicleRealismEnabled) return 1;

  const tempC = clampNumber(input.batteryTemperatureC, 25);

  if (tempC < 0) return 1.18;
  if (tempC < 10) return 1.10;
  if (tempC > 45) return 1.08;
  if (tempC > 35) return 1.04;

  return 1;
}

function getRoadGradientPercent(input, elapsedSeconds) {
  if (!input.advancedVehicleRealismEnabled) return 0;

  const profile = input.roadGradientProfile || "rolling";

  if (profile === "flat") return 0;

  if (profile === "hilly") {
    return Math.sin(elapsedSeconds / 95) * 3.5 + Math.sin(elapsedSeconds / 37) * 1.2;
  }

  return Math.sin(elapsedSeconds / 130) * 1.4 + Math.sin(elapsedSeconds / 55) * 0.5;
}

function getRegenEfficiency(input) {
  if (!input.advancedVehicleRealismEnabled || !input.regenEnabled) return 0;

  const regenEfficiency = clamp(clampNumber(input.regenEfficiencyPercent, 65) / 100, 0, 0.9);
  const tempC = clampNumber(input.batteryTemperatureC, 25);

  if (tempC < 0) return regenEfficiency * 0.25;
  if (tempC < 10) return regenEfficiency * 0.55;
  if (tempC > 45) return regenEfficiency * 0.65;

  return regenEfficiency;
}
function calculateVehiclePowerKW(input, speedMph, nextSpeedMph, durationSeconds, elapsedSeconds = 0, nominalVoltageV = 0) {
  const baseMassKg = Math.max(1, clampNumber(input.vehicleMassKg, 1300));
  const payloadKg = input.advancedVehicleRealismEnabled
    ? Math.max(0, clampNumber(input.payloadKg, 0))
    : 0;

  const massKg = baseMassKg + payloadKg;

  const cd = Math.max(0.1, clampNumber(input.dragCoefficient, 0.34));
  const frontalAreaM2 = Math.max(0.5, clampNumber(input.frontalAreaM2, 2.1));

  const tyreMultiplier = getTyreRoadMultiplier(input);
  const crr = Math.max(0.001, clampNumber(input.rollingResistanceCoefficient, 0.013)) * tyreMultiplier;

  const efficiency = clamp(clampNumber(input.drivetrainEfficiencyPercent, 90) / 100, 0.5, 0.98);
  const accessoryLoadKW = getAuxiliaryLoadKW(input);

  const airDensity = 1.225;
  const gravity = 9.81;

  const speedMps = mphToMps(speedMph);
  const nextSpeedMps = mphToMps(nextSpeedMph);
  const averageSpeedMps = Math.max(0, (speedMps + nextSpeedMps) / 2);
  const dt = Math.max(1, durationSeconds);

  const rollingPowerKW = massKg * gravity * crr * averageSpeedMps / 1000;
  const aeroPowerKW = 0.5 * airDensity * cd * frontalAreaM2 * averageSpeedMps ** 3 / 1000;

  const gradientPercent = getRoadGradientPercent(input, elapsedSeconds);
  const gradientPowerKW = massKg * gravity * (gradientPercent / 100) * averageSpeedMps / 1000;

  const deltaKineticEnergyJ = 0.5 * massKg * (nextSpeedMps ** 2 - speedMps ** 2);
  const rawAccelerationPowerKW = Math.max(0, deltaKineticEnergyJ / dt / 1000);

  const aggressionFactor = getDriverAggressionFactor(input);
  const accelerationCapKW = input.driveCycle === "performance" ? 65 : 28;
  const accelerationPowerKW = clamp(rawAccelerationPowerKW * aggressionFactor, 0, accelerationCapKW);

  const accelerationBoostKW = accelerationPowerKW > 0 ? accelerationPowerKW * 0.02 : 0;

  const wheelPowerKW =
    rollingPowerKW +
    aeroPowerKW +
    gradientPowerKW +
    accelerationPowerKW +
    accelerationBoostKW;

  const propulsionPowerKW = Math.max(0, wheelPowerKW) / efficiency + accessoryLoadKW;

  const regenEfficiency = getRegenEfficiency(input);
  const maxRegenCurrentA = Math.max(0, clampNumber(input.maxRegenCurrentA, 120));
  const maxRegenPowerKW = nominalVoltageV > 0 ? nominalVoltageV * maxRegenCurrentA / 1000 : 0;

  const brakingPowerKW = Math.max(0, -deltaKineticEnergyJ / dt / 1000);
  const downhillPowerKW = Math.max(0, -gradientPowerKW);

  const regenPowerKW = input.advancedVehicleRealismEnabled
    ? Math.min(maxRegenPowerKW, (brakingPowerKW + downhillPowerKW) * regenEfficiency)
    : 0;

  const temperatureMultiplier = getTemperaturePowerMultiplier(input);
  const netPowerKW = propulsionPowerKW * temperatureMultiplier - regenPowerKW;

  return clamp(netPowerKW, 0, input.driveCycle === "performance" ? 160 : 75);
}
function simulateVariableCurrentRuntime(usableEnergyKWh, nominalVoltageV, input, maxDischargeCurrentA) {
  const currentLimitA = Math.max(0, maxDischargeCurrentA || 0);
  const stepSeconds = Math.max(2, clampNumber(input.simulationTimeStepSeconds, 10));

  if (usableEnergyKWh <= 0 || nominalVoltageV <= 0) {
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

  const random = makeSeededRandom(
    Date.now()
    ^ Math.round(usableEnergyKWh * 1000)
    ^ Math.round(nominalVoltageV * 10)
    ^ Math.round(currentLimitA * 10)
    ^ driveCycleRunId
  );

  const graphDurationSeconds = 30 * 60;
  const cycle = getVehicleDriveCycle(input.driveCycle, random, graphDurationSeconds);

  if (!cycle.length) {
    return {
      averageCurrentA: 0,
      averagePowerKW: 0,
      runtimeMinutes: 0,
      zeroSOCMinute: 0,
      profileSampleNumber: driveCycleRunId,
      rows: []
    };
  }

  const rows = [];
  let cumulativeEnergyUsedKWh = 0;
  let elapsedSeconds = 0;
  let segmentIndex = 0;
  let segmentElapsedSeconds = 0;

let weightedCurrentSeconds = 0;
let weightedPowerSeconds = 0;
let simulatedDistanceMiles = 0;
let simulatedEnergyUsedKWh = 0;
let measuredSeconds = 0;
  let previousCurrentA = 0;

  while (elapsedSeconds < graphDurationSeconds && segmentIndex < cycle.length) {
    const segment = cycle[segmentIndex];
    const remainingSegmentSeconds = Math.max(1, segment.seconds - segmentElapsedSeconds);
    const durationSeconds = Math.min(stepSeconds, remainingSegmentSeconds, graphDurationSeconds - elapsedSeconds);

    const speedMph = getSegmentSpeedMph(
      segment,
      elapsedSeconds,
      segmentElapsedSeconds,
      1,
      random
    );

    const nextSpeedMph = getSegmentSpeedMph(
      segment,
      elapsedSeconds + durationSeconds,
      segmentElapsedSeconds + durationSeconds,
      1,
      random
    );

    const rawPowerKW = calculateVehiclePowerKW(
  input,
  speedMph,
  nextSpeedMph,
  durationSeconds,
  elapsedSeconds,
  nominalVoltageV
);
const rawCurrentA = nominalVoltageV > 0 ? rawPowerKW * 1000 / nominalVoltageV : 0;

const mode = String(segment.mode || "").toLowerCase();
const segmentProgress = segment.seconds > 0
  ? clamp((segmentElapsedSeconds + durationSeconds / 2) / segment.seconds, 0, 1)
  : 0;

const isAccelerating = nextSpeedMph > speedMph + 0.5;
const isBrakingOrSlowing = nextSpeedMph < speedMph - 0.5;

const isPerformancePulse =
  input.driveCycle === "performance" &&
  (
    mode.includes("hard acceleration") ||
    mode.includes("performance pull") ||
    mode.includes("high speed") ||
    mode.includes("fast a-road")
  );

const isOvertakePulse =
  input.driveCycle === "performance" &&
  (
    mode.includes("overtake") ||
    mode.includes("acceleration")
  );
let demandedCurrentA = rawCurrentA;

if (currentLimitA > 0 && isPerformancePulse) {
  const pulseShape = Math.sin(Math.PI * segmentProgress);
  const pulseFloorA = currentLimitA * 0.45;
  const pulsePeakA = currentLimitA * (0.65 + random() * 0.08);

  demandedCurrentA = Math.max(
    demandedCurrentA,
    pulseFloorA + (pulsePeakA - pulseFloorA) * pulseShape
  );
} else if (currentLimitA > 0 && isOvertakePulse && isAccelerating) {
  const pulseShape = Math.sin(Math.PI * segmentProgress);
  const overtakeFloorA = currentLimitA * 0.18;
  const overtakePeakA = currentLimitA * (0.28 + random() * 0.06);

  demandedCurrentA = Math.max(
    demandedCurrentA,
    overtakeFloorA + (overtakePeakA - overtakeFloorA) * pulseShape
  );
}

const cappedCurrentA = clamp(demandedCurrentA, 0, currentLimitA || demandedCurrentA);

const currentResponse = isPerformancePulse
  ? 0.95
  : isOvertakePulse && isAccelerating
    ? 0.82
    : isAccelerating
      ? 0.72
      : isBrakingOrSlowing
        ? 0.45
        : 0.28;

let averageCurrentA = previousCurrentA + (cappedCurrentA - previousCurrentA) * currentResponse;
    
    if (input.driveCycle !== "performance") {
  averageCurrentA = clamp(averageCurrentA, 0, 165);
}

    // Real logged current is never perfectly smooth.
    const roadSurfaceRipple =
      Math.sin(elapsedSeconds / 6.5) * 0.7 +
      Math.sin(elapsedSeconds / 17) * 0.5 +
      Math.sin(elapsedSeconds / 41) * 0.35;

    const sensorNoise = (random() - 0.5) * 0.9;

    averageCurrentA = Math.max(0, averageCurrentA + roadSurfaceRipple + sensorNoise);
    previousCurrentA = averageCurrentA;

    const powerKW = nominalVoltageV * averageCurrentA / 1000;
    const energyUsedKWh = powerKW * (durationSeconds / 3600);

    elapsedSeconds += durationSeconds;
    cumulativeEnergyUsedKWh += energyUsedKWh;

weightedCurrentSeconds += averageCurrentA * durationSeconds;
weightedPowerSeconds += powerKW * durationSeconds;
simulatedDistanceMiles += speedMph * (durationSeconds / 3600);
simulatedEnergyUsedKWh += powerKW * (durationSeconds / 3600);
measuredSeconds += durationSeconds;
    
    const remainingEnergyKWh = Math.max(0, usableEnergyKWh - cumulativeEnergyUsedKWh);
    const socPercent = usableEnergyKWh > 0 ? remainingEnergyKWh / usableEnergyKWh * 100 : 0;

    rows.push({
      minute: elapsedSeconds / 60,
      driveMode: segment.mode,
      speedMph,
      averageCurrentA,
      currentLimitA,
      powerKW,
      energyUsedKWh,
      cumulativeEnergyUsedKWh,
      remainingEnergyKWh,
      socPercent
    });

    segmentElapsedSeconds += durationSeconds;

    if (segmentElapsedSeconds >= segment.seconds - 1e-9) {
      segmentElapsedSeconds = 0;
      segmentIndex += 1;
    }
  }

const averageCurrentA = measuredSeconds > 0 ? weightedCurrentSeconds / measuredSeconds : 0;
const averagePowerKW = measuredSeconds > 0 ? weightedPowerSeconds / measuredSeconds : 0;
const averageSpeedMph = measuredSeconds > 0
  ? simulatedDistanceMiles / (measuredSeconds / 3600)
  : 0;

  const runtimeMinutes = averagePowerKW > 0
    ? usableEnergyKWh / averagePowerKW * 60
    : 0;

return {
  averageCurrentA,
  averagePowerKW,
  averageSpeedMph,
  simulatedDistanceMiles,
  simulatedEnergyUsedKWh,
  runtimeMinutes,
  zeroSOCMinute: runtimeMinutes,
  profileSampleNumber: driveCycleRunId,
  rows
};
}
function yesNo(value) {
  return value ? "Enabled" : "Disabled";
}

function driveCycleLabel(value) {
  const labels = {
    mixed: "Mixed road",
    city: "City",
    motorway: "Motorway",
    performance: "Performance driving"
  };

  return labels[value] || value || "Mixed road";
}

function roadGradientLabel(value) {
  const labels = {
    mixed: "Mixed",
    flat: "Flat",
    hilly: "Hilly"
  };

  return labels[value] || value || "Mixed";
}

function auxiliaryLoadLabel(value) {
  const labels = {
    low: "Low load",
    normal: "Normal driving",
    winter: "Winter heating"
  };

  return labels[value] || value || "Normal driving";
}

function weatherConditionLabel(value) {
  const labels = {
    wetCold: "Wet / cold",
    wetWarm: "Wet / warm",
    icy: "Icy",
    dryCold: "Dry / cold",
    dryHot: "Dry / hot"
  };

  return labels[value] || value || "Dry / cold";
}

function valueRow(label, value) { return `<div class="value-row"><span>${label}</span><strong>${value}</strong></div>`; }
function renderResults(results) {
  document.getElementById('results').hidden = false;
  const maxRegenInput = document.getElementById('maxRegenCurrentA');
if (maxRegenInput) maxRegenInput.value = fmt(results.maxRegenCurrentA, 0);
  updateCalculatedMaxRegenCurrentInput();
  document.getElementById('resultCards').innerHTML = `
  <article class="result-card"><span>⚡</span><small>Pack energy</small><strong>${fmt(results.packEnergyKWh, 2)} kWh</strong></article>
  <article class="result-card"><span>🔋</span><small>Usable energy</small><strong>${fmt(results.usableEnergyKWh, 2)} kWh</strong></article>
  <article class="result-card"><span>🔌</span><small>Capacity</small><strong>${fmt(results.packCapacityAh, 1)} Ah</strong></article>
  <article class="result-card"><span>▦</span><small>Cells</small><strong>${results.numberOfCells}</strong></article>`;
  document.getElementById('detailedResults').innerHTML = [
    valueRow('Max discharge', `${fmt(results.maxDischargeCurrentA, 1)} A / ${fmt(results.maxDischargePowerKW, 2)} kW`),
    valueRow('Continuous discharge', `${fmt(results.continuousDischargeCurrentA, 1)} A / ${fmt(results.continuousDischargePowerKW, 2)} kW`),
    valueRow('Max charge', `${fmt(results.maxChargeCurrentA, 1)} A / ${fmt(results.maxChargePowerKW, 2)} kW`),
    valueRow('Usable factor', `${fmt(results.usableEnergyFactor * 100, 0)} %`), 
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

let runtime = valueRow('Pack linear discharge runtime', `${fmt(results.runtimeAtContinuousDischargeMinutes, 1)} min`);

if (results.variableSimulationEnabled && results.variableAveragePowerKW !== null) {
  runtime += '<hr>'
    + valueRow('Vehicle average power', `${fmt(results.variableAveragePowerKW, 2)} kW`)
    + valueRow('Vehicle average current', `${fmt(results.variableAverageCurrentA, 1)} A`)
    + valueRow('Vehicle runtime', `${fmt(results.variableRuntimeMinutes, 1)} min`)
    + valueRow('Vehicle 0% SOC', `${fmt(results.variableZeroSOCMinute, 0)} min`);
} else {
  runtime += `<p class="muted">Tick Vehicle runtime simulation to calculate current draw from vehicle weight, speed, drag, rolling resistance and drivetrain efficiency.</p>`;
}
  document.getElementById('runtimeRows').innerHTML = runtime;
  const vehicleRangeSection = document.getElementById('vehicleRangeSection');
const vehicleRangeRows = document.getElementById('vehicleRangeRows');

if (vehicleRangeSection && vehicleRangeRows) {
  if (results.variableSimulationEnabled && results.vehicleRangeMiles !== null) {
    vehicleRangeSection.hidden = false;

    vehicleRangeRows.innerHTML =
  valueRow('Estimated range', `${fmt(results.vehicleRangeMiles, 1)} miles`)
  + valueRow('Average simulated speed', `${fmt(results.variableAverageSpeedMph, 1)} mph`)
  + valueRow('Consumption', `${fmt(results.vehicleConsumptionKWhPer100Miles, 1)} kWh / 100 miles`)
  + valueRow('Efficiency', `${fmt(results.vehicleConsumptionMilesPerKWh, 2)} miles / kWh`)
+ `<p class="muted range-note">Range estimate is calculated from the simulated 30-minute drive cycle, measured simulation energy use, and usable pack energy.</p>`;
  } else {
    vehicleRangeSection.hidden = true;
    vehicleRangeRows.innerHTML = "";
  }
}
 const simulationSettingsSection = document.getElementById('simulationSettingsSection');
const simulationSettingsRows = document.getElementById('simulationSettingsRows');

if (simulationSettingsSection && simulationSettingsRows) {
  if (results.variableSimulationEnabled) {
    simulationSettingsSection.hidden = false;

    let settings = valueRow('Drive cycle', driveCycleLabel(results.driveCycle))
      + valueRow('Vehicle weight', `${fmt(results.vehicleMassKg, 0)} kg`)
      + valueRow('Drag coefficient', `${fmt(results.dragCoefficient, 2)} Cd`)
      + valueRow('Frontal area', `${fmt(results.frontalAreaM2, 2)} m²`)
      + valueRow('Rolling resistance', `${fmt(results.rollingResistanceCoefficient, 3)} Crr`)
      + valueRow('Drivetrain efficiency', `${fmt(results.drivetrainEfficiencyPercent, 0)} %`)
      + valueRow('Accessory load', `${fmt(results.assumedLoadKW, 1)} kW`);

    if (results.advancedVehicleRealismEnabled) {
      settings += '<hr>'
        + valueRow('Advanced realism', 'Enabled')
        + valueRow('Regenerative braking', yesNo(results.regenEnabled))
       + valueRow('Calculated max regen current', `${fmt(results.maxRegenCurrentA, 0)} A`)
        + valueRow('Regen efficiency', `${fmt(results.regenEfficiencyPercent, 0)} %`)
        + valueRow('Regen disabled above SOC', `${fmt(results.regenDisableAboveSocPercent, 0)} %`)
        + valueRow('Battery temperature', `${fmt(results.batteryTemperatureC, 0)} °C`)
        + valueRow('Road gradient', roadGradientLabel(results.roadGradientProfile))
        + valueRow('Auxiliary load profile', auxiliaryLoadLabel(results.auxiliaryLoadProfile))
        + valueRow('Weather conditions', weatherConditionLabel(results.weatherCondition))
        + valueRow('Driver aggression', `${fmt(results.driverAggression, 0)} / 10`)
        + valueRow('Payload', `${fmt(results.payloadKg, 0)} kg`);
    } else {
      settings += '<hr>'
        + valueRow('Advanced realism', 'Disabled');
    }

    simulationSettingsRows.innerHTML = settings;
  } else {
    simulationSettingsSection.hidden = true;
    simulationSettingsRows.innerHTML = "";
  }
} 
  const simSection = document.getElementById('simulationSection');
  if (results.variableSimulationEnabled && results.variableSimulationRows.length) {
    simSection.hidden = false;
    const profileTitle = document.getElementById('profileTitle');
    if (profileTitle) profileTitle.textContent = 'Vehicle Runtime Simulation';
    drawChart(results.variableSimulationRows, results.variableSimulationRows.length);
  } else { simSection.hidden = true; }
}

function driveStyleLabel(mode) {
  return mode || 'Driving';
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
function toggleAdvancedVehicleRealismOptions() {
  const advancedToggle = document.getElementById('advancedVehicleRealismEnabled');
  const advancedInputs = document.getElementById('advancedVehicleRealismInputs');

  if (!advancedToggle || !advancedInputs) return;

  advancedInputs.hidden = !advancedToggle.checked;
}

function toggleSimulationOptions() {
  const enabled = document.getElementById('variableCurrentSimulationEnabled')?.checked || false;

  const simulationOptions = document.getElementById('simulationOptions');
  const vehicleSimulationInputs = document.getElementById('vehicleSimulationInputs');

  if (simulationOptions) simulationOptions.hidden = !enabled;
  if (vehicleSimulationInputs) vehicleSimulationInputs.hidden = !enabled;

  toggleAdvancedVehicleRealismOptions();
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
  document.getElementById('advancedVehicleRealismEnabled')?.addEventListener('change', () => {
  saveInputs(getInputs());
  toggleAdvancedVehicleRealismOptions();
});
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

    updateCalculatedMaxRegenCurrentInput();
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
    updateCalculatedMaxRegenCurrentInput();
  });
}

updateCalculatedMaxRegenCurrentInput();
