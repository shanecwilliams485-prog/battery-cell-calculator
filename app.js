// Volt Energy Systems — Battery Cell Calculator (v2 interface)
//
// app.js  : interface — inputs, navigation, results, saving.
// calc.js : cell → module → pack calculations (pure, tested).
// simulation.js : vehicle drive-cycle and full-power simulation (pure, tested).

"use strict";

const Sim = window.BatterySimulation;
const Calc = window.VoltCalc;
const REQUIRED_ENGINE_VERSION = 17;
const STORAGE_KEY = "voltBatteryCalculator.v2";
const PROJECT_FILE_TYPE = "volt-battery-calculator-project";
const LOW_CHARGE = 15; // % (as shown to driver) used for "low charge" figures
const KM_PER_MILE = 1.609344;

// ---------------------------------------------------------------------------
// Units. Values are stored internally in UK units (mph, miles, kWh/mile) and
// converted for display when the metric option is selected.
// ---------------------------------------------------------------------------
const UNIT_KINDS = {
  speed: { uk: "mph", metric: "km/h", toMetric: (v) => v * KM_PER_MILE },
  distance: { uk: "miles", metric: "km", toMetric: (v) => v * KM_PER_MILE },
  perDistance: { uk: "kWh/mile", metric: "kWh/km", toMetric: (v) => v / KM_PER_MILE }
};

function unitLabel(kind) {
  return UNIT_KINDS[kind][state.units === "metric" ? "metric" : "uk"];
}
function toDisplay(kind, value) {
  if (!Number.isFinite(value)) return value;
  return state.units === "metric" ? UNIT_KINDS[kind].toMetric(value) : value;
}
function fromDisplay(kind, value) {
  if (!Number.isFinite(value)) return value;
  return state.units === "metric" ? value / UNIT_KINDS[kind].toMetric(1) : value;
}

// ---------------------------------------------------------------------------
// Input definitions
// ---------------------------------------------------------------------------
const FORMAT_OPTIONS = [
  ["", "Not specified"],
  ["cyl18650", "Cylindrical 18650"],
  ["cyl21700", "Cylindrical 21700"],
  ["cyl4680", "Cylindrical 4680"],
  ["cylCustom", "Cylindrical (other size)"],
  ["prismatic", "Prismatic"],
  ["pouch", "Pouch"]
];
const RATING_MODES = {
  mod: [["limit", "As limits: use the lower of these and the cells"], ["replace", "As the module rating: use these instead of the cell figures"]],
  pack: [["limit", "As limits: use the lower of these and the modules"], ["replace", "As the pack rating: use these instead of the module figures"]]
};
const OVERHEAD_OPTIONS = [["percent", "Simple percentage"], ["itemised", "Itemised components"]];
const AMP_KW = [["A", "A"], ["kW", "kW"]];
const RES_SOURCES = [["supplier", "Cell supplier ageing data"], ["test", "Our own test"], ["customer", "Customer definition"], ["assumption", "Assumption"]];
const hasValue = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));

// Vehicle presets: typical values to use when no vehicle data is available.
// Cd and drag area (CdA) are from measured examples listed in Wikipedia's
// "Automobile drag coefficient" and "List of automobile drag coefficients";
// frontal area = CdA ÷ Cd. Crr is the middle of an EU tyre-label class
// (Regulation (EU) 2020/740, C1 tyres): class C 7.8–9.0 N/kN, class E ≥ 10.6 N/kN.
const VEHICLE_PRESETS = {
  supermini: { label: "Supermini / city car", cd: 0.32, cda: 0.63, crr: 0.0084,
    basis: "Cd of examples 0.28–0.35 (Škoda Fabia IV 0.28, Toyota Yaris 0.29, Renault Clio II 0.35); CdA 0.62–0.64 m² (Citroën Saxo, Renault Clio V). Tyres: EU class C." },
  sports: { label: "Small sports car / roadster", cd: 0.36, cda: 0.60, crr: 0.0084,
    basis: "Cd of examples 0.33–0.41 (Honda S2000 0.33, Mazda Miata 0.38, Smart Roadster 0.41); CdA 0.59–0.65 m² (Lotus Elise, Smart Roadster). Tyres: EU class C." },
  saloon: { label: "Saloon", cd: 0.29, cda: 0.62, crr: 0.0084,
    basis: "Cd of examples 0.27–0.33 (Mazda6 0.27, Toyota Camry 0.30, Honda Accord 0.33); CdA 0.52–0.70 m² (BMW 520d, Tesla Model S, Camry, Accord). Tyres: EU class C." },
  suv: { label: "SUV / crossover", cd: 0.37, cda: 1.08, crr: 0.0084,
    basis: "Cd of examples 0.31–0.39 (Toyota RAV4 0.31, VW Tiguan 0.37, Chevrolet Tahoe 0.39; SUVs typically 0.35–0.45); CdA 1.08–1.09 m² (Ford Escape Hybrid, Jeep Grand Cherokee). Tyres: EU class C." },
  mpv: { label: "MPV / passenger van", cd: 0.38, cda: 0.92, crr: 0.0084,
    basis: "Cd of examples 0.35–0.44 (Toyota Previa 0.35, VW Transporter T4 0.37, Chevrolet Astro 0.40); CdA 0.89–0.92 m² (Chrysler PT Cruiser, Pacifica). Tyres: EU class C." },
  pickup: { label: "Pickup truck", cd: 0.40, cda: 1.21, crr: 0.0084,
    basis: "Cd of examples 0.36–0.44 (Ram 1500 0.357, Toyota Tacoma 0.39, Ford Ranger 0.40); CdA 1.21 m² (Ram 1500). Tyres: EU class C." },
  classic: { label: "Classic car (1950s–70s)", cd: 0.44, cda: 0.82, crr: 0.0110,
    basis: "Cd of examples 0.36–0.48 (Citroën DS 0.36, Triumph Spitfire IV 0.42, Peugeot 504 0.44, VW Beetle 0.48); CdA 0.82 m² (Citroën DS Spécial). Tyres: EU class E (assumed for older tyre designs)." }
};
const PRESET_OPTIONS = [["", "Custom (enter your own)"], ...Object.entries(VEHICLE_PRESETS).map(([k, v]) => [k, v.label])];
const presetArea = (p) => Math.round(p.cda / p.cd * 100) / 100;

const isCellStart = (s) => s.buildStart !== "module";
const isModuleStart = (s) => s.buildStart === "module";
const isBoxCell = (s) => s.cellFormat === "prismatic" || s.cellFormat === "pouch";

// field helper: f(id, label, options)
function f(id, label, opts = {}) {
  return { id, label, type: "number", ...opts };
}

const STEPS = [
  {
    id: "project",
    title: "Project",
    intro: "Name the design and choose how far to build it up using the picker in the sidebar: start from a cell or a module, and go as far as a module, pack or vehicle.",
    blocks: [
      {
        title: "Project details",
        fields: [
          f("projectName", "Project name", { type: "text" }),
          f("customer", "Customer", { type: "text", optional: true }),
          f("revision", "Revision", { type: "text", optional: true }),
          f("projectDate", "Date", { type: "date", optional: true }),
          f("notes", "Notes", { type: "textarea", optional: true, full: true, help: "Included in the PDF report." })
        ]
      }
    ]
  },
  {
    id: "cell",
    title: "Cell",
    when: (r) => r.start === "cell",
    intro: "Values from the cell datasheet. Only the essentials are needed; add more detail if you have it.",
    blocks: [
      {
        title: "Cell datasheet",
        fields: [
          f("cellManufacturer", "Manufacturer", { type: "text", optional: true }),
          f("cellModel", "Model / part number", { type: "text", optional: true }),
          f("cellNominalV", "Nominal voltage", { unit: "V", step: 0.01 }),
          f("cellMaxV", "Max voltage", { unit: "V", step: 0.01 }),
          f("cellMinV", "Min voltage", { unit: "V", step: 0.01 }),
          f("cellCapacityAh", "Capacity", { unit: "Ah", step: 0.01 }),
          f("cellMaxDischargeA", "Max discharge current", { unit: "A", step: 0.1, help: "Peak / pulse rating." }),
          f("cellContDischargeA", "Continuous discharge current", { unit: "A", step: 0.1 }),
          f("cellMaxChargeA", "Max charge current (continuous)", { unit: "A", step: 0.1 }),
          f("cellPeakChargeA", "Peak charge current", { unit: "A", step: 0.1, optional: true, help: "Short-term charge rating, mainly for regen braking. Leave 0 if the datasheet gives none." }),
          f("cellPeakChargeS", "Peak charge duration", { unit: "s", step: 1, optional: true, help: "How long the peak charge current may be held." }),
          f("cellMassG", "Mass", { unit: "g", step: 0.1 })
        ]
      },
      {
        more: true,
        title: "Format and size",
        tag: "for Wh/L",
        fields: [
          f("cellFormat", "Cell format", { type: "select", options: FORMAT_OPTIONS, help: "Standard cylindrical sizes fill their dimensions automatically." }),
          f("cellDiameterMm", "Diameter", { unit: "mm", step: 0.1, showIf: (s) => s.cellFormat === "cylCustom" }),
          f("cellLengthMm", "Length / height", { unit: "mm", step: 0.1, showIf: (s) => s.cellFormat === "cylCustom" || isBoxCell(s) }),
          f("cellWidthMm", "Width", { unit: "mm", step: 0.1, showIf: isBoxCell }),
          f("cellThicknessMm", "Thickness", { unit: "mm", step: 0.1, showIf: isBoxCell })
        ]
      },
      {
        more: true,
        title: "Performance detail",
        tag: "voltage sag, pulse time",
        fields: [
          f("cellPulseDurationS", "Max discharge duration", { unit: "s", step: 1, optional: true, help: "How long the max discharge current can be held. Leave 0 for no limit." }),
          f("cellDcirMOhm", "DC internal resistance", { unit: "mΩ", step: 0.01, optional: true, help: "Datasheet DCIR (e.g. 10 s pulse at 50 % SOC) at the temperature you want to simulate." }),
          f("cellOcvTable", "OCV vs SOC table", { type: "ocv", optional: true, full: true, help: "One “SOC %, voltage” pair per line, from the datasheet OCV or low-rate discharge curve. Paste or load a CSV. Leave empty to use the nominal voltage." })
        ]
      }
    ]
  },
  {
    id: "module",
    title: "Module",
    intro: "Build the module from cells, or enter a module datasheet when starting from a module.",
    blocks: [
      {
        title: "Module configuration",
        showIf: isCellStart,
        fields: [
          f("modSeries", "Cells in series", { step: 1, min: 1 }),
          f("modParallel", "Cells in parallel", { step: 1, min: 1 })
        ]
      },
      {
        title: "Module datasheet",
        showIf: isModuleStart,
        fields: [
          f("mdName", "Module name / part number", { type: "text", optional: true }),
          f("mdNominalV", "Nominal voltage", { unit: "V", step: 0.1 }),
          f("mdMaxV", "Max voltage", { unit: "V", step: 0.1 }),
          f("mdMinV", "Min voltage", { unit: "V", step: 0.1 }),
          f("mdCapacityAh", "Capacity", { unit: "Ah", step: 0.1 }),
          f("mdMaxDischargeA", "Max discharge current", { unit: "A", step: 1 }),
          f("mdContDischargeA", "Continuous discharge current", { unit: "A", step: 1 }),
          f("mdMaxChargeA", "Max charge current", { unit: "A", step: 1 }),
          f("mdMassKg", "Mass", { unit: "kg", step: 0.01 })
        ]
      },
      {
        more: true,
        title: "Module ratings",
        tag: "once the module is designed",
        showIf: isCellStart,
        fields: [
          f("modRatingsEnabled", "The module has its own current ratings", { type: "switch", full: true, help: "Off: the module is rated from the cells (cell rating × cells in parallel). Turn on once the module design sets its own ratings, e.g. busbars, joints and terminals, or a validated module design." }),
          f("modRatingsMode", "How should these be used?", { type: "select", full: true, options: RATING_MODES.mod, showIf: (s) => !!s.modRatingsEnabled }),
          f("modPeakA", "Peak discharge", { unit: "A", step: 1, showIf: (s) => !!s.modRatingsEnabled, help: "Leave 0 to keep the cell-based figure." }),
          f("modPeakS", "Peak duration", { unit: "s", step: 1, showIf: (s) => !!s.modRatingsEnabled }),
          f("modContA", "Continuous discharge", { unit: "A", step: 1, showIf: (s) => !!s.modRatingsEnabled }),
          f("modChargeA", "Max charge / regen", { unit: "A", step: 1, showIf: (s) => !!s.modRatingsEnabled }),
          f("modRatingsNote", "Source / set by", { type: "text", full: true, optional: true, showIf: (s) => !!s.modRatingsEnabled, help: "e.g. Module busbar and M8 terminal, 200 A continuous" }),
          f("modRatingsPreview", "", { type: "ratings", level: "module", full: true, showIf: (s) => !!s.modRatingsEnabled })
        ]
      },
      {
        more: true,
        title: "Module mass overhead",
        tag: "housing, interconnects",
        showIf: isCellStart,
        fields: [
          f("modOverheadMode", "Method", { type: "select", options: OVERHEAD_OPTIONS }),
          f("modMassOverheadPct", "Overhead", { unit: "% of cell mass", step: 1, showIf: (s) => s.modOverheadMode !== "itemised", help: "Housing, interconnects, sensing and fixings, as a percentage of the cell mass." }),
          f("modItemHousingKg", "Housing and structure", { unit: "kg", step: 0.01, showIf: (s) => s.modOverheadMode === "itemised" }),
          f("modItemInterconnectKg", "Interconnects / busbars", { unit: "kg", step: 0.01, showIf: (s) => s.modOverheadMode === "itemised" }),
          f("modItemElectronicsKg", "Sensing / electronics", { unit: "kg", step: 0.01, showIf: (s) => s.modOverheadMode === "itemised" }),
          f("modItemOtherKg", "Other", { unit: "kg", step: 0.01, showIf: (s) => s.modOverheadMode === "itemised" })
        ]
      },
      {
        more: true,
        title: "Module size",
        tag: "for Wh/L",
        showIf: isCellStart,
        fields: [
          f("modLengthMm", "Length", { unit: "mm", step: 1 }),
          f("modWidthMm", "Width", { unit: "mm", step: 1 }),
          f("modHeightMm", "Height", { unit: "mm", step: 1 })
        ]
      },
      {
        more: true,
        title: "Module detail",
        tag: "size, resistance, pulse time",
        showIf: isModuleStart,
        fields: [
          f("mdConfig", "Configuration", { type: "text", optional: true, help: "e.g. 12S4P" }),
          f("mdCellType", "Cell type", { type: "text", optional: true }),
          f("mdLengthMm", "Length", { unit: "mm", step: 1, optional: true }),
          f("mdWidthMm", "Width", { unit: "mm", step: 1, optional: true }),
          f("mdHeightMm", "Height", { unit: "mm", step: 1, optional: true }),
          f("mdDcirMOhm", "DC internal resistance", { unit: "mΩ", step: 0.01, optional: true }),
          f("mdPulseDurationS", "Max discharge duration", { unit: "s", step: 1, optional: true, help: "Leave 0 for no limit." })
        ]
      }
    ]
  },
  {
    id: "pack",
    title: "Pack & BMS",
    when: (r) => r.includes("pack"),
    intro: "Arrange modules into the pack. Pack ratings, mass overhead and enclosure size are optional.",
    blocks: [
      {
        title: "Pack arrangement",
        fields: [
          f("packModules", "Modules in series", { step: 1, min: 1, help: "Per string." }),
          f("packStrings", "Parallel strings", { step: 1, min: 1, help: "Usually 1." }),
          f("usableFactor", "Usable factor", { step: 0.01, help: "Share of nominal energy the BMS lets the driver use (e.g. 0.88)." })
        ]
      },
      {
        more: true,
        title: "Pack ratings",
        tag: "BMS, fuse, contactors",
        fields: [
          f("bmsEnabled", "The pack has its own current ratings", { type: "switch", full: true, help: "Off: the pack is rated from the module (module rating × parallel strings). Turn on for the BMS settings, the weakest part in the current path (fuse, contactors, busbars, HV connector) or a validated pack design." }),
          f("bmsMode", "How should these be used?", { type: "select", full: true, options: RATING_MODES.pack, showIf: (s) => !!s.bmsEnabled }),
          f("bmsPeakA", "Peak discharge", { unit: "A", step: 1, showIf: (s) => !!s.bmsEnabled, help: "Leave 0 to keep the module-based figure." }),
          f("bmsPeakS", "Peak duration", { unit: "s", step: 1, showIf: (s) => !!s.bmsEnabled }),
          f("bmsContA", "Continuous discharge", { unit: "A", step: 1, showIf: (s) => !!s.bmsEnabled }),
          f("bmsChargeA", "Max charge / regen", { unit: "A", step: 1, showIf: (s) => !!s.bmsEnabled }),
          f("bmsNote", "Source / set by", { type: "text", full: true, optional: true, showIf: (s) => !!s.bmsEnabled, help: "e.g. Main contactor 180 A continuous; 400 A fuse" }),
          f("packRatingsPreview", "", { type: "ratings", level: "pack", full: true, showIf: (s) => !!s.bmsEnabled })
        ]
      },
      {
        more: true,
        title: "Pack mass overhead",
        tag: "enclosure, BMS, cooling",
        fields: [
          f("packOverheadMode", "Method", { type: "select", options: OVERHEAD_OPTIONS }),
          f("packMassOverheadPct", "Overhead", { unit: "% of module mass", step: 1, showIf: (s) => s.packOverheadMode !== "itemised", help: "Enclosure, busbars, BMS, cooling and wiring, as a percentage of the module mass." }),
          f("packItemEnclosureKg", "Enclosure and structure", { unit: "kg", step: 0.1, showIf: (s) => s.packOverheadMode === "itemised" }),
          f("packItemBusbarsKg", "Busbars and HV wiring", { unit: "kg", step: 0.1, showIf: (s) => s.packOverheadMode === "itemised" }),
          f("packItemBmsKg", "BMS and electronics", { unit: "kg", step: 0.1, showIf: (s) => s.packOverheadMode === "itemised" }),
          f("packItemCoolingKg", "Cooling system", { unit: "kg", step: 0.1, showIf: (s) => s.packOverheadMode === "itemised" }),
          f("packItemOtherKg", "Other", { unit: "kg", step: 0.1, showIf: (s) => s.packOverheadMode === "itemised" })
        ]
      },
      {
        more: true,
        title: "Enclosure size",
        tag: "volume for Wh/L, overall size",
        fields: [
          f("packVolumeMethod", "How to enter the volume", { type: "segment", full: true, options: [["cad", "Volume from CAD"], ["boxes", "Made of several boxes"]] }),
          f("packVolumeL", "Enclosure volume", { unit: "L", step: 0.1, optional: true, showIf: (s) => s.packVolumeMethod === "cad", help: "From the CAD model of the enclosure. Used for pack Wh/L." }),
          f("packBoxes", "Sections", { type: "boxes", full: true, showIf: (s) => s.packVolumeMethod === "boxes", help: "For early concepts without CAD. Split the shape into simple boxes that do not overlap; their volumes are added for pack Wh/L." }),
          f("packLengthMm", "Overall length", { unit: "mm", step: 1, optional: true, help: "Overall size: the outside box the pack fits in, for checking it fits the vehicle. Not used for Wh/L." }),
          f("packWidthMm", "Overall width", { unit: "mm", step: 1, optional: true }),
          f("packHeightMm", "Overall height", { unit: "mm", step: 1, optional: true })
        ]
      },
      {
        more: true,
        title: "Pack resistance",
        tag: "for heat",
        fields: [
          f("packExtraResMOhm", "Extra pack resistance", { unit: "mΩ", step: 0.1, optional: true, help: "Busbars, fuses, contactors and connectors, if known. Added to the cells for the heat figures, charging losses and cooling check. Leave blank to count the cells only." })
        ]
      }
    ]
  },
  {
    id: "vehicle",
    title: "Vehicle",
    when: (r) => r.includes("vehicle"),
    intro: "The vehicle the pack is going into. Motor limits, charging and loads are optional.",
    blocks: [
      {
        title: "Vehicle",
        fields: [
          f("vehPreset", "Vehicle type preset", { type: "select", options: PRESET_OPTIONS, full: true, help: "Fills drag, frontal area and rolling resistance with typical values. Replace them with real data when you have it." }),
          f("vehName", "Vehicle", { type: "text", optional: true }),
          f("vehMassKg", "Vehicle mass", { unit: "kg", step: 1, help: "Kerb mass. The calculated pack mass is added unless the switch below is on." }),
          f("vehMassIncludesPack", "This mass already includes the battery pack", { type: "switch", full: true }),
          f("payloadKg", "Payload", { unit: "kg", step: 1, help: "Driver, passengers and luggage." }),
          f("cd", "Drag coefficient (Cd)", { step: 0.01 }),
          f("frontalAreaM2", "Frontal area", { unit: "m²", step: 0.01 }),
          f("crr", "Rolling resistance (Crr)", { step: 0.001 }),
          f("drivetrainEffPct", "Drivetrain efficiency", { unit: "% battery → wheel", step: 1 }),
          f("auxBaseKW", "Base accessory load", { unit: "kW", step: 0.05, help: "Always-on load (controls, pumps, 12 V)." })
        ]
      },
      {
        more: true,
        title: "Motor & drivetrain limits",
        tag: "0–60, top speed",
        fields: [
          f("motorEnabled", "Apply motor and drivetrain limits", { type: "switch", full: true, help: "Leave a field at 0 for no limit." }),
          f("motorPeakKW", "Motor peak power", { unit: "kW (datasheet)", step: 1, showIf: (s) => !!s.motorEnabled }),
          f("motorPeakS", "Peak power duration", { unit: "s", step: 1, showIf: (s) => !!s.motorEnabled }),
          f("motorContKW", "Motor continuous power", { unit: "kW (datasheet)", step: 1, showIf: (s) => !!s.motorEnabled }),
          f("motorEffPct", "Motor efficiency", { unit: "%", step: 1, optional: true, showIf: (s) => !!s.motorEnabled, help: "Used only in the requirement check: motor power ÷ efficiency = power drawn from the battery. Leave 0 to compare with the motor datasheet power." }),
          f("controllerMaxA", "Inverter / controller max DC current", { unit: "A", step: 1, showIf: (s) => !!s.motorEnabled, help: "The most current the inverter draws from the battery (inverter datasheet). Leave 0 for no limit." }),
          f("motorRegenKW", "Max regen power", { unit: "kW", step: 1, showIf: (s) => !!s.motorEnabled }),
          f("motorTorqueNm", "Motor peak torque", { unit: "Nm", step: 1, showIf: (s) => !!s.motorEnabled }),
          f("motorMaxRpm", "Motor max speed", { unit: "rpm", step: 100, showIf: (s) => !!s.motorEnabled }),
          f("gearRatio", "Overall gear ratio", { unit: ":1", step: 0.01, showIf: (s) => !!s.motorEnabled }),
          f("tyreSize", "Tyre size", { type: "tyre", optional: true, showIf: (s) => !!s.motorEnabled, help: "e.g. 205/55 R16 — fills the rolling radius." }),
          f("tyreRadiusMm", "Tyre rolling radius", { unit: "mm", step: 1, showIf: (s) => !!s.motorEnabled }),
          f("topSpeedMph", "Vehicle top speed limit", { kind: "speed", step: 1, optional: true, showIf: (s) => !!s.motorEnabled })
        ]
      },
      {
        more: true,
        title: "Charging",
        tag: "AC / DC times, taper",
        fields: [
          f("acChargerKW", "On-board AC charger", { unit: "kW", step: 0.1, optional: true, help: "Power drawn from the socket." }),
          f("acChargerEffPct", "On-board charger efficiency", { unit: "%", step: 1, optional: true, help: "From the charger datasheet. Leave blank to ignore the charger's losses." }),
          f("dcChargerKW", "DC rapid charger", { unit: "kW", step: 1, optional: true, help: "Power delivered to the car, so the charger's own losses don't change the time." }),
          f("cellTaperEnabled", "Include charging taper", { type: "switch", full: true, help: "Charging slows near full. The taper figures are saved with the cell in the library." }),
          f("cellTaperStartPct", "Taper starts at", { unit: "% (as shown to driver)", step: 1, showIf: (s) => !!s.cellTaperEnabled, help: "Where the charge current starts to fall. An assumption: set it from the cell supplier's charging data." }),
          f("cellTaperEndPct", "Current at 100 %", { unit: "% of max", step: 1, showIf: (s) => !!s.cellTaperEnabled, help: "Share of the pack charge current left at full. Falls in a straight line from the start point." })
        ]
      },
      {
        more: true,
        title: "Regen and auxiliary loads",
        tag: "braking, HVAC",
        fields: [
          f("regenEnabled", "Regenerative braking", { type: "switch", full: true }),
          f("regenEffPct", "Regen efficiency", { unit: "%", step: 1, showIf: (s) => !!s.regenEnabled, help: "Share of braking energy at the wheels returned to the pack." }),
          f("regenDisableAboveSoc", "Regen off above", { unit: "% cell SOC", step: 1, showIf: (s) => !!s.regenEnabled }),
          f("acEnabled", "Air conditioning (+1.5 kW)", { type: "switch" }),
          f("heatingEnabled", "Heating", { type: "switch" }),
          f("heaterType", "Heater type", { type: "select", options: [["resistive", "Resistive (+2.5 kW)"], ["heatPump", "Heat pump (+0.75 kW)"]], showIf: (s) => !!s.heatingEnabled }),
          f("accessoriesEnabled", "Lights / wipers / radio (+0.5 kW)", { type: "switch" })
        ]
      }
    ]
  },
  {
    id: "simulation",
    title: "Simulation",
    when: (r) => r.includes("vehicle"),
    intro: "How range and consumption are simulated. Every cycle runs from 100 % to 0 % charge.",
    blocks: [
      {
        title: "Drive cycle",
        fields: [
          f("driveCycle", "Drive cycle", { type: "select", full: true, options: [
            ["wltp3b", "WLTP Class 3b (official cycle)"],
            ["wltp3a", "WLTP Class 3a (official cycle)"],
            ["wltp2", "WLTP Class 2 (official cycle)"],
            ["constant", "Constant speed"],
            ["custom", "Uploaded speed profile (CSV)"]
          ] }),
          f("wltpInfo", "", { type: "wltpinfo", full: true, showIf: (s) => String(s.driveCycle).startsWith("wltp") }),
          f("constantSpeedMph", "Constant speed", { kind: "speed", step: 1, showIf: (s) => s.driveCycle === "constant" }),
          f("customProfileText", "Speed profile", { type: "profile", full: true, showIf: (s) => s.driveCycle === "custom",
            help: "CSV with “time (s), speed” per line, or one speed per line at 1 s intervals. It repeats until the battery is empty, so a profile that starts and ends stopped works best." }),
          f("customProfileUnit", "Profile speed unit", { type: "select", options: [["kmh", "km/h"], ["mph", "mph"]], showIf: (s) => s.driveCycle === "custom" })
        ]
      },
      {
        title: "Constant-speed range table",
        fields: [
          f("speedTable", "Speeds to compare", { type: "speedlist", full: true, help: "Comma-separated, in the units shown. Range is worked out at each steady speed and shown as a table in the results." })
        ]
      }
    ]
  },
  {
    id: "requirements",
    title: "Design requirements",
    optional: "reqEnabled",
    when: (r) => r.includes("pack"),
    intro: "Pass/fail checks of the pack against vehicle targets. These never limit the simulation.",
    blocks: [
      {
        title: "Targets",
        fields: [
          f("reqEnabled", "Check design requirements", { type: "switch", full: true }),
          f("reqPulseValue", "Pulse discharge", { step: 1, showIf: (s) => !!s.reqEnabled }),
          f("reqPulseUnit", "Unit", { type: "select", options: AMP_KW, showIf: (s) => !!s.reqEnabled }),
          f("reqPulseS", "Pulse duration", { unit: "s", step: 1, showIf: (s) => !!s.reqEnabled }),
          f("reqPulseSocPct", "Check pulse at charge", { unit: "% (as shown to driver)", step: 1, showIf: (s) => !!s.reqEnabled, help: "The pulse power target is checked at this charge level, with voltage sag. Pack limits and performance at the limits stay at 15 %." }),
          f("reqContValue", "Continuous discharge", { step: 1, showIf: (s) => !!s.reqEnabled }),
          f("reqContUnit", "Unit", { type: "select", options: AMP_KW, showIf: (s) => !!s.reqEnabled }),
          f("reqChargeValue", "Max charge", { step: 1, showIf: (s) => !!s.reqEnabled }),
          f("reqChargeUnit", "Unit", { type: "select", options: AMP_KW, showIf: (s) => !!s.reqEnabled }),
          f("reqRegenA", "Regen current", { unit: "A", step: 1, showIf: (s) => !!s.reqEnabled }),
          f("reqUsableKWh", "Usable energy", { unit: "kWh", step: 0.1, showIf: (s) => !!s.reqEnabled }),
          f("reqCoolingKW", "Cooling capacity", { unit: "kW", step: 0.1, optional: true, showIf: (s) => !!s.reqEnabled, help: "Heat the cooling system can remove continuously (thermal design or cooling supplier). Checked against the heat at the continuous discharge and max charge targets." }),
          f("reqAgeMode", "Requirements must be met at", { type: "select", options: [["both", "Beginning and end of life"], ["bol", "Beginning of life"], ["eol", "End of life"]], showIf: (s) => !!s.reqEnabled, help: "Used when an end-of-life resistance increase is entered under Lifetime & duty cycle. Failures at the other age are still shown." })
        ]
      }
    ]
  },
  {
    id: "lifetime",
    title: "Lifetime & duty cycle",
    optional: "lifeEnabled",
    when: (r) => r.includes("pack"),
    intro: "Service life, mileage and energy throughput for the application, e.g. to plan cell ageing tests.",
    blocks: [
      {
        title: "Application",
        fields: [
          f("lifeEnabled", "Include lifetime & duty cycle", { type: "switch", full: true }),
          f("lifeYears", "Service life", { unit: "years", step: 1, showIf: (s) => !!s.lifeEnabled }),
          f("lifeDistanceMiles", "Lifetime distance", { kind: "distance", step: 1000, showIf: (s) => !!s.lifeEnabled }),
          f("lifeEolPct", "End-of-life capacity", { unit: "% retained", step: 1, showIf: (s) => !!s.lifeEnabled }),
          f("cellResIncreasePct", "Resistance increase at end of life", { unit: "%", step: 1, optional: true, showIf: (s) => !!s.lifeEnabled, help: "From supplier ageing data, your own tests or the customer's end-of-life definition. Leave blank if not known. Entered: the Results page can show the design at end of life. Saved with the cell." }),
          f("cellResIncreaseSource", "Resistance increase from", { type: "select", options: RES_SOURCES, showIf: (s) => !!s.lifeEnabled && hasValue(s.cellResIncreasePct) }),
          f("lifeConsumptionSource", "Energy consumption", { type: "select", options: [["auto", "From vehicle simulation"], ["manual", "Enter manually"]], showIf: (s) => !!s.lifeEnabled }),
          f("lifeConsumptionKWhPerMile", "Consumption", { kind: "perDistance", step: 0.001, showIf: (s) => !!s.lifeEnabled && s.lifeConsumptionSource === "manual" }),
          f("lifeCharging", "Charging pattern", { type: "select", options: [["acOnly", "Mostly AC"], ["dcRapid", "Frequent DC rapid"], ["acDcRapid", "Mixed AC and DC"]], showIf: (s) => !!s.lifeEnabled })
        ]
      }
    ]
  },
  { id: "results", title: "Results", results: true },
  { id: "report", title: "PDF report", custom: true, output: true },
  { id: "compare", title: "Compare designs", custom: true, output: true }
];

