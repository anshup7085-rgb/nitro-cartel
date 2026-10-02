// Procedural open-wheel race car. Built once as shared geometry, coloured per driver.
// Local axes: +z forward, +y up. Length about 5.5 m, width 2 m, wheelbase 3.6 m.
import * as THREE from 'three';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
const boxG = new THREE.BoxGeometry(1, 1, 1);

function add(list, geo, sx, sy, sz, x, y, z, rx, ry, rz) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  Q.setFromEuler(E.set(rx || 0, ry || 0, rz || 0));
  g.applyMatrix4(M4.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(sx, sy, sz)));
  list.push(g);
}
const box = (list, sx, sy, sz, x, y, z, rx, ry, rz) => add(list, boxG, sx, sy, sz, x, y, z, rx, ry, rz);

function merge(list, colors) {
  let n = 0; list.forEach(g => n += g.attributes.position.count);
  const p = new Float32Array(n * 3), nr = new Float32Array(n * 3), cl = colors ? new Float32Array(n * 3) : null; let o = 0;
  list.forEach((g, gi) => {
    const cnt = g.attributes.position.count;
    p.set(g.attributes.position.array, o * 3); nr.set(g.attributes.normal.array, o * 3);
    if (cl) { const c = colors[gi]; for (let i = 0; i < cnt; i++) { cl[(o + i) * 3] = c.r; cl[(o + i) * 3 + 1] = c.g; cl[(o + i) * 3 + 2] = c.b; } }
    o += cnt;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  if (cl) out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  return out;
}

// Smooth skin through a row of rounded cross-sections: [z, width, height, yCentre, xCentre]
function loft(secs, around, squareness) {
  const M = around || 16, e = squareness || 0.55, pos = [], idx = [];
  for (const s of secs) for (let k = 0; k < M; k++) {
    const a = k / M * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
    pos.push((s[4] || 0) + Math.sign(c) * Math.pow(Math.abs(c), e) * s[1] / 2, s[3] + Math.sign(n) * Math.pow(Math.abs(n), e) * s[2] / 2, s[0]);
  }
  for (let i = 0; i < secs.length - 1; i++) for (let k = 0; k < M; k++) {
    const a = i * M + k, b = i * M + (k + 1) % M, c = a + M, d = b + M; idx.push(a, c, b, b, c, d);
  }
  const first = secs[0], last = secs[secs.length - 1], f = pos.length / 3; pos.push(first[4] || 0, first[3], first[0]); const l = f + 1; pos.push(last[4] || 0, last[3], last[0]);
  const base = (secs.length - 1) * M;
  for (let k = 0; k < M; k++) { idx.push(f, k, (k + 1) % M); idx.push(l, base + (k + 1) % M, base + k); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const ID = [1, 1, 1, 0, 0, 0];

// painted bodywork
const paintG = (() => {
  const l = [];
  add(l, loft([[2.78, 0.10, 0.08, 0.30], [2.5, 0.22, 0.14, 0.32], [1.9, 0.34, 0.22, 0.38], [1.3, 0.50, 0.34, 0.44], [0.75, 0.66, 0.50, 0.52],
    [0.3, 0.74, 0.62, 0.56], [-0.3, 0.72, 0.72, 0.61], [-0.9, 0.60, 0.80, 0.67], [-1.5, 0.44, 0.60, 0.60], [-2.1, 0.30, 0.38, 0.50], [-2.6, 0.16, 0.20, 0.42]]), ...ID);
  for (const sx of [-1, 1]) {
    add(l, loft([[0.6, 0.46, 0.30, 0.50, sx * 0.64], [0.25, 0.56, 0.44, 0.47, sx * 0.64], [-0.5, 0.58, 0.42, 0.44, sx * 0.62], [-1.2, 0.46, 0.30, 0.40, sx * 0.52], [-1.95, 0.24, 0.16, 0.36, sx * 0.34]], 14), ...ID);
    box(l, 0.03, 0.66, 0.62, sx * 0.55, 0.86, -2.42);          // rear wing endplates
    box(l, 0.02, 0.26, 0.56, sx * 0.97, 0.22, 2.5);            // front wing endplates
    box(l, 0.16, 0.07, 0.1, sx * 0.52, 0.8, 0.52);             // mirrors
  }
  box(l, 0.035, 0.34, 1.1, 0, 1.0, -1.45);                     // engine cover fin
  return merge(l);
})();
// wings and trim in the second colour
const accentG = (() => {
  const l = [];
  for (let k = 0; k < 4; k++) box(l, 1.92, 0.025, 0.15, 0, 0.11 + k * 0.045, 2.68 - k * 0.1, -0.2 - k * 0.1);   // front wing elements
  box(l, 1.06, 0.035, 0.36, 0, 1.0, -2.36, 0.18);              // rear wing main plane
  box(l, 1.06, 0.03, 0.2, 0, 1.14, -2.56, 0.55);               // rear wing flap
  box(l, 0.9, 0.03, 0.2, 0, 0.6, -2.42, 0.2);                  // beam wing
  box(l, 0.14, 0.09, 0.2, 0, 1.13, -0.55);                     // onboard camera pod
  return merge(l);
})();
// carbon: floor, suspension, halo, cockpit rim
const carbonG = (() => {
  const l = [];
  box(l, 1.6, 0.05, 3.5, 0, 0.11, -0.35);                      // floor
  box(l, 1.2, 0.2, 0.5, 0, 0.24, -2.3, -0.35);                 // diffuser
  box(l, 0.46, 0.05, 0.86, 0, 0.855, 0.02);                    // cockpit opening
  box(l, 0.26, 0.2, 0.06, 0, 1.0, -0.42);                      // air intake
  box(l, 0.07, 0.42, 0.3, 0, 0.8, -2.38);                      // rear wing pylon
  const arc = new THREE.TorusGeometry(0.33, 0.034, 8, 18, Math.PI); arc.rotateX(Math.PI / 2);
  add(l, arc, 1, 1, 1, 0, 0.99, 0.04);                         // halo hoop
  box(l, 0.05, 0.26, 0.07, 0, 0.87, 0.38, 0.35);               // halo centre strut
  for (const sx of [-1, 1]) {
    box(l, 0.06, 0.06, 0.5, sx * 0.33, 0.95, -0.2, -0.2);      // halo rear legs
    for (const [z, y] of [[1.9, 0.44], [1.62, 0.3]]) box(l, 0.56, 0.03, 0.07, sx * 0.5, y, z, 0, sx * 0.25, sx * 0.12);   // front wishbones
    for (const [z, y] of [[-1.7, 0.46], [-2.0, 0.3]]) box(l, 0.5, 0.03, 0.07, sx * 0.52, y, z, 0, sx * -0.2, sx * 0.1);  // rear wishbones
  }
  return merge(l);
})();
// one wheel: tyre, rim, spokes and the coloured compound stripe, coloured per vertex
const wheelG = (width => {
  const build = w => {
    const l = [], c = [], black = new THREE.Color(0x0c0c0e), rim = new THREE.Color(0x2a2c30), spoke = new THREE.Color(0x8d9299), stripe = new THREE.Color(0xf2c21a);
    const tyre = new THREE.LatheGeometry([[0.2, -w / 2], [0.32, -w / 2], [0.36, -w / 2 + 0.045], [0.36, w / 2 - 0.045], [0.32, w / 2], [0.2, w / 2]].map(p => new THREE.Vector2(p[0], p[1])), 22);
    tyre.rotateZ(Math.PI / 2); add(l, tyre, ...ID); c.push(black);
    const hub = new THREE.CylinderGeometry(0.2, 0.2, w * 0.92, 16); hub.rotateZ(Math.PI / 2); add(l, hub, ...ID); c.push(rim);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 5; k++) { box(l, 0.02, 0.38, 0.05, sx * (w * 0.46 + 0.011), 0, 0, k * Math.PI / 5); c.push(spoke); }
      const ring = new THREE.RingGeometry(0.265, 0.3, 24); ring.rotateY(sx * Math.PI / 2); add(l, ring, 1, 1, 1, sx * (w / 2 + 0.004), 0, 0); c.push(stripe);
    }
    return merge(l, c);
  };
  return { front: build(0.31), rear: build(0.4) };
})();

const carbonM = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.45, metalness: 0.3 });
const wheelM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
const tailM = new THREE.MeshBasicMaterial({ color: 0xff2222 });
const helmetG = new THREE.SphereGeometry(0.15, 14, 10);
function blobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const blobM = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
const blobG = new THREE.PlaneGeometry(3.2, 6.6);

