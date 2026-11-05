// Volt Energy Systems — Battery Cell Calculator: ReadMe content.
// Shared by readme.html (full page) and the "i" pop-ups in the calculator,
// so the two always match. Each topic: { id, group, title, html }.
(function (root) {
  "use strict";

  const eq = (s) => `<div class="eq">${s}</div>`;

  const topics = [
    // ------------------------------------------------------------------ Using
    {
      id: "overview", group: "Using the calculator", title: "What the calculator does",
      html: `
<p>The calculator builds a battery up from a cell (or a module datasheet) to a module, a pack and, if you want, a vehicle. For a vehicle it then simulates driving from full to empty to estimate range, consumption and performance at the limits of the pack, motor and BMS.</p>
<p>It is an <strong>engineering estimate</strong> for discussion and early design. It is not a type-approval test, a specification or a commitment, and results should be validated by test.</p>
<h4>How to use it</h4>
<ol>
  <li>In the sidebar choose where to <strong>start</strong> (cell or module) and how far to <strong>build up</strong> (module, pack or vehicle). Only the steps you need are shown.</li>
  <li>Work through the steps. Each asks only for datasheet essentials; extra detail sits in the collapsible “More detail” sections and can be left alone.</li>
  <li>Optional sections (Design requirements, Lifetime &amp; duty cycle) are switched on from their own step.</li>
  <li>Open <strong>Results</strong>, then <strong>PDF report</strong> to print or save, or <strong>Compare designs</strong> to see two designs side by side.</li>
</ol>
<p>Your inputs are remembered in this browser automatically. Use <em>Save project</em> to keep a file you can reopen or send to a colleague.</p>`
    },
    {
      id: "units", group: "Using the calculator", title: "Units and warnings",
      html: `
<p>The Miles / Km switch changes how distance, speed and consumption are shown. Values are stored internally in UK units (miles, mph), so switching never changes a design.</p>
<p><strong>Errors</strong> (red) stop the results until fixed, e.g. a minimum voltage above the maximum. <strong>Unusual values</strong> (amber) are warnings only. They appear when a value is outside a typical range:</p>
<table class="data"><thead><tr><th>Input</th><th>Typical range</th></tr></thead><tbody>
<tr><td>Cell nominal voltage</td><td>1.2–4.4 V</td></tr>
<tr><td>Cell capacity</td><td>0.5–400 Ah</td></tr>
<tr><td>Cell mass</td><td>10 g – 6 kg</td></tr>
<tr><td>Cell max discharge</td><td>up to 30 C</td></tr>
<tr><td>Usable factor</td><td>0.6–1.0</td></tr>
<tr><td>Drag coefficient</td><td>0.20–0.70</td></tr>
<tr><td>Frontal area</td><td>1.2–6 m²</td></tr>
<tr><td>Rolling resistance</td><td>0.005–0.020</td></tr>
<tr><td>Battery-to-wheel efficiency</td><td>70–97 %</td></tr>
<tr><td>Vehicle mass</td><td>300–4,000 kg</td></tr>
</tbody></table>`
    },

    // ------------------------------------------------------------------ Cell
    {
      id: "cell-inputs", group: "Cell", title: "Cell datasheet values",
      html: `
<p>Only the values found on almost every cell datasheet are required: nominal, maximum and minimum voltage, capacity, maximum (peak) discharge current, continuous discharge current, maximum charge current and mass.</p>
${eq("Cell energy E<sub>cell</sub> [Wh] = V<sub>nom</sub> × C [Ah]")}
${eq("C-rate = I ÷ C &nbsp;&nbsp;(e.g. 18 A on a 5 Ah cell = 3.6 C)")}
${eq("Specific energy [Wh/kg] = E<sub>cell</sub> ÷ m<sub>cell</sub>")}
<p>Enter currents in amps, not C-rate. A maximum discharge above 30 C triggers a warning because it is usually a unit mix-up.</p>
<p><strong>Peak charge current</strong> (optional) is a short-term charge rating, with the time it may be held. It is used for regenerative braking: regen may use 80 % of the peak charge rating while the peak time lasts, then 80 % of the continuous charge rating, recovering like the discharge peak. Charging times keep using the continuous rating. Module and pack charge ratings cap (as limits) or set (as a rating) both the peak and the continuous charge.</p>`
    },
    {
      id: "cell-format", group: "Cell", title: "Cell format and volume",
      html: `
<p>Choosing a standard cylindrical size (18650, 21700, 4680) fills its diameter and length. Volume is only needed for Wh/L figures.</p>
${eq("Cylindrical: V = π × (d ÷ 2)² × L")}
${eq("Prismatic / pouch: V = L × W × T")}
${eq("Energy density [Wh/L] = E ÷ V")}
<p>Volumes use the nominal outer dimensions from the datasheet, without tabs, terminals or swelling allowance.</p>`
    },
    {
      id: "cell-performance", group: "Cell", title: "Internal resistance, pulse time and OCV",
      html: `
<p>These optional values make the simulation more realistic.</p>
<ul>
  <li><strong>DC internal resistance (DCIR)</strong> adds voltage sag under load and I²R losses. Use the datasheet DCIR at the temperature you want to represent (resistance rises in the cold and with age; neither is modelled).</li>
  <li><strong>Max discharge duration</strong> is how long the peak current may be held. After that the continuous rating applies until the cell has spent the same time back at or below its continuous current (see <em>Peak ratings</em>).</li>
  <li><strong>OCV vs SOC table</strong> gives the open-circuit voltage at each state of charge, so power and voltage fall as the pack empties. Without it the nominal voltage is used at every charge level.</li>
</ul>
${eq("Pack resistance R<sub>pack</sub> = R<sub>cell</sub> × S ÷ P")}
${eq("Terminal voltage V = OCV(SOC) − I × R<sub>pack</sub>")}
<p>The OCV table is linearly interpolated between the points you give. Paste “SOC %, voltage” pairs, one per line, or load a CSV.</p>`
    },

    // ------------------------------------------------------------------ Module
    {
      id: "module-build", group: "Module", title: "Building a module from cells",
      html: `
<p>Cells are arranged as S in series and P in parallel (an “SxP” module).</p>
${eq("V<sub>module</sub> = V<sub>cell</sub> × S &nbsp;&nbsp; (nominal, max and min)")}
${eq("C<sub>module</sub> = C<sub>cell</sub> × P &nbsp;&nbsp; I<sub>module</sub> = I<sub>cell</sub> × P")}
${eq("E<sub>module</sub> = V<sub>module</sub> × C<sub>module</sub>")}
${eq("m<sub>module</sub> = m<sub>cell</sub> × S × P + overhead")}
<p>The module's current ratings start from the cells (cell rating × P). Once the module is designed they can be refined with optional <em>Module ratings</em> (see <em>Module and pack ratings</em>).</p>`
    },
    {
      id: "module-datasheet", group: "Module", title: "Starting from a module datasheet",
      html: `
<p>When you start from a module, enter its datasheet values directly: voltages, capacity, current ratings and mass. The pack is then built from modules:</p>
${eq("V<sub>pack</sub> = V<sub>module</sub> × modules in series")}
${eq("C<sub>pack</sub> = C<sub>module</sub> × parallel strings")}
<p>A module DCIR and pulse duration can be added under “Module detail” to include voltage sag and peak-time limits. Starting from a module datasheet gives the same pack results as building the same module from its cells.</p>`
    },
    {
      id: "mass-overhead", group: "Module", title: "Mass overhead",
      html: `
<p>Everything that is not a cell adds mass. Two methods are available at module and pack level:</p>
<ul>
  <li><strong>Simple percentage</strong>: module overhead as a % of cell mass; pack overhead as a % of module mass.</li>
  <li><strong>Itemised</strong>: enter the mass of each item (housing, interconnects, electronics, enclosure, busbars, BMS, cooling, other) in kg.</li>
</ul>
${eq("m<sub>pack</sub> = Σ m<sub>module</sub> × (1 + overhead %) &nbsp; or &nbsp; Σ m<sub>module</sub> + Σ items")}
<p>Overhead lowers Wh/kg at each level, which is why the density table shows cell, module and pack separately.</p>`
    },

    // ------------------------------------------------------------------ Pack
    {
      id: "pack-build", group: "Pack & BMS", title: "Pack arrangement and usable energy",
      html: `
<p>Modules are connected in series to make a string; strings can be connected in parallel.</p>
${eq("E<sub>pack</sub> = V<sub>pack</sub> × C<sub>pack</sub>")}
${eq("E<sub>usable</sub> = E<sub>pack</sub> × usable factor")}
<p>The <strong>usable factor</strong> is the share of nominal energy the BMS lets the driver use. It is applied as a window centred on the middle of the cell's charge range:</p>
${eq("SOC<sub>bottom</sub> = (1 − usable factor) × 50 % &nbsp;&nbsp; SOC<sub>top</sub> = 100 % − SOC<sub>bottom</sub>")}
<p>For example 0.88 gives a cell window of 6–94 %. Everything shown to the user uses the <strong>driver's charge</strong>, 100 % at the top of the window and 0 % at the bottom:</p>
${eq("Charge shown = (SOC − SOC<sub>bottom</sub>) ÷ (SOC<sub>top</sub> − SOC<sub>bottom</sub>) × 100 %")}
<p>“Low charge” figures are taken at 15 % displayed charge.</p>`
    },
    {
      id: "module-pack-ratings", group: "Pack & BMS", title: "Module and pack ratings",
      html: `
<p>Current ratings follow the build: <strong>the cell sets the module, the module sets the pack, and the vehicle uses the pack</strong>.</p>
${eq("Module (from cells): I = I<sub>cell</sub> × P")}
${eq("Pack (from modules): I = I<sub>module</sub> × parallel strings")}
<p>Both levels have optional ratings, for when the module or pack design is known. Leave them off while it is still being designed. Switched on, choose how they are used:</p>
<ul>
  <li><strong>As limits</strong>: the lower of the entry and the level below is used. Use this for the weakest part in the current path: busbars, cell joints, module terminals, fuse, contactors, HV connector, BMS settings.</li>
  <li><strong>As the module / pack rating</strong>: the entry is used instead, higher or lower. Use this for a validated design rating (for example a module with cooling that is rated above the cell datasheet). A warning shows wherever an entry is above the level below, so check the design is validated for it.</li>
</ul>
<p>A value left at 0 keeps the figure from the level below. Continuous current is never allowed above peak. The <em>What the module/pack will use</em> table under the inputs, and the <em>Current limit chain</em> in the results, show where each figure comes from.</p>
<p><strong>Peak duration</strong>: as limits, the shortest duration in the chain applies; as a rating, the entered duration replaces it. <strong>Regen</strong> is 80 % of the cell (or module datasheet) charge rating unless a module or pack charge rating sets it.</p>
<p>A pack built from one module design: the option to mix two module types has been removed. Projects saved with two types open using the first type only, with a message.</p>`
    },
    {
      id: "density", group: "Pack & BMS", title: "Mass and energy density",
      html: `
${eq("Wh/kg = energy ÷ mass &nbsp;&nbsp; Wh/L = energy ÷ volume")}
<p>Cell Wh/L uses the cell format and size. Module Wh/L uses the module size entered; pack Wh/L uses the enclosure size. Where no size is entered, Wh/L is shown as “—”. Module and pack masses include the overheads entered.</p>`
    },
    {
      id: "pack-electrical", group: "Pack & BMS", title: "Pack electrical model",
      html: `
<p>The pack is modelled as an open-circuit voltage in series with a resistance (a first-order equivalent circuit without RC dynamics):</p>
${eq("V = OCV(SOC) − I × R")}
<p>For a requested terminal power P the current is found from P = (OCV − I·R) × I:</p>
${eq("I = (OCV − √(OCV² − 4·R·P)) ÷ (2·R)")}
<p>The maximum discharge current at any moment is the lowest of:</p>
<ul>
  <li>the pack peak rating from the cell → module → pack chain (or the pack continuous rating, once the peak time is used up);</li>
  <li>inverter / controller max DC current;</li>
  <li>the minimum-voltage limit: I = (OCV − V<sub>min</sub>) ÷ R;</li>
  <li>the maximum power point: I = OCV ÷ (2R), where P<sub>max</sub> = OCV² ÷ (4R).</li>
</ul>
<p>State of charge is updated every second by coulomb counting: ΔSOC = −I·Δt ÷ C<sub>pack</sub>.</p>`
    },

    // ------------------------------------------------------------------ Vehicle
    {
      id: "vehicle-presets", group: "Vehicle", title: "Vehicle presets",
      html: `
<p>If you do not yet have drag and tyre data, choose the body style closest to your vehicle. The preset fills drag coefficient, frontal area and rolling resistance with typical values, which you can then edit.</p>
<ul>
  <li><strong>Cd and frontal area</strong> come from published examples of production cars of that body style (Wikipedia, “Automobile drag coefficient”, which also lists CdA). Frontal area A = CdA ÷ Cd.</li>
  <li><strong>Rolling resistance</strong> is 0.0084, the middle of EU tyre-label class C for passenger-car (C1) tyres; the classic-car preset uses 0.011 (class E).</li>
</ul>
<table class="data"><thead><tr><th>EU tyre class (C1)</th><th>Rolling resistance coefficient</th></tr></thead><tbody>
<tr><td>A</td><td>≤ 6.5 N/kN (0.0065)</td></tr><tr><td>B</td><td>6.6–7.7 N/kN</td></tr><tr><td>C</td><td>7.8–9.0 N/kN</td></tr><tr><td>D</td><td>9.1–10.5 N/kN</td></tr><tr><td>E</td><td>≥ 10.6 N/kN</td></tr>
</tbody></table>
<p class="help">Source: Regulation (EU) 2020/740, tyre labelling. Presets are generic and not measured for any particular vehicle.</p>`
    },
    {
      id: "road-load", group: "Vehicle", title: "Road load and efficiency",
      html: `
<p>The force needed at the wheels each step is:</p>
${eq("F = m·a + m·g·C<sub>rr</sub> + ½·ρ·C<sub>d</sub>·A·v²")}
<p>with ρ = 1.225 kg/m³ (sea level, 15 °C) and g = 9.81 m/s². Rolling resistance applies only while moving. Wheel power is F × v, using the average speed over the step.</p>
${eq("P<sub>battery</sub> = P<sub>wheel</sub> ÷ η<sub>drivetrain</sub> + P<sub>aux</sub>")}
<p>η is one battery-to-wheel efficiency (inverter, motor and gearbox together). Accessory loads: the base load you enter, plus 1.5 kW for air conditioning, 2.5 kW resistive or 0.75 kW heat-pump heating, and 0.5 kW for lights/wipers/radio when switched on.</p>
<p><strong>Mass:</strong> test mass = vehicle mass + calculated pack mass + payload, unless you say the vehicle mass already includes the pack.</p>
<p>Not modelled: gradients, wind, rotating inertia, temperature effects, efficiency that varies with speed or load.</p>`
    },
    {
      id: "motor-limits", group: "Vehicle", title: "Motor and drivetrain limits",
      html: `
<p>Switch these on to get acceleration, top speed and power-limited driving. Leave any field at 0 for no limit.</p>
${eq("Max tractive force F<sub>max</sub> = T<sub>motor</sub> × gear ratio ÷ r<sub>tyre</sub>")}
${eq("Speed at motor max rpm v = rpm × 2π × r<sub>tyre</sub> ÷ (60 × gear ratio)")}
<ul>
  <li><strong>Motor peak / continuous power</strong> are datasheet output powers, applied as the limit on wheel power. Gearbox losses are inside the single drivetrain efficiency, so this is slightly optimistic.</li>
  <li><strong>Inverter / controller max DC current</strong> is the most current the inverter draws from the battery (from the inverter datasheet). It limits pack current. It is not the motor phase current.</li>
  <li><strong>Motor efficiency</strong> (optional) is used only in the requirement check, to turn motor power into power drawn from the battery. The simulation uses the overall drivetrain efficiency.</li>
  <li><strong>Max regen power</strong> limits power returned under braking.</li>
  <li>The vehicle's maximum speed is the lower of the entered top speed and the speed at motor max rpm.</li>
</ul>
<h4>Tyre size helper</h4>
${eq("Unloaded radius = rim [in] × 25.4 ÷ 2 + width × aspect %")}
${eq("Rolling radius ≈ 0.98 × unloaded radius")}
<p>For example 205/55 R16: 203.2 + 112.75 = 315.95 mm unloaded, about 310 mm rolling. The 2 % allowance for tyre deflection is a typical figure; use a measured value if you have one.</p>`
    },
    {
      id: "peak-ratings", group: "Vehicle", title: "Peak ratings and their durations",
      html: `
<p>The pack (through its cells, module and pack ratings) and the motor may each have a peak rating that can only be held for a set time. Each has a “peak budget” in seconds:</p>
<ul>
  <li>the budget is used up while running <strong>above</strong> the continuous rating;</li>
  <li>it recovers at the same rate while at or below the continuous rating;</li>
  <li>when it reaches zero, the continuous rating applies until it has recovered.</li>
</ul>
<p>In the acceleration and top-speed tests every run starts with the full peak durations available, and the results show when each peak rating ran out.</p>`
    },
    {
      id: "regen", group: "Vehicle", title: "Regenerative braking",
      html: `
<p>When the wheels need negative power (braking), part of it is returned to the pack:</p>
${eq("P<sub>regen</sub> = min(P<sub>braking</sub> × η<sub>regen</sub>, P<sub>motor regen</sub>, P<sub>charge,max</sub> + P<sub>aux</sub>)")}
<p>The regen current limit is 80 % of the cell charge rating × P (or of the module datasheet charge rating); with a cell peak charge current entered, 80 % of the peak while its time lasts, then of the continuous rating. A module or pack charge rating can set it instead (see <em>Module and pack ratings</em>). It is also limited so the terminal voltage does not exceed the pack maximum voltage. Regen is off above the cell SOC you set (default 95 %), as on a full battery. Braking energy that cannot be recovered goes to the friction brakes.</p>`
    },
    {
      id: "charging", group: "Vehicle", title: "Charging times",
      html: `
${eq("Pack charge limit P = I<sub>charge</sub> × V<sub>nom</sub>")}
${eq("AC 0–100 %: t = E<sub>usable</sub> ÷ min(P<sub>AC</sub>, P<sub>pack</sub>)")}
${eq("DC 10–80 %: t = 0.7 × E<sub>usable</sub> ÷ min(P<sub>DC</sub>, P<sub>pack</sub>)")}
<p>These are best-case figures: constant power, no taper near full, no charger losses and no temperature limits. Real DC charging will take longer.</p>`
    },

    // ------------------------------------------------------------------ Simulation
    {
      id: "drive-cycles", group: "Simulation", title: "Drive cycles",
      html: `
<ul>
  <li><strong>WLTP Class 3b, 3a and 2</strong>: the official 1,800 s speed traces from UN GTR No. 15, with Low, Medium, High and Extra High phases. Data from the European Commission JRC <code>wltp</code> reference implementation, checked against published distances (3b 23.27 km, 3a 23.19 km, 2 22.65 km).</li>
  <li><strong>Constant speed</strong>: a steady speed on a flat road, e.g. a motorway estimate.</li>
  <li><strong>Uploaded speed profile</strong>: your own route as a CSV.</li>
</ul>
<h4>Which WLTP class?</h4>
<table class="data"><thead><tr><th>Class</th><th>Applies to</th></tr></thead><tbody>
<tr><td>3b</td><td>PMR &gt; 34 W/kg and max speed ≥ 120 km/h</td></tr>
<tr><td>3a</td><td>PMR &gt; 34 W/kg and max speed &lt; 120 km/h</td></tr>
<tr><td>2</td><td>22 &lt; PMR ≤ 34 W/kg</td></tr>
<tr><td>1</td><td>PMR ≤ 22 W/kg (not included)</td></tr>
</tbody></table>
<p>PMR (power-to-mass ratio) = rated power ÷ kerb mass. The calculator suggests a class using motor peak power and the vehicle mass including the pack. The official test can also downscale the cycle for low-powered vehicles; this is not applied here, and any time the vehicle cannot keep up is reported instead.</p>
<h4>Uploaded profile format</h4>
<p>Either “time (s), speed” on each line at any time step, or one speed per line at 1-second intervals. Choose km/h or mph. The profile is resampled to 1 s, limited to 6 hours, and repeated until the battery is empty; if it does not end at its starting speed it is joined back at 2 m/s².</p>
<pre>time,speed
0,0
10,30
60,48
…</pre>`
    },
    {
      id: "range-sim", group: "Simulation", title: "How range is simulated",
      html: `
<ol>
  <li>Start at the top of the usable window (100 % displayed charge).</li>
  <li>Every second, work out the wheel power needed to follow the speed trace (see <em>Road load</em>).</li>
  <li>If that exceeds what the pack, BMS, controller or motor can give, or the motor torque, the vehicle reaches the highest speed it can (found by bisection) and the shortfall is recorded.</li>
  <li>Convert to battery power, solve for current, update the voltage and charge.</li>
  <li>Repeat the cycle until the usable window is empty (0 % displayed). The run is capped at 48 hours.</li>
</ol>
${eq("Range = total distance driven")}
${eq("Consumption [Wh/mile] = (energy out − regen energy in) ÷ distance")}
<p>Consumption is measured at the battery terminals and includes accessory loads. Pack internal losses (I²R) are reported separately. The results also show the time spent power-limited and the time the speed trace was missed by more than 2 km/h.</p>
<p><strong>Range at constant speed</strong> repeats the simulation for each speed in your list.</p>`
    },
    {
      id: "performance", group: "Simulation", title: "Performance at the limits",
      html: `
<p>Each test is a full-throttle run on a flat road at 0.01 s steps (0.02 s for top speed), done at full charge and at 15 % displayed charge:</p>
${eq("F<sub>drive</sub> = min(F<sub>max,torque</sub>, P<sub>wheel,max</sub> ÷ v) &nbsp;&nbsp; a = (F<sub>drive</sub> − F<sub>road</sub>) ÷ m")}
<ul>
  <li><strong>0–60 mph</strong> from rest; <strong>50–70 mph</strong> as a rolling start.</li>
  <li><strong>Top speed</strong>: 3 minutes at full throttle from rest. The highest speed reached is shown with what limited it; if a peak rating runs out the speed it settles to is also shown.</li>
  <li><strong>Max sustained speed</strong> uses continuous ratings only (pack continuous current, motor continuous power): the speed where road-load power equals the continuous wheel power.</li>
</ul>
<p>Available wheel power is the lowest of the pack's deliverable power (after accessories and drivetrain efficiency) and the motor power, and the torque limit applies at low speed. Traction (tyre grip), gear changes and launch control are not modelled, so 0–60 times are best-case.</p>`
    },
    {
      id: "graph", group: "Simulation", title: "Simulation graph",
      html: `
<p>The graph shows the whole run from 100 % to 0 % charge. The top panel shows discharge and regen current (the peak in each pixel-wide interval, so short spikes are not lost) with vehicle speed. The bottom panel shows the charge as the driver sees it and, if internal resistance or an OCV table is entered, the pack voltage under load. Red bars mark moments when the vehicle was power-limited.</p>
<p>Play replays the run at high speed. The view menu shows the first cycle (full battery) or the final cycle (near empty).</p>`
    },

    // ------------------------------------------------------------------ Optional
    {
      id: "requirements", group: "Optional sections", title: "Design requirements",
      html: `
<p>Enter vehicle targets to check the design against them. Each target is checked at <strong>every level the current passes through</strong>, so you can see, for example, that the cells and modules pass a pulse target while the pack (a fuse) or the motor does not.</p>
${eq("Pack current I = P<sub>target</sub> ÷ V<sub>nom,pack</sub> &nbsp;(targets in kW)")}
${eq("Current: per module = I<sub>pack</sub> ÷ parallel strings &nbsp;&nbsp; per cell = I<sub>pack</sub> ÷ (cells in parallel × strings)")}
${eq("Power and energy: per module = pack ÷ number of modules &nbsp;&nbsp; per cell = pack ÷ number of cells")}
${eq("Margin = (available − required) ÷ required × 100 %")}
<ul><li><strong>PASS</strong>: margin of 10 % or more.</li><li><strong>WARN</strong>: margin between 0 and 10 %.</li><li><strong>FAIL</strong>: available is less than required.</li></ul>
<table class="data"><thead><tr><th>Level</th><th>Compared with</th></tr></thead><tbody>
<tr><td>Cell (each)</td><td>Cell datasheet ratings (regen: 80 % of the charge rating); low-charge power and usable energy of one cell</td></tr>
<tr><td>Module (each)</td><td>Module ratings from the chain (cells, module ratings or module datasheet); low-charge power and usable energy of one module</td></tr>
<tr><td>Pack</td><td>Pack ratings from the chain; low-charge power of the pack on its own (the inverter limit is shown under Inverter &amp; motor); usable energy</td></tr>
<tr><td>Inverter &amp; motor</td><td>The weaker of the two is shown, with the other underneath. Inverter: its max DC (battery) current, pulse only. Motor: peak / continuous / regen power; with a motor efficiency entered, motor power ÷ efficiency (regen: × efficiency), i.e. battery-side power; otherwise the datasheet power directly.</td></tr>
</tbody></table>
<p><strong>Pulse power at the chosen charge</strong> (shown when internal resistance or an OCV table is entered) is checked at the “Check pulse at charge” level, as shown to the driver (default 15 %). Pack limits and performance at the limits keep showing the natural limits at 15 %. It uses each level's own current limit, open-circuit voltage at that charge and internal resistance: P = (OCV − I·R) × I, with I limited by the rating, the minimum voltage and the maximum power point. Pulse duration passes when the rated peak time at that level is at least the required time. Requirements never limit the simulation.</p>`
    },
    {
      id: "lifetime", group: "Optional sections", title: "Lifetime & duty cycle",
      html: `
${eq("Lifetime throughput [kWh] = lifetime distance × consumption")}
${eq("Equivalent full cycles = throughput ÷ usable energy")}
${eq("End-of-life usable energy = usable × EOL capacity %")}
<p>Consumption comes from the vehicle simulation, or can be entered manually. These figures help plan cell ageing tests; they are not a life prediction (no ageing model is included).</p>`
    },

    // ------------------------------------------------------------------ Output
    {
      id: "reports", group: "Reports and projects", title: "PDF report",
      html: `
<p>Two templates are available:</p>
<ul><li><strong>Customer spec sheet</strong>: headline figures, cell, pack, vehicle, range, graph, performance, charging and method.</li><li><strong>Full engineering report</strong>: every section, including module, limits and their sources, density, requirement checks, lifetime and an appendix of all inputs.</li></ul>
<p>Tick or untick sections, choose light or dark, then press Print / save as PDF and choose “Save as PDF” as the printer. The project name, customer, revision, date, notes and “Prepared by” appear on the report, and it can be marked confidential.</p>
<p><strong>Before sending a report outside the company</strong>, check it contains nothing confidential that the recipient should not see, and remember that all figures are estimates from the inputs shown.</p>`
    },
    {
      id: "projects", group: "Reports and projects", title: "Projects, libraries and comparing designs",
      html: `
<ul>
  <li><strong>Auto-remember</strong>: inputs are kept in this browser between visits.</li>
  <li><strong>Save / Open project</strong>: a .json file with every input. Open checks the file type and only reads known inputs.</li>
  <li><strong>My library</strong>: save a cell, module datasheet or vehicle and reuse it in other projects. It is stored in this browser only (one browser on one computer, and lost if browsing data is cleared). Use Export / Import library to back it up or move it.</li>
  <li><strong>Company library</strong>: shared items everyone sees, from the file <code>company-library.json</code> next to the calculator. It cannot be changed from the calculator. To update it: save the items to your own library, press <em>Make company library file</em> (it combines the current company library with your library; your version replaces a company item of the same name), then upload the downloaded file to the calculator's GitHub folder in place of the old one. Everyone sees the change when they next refresh, after a few minutes of GitHub Pages caching.</li>
  <li><strong>Compare designs</strong>: save snapshots of designs (or open project files) and compare one against the current design, with the difference for each key figure.</li>
</ul>
<p>Nothing is uploaded: all calculation and storage happens in your browser.</p>`
    },
    {
      id: "sources", group: "Reports and projects", title: "Sources and limitations",
      html: `
<h4>Sources</h4>
<ul>
  <li>UN GTR No. 15, Worldwide harmonized Light vehicles Test Procedure (WLTP): cycle classes and speed traces.</li>
  <li>European Commission JRC, <code>wltp</code> reference implementation: WLTC Class 2, 3a and 3b data.</li>
  <li>DieselNet, “Worldwide Harmonized Light Vehicles Test Cycle (WLTC)”: class rules and phase data.</li>
  <li>Regulation (EU) 2020/740: tyre rolling-resistance classes.</li>
  <li>Wikipedia, “Automobile drag coefficient”: example Cd and CdA values for presets.</li>
</ul>
<h4>Main limitations</h4>
<ul>
  <li>No thermal model: resistance, capacity and power limits do not change with temperature.</li>
  <li>No ageing model; first-order resistance only (no RC transient behaviour).</li>
  <li>Constant drivetrain efficiency; no gradients, wind, tyre grip or gear changes.</li>
  <li>Charging at constant power with no taper.</li>
  <li>Results depend entirely on the inputs. Datasheet values are often given at specific test conditions.</li>
</ul>`
    }
  ];

  // "i" buttons: block (stepId-blockIndex) and field ids → topic id.
  const blockTopics = {
    "project-0": "overview",
    "cell-0": "cell-inputs", "cell-1": "cell-format", "cell-2": "cell-performance",
    "module-0": "module-build", "module-1": "module-datasheet", "module-2": "module-pack-ratings", "module-3": "mass-overhead", "module-4": "density", "module-5": "module-datasheet",
    "pack-0": "pack-build", "pack-1": "module-pack-ratings", "pack-2": "mass-overhead", "pack-3": "density",
    "vehicle-0": "road-load", "vehicle-1": "motor-limits", "vehicle-2": "charging", "vehicle-3": "regen",
    "simulation-0": "drive-cycles", "simulation-1": "range-sim",
    "requirements-0": "requirements", "lifetime-0": "lifetime"
  };
  const fieldTopics = {
    usableFactor: "pack-build", vehPreset: "vehicle-presets", crr: "vehicle-presets", cd: "vehicle-presets",
    cellPulseDurationS: "peak-ratings", bmsPeakS: "peak-ratings", motorPeakS: "peak-ratings",
    tyreSize: "motor-limits", cellDcirMOhm: "pack-electrical", mdDcirMOhm: "pack-electrical"
  };

  const api = { topics, blockTopics, fieldTopics, byId: Object.fromEntries(topics.map((t) => [t.id, t])) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VoltReadme = api;
})(typeof window !== "undefined" ? window : globalThis);