const ALL_FIELDS = STEPS.flatMap((step) => (step.blocks || []).flatMap((block) => block.fields));
const FIELD_BY_ID = Object.fromEntries(ALL_FIELDS.map((field) => [field.id, field]));

// ---------------------------------------------------------------------------
// Defaults and the example project (fictional, for demonstration only)
// ---------------------------------------------------------------------------
const BLANK = {
  buildStart: "cell", buildEnd: "vehicle", units: "uk",
  projectName: "", customer: "", revision: "", projectDate: "", notes: "",
  cellManufacturer: "", cellModel: "", cellNominalV: "", cellMaxV: "", cellMinV: "", cellCapacityAh: "",
  cellMaxDischargeA: "", cellContDischargeA: "", cellMaxChargeA: "", cellMassG: "",
  cellFormat: "", cellDiameterMm: "", cellLengthMm: "", cellWidthMm: "", cellThicknessMm: "",
  cellPeakChargeA: 0, cellPeakChargeS: 0,
  cellPulseDurationS: 0, cellDcirMOhm: 0, cellOcvTable: "",
  modSeries: "", modParallel: "",
  modRatingsEnabled: false, modRatingsMode: "limit", modPeakA: 0, modPeakS: 0, modContA: 0, modChargeA: 0, modRatingsNote: "",
  modOverheadMode: "percent", modMassOverheadPct: 0, modItemHousingKg: 0, modItemInterconnectKg: 0, modItemElectronicsKg: 0, modItemOtherKg: 0,
  modLengthMm: "", modWidthMm: "", modHeightMm: "",
  mdName: "", mdNominalV: "", mdMaxV: "", mdMinV: "", mdCapacityAh: "", mdMaxDischargeA: "", mdContDischargeA: "", mdMaxChargeA: "", mdMassKg: "",
  mdConfig: "", mdCellType: "", mdLengthMm: "", mdWidthMm: "", mdHeightMm: "", mdDcirMOhm: 0, mdPulseDurationS: 0,
  packModules: "", packStrings: 1, usableFactor: 0.9,
  bmsEnabled: false, bmsMode: "limit", bmsPeakA: 0, bmsPeakS: 0, bmsContA: 0, bmsChargeA: 0, bmsNote: "",
  packOverheadMode: "percent", packMassOverheadPct: 0, packItemEnclosureKg: 0, packItemBusbarsKg: 0, packItemBmsKg: 0, packItemCoolingKg: 0, packItemOtherKg: 0,
  packLengthMm: "", packWidthMm: "", packHeightMm: "", packVolumeMethod: "cad", packVolumeL: "", packBoxes: "",
  vehPreset: "", vehName: "", vehMassKg: "", vehMassIncludesPack: false, payloadKg: 75, cd: "", frontalAreaM2: "", crr: "", drivetrainEffPct: 90, auxBaseKW: 0.5,
  motorEnabled: false, motorPeakKW: 0, motorPeakS: 0, motorContKW: 0, motorEffPct: 0, controllerMaxA: 0, motorRegenKW: 0, motorTorqueNm: 0, motorMaxRpm: 0, gearRatio: 0, tyreSize: "", tyreRadiusMm: 0, topSpeedMph: 0,
  acChargerKW: 0, dcChargerKW: 0, acChargerEffPct: "",
  cellTaperEnabled: false, cellTaperStartPct: 80, cellTaperEndPct: 10,
  cellResIncreasePct: "", cellResIncreaseSource: "supplier", packExtraResMOhm: "",
  reqCoolingKW: "", reqAgeMode: "both", resultsAge: "bol",
  regenEnabled: true, regenEffPct: 65, regenDisableAboveSoc: 95, acEnabled: false, heatingEnabled: false, heaterType: "resistive", accessoriesEnabled: false,
  driveCycle: "wltp3b", graphResolutionS: 10, constantSpeedMph: 70,
  customProfileText: "", customProfileUnit: "kmh", customProfileName: "", speedTable: "30, 50, 60, 70",
  reqEnabled: false, reqPulseValue: 0, reqPulseUnit: "kW", reqPulseS: 10, reqPulseSocPct: 15, reqContValue: 0, reqContUnit: "kW", reqChargeValue: 0, reqChargeUnit: "kW", reqRegenA: 0, reqUsableKWh: 0,
  reportTemplate: "customer", reportTheme: "light", reportSections: "", reportConfidential: true, reportPreparedBy: "",
  lifeEnabled: false, lifeYears: 10, lifeDistanceMiles: 100000, lifeEolPct: 70, lifeConsumptionSource: "auto", lifeConsumptionKWhPerMile: 0.3, lifeCharging: "acDcRapid"
};

const EXAMPLE = {
  ...BLANK,
  projectName: "Example only — fictional design", customer: "Demonstration", revision: "A", notes: "All values are fictional and for demonstration of the calculator only.",
  cellManufacturer: "Example", cellModel: "EX-21700-50", cellNominalV: 3.6, cellMaxV: 4.2, cellMinV: 2.5, cellCapacityAh: 5,
  cellMaxDischargeA: 18, cellContDischargeA: 8, cellMaxChargeA: 5, cellMassG: 70, cellFormat: "cyl21700",
  cellPulseDurationS: 10, cellDcirMOhm: 20,
  cellOcvTable: "0, 3.00\n5, 3.30\n10, 3.43\n20, 3.53\n30, 3.59\n40, 3.64\n50, 3.69\n60, 3.76\n70, 3.85\n80, 3.94\n90, 4.05\n100, 4.20",
  modSeries: 12, modParallel: 24, modOverheadMode: "percent", modMassOverheadPct: 15,
  packModules: 8, packStrings: 1, usableFactor: 0.88, packOverheadMode: "percent", packMassOverheadPct: 30,
  vehPreset: "sports", vehName: "Example small sports car", vehMassKg: 1050, vehMassIncludesPack: false, payloadKg: 150, cd: 0.36, frontalAreaM2: 1.67, crr: 0.0084, drivetrainEffPct: 88, auxBaseKW: 0.5,
  motorEnabled: true, motorPeakKW: 150, motorPeakS: 30, motorContKW: 70, motorTorqueNm: 310, motorMaxRpm: 14000, gearRatio: 9, tyreSize: "205/55 R16", tyreRadiusMm: 310,
  acChargerKW: 11, dcChargerKW: 50
};

// ---------------------------------------------------------------------------
// State and storage
// ---------------------------------------------------------------------------
let state = { ...EXAMPLE };
let currentStep = "project";
let resultsTimer = null;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cleanInputs(source) {
  // Only known keys, with the type each field expects.
  const out = {};
  for (const [key, def] of Object.entries(BLANK)) {
    const value = source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : def;
    if (typeof def === "boolean") out[key] = !!value;
    else if (typeof def === "number") out[key] = value === "" || value === null ? def : (Number.isFinite(Number(value)) ? Number(value) : def);
    else out[key] = value === null || value === undefined ? "" : (typeof value === "number" ? value : String(value).slice(0, key === "customProfileText" ? 2000000 : 20000));
  }
  if (!["cell", "module"].includes(out.buildStart)) out.buildStart = "cell";
  if (!["module", "pack", "vehicle"].includes(out.buildEnd)) out.buildEnd = "vehicle";
  if (!["uk", "metric"].includes(out.units)) out.units = "uk";
  if (!["customer", "engineering"].includes(out.reportTemplate)) out.reportTemplate = "customer";
  if (!["light", "dark"].includes(out.reportTheme)) out.reportTheme = "light";
  if (!["limit", "replace"].includes(out.modRatingsMode)) out.modRatingsMode = "limit";
  if (!["limit", "replace"].includes(out.bmsMode)) out.bmsMode = "limit";
  out.reqPulseSocPct = Math.min(100, Math.max(0, Number(out.reqPulseSocPct)));
  if (!["both", "bol", "eol"].includes(out.reqAgeMode)) out.reqAgeMode = "both";
  // Enclosure (v2.12.3): a project saved before the volume choice used one length × width × height box.
  // It opens as "made of several boxes" with that box, which is also kept as the overall size.
  if (source && !Object.prototype.hasOwnProperty.call(source, "packVolumeMethod")) {
    const dims = [out.packLengthMm, out.packWidthMm, out.packHeightMm];
    if (dims.every((d) => d !== "" && Number(d) > 0)) { out.packVolumeMethod = "boxes"; out.packBoxes = `Enclosure, ${dims.map(Number).join(", ")}`; }
    else out.packVolumeMethod = "cad";
  }
  if (!["cad", "boxes"].includes(out.packVolumeMethod)) out.packVolumeMethod = "cad";
  if (!["bol", "eol"].includes(out.resultsAge)) out.resultsAge = "bol";
  if (!RES_SOURCES.some(([v]) => v === out.cellResIncreaseSource)) out.cellResIncreaseSource = "supplier";
  out.cellTaperStartPct = Math.min(99, Math.max(0, Number(out.cellTaperStartPct)));
  out.cellTaperEndPct = Math.min(100, Math.max(0, Number(out.cellTaperEndPct)));
  out.driveCycle = Sim.normaliseDriveCycle(out.driveCycle);
  return out;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ inputs: state, step: currentStep })); } catch { /* storage unavailable */ }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && saved.inputs) {
      state = cleanInputs(saved.inputs);
      if (droppedSecondModule(saved.inputs)) setTimeout(() => showToast("Your saved design used a second module type, which is no longer supported: the pack now uses the first module type only.", 9000), 800);
      if (typeof saved.step === "string") currentStep = saved.step;
      return;
    }
  } catch { /* ignore */ }
  state = cleanInputs({ ...EXAMPLE, projectDate: today() });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmt(value, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function showToast(message, ms = 2600) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, ms);
}

function range() {
  return Calc.buildRange(state);
}

function visibleSteps() {
  const r = range();
  return STEPS.filter((step) => !step.when || step.when(r));
}

