// Game loop: race state, the player's car, rival drivers, contact, camera.
import * as THREE from 'three';
import { createRenderer, createWorld } from './renderer.js';
import { W, VERGE, N, L, DS, PX, PZ, TX, TZ, K, frame, idxOf, wrapDiff, buildTrack } from './track.js';
import { makeCar, WHEEL_R } from './carModel.js';
import { CAR, newVehicleState, stepVehicle, steerLimit, speedProfile, accelAt } from './physics.js';
import { prefs, initInput, applyPrefs, readControls, resetSteer, setSteer } from './input.js';
import { initAudio, blip, engineSound, gearFor, sound } from './audio.js';
import * as hud from './hud.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (a - b) % 6.283185307; if (d > Math.PI) d -= 6.283185307; else if (d < -Math.PI) d += 6.283185307; return d; };
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SIM_DT = 1 / 400;              // physics runs at 400 steps a second, whatever the frame rate
const CAR_L = 5.3, CAR_W = 1.95;
const MU_HELP = 1.52, MU_RIVAL = 1.45; // grip the brake help and the rivals plan their corner speeds around
const DIFF = [0.94, 0.985, 1.02];
const DEFS = [['You', 0xf2b705, 0x14161a], ['Rana', 0xd3261c, 0xf2f2f0], ['Zoya', 0x12b5d8, 0x14161a], ['Vikram', 0x7d4fd6, 0xf2f2f0],
  ['Kaala', 0x1b2233, 0xe6462f], ['Mirchi', 0x1f9d55, 0xf2f2f0], ['Sher', 0xf2f2f0, 0xd3261c], ['Tara', 0xe85a9b, 0x14161a]];
const BASE_PACE = [1, 1.0, 0.99, 0.98, 0.97, 0.96, 0.95, 0.94];

const app = $('app'), canvas = $('c'), note = $('menu-note');
let renderer, scene, camera, sun, followShadow, backend = '';
let state = 'loading', cars = [], player = null, VPB, VPP, autoPilot = false;
let cdT = 0, goAt = 0, lit = 0, raceT = 0, finishCount = 0, endT = null, boardT = 0, wrongT = 0, shake = 0, camYaw = 0, fov = 66, hintT = 0;
let fpsAcc = 0, fpsN = 0, lowGfx = false;
const H = { x: 0, z: 0, tx: 0, tz: 1 };

/* ---------- sparks and grass ---------- */
const PN = 140, pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
let pMesh, pNext = 0; const pObj = new THREE.Object3D(), pCol = new THREE.Color();
function spawnP(x, y, z, vx, vy, vz, life, color) {
  const i = pNext; pNext = (pNext + 1) % PN; const j = i * 3;
  pPos[j] = x; pPos[j + 1] = y; pPos[j + 2] = z; pVel[j] = vx; pVel[j + 1] = vy; pVel[j + 2] = vz; pLife[i] = pMax[i] = life;
  pMesh.setColorAt(i, pCol.set(color)); pMesh.instanceColor.needsUpdate = true;
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    const j = i * 3;
    if (pLife[i] > 0) {
      pLife[i] -= dt; pVel[j + 1] -= 14 * dt; pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      if (pPos[j + 1] < 0.04) { pPos[j + 1] = 0.04; pVel[j + 1] *= -0.3; }
      pObj.position.set(pPos[j], pPos[j + 1], pPos[j + 2]); pObj.scale.setScalar(Math.max(0.01, pLife[i] / pMax[i]));
    } else { pObj.position.set(0, -50, 0); pObj.scale.setScalar(0.01); }
    pObj.updateMatrix(); pMesh.setMatrixAt(i, pObj.matrix);
  }
  pMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- race set-up ---------- */
