// The circuit: centre line maths, plus everything you see around it.
import * as THREE from 'three';

export const W = 7.5;        // half road width (m)
export const VERGE = 10;     // grass between road edge and barrier (m)
export const N = 900;        // samples around the lap

const RAW = [[0, 0], [120, -30], [220, 40], [260, 160], [180, 250], [60, 220], [-20, 300], [-150, 280], [-230, 180], [-180, 60], [-240, -60], [-120, -120]];
const curve = new THREE.CatmullRomCurve3(RAW.map(p => new THREE.Vector3(p[0] * 1.7, 0, p[1] * 1.7)), true, 'centripetal');
const PTS = curve.getSpacedPoints(N);
export const L = curve.getLength();
export const DS = L / N;
export const PX = new Float32Array(N), PZ = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N);
let k0 = new Float32Array(N);
for (let i = 0; i < N; i++) {
  PX[i] = PTS[i].x; PZ[i] = PTS[i].z;
  const a = PTS[(i + N - 1) % N], b = PTS[(i + 1) % N], x = b.x - a.x, z = b.z - a.z, m = Math.hypot(x, z) || 1;
  TX[i] = x / m; TZ[i] = z / m;
}
for (let i = 0; i < N; i++) { const n = (i + 1) % N, p = (i + N - 1) % N; k0[i] = ((TX[n] - TX[p]) * -TZ[i] + (TZ[n] - TZ[p]) * TX[i]) / (2 * DS); }
for (let pass = 0; pass < 3; pass++) { const k2 = new Float32Array(N); for (let i = 0; i < N; i++) k2[i] = (k0[(i + N - 1) % N] + k0[i] * 2 + k0[(i + 1) % N]) / 4; k0 = k2; }
export const K = k0;         // curvature (1/radius); > 0 bends right

const H = { x: 0, z: 0, tx: 0, tz: 1 };
export function frame(s, o) {
  const u = (((s % L) + L) % L) / DS; let i = Math.floor(u); if (i >= N) i = N - 1;
  const f = u - i, j = (i + 1) % N;
  o.x = PX[i] + (PX[j] - PX[i]) * f; o.z = PZ[i] + (PZ[j] - PZ[i]) * f;
  const tx = TX[i] + (TX[j] - TX[i]) * f, tz = TZ[i] + (TZ[j] - TZ[i]) * f, m = Math.hypot(tx, tz) || 1;
  o.tx = tx / m; o.tz = tz / m; return o;
}
export const idxOf = s => Math.floor((((s % L) + L) % L) / DS) % N;
export function wrapDiff(a, b) { let x = (a - b) % L; if (x > L / 2) x -= L; else if (x < -L / 2) x += L; return x; }
// world position of a point s metres round the lap and d metres right of the centre line
export function place(obj, s, d, y, yawOffset) { frame(s, H); obj.position.set(H.x - H.tz * d, y, H.z + H.tx * d); obj.rotation.y = Math.atan2(H.tx, H.tz) + (yawOffset || 0); }