// ---------------------------------------------------------------------------
// Rendering the input forms (once), then binding values
// ---------------------------------------------------------------------------
function fieldHtml(field) {
  const optional = field.optional ? '<span class="optional">optional</span>' : "";
  const unit = field.kind ? `<span class="unit" data-unit-kind="${field.kind}"></span>` : (field.unit ? `<span class="unit">${esc(field.unit)}</span>` : "");
  const help = field.help ? `<small>${esc(field.help)}</small>` : "";
  const cls = `field${field.full || field.type === "textarea" || field.type === "ocv" ? " full" : ""}`;
  const messages = `<span class="warning" data-warning-for="${field.id}" hidden></span>`;

  if (field.type === "segment") {
    return `<div class="${cls}" data-field="${field.id}"><span class="seg-label">${esc(field.label)}</span>
      <div class="seg-toggle" role="group" aria-label="${esc(field.label)}" id="${field.id}">${field.options.map(([v, l]) => `<button type="button" data-seg-value="${esc(v)}" aria-pressed="false">${esc(l)}</button>`).join("")}</div>${help}</div>`;
  }
  if (field.type === "boxes") {
    return `<div class="${cls}" data-field="${field.id}"><span class="seg-label">${esc(field.label)}</span><div class="box-editor" id="${field.id}"></div>${help}</div>`;
  }
  if (field.type === "switch") {
    return `<div class="${cls}" data-field="${field.id}">
      <label class="switch"><input type="checkbox" id="${field.id}"><span class="track" aria-hidden="true"></span><span>${esc(field.label)}</span></label>
      ${help}</div>`;
  }
  let control;
  if (field.type === "select") {
    control = `<select id="${field.id}">${field.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
  } else if (field.type === "textarea") {
    control = `<textarea id="${field.id}" class="plain" rows="3"></textarea>`;
  } else if (field.type === "ocv") {
    control = `<textarea id="${field.id}" rows="7" spellcheck="false" placeholder="0, 3.00&#10;10, 3.45&#10;…&#10;100, 4.20"></textarea>
      <div class="ocv-actions">
        <label class="text-button" for="ocvFile">Load CSV file</label>
        <input type="file" id="ocvFile" accept=".csv,.txt,text/csv,text/plain" hidden>
        <small id="ocvStatus"></small>
      </div>`;
  } else if (field.type === "ratings") {
    return `<div class="${cls}" data-field="${field.id}"><div class="ratings-preview" id="${field.id}" aria-live="polite"></div></div>`;
  } else if (field.type === "wltpinfo") {
    return `<div class="${cls}" data-field="${field.id}">
      <div class="info-row"><button type="button" class="text-button info-button" data-open-dialog="wltpDialog" aria-haspopup="dialog">
        <span class="i" aria-hidden="true">i</span>Which WLTP class?</button>
      <small id="wltpGuide"></small></div></div>`;
  } else if (field.type === "profile") {
    control = `<div class="ocv-actions">
        <label class="text-button" for="profileFile">Load CSV file</label>
        <input type="file" id="profileFile" accept=".csv,.txt,text/csv,text/plain" hidden>
        <button type="button" class="text-button" id="profileClear">Clear</button>
        <small id="profileStatus"></small>
      </div>`;
  } else if (field.type === "speedlist") {
    control = `<input type="text" id="${field.id}" autocomplete="off" inputmode="decimal" placeholder="30, 50, 60, 70">`;
  } else if (field.type === "tyre") {
    control = `<input type="text" id="${field.id}" autocomplete="off" spellcheck="false" placeholder="205/55 R16"><small id="tyreStatus"></small>`;
  } else if (field.type === "text" || field.type === "date") {
    control = `<input type="${field.type}" id="${field.id}" autocomplete="off">`;
  } else {
    control = `<input type="number" id="${field.id}" inputmode="decimal"${field.step ? ` step="${field.step}"` : ""}${field.min !== undefined ? ` min="${field.min}"` : ' min="0"'}>`;
  }
  const labelFor = field.type === "profile" ? "" : ` for="${field.id}"`;
  const unitHtml = field.type === "speedlist" ? `<span class="unit" data-unit-kind="speed"></span>` : unit;
  const labelHtml = `<label${labelFor}><span>${esc(field.label)} ${optional}</span>${unitHtml}</label>`;
  const topic = window.VoltReadme?.fieldTopics[field.id];
  return `<div class="${cls}" data-field="${field.id}">
    ${topic ? `<div class="label-row">${labelHtml}${infoButton(topic)}</div>` : labelHtml}
    ${control}${help}${messages}</div>`;
}

function infoButton(topicId) {
  const topic = window.VoltReadme?.byId[topicId];
  return topic ? `<button type="button" class="info-dot" data-info="${topicId}" aria-label="About: ${esc(topic.title)}" title="${esc(topic.title)}">i</button>` : "";
}

function openInfo(topicId) {
  const topic = window.VoltReadme?.byId[topicId];
  const dialog = $("#infoDialog");
  if (!topic || !dialog) return;
  $("#infoDialogTitle").textContent = topic.title;
  $("#infoDialogBody").innerHTML = topic.html; // trusted, static content from readme-content.js
  $("#infoDialogLink").href = `readme.html#${topicId}`;
  dialog.showModal();
  $("#infoDialogBody").scrollTop = 0;
}

function blockHtml(block, index, stepId) {
  const body = `<div class="field-grid">${block.fields.map(fieldHtml).join("")}</div>`;
  const topic = window.VoltReadme?.blockTopics[`${stepId}-${index}`];
  const info = topic ? infoButton(topic) : "";
  if (block.more) {
    return `<details class="more" data-block="${stepId}-${index}">
      <summary>${esc(block.title)}${info}<span class="tag">${esc(block.tag || "optional")}</span></summary>
      <div class="more-body">${body}</div></details>`;
  }
  return `<section class="card" data-block="${stepId}-${index}"><h2>${esc(block.title)}${info}</h2>${body}</section>`;
}

function renderSteps() {
  const container = $("#steps");
  container.innerHTML = STEPS.map((step) => {
    if (step.results) return `<section class="step" id="step-results" data-step="results" hidden><div id="resultsBody"></div></section>`;
    if (step.custom) return `<section class="step" id="step-${step.id}" data-step="${step.id}" hidden><div id="${step.id}Body"></div></section>`;
    return `<section class="step" id="step-${step.id}" data-step="${step.id}" hidden>
      <div class="step-head">
        <p class="eyebrow" data-step-eyebrow="${step.id}"></p>
        <h1>${esc(step.title)}</h1>
        <p>${esc(step.intro || "")}</p>
      </div>
      <div class="notice error" data-step-errors="${step.id}" hidden></div>
      ${step.blocks.map((block, i) => blockHtml(block, i, step.id)).join("")}
      <div class="step-footer">
        <button type="button" class="button" data-nav="prev">Back</button>
        <button type="button" class="button primary" data-nav="next">Next</button>
      </div>
    </section>`;
  }).join("");
}

function setControlValues() {
  for (const field of ALL_FIELDS) {
    const el = document.getElementById(field.id);
    if (!el || field.type === "profile" || field.type === "wltpinfo" || field.type === "ratings") continue;
    const value = state[field.id];
    if (field.type === "segment") { $$("[data-seg-value]", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.segValue === value))); continue; }
    if (field.type === "boxes") { renderBoxEditor(el); continue; }
    if (field.type === "switch") el.checked = !!value;
    else if (field.type === "speedlist") el.value = speedListToDisplay(value);
    else if (field.kind && value !== "" && Number.isFinite(Number(value))) el.value = String(Number(toDisplay(field.kind, Number(value)).toFixed(4)) * 1);
    else el.value = value ?? "";
  }
  $("#buildStart").value = state.buildStart;
  $("#buildEnd").value = state.buildEnd;
  updateUnitLabels();
  updateOcvStatus();
  updateTyreStatus(false);
  updateProfileStatus();
  updateWltpGuide();
  updatePresetNote();
  updateRatingsPreviews();
}

// Enclosure sections editor: rows of name, length, width, height (mm), kept in state as text lines.
function boxRowsFromState() {
  const rows = String(state.packBoxes || "").split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const parts = line.split(/[,;\t]/).map((x) => x.trim());
    const dims = parts.length >= 3 ? parts.slice(-3) : ["", "", ""];
    return { name: parts.length > 3 ? parts.slice(0, -3).join(", ") : "", l: dims[0], w: dims[1], h: dims[2] };
  });
  return rows.length ? rows : [{ name: "", l: "", w: "", h: "" }];
}
function renderBoxEditor(el, rows = boxRowsFromState()) {
  const litres = (r) => (Number(r.l) > 0 && Number(r.w) > 0 && Number(r.h) > 0 ? Number(r.l) * Number(r.w) * Number(r.h) / 1e6 : null);
  const total = rows.reduce((sum, r) => sum + (litres(r) || 0), 0);
  el.innerHTML = `<div class="box-head"><span>Section</span><span>Length mm</span><span>Width mm</span><span>Height mm</span><span>Volume</span><span></span></div>`
    + rows.map((r, i) => `<div class="box-row" data-box-row="${i}">
      <input type="text" data-box-col="name" value="${esc(r.name)}" placeholder="e.g. Main tray" aria-label="Section ${i + 1} name" autocomplete="off">
      <input type="number" min="0" step="1" inputmode="decimal" data-box-col="l" value="${esc(r.l)}" aria-label="Section ${i + 1} length, mm">
      <input type="number" min="0" step="1" inputmode="decimal" data-box-col="w" value="${esc(r.w)}" aria-label="Section ${i + 1} width, mm">
      <input type="number" min="0" step="1" inputmode="decimal" data-box-col="h" value="${esc(r.h)}" aria-label="Section ${i + 1} height, mm">
      <strong data-box-litres>${litres(r) !== null ? `${fmt(litres(r), 1)} L` : "—"}</strong>
      <button type="button" class="box-remove" data-box-remove="${i}" aria-label="Remove section ${i + 1}"${rows.length === 1 ? " disabled" : ""}>×</button></div>`).join("")
    + `<div class="box-foot"><button type="button" class="text-button" data-box-add>+ Add a section</button><span>Total <strong data-box-total>${total > 0 ? `${fmt(total, 1)} L` : "—"}</strong></span></div>`;
}
function readBoxEditor(el) {
  return $$("[data-box-row]", el).map((row) => {
    const v = (c) => row.querySelector(`[data-box-col="${c}"]`).value.trim();
    return { name: v("name").replace(/[,;\t\r\n]/g, " "), l: v("l"), w: v("w"), h: v("h") };
  });
}
function boxRowsToText(rows) {
  return rows.filter((r) => r.name || r.l || r.w || r.h).map((r) => `${r.name ? `${r.name}, ` : ""}${r.l}, ${r.w}, ${r.h}`).join("\n");
}

function readControl(field) {
  const el = document.getElementById(field.id);
  if (field.type === "switch") return el.checked;
  if (field.type === "speedlist") return speedListFromDisplay(el.value);
  if (["text", "textarea", "select", "ocv", "tyre", "date"].includes(field.type)) return el.value;
  if (el.value === "") return "";
  const n = Number(el.value);
  if (!Number.isFinite(n)) return "";
  return field.kind ? fromDisplay(field.kind, n) : n;
}

function updateUnitLabels() {
  $$("[data-unit-kind]").forEach((el) => { el.textContent = unitLabel(el.dataset.unitKind); });
  $$(".units-toggle button").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.units === state.units)));
}

function updateVisibility() {
  for (const step of STEPS) {
    if (!step.blocks) continue;
    step.blocks.forEach((block, i) => {
      const el = document.querySelector(`[data-block="${step.id}-${i}"]`);
      if (el) el.hidden = block.showIf ? !block.showIf(state) : false;
      for (const field of block.fields) {
        const wrap = document.querySelector(`[data-field="${field.id}"]`);
        if (wrap) wrap.hidden = field.showIf ? !field.showIf(state) : false;
      }
    });
  }
}

function renderNav() {
  const steps = visibleSteps();
  const build = Calc.computeBuild(state);
  const errorSteps = new Set(build.errors.map((e) => e.step));
  let n = 0;
  let html = "";
  let optionalShown = false;
  for (const step of steps) {
    if (step.optional && !optionalShown) { html += '<p class="group-label">Optional</p>'; optionalShown = true; }
    if (step.results) html += '<p class="group-label">Output</p>';
    const label = step.optional || step.results || step.output ? "" : String(++n).padStart(2, "0");
    let badge = "";
    if (step.optional) badge = state[step.optional] ? '<span class="badge on">On</span>' : '<span class="badge">Off</span>';
    if (errorSteps.has(step.id)) badge = '<span class="badge error">Check</span>';
    html += `<a href="#${step.id}" class="step-link" data-goto="${step.id}"${step.id === currentStep ? ' aria-current="page"' : ""}>
      <span class="num">${label}</span>${esc(step.title)}${badge}</a>`;
  }
  $("#stepNav").innerHTML = html;
  // Eyebrows show the step number in the current build path.
  let k = 0;
  for (const step of steps) {
    const eyebrow = document.querySelector(`[data-step-eyebrow="${step.id}"]`);
    if (!eyebrow) continue;
    eyebrow.textContent = step.optional ? "Optional section" : `Step ${String(++k).padStart(2, "0")} · ${pathLabel()}`;
  }
}

function pathLabel() {
  const r = range();
  const names = { cell: "Cell", module: "Module", pack: "Pack", vehicle: "Vehicle" };
  return `${names[r.start]} → ${names[r.end]}`;
}

function showStep(id, { focus = false } = {}) {
  const steps = visibleSteps();
  if (!steps.some((s) => s.id === id)) id = steps[0].id;
  if (id !== "results" && chartState.playing) pauseChart();
  currentStep = id;
  for (const section of $$(".step")) section.hidden = section.dataset.step !== id;
  renderNav();
  updateStepErrors();
  if (id === "results") renderResults();
  if (id === "report" && typeof renderReportStep === "function") renderReportStep();
  if (id === "compare" && typeof renderCompareStep === "function") renderCompareStep();
  closeMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (focus) $(`#step-${id} h1, #step-${id} .results-hero h1`)?.focus?.();
  saveState();
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
}

function stepOffset(delta) {
  const steps = visibleSteps();
  const i = steps.findIndex((s) => s.id === currentStep);
  const next = steps[Math.min(steps.length - 1, Math.max(0, i + delta))];
  if (next) showStep(next.id);
}

function updateStepErrors() {
  const build = Calc.computeBuild(state);
  for (const step of STEPS) {
    const box = document.querySelector(`[data-step-errors="${step.id}"]`);
    if (!box) continue;
    const errs = build.errors.filter((e) => e.step === step.id);
    box.hidden = errs.length === 0;
    box.innerHTML = errs.length ? `<strong>Please check</strong><ul>${errs.map((e) => `<li>${esc(e.text)}</li>`).join("")}</ul>` : "";
  }
  $$("[data-warning-for]").forEach((el) => { el.hidden = true; el.textContent = ""; });
  $$("input.has-warning").forEach((el) => el.classList.remove("has-warning"));
  for (const w of build.warnings) {
    const el = document.querySelector(`[data-warning-for="${w.id}"]`);
    if (el) { el.hidden = false; el.textContent = w.text; }
    document.getElementById(w.id)?.classList.add("has-warning");
  }
}

// Speed list (stored in mph, shown in the selected units)
function parseNumberList(text) {
  return String(text || "").split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 12);
}
function speedListToDisplay(stored) {
  return parseNumberList(stored).map((mph) => String(Math.round(toDisplay("speed", mph) * 10) / 10)).join(", ");
}
function speedListFromDisplay(text) {
  return parseNumberList(text).map((v) => String(Math.round(fromDisplay("speed", v) * 1000) / 1000)).join(", ");
}

function updateProfileStatus() {
  const status = $("#profileStatus");
  if (!status) return;
  status.className = "";
  if (!String(state.customProfileText || "").trim()) { status.textContent = "No profile loaded."; return; }
  const parsed = Sim.parseSpeedProfile(state.customProfileText, state.customProfileUnit);
  if (parsed.speedsMps.length < 11) { status.className = "status-warn"; status.textContent = parsed.errors.join(" ") || "Profile could not be read."; return; }
  const name = state.customProfileName ? `${state.customProfileName}: ` : "";
  status.className = parsed.errors.length ? "status-warn" : "status-ok";
  status.textContent = `${name}${fmt(parsed.durationS / 60, 1)} min, ${dist(parsed.distanceKm / KM_PER_MILE, 2)}, max ${speed(parsed.maxKmh / KM_PER_MILE)}.${parsed.errors.length ? " " + parsed.errors.join(" ") : ""}`;
}

// WLTP class guide: PMR = rated power ÷ kerb mass (GTR 15). Motor peak power
// is used as the rated power, and kerb mass includes the calculated pack.
function updateWltpGuide() {
  const guide = $("#wltpGuide");
  if (!guide) return;
  const build = Calc.computeBuild(state);
  const powerKW = state.motorEnabled ? Number(state.motorPeakKW) || 0 : 0;
  if (!build.vehicleMassKg || !(powerKW > 0)) {
    guide.textContent = "Enter motor peak power (Vehicle › Motor & drivetrain) for a class suggestion.";
    return;
  }
  const pmr = powerKW * 1000 / build.vehicleMassKg;
  let text = `Power-to-mass ≈ ${fmt(pmr, 0)} W/kg (motor peak ÷ kerb mass) → `;
  if (pmr > 34) {
    const vehicle = Sim.buildVehicleModel(build.engineInput);
    const vmaxKmh = Number.isFinite(vehicle.topSpeedMps) ? vehicle.topSpeedMps * 3.6 : null;
    text += vmaxKmh === null ? "Class 3: 3b if top speed ≥ 120 km/h (74.6 mph), otherwise 3a."
      : `Class 3${vmaxKmh >= 120 ? "b" : "a"} (top speed ${fmt(vmaxKmh, 0)} km/h).`;
  } else if (pmr > 22) {
    text += "Class 2.";
  } else {
    text += "Class 1 (not offered; Class 2 is the closest).";
  }
  guide.textContent = text;
}

function updatePresetNote() {
  const wrap = document.querySelector('[data-field="vehPreset"]');
  if (!wrap) return;
  let note = wrap.querySelector(".preset-note");
  if (!note) { note = document.createElement("small"); note.className = "preset-note"; wrap.appendChild(note); }
  const preset = VEHICLE_PRESETS[state.vehPreset];
  if (!preset) { note.hidden = true; return; }
  const changed = Math.abs(Number(state.cd) - preset.cd) > 1e-9 || Math.abs(Number(state.frontalAreaM2) - presetArea(preset)) > 1e-9 || Math.abs(Number(state.crr) - preset.crr) > 1e-9;
  note.hidden = false;
  note.textContent = `${changed ? "Values edited since the preset was applied. " : ""}Typical values: Cd ${preset.cd}, frontal area ${presetArea(preset)} m² (from CdA ${preset.cda} m²), Crr ${preset.crr}. Based on: ${preset.basis}`;
}

function applyPreset() {
  const preset = VEHICLE_PRESETS[state.vehPreset];
  if (!preset) return;
  state.cd = preset.cd;
  state.frontalAreaM2 = presetArea(preset);
  state.crr = preset.crr;
  for (const id of ["cd", "frontalAreaM2", "crr"]) document.getElementById(id).value = String(state[id]);
}

// Rating sources, as shown to the user.
function sourceText(src) {
  return { cells: "cells", module: "module rating", "module datasheet": "module datasheet", pack: "pack rating" }[src] || src || "—";
}
const ratingValue = (v, unit) => (Number.isFinite(v) ? `${fmt(v, 0)} ${unit}` : (unit === "s" ? "no limit" : "—"));

// "What the module / pack will use" tables under the rating inputs.
function updateRatingsPreviews() {
  const targets = [["modRatingsPreview", "module"], ["packRatingsPreview", "pack"]];
  const build = Calc.computeBuild(state);
  for (const [id, level] of targets) {
    const box = document.getElementById(id);
    if (!box) continue;
    const item = level === "module" ? build.module1 : build.pack;
    if (build.errors.length || !item) { box.innerHTML = '<p class="help">Fix the inputs marked “Please check” to see what will be used.</p>'; continue; }
    const head = level === "module"
      ? [`Cells × ${fmt(item.parallel, 0)} in parallel`, "Module entry", "Module rating used"]
      : [`Module × ${fmt(item.strings, 0)} string${item.strings === 1 ? "" : "s"}`, "Pack entry", "Pack rating used"];
    const mine = level === "module" ? "module" : "pack";
    const replace = item.ratingsMode === "replace";
    const rows = item.ratingRows.map((r) => {
      const usedMine = r.source === mine;
      const warn = replace && r.entry !== null && r.entry > r.before + 1e-9;
      return `<tr><td>${esc(r.label)}</td><td class="${usedMine ? "dim" : ""}">${ratingValue(r.before, r.unit)}</td>
        <td class="${!usedMine && r.entry !== null ? "dim" : ""}">${r.entry === null ? "—" : ratingValue(r.entry, r.unit)}</td>
        <td class="${usedMine ? "mine" : ""}">${ratingValue(r.used, r.unit)} · ${esc(sourceText(r.source))}${warn ? ' <span class="warn">above the level below</span>' : ""}</td></tr>`;
    }).join("");
    box.innerHTML = `<p class="ratings-title">What the ${level} will use</p>
      <div class="table-wrap"><table class="data ratings-table"><thead><tr><th></th>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="help">${replace ? `As the ${level} rating: your entries are used, higher or lower. A value left at 0 keeps the figure from the level below.` : "As limits: the lower figure in each row is used. A value left at 0 keeps the figure from the level below."}</p>`;
  }
}

// OCV table and tyre helpers
function updateOcvStatus() {
  const status = $("#ocvStatus");
  if (!status) return;
  const text = state.cellOcvTable || "";
  status.className = "";
  if (!text.trim()) { status.textContent = "No table: the nominal voltage is used as a constant OCV."; return; }
  const parsed = Sim.parseOcvTable(text);
  if (!parsed.points.length) { status.className = "status-warn"; status.textContent = parsed.errors.join(" ") || "Table could not be read."; return; }
  const a = parsed.points[0];
  const b = parsed.points[parsed.points.length - 1];
  status.className = parsed.errors.length ? "status-warn" : "status-ok";
  status.textContent = `${parsed.points.length} points: ${fmt(a.v, 2)} V at ${fmt(a.soc, 0)} % to ${fmt(b.v, 2)} V at ${fmt(b.soc, 0)} %.${parsed.errors.length ? " " + parsed.errors.join(" ") : ""}`;
}