function placeOnRails(c) { frame(c.s, H); c.x = H.x - H.tz * c.d; c.z = H.z + H.tx * c.d; c.yaw = Math.atan2(H.tx, H.tz); c.idx = idxOf(c.s); }
function resetGrid(attract) {
  finishCount = 0; endT = null; raceT = 0;
  cars.forEach((c, i) => {
    const slot = attract ? i : (i === 0 ? cars.length - 1 : i - 1);
    c.s = -9 - slot * 9; c.d = slot % 2 ? 2.6 : -2.6; c.v = attract ? 45 : 0; c.vd = 0; c.pass = 0;
    c.pace = (i === 0 ? 0.95 : BASE_PACE[i]) * (attract ? 0.94 : DIFF[prefs.diff]);
    c.lapNo = -1; c.lapStart = 0; c.best = 0; c.last = 0; c.finished = false; c.finishT = 0; c.finishPos = 0; c.grass = false;
    placeOnRails(c);
  });
  const v = player.veh; Object.assign(v, newVehicleState()); v.x = player.x; v.z = player.z; v.yaw = player.yaw;
  camYaw = player.yaw;
}
function startRace() {
  if (state === 'loading') return;
  if (initInput.ensureTilt) initInput.ensureTilt();
  initAudio(); resetGrid(false); resetSteer();
  state = 'countdown'; cdT = 0; lit = 0; goAt = 0.6 + 5 * 0.7 + rand(0.5, 1.3);
  $('menu').hidden = true; $('results').hidden = true; $('hud').hidden = false; $('h-hint').hidden = false; hud.setLights(0);
  $('h-of').textContent = ' /' + cars.length; fpsAcc = 0; fpsN = 0; hintT = 0;
}
const ranked = () => cars.slice().sort((a, b) => (b.finished ? 1e9 - b.finishPos * 1e6 : b.s) - (a.finished ? 1e9 - a.finishPos * 1e6 : a.s));
function endRace() {
  const order = ranked();
  order.forEach(c => { if (!c.finished) { c.finished = true; c.finishPos = ++finishCount; c.finishT = raceT + Math.max(0, prefs.laps * L - c.s) / 65; } });
  order.sort((a, b) => a.finishPos - b.finishPos);
  state = 'finished'; hud.showResults(order, player);
  blip(player.finishPos === 1 ? 660 : 300, 0.5, 'triangle', 0.3, player.finishPos === 1 ? 1320 : 150);
}
function backToTrack() {
  if (state !== 'race' || player.finished) return;
  frame(player.idx * DS, H); const v = player.veh;
  v.x = H.x; v.z = H.z; v.yaw = Math.atan2(H.tx, H.tz); v.vx = v.vy = v.r = v.ax = v.ay = 0; player.d = 0; camYaw = v.yaw; wrongT = 0;
}
function applyGfx() {
  lowGfx = prefs.gfx === 'low';
  sun.castShadow = !lowGfx;
  renderer.setPixelRatio(lowGfx ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  cars.forEach(c => c.model.blob.visible = lowGfx);
  resize();
}
function resize() { const w = app.clientWidth || 1, h = app.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

/* ---------- lap timing ---------- */
function updateLap(c) {
  const ln = Math.floor(c.s / L);
  if (ln <= c.lapNo) return;
  if (c.lapNo >= 0) {
    c.last = raceT - c.lapStart; const pb = !c.best || c.last < c.best; if (pb) c.best = c.last;
    if (c === player && state === 'race') { hud.toast((pb ? 'BEST LAP ' : 'LAP ') + hud.fmt(c.last, 3), pb ? 'good' : 'info'); blip(pb ? 990 : 660, 0.15, 'triangle', 0.15); }
  }
  c.lapStart = raceT; c.lapNo = ln;
  if (state === 'race' && ln >= prefs.laps && !c.finished) { c.finished = true; c.finishPos = ++finishCount; c.finishT = raceT; if (c === player) endT = 1.6; }
}

/* ---------- rival drivers: follow the lap's speed profile on a racing line ---------- */
function updateRival(c, dt) {
  const i = idxOf(c.s);
  let vt = VPB[i] * c.pace; if (c.finished) vt = Math.min(vt, 50);
  let line = clamp(K[(i + 6) % N] * 230, -(W - 1.7), W - 1.7);
  if (c.pass > 0) { c.pass -= dt; line = c.passD; }
  for (const o of cars) {
    if (o === c) continue; const ds = wrapDiff(o.s, c.s);
    if (ds > 0 && ds < 20 && Math.abs(o.d - c.d) < 2.4) {
      if (ds < 10) vt = Math.min(vt, o.v * 0.99);
      if (c.pass <= 0 && o.v < vt + 2) { c.pass = 1.4; c.passD = clamp(o.d + (o.d > 0 ? -2.9 : 2.9), -(W - 1.4), W - 1.4); line = c.passD; }
    }
  }
  if (c.v < vt) c.v = Math.min(vt, c.v + Math.max(0, accelAt(c.v)) * dt); else c.v = Math.max(vt, c.v - 48 * dt);
  c.vd = clamp((line - c.d) * 2, -5, 5); c.d += c.vd * dt; c.s += c.v * dt;
  frame(c.s, H); c.x = H.x - H.tz * c.d; c.z = H.z + H.tx * c.d;
  const f = Math.max(c.v, 10); c.yaw = Math.atan2(H.tx * f - H.tz * c.vd, H.tz * f + H.tx * c.vd); c.idx = i; c.steerVis = -K[i] * CAR.wb;
}

/* ---------- the player's car ---------- */
function project(p) {
  let best = p.idx, bd = 1e12;
  for (let k = -12; k <= 16; k++) { const j = ((p.idx + k) % N + N) % N, dx = p.x - PX[j], dz = p.z - PZ[j], q = dx * dx + dz * dz; if (q < bd) { bd = q; best = j; } }
  const dx = p.x - PX[best], dz = p.z - PZ[best];
  p.d = dx * -TZ[best] + dz * TX[best]; p.s += wrapDiff(best * DS + dx * TX[best] + dz * TZ[best], p.s); p.idx = best;
}
function updatePlayer(p, dt) {
  const veh = p.veh, u = readControls(dt), grip = p.grass ? 0.5 : 1;
  if (autoPilot) {      // test driver: aim at a point ahead on the centre line
    frame(p.s + 9 + p.v * 0.28, H); const err = angDiff(Math.atan2(H.x - p.x, H.z - p.z), p.yaw), look = Math.hypot(H.x - p.x, H.z - p.z) || 1;
    u.steer = clamp(-Math.atan(2 * CAR.wb * Math.sin(err) / look) / steerLimit(p.v, grip), -1, 1); setSteer(u.steer);
  }
  let throttle = u.gas ? 1 : 0, brake = u.brake ? 1 : 0;
  if (prefs.aids === 2 && !p.grass) {
    const want = VPP[p.idx];
    if (p.v > want * 1.012) { brake = Math.max(brake, clamp((p.v - want) / 4, 0.25, 1)); throttle = 0; } else if (p.v > want * 0.995) throttle = 0;
  }
  if (brake) throttle = 0;
  let dragMul = 1;
  for (const o of cars) if (o !== p) { const ds = wrapDiff(o.s, p.s); if (ds > 3 && ds < 45 && Math.abs(o.d - p.d) < 1.6) { dragMul = 0.74; break; } }
  const ctl = { steer: u.steer * steerLimit(p.v, grip), throttle, brake, grip, aids: prefs.aids > 0, dragMul };
  const n = Math.max(1, Math.ceil(dt / SIM_DT)), h = dt / n;
  for (let k = 0; k < n; k++) stepVehicle(veh, ctl, h);
  p.x = veh.x; p.z = veh.z; p.yaw = veh.yaw; p.v = Math.hypot(veh.vx, veh.vy); p.steerVis = -ctl.steer; p.throttle = throttle;
  project(p);

  const i = p.idx, tx = TX[i], tz = TZ[i], rx = -tz, rz = tx, sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
  p.grass = Math.abs(p.d) > W + 0.9;
  if (p.grass && p.v > 12 && Math.random() < 0.6) spawnP(p.x - sn * 2, 0.2, p.z - cs * 2, rand(-3, 3), rand(1, 4), rand(-3, 3), 0.45, 0x3d6a2c);
  if (!p.grass && Math.abs(veh.slipR) > 0.2 && p.v > 15 && Math.random() < 0.5) spawnP(p.x - sn * 2, 0.15, p.z - cs * 2, rand(-1, 1), rand(0.5, 2), rand(-1, 1), 0.5, 0xbfbfbf);
  const lim = W + VERGE - 1.0;
  if (Math.abs(p.d) > lim) {           // barrier: stop the sideways motion, keep some of the forward motion
    const sg = Math.sign(p.d), over = Math.abs(p.d) - lim; veh.x -= rx * sg * over; veh.z -= rz * sg * over; p.d = sg * lim;
    let wx = veh.vx * sn - veh.vy * cs, wz = veh.vx * cs + veh.vy * sn; const vn = (wx * rx + wz * rz) * sg;
    if (vn > 0) {
      wx -= rx * sg * vn * 1.2; wz -= rz * sg * vn * 1.2; wx *= 0.88; wz *= 0.88;
      veh.vx = Math.max(0, wx * sn + wz * cs); veh.vy = (-wx * cs + wz * sn) * 0.5; veh.r *= 0.3;
      const fwd = sn * tx + cs * tz >= 0 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz); veh.yaw += angDiff(fwd, veh.yaw) * 0.4;
      if (vn > 2) { for (let k = 0; k < 6; k++) spawnP(p.x, 0.5, p.z, rand(-5, 5), rand(2, 7), rand(-5, 5), 0.35, 0xffc040); shake = Math.max(shake, Math.min(0.8, vn * 0.05)); blip(120, 0.12, 'square', 0.14, 60); }
    }
    p.x = veh.x; p.z = veh.z;
  }
  wrongT = sn * tx + cs * tz < -0.3 ? wrongT + dt : 0;
  if (wrongT > 1.2) hud.toast('WRONG WAY. TAP BACK TO TRACK', 'bad');
}

/* ---------- contact between cars ---------- */
function collide() {
  const before = player.v;
  for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
    const A = cars[a], B = cars[b], ds = wrapDiff(A.s, B.s), dd = A.d - B.d, oS = CAR_L - Math.abs(ds), oD = CAR_W - Math.abs(dd);
    if (oS <= 0 || oD <= 0) continue;
    const human = state === 'race' && !player.finished && (A === player || B === player);
    if (oD < oS) {
      const sg = dd >= 0 ? 1 : -1;
      if (human) { const o = A === player ? B : A, psg = A === player ? sg : -sg, i = player.idx; o.d -= psg * oD * 0.5; player.veh.x += -TZ[i] * psg * oD * 0.5; player.veh.z += TX[i] * psg * oD * 0.5; }
      else { A.d += sg * oD / 2; B.d -= sg * oD / 2; }
    } else {
      const front = ds > 0 ? A : B, rear = ds > 0 ? B : A;
      if (rear.v > front.v) {
        const rel = rear.v - front.v; rear.v = front.v * 0.97; front.v = Math.min(CAR.vMax, front.v + rel * 0.25);
        if ((rear === player || front === player) && rel > 3) { shake = Math.max(shake, 0.35); blip(140, 0.1, 'square', 0.13, 70); }
      }
      if (human && rear === player) { const i = player.idx; player.veh.x -= TX[i] * oS; player.veh.z -= TZ[i] * oS; } else rear.s -= oS;
    }
  }
  if (player.v !== before) player.veh.vx = Math.max(0, player.veh.vx + player.v - before);
}

