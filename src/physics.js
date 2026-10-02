// Vehicle dynamics for one open-wheel car. Pure maths, no rendering.
//
// Model: planar single-track ("bicycle") chassis with
//   - Pacejka-style tyre curve per axle (force rises, peaks, then falls off as slip grows)
//   - friction circle: braking/drive force and cornering force share one grip budget
//   - four wheel loads: static weight + aero downforce + longitudinal and lateral load transfer
//   - tyre load sensitivity (a tyre carrying more load has a lower friction coefficient)
//   - aero drag and downforce that grow with speed squared
//   - power-limited engine, traction-limited at low speed
// Frame: x forward, y to the driver's right. Yaw rate r > 0 means turning right.
// Units: SI throughout (m, s, kg, N, rad).

export const CAR = {
  m: 800,            // kg, car + driver
  Iz: 1050,          // kg m^2, yaw inertia
  a: 1.95,           // m, centre of mass to front axle
  b: 1.65,           // m, centre of mass to rear axle
  wb: 3.6,           // m, wheelbase
  track: 1.65,       // m, track width
  h: 0.28,           // m, centre of mass height
  mu0: 1.85,         // tyre friction coefficient at reference load
  N0: 4000,          // N, reference wheel load
  loadSens: 0.12,    // friction lost per N0 of extra wheel load
  Bf: 12, Br: 15, C: 1.4,   // tyre curve shape: front and rear stiffness, shape factor
  peakF: 0.93, peakR: 0.98,  // the front gives up slightly first, so the car pushes wide before it spins
  cDF: 2.75,         // N per (m/s)^2 downforce
  aeroFront: 0.43,   // share of downforce on the front axle
  cDrag: 0.9,        // N per (m/s)^2 drag
  P: 735000,         // W, about 1000 hp
  FxMax: 11500,      // N, drive force ceiling at low speed
  rollFront: 0.55,   // share of lateral load transfer taken by the front axle
  vMax: 93           // m/s, where drag meets power
};
const G = 9.81;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

// Total grip force an axle can make, given its load and how much is shifted to the outer wheel.
function axleGrip(N, shift, mu0) {
  const outer = Math.max(60, N / 2 + Math.abs(shift)), inner = Math.max(60, N / 2 - Math.abs(shift));
  const mu = n => Math.max(0.6 * mu0, mu0 * (1 - CAR.loadSens * (n / CAR.N0 - 1)));
  return mu(outer) * outer + mu(inner) * inner;
}

export function newVehicleState() {
  return { x: 0, z: 0, yaw: 0, vx: 0, vy: 0, r: 0, ax: 0, ay: 0, slipF: 0, slipR: 0, Nf: 0, Nr: 0 };
}

// Largest useful steering angle at this speed: the angle the geometry needs at the grip limit, plus a margin.
export function steerLimit(speed, grip) {
  const v2 = Math.max(speed * speed, 30);
  const aLat = CAR.mu0 * grip * 0.92 * (G + CAR.cDF * v2 / CAR.m);
  return Math.min(0.34, CAR.wb * aLat / v2 + 0.06);
}