function updateTyreStatus(fillRadius) {
  const status = $("#tyreStatus");
  if (!status) return;
  status.className = "";
  if (!String(state.tyreSize || "").trim()) { status.textContent = ""; return; }
  const tyre = Sim.parseTyreSize(state.tyreSize);
  if (!tyre) { status.className = "status-warn"; status.textContent = "Size not recognised. Use e.g. 205/55 R16 or 31x10.50 R15."; return; }
  const rolling = Math.round(tyre.rollingRadiusMm);
  if (fillRadius) {
    state.tyreRadiusMm = rolling;
    const el = document.getElementById("tyreRadiusMm");
    if (el) el.value = String(rolling);
  }
  status.className = "status-ok";
  status.textContent = `${tyre.description}: unloaded ${fmt(tyre.unloadedRadiusMm, 0)} mm, rolling about ${rolling} mm (98 %).`;
}

// ---------------------------------------------------------------------------
// Results: calculation
// ---------------------------------------------------------------------------
const dist = (miles, d = 1) => `${fmt(toDisplay("distance", miles), d)} ${unitLabel("distance")}`;
const speed = (mph, d = 0) => `${fmt(toDisplay("speed", mph), d)} ${unitLabel("speed")}`;
const whPerDist = (kWhPerMile) => (state.units === "metric" ? `${fmt(kWhPerMile * 1000 / KM_PER_MILE, 0)} Wh/km` : `${fmt(kWhPerMile * 1000, 0)} Wh/mile`);
const efficiency = (kWhPerMile) => (state.units === "metric" ? `${fmt(KM_PER_MILE / kWhPerMile, 2)} km/kWh` : `${fmt(1 / kWhPerMile, 2)} miles/kWh`);

function requirementStatus(required, available) {
  if (!(required > 0)) return null;
  const margin = available > 0 ? (available - required) / required * 100 : -100;
  if (available < required) return { cls: "fail", label: "FAIL", text: `${fmt(Math.abs(margin), 1)} % short`, margin };
  if (margin < 10) return { cls: "warn", label: "WARNING", text: `${fmt(margin, 1)} % margin`, margin };
  return { cls: "pass", label: "PASS", text: `${fmt(margin, 1)} % margin`, margin };
}

// End of life (v2.12): the same design with cell (or module datasheet) capacity × end-of-life %
// and internal resistance × (1 + increase). Everything else is recalculated from those.
function eolAvailable(s = state) {
  return !!s.lifeEnabled && hasValue(s.cellResIncreasePct) && Number(s.cellResIncreasePct) >= 0;
}
function agedInputs(s) {
  const k = Math.min(100, Math.max(0, Number(s.lifeEolPct) || 0)) / 100;
  const r = 1 + Math.max(0, Number(s.cellResIncreasePct) || 0) / 100;
  const out = { ...s };
  if (s.buildStart === "module") {
    out.mdCapacityAh = (Number(s.mdCapacityAh) || 0) * k;
    out.mdDcirMOhm = (Number(s.mdDcirMOhm) || 0) * r;
  } else {
    out.cellCapacityAh = (Number(s.cellCapacityAh) || 0) * k;
    out.cellDcirMOhm = (Number(s.cellDcirMOhm) || 0) * r;
  }
  return out;
}
function ageLabel(age) { return age === "eol" ? "end of life" : "beginning of life"; }

function computeAll() {
  const bol = computeCore();
  if (!eolAvailable() || bol.build.errors.length || !bol.build.pack) return { ...bol, age: "bol", eolAvailable: false };
  const saved = state;
  let eol;
  try { state = agedInputs(saved); eol = computeCore(); } finally { state = saved; }
  if (eol.build.errors.length) return { ...bol, age: "bol", eolAvailable: false };
  eol.lifetime = bol.lifetime; // lifetime figures describe the application, from new
  const view = state.resultsAge === "eol" ? "eol" : "bol";
  const shown = { ...(view === "eol" ? eol : bol) };
  shown.age = view;
  shown.eolAvailable = true;
  shown.bol = bol;
  shown.eol = eol;
  if (bol.requirements && eol.requirements) shown.requirements = mergeRequirements(bol.requirements, eol.requirements, view);
  return shown;
}

// Requirement check at both ages: the chips shown follow the Results switch, the other age is
// shown underneath, and the summary counts the ages chosen under "Requirements must be met at".
function mergeRequirements(b, e, view) {
  const main = view === "eol" ? e : b;
  const other = view === "eol" ? b : e;
  const otherAge = view === "eol" ? "bol" : "eol";
  const rows = main.rows.map((row) => {
    const o = other.rows.find((r) => r.label === row.label);
    const cells = {};
    for (const [id, x] of Object.entries(row.cells)) {
      const y = o && o.cells[id];
      // Shown only where the other age gives a different result.
      cells[id] = x && y && x.cls !== "na" && y.cls !== "na" && y.chip && y.chip !== x.chip ? { ...x, other: { cls: y.cls, chip: y.chip, age: otherAge } } : x;
    }
    return { ...row, cells };
  });
  const mode = ["bol", "eol", "both"].includes(state.reqAgeMode) ? state.reqAgeMode : "both";
  const tag = (list, age) => list.map((t) => ({ t, age }));
  const join = (bl, el) => {
    const out = [];
    const all = [...tag(bl, "bol"), ...tag(el, "eol")];
    for (const x of all) {
      if (out.some((y) => y.t === x.t)) { out.find((y) => y.t === x.t).age = "both"; continue; }
      out.push({ ...x });
    }
    return out.map((x) => `${x.t} ${x.age === "both" ? "at both ages" : `at ${ageLabel(x.age)}`}`);
  };
  const counted = (list, age) => (mode === "both" || mode === age ? list : []);
  const fails = join(counted(b.fails, "bol"), counted(e.fails, "eol"));
  const warns = join(counted(b.warns, "bol"), counted(e.warns, "eol"));
  const ignoredAge = mode === "bol" ? "eol" : mode === "eol" ? "bol" : null;
  // Failures only at the age that is not counted (the same failure at both ages is already counted).
  const notCounted = ignoredAge ? (ignoredAge === "eol" ? e.fails.filter((t) => !b.fails.includes(t)) : b.fails.filter((t) => !e.fails.includes(t))) : [];
  return { ...main, rows, fails, warns, notCounted, ages: { view, mode, ignoredAge } };
}

function computeCore() {
  const build = Calc.computeBuild(state);
  const out = { build, packModel: null, atLimits: null, vehicle: null, requirements: null, lifetime: null, charging: null, heat: null };
  if (build.errors.length || !build.pack) return out;

  const ei = build.engineInput || Calc.toEngineInput(state, build.range, build.pack, build.cell);
  const packModel = Sim.buildPackModel(ei);
  const lowSoc = packModel.socBottom + (packModel.socTop - packModel.socBottom) * LOW_CHARGE / 100;
  // The pack on its own (no inverter / controller limit): used for pack figures.
  // The vehicle model (packModel) keeps the inverter limit for the simulation and performance.
  const packOnly = Sim.buildPackModel({ ...ei, motorLimitsEnabled: false });
  out.packModel = packModel;
  out.packOnlyModel = packOnly;
  LIMIT_SOURCES = { peak: build.pack.peakSource, cont: build.pack.contSource };
  out.lowSoc = lowSoc;
  out.atLimits = {
    full: Sim.dischargeCapability(packOnly, packOnly.socTop),
    low: Sim.dischargeCapability(packOnly, lowSoc),
    hasSag: packModel.resistanceOhm > 0 || packModel.hasOcvTable
  };

  out.charging = chargingData(build, packOnly);

  if (build.engineInput) {
    const sim = Sim.simulateDriveCycle(ei);
    out.vehicle = {
      sim: sim.ok ? sim : null,
      simError: sim.ok ? null : sim.reason,
      fullTop: Sim.fullPowerTest(ei, packModel.socTop),
      fullLow: Sim.fullPowerTest(ei, lowSoc),
      sustainedTop: Sim.maxSustainedSpeedMph(ei, packModel.socTop),
      sustainedLow: Sim.maxSustainedSpeedMph(ei, lowSoc),
      massKg: build.vehicleMassKg + Math.max(0, Number(state.payloadKg) || 0),
      speedTable: Sim.constantSpeedTable(ei, parseNumberList(state.speedTable))
    };
  }

  out.heat = heatData(build, out);

  // Design requirements, checked at every level the current passes through:
  // cell (each), module, pack, inverter/controller (DC current) and motor.
  if (state.reqEnabled) out.requirements = requirementMatrix(build, out);

  // Lifetime & duty cycle
  if (state.lifeEnabled) {
    const p = build.pack;
    const sim = out.vehicle?.sim;
    const auto = state.lifeConsumptionSource !== "manual" && sim && sim.consumptionKWhPerMile > 0;
    const cons = auto ? sim.consumptionKWhPerMile : Math.max(0, Number(state.lifeConsumptionKWhPerMile) || 0);
    const years = Math.max(0, Number(state.lifeYears) || 0);
    const miles = Math.max(0, Number(state.lifeDistanceMiles) || 0);
    const eol = Math.min(100, Math.max(0, Number(state.lifeEolPct) || 0));
    const throughput = miles * cons;
    out.lifetime = {
      consumptionSource: auto ? "from simulation" : "manual",
      noConsumption: !(cons > 0),
      cons, years, miles, eol,
      annualMiles: years > 0 ? miles / years : null,
      throughputKWh: throughput,
      perYearKWh: years > 0 ? throughput / years : null,
      perDayKWh: years > 0 ? throughput / years / 365 : null,
      cycles: p.usableKWh > 0 ? throughput / p.usableKWh : null,
      bolUsable: p.usableKWh,
      eolUsable: p.usableKWh * eol / 100,
      bolRangeMiles: sim ? sim.distanceMiles : (cons > 0 ? p.usableKWh / cons : null),
      eolRangeMiles: cons > 0 ? p.usableKWh * eol / 100 / cons : null,
      socWindow: [out.packModel.socBottom, out.packModel.socTop]
    };
  }
  return out;
}

// Pack resistance for heat: cells (from the internal resistance entered) + optional extra.
function extraPackOhm() {
  return hasValue(state.packExtraResMOhm) ? Math.max(0, Number(state.packExtraResMOhm)) / 1000 : 0;
}

// Charging (v2.12): step by step across the charge with the engine's chargeSession.
// "base" figures are the old best case (no taper, no losses) for comparison.
function chargingData(build, pm) {
  const p = build.pack;
  const acKW = Math.max(0, Number(state.acChargerKW) || 0);
  const dcKW = Math.max(0, Number(state.dcChargerKW) || 0);
  if (!p || !(acKW > 0 || dcKW > 0)) return null;
  const limitA = p.chargeA;
  const taper = state.cellTaperEnabled ? { startPct: Number(state.cellTaperStartPct), endPct: Number(state.cellTaperEndPct) } : null;
  const effPct = hasValue(state.acChargerEffPct) && Number(state.acChargerEffPct) > 0 ? Math.min(100, Number(state.acChargerEffPct)) : null;
  const extra = extraPackOhm();
  const base = { currentLimitA: limitA, taper: null, extraResistanceOhm: 0 };
  const basePack = { ...pm, resistanceOhm: 0 };
  const real = { currentLimitA: limitA, taper, extraResistanceOhm: extra };
  const out = {
    packLimitA: limitA,
    packLimitKWLow: limitA * pm.ocv(pm.socBottom) / 1000,
    packLimitKWHigh: limitA * pm.ocv(pm.socTop) / 1000,
    taper, effPct, ac: null, dc: null, curve: null, curveLabel: null, curveChargerKW: null
  };
  if (acKW > 0) {
    const opts = { ...real, chargerKW: acKW, efficiencyPct: effPct || 0 };
    const full = Sim.chargeSession(pm, { ...opts, fromPct: 0, toPct: 100 });
    const b = Sim.chargeSession(basePack, { ...base, chargerKW: acKW, fromPct: 0, toPct: 100 });
    out.ac = { kW: acKW, intoPackKW: acKW * (effPct || 100) / 100, hours: full.ok ? full.minutes / 60 : null, baseHours: b.ok ? b.minutes / 60 : null, socketKWh: full.socketKWh, storedKWh: full.storedKWh, heatKWh: full.heatKWh, limitedBy: full.limitedBy, maxCurrentA: full.maxCurrentA, maxHeatKW: full.maxHeatKW, reason: full.reason };
  }
  if (dcKW > 0) {
    const opts = { ...real, chargerKW: dcKW, efficiencyPct: 0 };
    const a = Sim.chargeSession(pm, { ...opts, fromPct: 10, toPct: 80 });
    const f = Sim.chargeSession(pm, { ...opts, fromPct: 10, toPct: 100 });
    const ba = Sim.chargeSession(basePack, { ...base, chargerKW: dcKW, fromPct: 10, toPct: 80 });
    const bf = Sim.chargeSession(basePack, { ...base, chargerKW: dcKW, fromPct: 10, toPct: 100 });
    out.dc = { kW: dcKW, min1080: a.ok ? a.minutes : null, min10100: f.ok ? f.minutes : null, base1080: ba.ok ? ba.minutes : null, base10100: bf.ok ? bf.minutes : null,
      limitedBy: f.limitedBy, limitedBy1080: a.limitedBy, maxCurrentA: f.maxCurrentA, maxHeatKW: f.maxHeatKW, heatKWh: f.heatKWh, reason: f.reason };
  }
  const curveKW = dcKW > 0 ? dcKW : acKW;
  out.curve = Sim.chargeCurve(pm, { ...real, chargerKW: curveKW, efficiencyPct: dcKW > 0 ? 0 : (effPct || 0) }, 101);
  out.curveLabel = dcKW > 0 ? "DC" : "AC";
  out.curveChargerKW = dcKW > 0 ? dcKW : acKW * (effPct || 100) / 100;
  return out;
}

// Heat from the cells (v2.12): I² × R at the main operating points.
function heatData(build, all) {
  const p = build.pack;
  if (!p || !all.packOnlyModel) return null;
  const cellR = all.packOnlyModel.resistanceOhm;
  const extra = extraPackOhm();
  const R = cellR + extra;
  if (!(R > 0)) return { R: 0 };
  const kw = (a) => a * a * R / 1000;
  const rows = [];
  rows.push({ key: "peak", label: "Peak pulse", amps: p.peakA, kW: kw(p.peakA), note: p.peakDurationS ? `for ${fmt(p.peakDurationS, 0)} s · ${fmt(kw(p.peakA) * p.peakDurationS, 0)} kJ per pulse` : "" });
  rows.push({ key: "cont", label: "Continuous rating", amps: p.contA, kW: kw(p.contA), note: "highest steady heat the ratings allow" });
  const sim = all.vehicle?.sim;
  if (sim) rows.push({ key: "drive", label: "Highest point in the drive", amps: sim.peakDischargeCurrentA, kW: kw(sim.peakDischargeCurrentA), note: esc(sim.driveCycleLabel) });
  const dc = all.charging?.dc;
  if (dc && dc.maxCurrentA > 0) rows.push({ key: "dc", label: `DC charging at ${fmt(dc.kW, 0)} kW`, amps: dc.maxCurrentA, kW: kw(dc.maxCurrentA), note: "highest point of the charge" });
  let driveKWh = null, avgKW = null, pctOfEnergy = null;
  if (sim && cellR > 0 && sim.packLossKWh > 0) {
    driveKWh = sim.packLossKWh * R / cellR;
    avgKW = sim.runtimeMinutes > 0 ? driveKWh / (sim.runtimeMinutes / 60) : null;
    pctOfEnergy = sim.dischargeEnergyKWh > 0 ? driveKWh / sim.dischargeEnergyKWh * 100 : null;
    if (avgKW !== null) rows.push({ key: "avg", label: "Average over the drive", amps: avgKW > 0 ? Math.sqrt(avgKW * 1000 / R) : 0, kW: avgKW, note: "root-mean-square current" });
  }
  return { R, cellR, extra, rows, driveKWh, avgKW, pctOfEnergy };
}