/* ---------- visuals ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

export function buildTrack(scene, maxAniso) {
  // asphalt with a darker rubbered-in racing line and white edge lines
  const road = canvasTex(256, 256, (g) => {
    g.fillStyle = '#47484d'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.13)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    const rl = g.createLinearGradient(70, 0, 186, 0); rl.addColorStop(0, 'rgba(15,15,18,0)'); rl.addColorStop(0.5, 'rgba(15,15,18,.32)'); rl.addColorStop(1, 'rgba(15,15,18,0)');
    g.fillStyle = rl; g.fillRect(70, 0, 116, 256);
    g.fillStyle = '#f1f1ee'; g.fillRect(3, 0, 5, 256); g.fillRect(248, 0, 5, 256);
  });
  road.wrapT = THREE.RepeatWrapping; road.anisotropy = Math.min(8, maxAniso || 1);
  {
    const pos = [], uv = [], nor = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N; pos.push(PX[k] + TZ[k] * W, 0, PZ[k] - TX[k] * W, PX[k] - TZ[k] * W, 0, PZ[k] + TX[k] * W);
      uv.push(0, i * DS / 14, 1, i * DS / 14); nor.push(0, 1, 0, 0, 1, 0);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: road, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
  }

  // kerbs, mown grass, outer grass and barriers as flat-coloured quads
  {
    const pos = [], col = [], nor = [];
    const C = h => new THREE.Color(h);
    const kerbR = C(0xd22b22), kerbW = C(0xf0f0ec), g1 = C(0x4d8a39), g2 = C(0x447d32), g3 = C(0x4a8437);
    const wallA = C(0xd7d9dc), wallB = C(0xc7281f), wallTop = C(0xf4f4f2), armco = C(0x9aa1a8);
    const quad = (i, j, da, db, y0, y1, c0, c1, up) => {
      const ax = PX[i] - TZ[i] * da, az = PZ[i] + TX[i] * da, bx = PX[i] - TZ[i] * db, bz = PZ[i] + TX[i] * db;
      const cx = PX[j] - TZ[j] * da, cz = PZ[j] + TX[j] * da, dx = PX[j] - TZ[j] * db, dz = PZ[j] + TX[j] * db;
      pos.push(ax, y0, az, bx, y1, bz, cx, y0, cz, bx, y1, bz, dx, y1, dz, cx, y0, cz);
      for (const c of [c0, c1, c0, c1, c1, c0]) col.push(c.r, c.g, c.b);
      for (let q = 0; q < 6; q++) nor.push(up[0], up[1], up[2]);
    };
    const UP = [0, 1, 0];
    for (const sg of [-1, 1]) for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, corner = Math.abs(K[i]) > 0.0035;
      const kc = corner ? (Math.floor(i / 2) % 2 ? kerbW : kerbR) : g1;
      quad(i, j, sg * W, sg * (W + 1.3), 0, 0, kc, kc, UP);
      const st = Math.floor(i / 5) % 2 ? g1 : g2;
      quad(i, j, sg * (W + 1.3), sg * (W + VERGE), 0, 0, st, st, UP);
      quad(i, j, sg * (W + VERGE), sg * (W + VERGE + 70), 0, 0, g3, g3, UP);
      const wc = corner ? (Math.floor(i / 3) % 2 ? wallA : wallB) : armco, dw = sg * (W + VERGE);
      quad(i, j, dw, dw, 0, 1.1, wc, wallTop, [TZ[i] * sg, 0.3, -TX[i] * sg]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
  }
  { const g = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshLambertMaterial({ color: 0x4a8437 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.6; scene.add(g); }

  const nearTrack = (x, z, min) => { for (let i = 0; i < N; i += 5) if (Math.hypot(PX[i] - x, PZ[i] - z) < min) return true; return false; };
  const o = new THREE.Object3D();

  // trackside advertising boards (invented names), four designs instanced round the lap
  {
    const names = [['NITRO CARTEL GP', '#12233f', '#ffc93c'], ['KAIRO TYRES', '#c7281f', '#ffffff'], ['VELOX OIL', '#f4f4f2', '#12233f'], ['ZENTRA', '#0d6b58', '#ffffff']];
    const geo = new THREE.PlaneGeometry(13.5, 2.3), per = Math.ceil(N / 14 * 2 / names.length) + 2;
    const meshes = names.map(([txt, bg, fg]) => new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: canvasTex(512, 88, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = 'italic 900 54px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 3);
    }) }), per));
    const counts = names.map(() => 0); let n = 0;
    for (const sg of [-1, 1]) for (let i = 0; i < N; i += 14) {
      const which = n++ % names.length, d = sg * (W + VERGE + 0.7);
      o.position.set(PX[i] - TZ[i] * d, 2.3, PZ[i] + TX[i] * d); o.rotation.set(0, Math.atan2(TX[i], TZ[i]) + sg * Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix();
      meshes[which].setMatrixAt(counts[which]++, o.matrix);
    }
    meshes.forEach((m, k) => { m.count = counts[k]; scene.add(m); });
  }

  // trees and far hills
  {
    const count = 520, foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 7, 7), new THREE.MeshLambertMaterial({ color: 0x2f6128 }), count);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0x57432f }), count);
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 20000) {
      const x = rnd(-560, 620), z = rnd(-380, 680);
      if (nearTrack(x, z, W + VERGE + 9) || !nearTrack(x, z, 190)) continue;
      const s = rnd(0.8, 1.7);
      o.rotation.set(0, rnd(0, 6.28), 0); o.scale.set(s, s, s);
      o.position.set(x, 2.6 * s + 3.3 * s, z); o.updateMatrix(); foliage.setMatrixAt(placed, o.matrix);
      o.position.set(x, 1.3 * s, z); o.updateMatrix(); trunks.setMatrixAt(placed, o.matrix); placed++;
    }
    foliage.count = trunks.count = placed; scene.add(foliage); scene.add(trunks);
    const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), new THREE.MeshLambertMaterial({ color: 0x5f8457 }), 46);
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * 6.283 + rnd(-0.05, 0.05), r = rnd(900, 1500), w = rnd(260, 520);
      o.position.set(40 + Math.cos(a) * r, 0, 150 + Math.sin(a) * r); o.rotation.set(0, rnd(0, 3), 0); o.scale.set(w, rnd(70, 190), w); o.position.y = o.scale.y / 2 - 6; o.updateMatrix(); hills.setMatrixAt(i, o.matrix);
    }
    scene.add(hills);
  }

  // grandstands, pit building, start gantry, grid slots
  {
    const crowd = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#5b6470'; g.fillRect(0, 0, w, h);
      const cols = ['#e33', '#fc3', '#fff', '#39f', '#2b2', '#f80', '#ddd', '#c3c'];
      for (let y = 4; y < h; y += 6) for (let x = 2; x < w; x += 4) if (Math.random() < 0.8) { g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, y, 3, 4); }
    });
    crowd.wrapS = THREE.RepeatWrapping; crowd.repeat.set(3, 1);
    const standM = new THREE.MeshLambertMaterial({ map: crowd }), roofM = new THREE.MeshLambertMaterial({ color: 0xf2f2f0 }), steel = new THREE.MeshLambertMaterial({ color: 0x5a626b });
    for (const [frac, side] of [[0.985, -1], [0.3, -1], [0.56, 1], [0.8, -1]]) {
      const grp = new THREE.Group();
      const seats = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 76), standM); seats.position.y = 4; seats.rotation.z = 0.0; grp.add(seats);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 80), roofM); roof.position.y = 11.5; grp.add(roof);
      for (const pz of [-36, 0, 36]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 11.5, 0.4), steel); p.position.set(side * 6, 5.75, pz); grp.add(p); }
      place(grp, frac * L, side * (W + VERGE + 9), 0); scene.add(grp);
    }
    const pit = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#eceef0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b2433'; for (let x = 8; x < w; x += 32) g.fillRect(x, 26, 24, 38);
      g.fillStyle = '#c7281f'; g.fillRect(0, 0, w, 10);
    });
    const pitB = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 150), new THREE.MeshLambertMaterial({ map: pit })); place(pitB, 30, W + VERGE + 12, 3.5); scene.add(pitB);

    const check = canvasTex(256, 32, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f2'; g.fillRect(x * 16, y * 16, 16, 16); } });
    const gantry = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 6, 1.4, 0.8), steel); beam.position.y = 7.4; gantry.add(beam);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.4, 0.6), steel); p.position.set(sx * (W + 2.6), 3.7, 0); gantry.add(p); }
    const paint = new THREE.MeshBasicMaterial({ map: check, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 1.6), paint); line.rotation.x = -Math.PI / 2; line.position.y = 0.012; gantry.add(line);
    place(gantry, 0, 0, 0); scene.add(gantry);

    const slotM = new THREE.MeshBasicMaterial({ color: 0xf4f4f2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (let k = 0; k < 8; k++) {
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.22), slotM); slot.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group(); holder.add(slot); place(holder, -9 - k * 9 + 3, k % 2 ? 2.6 : -2.6, 0.012); scene.add(holder);
    }
  }

  // braking distance boards before each heavy stop
  {
    const board = n => new THREE.MeshBasicMaterial({ map: canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = '900 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 4); }) });
    const mats = { 150: board(150), 100: board(100), 50: board(50) }, geo = new THREE.PlaneGeometry(1.7, 1.25);
    let straight = 0;
    for (let i = 0; i < N * 2; i++) {
      const k = i % N;
      if (Math.abs(K[k]) < 0.0025) { straight += DS; continue; }
      if (Math.abs(K[k]) > 0.007 && straight > 110 && i >= N) {
        const out = K[k] > 0 ? -1 : 1;
        for (const dist of [150, 100, 50]) { const m = new THREE.Mesh(geo, mats[dist]); place(m, k * DS - dist, out * (W + 2.4), 1.5, Math.PI); scene.add(m); }
      }
      if (Math.abs(K[k]) > 0.007) straight = 0;
    }
  }
}