/* ---------- drawing ---------- */
function updateVisuals(dt) {
  for (const c of cars) {
    c.model.group.position.set(c.x, 0, c.z); c.model.group.rotation.y = c.yaw;
    const spin = c.v / WHEEL_R * dt, w = c.model.wheels;
    for (let k = 0; k < 4; k++) w[k].rotation.x += spin;
    w[0].rotation.y = w[1].rotation.y = c.steerVis || 0;
  }
  player.model.steering.rotation.z = -(player.steerVis || 0) * 9;
}
function updateCamera(dt) {
  const portrait = camera.aspect < 1, live = state === 'race' || state === 'countdown';
  const cc = live || state === 'finished' ? player : cars[2], mode = live ? prefs.cam : 1;
  let sx = 0, sy = 0; if (shake > 0 && !reduceMotion) { sx = rand(-1, 1) * shake * 0.4; sy = rand(-1, 1) * shake * 0.3; }
  shake = Math.max(0, shake - dt * 2.5);
  player.model.helmet.visible = player.model.carbon.visible = !(live && mode === 3);   // cockpit view: clear the halo out of the driver's eyes
  let want, near = 0.3;
  if (mode >= 2) {
    const lz = mode === 2 ? -0.5 : 0.14, ly = mode === 2 ? 1.28 : 0.94, sn = Math.sin(cc.yaw), cs = Math.cos(cc.yaw), px = cc.x + sn * lz, pz = cc.z + cs * lz;
    camera.position.set(px + sx * 0.12, ly + sy * 0.12, pz);
    camera.lookAt(px + sn * 30, ly - (mode === 2 ? 2.4 : 1.6), pz + cs * 30);
    want = portrait ? 84 : 72; camYaw = cc.yaw; near = 0.08;
  } else {
    camYaw += angDiff(cc.yaw, camYaw) * Math.min(1, 6.5 * dt);
    const far = mode === 1, dist = far ? (portrait ? 14 : 11.5) : (portrait ? 8.6 : 7), h = far ? (portrait ? 5.6 : 4.4) : (portrait ? 3.1 : 2.4);
    const sn = Math.sin(camYaw), cs = Math.cos(camYaw);
    camera.position.set(cc.x - sn * dist + sx, h + sy, cc.z - cs * dist + sx);
    camera.lookAt(cc.x + sn * 12, 0.8, cc.z + cs * 12);
    want = portrait ? 76 : 62;
  }
  if (!reduceMotion) want += cc.v / CAR.vMax * 9;
  fov += (want - fov) * Math.min(1, 4 * dt);
  if (Math.abs(camera.fov - fov) > 0.05 || camera.near !== near) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
  followShadow(cc.x, cc.z);
}
function updateHud(dt) {
  hud.tickToast(dt);
  if (hintT > 0 && (hintT -= dt) <= 0) $('h-hint').hidden = true;
  hud.setText('pos', 'P' + (player.rank + 1));
  hud.setText('lap', String(clamp(player.lapNo + 1, 1, prefs.laps)));
  const cur = player.lapNo >= 0 && state === 'race' ? raceT - player.lapStart : 0;
  hud.setText('time', cur > 0 ? hud.fmt(cur) : '0:00.0');
  hud.setText('best', hud.fmt(player.best, 3)); hud.setText('last', hud.fmt(player.last, 3));
  hud.setText('kmh', String(Math.round(player.v * 3.6)));
  hud.setText('gear', String(gearFor(player.v)));
  hud.setText('g', (Math.hypot(player.veh.ax, player.veh.ay) / 9.81).toFixed(1));
  if ((boardT -= dt) <= 0) { boardT = 0.4; hud.drawBoard(cars, player); }
  hud.drawMap(cars, player);
}

