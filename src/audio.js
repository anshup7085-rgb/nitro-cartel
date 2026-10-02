// Engine note and beeps, synthesised with Web Audio. Starts on the first tap (browsers require that).
let AC = null, master = null, osc1 = null, osc2 = null, gain = null;
export const sound = { muted: false };
const GEAR_TOP = [24, 34, 44, 54, 64, 74, 84, 96];   // m/s at the top of each gear

export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    gain = AC.createGain(); gain.gain.value = 0; lp.connect(gain); gain.connect(master);
    osc1 = AC.createOscillator(); osc1.type = 'sawtooth'; osc1.connect(lp); osc1.start();
    osc2 = AC.createOscillator(); osc2.type = 'square'; osc2.connect(lp); osc2.start();
  } catch (e) { AC = null; }
}
export function blip(freq, dur, type, vol, slide) {
  if (!AC || sound.muted) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
export function gearFor(v) { for (let i = 0; i < 8; i++) if (v < GEAR_TOP[i] * 0.97) return i + 1; return 8; }
export function engineSound(v, throttle, on) {
  if (!AC || !gain) return;
  const g = gearFor(v), rpm = Math.max(0.35, v / GEAR_TOP[g - 1]);
  const hz = 95 + rpm * 300;
  osc1.frequency.value = hz; osc2.frequency.value = hz * 0.5;
  gain.gain.value = on && !sound.muted ? 0.018 + (throttle ? 0.03 : 0.01) * rpm : 0;
}