export const AXLE_F = 1.75, AXLE_R = -1.85, WHEEL_R = 0.36;

export function makeCar(color, accent) {
  const g = new THREE.Group();
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  mesh(paintG, new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.55 }));
  mesh(accentG, new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.4 }));
  const carbon = mesh(carbonG, carbonM);
  const helmet = mesh(helmetG, new THREE.MeshStandardMaterial({ color: accent, roughness: 0.2, metalness: 0.3 })); helmet.position.set(0, 0.88, -0.14);
  const wheels = [];
  for (const [x, z, geo] of [[0.83, AXLE_F, wheelG.front], [-0.83, AXLE_F, wheelG.front], [0.8, AXLE_R, wheelG.rear], [-0.8, AXLE_R, wheelG.rear]]) {
    const w = mesh(geo, wheelM); w.position.set(x, WHEEL_R, z); w.rotation.order = 'YXZ'; wheels.push(w);
  }
  const steering = new THREE.Mesh(boxG, carbonM); steering.scale.set(0.27, 0.14, 0.03); steering.position.set(0, 0.74, 0.3); g.add(steering);
  const tail = new THREE.Mesh(boxG, tailM); tail.scale.set(0.12, 0.1, 0.04); tail.position.set(0, 0.42, -2.62); g.add(tail);
  const blob = new THREE.Mesh(blobG, blobM); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.visible = false; g.add(blob);
  return { group: g, wheels, helmet, steering, blob, carbon };
}
