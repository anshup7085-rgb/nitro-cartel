// Player settings and controls: touch buttons, drag, tilt and keyboard.
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export const prefs = { ctrl: 'buttons', autoGas: true, aids: 2, cam: 0, diff: 1, laps: 3, gfx: 'high' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('nitro-cartel-prefs-v2') || '{}')); } catch (_) {}
prefs.cam = clamp(prefs.cam | 0, 0, 3); prefs.diff = clamp(prefs.diff | 0, 0, 2); prefs.aids = clamp(prefs.aids | 0, 0, 2);
if ([3, 5, 8].indexOf(prefs.laps) < 0) prefs.laps = 3;
export const CAMS = ['CHASE', 'FAR', 'T-CAM', 'COCKPIT'];

export const input = { gas: false, brake: false, left: false, right: false };
const keys = {};
let steerVal = 0, steerId = null, anchorX = 0, touchSteer = 0;
let tiltOK = false, tiltSteer = 0, tiltBound = false, tiltCheck = 0;

export function initInput(app, hooks) {   // hooks: { isRacing(), onChange(), onCam(), onReset(), onStart(), toast(msg, cls) }
  app.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || !hooks.isRacing() || prefs.ctrl !== 'drag') return;
    if (steerId === null) { steerId = e.pointerId; anchorX = e.clientX; touchSteer = 0; $('h-hint').hidden = true; }
  });
  app.addEventListener('pointermove', e => {
    if (e.pointerId !== steerId) return; let dx = e.clientX - anchorX;
    if (dx > 64) { anchorX = e.clientX - 64; dx = 64; } else if (dx < -64) { anchorX = e.clientX + 64; dx = -64; }
    touchSteer = dx / 64;
  });
  const end = e => { if (e.pointerId === steerId) { steerId = null; touchSteer = 0; } };
  app.addEventListener('pointerup', end); app.addEventListener('pointercancel', end);
  const hold = (id, key) => {
    const el = $(id), off = () => { input[key] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', e => { e.preventDefault(); input[key] = true; el.classList.add('down'); $('h-hint').hidden = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} });
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  };
  hold('b-left', 'left'); hold('b-right', 'right'); hold('b-brake', 'brake'); hold('b-gas', 'gas');

  const onTilt = e => {
    if (e.gamma == null || e.beta == null) return; tiltOK = true;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let a = ang === 90 ? e.beta : (ang === 270 || ang === -90) ? -e.beta : e.gamma; if (Math.abs(a) < 1.5) a = 0;
    tiltSteer = clamp(a / 20, -1, 1);
  };
  const tiltFail = () => {
    if (prefs.ctrl !== 'tilt') return; prefs.ctrl = 'buttons'; applyPrefs(); hooks.onChange();
    const m = $('o-msg'); m.hidden = false; m.textContent = 'Tilt could not read this phone\'s motion sensor, so steering is back on buttons.';
    hooks.toast('TILT NOT AVAILABLE, USING BUTTONS', 'bad');
  };
  const enableTilt = () => {
    const bind = () => { if (!tiltBound) { tiltBound = true; addEventListener('deviceorientation', onTilt); } clearTimeout(tiltCheck); tiltCheck = setTimeout(() => { if (!tiltOK) tiltFail(); }, 1800); };
    try { const D = window.DeviceOrientationEvent; if (!D) return tiltFail();
      if (typeof D.requestPermission === 'function') D.requestPermission().then(r => r === 'granted' ? bind() : tiltFail()).catch(tiltFail); else bind();
    } catch (_) { tiltFail(); }
  };
  initInput.ensureTilt = () => { if (prefs.ctrl === 'tilt' && !tiltOK) enableTilt(); };

  const seg = (id, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fn(b.dataset.v); applyPrefs(); hooks.onChange(); } });
  seg('o-ctrl', v => { $('o-msg').hidden = true; prefs.ctrl = v; if (v === 'tilt' && !tiltOK) enableTilt(); });
  seg('o-gas', v => prefs.autoGas = v === 'auto'); seg('o-aids', v => prefs.aids = +v);
  seg('o-cam', v => prefs.cam = +v); seg('o-diff', v => prefs.diff = +v); seg('o-laps', v => prefs.laps = +v); seg('o-gfx', v => prefs.gfx = v);
  $('b-cam').addEventListener('click', hooks.onCam); $('b-reset').addEventListener('click', hooks.onReset);
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyC' && !e.repeat) hooks.onCam();
    if (e.code === 'KeyR' && !e.repeat) hooks.onReset();
    if (e.code === 'Enter' && !hooks.isRacing()) hooks.onStart();
    if (hooks.isRacing() && e.code.indexOf('Arrow') === 0) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  applyPrefs();
}

export function applyPrefs() {
  $('ctl-l').hidden = prefs.ctrl !== 'buttons';
  $('b-gas').hidden = prefs.autoGas; $('b-brake').classList.toggle('wide', prefs.autoGas);
  $('b-cam').textContent = 'VIEW: ' + CAMS[prefs.cam];
  $('h-hint').textContent = (prefs.ctrl === 'buttons' ? 'Hold the arrows to steer.' : prefs.ctrl === 'tilt' ? 'Tilt your phone left or right to steer.' : 'Drag left or right anywhere to steer.') +
    (prefs.autoGas ? '' : ' Hold GAS to accelerate.') + (prefs.aids === 2 ? ' The car brakes for corners by itself.' : ' Brake before the corners.');
  const mark = (id, v) => document.querySelectorAll('#' + id + ' button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  mark('o-ctrl', prefs.ctrl); mark('o-gas', prefs.autoGas ? 'auto' : 'manual'); mark('o-aids', prefs.aids); mark('o-cam', prefs.cam);
  mark('o-diff', prefs.diff); mark('o-laps', prefs.laps); mark('o-gfx', prefs.gfx);
  $('h-laps').textContent = prefs.laps;
  try { localStorage.setItem('nitro-cartel-prefs-v2', JSON.stringify(prefs)); } catch (_) {}
}

export function resetSteer() { steerId = null; touchSteer = 0; steerVal = 0; }

// Returns steering -1..1 (smoothed), throttle and brake pedals for this frame.
export function readControls(dt) {
  const kb = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (prefs.ctrl === 'drag' && steerId !== null) steerVal = touchSteer;
  else {
    const target = clamp(kb + (input.right ? 1 : 0) - (input.left ? 1 : 0) + (prefs.ctrl === 'tilt' && tiltOK ? tiltSteer : 0), -1, 1);
    steerVal += (target - steerVal) * Math.min(1, (target === 0 ? 11 : 5.5) * dt);
  }
  const brake = !!(input.brake || keys.ArrowDown || keys.KeyS);
  const gas = !!(prefs.autoGas || input.gas || keys.ArrowUp || keys.KeyW);
  return { steer: steerVal, gas, brake };
}
export function setSteer(v) { steerVal = v; }