// Advance the car by dt seconds. Call with a small fixed dt (see SIM_DT in main.js).
// u: { steer (rad, + = right), throttle 0..1, brake 0..1, grip (1 tarmac, <1 grass), aids (true = traction control + ABS), dragMul }
export function stepVehicle(c, u, dt) {
  const P = CAR, vx = Math.max(c.vx, 0.5), v2 = c.vx * c.vx + c.vy * c.vy;
  const W = P.m * G, DF = P.cDF * v2 * (u.grip < 1 ? 0.6 : 1);

  // wheel loads
  const shiftX = clamp(P.m * c.ax * P.h / P.wb, -0.45 * W, 0.45 * W);
  const Nf = Math.max(300, W * P.b / P.wb + DF * P.aeroFront - shiftX);
  const Nr = Math.max(300, W * P.a / P.wb + DF * (1 - P.aeroFront) + shiftX);
  const shiftY = P.m * c.ay * P.h / P.track;
  const gripF = axleGrip(Nf, shiftY * P.rollFront, P.mu0 * u.grip);
  const gripR = axleGrip(Nr, shiftY * (1 - P.rollFront), P.mu0 * u.grip);

  // slip angles and cornering force
  const slipF = u.steer - Math.atan2(c.vy + P.a * c.r, vx);
  const slipR = -Math.atan2(c.vy - P.b * c.r, vx);
  let Fyf = P.peakF * gripF * Math.sin(P.C * Math.atan(P.Bf * slipF));
  let Fyr = P.peakR * gripR * Math.sin(P.C * Math.atan(P.Br * slipR));

  // drive and brake force
  let drive = u.throttle * Math.min(P.P / Math.max(c.vx, 10), P.FxMax);
  let brake = c.vx > 0.3 ? u.brake * (gripF + gripR) : 0;
  if (u.aids) {
    // stability control: ease off the pedals as the rear starts to step out
    const ease = clamp(1 - (Math.abs(slipR) - 0.07) / 0.07, 0.15, 1);
    drive *= ease; brake *= ease;
  }
  // brake force is shared front to rear in proportion to grip, so both axles work equally hard
  let Fxf = -brake * gripF / (gripF + gripR), Fxr = drive - brake * gripR / (gripF + gripR);
  if (u.aids) {
    // traction control and ABS: never ask a tyre for more than what cornering leaves over
    const leftF = Math.sqrt(Math.max(0, gripF * gripF - Fyf * Fyf)), leftR = Math.sqrt(Math.max(0, gripR * gripR - Fyr * Fyr));
    Fxf = clamp(Fxf, -leftF, 0); Fxr = clamp(Fxr, -leftR, leftR);
  } else {
    // no aids: too much pedal uses up the grip circle and the tyre lets go sideways
    Fxf = clamp(Fxf, -gripF, 0); Fxr = clamp(Fxr, -gripR, gripR);
    const leftF = Math.sqrt(Math.max(0, gripF * gripF - Fxf * Fxf)), leftR = Math.sqrt(Math.max(0, gripR * gripR - Fxr * Fxr));
    Fyf = clamp(Fyf, -leftF, leftF); Fyr = clamp(Fyr, -leftR, leftR);
  }

  // resistances
  const rolling = c.vx > 0.2 ? (u.grip < 1 ? 2600 : 130) : 0;
  const drag = P.cDrag * (u.dragMul || 1) * c.vx * Math.abs(c.vx) + rolling;

  // equations of motion in the car's frame
  const cs = Math.cos(u.steer), sn = Math.sin(u.steer);
  const ax = (Fxf * cs - Fyf * sn + Fxr - drag) / P.m;
  const ay = (Fyf * cs + Fxf * sn + Fyr) / P.m;
  c.vx += (ax + c.r * c.vy) * dt;
  c.vy += (ay - c.r * c.vx) * dt;
  c.r += (P.a * (Fyf * cs + Fxf * sn) - P.b * Fyr) / P.Iz * dt;
  if (c.vx < 0) c.vx = 0;

  // below walking pace slip angles are meaningless: blend to pure rolling geometry
  const k = clamp((c.vx - 2) / 5, 0, 1);
  if (k < 1) { const rk = c.vx * Math.tan(u.steer) / P.wb; c.r = c.r * k + rk * (1 - k); c.vy = c.vy * k + rk * P.b * (1 - k); }

  // filtered accelerations feed next step's load transfer and the g readout
  const f = Math.min(1, dt * 18);
  c.ax += (ax - c.ax) * f; c.ay += (ay - c.ay) * f;

  // move in the world
  c.yaw -= c.r * dt;
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  c.x += (c.vx * s - c.vy * co) * dt;
  c.z += (c.vx * co + c.vy * s) * dt;
  c.slipF = slipF; c.slipR = slipR; c.Nf = Nf; c.Nr = Nr;
}

// Speed the car can carry at each point of a lap, for brake help and the rival drivers.
// curvature: array of 1/radius per sample, ds: metres between samples, muUse: how much grip to plan for.
export function speedProfile(curvature, ds, muUse) {
  const n = curvature.length, v = new Float32Array(n), cAero = CAR.cDF / CAR.m;
  for (let i = 0; i < n; i++) {
    const room = Math.abs(curvature[i]) - muUse * cAero;      // downforce can out-run the corner entirely
    v[i] = room > 1e-5 ? Math.min(CAR.vMax, Math.sqrt(muUse * G / room)) : CAR.vMax;
  }
  // work backwards: braking can only use the grip that cornering leaves over at that point
  for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) {
    const vn = v[(i + 1) % n], total = muUse * (G + cAero * vn * vn), side = vn * vn * Math.abs(curvature[i]);
    const decel = 0.9 * Math.sqrt(Math.max(0, total * total - side * side)) + CAR.cDrag * vn * vn / CAR.m;
    v[i] = Math.min(v[i], Math.sqrt(vn * vn + 2 * decel * ds));
  }
  return v;
}

// Straight-line acceleration available at a speed (used by the rival drivers).
export function accelAt(v) {
  return Math.min(CAR.P / Math.max(v, 10), CAR.FxMax) / CAR.m - CAR.cDrag * v * v / CAR.m;
}
