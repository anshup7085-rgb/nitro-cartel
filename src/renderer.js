// Renderer set-up: WebGPU where the phone supports it, WebGL 2 otherwise. Sky, sun, shadows.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(0.45, 0.72, 0.38).normalize();

export async function createRenderer(canvas) {
  let renderer;
  const make = forceWebGL => new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance', forceWebGL });
  try { renderer = make(false); await renderer.init(); }
  catch (e) { renderer = make(true); await renderer.init(); }      // WebGPU refused: fall back to WebGL 2
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  return { renderer, backend };
}

// One painted sky used both as the backdrop and as the reflection source for the car paint.
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#1f5fb8'); gr.addColorStop(0.3, '#4f8fd6'); gr.addColorStop(0.47, '#b9d6ee'); gr.addColorStop(0.5, '#d9e6ee');
  gr.addColorStop(0.505, '#7c8f6c'); gr.addColorStop(1, '#45603a');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  // sun
  const u = Math.atan2(SUN_DIR.z, SUN_DIR.x) / (2 * Math.PI) + 0.5, v = Math.asin(SUN_DIR.y) / Math.PI + 0.5;
  const sx = u * 1024, sy = (1 - v) * 512, sg = g.createRadialGradient(sx, sy, 0, sx, sy, 110);
  sg.addColorStop(0, 'rgba(255,255,245,1)'); sg.addColorStop(0.08, 'rgba(255,250,225,.95)'); sg.addColorStop(0.3, 'rgba(255,240,200,.25)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = sg; g.fillRect(0, 0, 1024, 512);
  // clouds: stretched soft blobs above the horizon
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 1024, y = 120 + Math.random() * 120, w = 50 + Math.random() * 120, h = 8 + Math.random() * 16;
    for (let k = 0; k < 5; k++) {
      const cx = x + (Math.random() - 0.5) * w, cy = y + (Math.random() - 0.5) * h, r = 14 + Math.random() * 30;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      cg.addColorStop(0, 'rgba(255,255,255,.55)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(cx, cy); g.scale(2.2, 0.6); g.translate(-cx, -cy); g.fillStyle = cg; g.fillRect(cx - r, cy - r, r * 2, r * 2); g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export function createWorld() {
  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.85;
  scene.fog = new THREE.Fog(0xc4d9ea, 260, 1900);

  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x54703f, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  const camera = new THREE.PerspectiveCamera(66, 1, 0.3, 5000);
  // keep the shadow box centred on the car being followed
  const followShadow = (x, z) => { sun.target.position.set(x, 0, z); sun.position.set(x + SUN_DIR.x * 120, SUN_DIR.y * 120, z + SUN_DIR.z * 120); };
  return { scene, camera, sun, followShadow };
}