/* ---------- loop ---------- */
function step(dt) {
  if (state === 'countdown') {
    cdT += dt;
    const n = cdT < 0.6 ? 0 : Math.min(5, Math.floor((cdT - 0.6) / 0.7) + 1);
    if (n !== lit) { lit = n; hud.setLights(n); blip(440, 0.1, 'square', 0.14); }
    if (cdT >= goAt) { state = 'race'; hud.setLights(-1); hintT = 6; blip(880, 0.35, 'square', 0.2); }
  } else if (state !== 'loading') {
    if (state === 'race') raceT += dt;
    for (const c of cars) {
      if (c === player && state === 'race' && !c.finished) updatePlayer(c, dt); else updateRival(c, dt);
      updateLap(c);
    }
    collide();
    if (state === 'race' && endT !== null && (endT -= dt) <= 0) endRace();
  }
  ranked().forEach((c, i) => c.rank = i);
}
let last = performance.now();
function tick() {
  const now = performance.now(), raw = (now - last) / 1000; last = now; const dt = Math.min(0.05, Math.max(0.001, raw));
  step(dt);
  updateVisuals(dt); updateParticles(dt); updateCamera(dt);
  if (state === 'race' || state === 'countdown') updateHud(dt);
  engineSound(player.v, player.throttle, state === 'race' || state === 'countdown');
  if (state === 'race' && !lowGfx && fpsN < 240) {
    fpsAcc += raw;
    if (++fpsN === 240 && fpsAcc / 240 > 1 / 34) { prefs.gfx = 'low'; applyPrefs(); applyGfx(); hud.toast('GRAPHICS LOWERED TO KEEP IT SMOOTH', 'info'); }
  }
  renderer.render(scene, camera);
}