// Requirement matrix. Each target is shared out like the current and energy:
// currents per module = pack ÷ parallel strings, per cell = pack ÷ (cells in parallel × strings);
// power and energy per module = pack ÷ number of modules, per cell = pack ÷ number of cells.
function requirementMatrix(build, all) {
  const p = build.pack;
  const m = build.module1;
  const c = build.cell;
  const pm = all.packModel;
  const hasVehicle = !!all.vehicle;
  const motorOn = hasVehicle && state.motorEnabled;
  const ctrlA = motorOn && Number(state.controllerMaxA) > 0 ? Number(state.controllerMaxA) : null;
  const eff = motorOn && Number(state.motorEffPct) > 0 ? Math.min(100, Number(state.motorEffPct)) / 100 : null;
  const motorKW = (kw) => (motorOn && Number(kw) > 0 ? Number(kw) / (eff || 1) : null);
  const motorTag = eff ? " battery-side" : " (datasheet)";
  const toA = (value, unit) => (unit === "kW" ? value * 1000 / p.nominalV : value);
  const toKW = (value, unit) => (unit === "kW" ? value : value * p.nominalV / 1000);
  const strings = p.strings;
  const cellsParallel = c ? m.parallel * strings : null;
  const cellCount = c ? p.cells : null;
  const moduleCount = p.moduleCount;

  const levels = [
    ...(c ? [{ id: "cell", label: "Cell (each)", short: "cells" }] : []),
    { id: "module", label: "Module (each)", short: "modules" },
    { id: "pack", label: "Pack", short: "pack" },
    ...(hasVehicle ? [{ id: "drive", label: "Inverter & motor", short: "inverter & motor" }] : [])
  ];
  const margin = (required, available, unit, d, extra = "") => {
    const st = requirementStatus(required, available);
    if (!st) return null;
    const sign = st.margin >= 0 ? "+" : "−";
    return { cls: st.cls, chip: `${st.label === "WARNING" ? "WARN" : st.label} ${sign}${fmt(Math.abs(st.margin), 1)} %`, detail: `${fmt(required, d)} / ${fmt(available, d)} ${unit}${extra}`, margin: st.margin, lines: [] };
  };
  const duration = (required, available, rated) => {
    if (!(available > 0) || !Number.isFinite(available)) return { cls: "na", chip: "—", detail: rated || "no peak time rated", lines: [] };
    const ok = available >= required;
    return { cls: ok ? "pass" : "fail", chip: ok ? "PASS" : `FAIL −${fmt((required - available) / required * 100, 1)} %`, detail: `${fmt(available, 0)} s rated`, margin: ok ? 100 : (available - required) / required * 100, lines: [] };
  };
  // Inverter & motor: show the weaker, list the other underneath.
  const drive = (parts) => {
    const results = parts.filter((x) => x.res && x.res.cls !== "na");
    if (!results.length) {
      const notes = parts.filter((x) => x.note).map((x) => ({ text: `${x.name}: ${x.note}` }));
      return notes.length ? { cls: "na", chip: "—", detail: notes.map((n) => n.text).join(" · "), lines: [] } : null;
    }
    results.sort((a, b) => a.res.margin - b.res.margin);
    const worst = results[0];
    const out = { ...worst.res, detail: `${worst.name}: ${worst.res.detail}`, lines: [] };
    for (const x of parts) {
      if (x === worst) continue;
      if (x.res && x.res.cls !== "na") out.lines.push({ text: `${x.name}: ${x.res.detail} · ${x.res.chip}`, cls: x.res.cls });
      else if (x.note) out.lines.push({ text: `${x.name}: ${x.note}` });
    }
    return out;
  };
  const srcNote = (src) => (src === "pack" && p.bmsNote ? ` · ${p.bmsNote}` : "");
  const rows = [];

  // Power a unit can give at a given open-circuit voltage: its current limit,
  // minimum-voltage limit and maximum power point, with its internal resistance.
  const unitPower = (ocv, rOhm, maxA, vMin) => {
    let amps = maxA;
    if (rOhm > 0) amps = Math.min(amps, Math.max(0, (ocv - vMin) / rOhm), ocv / (2 * rOhm));
    const volts = ocv - amps * rOhm;
    return { watts: Math.max(0, volts * amps), amps, volts };
  };

  const pulse = Number(state.reqPulseValue) || 0;
  const pulsePct = Number.isFinite(Number(state.reqPulseSocPct)) && state.reqPulseSocPct !== "" ? Math.min(100, Math.max(0, Number(state.reqPulseSocPct))) : LOW_CHARGE;
  if (pulse > 0) {
    const A = toA(pulse, state.reqPulseUnit);
    const kW = toKW(pulse, state.reqPulseUnit);
    const mk = motorKW(state.motorPeakKW);
    rows.push({
      label: "Pulse discharge",
      sub: `${state.reqPulseUnit === "kW" ? `${fmt(pulse, 0)} kW = ${fmt(A, 1)} A` : `${fmt(A, 0)} A = ${fmt(kW, 1)} kW`}${Number(state.reqPulseS) > 0 ? ` for ${fmt(state.reqPulseS, 0)} s` : ""}`,
      cells: {
        cell: c ? margin(A / cellsParallel, c.maxDischargeA, "A", 1) : null,
        module: margin(A / strings, m.maxDischargeA, "A", 1),
        pack: margin(A, p.peakA, "A", 1, srcNote(p.peakSource)),
        drive: hasVehicle ? drive([
          { name: "motor", res: mk ? margin(kW, mk, "kW", 1, motorTag) : null, note: motorOn ? "no peak power entered" : "motor limits off" },
          { name: "inverter", res: ctrlA ? margin(A, ctrlA, "A", 1) : null, note: "no DC current limit entered" }
        ]) : null
      }
    });
    if (Number(state.reqPulseS) > 0) {
      const req = Number(state.reqPulseS);
      rows.push({
        label: "Pulse duration", sub: `${fmt(req, 0)} s`,
        cells: {
          cell: c ? duration(req, c.pulseDurationS) : null,
          module: duration(req, m.ratings.peakS),
          pack: duration(req, p.peakDurationS || Infinity),
          drive: hasVehicle ? drive([
            { name: "motor", res: motorOn && Number(state.motorPeakKW) > 0 ? duration(req, Number(state.motorPeakS) > 0 ? Number(state.motorPeakS) : Infinity, "no peak time entered") : null, note: "no peak time entered" },
            { name: "inverter", res: null, note: "no time limit entered" }
          ]) : null
        }
      });
    }
    if (all.atLimits.hasSag && pm.series > 0) {
      const low = pm.socBottom + (pm.socTop - pm.socBottom) * pulsePct / 100;
      const elementOcv = pm.ocv(low) / pm.series;           // one series element (cell or module)
      const elementR = pm.cellResistanceOhm;                 // its internal resistance
      const res = { cells: {} };
      if (c) {
        const cp = unitPower(elementOcv, elementR, c.maxDischargeA, c.minV);
        res.cells.cell = margin(kW * 1000 / cellCount, cp.watts, "W per cell", 1);
        if (res.cells.cell) res.cells.cell.lines.push({ text: `at ${fmt(cp.amps, 0)} A, ${fmt(cp.volts, 2)} V` });
      }
      const modOcv = c ? elementOcv * m.series : elementOcv;
      const modR = c ? elementR * m.series / m.parallel : elementR;
      const mp = unitPower(modOcv, modR, m.maxDischargeA, m.minV);
      res.cells.module = margin(kW / moduleCount, mp.watts / 1000, "kW per module", 1);
      if (res.cells.module) res.cells.module.lines.push({ text: `at ${fmt(mp.amps, 0)} A, ${fmt(mp.volts, 1)} V` });
      const lowCap = Sim.dischargeCapability(all.packOnlyModel, low);
      res.cells.pack = margin(kW, lowCap.powerW / 1000, "kW", 1);
      if (res.cells.pack) res.cells.pack.lines.push({ text: `at ${fmt(lowCap.amps, 0)} A, ${fmt(lowCap.terminalV, 1)} V` });
      if (hasVehicle) {
        const mkLow = motorKW(state.motorPeakKW);
        let inv = null;
        if (ctrlA) {
          const ic = Sim.dischargeCapability(pm, low);  // vehicle model: includes the inverter DC limit
          inv = margin(kW, ic.powerW / 1000, "kW", 1, ` at ${fmt(ic.amps, 0)} A, ${fmt(ic.terminalV, 1)} V`);
        }
        res.cells.drive = drive([
          { name: "inverter", res: inv, note: "no DC current limit entered" },
          { name: "motor", res: mkLow ? margin(kW, mkLow, "kW", 1, motorTag) : null, note: motorOn ? "no peak power entered" : "motor limits off" }
        ]);
      }
      rows.push({ label: `Pulse power at ${fmt(pulsePct, 0)} % charge`, sub: `${fmt(kW, 1)} kW at ${fmt(pulsePct, 0)} % (as shown to driver), with voltage sag`, cells: res.cells });
    }
  }
  const cont = Number(state.reqContValue) || 0;
  if (cont > 0) {
    const A = toA(cont, state.reqContUnit);
    const kW = toKW(cont, state.reqContUnit);
    const mk = motorKW(state.motorContKW);
    rows.push({
      label: "Continuous discharge", sub: state.reqContUnit === "kW" ? `${fmt(cont, 0)} kW = ${fmt(A, 1)} A` : `${fmt(A, 0)} A = ${fmt(kW, 1)} kW`,
      cells: {
        cell: c ? margin(A / cellsParallel, c.contDischargeA, "A", 1) : null,
        module: margin(A / strings, m.contDischargeA, "A", 1),
        pack: margin(A, p.contA, "A", 1, srcNote(p.contSource)),
        drive: hasVehicle ? drive([
          { name: "motor", res: mk ? margin(kW, mk, "kW", 1, motorTag) : null, note: motorOn ? "no continuous power entered" : "motor limits off" },
          { name: "inverter", res: null, note: "no continuous rating" }
        ]) : null
      }
    });
  }
  const charge = Number(state.reqChargeValue) || 0;
  if (charge > 0) {
    const A = toA(charge, state.reqChargeUnit);
    rows.push({
      label: "Max charge", sub: state.reqChargeUnit === "kW" ? `${fmt(charge, 0)} kW = ${fmt(A, 1)} A` : `${fmt(A, 0)} A`,
      cells: {
        cell: c ? margin(A / cellsParallel, c.maxChargeA, "A", 2) : null,
        module: margin(A / strings, m.maxChargeA, "A", 1),
        pack: margin(A, p.chargeA, "A", 1, srcNote(p.chargeSource))
      }
    });
  }
  const regen = Number(state.reqRegenA) || 0;
  if (regen > 0) {
    const kW = regen * p.nominalV / 1000;
    const mr = motorOn && Number(state.motorRegenKW) > 0 ? Number(state.motorRegenKW) * (eff || 1) : null;
    rows.push({
      label: "Regen current", sub: `${fmt(regen, 0)} A = ${fmt(kW, 1)} kW`,
      cells: {
        cell: c ? margin(regen / cellsParallel, (c.peakChargeA || c.maxChargeA) * 0.8, "A", 2, c.peakChargeA ? ` (80 % of peak${c.peakChargeS ? `, ${fmt(c.peakChargeS, 0)} s` : ""})` : " (80 %)") : null,
        module: margin(regen / strings, m.ratings.regenPeakA, "A", 1, m.ratings.regenPeakA > m.ratings.regenA + 1e-9 ? ` (peak; ${fmt(m.ratings.regenA, 0)} A continuous)` : ""),
        pack: margin(regen, p.regenPeakA, "A", 1, p.regenPeakA > p.regenA + 1e-9 ? ` (peak${p.peakChargeS ? ` for ${fmt(p.peakChargeS, 0)} s` : ""}; ${fmt(p.regenA, 0)} A continuous)` : ""),
        drive: hasVehicle ? drive([{ name: "motor", res: mr ? margin(kW, mr, "kW", 1, motorTag) : null, note: "no regen rating entered" }]) : null
      }
    });
  }
  const energy = Number(state.reqUsableKWh) || 0;
  if (energy > 0) {
    const uf = p.usableFactor;
    rows.push({
      label: "Usable energy", sub: `${fmt(energy, 1)} kWh`,
      cells: {
        cell: c ? margin(energy * 1000 / cellCount, c.energyWh * uf, "Wh per cell", 1) : null,
        module: margin(energy / moduleCount, m.energyKWh * uf, "kWh per module", 2),
        pack: margin(energy, p.usableKWh, "kWh", 1)
      }
    });
  }

  // Cooling (v2.12): heat at the sustained targets against the cooling capacity. Pack level only.
  const cooling = hasValue(state.reqCoolingKW) ? Number(state.reqCoolingKW) : 0;
  if (cooling > 0) {
    const R = (all.packOnlyModel ? all.packOnlyModel.resistanceOhm : 0) + extraPackOhm();
    const heatRow = (label, amps, sub) => rows.push({
      label, sub,
      cells: {
        pack: R > 0
          ? (() => { const h = amps * amps * R / 1000; const x = margin(h, cooling, "kW", 2, " (heat / cooling)"); if (x) x.lines.push({ text: `${fmt(amps, 0)} A × ${fmt(amps, 0)} A × ${fmt(R * 1000, 1)} mΩ` }); return x; })()
          : { cls: "na", chip: "—", detail: "no internal resistance entered", lines: [] }
      }
    });
    const contA = cont > 0 ? toA(cont, state.reqContUnit) : 0;
    const chargeA = charge > 0 ? toA(charge, state.reqChargeUnit) : 0;
    if (contA > 0) heatRow("Cooling: continuous discharge", contA, `${fmt(cooling, 1)} kW cooling vs heat at ${fmt(contA, 1)} A`);
    if (chargeA > 0) heatRow("Cooling: max charge", chargeA, `${fmt(cooling, 1)} kW cooling vs heat at ${fmt(chargeA, 1)} A`);
    if (!(contA > 0) && !(chargeA > 0)) rows.push({ label: "Cooling", sub: `${fmt(cooling, 1)} kW`, cells: { pack: { cls: "na", chip: "—", detail: "enter a continuous discharge or max charge target to check against", lines: [] } } });
  }

  // Summary: failing / thin-margin targets and where.
  const fails = [];
  const warns = [];
  for (const row of rows) {
    const failAt = levels.filter((l) => row.cells[l.id] && row.cells[l.id].cls === "fail").map((l) => l.short);
    const warnAt = levels.filter((l) => row.cells[l.id] && row.cells[l.id].cls === "warn").map((l) => l.short);
    if (failAt.length) fails.push(`${row.label} fails at the ${failAt.join(" and ")}`);
    else if (warnAt.length) warns.push(`${row.label} has under 10 % margin at the ${warnAt.join(" and ")}`);
  }
  return { levels, rows, fails, warns, eff, motorOn, pulsePct };
}

// ---------------------------------------------------------------------------
// Results: rendering
// ---------------------------------------------------------------------------
function rowsHtml(rows) {
  return rows.filter(Boolean).map(([label, value, cls]) => `<div class="row${cls ? ` ${cls}` : ""}"><span>${esc(label)}</span><strong>${value}</strong></div>`).join("");
}
function panel(title, inner, { wide = false, delay = 0 } = {}) {
  return `<section class="panel${wide ? " wide" : ""}" style="animation-delay:${delay}s"><h2>${esc(title)}</h2>${inner}</section>`;
}
function kpi(label, value, unit, delay) {
  return `<div class="kpi" style="animation-delay:${delay}s"><span>${esc(label)}</span><strong>${value}${unit ? ` <small>${esc(unit)}</small>` : ""}</strong></div>`;
}
let LIMIT_SOURCES = { peak: "cells", cont: "cells" };
function limitName(key) {
  return {
    cell: `peak current limit, set by ${sourceText(LIMIT_SOURCES.peak)}`, cellContinuous: `continuous current limit after the peak time, set by ${sourceText(LIMIT_SOURCES.cont)}`, bms: "BMS peak limit",
    bmsContinuous: "BMS continuous limit (peak time used)", controller: "inverter DC current limit", voltage: "pack min voltage (sag)",
    maxPower: "pack maximum power point", motorPower: "motor peak power", motorContinuous: "motor continuous power (peak time used)",
    torque: "motor torque", topSpeed: "top speed setting", motorRpm: "motor max rpm", power: "power"
  }[key] || key || "—";
}

function moduleRows(m) {
  return rowsHtml([
    m.config ? ["Configuration", esc(m.config)] : null,
    m.cells ? ["Cells", fmt(m.cells, 0)] : null,
    m.cellType ? ["Cell type", esc(m.cellType)] : null,
    ["Nominal voltage", `${fmt(m.nominalV, 1)} V`],
    ["Voltage range", `${fmt(m.minV, 1)}–${fmt(m.maxV, 1)} V`],
    ["Capacity", `${fmt(m.capacityAh, 1)} Ah`],
    ["Energy", `${fmt(m.energyKWh, 3)} kWh`],
    m.ratingsNote ? ["Module ratings set by", esc(m.ratingsNote), "highlight"] : null,
    ["Max discharge", `${fmt(m.maxDischargeA, 0)} A · ${fmt(m.maxDischargeKW, 1)} kW${Number.isFinite(m.ratings.peakS) ? ` for ${fmt(m.ratings.peakS, 0)} s` : ""} (${sourceText(m.ratings.src.peakA)})`],
    ["Continuous discharge", `${fmt(m.contDischargeA, 0)} A · ${fmt(m.contDischargeKW, 1)} kW (${sourceText(m.ratings.src.contA)})`],
    ["Continuous charge", `${fmt(m.maxChargeA, 0)} A · ${fmt(m.maxChargeKW, 1)} kW (${sourceText(m.ratings.src.chargeA)})`],
    ["Mass", `${fmt(m.massKg, 2)} kg${m.overheadKg > 0 ? ` (cells ${fmt(m.cellMassKg, 2)} kg)` : ""}`],
    m.dcirMOhm > 0 ? ["Internal resistance", `${fmt(m.dcirMOhm, 2)} mΩ`] : null,
    m.volumeL ? ["Volume", `${fmt(m.volumeL, 2)} L`] : null
  ]);
}

