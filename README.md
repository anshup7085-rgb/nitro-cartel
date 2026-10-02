# Nitro Cartel

Open-wheel racing game for the phone browser. Eight cars, one 2.7 km circuit, lap timing, four camera views, and button, drag or tilt steering.

Play: https://anshup7085-rgb.github.io/nitro-cartel/

## How it is built

No build step. The browser loads the files below directly as JavaScript modules, and Three.js comes from a CDN (pinned in the import map in `index.html`).

| File | What it does |
| --- | --- |
| `index.html` | Page, HUD markup and styles, import map |
| `src/main.js` | Game loop, race state, rival drivers, contact, camera |
| `src/renderer.js` | WebGPU renderer with WebGL 2 fallback, sky, sun, shadows |
| `src/physics.js` | Vehicle dynamics: tyre curve, friction circle, wheel loads, downforce, drag, engine |
| `src/track.js` | Circuit centre line and everything drawn around it |
| `src/carModel.js` | Procedural open-wheel car geometry |
| `src/input.js` | Settings, touch, tilt and keyboard controls |
| `src/hud.js` | Timing, track map, start lights, results |
| `src/audio.js` | Synthesised engine note |
| `legacy/` | The earlier single-file version |

## Running it locally

Serve the folder with any static web server (for example `python3 -m http.server`) and open it in Chrome. Opening `index.html` straight from disk will not work, because browsers block modules on `file://`.
