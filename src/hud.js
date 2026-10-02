// On-screen race information: timing, position, speed, g readout, track map, start lights, results.
import { N, PX, PZ } from './track.js';
const $ = id => document.getElementById(id);

export const fmt = (t, dp) => { if (!(t > 0)) return '-:--.-'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(dp === undefined ? 1 : dp); };

const els = {}, cache = {};
['pos', 'lap', 'time', 'best', 'last', 'toast', 'kmh', 'gear', 'board', 'g'].forEach(k => els[k] = $('h-' + k));
export function setText(k, v) { if (cache[k] !== v) { cache[k] = v; els[k].textContent = v; } }

let toastT = 0;
export function toast(msg, cls) { els.toast.textContent = msg; els.toast.className = 'on ' + (cls || 'info'); toastT = 2.2; }
export function tickToast(dt) { if (toastT > 0 && (toastT -= dt) <= 0) els.toast.className = ''; return toastT; }

const lights = Array.from(document.querySelectorAll('#h-lights i'));
export function setLights(n) { lights.forEach((l, i) => l.classList.toggle('on', i < n)); $('h-lights').hidden = n < 0; }

// track map
const mapG = $('h-map').getContext('2d'), base = document.createElement('canvas'); base.width = base.height = 184;
let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
for (let i = 0; i < N; i++) { x0 = Math.min(x0, PX[i]); x1 = Math.max(x1, PX[i]); z0 = Math.min(z0, PZ[i]); z1 = Math.max(z1, PZ[i]); }
const sc = 160 / Math.max(x1 - x0, z1 - z0), ox = 92 - (x0 + x1) / 2 * sc, oz = 92 - (z0 + z1) / 2 * sc;
{
  const g = base.getContext('2d'); g.lineJoin = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= N; i += 3) { const k = i % N; g.lineTo(PX[k] * sc + ox, PZ[k] * sc + oz); } g.closePath(); };
  g.strokeStyle = 'rgba(18,11,34,.85)'; g.lineWidth = 11; path(); g.stroke();
  g.strokeStyle = '#f6ecd9'; g.lineWidth = 4; path(); g.stroke();
  g.fillStyle = '#ff4d3a'; g.fillRect(PX[0] * sc + ox - 2, PZ[0] * sc + oz - 7, 4, 14);
}
export function drawMap(cars, player) {
  mapG.clearRect(0, 0, 184, 184); mapG.drawImage(base, 0, 0);
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]; mapG.fillStyle = c === player ? '#ffc93c' : '#49e0ff';
    mapG.beginPath(); mapG.arc(c.x * sc + ox, c.z * sc + oz, c === player ? 8 : 5, 0, 6.3); mapG.fill();
    if (c === player) { mapG.lineWidth = 2; mapG.strokeStyle = '#120b22'; mapG.stroke(); }
  }
}
export function drawBoard(cars, player) {
  els.board.innerHTML = cars.slice().sort((a, b) => a.rank - b.rank).map(c => '<li' + (c === player ? ' class="me"' : '') + '><span>' + (c.rank + 1) + '</span><span>' + c.name + '</span></li>').join('');
}
export function showResults(order, player) {
  const win = order[0], pp = player.finishPos;
  $('r-head').textContent = pp === 1 ? 'YOU WON' : 'YOU FINISHED P' + pp;
  $('r-sub').textContent = pp === 1 ? 'From last on the grid to first. Best lap ' + fmt(player.best, 3) + '.'
    : win.name + ' won. You were ' + (player.finishT - win.finishT).toFixed(1) + ' seconds behind. Your best lap was ' + fmt(player.best, 3) + '.';
  $('r-body').innerHTML = order.map(c => '<tr' + (c === player ? ' class="me"' : '') + '><td>P' + c.finishPos + '</td><td>' + c.name + '</td><td>' +
    (c === win ? fmt(c.finishT, 3) : '+' + (c.finishT - win.finishT).toFixed(3) + 's') + '</td><td>' + fmt(c.best, 3) + '</td></tr>').join('');
  $('hud').hidden = true; $('results').hidden = false;
}