function densityTable(all) {
  const { cell, module1, pack } = all.build;
  const rows = [];
  if (cell) rows.push(["Cell", `${fmt(cell.energyWh, 1)} Wh`, `${fmt(cell.massKg * 1000, 1)} g`, cell.whPerKg, cell.whPerL]);
  rows.push(["Module", `${fmt(module1.energyKWh, 3)} kWh`, `${fmt(module1.massKg, 2)} kg`, module1.whPerKg, module1.whPerL]);
  if (pack) rows.push(["Pack", `${fmt(pack.energyKWh, 2)} kWh`, `${fmt(pack.massKg, 1)} kg`, pack.whPerKg, pack.whPerL]);
  const body = rows.map(([level, energy, mass, wkg, wl]) => `<tr><td>${level}</td><td>${energy}</td><td>${mass}</td><td>${wkg ? fmt(wkg, 0) : "—"}</td><td>${wl ? fmt(wl, 0) : "—"}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="data"><thead><tr><th>Level</th><th>Energy</th><th>Mass</th><th>Wh/kg</th><th>Wh/L</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="help" style="margin:10px 0 0">Wh/L needs a size: cell format, module size, or the pack enclosure volume (from CAD or made of boxes; the overall size is not used). Module and pack mass include the overheads entered.</p>`;
}

// Cell → module → pack → vehicle: the limit each level passes on and what set it.
function requirementHtml(R) {
  const head = `<tr><th>Target</th>${R.levels.map((l) => `<th>${esc(l.label)}</th>`).join("")}</tr>`;
  const lines = (x) => (x.lines || []).map((l) => `<small class="${l.cls ? `line-${l.cls}` : ""}">${esc(l.text)}</small>`).join("");
  const other = (x) => (x.other ? `<small class="age-other">${x.other.age === "eol" ? "End of life" : "Beginning of life"} <span class="chip mini ${x.other.cls}">${esc(x.other.chip)}</span></small>` : "");
  const cell = (x) => (!x ? '<td class="na">—</td>'
    : x.cls === "na" ? `<td class="na">—<small>${esc(x.detail)}</small>${lines(x)}</td>`
      : `<td><span class="chip ${x.cls}">${esc(x.chip)}</span><small>${esc(x.detail)}</small>${lines(x)}${other(x)}</td>`);
  const body = R.rows.map((row) => `<tr><th scope="row"><strong>${esc(row.label)}</strong><small>${esc(row.sub)}</small></th>${R.levels.map((l) => cell(row.cells[l.id])).join("")}</tr>`).join("");
  const summary = R.fails.length
    ? `<div class="req-summary fail"><strong>${R.fails.length} target${R.fails.length === 1 ? "" : "s"} fail${R.fails.length === 1 ? "s" : ""}${R.warns.length ? ` · ${R.warns.length} with under 10 % margin` : ""}</strong><span>${esc(R.fails.join("; "))}.</span></div>`
    : R.warns.length
      ? `<div class="req-summary warn"><strong>All targets met · ${R.warns.length} with under 10 % margin</strong><span>${esc(R.warns.join("; "))}.</span></div>`
      : '<div class="req-summary pass"><strong>All targets met with at least 10 % margin</strong></div>';
  const ages = R.ages
    ? `<p class="help req-ages">Chips show <strong>${ageLabel(R.ages.view)}</strong>; where ${ageLabel(R.ages.view === "eol" ? "bol" : "eol")} differs it is shown underneath. Requirements must be met at ${R.ages.mode === "both" ? "<strong>both ages</strong>" : `<strong>${ageLabel(R.ages.mode)}</strong>`}.${R.notCounted && R.notCounted.length ? ` Not counted in the verdict (${esc(ageLabel(R.ages.ignoredAge))}): ${esc(R.notCounted.join("; "))}.` : ""}</p>`
    : "";
  const motorNote = R.motorOn ? (R.eff ? ` The motor uses power ÷ motor efficiency (${fmt(R.eff * 100, 0)} %), i.e. power drawn from the battery.` : " The motor uses its datasheet power (no motor efficiency entered).") : "";
  return `${summary}${ages}<div class="table-wrap"><table class="data req-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`
    + helpP(`PASS = 10 % margin or more · WARN = 0–10 % · FAIL = short of the target. Each target is shared out: currents per module = pack ÷ parallel strings, per cell = pack ÷ cells in parallel; power and energy per module = pack ÷ number of modules, per cell = pack ÷ number of cells. Pulse power at ${fmt(R.pulsePct, 0)} % charge uses each level's own current limit, open-circuit voltage and internal resistance; pack limits and performance keep showing the natural limits at ${LOW_CHARGE} %. Inverter & motor shows the weaker of the two, with the other underneath.${motorNote} Cooling rows compare heat (current² × pack resistance, including any extra pack resistance) at the continuous discharge and max charge targets with the cooling capacity; short pulses are absorbed by the pack's mass and are not checked. “—” = not applicable, or no rating entered.`);
}

function chainHtml(all) {
  const b = all.build;
  const m = b.module1;
  const p = b.pack;
  const card = (step, title, sub, rows, cls = "") => `<div class="chain-card${cls}"><p class="chain-step">${step}</p><h3>${esc(title)}</h3><p class="chain-sub">${esc(sub)}</p>${rows.map(([label, value, note, mine]) =>
    `<div class="chain-row"><div><span>${esc(label)}</span><strong class="${mine ? "mine" : ""}">${value}</strong></div>${note ? `<small>${note}</small>` : ""}</div>`).join("")}</div>`;
  const arrow = '<span class="chain-arrow" aria-hidden="true">→</span>';
  const parts = [];
  const via = (r, levelKey, mine) => {
    if (!r || r.entry === null) return null;
    return `${ratingValue(r.before, r.unit)} → ${mine} ${ratingValue(r.entry, r.unit)}: uses ${sourceText(r.source)}`;
  };
  const rowFor = (item, key) => (item.ratingRows || []).find((r) => r.key === key);
  if (b.cell) {
    const c = b.cell;
    parts.push(card("1 · Cell", [state.cellManufacturer, state.cellModel].filter(Boolean).join(" ") || "Cell", "From the cell datasheet", [
      ["Peak", `${fmt(c.maxDischargeA, 1)} A${c.pulseDurationS > 0 ? ` · ${fmt(c.pulseDurationS, 0)} s` : ""}`],
      ["Continuous", `${fmt(c.contDischargeA, 1)} A`],
      ["Charge", `${fmt(c.maxChargeA, 1)} A${c.peakChargeA > 0 ? ` · peak ${fmt(c.peakChargeA, 1)} A${c.peakChargeS > 0 ? ` (${fmt(c.peakChargeS, 0)} s)` : ""}` : ""}`]
    ]));
  }
  const mr = m.ratings;
  parts.push(card(`${b.cell ? "2" : "1"} · Module`, m.config || state.mdName || "Module",
    m.source === "cells" ? `Cell × ${fmt(m.parallel, 0)} in parallel${m.ratingsOn ? ", then module ratings" : ""}` : "From the module datasheet", [
      ["Peak", `${fmt(mr.peakA, 0)} A${Number.isFinite(mr.peakS) ? ` · ${fmt(mr.peakS, 0)} s` : ""}`, via(rowFor(m, "peakA"), "peakA", "module"), mr.src.peakA === "module"],
      ["Continuous", `${fmt(mr.contA, 0)} A`, via(rowFor(m, "contA"), "contA", "module"), mr.src.contA === "module"],
      ["Charge", `${fmt(mr.chargeA, 0)} A`, via(rowFor(m, "chargeA"), "chargeA", "module"), mr.src.chargeA === "module"]
    ]));
  if (p) {
    parts.push(card(`${b.cell ? "3" : "2"} · Pack`, `${fmt(p.modulesInSeries, 0)} modules · ${fmt(p.strings, 0)} string${p.strings === 1 ? "" : "s"}`,
      `Module × ${fmt(p.strings, 0)}${p.ratingsOn ? ", then pack ratings" : ""}`, [
        ["Peak", `${fmt(p.peakA, 0)} A · ${fmt(p.peakKW, 1)} kW`, via(rowFor(p, "peakA"), "peakA", "pack"), p.peakSource === "pack"],
        ["Continuous", `${fmt(p.contA, 0)} A · ${fmt(p.contKW, 1)} kW`, via(rowFor(p, "contA"), "contA", "pack"), p.contSource === "pack"],
        ["Charge", `${fmt(p.chargeA, 0)} A · ${fmt(p.chargeKW, 1)} kW`, via(rowFor(p, "chargeA"), "chargeA", "pack"), p.chargeSource === "pack"]
      ]));
  }
  if (p && all.vehicle) {
    const ctrl = state.motorEnabled && Number(state.controllerMaxA) > 0 ? Number(state.controllerMaxA) : null;
    const battery = ctrl !== null ? Math.min(p.peakA, ctrl) : p.peakA;
    parts.push(card(`${b.cell ? "4" : "3"} · Vehicle`, "Uses the pack", "Pack limits, then inverter and motor", [
      ["Battery current", `${fmt(battery, 0)} A`, ctrl !== null ? `pack ${fmt(p.peakA, 0)} A · inverter ${fmt(ctrl, 0)} A → ${ctrl < p.peakA ? "inverter" : "pack"}` : "no inverter DC limit entered", ctrl !== null && ctrl < p.peakA],
      ["Continuous", `${fmt(p.contA, 0)} A`, "from the pack"],
      ["Regen", `${fmt(p.regenA, 0)} A`, p.regenDerated ? "80 % of the charge rating" : `from the ${sourceText(p.regenSource)}`]
    ], " vehicle"));
  }
  return `<div class="chain">${parts.join(arrow)}</div><p class="help" style="margin:12px 0 0">Bronze marks a module or pack rating that set the figure. Each level starts from the one before.</p>`;
}

function describeFullPower(test) {
  if (!test) return "—";
  if (!test.ok) return esc(test.reason);
  const parts = [
    test.zeroToSixtySeconds !== null ? `0–60 mph ${fmt(test.zeroToSixtySeconds, 1)} s` : "0–60 mph not reached",
    test.fiftyToSeventySeconds !== null ? `50–70 mph ${fmt(test.fiftyToSeventySeconds, 1)} s` : null,
    `peak ${fmt(test.peakCurrentA, 0)} A`,
    `limit: ${limitName(test.limitingFactor)}`
  ].filter(Boolean);
  const events = (test.peakEvents || []).map((e) => `${e.what.replace(" ended", "")} ended at ${fmt(e.seconds, 1)} s`);
  return parts.join(", ") + (events.length ? ` (${events.join("; ")})` : "");
}

function describeTopSpeed(test) {
  if (!test || !test.ok || !Number.isFinite(test.topSpeedMph)) return test && !test.ok ? esc(test.reason) : "—";
  const key = String(test.topSpeedLimit || "");
  let text = key.startsWith("peakEnded:")
    ? `${speed(test.topSpeedMph)}, still accelerating when ${key.slice(10).replace(" ended", "")} ended at ${fmt(test.topSpeedReachedSeconds, 0)} s`
    : `${speed(test.topSpeedMph)}, limited by ${limitName(key)}`;
  if (test.topSpeedHeldMph < test.topSpeedMph - 1) text += `; settles at ${speed(test.topSpeedHeldMph)}`;
  return text;
}

function assumptionsList(all) {
  const b = all.build;
  const items = [
    "Indicative engineering estimate from the inputs shown. Not a type-approval result; validate by test.",
    b.range.start === "cell"
      ? "Module and pack values are built up from the cell datasheet: voltage × cells in series, capacity and current × cells in parallel."
      : "Pack values are built up from the module datasheet: voltage × modules in series, capacity and current × parallel strings."
  ];
  if (b.pack) {
    items.push(`Usable energy = nominal energy × usable factor (${fmt(b.pack.usableFactor, 2)}), as a symmetric window (${fmt(all.packModel.socBottom, 0)}–${fmt(all.packModel.socTop, 0)} % cell SOC). Charge levels are shown as the driver sees them: 100 % full, 0 % empty.`);
    items.push("Current ratings follow the chain cell → module → pack: each level starts from the one below (× cells in parallel, × parallel strings) and optional module or pack ratings either limit it (the lower figure is used) or replace it (a validated design rating).");
    items.push("Regen current is 80 % of the cell (or module datasheet) charge rating, unless a module or pack charge rating sets it.");
    items.push(all.atLimits.hasSag
      ? "Voltage sag uses a constant internal resistance (and the OCV table if entered); resistance changes with temperature are not modelled, and age only through the end-of-life check."
      : "No internal resistance entered, so voltage sag and pack losses are not included.");
  }
  if (all.vehicle) {
    const dc = Sim.normaliseDriveCycle(state.driveCycle);
    items.push(dc === "constant"
      ? `Range: constant ${speed(Number(state.constantSpeedMph) || 70)} on a flat road in still air, until the usable energy is used.`
      : dc === "custom"
        ? "Range: the uploaded speed profile, resampled to 1 s and repeated (joined back to its start at 2 m/s²) until the usable energy is used. Flat road, still air."
        : `Range: official ${Sim.DRIVE_CYCLES[dc].shortLabel} speed trace (UN GTR 15), repeated until the usable energy is used. Flat road, still air; WLTP downscaling not applied.`);
    if (state.vehPreset && VEHICLE_PRESETS[state.vehPreset]) items.push(`Vehicle preset “${VEHICLE_PRESETS[state.vehPreset].label}”: typical Cd, frontal area and Crr from published examples, not measured for this vehicle.`);
    items.push("Road load F = m·a + m·g·Crr + ½·ρ·Cd·A·v² (ρ = 1.225 kg/m³, g = 9.81 m/s²). Constant battery-to-wheel efficiency; rotating inertia, wind and gradient not modelled.");
    items.push(state.vehMassIncludesPack ? "Vehicle mass as entered (includes the pack) plus payload." : "Vehicle mass = entered mass + calculated pack mass + payload.");
    items.push(`Low-charge figures are at ${LOW_CHARGE} % displayed charge. Top speed: 3 minutes of full throttle from rest.`);
    if (all.charging && (all.charging.ac || all.charging.dc)) items.push(`Charging is worked out step by step: power into the pack = lower of the charger${all.charging.effPct ? " (AC × on-board charger efficiency)" : ""} and the pack charge current × pack voltage${all.charging.taper ? ", with the current reduced in a straight line above the taper start" : ""}. Pack resistance losses are included; cable losses and temperature are not.`);
  }
  if (all.eolAvailable && all.age === "eol") items.unshift(`End of life: ${b.range.start === "module" ? "module" : "cell"} capacity × ${fmt(state.lifeEolPct, 0)} % and internal resistance × ${fmt(1 + Number(state.cellResIncreasePct) / 100, 2)}; current ratings, OCV curve, mass and vehicle unchanged.`);
  if (b.module1 && b.module1.source === "cells" && state.modOverheadMode !== "itemised" && Number(state.modMassOverheadPct) > 0) items.push(`Module overhead: ${fmt(state.modMassOverheadPct, 0)} % of cell mass.`);
  if (b.pack && state.packOverheadMode !== "itemised" && Number(state.packMassOverheadPct) > 0) items.push(`Pack overhead: ${fmt(state.packMassOverheadPct, 0)} % of module mass.`);
  return items;
}

// Headline and KPI figures, shared by the results page, the report and the comparison.
function headlineData(all) {
  const b = all.build;
  const r = b.range;
  const p = b.pack;
  const v = all.vehicle;
  const sim = v?.sim;
  const peakKW = p ? (all.atLimits.hasSag ? all.atLimits.full.powerW / 1000 : p.peakKW) : null;
  if (r.end === "vehicle" && sim) {
    const cons = whPerDist(sim.consumptionKWhPerMile).split(" ");
    return {
      headline: esc(dist(sim.distanceMiles)), accent: "on one charge.",
      kpis: [
        ["Pack energy", fmt(p.energyKWh, 2), "kWh"],
        ["Usable", fmt(p.usableKWh, 2), "kWh"],
        ["Consumption", cons[0], cons[1]],
        ["Pack peak power", fmt(peakKW, 0), "kW"],
        ["0–60 mph", v.fullTop.ok && v.fullTop.zeroToSixtySeconds !== null ? fmt(v.fullTop.zeroToSixtySeconds, 1) : "—", v.fullTop.ok ? "s" : ""]
      ]
    };
  }
  if (p) {
    return {
      headline: `${fmt(p.energyKWh, 1)} kWh pack`, accent: `${fmt(p.nominalV, 1)} V · ${esc(p.config)}`,
      kpis: [
        ["Usable", fmt(p.usableKWh, 2), "kWh"],
        ["Peak power", fmt(peakKW, 0), "kW"],
        ["Continuous", fmt(p.contKW, 0), "kW"],
        ["Pack mass", fmt(p.massKg, 0), "kg"],
        ["Pack Wh/kg", p.whPerKg ? fmt(p.whPerKg, 0) : "—", ""]
      ]
    };
  }
  const m = b.module1;
  return {
    headline: `${fmt(m.energyKWh * 1000, 0)} Wh module`, accent: `${fmt(m.nominalV, 1)} V${m.config ? ` · ${esc(m.config)}` : ""}`,
    kpis: [
      ["Capacity", fmt(m.capacityAh, 1), "Ah"],
      ["Max discharge", fmt(m.maxDischargeKW, 1), "kW"],
      ["Mass", fmt(m.massKg, 2), "kg"],
      ["Wh/kg", m.whPerKg ? fmt(m.whPerKg, 0) : "—", ""]
    ]
  };
}

const helpP = (text) => `<p class="help" style="margin:10px 0 0">${text}</p>`;

const sub = (text) => `<small class="sub">${text}</small>`;

// Charge power across the charge as an SVG line (animated on the results page; still in the report).
function chargeChartSvg(ch) {
  const pts = ch.curve || [];
  if (pts.length < 2) return "";
  const W = 880, H = 240, X0 = 52, Y0 = 30;
  const maxKW = niceCeil(Math.max(...pts.map((x) => Math.min(x.packKW, Math.max(...pts.map((y) => y.kW)) * 2.2)), 1));
  const X = (d) => X0 + d / 100 * W, Y = (kw) => Y0 + H - Math.min(kw, maxKW) / maxKW * H;
  const line = (key) => pts.map((x) => `${X(x.displayPct).toFixed(1)},${Y(x[key]).toFixed(1)}`).join(" ");
  const d = "M" + pts.map((x) => `${X(x.displayPct).toFixed(1)},${Y(x.kW).toFixed(1)}`).join(" L");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${X0}" x2="${X0 + W}" y1="${Y(maxKW * f).toFixed(1)}" y2="${Y(maxKW * f).toFixed(1)}" class="cc-grid"/><text x="${X0 - 8}" y="${(Y(maxKW * f) + 4).toFixed(1)}" text-anchor="end" class="cc-axis">${fmt(maxKW * f, 0)}</text>`).join("");
  const xl = [0, 20, 40, 60, 80, 100].map((v) => `<text x="${X(v)}" y="${Y0 + H + 22}" text-anchor="middle" class="cc-axis">${v} %</text>`).join("");
  const zone = ch.taper ? `<g class="cc-zone"><rect x="${X(ch.taper.startPct).toFixed(1)}" y="${Y0}" width="${(X(100) - X(ch.taper.startPct)).toFixed(1)}" height="${H}"/><text x="${(X(ch.taper.startPct) + 6).toFixed(1)}" y="${Y0 + 14}">Taper</text></g>` : "";
  return `<div class="cc-legend"><span><i class="cc-key-line"></i>Power into the pack (${ch.curveLabel})</span><span><i class="cc-key-dash"></i>What the pack could accept</span></div>
    <svg class="charge-chart" viewBox="0 0 ${X0 + W + 36} ${Y0 + H + 48}" role="img" aria-label="${ch.curveLabel} charge power across the charge">
    ${grid}${xl}${zone}
    <polyline points="${line("packKW")}" class="cc-pack"/>
    <polyline points="${line("kW")}" class="cc-line" pathLength="1"/>
    <circle r="6" class="cc-dot" style="offset-path: path('${d}')"/>
    <text x="${X0 + W / 2}" y="${Y0 + H + 44}" text-anchor="middle" class="cc-axis">Displayed charge</text><text x="${X0 - 8}" y="${Y0 - 14}" text-anchor="end" class="cc-axis">kW</text></svg>`;
}

function chargingHtml(ch) {
  const lim = (x) => (x === "pack" ? " (pack-limited)" : x === "mixed" ? " (charger, then pack)" : "");
  const losses = (base) => (base !== null && base !== undefined ? sub(`${fmt(base, 0)} min with no taper or losses`) : "");
  const rows = [
    ["Pack charge limit", `${fmt(ch.packLimitA, 0)} A · ${fmt(ch.packLimitKWLow, 0)}–${fmt(ch.packLimitKWHigh, 0)} kW${sub("Continuous charge rating × pack voltage, empty to full")}`],
    ch.taper ? ["Charging taper", `From ${fmt(ch.taper.startPct, 0)} %, down to ${fmt(ch.taper.endPct, 0)} % of max at full`] : null,
    ch.ac ? ["AC 0–100 %", ch.ac.hours !== null
      ? `${fmt(ch.ac.hours, 1)} h at ${fmt(ch.ac.kW, 1)} kW${lim(ch.ac.limitedBy)}${sub(`${fmt(ch.ac.baseHours, 1)} h with no taper or losses${ch.effPct ? ` · ${fmt(ch.ac.intoPackKW, 1)} kW reaches the pack at ${fmt(ch.effPct, 0)} %` : " · no charger efficiency entered"}`)}`
      : esc(ch.ac.reason || "—")] : null,
    ch.ac && ch.ac.socketKWh ? ["Energy from the socket, AC 0–100 %", `${fmt(ch.ac.socketKWh, 1)} kWh${sub(`${fmt(ch.ac.storedKWh, 1)} kWh stored in the pack`)}`] : null,
    ch.dc ? ["DC 10–80 %", ch.dc.min1080 !== null ? `${fmt(ch.dc.min1080, 0)} min at ${fmt(ch.dc.kW, 0)} kW${lim(ch.dc.limitedBy1080)}${losses(ch.dc.base1080)}` : esc(ch.dc.reason || "—")] : null,
    ch.dc ? ["DC 10–100 %", ch.dc.min10100 !== null ? `${fmt(ch.dc.min10100, 0)} min${lim(ch.dc.limitedBy)}${losses(ch.dc.base10100)}` : esc(ch.dc.reason || "—"), "highlight"] : null
  ];
  return `<div class="charge-grid"><div>${chargeChartSvg(ch)}</div><div>${rowsHtml(rows)}</div></div>`
    + helpP(`Worked out step by step across the charge: the power into the pack is the lower of the charger${ch.effPct ? ` (AC × ${fmt(ch.effPct, 0)} % efficiency)` : ""} and the pack charge current × pack voltage${ch.taper ? ", with the current reduced above the taper start" : ""}. Losses in the pack's resistance are included; cable losses and temperature are not. A DC charger's rating is what it delivers to the car.`);
}

function heatHtml(all) {
  const H = all.heat;
  if (!(H.R > 0)) return '<p class="help">Enter the cell DC internal resistance (Cell › Performance detail) or an extra pack resistance (Pack & BMS › Pack resistance) to see the heat the pack gives off.</p>';
  const max = Math.max(...H.rows.map((r) => r.kW), 1e-9);
  const bars = H.rows.map((r, i) => `<div class="heat-row"><div><span>${esc(r.label)}</span><small>${fmt(r.amps, 0)} A${r.note ? ` · ${r.note}` : ""}</small></div>
    <div class="heat-track"><div class="heat-bar" style="width:${Math.max(0.8, r.kW / max * 100).toFixed(1)}%;animation-delay:${(0.2 + i * 0.08).toFixed(2)}s"></div></div><strong>${fmt(r.kW, r.kW < 1 ? 2 : 1)} kW</strong></div>`).join("");
  const other = all.eolAvailable ? (all.age === "eol" ? all.bol : all.eol) : null;
  const otherPeak = other && other.heat && other.heat.rows ? other.heat.rows.find((r) => r.key === "peak") : null;
  const stats = [
    H.driveKWh !== null ? [`${fmt(H.driveKWh, 2)} kWh`, "Heat over the whole drive"] : null,
    H.pctOfEnergy !== null ? [`${fmt(H.pctOfEnergy, 1)} %`, "Of the energy taken from the pack"] : null,
    otherPeak ? [`${fmt(otherPeak.kW, 1)} kW`, `Peak pulse at ${ageLabel(all.age === "eol" ? "bol" : "eol")}`] : null
  ].filter(Boolean);
  return `<div class="heat-formula"><strong>Heat = I² × R</strong><span>${H.extra > 0 ? `R = ${fmt(H.cellR * 1000, 1)} mΩ cells + ${fmt(H.extra * 1000, 1)} mΩ extra = ${fmt(H.R * 1000, 1)} mΩ` : `R = ${fmt(H.R * 1000, 1)} mΩ (cells only)`}</span></div>
    <div class="heat-rows">${bars}</div>
    ${stats.length ? `<div class="heat-stats">${stats.map(([a, b]) => `<div><strong>${a}</strong><span>${esc(b)}</span></div>`).join("")}</div>` : ""}`
    + helpP("An estimate for sizing cooling, not a temperature prediction. Uses the resistance entered (a pulse value at one test condition); it leaves out cooling, the cells' heat capacity, the smaller reversible (chemical) heat and changes of resistance with temperature.");
}

// End-of-life switch and banner on the Results page.
function ageSwitchHtml(all) {
  if (!all.eolAvailable) return "";
  const src = (RES_SOURCES.find(([v]) => v === state.cellResIncreaseSource) || ["", ""])[1];
  const noR = !(Number(state.buildStart === "module" ? state.mdDcirMOhm : state.cellDcirMOhm) > 0);
  const btn = (age, label) => `<button type="button" data-age="${age}" aria-pressed="${all.age === age}">${label}</button>`;
  const extra = all.age === "eol"
    ? `End of life: capacity ${fmt(state.lifeEolPct, 0)} %, resistance +${fmt(state.cellResIncreasePct, 0)} % (${esc(src.toLowerCase())}).${noR ? " No internal resistance is entered, so only the capacity changes." : ""} Every result below is for the aged pack.`
    : "Results below are for a new pack. Switch to see the same design at end of life.";
  return `<div class="age-bar"><div class="age-toggle" role="group" aria-label="Show results at">${btn("bol", "Beginning of life")}${btn("eol", "End of life")}</div><p>${extra}</p></div>`;
}

// Beginning vs end of life, key figures side by side.
function ageCompareHtml(all) {
  const B = all.bol, E = all.eol;
  const unit = B.build.cell || null;
  const val = (fn, d, u) => (a) => { const v = fn(a); return Number.isFinite(v) ? `${fmt(v, d)}${u ? ` ${u}` : ""}` : "—"; };
  const rows = [
    [unit ? "Cell capacity" : "Module capacity", val((a) => (a.build.cell ? a.build.cell.capacityAh : a.build.module1.capacityAh), 2, "Ah")],
    ["Pack internal resistance", val((a) => (a.packOnlyModel ? a.packOnlyModel.resistanceOhm * 1000 : NaN), 1, "mΩ")],
    ["Usable energy", val((a) => a.build.pack.usableKWh, 1, "kWh")],
    B.vehicle?.sim ? ["Range", (a) => (a.vehicle?.sim ? dist(a.vehicle.sim.distanceMiles) : "—")] : null,
    ["Peak power, full charge", val((a) => (a.atLimits.hasSag ? a.atLimits.full.powerW / 1000 : a.build.pack.peakKW), 0, "kW")],
    B.atLimits.hasSag ? [`Peak power at low charge (${LOW_CHARGE} %)`, val((a) => a.atLimits.low.powerW / 1000, 0, "kW")] : null,
    B.vehicle?.fullTop?.ok ? ["0–60 mph", val((a) => (a.vehicle?.fullTop?.ok ? a.vehicle.fullTop.zeroToSixtySeconds : NaN), 1, "s")] : null,
    B.charging?.dc ? ["DC 10–80 %", val((a) => a.charging?.dc?.min1080, 0, "min")] : null,
    B.heat?.driveKWh !== null && B.heat?.driveKWh !== undefined ? ["Cell heat over the drive", val((a) => a.heat?.driveKWh, 2, "kWh")] : null,
    B.requirements ? ["Requirement targets failing", (a) => String(a.requirements ? a.requirements.fails.length : 0)] : null
  ].filter(Boolean);
  const src = (RES_SOURCES.find(([v]) => v === state.cellResIncreaseSource) || ["", ""])[1];
  const body = rows.map(([label, fn]) => `<tr><td>${esc(label)}</td><td>${fn(B)}</td><td class="eol">${fn(E)}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="data age-table"><thead><tr><th></th><th>Beginning of life</th><th>End of life</th></tr></thead><tbody>${body}</tbody></table></div>`
    + helpP(`End of life: capacity ${fmt(state.lifeEolPct, 0)} % and internal resistance +${fmt(state.cellResIncreasePct, 0)} % (${esc(src.toLowerCase())}). Current ratings, OCV curve, mass and vehicle are unchanged.`);
}

// Every result section as { key, title, html, wide }. Values are already escaped.
function resultSections(all) {
  const b = all.build;
  const p = b.pack;
  const v = all.vehicle;
  const sim = v?.sim;
  const out = [];
  const add = (key, title, html, wide = false) => out.push({ key, title, html, wide });

  if (b.cell) {
    const c = b.cell;
    add("cell", "Cell", rowsHtml([
      state.cellManufacturer || state.cellModel ? ["Cell", esc([state.cellManufacturer, state.cellModel].filter(Boolean).join(" "))] : null,
      c.formatLabel ? ["Format", esc(c.formatLabel)] : null,
      ["Nominal / range", `${fmt(c.nominalV, 2)} V · ${fmt(c.minV, 2)}–${fmt(c.maxV, 2)} V`],
      ["Capacity / energy", `${fmt(c.capacityAh, 2)} Ah · ${fmt(c.energyWh, 1)} Wh`],
      ["Max discharge", `${fmt(c.maxDischargeA, 1)} A (${fmt(c.maxDischargeC, 1)} C)${c.pulseDurationS > 0 ? ` for ${fmt(c.pulseDurationS, 0)} s` : ""}`],
      ["Continuous discharge", `${fmt(c.contDischargeA, 1)} A (${fmt(c.contDischargeC, 1)} C)`],
      ["Continuous charge", `${fmt(c.maxChargeA, 1)} A (${fmt(c.maxChargeC, 1)} C)`],
      c.peakChargeA > 0 ? ["Peak charge", `${fmt(c.peakChargeA, 1)} A (${fmt(c.peakChargeC, 1)} C)${c.peakChargeS > 0 ? ` for ${fmt(c.peakChargeS, 0)} s` : ""}`] : null,
      ["Mass", `${fmt(c.massKg * 1000, 1)} g`],
      c.dcirMOhm > 0 ? ["Internal resistance", `${fmt(c.dcirMOhm, 2)} mΩ`] : null,
      c.volumeL ? ["Volume", `${fmt(c.volumeL * 1000, 1)} mL`] : null
    ]));
  }
  add("module", "Module", moduleRows(b.module1));

  if (p) {
    add("pack", "Pack", rowsHtml([
      ["Configuration", `${esc(p.config)}${b.range.start === "cell" ? ` · ${fmt(p.moduleCount, 0)} modules` : ""}`],
      p.cells ? ["Cells", fmt(p.cells, 0)] : null,
      ["Nominal voltage", `${fmt(p.nominalV, 1)} V`],
      ["Voltage range", `${fmt(p.minV, 1)}–${fmt(p.maxV, 1)} V`],
      ["Capacity", `${fmt(p.capacityAh, 1)} Ah`],
      ["Energy / usable", `${fmt(p.energyKWh, 2)} / ${fmt(p.usableKWh, 2)} kWh`],
      ["Mass", `${fmt(p.massKg, 1)} kg${p.overheadKg > 0 ? ` (modules ${fmt(p.modulesMassKg, 1)} kg)` : ""}`],
      p.dcirMOhm > 0 ? ["Internal resistance", `${fmt(p.dcirMOhm, 1)} mΩ`] : null,
      p.enclosureL ? ["Enclosure volume", `${fmt(p.enclosureL, 1)} L${sub(p.enclosureMethod === "cad" ? "From CAD" : p.enclosureMethod === "boxes" ? `Made of ${p.enclosureBoxes.length} box${p.enclosureBoxes.length === 1 ? "" : "es"}` : "Length × width × height")}`] : null,
      p.whPerL ? ["Pack energy density (volume)", `${fmt(p.whPerL, 0)} Wh/L${sub(`${fmt(p.energyKWh, 1)} kWh ÷ ${fmt(p.enclosureL, 1)} L`)}`] : null,
      p.overallMm ? ["Overall size", `${p.overallMm.map((x) => fmt(x, 0)).join(" × ")} mm${sub("For fit checks; not used for Wh/L")}`] : null
    ]));

    const lim = all.atLimits;
    add("limits", "Pack limits", rowsHtml([
      p.bmsNote ? ["Pack ratings set by", esc(p.bmsNote), "highlight"] : null,
      ["Peak discharge", `${fmt(p.peakA, 0)} A · ${fmt(p.peakKW, 1)} kW${p.peakDurationS ? ` for ${fmt(p.peakDurationS, 0)} s` : ""} (${sourceText(p.peakSource)})`],
      ["Continuous discharge", `${fmt(p.contA, 0)} A · ${fmt(p.contKW, 1)} kW (${sourceText(p.contSource)})`],
      ["Continuous charge", `${fmt(p.chargeA, 0)} A · ${fmt(p.chargeKW, 1)} kW (${sourceText(p.chargeSource)})`],
      p.peakChargeA > p.chargeA + 1e-9 ? ["Peak charge", `${fmt(p.peakChargeA, 0)} A · ${fmt(p.peakChargeKW, 1)} kW${p.peakChargeS ? ` for ${fmt(p.peakChargeS, 0)} s` : ""} (${sourceText(p.peakChargeSource)})`] : null,
      ["Max regen", p.regenPeakA > p.regenA + 1e-9
        ? `${fmt(p.regenPeakA, 0)} A${p.peakChargeS ? ` for ${fmt(p.peakChargeS, 0)} s` : ""}, then ${fmt(p.regenA, 0)} A (${p.regenDerated ? "80 % of the cell peak, then of the continuous charge rating" : sourceText(p.regenSource)})`
        : `${fmt(p.regenA, 0)} A (${p.regenDerated ? `80 % of the ${p.regenSource === "cells" ? "cell" : "module datasheet"} charge rating` : sourceText(p.regenSource)})`],
      lim.hasSag ? ["Peak power at full charge", `${fmt(lim.full.powerW / 1000, 1)} kW @ ${fmt(lim.full.amps, 0)} A, ${fmt(lim.full.terminalV, 1)} V`] : null,
      lim.hasSag ? [`Peak power at low charge (${LOW_CHARGE} %)`, `${fmt(lim.low.powerW / 1000, 1)} kW @ ${fmt(lim.low.amps, 0)} A, ${fmt(lim.low.terminalV, 1)} V (${limitName(lim.low.limit)})`] : null
    ]) + (lim.hasSag && !all.packModel.hasOcvTable && b.cell
      ? helpP("Full and low charge match because no OCV table is entered (constant voltage). Add one under Cell › Performance detail for charge-dependent figures.")
      : (!lim.hasSag ? helpP("Peak power uses nominal voltage. Enter internal resistance for voltage sag under load.") : "")));
  }

  add("chain", "Current limit chain", chainHtml(all), true);
  add("density", "Mass & energy density", densityTable(all), !p);

  if (v) {
    const preset = VEHICLE_PRESETS[state.vehPreset];
    const cdA = Number(state.cd) * Number(state.frontalAreaM2);
    add("vehicle", "Vehicle", rowsHtml([
      state.vehName ? ["Vehicle", esc(state.vehName)] : null,
      preset ? ["Body-style preset", esc(preset.label)] : null,
      ["Test mass", `${fmt(v.massKg, 0)} kg (${state.vehMassIncludesPack ? "includes pack" : `vehicle ${fmt(state.vehMassKg, 0)} + pack ${fmt(p.massKg, 0)}`} + payload ${fmt(state.payloadKg, 0)} kg)`],
      ["Drag", `Cd ${fmt(state.cd, 2)} × ${fmt(state.frontalAreaM2, 2)} m² = CdA ${fmt(cdA, 2)} m²`],
      ["Rolling resistance (Crr)", fmt(state.crr, 4)],
      ["Drivetrain efficiency", `${fmt(state.drivetrainEffPct, 0)} %`],
      ["Accessory load", `${fmt(Sim.buildVehicleModel(b.engineInput).auxiliaryLoadW / 1000, 2)} kW`],
      state.motorEnabled && Number(state.motorPeakKW) > 0 ? ["Motor peak / continuous", `${fmt(state.motorPeakKW, 0)} kW${Number(state.motorPeakS) > 0 ? ` for ${fmt(state.motorPeakS, 0)} s` : ""} / ${Number(state.motorContKW) > 0 ? `${fmt(state.motorContKW, 0)} kW` : "—"}`] : null,
      state.motorEnabled && Number(state.motorTorqueNm) > 0 ? ["Motor peak torque", `${fmt(state.motorTorqueNm, 0)} Nm`] : null,
      state.motorEnabled && Number(state.gearRatio) > 0 ? ["Gear ratio / tyre radius", `${fmt(state.gearRatio, 2)}:1 / ${fmt(state.tyreRadiusMm, 0)} mm${state.tyreSize ? ` (${esc(state.tyreSize)})` : ""}`] : null,
      ["Regenerative braking", state.regenEnabled ? `On, ${fmt(state.regenEffPct, 0)} % efficiency` : "Off"]
    ]));
    if (sim) {
      const limited = Object.entries(sim.limitSeconds || {}).filter(([, s]) => s > 0);
      add("range", "Vehicle range", rowsHtml([
        ["Drive cycle", esc(sim.driveCycleLabel)],
        ["Range", dist(sim.distanceMiles), "highlight"],
        ["Consumption (battery terminals)", whPerDist(sim.consumptionKWhPerMile)],
        ["Efficiency", efficiency(sim.consumptionKWhPerMile)],
        ["Driving time to empty", `${fmt(sim.runtimeMinutes, 0)} min`],
        ["Average speed", speed(sim.averageSpeedMph, 1)],
        ["Energy from pack (net)", `${fmt(sim.netEnergyKWh, 2)} kWh`],
        ["Regen returned to pack", `${fmt(sim.regenRecoveredKWh, 2)} kWh`],
        sim.packLossKWh > 0 ? ["Pack internal losses", `${fmt(sim.packLossKWh, 2)} kWh`] : null,
        ["Peak discharge / regen current", `${fmt(sim.peakDischargeCurrentA, 0)} A / ${fmt(sim.peakChargeCurrentA, 0)} A`],
        ["Power-limited time", limited.length ? limited.map(([k, s]) => `${limitName(k)} ${fmt(s, 0)} s`).join("; ") : "None"],
        ["Speed trace missed", sim.secondsTraceMissed > 0 ? `${fmt(sim.secondsTraceMissed, 0)} s` : "None"]
      ]));
    } else {
      add("range", "Vehicle range", `<p class="help">${esc(v.simError || "Simulation unavailable.")}</p>`);
    }
    const sl = (x) => ({ power: "power", motorRpm: "motor max rpm", topSpeed: "top speed setting" }[x?.limit] || "power");
    add("performance", "Performance at the limits", rowsHtml([
      ["Full-power acceleration, full charge", describeFullPower(v.fullTop)],
      [`Full-power acceleration, low charge (${LOW_CHARGE} %)`, describeFullPower(v.fullLow)],
      ["Top speed, full charge", describeTopSpeed(v.fullTop)],
      [`Top speed, low charge (${LOW_CHARGE} %)`, describeTopSpeed(v.fullLow)],
      ["Max sustained speed (continuous ratings)", `${speed(v.sustainedTop.mph)} full (${sl(v.sustainedTop)}), ${speed(v.sustainedLow.mph)} low charge (${sl(v.sustainedLow)})`]
    ]));
    if (all.charging && (all.charging.ac || all.charging.dc)) add("charging", "Charging", chargingHtml(all.charging), true);
    if (v.speedTable.length) {
      const rowsT = v.speedTable.map((t) => t.error
        ? `<tr><td>${speed(t.mph)}</td><td colspan="3">${esc(t.error)}</td></tr>`
        : `<tr><td>${speed(t.mph)}${t.limited ? " *" : ""}</td><td>${dist(t.rangeMiles, 0)}</td><td>${whPerDist(t.consumptionKWhPerMile)}</td><td>${fmt(t.hours, 1)} h</td></tr>`).join("");
      const anyLimited = v.speedTable.some((t) => t.limited);
      add("speedtable", "Range at constant speed", `<div class="table-wrap"><table class="data"><thead><tr><th>Speed</th><th>Range</th><th>Consumption</th><th>Driving time</th></tr></thead><tbody>${rowsT}</tbody></table></div>`
        + helpP(`Flat road, still air, from 100 % to 0 % charge.${anyLimited ? " * The vehicle could not hold this speed (power or top-speed limit), so range is at the speed it could reach." : ""}`));
    }
  }

  if (all.heat && p) add("heat", "Heat from the cells", heatHtml(all), true);
  if (all.eolAvailable && all.bol && all.eol) add("ages", "Beginning vs end of life", ageCompareHtml(all), true);

  if (all.requirements && all.requirements.rows && all.requirements.rows.length) {
    add("requirements", "Requirement check", requirementHtml(all.requirements), true);
  }

  if (all.lifetime) {
    const L = all.lifetime;
    add("lifetime", "Lifetime & duty cycle", L.noConsumption ? '<p class="help">Enter a consumption figure, or build up to a vehicle so it comes from the simulation.</p>' : rowsHtml([
      ["Service life / distance", `${fmt(L.years, 0)} years · ${dist(L.miles, 0)}`],
      L.annualMiles ? ["Annual distance", `${dist(L.annualMiles, 0)}/year`] : null,
      ["Energy consumption", `${whPerDist(L.cons)} (${L.consumptionSource})`],
      ["Lifetime energy throughput", `${fmt(L.throughputKWh, 0)} kWh`],
      L.perYearKWh ? ["Per year / per day", `${fmt(L.perYearKWh, 0)} kWh / ${fmt(L.perDayKWh, 1)} kWh`] : null,
      ["Equivalent full cycles", fmt(L.cycles, 0)],
      ["Usable energy BOL → EOL", `${fmt(L.bolUsable, 2)} → ${fmt(L.eolUsable, 2)} kWh (${fmt(L.eol, 0)} %)`],
      L.bolRangeMiles ? ["Range BOL → EOL", `${dist(L.bolRangeMiles)} → ${dist(L.eolRangeMiles)}`] : null,
      ["Cell SOC window", `${fmt(L.socWindow[0], 0)}–${fmt(L.socWindow[1], 0)} %`],
      ["Charging pattern", esc({ acOnly: "Mostly AC", dcRapid: "Frequent DC rapid", acDcRapid: "Mixed AC and DC" }[state.lifeCharging] || "")]
    ]));
  }
  return out;
}

function renderResults() {
  const body = $("#resultsBody");
  const all = computeAll();
  const b = all.build;

  if (b.errors.length) {
    body.innerHTML = `<div class="results-hero"><p class="eyebrow">Results</p><h1 tabindex="-1">Some inputs need checking</h1></div>
      <div class="notice error"><ul>${b.errors.map((e) => `<li>${esc(e.text)} <a href="#${e.step}" data-goto="${e.step}">Go to ${esc(e.step)}</a></li>`).join("")}</ul></div>`;
    pauseChart();
    return;
  }

  const sim = all.vehicle?.sim;
  const title = esc(state.projectName || "Untitled project");
  const meta = [state.customer, state.revision ? `Rev ${state.revision}` : "", state.projectDate].filter(Boolean).map(esc).join(" · ");
  const head = headlineData(all);
  const kpis = head.kpis.map(([label, value, unit], i) => kpi(label, value, unit, 0.1 * (i + 1)));
  const warnings = b.warnings.length
    ? `<div class="notice"><strong>Unusual values</strong><ul>${b.warnings.map((w) => `<li>${esc(w.text)}</li>`).join("")}</ul></div>` : "";
  let d = 0.2;
  const panels = resultSections(all).map((sec) => panel(sec.title, sec.html, { wide: sec.wide, delay: (d += 0.08) }));

  body.innerHTML = `
    <div class="results-hero">
      <p class="eyebrow">${title}${meta ? ` · ${meta}` : ""}</p>
      <div class="hero-row">
        <h1 tabindex="-1">${head.headline}<br><span class="accent">${head.accent}</span></h1>
        <div class="actions">
          <span class="status-pill"><span class="dot"></span>${esc(pathLabel())}${sim ? ` · ${fmt(sim.cyclesCompleted, 1)} cycles` : ""}</span>
          <button type="button" class="button" data-goto="${visibleSteps()[0].id}">Edit inputs</button>
          <button type="button" class="button" data-goto="report">PDF report</button>
          <button type="button" class="button primary" data-action="save">Save project</button>
        </div>
      </div>
    </div>
    ${ageSwitchHtml(all)}
    <div class="kpi-strip">${kpis.join("")}</div>
    ${warnings}
    ${sim ? chartPanelHtml(sim) : ""}
    <div class="panel-grid">${panels.join("")}</div>
    <details class="assumptions"><summary>Method and assumptions</summary><ul>${assumptionsList(all).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <p class="help"><a href="readme.html" target="_blank" rel="noopener">Read the full method and equations in the ReadMe</a></p></details>`;
  if (sim) setupChart(sim, all.packModel);
  else pauseChart();
}

function scheduleResults() {
  if (currentStep !== "results") return;
  clearTimeout(resultsTimer);
  resultsTimer = setTimeout(renderResults, 200);
}

// ---------------------------------------------------------------------------
// Projects: save, open, example, new
// ---------------------------------------------------------------------------
function slug(text) {
  return String(text || "battery-project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "battery-project";
}

function saveProjectFile() {
  const data = { type: PROJECT_FILE_TYPE, version: 2, savedAt: new Date().toISOString(), inputs: state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(state.projectName)}${state.revision ? `-rev-${slug(state.revision)}` : ""}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast("Project saved to your downloads");
}

function openProjectFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || data.type !== PROJECT_FILE_TYPE || typeof data.inputs !== "object") throw new Error("not a project file");
      applyInputs(data.inputs);
      showToast(`Opened “${state.projectName || file.name}”`);
    } catch {
      showToast("That file is not a Battery Calculator project");
    }
  };
  reader.readAsText(file);
}

