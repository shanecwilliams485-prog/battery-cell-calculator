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
  moduleConfiguration: "",
  useSecondModuleConfiguration: false,
  secondModuleConfiguration: "",
  usableEnergyFactor: 0.88,
  assumedLoadKW: 0.0,
  variableCurrentSimulationEnabled: true,
  simulationTimeStepMinutes: 0.5
};

const STORAGE_KEY = 'batteryCellCalculator.inputs.v1';
const inputEls = {};
let lastResults = null;
let animationFrame = null;
let chartPointCount = 1;
let driveCycleRunId = 0;
const CHART_ANIMATION_DELAY_MS = 135; // Increase this value to make the variable discharge graph draw more slowly.

const fields = [
  ['nominalVoltage', 'number'], ['maxVoltage', 'number'], ['minVoltage', 'number'], ['capacityAh', 'number'],
  ['maxDischargeCurrentA', 'number'], ['continuousDischargeCurrentA', 'number'], ['maxChargeCurrentA', 'number'], ['cellWeightG', 'number'],
  ['seriesCount', 'int'], ['parallelCount', 'int'], ['moduleConfiguration', 'text'], ['useSecondModuleConfiguration', 'checkbox'], ['secondModuleConfiguration', 'text'], ['usableEnergyFactor', 'number'], ['assumedLoadKW', 'number'],
  ['variableCurrentSimulationEnabled', 'checkbox'], ['simulationTimeStepMinutes', 'number']
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

function buildModuleConfigurationOptions(totalSeries, parallel) {
  const options = [];

  for (let moduleCount = 1; moduleCount <= totalSeries; moduleCount++) {
    if (totalSeries % moduleCount === 0) {
      const moduleSeries = totalSeries / moduleCount;
      const moduleParallel = parallel;

      options.push({
        value: `${moduleSeries}S${moduleParallel}P`,
        label: `${moduleCount} module${moduleCount === 1 ? "" : "s"} of ${moduleSeries}S${moduleParallel}P`
      });
    }
  }

  return options;
}

function updateModuleConfigurationOptions() {
  const select = document.getElementById("moduleConfiguration");
  if (!select) return;

  const series = Math.max(1, Math.round(clampNumber(document.getElementById("seriesCount")?.value, DEFAULT_INPUTS.seriesCount)));
  const parallel = Math.max(1, Math.round(clampNumber(document.getElementById("parallelCount")?.value, DEFAULT_INPUTS.parallelCount)));
  const currentValue = select.value;

  const options = buildModuleConfigurationOptions(series, parallel);

  select.innerHTML = options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  if (options.some(option => option.value === currentValue)) {
    select.value = currentValue;
  } else {
    const preferred = options.find(option => option.value.startsWith("12S"));
    select.value = preferred ? preferred.value : options[0]?.value || "";
  }

  updateSecondModuleConfigurationOptions();
  saveInputs(getInputs());
}

function updateSecondModuleConfigurationOptions() {
  const checkbox = document.getElementById("useSecondModuleConfiguration");
  const wrap = document.getElementById("secondModuleConfigurationWrap");
  const secondSelect = document.getElementById("secondModuleConfiguration");
  const firstSelect = document.getElementById("moduleConfiguration");

  if (!checkbox || !wrap || !secondSelect || !firstSelect) return;

  const enabled = checkbox.checked;
  wrap.hidden = !enabled;

  if (!enabled) {
    secondSelect.value = "";
    return;
  }

  const series = Math.max(1, Math.round(clampNumber(document.getElementById("seriesCount")?.value, DEFAULT_INPUTS.seriesCount)));
  const parallel = Math.max(1, Math.round(clampNumber(document.getElementById("parallelCount")?.value, DEFAULT_INPUTS.parallelCount)));
  const firstConfig = parseModuleConfigurationValue(firstSelect.value);
  const currentValue = secondSelect.value;

  if (!firstConfig) {
    secondSelect.innerHTML = `<option value="">Select first module configuration</option>`;
    return;
  }

  const remainingSeries = series - firstConfig.series;

  if (remainingSeries <= 0) {
    secondSelect.innerHTML = `<option value="">No remaining series available</option>`;
    return;
  }

  const options = buildModuleConfigurationOptions(remainingSeries, parallel);

  secondSelect.innerHTML = options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  if (options.some(option => option.value === currentValue)) {
    secondSelect.value = currentValue;
  } else {
    secondSelect.value = options[0]?.value || "";
  }
}

  saveInputs(getInputs());
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
  const moduleMatch = String(input.moduleConfiguration || "").match(/^(\d+)S(\d+)P$/);
  const moduleSeries = moduleMatch ? Number(moduleMatch[1]) : series;
  const moduleParallel = moduleMatch ? Number(moduleMatch[2]) : parallel;
  const moduleConfig = `${moduleSeries}S${moduleParallel}P`;
  const moduleNominalVoltageV = input.nominalVoltage * moduleSeries;
  const moduleCapacityAh = input.capacityAh * moduleParallel;
  const moduleEnergyKWh = moduleNominalVoltageV * moduleCapacityAh / 1000;
  const moduleCellCount = moduleSeries * moduleParallel;
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
  const variableSimulation = input.variableCurrentSimulationEnabled ? simulateVariableCurrentRuntime(usableEnergyKWh, nominalVoltageV, input.simulationTimeStepMinutes, maxDischargeCurrentA) : null;
  const sohRows = [100, 95, 90, 85, 80].map(percentage => ({ percentage, usableEnergyKWh: usableEnergyKWh * percentage / 100.0 }));
  return { packEnergyKWh, packCapacityAh, maxDischargeCurrentA, maxDischargePowerKW, continuousDischargeCurrentA, continuousDischargePowerKW, maxChargeCurrentA, maxChargePowerKW, maxVoltageV, minVoltageV, nominalVoltageV, numberOfCells, totalCellWeightKG, maxDischargeCRating, maxChargeCRating, usableEnergyKWh, runtimeAtContinuousDischargeMinutes, runtimeAtAssumedLoadMinutes, moduleConfig, moduleNominalVoltageV, moduleCapacityAh, moduleEnergyKWh, moduleCellCount, variableSimulationEnabled: input.variableCurrentSimulationEnabled, variableAverageCurrentA: variableSimulation?.averageCurrentA ?? null, variableAveragePowerKW: variableSimulation?.averagePowerKW ?? null, variableRuntimeMinutes: variableSimulation?.runtimeMinutes ?? null, variableZeroSOCMinute: variableSimulation?.zeroSOCMinute ?? null, variableProfileSampleNumber: variableSimulation?.profileSampleNumber ?? null, variableSimulationRows: variableSimulation?.rows ?? [], sohRows };
}
function seededNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function currentForDriveSegment(segment, elapsedMinutes, currentLimitA, seed) {
  if (currentLimitA <= 0) return 0;
  const n1 = seededNoise(seed + elapsedMinutes * 0.73 + segment.seedOffset);
  const n2 = seededNoise(seed + elapsedMinutes * 1.91 + 9 + segment.seedOffset);
  const progress = segment.duration > 0 ? clamp(elapsedMinutes / segment.duration, 0, 1) : 0;
  const slowWave = (Math.sin((elapsedMinutes + seed * 0.001 + segment.seedOffset) * segment.waveSpeed) + 1) / 2;

  if (segment.type === 'stop') {
    return clamp(4 + n1 * 4, 0, Math.min(8, currentLimitA));
  }
  if (segment.type === 'town') {
    const target = lerp(18, 62, slowWave) + n1 * 14;
    return clamp(target, 0, Math.min(currentLimitA * 0.35, currentLimitA));
  }
  if (segment.type === 'road') {
    const target = lerp(35, 95, slowWave) + n1 * 20;
    return clamp(target, 0, Math.min(currentLimitA * 0.55, currentLimitA));
  }
  if (segment.type === 'highway') {
    // Long motorway/highway section: mostly 80–140 A with slow variation.
    const target = 80 + slowWave * 45 + n1 * 15;
    return clamp(target, Math.min(80, currentLimitA), Math.min(140, currentLimitA));
  }
  if (segment.type === 'accelerate') {
    // A normal acceleration, not quite full throttle, but much higher than cruising.
    const swell = Math.sin(progress * Math.PI);
    const level = segment.intensity * (0.62 + swell * 0.28 + n1 * 0.04);
    return clamp(currentLimitA * level, 0, currentLimitA);
  }
  if (segment.type === 'pull') {
    // Hard acceleration pull: 2–8 seconds of near-maximum current.
    // The shape ramps up, holds close to max current, then eases off instead of
    // appearing as a single unrealistic spike.
    const ramp = 0.18;
    let shape = 1;
    if (progress < ramp) shape = progress / ramp;
    else if (progress > 1 - ramp) shape = (1 - progress) / ramp;
    shape = clamp(shape, 0, 1);
    const level = segment.intensity * (0.88 + shape * 0.12 + n2 * 0.015);
    return clamp(currentLimitA * level, 0, currentLimitA);
  }
  return 0;
}
function buildDrivingCurrentProfile(timeStepMinutes, currentLimitA) {
  const step = Math.max(timeStepMinutes, 0.25);
  driveCycleRunId += 1;
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff) ^ Math.round(currentLimitA * 100) ^ (driveCycleRunId * 2654435761)) >>> 0;
  const random = makeRandom(seed || 1);
  const jitter = (base, variation) => Math.max(step, base + (random() * 2 - 1) * variation);
  const seconds = value => value / 60;
  const hardPullDuration = () => seconds(2 + random() * 6); // 2–8 seconds
  const canDoHighPulls = currentLimitA >= 20;
  const fullPullCount = canDoHighPulls ? 2 + Math.floor(random() * 3) : 0;
  const fullPullsToPlace = new Set();
  while (fullPullsToPlace.size < fullPullCount) fullPullsToPlace.add(2 + Math.floor(random() * 10));

  const baseCycle = [
    { type: 'stop', duration: jitter(0.75, 0.25), waveSpeed: 0.2 },
    { type: 'town', duration: jitter(4.0, 1.2), waveSpeed: 1.0 + random() * 0.7 },
    { type: 'road', duration: jitter(5.5, 1.3), waveSpeed: 0.55 + random() * 0.45 },
    { type: 'stop', duration: jitter(0.75, 0.25), waveSpeed: 0.2 },
    { type: 'town', duration: jitter(5.0, 1.4), waveSpeed: 0.8 + random() * 0.6 },
    { type: 'accelerate', duration: jitter(0.6, 0.2), waveSpeed: 2.0, intensity: 0.75 + random() * 0.12 },
    { type: 'highway', duration: jitter(5.0, 0.4), waveSpeed: 0.20 + random() * 0.18 },
    { type: 'road', duration: jitter(4.5, 1.0), waveSpeed: 0.45 + random() * 0.45 },
    { type: 'town', duration: jitter(4.0, 1.0), waveSpeed: 0.9 + random() * 0.6 },
    { type: 'stop', duration: jitter(0.75, 0.25), waveSpeed: 0.2 },
    { type: 'highway', duration: jitter(5.0, 0.4), waveSpeed: 0.18 + random() * 0.16 },
    { type: 'road', duration: jitter(5.0, 1.3), waveSpeed: 0.45 + random() * 0.4 },
    { type: 'town', duration: jitter(3.5, 1.0), waveSpeed: 0.9 + random() * 0.6 },
    { type: 'stop', duration: jitter(0.75, 0.25), waveSpeed: 0.2 }
  ];

  const driveCycle = [];
  baseCycle.forEach((segment, index) => {
    driveCycle.push({ ...segment, seedOffset: random() * 1000 });
    if (fullPullsToPlace.has(index)) {
      driveCycle.push({
        type: 'pull',
        duration: hardPullDuration(),
        waveSpeed: 5.0,
        intensity: 0.94 + random() * 0.06,
        seedOffset: random() * 1000
      });
    } else if (canDoHighPulls && random() < 0.25 && segment.type !== 'stop' && segment.type !== 'highway') {
      driveCycle.push({
        type: 'accelerate',
        duration: jitter(0.55, 0.2),
        waveSpeed: 2.2,
        intensity: 0.68 + random() * 0.18,
        seedOffset: random() * 1000
      });
    }
  });

  const profile = [];
  let minute = 0;
  driveCycle.forEach((segment, segmentIndex) => {
    // Cruise sections can use the user's larger simulation step, but hard
    // acceleration pulls are sampled every second so a 2–8 second pull is
    // actually visible in the replay and in the live driver data.
    const segmentStep = segment.type === 'pull' ? Math.min(step, seconds(1)) : step;
    for (let t = 0; t < segment.duration - 1e-9; t += segmentStep) {
      const sampleDuration = Math.min(segmentStep, segment.duration - t);
      const current = currentForDriveSegment(segment, t, currentLimitA, seed + segmentIndex * 37);
      minute += sampleDuration;
      profile.push({ minute, durationMinutes: sampleDuration, current, type: segment.type });
    }
  });

  profile.sampleNumber = driveCycleRunId;
  return profile;
}
function simulateVariableCurrentRuntime(usableEnergyKWh, nominalVoltageV, timeStepMinutes, maxDischargeCurrentA) {
  const currentLimitA = Math.max(0, maxDischargeCurrentA || 0);
  const profile = buildDrivingCurrentProfile(timeStepMinutes, currentLimitA);
  const profileSampleNumber = profile.sampleNumber || driveCycleRunId;
  const weightedMinutes = profile.reduce((sum, row) => sum + row.durationMinutes, 0);
  const profileAverageCurrentA = weightedMinutes ? profile.reduce((sum, row) => sum + row.current * row.durationMinutes, 0) / weightedMinutes : 0;
  const profileAveragePowerKW = nominalVoltageV * profileAverageCurrentA / 1000.0;
  if (usableEnergyKWh <= 0 || nominalVoltageV <= 0 || !profile.length || profileAveragePowerKW <= 0) {
    return { averageCurrentA: profileAverageCurrentA, averagePowerKW: profileAveragePowerKW, runtimeMinutes: 0, zeroSOCMinute: 0, profileSampleNumber, rows: [] };
  }

  // Build the graph from the exact same discharge samples used for the runtime estimate.
  // The generated drive cycle is repeated until usable energy reaches zero, so the
  // displayed graph, SOC preview, average power, and runtime estimate all agree.
  const rows = [];
  let cumulativeEnergyUsedKWh = 0;
  let elapsedMinutes = 0;
  let zeroSOCMinute = null;
  let weightedCurrentSum = 0;
  let measuredMinutes = 0;
  const maxRows = 1500;

  while (cumulativeEnergyUsedKWh < usableEnergyKWh && rows.length < maxRows) {
    for (const sample of profile) {
      if (cumulativeEnergyUsedKWh >= usableEnergyKWh || rows.length >= maxRows) break;
      const current = sample.current;
      const powerKW = nominalVoltageV * current / 1000.0;
      const durationMinutes = sample.durationMinutes;
      const availableEnergyKWh = Math.max(0, usableEnergyKWh - cumulativeEnergyUsedKWh);
      const fullSampleEnergyKWh = powerKW * (durationMinutes / 60.0);
      const effectiveDurationMinutes = fullSampleEnergyKWh > availableEnergyKWh && powerKW > 0
        ? (availableEnergyKWh / powerKW) * 60.0
        : durationMinutes;
      const energyUsedKWh = powerKW * (effectiveDurationMinutes / 60.0);

      elapsedMinutes += effectiveDurationMinutes;
      cumulativeEnergyUsedKWh += energyUsedKWh;
      weightedCurrentSum += current * effectiveDurationMinutes;
      measuredMinutes += effectiveDurationMinutes;

      const remainingEnergyKWh = Math.max(0, usableEnergyKWh - cumulativeEnergyUsedKWh);
      const socPercent = usableEnergyKWh > 0 ? Math.max(0, remainingEnergyKWh / usableEnergyKWh * 100.0) : 0;
      if (zeroSOCMinute === null && cumulativeEnergyUsedKWh >= usableEnergyKWh) zeroSOCMinute = elapsedMinutes;

      rows.push({
        minute: elapsedMinutes,
        driveMode: sample.type,
        averageCurrentA: current,
        currentLimitA,
        powerKW,
        energyUsedKWh,
        cumulativeEnergyUsedKWh,
        remainingEnergyKWh,
        socPercent
      });
    }
  }

  const runtimeMinutes = zeroSOCMinute ?? (profileAveragePowerKW > 0 ? usableEnergyKWh / profileAveragePowerKW * 60.0 : elapsedMinutes);
  const averageCurrentA = measuredMinutes > 0 ? weightedCurrentSum / measuredMinutes : profileAverageCurrentA;
  const averagePowerKW = nominalVoltageV * averageCurrentA / 1000.0;
  return { averageCurrentA, averagePowerKW, runtimeMinutes, zeroSOCMinute: zeroSOCMinute ?? runtimeMinutes, profileSampleNumber, rows };
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

  if (moduleConfigEl) moduleConfigEl.textContent = results.moduleConfig;
  if (moduleVoltageEl) moduleVoltageEl.textContent = `${fmt(results.moduleNominalVoltageV, 1)} V`;
  if (moduleCapacityEl) moduleCapacityEl.textContent = `${fmt(results.moduleCapacityAh, 1)} Ah`;
  if (moduleEnergyEl) moduleEnergyEl.textContent = `${fmt(results.moduleEnergyKWh, 2)} kWh`;
  if (moduleCellsEl) moduleCellsEl.textContent = `${fmt(results.moduleCellCount, 0)} cells`;
  
  document.getElementById('sohRows').innerHTML = results.sohRows.map(row => `<div class="soh-row"><div><span>${row.percentage}% SOH</span><strong>${fmt(row.usableEnergyKWh, 2)} kWh</strong></div><progress value="${row.percentage}" max="100"></progress></div>`).join('');
  let runtime = valueRow('Spreadsheet runtime', `${fmt(results.runtimeAtContinuousDischargeMinutes, 1)} min`);
  runtime += results.runtimeAtAssumedLoadMinutes !== null ? valueRow('At optional load', `${fmt(results.runtimeAtAssumedLoadMinutes, 1)} min`) : `<p class="muted">Enter an optional load in kW to estimate runtime for a specific motor, inverter, or device load.</p>`;
  if (results.variableSimulationEnabled && results.variableAveragePowerKW !== null) {
    runtime += '<hr>' + valueRow('Variable discharge average power', `${fmt(results.variableAveragePowerKW, 2)} kW`) + valueRow('Variable discharge runtime', `${fmt(results.variableRuntimeMinutes, 1)} min`) + valueRow('Variable discharge 0% SOC', `${fmt(results.variableZeroSOCMinute, 0)} min`);
  }
  document.getElementById('runtimeRows').innerHTML = runtime;
  const simSection = document.getElementById('simulationSection');
  if (results.variableSimulationEnabled && results.variableSimulationRows.length) {
    simSection.hidden = false;
    const profileTitle = document.getElementById('profileTitle');
    if (profileTitle) profileTitle.textContent = 'Variable Discharge Simulation';
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
  const maxA = Math.max(...rows.map(r => r.currentLimitA || r.averageCurrentA), ...rows.map(r => r.averageCurrentA), 1);
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
  if (chartStats) chartStats.textContent = `Live driver-style discharge data • hard pulls last 2–8 seconds • 0–${fmt(maxA, 0)} A range`;
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
  const enabled = document.getElementById('variableCurrentSimulationEnabled').checked;
  document.getElementById('simulationOptions').hidden = !enabled;
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
    if (name === "seriesCount" || name === "parallelCount") {
      updateModuleConfigurationOptions();
    } else if (name === "moduleConfiguration" || name === "useSecondModuleConfiguration") {
      updateSecondModuleConfigurationOptions();
      saveInputs(getInputs());
    } else {
      saveInputs(getInputs());
    }
  });

  document.getElementById(name)?.addEventListener('change', () => {
    if (name === "moduleConfiguration" || name === "useSecondModuleConfiguration") {
      updateSecondModuleConfigurationOptions();
    }

    saveInputs(getInputs());
  });
}
  document.getElementById('calculatorPage').hidden = false;
  document.getElementById('resultsPage').hidden = true;
  hideLoading();
}
document.addEventListener('DOMContentLoaded', init);
