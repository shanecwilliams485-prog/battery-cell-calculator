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
  designRequirementsEnabled: false,
  requiredPulseCurrentA: 0,
  requiredPulseDurationSeconds: 10,
  requiredContinuousCurrentA: 0,
  requiredMaxChargeCurrentA: 0,
  requiredRegenCurrentA: 0,
  requiredUsableEnergyKWh: 0,
  requiredPeakPowerKW: 0,
  requiredContinuousPowerKW: 0,
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
  heaterType: "resistive",
  electricalAccessoriesEnabled: false,
  weatherCondition: "dryWarm",
  driverAggression: "normal",
  payloadKg: 0,
};

const STORAGE_KEY = 'batteryCellCalculator.inputs.v1';
const inputEls = {};
let lastResults = null;
let animationFrame = null;
let chartPointCount = 1;
let driveCycleRunId = 0;
let mobileGraphExperienceActive = false;
let mobileGraphHasPlayed = false;
let mobileGraphLoopActive = false;
let chartPlaceholder = null;
let driverLivePlaceholder = null;
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

  ['designRequirementsEnabled', 'checkbox'],
  ['requiredPulseCurrentA', 'number'],
  ['requiredPulseDurationSeconds', 'number'],
  ['requiredContinuousCurrentA', 'number'],
  ['requiredMaxChargeCurrentA', 'number'],
  ['requiredRegenCurrentA', 'number'],
  ['requiredUsableEnergyKWh', 'number'],
  ['requiredPeakPowerKW', 'number'],
  ['requiredContinuousPowerKW', 'number'],
  
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
  ['heaterType', 'text'],
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
  toggleDesignRequirementsOptions();
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
function getEstimatedBatteryTemperatureC(input) {
  const weather = input.weatherCondition || "dryCold";
  const aggression = input.driverAggression || "normal";

  const weatherBaseTemps = {
  dryWarm: 18,
  dryCold: 7,
  wetWarm: 16,
  wetCold: 7,
  icy: 4,
  dryHot: 28
};

  const aggressionHeat = {
    calm: 2,
    normal: 5,
    aggressive: 10
  };

  const baseTempC = weatherBaseTemps[weather] ?? 10;
  const heatRiseC = aggressionHeat[aggression] ?? 5;

  return baseTempC + heatRiseC;
}
function getCalculatedRegenEfficiencyPercent(input) {
  if (!input.regenEnabled) return 0;

  const baseRegenEfficiencyPercent = 65;
  const batteryTemperatureC = getEstimatedBatteryTemperatureC(input);
  const weather = input.weatherCondition || "dryCold";
  const roadGradient = input.roadGradientProfile || "mixed";

  let temperatureFactor = 1;

  if (batteryTemperatureC < 0) temperatureFactor = 0.25;
  else if (batteryTemperatureC < 10) temperatureFactor = 0.55;
  else if (batteryTemperatureC > 45) temperatureFactor = 0.65;
  else if (batteryTemperatureC > 35) temperatureFactor = 0.85;

  const weatherFactors = {
    icy: 0.35,
    wetCold: 0.70,
    wetWarm: 0.85,
    dryCold: 0.95,
    dryHot: 0.90
  };

  const roadGradientFactors = {
    flat: 0.90,
    mixed: 1.00,
    hilly: 1.08
  };

  const weatherFactor = weatherFactors[weather] ?? 0.95;
  const roadGradientFactor = roadGradientFactors[roadGradient] ?? 1.00;

  const calculatedEfficiency =
    baseRegenEfficiencyPercent *
    temperatureFactor *
    weatherFactor *
    roadGradientFactor;

  return Math.max(0, Math.min(calculatedEfficiency, 80));
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
function updateCalculatedBatteryTemperatureInput() {
  const batteryTemperatureInput = document.getElementById('batteryTemperatureC');

  if (!batteryTemperatureInput) return;

  const input = getInputs();
  const estimatedBatteryTemperatureC = getEstimatedBatteryTemperatureC(input);

  batteryTemperatureInput.value = fmt(estimatedBatteryTemperatureC, 0);
}
function updateCalculatedRegenEfficiencyInput() {
  const regenEfficiencyInput = document.getElementById('regenEfficiencyPercent');

  if (!regenEfficiencyInput) return;

  const input = getInputs();
  const calculatedRegenEfficiencyPercent = getCalculatedRegenEfficiencyPercent(input);

  regenEfficiencyInput.value = fmt(calculatedRegenEfficiencyPercent, 0);
}
function updateAppliedAccessoryLoadInput() {
  const accessoryLoadInput = document.getElementById('assumedLoadKW');

  if (!accessoryLoadInput) return;

  const input = getInputs();

  if (!input.advancedVehicleRealismEnabled) return;

  const appliedAccessoryLoadKW = getAuxiliaryLoadKW(input);

  accessoryLoadInput.value = fmt(appliedAccessoryLoadKW, 2);
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
  const cellEnergyWh = input.nominalVoltage * input.capacityAh;
const cellContinuousDischargeCRating = input.capacityAh > 0
  ? input.continuousDischargeCurrentA / input.capacityAh
  : 0;

const moduleMaxVoltageV = input.maxVoltage * module1Series;
const moduleMinVoltageV = input.minVoltage * module1Series;
const moduleWeightKG = input.cellWeightG * moduleCellCount / 1000;
const moduleMaxDischargeCurrentA = input.maxDischargeCurrentA * module1Parallel;
const moduleContinuousDischargeCurrentA = input.continuousDischargeCurrentA * module1Parallel;
const moduleMaxChargeCurrentA = input.maxChargeCurrentA * module1Parallel;
const moduleMaxDischargePowerKW = moduleNominalVoltageV * moduleMaxDischargeCurrentA / 1000;
const moduleContinuousDischargePowerKW = moduleNominalVoltageV * moduleContinuousDischargeCurrentA / 1000;
const moduleMaxChargePowerKW = moduleNominalVoltageV * moduleMaxChargeCurrentA / 1000;

const module2MaxVoltageV = input.maxVoltage * module2Series;
const module2MinVoltageV = input.minVoltage * module2Series;
const module2WeightKG = input.cellWeightG * module2CellCount / 1000;
const module2MaxDischargeCurrentA = input.maxDischargeCurrentA * module2Parallel;
const module2ContinuousDischargeCurrentA = input.continuousDischargeCurrentA * module2Parallel;
const module2MaxChargeCurrentA = input.maxChargeCurrentA * module2Parallel;
const module2MaxDischargePowerKW = module2NominalVoltageV * module2MaxDischargeCurrentA / 1000;
const module2ContinuousDischargePowerKW = module2NominalVoltageV * module2ContinuousDischargeCurrentA / 1000;
const module2MaxChargePowerKW = module2NominalVoltageV * module2MaxChargeCurrentA / 1000;

  const totalModuleSeries =
    moduleCount1 * module1Series +
    moduleCount2 * module2Series;

  const totalCellWeightKG = (input.cellWeightG * series * parallel) / 1000.0;
  const maxDischargeCurrentA = input.maxDischargeCurrentA * parallel;
  const continuousDischargeCurrentA = input.continuousDischargeCurrentA * parallel;
  const maxChargeCurrentA = input.maxChargeCurrentA * parallel;
  const calculatedMaxRegenCurrentA = maxChargeCurrentA * 0.8;
  const calculatedBatteryTemperatureC = getEstimatedBatteryTemperatureC(input);
  const calculatedRegenEfficiencyPercent = getCalculatedRegenEfficiencyPercent(input);
  const simulationInput = {
    ...input,
    maxRegenCurrentA: calculatedMaxRegenCurrentA,
    batteryTemperatureC: calculatedBatteryTemperatureC,
    regenEfficiencyPercent: calculatedRegenEfficiencyPercent
  };

  const calculatedAuxiliaryLoadKW = getAuxiliaryLoadKW(simulationInput);
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
   ? simulateVariableCurrentRuntime(usableEnergyKWh, nominalVoltageV, simulationInput, maxDischargeCurrentA)
   : null;

 const sohRows = [100, 95, 90, 85, 80, 70].map(percentage => ({
    percentage,
    usableEnergyKWh: usableEnergyKWh * percentage / 100.0
  }));

  return {
    cellNominalVoltage: input.nominalVoltage,
cellMaxVoltage: input.maxVoltage,
cellMinVoltage: input.minVoltage,
cellCapacityAh: input.capacityAh,
cellEnergyWh,
cellMaxDischargeCurrentA: input.maxDischargeCurrentA,
cellContinuousDischargeCurrentA: input.continuousDischargeCurrentA,
cellMaxChargeCurrentA: input.maxChargeCurrentA,
cellWeightG: input.cellWeightG,
cellMaxDischargeCRating: maxDischargeCRating,
cellContinuousDischargeCRating,
cellMaxChargeCRating: maxChargeCRating,
   seriesCount: series,
parallelCount: parallel,
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
moduleMaxVoltageV,
moduleMinVoltageV,
moduleCapacityAh,
moduleEnergyKWh,
moduleCellCount,
moduleWeightKG,
moduleMaxDischargeCurrentA,
moduleContinuousDischargeCurrentA,
moduleMaxChargeCurrentA,
moduleMaxDischargePowerKW,
moduleContinuousDischargePowerKW,
moduleMaxChargePowerKW,
    hasSecondModule,
module2Config,
moduleCount2,
module2NominalVoltageV,
module2MaxVoltageV,
module2MinVoltageV,
module2CapacityAh,
module2EnergyKWh,
module2CellCount,
module2WeightKG,
module2MaxDischargeCurrentA,
module2ContinuousDischargeCurrentA,
module2MaxChargeCurrentA,
module2MaxDischargePowerKW,
module2ContinuousDischargePowerKW,
module2MaxChargePowerKW,
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
auxiliaryLoadKW: calculatedAuxiliaryLoadKW,
regenEnabled: input.regenEnabled,
maxRegenCurrentA: calculatedMaxRegenCurrentA,
regenEfficiencyPercent: calculatedRegenEfficiencyPercent,
regenDisableAboveSocPercent: input.regenDisableAboveSocPercent,
batteryTemperatureC: calculatedBatteryTemperatureC,
roadGradientProfile: input.roadGradientProfile,
airConditioningEnabled: input.airConditioningEnabled,
heatingEnabled: input.heatingEnabled,
heaterType: input.heaterType,
electricalAccessoriesEnabled: input.electricalAccessoriesEnabled,
weatherCondition: input.weatherCondition,
driverAggression: input.driverAggression,
payloadKg: input.payloadKg,

variableAverageCurrentA: variableSimulation?.averageCurrentA ?? null,
variableAveragePowerKW: variableSimulation?.averagePowerKW ?? null,
variableAverageSpeedMph: variableSimulation?.averageSpeedMph ?? null,
variableRuntimeMinutes: variableSimulation?.runtimeMinutes ?? null,
variableZeroSOCMinute: variableSimulation?.zeroSOCMinute ?? null,
variableRegenRecoveredKWh: variableSimulation?.regenRecoveredKWh ?? null,
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

  let auxiliaryLoadKW = 0;

  if (input.airConditioningEnabled) {
    auxiliaryLoadKW += 1.5;
  }

  if (input.heatingEnabled) {
    if (input.heaterType === "heatPump") {
      auxiliaryLoadKW += 0.75;
    } else {
      auxiliaryLoadKW += 2.5;
    }
  }

  if (input.electricalAccessoriesEnabled) {
    auxiliaryLoadKW += 0.5;
  }

  return auxiliaryLoadKW;
}

function getTyreRoadMultiplier(input) {
  if (!input.advancedVehicleRealismEnabled) return 1;

  const weather = input.weatherCondition || "dryWarm";

  const weatherRollingResistanceMultipliers = {
    dryWarm: 1.00,
    dryCold: 1.03,
    wetWarm: 1.05,
    wetCold: 1.10,
    icy: 1.18,
    dryHot: 1.16
  };

  return weatherRollingResistanceMultipliers[weather] ?? 1.00;
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

  return clamp(clampNumber(input.regenEfficiencyPercent, 65) / 100, 0, 0.8);
}
function calculateVehiclePowerBreakdownKW(input, speedMph, nextSpeedMph, durationSeconds, elapsedSeconds = 0, nominalVoltageV = 0) {
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

  const regenCurrentA = nominalVoltageV > 0
    ? regenPowerKW * 1000 / nominalVoltageV
    : 0;

  const temperatureMultiplier = getTemperaturePowerMultiplier(input);
  const netPowerKW = propulsionPowerKW * temperatureMultiplier - regenPowerKW;

  const finalPowerKW = clamp(netPowerKW, 0, input.driveCycle === "performance" ? 160 : 75);

  return {
    powerKW: finalPowerKW,
    propulsionPowerKW,
    regenPowerKW,
    regenCurrentA,
    rollingPowerKW,
    aeroPowerKW,
    gradientPowerKW,
    accelerationPowerKW,
    accessoryLoadKW,
    gradientPercent,
    temperatureMultiplier
  };
}

function calculateVehiclePowerKW(input, speedMph, nextSpeedMph, durationSeconds, elapsedSeconds = 0, nominalVoltageV = 0) {
  return calculateVehiclePowerBreakdownKW(
    input,
    speedMph,
    nextSpeedMph,
    durationSeconds,
    elapsedSeconds,
    nominalVoltageV
  ).powerKW;
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
let cumulativeRegenRecoveredKWh = 0;
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

const powerBreakdown = calculateVehiclePowerBreakdownKW(
  input,
  speedMph,
  nextSpeedMph,
  durationSeconds,
  elapsedSeconds,
  nominalVoltageV
);

const rawPowerKW = powerBreakdown.powerKW;
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

const regenRecoveredKWh = powerBreakdown.regenPowerKW * (durationSeconds / 3600);
cumulativeRegenRecoveredKWh += regenRecoveredKWh;

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
socPercent,

regenPowerKW: powerBreakdown.regenPowerKW,
regenCurrentA: powerBreakdown.regenCurrentA,
regenRecoveredKWh,
cumulativeRegenRecoveredKWh,

propulsionPowerKW: powerBreakdown.propulsionPowerKW,
rollingPowerKW: powerBreakdown.rollingPowerKW,
aeroPowerKW: powerBreakdown.aeroPowerKW,
gradientPowerKW: powerBreakdown.gradientPowerKW,
accelerationPowerKW: powerBreakdown.accelerationPowerKW,
accessoryLoadKW: powerBreakdown.accessoryLoadKW,
gradientPercent: powerBreakdown.gradientPercent
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
  regenRecoveredKWh: cumulativeRegenRecoveredKWh,
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
function heaterTypeLabel(value) {
  const labels = {
    resistive: "Resistive heater",
    heatPump: "Heat pump"
  };

  return labels[value] || "Resistive heater";
}
function weatherConditionLabel(value) {
  const labels = {
    dryWarm: "Dry / warm",
    dryCold: "Dry / cold",
    wetWarm: "Wet / warm",
    wetCold: "Wet / cold",
    icy: "Icy",
    dryHot: "Dry / hot"
  };

  return labels[value] || value || "Dry / warm";
}
function driverAggressionLabel(value) {
  const labels = {
    calm: "Calm",
    normal: "Normal",
    aggressive: "Aggressive"
  };

  return labels[value] || value || "Normal";
}

function valueRow(label, value) { return `<div class="value-row"><span>${label}</span><strong>${value}</strong></div>`; }
function renderResults(results) {
  document.getElementById('results').hidden = false;
  const maxRegenInput = document.getElementById('maxRegenCurrentA');
if (maxRegenInput) maxRegenInput.value = fmt(results.maxRegenCurrentA, 0);
  updateCalculatedMaxRegenCurrentInput();
  updateCalculatedBatteryTemperatureInput();
  updateCalculatedRegenEfficiencyInput();
  const batteryTemperatureInput = document.getElementById('batteryTemperatureC');
if (batteryTemperatureInput) batteryTemperatureInput.value = fmt(results.batteryTemperatureC, 0);
updateCalculatedBatteryTemperatureInput();
  const regenEfficiencyInput = document.getElementById('regenEfficiencyPercent');
if (regenEfficiencyInput) regenEfficiencyInput.value = fmt(results.regenEfficiencyPercent, 0);
updateCalculatedRegenEfficiencyInput();
document.getElementById('resultCards').innerHTML = `
  <article class="result-card"><span>⚡</span><small>Pack energy</small><strong>${fmt(results.packEnergyKWh, 2)} kWh</strong></article>
  <article class="result-card"><span>🔋</span><small>Usable energy</small><strong>${fmt(results.usableEnergyKWh, 2)} kWh</strong></article>
  <article class="result-card"><span>🔌</span><small>Nominal voltage</small><strong>${fmt(results.nominalVoltageV, 1)} V</strong></article>
  <article class="result-card"><span>▦</span><small>Cell count</small><strong>${results.numberOfCells}</strong></article>
  <article class="result-card"><span>⚖️</span><small>Cell mass</small><strong>${fmt(results.totalCellWeightKG, 2)} kg</strong></article>
  <article class="result-card"><span>🚗</span><small>Estimated range</small><strong>${results.vehicleRangeMiles !== null ? `${fmt(results.vehicleRangeMiles, 1)} miles` : 'Simulation off'}</strong></article>`;
 document.getElementById('detailedResults').innerHTML = [
  valueRow('Pack configuration', `${fmt(results.seriesCount, 0)}S${fmt(results.parallelCount, 0)}P`),
  valueRow('Pack cell count', `${fmt(results.numberOfCells, 0)} cells`),
  valueRow('Nominal voltage', `${fmt(results.nominalVoltageV, 1)} V`),
  valueRow('Voltage range', `${fmt(results.minVoltageV, 1)}–${fmt(results.maxVoltageV, 1)} V`),
  valueRow('Pack capacity', `${fmt(results.packCapacityAh, 1)} Ah`),
  valueRow('Pack energy', `${fmt(results.packEnergyKWh, 2)} kWh`),
  valueRow('Usable energy', `${fmt(results.usableEnergyKWh, 2)} kWh`),
  valueRow('Usable factor', `${fmt(results.usableEnergyFactor * 100, 0)} %`),
  valueRow('Estimated cell mass', `${fmt(results.totalCellWeightKG, 2)} kg`),
  valueRow('Max discharge', `${fmt(results.maxDischargeCurrentA, 1)} A / ${fmt(results.maxDischargePowerKW, 2)} kW`),
  valueRow('Continuous discharge', `${fmt(results.continuousDischargeCurrentA, 1)} A / ${fmt(results.continuousDischargePowerKW, 2)} kW`),
  valueRow('Max charge', `${fmt(results.maxChargeCurrentA, 1)} A / ${fmt(results.maxChargePowerKW, 2)} kW`),
  valueRow('Max discharge C-rate', `${fmt(results.maxDischargeCRating, 0)} C`),
  valueRow('Max charge C-rate', `${fmt(results.maxChargeCRating, 0)} C`)
].join('');
const cellSpecRows = document.getElementById('cellSpecRows');

if (cellSpecRows) {
 cellSpecRows.innerHTML = [
  valueRow('Nominal voltage', `${fmt(results.cellNominalVoltage, 1)} V`),
  valueRow('Max voltage', `${fmt(results.cellMaxVoltage, 1)} V`),
  valueRow('Min voltage', `${fmt(results.cellMinVoltage, 1)} V`),
  valueRow('Capacity', `${fmt(results.cellCapacityAh, 2)} Ah`),
  valueRow('Cell energy', `${fmt(results.cellEnergyWh, 2)} Wh`),
  valueRow('Max discharge', `${fmt(results.cellMaxDischargeCurrentA, 1)} A`),
  valueRow('Continuous discharge', `${fmt(results.cellContinuousDischargeCurrentA, 1)} A`),
  valueRow('Max charge', `${fmt(results.cellMaxChargeCurrentA, 1)} A`),
  valueRow('Max discharge C-rate', `${fmt(results.cellMaxDischargeCRating, 0)} C`),
  valueRow('Continuous discharge C-rate', `${fmt(results.cellContinuousDischargeCRating, 0)} C`),
  valueRow('Max charge C-rate', `${fmt(results.cellMaxChargeCRating, 0)} C`),
  valueRow('Cell weight', `${fmt(results.cellWeightG, 1)} g`)
].join('');
}  
const moduleRows = document.getElementById("moduleRows");

if (moduleRows) {
  moduleRows.innerHTML = [
    valueRow('Module configuration', results.moduleCount1
      ? `${fmt(results.moduleCount1, 0)} module${results.moduleCount1 === 1 ? "" : "s"} of ${results.moduleConfig}`
      : results.moduleConfig),
    valueRow('Nominal voltage', `${fmt(results.moduleNominalVoltageV, 1)} V`),
    valueRow('Voltage range', `${fmt(results.moduleMinVoltageV, 1)}–${fmt(results.moduleMaxVoltageV, 1)} V`),
    valueRow('Capacity', `${fmt(results.moduleCapacityAh, 1)} Ah`),
    valueRow('Energy', `${fmt(results.moduleEnergyKWh, 2)} kWh`),
    valueRow('Cells per module', `${fmt(results.moduleCellCount, 0)} cells`),
    valueRow('Estimated cell mass', `${fmt(results.moduleWeightKG, 2)} kg`),
    valueRow('Max discharge', `${fmt(results.moduleMaxDischargeCurrentA, 1)} A / ${fmt(results.moduleMaxDischargePowerKW, 2)} kW`),
    valueRow('Continuous discharge', `${fmt(results.moduleContinuousDischargeCurrentA, 1)} A / ${fmt(results.moduleContinuousDischargePowerKW, 2)} kW`),
    valueRow('Max charge', `${fmt(results.moduleMaxChargeCurrentA, 1)} A / ${fmt(results.moduleMaxChargePowerKW, 2)} kW`)
  ].join('');
}

const secondModuleResultsEl = document.getElementById("secondModuleResults");
const secondModuleRows = document.getElementById("secondModuleRows");

if (secondModuleResultsEl) {
  secondModuleResultsEl.hidden = !results.hasSecondModule;
}

if (results.hasSecondModule && secondModuleRows) {
  secondModuleRows.innerHTML = [
    valueRow('Module configuration', results.moduleCount2
      ? `${fmt(results.moduleCount2, 0)} module${results.moduleCount2 === 1 ? "" : "s"} of ${results.module2Config}`
      : results.module2Config),
    valueRow('Nominal voltage', `${fmt(results.module2NominalVoltageV, 1)} V`),
    valueRow('Voltage range', `${fmt(results.module2MinVoltageV, 1)}–${fmt(results.module2MaxVoltageV, 1)} V`),
    valueRow('Capacity', `${fmt(results.module2CapacityAh, 1)} Ah`),
    valueRow('Energy', `${fmt(results.module2EnergyKWh, 2)} kWh`),
    valueRow('Cells per module', `${fmt(results.module2CellCount, 0)} cells`),
    valueRow('Estimated cell mass', `${fmt(results.module2WeightKG, 2)} kg`),
    valueRow('Max discharge', `${fmt(results.module2MaxDischargeCurrentA, 1)} A / ${fmt(results.module2MaxDischargePowerKW, 2)} kW`),
    valueRow('Continuous discharge', `${fmt(results.module2ContinuousDischargeCurrentA, 1)} A / ${fmt(results.module2ContinuousDischargePowerKW, 2)} kW`),
    valueRow('Max charge', `${fmt(results.module2MaxChargeCurrentA, 1)} A / ${fmt(results.module2MaxChargePowerKW, 2)} kW`)
  ].join('');
} else if (secondModuleRows) {
  secondModuleRows.innerHTML = "";
}
  
document.getElementById('sohRows').innerHTML = results.sohRows.map(row => `<div class="soh-row"><div><span>${row.percentage}% SOH</span><strong>${fmt(row.usableEnergyKWh, 2)} kWh</strong></div><progress value="${row.percentage}" max="100"></progress></div>`).join('');

let runtime = valueRow('Pack linear discharge runtime', `${fmt(results.runtimeAtContinuousDischargeMinutes, 1)} min`);

if (results.variableSimulationEnabled && results.variableAveragePowerKW !== null) {
  runtime += '<hr>'
    + valueRow('Vehicle average power', `${fmt(results.variableAveragePowerKW, 2)} kW`)
    + valueRow('Vehicle average current', `${fmt(results.variableAverageCurrentA, 1)} A`)
    + valueRow('Vehicle runtime', `${fmt(results.variableRuntimeMinutes, 1)} min`)
    + valueRow('Estimated time to 0% SOC', `${fmt(results.variableZeroSOCMinute, 0)} min`)
    + valueRow('Estimated range', results.vehicleRangeMiles !== null ? `${fmt(results.vehicleRangeMiles, 1)} miles` : '—')
    + valueRow('Average simulated speed', `${fmt(results.variableAverageSpeedMph, 1)} mph`)
    + valueRow('Consumption', results.vehicleConsumptionKWhPer100Miles !== null ? `${fmt(results.vehicleConsumptionKWhPer100Miles, 1)} kWh / 100 miles` : '—')
    + valueRow('Efficiency', results.vehicleConsumptionMilesPerKWh !== null ? `${fmt(results.vehicleConsumptionMilesPerKWh, 2)} miles / kWh` : '—')
    + valueRow('Regen recovered', results.variableRegenRecoveredKWh !== null ? `${fmt(results.variableRegenRecoveredKWh, 2)} kWh` : '—')
    + `<p class="muted range-note">Vehicle results are calculated from the simulated 30-minute drive cycle, measured simulation energy use, and usable pack energy.</p>`;
} else {
  runtime += `<p class="muted">Tick Vehicle runtime simulation to calculate current draw from vehicle weight, speed, drag, rolling resistance and drivetrain efficiency.</p>`;
}

const runtimeRows =
  document.getElementById('runtimeRows') ||
  document.getElementById('runtimeEstimates');

if (runtimeRows) {
  runtimeRows.innerHTML = runtime;
}
 const vehicleRangeSection = document.getElementById('vehicleRangeSection');
const vehicleRangeRows = document.getElementById('vehicleRangeRows');

if (vehicleRangeSection && vehicleRangeRows) {
  vehicleRangeSection.hidden = true;
  vehicleRangeRows.innerHTML = "";
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
      + valueRow('Accessory load', `${fmt(results.auxiliaryLoadKW, 2)} kW`);

    if (results.advancedVehicleRealismEnabled) {
      settings += '<hr>'
        + valueRow('Advanced realism', 'Enabled')
        + valueRow('Regenerative braking', yesNo(results.regenEnabled))
        + valueRow('Calculated max regen current', `${fmt(results.maxRegenCurrentA, 0)} A`)
        + valueRow('Regen efficiency', `${fmt(results.regenEfficiencyPercent, 0)} %`)
        + valueRow('Regen disabled above SOC', `${fmt(results.regenDisableAboveSocPercent, 0)} %`)
        + valueRow('Battery temperature', `${fmt(results.batteryTemperatureC, 0)} °C`)
        + valueRow('Road gradient', roadGradientLabel(results.roadGradientProfile))
        + valueRow('Air conditioning', yesNo(results.airConditioningEnabled))
        + valueRow('Heating', yesNo(results.heatingEnabled))
        + valueRow('Heater type', results.heatingEnabled ? heaterTypeLabel(results.heaterType) : "Off")
        + valueRow('Head lights / wipers / radio', yesNo(results.electricalAccessoriesEnabled))
        + valueRow('Weather conditions', weatherConditionLabel(results.weatherCondition))
        + valueRow('Driver aggression', driverAggressionLabel(results.driverAggression))
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
  if (profileTitle) profileTitle.textContent = 'Vehicle Energy Simulation';

  const animateBtn = document.getElementById('animateBtn');
  if (animateBtn) animateBtn.textContent = 'Show simulation';

  const chartStats = document.getElementById('chartStats');
  if (chartStats) {
    chartStats.textContent = 'Press Show simulation to replay the simulated drive cycle.';
  }

  const timeEl = document.getElementById('liveTimeValue');
  const currentEl = document.getElementById('liveCurrentValue');
  const styleEl = document.getElementById('liveDriveStyleValue');

  if (timeEl) timeEl.textContent = '0:00';
  if (currentEl) currentEl.textContent = '0 A';
  if (styleEl) styleEl.textContent = 'Ready';
} else {
  simSection.hidden = true;
}
}

function driveStyleLabel(mode) {
  return mode || 'Driving';
}
function updateDriverLiveData(row) {
  if (!row) return;

  const timeEl = document.getElementById('liveTimeValue');
  const currentEl = document.getElementById('liveCurrentValue');
  const regenCurrentEl = document.getElementById('liveRegenCurrentValue');
  const speedEl = document.getElementById('liveSpeedValue');
  const socEl = document.getElementById('liveSocValue');
  const energyUsedEl = document.getElementById('liveEnergyUsedValue');
  const regenRecoveredEl = document.getElementById('liveRegenRecoveredValue');
  const styleEl = document.getElementById('liveDriveStyleValue');

  if (timeEl) {
    const totalSeconds = Math.round((row.minute || 0) * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = String(totalSeconds % 60).padStart(2, '0');
    timeEl.textContent = `${mins}:${secs}`;
  }

  if (currentEl) {
    currentEl.textContent = `${fmt(row.averageCurrentA || 0, 0)} A`;
  }

  if (regenCurrentEl) {
    regenCurrentEl.textContent = `${fmt(row.regenCurrentA || 0, 0)} A`;
  }

  if (speedEl) {
    speedEl.textContent = `${fmt(row.speedMph || 0, 0)} mph`;
  }

  if (socEl) {
    socEl.textContent = `${fmt(row.socPercent || 0, 0)} %`;
  }

  if (energyUsedEl) {
    energyUsedEl.textContent = `${fmt(row.cumulativeEnergyUsedKWh || 0, 2)} kWh`;
  }

  if (regenRecoveredEl) {
    regenRecoveredEl.textContent = `${fmt(row.cumulativeRegenRecoveredKWh || 0, 2)} kWh`;
  }

  if (styleEl) {
    styleEl.textContent = driveStyleLabel(row.driveMode);
  }
}
 
function drawChart(rows, count = rows.length) {
  const canvas = document.getElementById('currentChart');
  if (!canvas || !rows?.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  const w = Math.max(300, rect.width);
  const h = Math.max(260, rect.height);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const visible = rows.slice(0, Math.max(1, count));

  const pad = {
    left: 62,
    right: 62,
    top: 34,
    bottom: 48
  };

  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const maxDischargeA = Math.max(...rows.map(r => r.averageCurrentA || 0), 1);
  const maxRegenA = Math.max(...rows.map(r => r.regenCurrentA || 0), 1);
  const currentScaleMax = Math.ceil(Math.max(maxDischargeA, maxRegenA) / 25) * 25;

  const maxSpeedMph = Math.max(...rows.map(r => r.speedMph || 0), 1);
  const speedScaleMax = Math.ceil(maxSpeedMph / 10) * 10;

  const zeroY = pad.top + chartH / 2;

  const x = (index) => {
    return pad.left + (index / Math.max(rows.length - 1, 1)) * chartW;
  };

  const yCurrent = (amps) => {
    const halfHeight = chartH / 2;
    return zeroY - (amps / Math.max(currentScaleMax, 1)) * halfHeight;
  };

  const ySpeed = (mph) => {
    return pad.top + (1 - (mph / Math.max(speedScaleMax, 1))) * chartH;
  };

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 1;
  ctx.font = '12px system-ui';

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;

    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText('0 A', 16, zeroY + 4);
  ctx.fillText(`+${fmt(currentScaleMax, 0)} A`, 10, pad.top + 4);
  ctx.fillText(`-${fmt(currentScaleMax, 0)} A`, 10, h - pad.bottom + 4);

  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, h - pad.bottom);
  ctx.lineTo(w - pad.right, h - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.fillText('0 min', pad.left, h - 16);
  ctx.fillText('30 min', w - pad.right - 42, h - 16);

  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.fillText(`${Math.round(speedScaleMax)} mph`, w - pad.right + 10, pad.top + 4);
  ctx.fillText('0 mph', w - pad.right + 10, h - pad.bottom + 4);

  ctx.fillStyle = 'rgba(71,221,255,.10)';
  ctx.beginPath();
  ctx.moveTo(x(0), zeroY);

  visible.forEach((row, index) => {
    const px = x(index);
    const py = yCurrent(-(row.regenCurrentA || 0));
    ctx.lineTo(px, py);
  });

  ctx.lineTo(x(visible.length - 1), zeroY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,.34)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  visible.forEach((row, index) => {
    const px = x(index);
    const py = ySpeed(row.speedMph || 0);

    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  ctx.stroke();

  ctx.strokeStyle = '#8df0ff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  visible.forEach((row, index) => {
    const px = x(index);
    const py = yCurrent(-(row.regenCurrentA || 0));

    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  ctx.stroke();

  ctx.strokeStyle = '#3fe875';
  ctx.lineWidth = 3;
  ctx.beginPath();

  visible.forEach((row, index) => {
    const px = x(index);
    const py = yCurrent(row.averageCurrentA || 0);

    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  ctx.stroke();

  ctx.fillStyle = '#3fe875';
  ctx.font = 'bold 13px system-ui';
  ctx.fillText('Discharge current', pad.left, 20);

  ctx.fillStyle = '#8df0ff';
  ctx.fillText('Regen current', pad.left + 150, 20);

  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText('Speed profile', pad.left + 275, 20);

  const last = visible[visible.length - 1];
  const lastIndex = visible.length - 1;
  const lastX = x(lastIndex);
  const lastCurrentY = yCurrent(last.averageCurrentA || 0);
  const lastRegenY = yCurrent(-(last.regenCurrentA || 0));

  ctx.fillStyle = '#d7ffe2';
  ctx.beginPath();
  ctx.arc(lastX, lastCurrentY, 5, 0, Math.PI * 2);
  ctx.fill();

  if ((last.regenCurrentA || 0) > 0.1) {
    ctx.fillStyle = '#8df0ff';
    ctx.beginPath();
    ctx.arc(lastX, lastRegenY, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  updateDriverLiveData(last);

  const chartStats = document.getElementById('chartStats');
  if (chartStats) {
    const totalRegenKWh = last.cumulativeRegenRecoveredKWh || 0;

    chartStats.textContent =
      `Vehicle energy simulation • green = discharge • blue = regen below zero • grey = speed • recovered ${fmt(totalRegenKWh, 2)} kWh`;
  }
}
function animateChart() {
  if (!lastResults?.variableSimulationRows?.length) return;
  const animateBtn = document.getElementById('animateBtn');
if (animateBtn) animateBtn.textContent = 'Replay simulation';
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

function toggleDesignRequirementsOptions() {
  const enabled = document.getElementById('designRequirementsEnabled')?.checked || false;
  const designRequirementInputs = document.getElementById('designRequirementInputs');

  if (designRequirementInputs) {
    designRequirementInputs.hidden = !enabled;
  }
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

  document.body.classList.remove('mobile-results-menu-open', 'mobile-results-section-open');

  if (window.showMobileInputMenu) {
    window.showMobileInputMenu();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function animateToResultsPage() {
  const calculatorPage = document.getElementById('calculatorPage');
  const resultsPage = document.getElementById('resultsPage');

  if (!calculatorPage || !resultsPage) {
    showResultsPage();
    return;
  }

  cancelAnimationFrame(animationFrame);

  calculatorPage.classList.remove('page-spin-in', 'page-spin-out');
  resultsPage.classList.remove('page-spin-in', 'page-spin-out');

  resultsPage.hidden = true;
  calculatorPage.hidden = false;

  void calculatorPage.offsetWidth;

  calculatorPage.classList.add('page-spin-out');

  window.setTimeout(() => {
    calculatorPage.hidden = true;
    calculatorPage.classList.remove('page-spin-out');

    resultsPage.hidden = false;
    resultsPage.classList.add('page-spin-in');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    window.setTimeout(() => {
      resultsPage.classList.remove('page-spin-in');
    }, 900);
  }, 850);
}
async function downloadSpecSheetPdf() {
  if (!lastResults) {
    alert("Please calculate the battery pack first.");
    return;
  }

  const cellManufacturerInput = window.prompt(
    "Enter cell manufacturer for the PDF.\n\nLeave blank or press Cancel to ignore."
  );

  const cellManufacturer = cellManufacturerInput && cellManufacturerInput.trim()
    ? cellManufacturerInput.trim()
    : "";

  const cellModelInput = window.prompt(
    "Enter cell model number for the PDF.\n\nLeave blank or press Cancel to ignore."
  );

  const cellModel = cellModelInput && cellModelInput.trim()
    ? cellModelInput.trim()
    : "";

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library has not loaded yet. Please refresh and try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const columnGap = 8;
  const columnWidth = (contentWidth - columnGap) / 2;

  const black = [20, 20, 20];
  const darkGrey = [80, 80, 80];
  const lightGrey = [245, 245, 245];
  const borderGrey = [205, 205, 205];

  let y = 62;

  function fmtSafe(value, suffix = "", decimals = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "N/A";
    }

    return `${fmt(number, decimals)}${suffix}`;
  }

  function textSafe(value) {
    return value === undefined || value === null || value === "" ? "N/A" : String(value);
  }

  async function getImageDataUrl(src) {
    try {
      const response = await fetch(src);
      const blob = await response.blob();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function addHeader() {
    const today = new Date().toLocaleDateString("en-GB");

    doc.setTextColor(...black);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(today, pageWidth - margin, 12, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Calculated Battery Specification", pageWidth / 2, 40, { align: "center" });

    doc.setDrawColor(...black);
    doc.setLineWidth(0.3);
    doc.line(margin, 54, pageWidth - margin, 54);
  }

 function addFooter() {
  doc.setDrawColor(...black);
  doc.setLineWidth(0.25);
  doc.line(margin + 20, pageHeight - 10, pageWidth - margin - 20, pageHeight - 10);

  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  doc.text("www.voltenergysystems.co.uk", pageWidth / 2, pageHeight - 5, { align: "center" });
}

  async function addLogo() {
    const logo = await getImageDataUrl("assets/pdf-logo.png");

    if (logo) {
      doc.addImage(logo, "PNG", pageWidth / 2 - 38, 6, 76, 17);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("VOLT ENERGY SYSTEMS", pageWidth / 2, 20, { align: "center" });
    }
  }

  function addSectionBox(title, rows, x, boxY, width) {
    const rowHeight = 5.2;
    const headerHeight = 7.5;
    const boxHeight = headerHeight + rows.length * rowHeight + 4;

    doc.setDrawColor(...borderGrey);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, boxY, width, boxHeight, 2, 2, "FD");

    doc.setFillColor(...lightGrey);
    doc.rect(x, boxY, width, headerHeight, "F");

    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, x + 3, boxY + 6);

    let rowY = boxY + headerHeight + 5;

    rows.forEach(([label, value]) => {
      doc.setDrawColor(230, 230, 230);
      doc.line(x + 3, rowY + 2, x + width - 3, rowY + 2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGrey);
      doc.setFontSize(7.2);
      doc.text(String(label), x + 3, rowY);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...black);
      doc.text(String(value), x + width - 3, rowY, { align: "right" });

      rowY += rowHeight;
    });

    return boxHeight;
  }

 

  await addLogo();
  addHeader();

  const packOverviewRows = [
    ["Pack configuration", `${lastResults.seriesCount}S${lastResults.parallelCount}P`],
    ["Total cell count", fmtSafe(lastResults.numberOfCells, "", 0)],
    ["Nominal voltage", fmtSafe(lastResults.nominalVoltageV, " V", 1)],
    ["Maximum voltage", fmtSafe(lastResults.maxVoltageV, " V", 1)],
    ["Minimum voltage", fmtSafe(lastResults.minVoltageV, " V", 1)],
    ["Pack capacity", fmtSafe(lastResults.packCapacityAh, " Ah", 1)],
    ["Pack energy", fmtSafe(lastResults.packEnergyKWh, " kWh", 2)],
    ["Usable energy", fmtSafe(lastResults.usableEnergyKWh, " kWh", 2)],
    ["Estimated cell mass", fmtSafe(lastResults.totalCellWeightKG, " kg", 1)]
  ];

  const powerLimitRows = [
    ["Maximum discharge current", fmtSafe(lastResults.maxDischargeCurrentA, " A", 0)],
    ["Continuous discharge current", fmtSafe(lastResults.continuousDischargeCurrentA, " A", 0)],
    ["Maximum charge current", fmtSafe(lastResults.maxChargeCurrentA, " A", 0)],
    ["Maximum discharge power", fmtSafe(lastResults.maxDischargePowerKW, " kW", 1)],
    ["Continuous discharge power", fmtSafe(lastResults.continuousDischargePowerKW, " kW", 1)],
    ["Maximum charge power", fmtSafe(lastResults.maxChargePowerKW, " kW", 1)]
  ];

  const cellSpecRows = [
    ...(cellManufacturer ? [["Cell manufacturer", cellManufacturer]] : []),
    ...(cellModel ? [["Cell model number", cellModel]] : []),
    ["Nominal cell voltage", fmtSafe(lastResults.cellNominalVoltage, " V", 2)],
    ["Maximum cell voltage", fmtSafe(lastResults.cellMaxVoltage, " V", 2)],
    ["Minimum cell voltage", fmtSafe(lastResults.cellMinVoltage, " V", 2)],
    ["Cell capacity", fmtSafe(lastResults.cellCapacityAh, " Ah", 2)],
    ["Cell energy", fmtSafe(lastResults.cellEnergyWh, " Wh", 2)],
    ["Maximum discharge current", fmtSafe(lastResults.cellMaxDischargeCurrentA, " A", 1)],
    ["Continuous discharge current", fmtSafe(lastResults.cellContinuousDischargeCurrentA, " A", 1)],
    ["Maximum charge current", fmtSafe(lastResults.cellMaxChargeCurrentA, " A", 1)],
    ["Cell weight", fmtSafe(lastResults.cellWeightG, " g", 1)]
  ];

  const module1Rows = [
    ["Module configuration", textSafe(lastResults.moduleConfig)],
    ["Module count", fmtSafe(lastResults.moduleCount1, "", 0)],
    ["Module cell count", fmtSafe(lastResults.moduleCellCount, "", 0)],
    ["Module nominal voltage", fmtSafe(lastResults.moduleNominalVoltageV, " V", 1)],
    ["Module voltage range", `${fmtSafe(lastResults.moduleMinVoltageV, " V", 1)} to ${fmtSafe(lastResults.moduleMaxVoltageV, " V", 1)}`],
    ["Module capacity", fmtSafe(lastResults.moduleCapacityAh, " Ah", 1)],
    ["Module energy", fmtSafe(lastResults.moduleEnergyKWh, " kWh", 2)],
    ["Module mass", fmtSafe(lastResults.moduleWeightKG, " kg", 1)],
    ["Module maximum discharge", fmtSafe(lastResults.moduleMaxDischargeCurrentA, " A", 0)],
    ["Module continuous discharge", fmtSafe(lastResults.moduleContinuousDischargeCurrentA, " A", 0)],
    ["Module maximum charge", fmtSafe(lastResults.moduleMaxChargeCurrentA, " A", 0)]
  ];

  const module2Rows = [
    ["Module configuration", textSafe(lastResults.module2Config)],
    ["Module count", fmtSafe(lastResults.moduleCount2, "", 0)],
    ["Module cell count", fmtSafe(lastResults.module2CellCount, "", 0)],
    ["Module nominal voltage", fmtSafe(lastResults.module2NominalVoltageV, " V", 1)],
    ["Module voltage range", `${fmtSafe(lastResults.module2MinVoltageV, " V", 1)} to ${fmtSafe(lastResults.module2MaxVoltageV, " V", 1)}`],
    ["Module capacity", fmtSafe(lastResults.module2CapacityAh, " Ah", 1)],
    ["Module energy", fmtSafe(lastResults.module2EnergyKWh, " kWh", 2)],
    ["Module mass", fmtSafe(lastResults.module2WeightKG, " kg", 1)],
    ["Module maximum discharge", fmtSafe(lastResults.module2MaxDischargeCurrentA, " A", 0)],
    ["Module continuous discharge", fmtSafe(lastResults.module2ContinuousDischargeCurrentA, " A", 0)],
    ["Module maximum charge", fmtSafe(lastResults.module2MaxChargeCurrentA, " A", 0)]
  ];

 const leftX = margin;
const rightX = margin + columnWidth + columnGap;
const centerX = margin + (contentWidth - columnWidth) / 2;

const topY = 62;

/* Top row */
const packOverviewHeight = addSectionBox("Pack Overview", packOverviewRows, leftX, topY, columnWidth);
const powerLimitsHeight = addSectionBox("Pack Current & Power Limits", powerLimitRows, rightX, topY, columnWidth);

/* Middle centred cell spec */
const cellY = topY + Math.max(packOverviewHeight, powerLimitsHeight) + 6;
const cellHeight = addSectionBox("Cell Specification", cellSpecRows, centerX, cellY, columnWidth);

/* Bottom module row */
const moduleY = cellY + cellHeight + 6;

if (lastResults.hasSecondModule) {
  addSectionBox("Module 1 Specification", module1Rows, leftX, moduleY, columnWidth);
  addSectionBox("Module 2 Specification", module2Rows, rightX, moduleY, columnWidth);
} else {
  addSectionBox("Module 1 Specification", module1Rows, centerX, moduleY, columnWidth);
}

addFooter();

doc.save("battery-pack-specification.pdf");
}
function handleCalculate(event) {
  event?.preventDefault();

  try {
    const inputs = getInputs();
    saveInputs(inputs);

    lastResults = calculate(inputs);

    animateToResultsPage();

window.setTimeout(() => {
  renderResults(lastResults);

  if (window.showMobileResultsMenu) {
    window.showMobileResultsMenu();
  }
}, 900);
  } catch (error) {
    alert("Calculation error: " + error.message);
    console.error(error);
  }
}
function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  setInputs({ ...DEFAULT_INPUTS });
  lastResults = null;
  showCalculatorPage();
}
function refreshResultsIfVisible() {
  const resultsPage = document.getElementById('resultsPage');

  if (!resultsPage || resultsPage.hidden) return;

  const inputs = getInputs();
  lastResults = calculate(inputs);
  renderResults(lastResults);
}
function init() {
  setInputs(loadInputs());
  updateModuleConfigurationOptions();

  document.getElementById('calculatorForm').addEventListener('submit', handleCalculate);
  document.getElementById('resetBtn')?.addEventListener('click', resetAll);
  document.getElementById('backBtn').addEventListener('click', showCalculatorPage);
  document.getElementById('downloadPdfBtn')?.addEventListener('click', downloadSpecSheetPdf);
  document.getElementById('variableCurrentSimulationEnabled').addEventListener('change', toggleSimulationOptions);
  document.getElementById('advancedVehicleRealismEnabled')?.addEventListener('change', () => {
  document.getElementById('designRequirementsEnabled')?.addEventListener('change', () => {
  toggleDesignRequirementsOptions();
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
updateCalculatedBatteryTemperatureInput();
updateCalculatedRegenEfficiencyInput();
updateAppliedAccessoryLoadInput();
refreshResultsIfVisible();
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
updateCalculatedBatteryTemperatureInput();
updateCalculatedRegenEfficiencyInput();
updateAppliedAccessoryLoadInput();
refreshResultsIfVisible();
  });
}

updateCalculatedMaxRegenCurrentInput();
updateCalculatedBatteryTemperatureInput();
updateCalculatedRegenEfficiencyInput();
updateAppliedAccessoryLoadInput();
refreshResultsIfVisible();
initMobileInputSections();
initMobileResultSections();

window.addEventListener('orientationchange', handleMobileGraphOrientation);
window.addEventListener('resize', handleMobileGraphOrientation);

document.getElementById('calculatorPage').hidden = false;
  document.getElementById('resultsPage').hidden = true;
  hideLoading();
}
function initMobileInputSections() {
  const menu = document.getElementById('mobileInputMenu');
  const toolbar = document.getElementById('mobileInputToolbar');
  const backBtn = document.getElementById('mobileInputBack');
  const title = document.getElementById('mobileInputTitle');

  const sections = [
    { id: 'inputCellData', title: 'Cell Data' },
    { id: 'inputPackLayout', title: 'Pack Layout' },
    { id: 'inputDesignRequirements', title: 'Design Requirements' },
    { id: 'inputVehicleSimulation', title: 'Vehicle Simulation' }
  ];

  const mobileQuery = window.matchMedia('(max-width: 950px), (pointer: coarse)')

  function showMenu() {
    if (!mobileQuery.matches) {
      document.body.classList.remove('mobile-input-menu-open', 'mobile-input-section-open');
      if (menu) menu.hidden = true;
      if (toolbar) toolbar.hidden = true;
      sections.forEach(section => {
        const el = document.getElementById(section.id);
        if (el) el.hidden = false;
      });
      return;
    }

    document.body.classList.add('mobile-input-menu-open');
    document.body.classList.remove('mobile-input-section-open');

    if (menu) menu.hidden = false;
    if (toolbar) toolbar.hidden = true;

    sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) el.hidden = true;
    });
  }

  function showSection(sectionId) {
    const selected = sections.find(section => section.id === sectionId);

    document.body.classList.remove('mobile-input-menu-open');
    document.body.classList.add('mobile-input-section-open');

    if (menu) menu.hidden = true;
    if (toolbar) toolbar.hidden = false;
    if (title) title.textContent = selected?.title || 'Section';

    sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) el.hidden = section.id !== sectionId;
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-open-input]').forEach(button => {
    button.addEventListener('click', () => {
      showSection(button.dataset.openInput);
    });
  });

  if (backBtn) {
    backBtn.addEventListener('click', showMenu);
  }

  mobileQuery.addEventListener('change', showMenu);
  showMenu();

  window.showMobileInputMenu = showMenu;
}
function openMobileGraphExperience() {
  if (!lastResults?.variableSimulationRows?.length) {
    alert("Enable Vehicle energy simulation and calculate again before viewing the simulation graph.");

    if (window.showMobileResultsMenu) {
      window.showMobileResultsMenu();
    }

    return;
  }

  const graphSection = document.getElementById('simulationSection');

  mobileGraphExperienceActive = true;
  mobileGraphHasPlayed = false;

  document.body.classList.add('mobile-graph-experience');

  if (graphSection) {
    graphSection.hidden = false;
  }

  handleMobileGraphOrientation();
}

function closeMobileGraphExperience(returnToResultsMenu = true) {
  const message = document.getElementById('rotatePhoneMessage');

  stopMobileGraphLoop();

  mobileGraphExperienceActive = false;
  mobileGraphHasPlayed = false;

  document.body.classList.remove(
    'mobile-graph-experience',
    'mobile-graph-rotate',
    'mobile-graph-landscape'
  );

  if (message) {
    message.hidden = true;
  }

  if (returnToResultsMenu && window.showMobileResultsMenu) {
    window.showMobileResultsMenu();
  }
}

function startMobileGraphLoop() {
  if (!lastResults?.variableSimulationRows?.length) return;

  stopMobileGraphLoop();

  mobileGraphLoopActive = true;
  chartPointCount = 1;

  let lastTime = 0;
  let endPauseStart = null;

  function step(timestamp) {
    if (!mobileGraphLoopActive) return;

    const rows = lastResults?.variableSimulationRows || [];

    if (!rows.length) {
      stopMobileGraphLoop();
      return;
    }

    if (timestamp - lastTime > CHART_ANIMATION_DELAY_MS) {
      if (chartPointCount >= rows.length) {
        if (!endPauseStart) {
          endPauseStart = timestamp;
        }

        if (timestamp - endPauseStart > 900) {
          chartPointCount = 1;
          endPauseStart = null;
        }
      } else {
        chartPointCount += 1;
      }

      drawChart(rows, chartPointCount);
      lastTime = timestamp;
    }

    animationFrame = requestAnimationFrame(step);
  }

  animationFrame = requestAnimationFrame(step);
}

function stopMobileGraphLoop() {
  mobileGraphLoopActive = false;
  cancelAnimationFrame(animationFrame);
}

function moveGraphIntoFullscreenOverlay() {
  const stage = document.getElementById('graphFullscreenStage');
  const chart = document.getElementById('currentChart');
  const driverLive = document.getElementById('driverLive');

  if (!stage || !chart || !driverLive) return;

  if (!chartPlaceholder) {
    chartPlaceholder = document.createComment('currentChart original position');
    chart.parentNode.insertBefore(chartPlaceholder, chart);
  }

  if (!driverLivePlaceholder) {
    driverLivePlaceholder = document.createComment('driverLive original position');
    driverLive.parentNode.insertBefore(driverLivePlaceholder, driverLive);
  }

  stage.appendChild(chart);
  stage.appendChild(driverLive);
}

function moveGraphBackToResultsCard() {
  const chart = document.getElementById('currentChart');
  const driverLive = document.getElementById('driverLive');

  if (chartPlaceholder?.parentNode && chart) {
    chartPlaceholder.parentNode.insertBefore(chart, chartPlaceholder);
  }

  if (driverLivePlaceholder?.parentNode && driverLive) {
    driverLivePlaceholder.parentNode.insertBefore(driverLive, driverLivePlaceholder);
  }
}

function openMobileGraphExperience() {
  if (!lastResults?.variableSimulationRows?.length) {
    alert("Enable Vehicle energy simulation and calculate again before viewing the simulation graph.");

    if (window.showMobileResultsMenu) {
      window.showMobileResultsMenu();
    }

    return;
  }

  mobileGraphExperienceActive = true;
  mobileGraphHasPlayed = false;

  document.body.classList.add('mobile-graph-overlay-active');

  const overlay = document.getElementById('graphFullscreenOverlay');
  if (overlay) overlay.hidden = false;

  handleMobileGraphOrientation();
}

function closeMobileGraphExperience(returnToResultsMenu = true) {
  const overlay = document.getElementById('graphFullscreenOverlay');
  const prompt = document.getElementById('graphRotatePrompt');
  const stage = document.getElementById('graphFullscreenStage');

  stopMobileGraphLoop();
  moveGraphBackToResultsCard();

  mobileGraphExperienceActive = false;
  mobileGraphHasPlayed = false;

  document.body.classList.remove('mobile-graph-overlay-active');

  if (overlay) overlay.hidden = true;
  if (prompt) prompt.hidden = false;
  if (stage) stage.hidden = true;

  if (returnToResultsMenu && window.showMobileResultsMenu) {
    window.showMobileResultsMenu();
  }
}

function startMobileGraphLoop() {
  if (!lastResults?.variableSimulationRows?.length) return;

  stopMobileGraphLoop();

  mobileGraphLoopActive = true;
  chartPointCount = 1;

  let lastTime = 0;
  let endPauseStarted = null;

  function step(timestamp) {
    if (!mobileGraphLoopActive) return;

    const rows = lastResults?.variableSimulationRows || [];

    if (!rows.length) {
      stopMobileGraphLoop();
      return;
    }

    if (timestamp - lastTime > CHART_ANIMATION_DELAY_MS) {
      if (chartPointCount >= rows.length) {
        if (!endPauseStarted) {
          endPauseStarted = timestamp;
        }

        if (timestamp - endPauseStarted > 900) {
          chartPointCount = 1;
          endPauseStarted = null;
        }
      } else {
        chartPointCount += 1;
      }

      drawChart(rows, chartPointCount);
      lastTime = timestamp;
    }

    animationFrame = requestAnimationFrame(step);
  }

  animationFrame = requestAnimationFrame(step);
}

function stopMobileGraphLoop() {
  mobileGraphLoopActive = false;
  cancelAnimationFrame(animationFrame);
}

function handleMobileGraphOrientation() {
  if (!mobileGraphExperienceActive) return;

  const overlay = document.getElementById('graphFullscreenOverlay');
  const prompt = document.getElementById('graphRotatePrompt');
  const stage = document.getElementById('graphFullscreenStage');

  if (!overlay || !prompt || !stage) return;

  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  const isMobile = window.matchMedia('(max-width: 950px), (pointer: coarse)').matches;

  if (!isMobile) {
    closeMobileGraphExperience(true);
    return;
  }

  overlay.hidden = false;

  if (isLandscape) {
    mobileGraphHasPlayed = true;

    prompt.hidden = true;
    stage.hidden = false;

    moveGraphIntoFullscreenOverlay();

    window.setTimeout(() => {
      drawChart(lastResults.variableSimulationRows, 1);
      startMobileGraphLoop();
    }, 200);

    return;
  }

  stopMobileGraphLoop();

  if (mobileGraphHasPlayed) {
    closeMobileGraphExperience(true);
    return;
  }

  moveGraphBackToResultsCard();

  prompt.hidden = false;
  stage.hidden = true;
}
function initMobileResultSections() {
  const menu = document.getElementById('mobileResultsMenu');
  const toolbar = document.getElementById('mobileResultsToolbar');
  const backBtn = document.getElementById('mobileResultsBack');
  const title = document.getElementById('mobileResultsTitle');

  const sections = [
    { id: 'overviewResults', title: 'Overview' },
    { id: 'cellSpec', title: 'Cell Specification' },
    { id: 'modules', title: 'Modules' },
    { id: 'packResults', title: 'Pack Results' },
    { id: 'sohResults', title: 'Usable Energy vs SOH' },
    { id: 'vehicleResults', title: 'Vehicle Results' },
    { id: 'simulationGraph', title: 'Simulation Graph' },
    { id: 'simulationSettings', title: 'Simulation Settings' }
  ];

  const mobileQuery = window.matchMedia('(max-width: 950px), (pointer: coarse)')

  function allResultSections() {
    return [...document.querySelectorAll('.mobile-result-section')];
  }

  function showMenu() {
    if (mobileGraphExperienceActive) {
  closeMobileGraphExperience(false);
}
    if (!mobileQuery.matches) {
      document.body.classList.remove('mobile-results-menu-open', 'mobile-results-section-open');

      if (menu) menu.hidden = true;
      if (toolbar) toolbar.hidden = true;

      allResultSections().forEach(section => {
        section.hidden = section.id === 'secondModuleResults' && !(lastResults?.hasSecondModule);
      });

      return;
    }

    document.body.classList.add('mobile-results-menu-open');
    document.body.classList.remove('mobile-results-section-open');

    if (menu) menu.hidden = false;
    if (toolbar) toolbar.hidden = true;

    allResultSections().forEach(section => {
      section.hidden = true;
    });
  }

  function showSection(sectionId) {
    const selected = sections.find(section => section.id === sectionId);

    document.body.classList.remove('mobile-results-menu-open');
    document.body.classList.add('mobile-results-section-open');

    if (menu) menu.hidden = true;
    if (toolbar) toolbar.hidden = false;
    if (title) title.textContent = selected?.title || 'Results';

    allResultSections().forEach(section => {
      const isSelected = section.dataset.resultSection === sectionId;

      if (section.id === 'secondModuleResults' && !(lastResults?.hasSecondModule)) {
        section.hidden = true;
      } else {
        section.hidden = !isSelected;
      }
    });
if (sectionId === 'simulationGraph') {
  openMobileGraphExperience();
  return;
}

window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-open-result]').forEach(button => {
    button.addEventListener('click', () => {
      showSection(button.dataset.openResult);
    });
  });

  if (backBtn) {
    backBtn.addEventListener('click', showMenu);
  }

  mobileQuery.addEventListener('change', showMenu);
  showMenu();

  window.showMobileResultsMenu = showMenu;
  window.showMobileResultSection = showSection;
}
document.addEventListener('DOMContentLoaded', init);