async function boot() {
  try {
    ({ renderer, backend } = await createRenderer(canvas));
  } catch (e) { note.textContent = 'This browser could not start 3D graphics. Try the latest Chrome on your phone.'; return; }
  ({ scene, camera, sun, followShadow } = createWorld());
  let aniso = 4; try { aniso = renderer.getMaxAnisotropy(); } catch (_) {}
  buildTrack(scene, aniso);
  VPB = speedProfile(K, DS, MU_RIVAL); VPP = speedProfile(K, DS, MU_HELP);
  cars = DEFS.map(([name, color, accent], id) => {
    const model = makeCar(color, accent); scene.add(model.group);
    return { id, name, model, x: 0, z: 0, yaw: 0, v: 0, s: 0, d: 0, vd: 0, idx: 0, pass: 0, passD: 0, pace: 1, steerVis: 0, throttle: 1,
      lapNo: -1, lapStart: 0, best: 0, last: 0, finished: false, finishT: 0, finishPos: 0, rank: 0, grass: false, veh: id === 0 ? newVehicleState() : null };
  });
  player = cars[0];
  pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial(), PN);
  pMesh.frustumCulled = false; for (let i = 0; i < PN; i++) pMesh.setColorAt(i, pCol.set(0xffffff)); scene.add(pMesh);

  initInput(app, {
    isRacing: () => state === 'race' || state === 'countdown',
    onChange: () => applyGfx(),
    onCam: () => { prefs.cam = (prefs.cam + 1) % 4; applyPrefs(); },
    onReset: backToTrack, onStart: startRace, toast: hud.toast
  });
  $('b-mute').addEventListener('click', () => { sound.muted = !sound.muted; $('b-mute').textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON'; });
  $('b-start').addEventListener('click', startRace); $('b-again').addEventListener('click', startRace);
  $('b-menu').addEventListener('click', () => { $('results').hidden = true; $('menu').hidden = false; state = 'attract'; resetGrid(true); });
  addEventListener('resize', resize);
  $('o-backend').textContent = 'Renderer: ' + backend;
  state = 'attract'; resetGrid(true); applyGfx();
  $('b-start').disabled = false; $('b-start').textContent = 'START RACE';
  // test hooks: fast-forward the simulation and a simple steering autopilot
  window.__nc = { cars, trackLength: L, step, backend, get state() { return state; }, get raceT() { return raceT; }, set auto(v) { autoPilot = !!v; } };
  renderer.setAnimationLoop(tick);
}
boot().catch(e => { note.textContent = 'The game failed to start: ' + (e && e.message ? e.message : e); console.error(e); });