function droppedSecondModule(inputs) {
  return !!(inputs && inputs.useSecondModule && Number(inputs.packModules2) > 0);
}

function applyInputs(inputs, step) {
  state = cleanInputs(inputs);
  if (droppedSecondModule(inputs)) setTimeout(() => showToast("This project used a second module type, which is no longer supported: the pack now uses the first module type only. Check the pack size.", 9000), 2700);
  setControlValues();
  updateVisibility();
  saveState();
  showStep(step || currentStep);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function onFieldChange(field) {
  state[field.id] = readControl(field);
  afterInputChange(field);
}
function afterInputChange(field) {
  if (field.id === "cellOcvTable") updateOcvStatus();
  if (field.id === "tyreSize") updateTyreStatus(true);
  if (field.id === "vehPreset") applyPreset();
  if (field.id === "customProfileUnit") updateProfileStatus();
  updatePresetNote();
  updateWltpGuide();
  updateVisibility();
  updateRatingsPreviews();
  updateStepErrors();
  renderNav();
  saveState();
  scheduleResults();
}

function closeMenu() {
  $("#sidebar").classList.remove("open");
  $("#scrim").hidden = true;
  $("#menuButton").setAttribute("aria-expanded", "false");
}

function bindEvents() {
  for (const field of ALL_FIELDS) {
    const el = document.getElementById(field.id);
    if (!el) continue;
    if (field.type === "segment") {
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-seg-value]");
        if (!b) return;
        state[field.id] = b.dataset.segValue;
        $$("[data-seg-value]", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        afterInputChange(field);
      });
      continue;
    }
    if (field.type === "boxes") {
      const commit = () => { state[field.id] = boxRowsToText(readBoxEditor(el)); afterInputChange(field); };
      el.addEventListener("input", () => {
        // update the row and total figures in place so typing is not interrupted
        const rows = readBoxEditor(el);
        const lit = (r) => (Number(r.l) > 0 && Number(r.w) > 0 && Number(r.h) > 0 ? Number(r.l) * Number(r.w) * Number(r.h) / 1e6 : null);
        $$("[data-box-row]", el).forEach((row, i) => { const x = lit(rows[i]); row.querySelector("[data-box-litres]").textContent = x !== null ? `${fmt(x, 1)} L` : "—"; });
        const total = rows.reduce((sum, r) => sum + (lit(r) || 0), 0);
        el.querySelector("[data-box-total]").textContent = total > 0 ? `${fmt(total, 1)} L` : "—";
        commit();
      });
      el.addEventListener("click", (e) => {
        const rows = readBoxEditor(el);
        if (e.target.closest("[data-box-add]")) { rows.push({ name: "", l: "", w: "", h: "" }); renderBoxEditor(el, rows); el.querySelector(`[data-box-row="${rows.length - 1}"] input`)?.focus(); }
        else if (e.target.closest("[data-box-remove]")) { rows.splice(Number(e.target.closest("[data-box-remove]").dataset.boxRemove), 1); renderBoxEditor(el, rows.length ? rows : undefined); }
        else return;
        commit();
      });
      continue;
    }
    const eventName = field.type === "switch" || field.type === "select" || field.type === "date" ? "change" : "input";
    el.addEventListener(eventName, () => onFieldChange(field));
  }

  $("#buildStart").addEventListener("change", (e) => { state.buildStart = e.target.value; afterBuildChange(); });
  $("#buildEnd").addEventListener("change", (e) => { state.buildEnd = e.target.value; afterBuildChange(); });

  $$(".units-toggle button").forEach((btn) => btn.addEventListener("click", () => {
    state.units = btn.dataset.units;
    setControlValues();
    saveState();
    if (currentStep === "results") renderResults();
    if (currentStep === "report" && typeof renderReportStep === "function") renderReportStep();
    if (currentStep === "compare" && typeof renderCompareStep === "function") renderCompareStep();
  }));

  // Navigation (sidebar links, Back/Next, links inside results)
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-goto]");
    if (go) { e.preventDefault(); showStep(go.dataset.goto); return; }
    const nav = e.target.closest("[data-nav]");
    if (nav) { stepOffset(nav.dataset.nav === "next" ? 1 : -1); return; }
    const action = e.target.closest("[data-action]");
    if (action && action.dataset.action === "save") saveProjectFile();
    const age = e.target.closest("[data-age]");
    if (age && (age.dataset.age === "bol" || age.dataset.age === "eol")) {
      state.resultsAge = age.dataset.age;
      saveState();
      if (currentStep === "results") renderResults();
      if (currentStep === "report" && typeof renderReportStep === "function") renderReportStep();
    }
  });
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id && id !== currentStep) showStep(id);
  });

  $("#saveProject").addEventListener("click", saveProjectFile);
  $("#openProject").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) openProjectFile(file);
    e.target.value = "";
  });
  $("#loadExample").addEventListener("click", () => {
    if (!confirmReplace()) return;
    applyInputs({ ...EXAMPLE, projectDate: today(), units: state.units }, "results");
    showToast("Example project loaded (fictional values)");
  });
  $("#newProject").addEventListener("click", () => {
    if (!confirmReplace()) return;
    applyInputs({ ...BLANK, projectDate: today(), units: state.units, buildStart: state.buildStart, buildEnd: state.buildEnd }, "project");
    showToast("New project started");
  });

  $("#ocvFile")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el = document.getElementById("cellOcvTable");
      el.value = String(reader.result || "");
      onFieldChange(FIELD_BY_ID.cellOcvTable);
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  $("#profileFile")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2000000) { showToast("Profile file is too large (2 MB max)"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      state.customProfileText = String(reader.result || "");
      state.customProfileName = file.name.slice(0, 120);
      updateProfileStatus();
      saveState();
      scheduleResults();
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  $("#profileClear")?.addEventListener("click", () => {
    state.customProfileText = "";
    state.customProfileName = "";
    updateProfileStatus();
    saveState();
    scheduleResults();
  });
  document.addEventListener("click", (e) => {
    const info = e.target.closest("[data-info]");
    if (info) { e.preventDefault(); e.stopPropagation(); openInfo(info.dataset.info); return; }
    const opener = e.target.closest("[data-open-dialog]");
    if (opener) document.getElementById(opener.dataset.openDialog)?.showModal();
    const closer = e.target.closest("[data-close-dialog]");
    if (closer) closer.closest("dialog")?.close();
  });

  $("#menuButton").addEventListener("click", () => {
    const open = !$("#sidebar").classList.contains("open");
    $("#sidebar").classList.toggle("open", open);
    $("#scrim").hidden = !open;
    $("#menuButton").setAttribute("aria-expanded", String(open));
  });
  $("#scrim").addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
}

function confirmReplace() {
  return window.confirm("Replace the current inputs? Save the project first if you want to keep it.");
}

function afterBuildChange() {
  updateVisibility();
  updateRatingsPreviews();
  renderNav();
  updateStepErrors();
  saveState();
  if (!visibleSteps().some((s) => s.id === currentStep)) showStep(visibleSteps()[0].id);
  else if (currentStep === "results") renderResults();
  else if (currentStep === "report" && typeof renderReportStep === "function") renderReportStep();
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------
function startupError(message) {
  const box = $("#startupError");
  box.textContent = message;
  box.hidden = false;
}

function init() {
  if (!Sim || !Calc) {
    startupError("The calculator could not start because simulation.js or calc.js did not load. Upload all files together (index.html, app.js, calc.js, simulation.js, styles.css, assets) and refresh (Ctrl+F5).");
    return;
  }
  if (!(Sim.ENGINE_VERSION >= REQUIRED_ENGINE_VERSION)) {
    startupError(`The calculator could not start because simulation.js is out of date (needs version ${REQUIRED_ENGINE_VERSION}). Upload the latest files together and refresh (Ctrl+F5).`);
    return;
  }
  loadState();
  renderSteps();
  setControlValues();
  updateVisibility();
  bindEvents();
  if (typeof initTools === "function") initTools();
  const fromHash = location.hash.slice(1);
  showStep(fromHash || currentStep);
}

document.addEventListener("DOMContentLoaded", init);

// ---------------------------------------------------------------------------
// Simulation graph: the whole run from 100 % to 0 % (driver-displayed charge),
// replayed at an accelerated speed with play / pause / scrub controls.
// The same drawing code produces the static graph in the PDF report.
// ---------------------------------------------------------------------------
const CHART_DARK = {
  background: "#000204", grid: "rgba(255,255,255,.07)", axis: "rgba(255,255,255,.28)", label: "rgba(255,255,255,.72)",
  cycleLabel: "rgba(255,255,255,.35)", discharge: "#899E78", regen: "#7FA7B5", speed: "rgba(255,255,255,.55)",
  soc: "#C08A57", voltage: "#B7A7D9", voltageBand: "rgba(183,167,217,.25)", limited: "#F08C80",
  cycleLine: "rgba(255,255,255,.12)", playhead: "rgba(255,255,255,.85)"
};
const CHART_LIGHT = {
  background: "#FFFFFF", grid: "rgba(0,0,0,.08)", axis: "rgba(0,0,0,.35)", label: "rgba(0,0,0,.75)",
  cycleLabel: "rgba(0,0,0,.45)", discharge: "#6F795C", regen: "#3E7F96", speed: "rgba(0,0,0,.5)",
  soc: "#997045", voltage: "#6E5BA8", voltageBand: "rgba(110,91,168,.18)", limited: "#C9473B",
  cycleLine: "rgba(0,0,0,.1)", playhead: "rgba(0,0,0,.8)"
};

const chartState = { view: "full", playbackSeconds: 30, progress: 1, playing: false, lastTs: null, frame: null, seriesKey: null, series: null, sim: null, key: 0 };

function chartSimInfo(sim, packModel) {
  return {
    trace: sim.trace, cycleSeconds: sim.cycleSeconds, cyclesCompleted: sim.cyclesCompleted, driveCycle: sim.driveCycle,
    label: sim.driveCycleLabel, socTop: packModel.socTop, socBottom: packModel.socBottom,
    hasVoltage: packModel.resistanceOhm > 0 || packModel.hasOcvTable
  };
}

function chartDisplaySoc(info, actual) {
  const span = info.socTop - info.socBottom;
  return span > 0 ? Math.min(100, Math.max(0, (actual - info.socBottom) / span * 100)) : 0;
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
function formatDuration(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function chartRange(info, view) {
  const { trace, cycleSeconds } = info;
  const length = trace.seconds.length;
  if (view === "first") return { start: 0, end: Math.min(length, cycleSeconds) };
  if (view === "last") {
    const lastCycle = trace.cycle[length - 1];
    const start = trace.cycle.indexOf(lastCycle);
    return { start: Math.max(0, Math.min(start, length - cycleSeconds)), end: length };
  }
  return { start: 0, end: length };
}

// One bucket per pixel; keep the peaks (max discharge, max regen, min/max voltage).
function buildSeries(info, view, bucketCount) {
  const { trace } = info;
  const r = chartRange(info, view);
  const span = r.end - r.start;
  const n = Math.max(1, Math.min(bucketCount, span));
  const buckets = [];
  for (let b = 0; b < n; b++) {
    const i0 = r.start + Math.floor(b * span / n);
    const i1 = Math.max(i0 + 1, r.start + Math.floor((b + 1) * span / n));
    let maxD = 0, maxR = 0, sp = 0, minV = Infinity, maxV = -Infinity, lim = 0;
    for (let i = i0; i < i1; i++) {
      const c = trace.current[i];
      if (c > maxD) maxD = c;
      if (-c > maxR) maxR = -c;
      sp += trace.speedMps[i];
      if (trace.terminalV[i] < minV) minV = trace.terminalV[i];
      if (trace.terminalV[i] > maxV) maxV = trace.terminalV[i];
      lim += trace.limited[i];
    }
    buckets.push({ endIndex: i1 - 1, maxD, maxR, speedMph: sp / (i1 - i0) / 0.44704, soc: chartDisplaySoc(info, trace.soc[i1 - 1]), minV, maxV, limited: lim > 0 });
  }
  const cycleStarts = [];
  if (info.driveCycle !== "constant") {
    for (let i = r.start + 1; i < r.end; i++) if (trace.cycle[i] !== trace.cycle[i - 1]) cycleStarts.push({ index: i, cycle: trace.cycle[i] });
  }
  return {
    range: r, buckets, cycleStarts,
    maxCurrent: Math.max(1, ...buckets.map((x) => Math.max(x.maxD, x.maxR))),
    maxSpeed: Math.max(1, ...buckets.map((x) => x.speedMph)),
    minV: Math.min(...buckets.map((x) => x.minV)),
    maxV: Math.max(...buckets.map((x) => x.maxV)),
    startSeconds: r.start > 0 ? trace.seconds[r.start - 1] : 0,
    endSeconds: trace.seconds[r.end - 1]
  };
}

function niceCeil(value, steps = [1, 2, 2.5, 5, 10]) {
  if (!(value > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of steps) if (step * mag >= value) return step * mag;
  return 10 * mag;
}

// Draws the two-panel graph onto ctx (w × h CSS pixels). Returns the last visible bucket.
function paintChart(ctx, w, h, info, s, progress, P) {
  const n = s.buckets.length;
  const count = Math.max(1, Math.round(progress * n));
  const vis = s.buckets.slice(0, count);
  const compact = w < 560;
  const pad = { left: compact ? 46 : 58, right: compact ? 46 : 58, top: 30, bottom: 26 };
  const gap = 28;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom - gap;
  const topH = plotH * 0.6;
  const botH = plotH - topH;
  const topY = pad.top;
  const botY = pad.top + topH + gap;
  const x = (i) => pad.left + (i + 0.5) / n * plotW;
  const cMax = niceCeil(s.maxCurrent * 1.05);
  const vSpeedMax = niceCeil(toDisplay("speed", s.maxSpeed) * 1.05, [1, 2, 5, 10]);
  const zeroY = topY + topH / 2;
  const yI = (a) => zeroY - a / cMax * (topH / 2);
  const ySp = (mph) => topY + topH - toDisplay("speed", mph) / vSpeedMax * topH;
  const ySoc = (pct) => botY + botH - pct / 100 * botH;
  const hasV = info.hasVoltage;
  const vPad = Math.max(2, (s.maxV - s.minV) * 0.08);
  const vLo = s.minV - vPad, vHi = s.maxV + vPad;
  const yV = (v) => botY + botH - (v - vLo) / Math.max(1e-6, vHi - vLo) * botH;

  ctx.fillStyle = P.background;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `${compact ? 10 : 11}px Jost, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    for (const [y0, hh] of [[topY, topH], [botY, botH]]) {
      const yy = y0 + i / 4 * hh;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + plotW, yy); ctx.stroke();
    }
  }
  if (s.cycleStarts.length) {
    const prefix = info.driveCycle === "custom" ? "R" : "C";
    const every = Math.max(1, Math.ceil(s.cycleStarts.length / (compact ? 6 : 14)));
    ctx.strokeStyle = P.cycleLine;
    ctx.fillStyle = P.cycleLabel;
    ctx.textAlign = "left";
    s.cycleStarts.forEach((c, k) => {
      const xx = pad.left + (c.index - s.range.start) / (s.range.end - s.range.start) * plotW;
      ctx.beginPath(); ctx.moveTo(xx, topY); ctx.lineTo(xx, botY + botH); ctx.stroke();
      if (k % every === 0) ctx.fillText(`${prefix}${c.cycle}`, xx + 3, topY + 8);
    });
  }
  ctx.strokeStyle = P.axis;
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + plotW, zeroY); ctx.stroke();

  const barW = Math.max(1, plotW / n);
  vis.forEach((b, i) => {
    const xx = x(i) - barW / 2;
    if (b.maxD > 0) { ctx.fillStyle = b.limited ? P.limited : P.discharge; ctx.fillRect(xx, yI(b.maxD), barW, zeroY - yI(b.maxD)); }
    if (b.maxR > 0) { ctx.fillStyle = P.regen; ctx.fillRect(xx, zeroY, barW, yI(-b.maxR) - zeroY); }
  });
  ctx.strokeStyle = P.speed; ctx.lineWidth = 1.2; ctx.beginPath();
  vis.forEach((b, i) => (i ? ctx.lineTo(x(i), ySp(b.speedMph)) : ctx.moveTo(x(i), ySp(b.speedMph))));
  ctx.stroke();

  if (hasV) {
    ctx.fillStyle = P.voltageBand;
    vis.forEach((b, i) => ctx.fillRect(x(i) - barW / 2, yV(b.maxV), barW, Math.max(1, yV(b.minV) - yV(b.maxV))));
    ctx.strokeStyle = P.voltage; ctx.lineWidth = 1.4; ctx.beginPath();
    vis.forEach((b, i) => (i ? ctx.lineTo(x(i), yV(b.minV)) : ctx.moveTo(x(i), yV(b.minV))));
    ctx.stroke();
  }
  ctx.strokeStyle = P.soc; ctx.lineWidth = 2.6; ctx.beginPath();
  vis.forEach((b, i) => (i ? ctx.lineTo(x(i), ySoc(b.soc)) : ctx.moveTo(x(i), ySoc(b.soc))));
  ctx.stroke();

  ctx.fillStyle = P.label;
  ctx.textAlign = "right";
  ctx.fillText(`+${fmt(cMax, 0)} A`, pad.left - 6, topY);
  ctx.fillText("0 A", pad.left - 6, zeroY);
  ctx.fillText(`−${fmt(cMax, 0)} A`, pad.left - 6, topY + topH);
  ctx.fillText("100 %", pad.left - 6, botY);
  ctx.fillText("0 %", pad.left - 6, botY + botH);
  ctx.textAlign = "left";
  ctx.fillText(`${fmt(vSpeedMax, 0)} ${unitLabel("speed")}`, pad.left + plotW + 6, topY);
  ctx.fillText("0", pad.left + plotW + 6, topY + topH);
  if (hasV) {
    ctx.fillStyle = P.voltage;
    ctx.fillText(`${fmt(vHi, 0)} V`, pad.left + plotW + 6, botY);
    ctx.fillText(`${fmt(vLo, 0)} V`, pad.left + plotW + 6, botY + botH);
  }
  ctx.fillStyle = P.label;
  ctx.textAlign = "left"; ctx.fillText(formatClock(s.startSeconds), pad.left, h - 10);
  ctx.textAlign = "right"; ctx.fillText(formatClock(s.endSeconds), pad.left + plotW, h - 10);
  ctx.textAlign = "center"; ctx.fillText("Driving time (h:mm:ss)", pad.left + plotW / 2, h - 10);

  const legend = (items, y) => {
    let lx = pad.left;
    ctx.textAlign = "left";
    ctx.font = `500 ${compact ? 10 : 12}px "Space Grotesk", system-ui, sans-serif`;
    items.forEach(([label, color]) => {
      ctx.fillStyle = color; ctx.fillRect(lx, y - 4, 10, 8);
      ctx.fillStyle = P.label;
      ctx.fillText(label, lx + 14, y);
      lx += ctx.measureText(label).width + 30;
    });
    ctx.font = `${compact ? 10 : 11}px Jost, system-ui, sans-serif`;
  };
  legend([["Discharge (peak)", P.discharge], ["Regen (peak)", P.regen], ["Speed", P.speed],
    ...(s.buckets.some((b) => b.limited) ? [["Power-limited", P.limited]] : [])], topY - 14);
  legend([["Charge (as shown to driver)", P.soc], ...(hasV ? [["Pack voltage under load", P.voltage]] : [])], botY - 13);

  const last = vis[vis.length - 1];
  const hx = x(count - 1);
  if (progress < 1) {
    ctx.strokeStyle = P.playhead; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(hx, topY); ctx.lineTo(hx, botY + botH); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = P.soc;
  ctx.beginPath(); ctx.arc(hx, ySoc(last.soc), 4.5, 0, Math.PI * 2); ctx.fill();
  return last;
}

function drawChart() {
  const canvas = $("#simChart");
  if (!canvas || !chartState.sim) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, rect.width);
  const h = Math.max(300, rect.height);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bucketCount = Math.max(150, Math.round(w - 110));
  const key = `${chartState.key}|${chartState.view}|${bucketCount}`;
  if (chartState.seriesKey !== key) { chartState.series = buildSeries(chartState.sim, chartState.view, bucketCount); chartState.seriesKey = key; }
  const last = paintChart(ctx, w, h, chartState.sim, chartState.series, chartState.progress, CHART_DARK);
  updateLiveTiles(last.endIndex);
  updateChartControls();
}

// Static image of the full run, for the report.
function chartImage(info, theme, w = 900, h = 420) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const series = buildSeries(info, "full", Math.round(w - 110));
  paintChart(ctx, w, h, info, series, 1, theme === "dark" ? CHART_DARK : CHART_LIGHT);
  return canvas.toDataURL("image/png");
}

function updateLiveTiles(i) {
  const sim = chartState.sim;
  const t = sim.trace;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const c = t.current[i];
  set("liveTime", formatClock(t.seconds[i]));
  set("liveCurrent", `${fmt(Math.max(0, c), 0)} A`);
  set("liveRegen", `${fmt(c < 0 ? -c : 0, 0)} A`);
  set("liveSpeed", speed(t.speedMps[i] / 0.44704));
  set("liveDistance", dist(t.distanceM[i] / 1609.344, 1));
  set("liveVoltage", `${fmt(t.terminalV[i], 0)} V`);
  set("liveCharge", `${fmt(chartDisplaySoc(sim, t.soc[i]), 0)} %`);
  set("liveEnergy", `${fmt(t.netEnergyJ[i] / 3.6e6, 2)} kWh`);
  set("liveRecovered", `${fmt(t.regenEnergyJ[i] / 3.6e6, 2)} kWh`);
  set("livePhase", sim.driveCycle === "constant" ? sim.label
    : `${sim.driveCycle === "custom" ? "Repeat" : "Cycle"} ${t.cycle[i]} of ${Math.ceil(sim.cyclesCompleted - 1e-9)} · ${String(t.phase[i]).replace("WLTP ", "")}${t.limited[i] ? " (limited)" : ""}`);
}

function updateChartControls() {
  const scrub = $("#chartScrubber");
  if (scrub && document.activeElement !== scrub) scrub.value = String(Math.round(chartState.progress * 1000));
  const play = $("#chartPlay");
  if (play) play.textContent = chartState.playing ? "Pause" : chartState.progress >= 1 ? "Replay" : "Play";
  const stats = $("#chartStats");
  if (stats && chartState.series) {
    const simS = chartState.series.endSeconds - chartState.series.startSeconds;
    const view = { full: `Full run, 100 % to 0 %: ${formatDuration(simS)} of driving`, first: "First cycle (full battery)", last: "Final cycle (near empty)" }[chartState.view];
    stats.textContent = `${view} · replayed in ${chartState.playbackSeconds} s (×${fmt(simS / Math.max(1, chartState.playbackSeconds), 0)} speed)`;
  }
}

function chartStep(ts) {
  if (!chartState.playing) return;
  if (chartState.lastTs === null) chartState.lastTs = ts;
  chartState.progress = Math.min(1, chartState.progress + (ts - chartState.lastTs) / 1000 / chartState.playbackSeconds);
  chartState.lastTs = ts;
  drawChart();
  if (chartState.progress >= 1) { chartState.playing = false; updateChartControls(); return; }
  chartState.frame = requestAnimationFrame(chartStep);
}
function playChart() {
  if (chartState.progress >= 1) chartState.progress = 0;
  chartState.playing = true;
  chartState.lastTs = null;
  cancelAnimationFrame(chartState.frame);
  chartState.frame = requestAnimationFrame(chartStep);
}
function pauseChart() {
  chartState.playing = false;
  cancelAnimationFrame(chartState.frame);
  updateChartControls();
}

function chartPanelHtml(sim) {
  const tile = (id, label, cls = "") => `<div class="tile${cls ? ` ${cls}` : ""}"><span>${label}</span><strong id="${id}">—</strong></div>`;
  return `<section class="panel wide graph-panel" style="animation-delay:.25s">
    <div class="graph-head">
      <div><h2>Vehicle energy simulation</h2><p class="help">${esc(sim.driveCycleLabel)}: the whole drive from 100 % to 0 % charge, replayed at high speed. Bars show the peak current in each moment.</p></div>
    </div>
    <div class="chart-controls">
      <button type="button" class="button primary" id="chartPlay">Play</button>
      <label class="mini-field"><span>View</span><select id="chartView">
        <option value="full">Full run, 100 % to 0 %</option><option value="first">First cycle (full battery)</option><option value="last">Final cycle (near empty)</option>
      </select></label>
      <label class="mini-field"><span>Replay length</span><select id="chartLength">
        <option value="15">15 s</option><option value="30">30 s</option><option value="60">60 s</option><option value="120">2 min</option>
      </select></label>
      <input id="chartScrubber" class="scrubber" type="range" min="0" max="1000" step="1" value="1000" aria-label="Simulation position">
    </div>
    <canvas id="simChart" class="sim-chart" role="img" aria-label="Simulation graph: current, speed, charge and pack voltage over the whole run"></canvas>
    <p class="chart-stats" id="chartStats"></p>
    <div class="tiles">
      ${tile("liveTime", "Driving time")}${tile("liveCurrent", "Discharge", "green")}${tile("liveRegen", "Regen", "blue")}${tile("liveSpeed", "Speed")}${tile("liveDistance", "Distance")}
      ${tile("liveVoltage", "Pack voltage")}${tile("liveCharge", "Charge", "bronze")}${tile("liveEnergy", "Energy used")}${tile("liveRecovered", "Regen recovered", "blue")}${tile("livePhase", "Cycle / phase", "phase")}
    </div>
  </section>`;
}

function setupChart(sim, packModel) {
  pauseChart();
  chartState.sim = chartSimInfo(sim, packModel);
  chartState.key += 1;
  chartState.seriesKey = null;
  chartState.progress = 1;
  chartState.view = "full";
  $("#chartView").value = chartState.view;
  $("#chartLength").value = String(chartState.playbackSeconds);
  $("#chartPlay").addEventListener("click", () => (chartState.playing ? pauseChart() : playChart()));
  $("#chartView").addEventListener("change", (e) => { chartState.view = e.target.value; chartState.seriesKey = null; if (!chartState.playing) chartState.progress = 1; drawChart(); });
  $("#chartLength").addEventListener("change", (e) => { chartState.playbackSeconds = Number(e.target.value) || 30; updateChartControls(); });
  $("#chartScrubber").addEventListener("input", (e) => { pauseChart(); chartState.progress = Math.max(0.001, Number(e.target.value) / 1000); drawChart(); });
  requestAnimationFrame(drawChart);
}

window.addEventListener("resize", () => { if (chartState.sim && $("#simChart") && currentStep === "results") drawChart(); });
