// Renders the design sheet (tools/design-sheet.html) from the exported STLs.
// Run `npm run render-design`; it screenshots this page to
// hardware/bat-handle/renders/design-sheet.png.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBatMesh } from '../src/bat/batModel.js';
import { MOUNT, BAT_SPEC, SWEET_SPOT_Y } from '../src/bat/batSpec.js';

const HANDLE_LEN = MOUNT.handleLength;
const POD_Y = MOUNT.podY;
const GRIP_BASE = MOUNT.gripBase;
const FRAME_BOTTOM = MOUNT.frameBottom;

const COLORS = {
  frame: 0xf07a2c,
  handle: 0x2f343b,
  strap: 0x15171a,
  shell: 0xe6e9ed,
  controls: 0x2b2f35,
};

// SCAD (x, y, z) in mm -> three.js world (x, z, -y)
const S = (x, y, z) => new THREE.Vector3(x, z, -y);

async function loadStl(url) {
  const geo = new STLLoader().parse(await (await fetch(url)).arrayBuffer());
  return toCreasedNormals(geo, THREE.MathUtils.degToRad(28));
}

const [frameGeo, framePrintGeo, handleGeo, proxyGeo, controlsGeo, strapGeo] = await Promise.all([
  loadStl('/tools/.render-cache/frame_upright.stl'),
  loadStl('/hardware/bat-handle/stl/frame.stl'),
  loadStl('/hardware/bat-handle/stl/handle.stl'),
  loadStl('/tools/.render-cache/proxy_right.stl'),
  loadStl('/tools/.render-cache/proxy_right_controls.stl'),
  loadStl('/tools/.render-cache/strap_band.stl'),
]);

const mats = {
  frame: new THREE.MeshPhysicalMaterial({ color: COLORS.frame, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
  handle: new THREE.MeshPhysicalMaterial({ color: COLORS.handle, roughness: 0.62, clearcoat: 0.15 }),
  strap: new THREE.MeshStandardMaterial({ color: COLORS.strap, roughness: 0.95 }),
  shell: new THREE.MeshPhysicalMaterial({ color: COLORS.shell, roughness: 0.38, clearcoat: 0.3 }),
  controls: new THREE.MeshStandardMaterial({ color: COLORS.controls, roughness: 0.45 }),
};

// The controller standing in the frame: upright, trigger toward the back
// (+Y), faceplate tilting toward the face (-Y). tiltDeg rocks it outward
// about its base, the way it goes in and out of the heel cup.
function controller({ tiltDeg = 0, lift = 0 } = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(0, POD_Y, GRIP_BASE + lift);
  pivot.rotation.y = THREE.MathUtils.degToRad(tiltDeg);
  const turn = new THREE.Group();
  turn.rotation.z = Math.PI / 2;
  turn.add(new THREE.Mesh(proxyGeo, mats.shell), new THREE.Mesh(controlsGeo, mats.controls));
  pivot.add(turn);
  return pivot;
}

// The assembly in SCAD coordinates, wrapped so that SCAD +Z is three +Y.
function assembly({ handle = true, ctrl = {}, showController = true, strap = true } = {}) {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  root.add(new THREE.Mesh(frameGeo, mats.frame));
  if (handle) root.add(new THREE.Mesh(handleGeo, mats.handle));
  if (strap) root.add(new THREE.Mesh(strapGeo, mats.strap));
  if (showController) root.add(controller(ctrl));
  return root;
}

const pmremCache = new Map();
function makeRenderer(panel) {
  const canvas = document.createElement('canvas');
  panel.prepend(canvas);
  const { width, height } = panel.getBoundingClientRect();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { renderer, width, height };
}

function stage(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-300, 500, 450);
  const rim = new THREE.DirectionalLight(0xa9c8ff, 1.4);
  rim.position.set(400, 200, -500);
  scene.add(key, rim);
  return scene;
}

function camera(width, height, target, dirScad, dist, fov = 24) {
  const cam = new THREE.PerspectiveCamera(fov, width / height, 5, 20000);
  const d = S(...dirScad).normalize();
  cam.position.copy(target).addScaledVector(d, dist);
  cam.lookAt(target);
  return cam;
}

function toScreen(p, cam, width, height) {
  const v = p.clone().project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}

// ------------------------------------------------------------- callouts --
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgFor(panel) {
  let svg = panel.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    panel.appendChild(svg);
  }
  return svg;
}
function svgEl(svg, tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  svg.appendChild(el);
  return el;
}

// labels: [{ html, anchor: Vector3 (world), side: 'left'|'right', x: px, dy }]
function callouts(panel, cam, width, height, labels, { color = '#ff8a3d' } = {}) {
  const svg = svgFor(panel);
  const placed = labels.map((l) => ({ ...l, a: toScreen(l.anchor, cam, width, height) }));
  for (const side of ['left', 'right']) {
    const group = placed.filter((l) => l.side === side).sort((p, q) => p.a.y + (p.dy || 0) - (q.a.y + (q.dy || 0)));
    let floor = 56;
    for (const l of group) {
      const el = document.createElement('div');
      el.className = `label ${side}`;
      el.innerHTML = l.html;
      if (l.width) el.style.width = `${l.width}px`;
      panel.appendChild(el);
      const h = el.getBoundingClientRect().height;
      let y = Math.max(floor, l.a.y + (l.dy || 0) - h / 2);
      y = Math.min(y, height - h - 12);
      floor = y + h + 14;
      el.style.top = `${y}px`;
      const w = el.getBoundingClientRect().width;
      if (side === 'left') el.style.left = `${l.x}px`;
      else el.style.left = `${l.x}px`;
      const tx = side === 'left' ? l.x + w + 8 : l.x - 8;
      const ty = y + Math.min(h / 2, 11);
      const elbow = side === 'left' ? tx + 16 : tx - 16;
      svgEl(svg, 'polyline', { points: `${tx},${ty} ${elbow},${ty} ${l.a.x},${l.a.y}`, fill: 'none', stroke: l.color || color, 'stroke-width': 1.4, opacity: 0.9 });
      svgEl(svg, 'circle', { cx: l.a.x, cy: l.a.y, r: 3.6, fill: l.color || color, stroke: '#10151b', 'stroke-width': 1.5 });
    }
  }
}

function bracket(panel, cam, width, height, a, b, x, text, color = '#9aa8b6') {
  const svg = svgFor(panel);
  const p = toScreen(a, cam, width, height);
  const q = toScreen(b, cam, width, height);
  svgEl(svg, 'path', { d: `M ${x - 8} ${p.y} H ${x} V ${q.y} H ${x - 8}`, fill: 'none', stroke: color, 'stroke-width': 1.6 });
  const t = svgEl(svg, 'text', { x: x + 14, y: (p.y + q.y) / 2, fill: color, 'font-size': 12.5, 'font-weight': 700, 'letter-spacing': '0.16em', 'text-anchor': 'middle', transform: `rotate(90 ${x + 14} ${(p.y + q.y) / 2})`, 'font-family': 'Inter', stroke: '#18212a', 'stroke-width': 7, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
  t.textContent = text;
}

function dimension(panel, cam, width, height, a, b, offsetPx, text, vertical = true) {
  const svg = svgFor(panel);
  const p = toScreen(a, cam, width, height);
  const q = toScreen(b, cam, width, height);
  const c = '#9aa8b6';
  if (vertical) {
    const x = Math.max(p.x, q.x) + offsetPx;
    svgEl(svg, 'line', { x1: p.x + 6, y1: p.y, x2: x + 6, y2: p.y, stroke: c, 'stroke-width': 0.8, opacity: 0.6 });
    svgEl(svg, 'line', { x1: q.x + 6, y1: q.y, x2: x + 6, y2: q.y, stroke: c, 'stroke-width': 0.8, opacity: 0.6 });
    svgEl(svg, 'line', { x1: x, y1: p.y, x2: x, y2: q.y, stroke: c, 'stroke-width': 1.2, 'marker-start': 'url(#arr)', 'marker-end': 'url(#arr)' });
    const t = svgEl(svg, 'text', { x: x + 8, y: (p.y + q.y) / 2 + 4, class: 'dim' });
    t.textContent = text;
  } else {
    const y = Math.min(p.y, q.y) - offsetPx;
    svgEl(svg, 'line', { x1: p.x, y1: y, x2: q.x, y2: y, stroke: c, 'stroke-width': 1.2, 'marker-start': 'url(#arr)', 'marker-end': 'url(#arr)' });
    const t = svgEl(svg, 'text', { x: (p.x + q.x) / 2, y: y - 7, class: 'dim', 'text-anchor': 'middle' });
    t.textContent = text;
  }
}

function arrowDefs(panel) {
  const svg = svgFor(panel);
  const defs = svgEl(svg, 'defs', {});
  const m = document.createElementNS(SVG_NS, 'marker');
  for (const [k, v] of Object.entries({ id: 'arr', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' })) m.setAttribute(k, v);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M 0 1 L 9 5 L 0 9 z');
  path.setAttribute('fill', '#9aa8b6');
  m.appendChild(path);
  defs.appendChild(m);
}

function shadowBlob(scene, y, radius, opacity = 0.45) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  scene.add(m);
}

// ------------------------------------------------------------------ 1 ---
{
  const panel = document.getElementById('hero');
  arrowDefs(panel);
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  scene.add(assembly());
  shadowBlob(scene, FRAME_BOTTOM - 14, 90, 0.5);
  const target = S(-4, 0, 30);
  const cam = camera(width, height, target, [-0.5, -1, 0.36], 1150, 23);
  cam.setViewOffset(width, height, 20, -4, width, height);
  renderer.render(scene, cam);
  const R = 470;
  const L = 22;
  callouts(panel, cam, width, height, [
    { side: 'right', x: R, anchor: S(6, -10, 199), html: 'M8 threaded rod inside<small>Clamps the handle onto the frame</small>', width: 280 },
    { side: 'right', x: R, anchor: S(13, -10, 120), html: '<span class="k">Both hands on a real bat handle</span><small>30 × 33 mm, 200 mm long. Fits a standard cricket bat rubber grip.</small>', width: 280 },
    { side: 'right', x: R, anchor: S(12, -14, -24), html: 'Buttons right under your <span class="g">bottom thumb</span><small><b>A/X</b> = Run · <b>B/Y</b> = Go back · <b>thumbstick</b> click or flick = Dive</small>', width: 280, color: '#3ddc84' },
    { side: 'right', x: R, anchor: S(19, -26, -132), html: 'Heel cup<small>Rock the base in. Swinging pushes the controller down into it.</small>', width: 280, dy: 20 },
    { side: 'left', x: L, anchor: S(-10, -26, -18), html: 'Faceplate faces up and toward the face<small>so the headset can see its tracking LEDs</small>', width: 200 },
    { side: 'left', x: L, anchor: S(-30, -24, -55), html: '<b>FACE</b> side = the hitting face of the virtual bat', width: 200 },
    { side: 'left', x: L, anchor: S(-14, -34, -104), html: 'One strap<small>through the side spine and round the grip</small>', width: 200 },
  ]);
  bracket(panel, cam, width, height, S(0, 0, 196), S(0, 0, 104), 238, 'TOP HAND', '#ff8a3d');
  bracket(panel, cam, width, height, S(0, 0, 98), S(0, 0, 6), 238, 'BOTTOM HAND', '#3ddc84');
  const n = document.createElement('div');
  n.className = 'note';
  n.style.cssText = 'left: 22px; bottom: 22px; width: 300px; line-height: 1.45;';
  n.innerHTML = '<b style="color:#f1f4f7">One controller</b>, like the iB Cricket-style bats. Put the other one down while you bat.';
  panel.appendChild(n);
}

// ------------------------------------------------------------------ 2 ---
{
  const panel = document.getElementById('cut');
  arrowDefs(panel);
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  // both parts as they sit on the print plate (SCAD z up)
  const plate = new THREE.Group();
  plate.rotation.x = -Math.PI / 2;
  const h = new THREE.Mesh(handleGeo, mats.handle);
  h.position.set(-70, 0, 0);
  const f = new THREE.Mesh(framePrintGeo, mats.frame);
  f.position.set(-20, -10, 0);
  plate.add(h, f);
  scene.add(plate);
  shadowBlob(scene, -1, 170, 0.35);
  const target = new THREE.Vector3(10, 70, 0);
  const cam = camera(width, height, target, [0.3, -1, 0.5], 760, 24);
  cam.setViewOffset(width, height, -10, -20, width, height);
  renderer.render(scene, cam);
  dimension(panel, cam, width, height, new THREE.Vector3(-52, HANDLE_LEN, 0), new THREE.Vector3(-52, 0, 0), 4, `${HANDLE_LEN} mm`);
  const fb = new THREE.Box3().setFromObject(f);
  dimension(panel, cam, width, height, new THREE.Vector3(fb.min.x, fb.max.y, fb.max.z), new THREE.Vector3(fb.max.x, fb.max.y, fb.max.z), 18, `${(fb.max.x - fb.min.x).toFixed(0)} mm`, false);
  const note = (html, css) => {
    const n = document.createElement('div');
    n.className = 'note';
    n.style.cssText = css;
    n.innerHTML = html;
    panel.appendChild(n);
  };
  note('<b style="color:#f1f4f7">Handle</b><br/>prints standing,<br/>knob down', 'left: 24px; top: 150px; width: 120px;');
  note('<b style="color:#f1f4f7">Frame</b><br/>prints lying on its flat spine,<br/>so the layers run along it', 'right: 22px; top: 70px; width: 200px; text-align: right;');
  note('Both parts: PETG, <b style="color:#f1f4f7">no supports</b>', 'right: 22px; bottom: 16px; text-align: right;');
}

// ------------------------------------------------------------------ 3 ---
{
  const panel = document.getElementById('explode');
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  scene.add(assembly({ handle: false, ctrl: { tiltDeg: 24, lift: 3 }, strap: false }));
  const target = S(8, 0, -72);
  const cam = camera(width, height, target, [-0.35, -1, 0.3], 560, 26);
  cam.setViewOffset(width, height, 118, -10, width, height);
  renderer.render(scene, cam);
  const svg = svgFor(panel);
  const a = toScreen(S(52, -14, -30), cam, width, height);
  const b = toScreen(S(18, -14, -20), cam, width, height);
  svgEl(svg, 'path', { d: `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 30} ${b.x} ${b.y}`, fill: 'none', stroke: '#ff8a3d', 'stroke-width': 2.4, 'stroke-dasharray': '6 5' });
  svgEl(svg, 'circle', { cx: b.x, cy: b.y, r: 4.5, fill: '#ff8a3d' });
  callouts(panel, cam, width, height, [
    { side: 'right', x: 266, anchor: S(30, -20, -128), html: '<span class="k">1</span> Base into the heel cup, tilted out', width: 215, dy: 10 },
    { side: 'right', x: 266, anchor: S(52, -14, -30), html: '<span class="k">2</span> Swing it upright, trigger to the back, faceplate toward FACE', width: 215, dy: -24 },
    { side: 'right', x: 266, anchor: S(-22, -24, -104), html: '<span class="k">3</span> Strap through the spine slot, wrap it round the grip', width: 215 },
  ]);
}

// ------------------------------------------------------------------ 4 ---
{
  const panel = document.getElementById('game');
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  scene.add(assembly());
  // Virtual bat in the bat frame (metres): bat +Y = SCAD +Z, +Z (face) = SCAD -Y,
  // origin on the axis at the shoulder line, so it lines up with three's axes.
  const bat = createBatMesh({ sweetSpot: true });
  bat.scale.setScalar(1000);
  for (const name of ['blade', 'handle', 'grip']) {
    const m = bat.getObjectByName(name);
    m.material = m.material.clone();
    m.material.transparent = true;
    m.material.opacity = name === 'blade' ? 0.72 : 0.18;
    m.material.depthWrite = false;
  }
  bat.getObjectByName('sweet-spot').material.opacity = 0.95;
  scene.add(bat);
  shadowBlob(scene, BAT_SPEC.toe * 1000 - 8, 130, 0.4);
  const midY = ((BAT_SPEC.handleTop + BAT_SPEC.toe) / 2) * 1000;
  const cam = camera(width, height, new THREE.Vector3(0, midY, 0), [0.55, -1, 0.2], 2600, 24);
  cam.setViewOffset(width, height, -92, 4, width, height);
  renderer.render(scene, cam);
  callouts(panel, cam, width, height, [
    { side: 'left', x: 20, anchor: new THREE.Vector3(-10, 130, 12), html: 'Your printed handle<small>is the bat handle in the game</small>', width: 190 },
    { side: 'left', x: 20, anchor: new THREE.Vector3(-34, -60, 10), html: 'The controller sits in the top of the blade', width: 190 },
    { side: 'left', x: 20, anchor: new THREE.Vector3(0, SWEET_SPOT_Y * 1000, 22), html: '<span class="g">Sweet spot</span>, 17 cm from the toe<small>Crisp, light haptic tap. The toe and edges buzz hard.</small>', width: 190, color: '#3ddc84' },
    { side: 'left', x: 20, anchor: new THREE.Vector3(30, BAT_SPEC.toe * 1000 + 30, 22), html: '85 cm short-handle bat<small>Ball reacts as if hit by 1.18 kg of willow, at your real swing speed</small>', width: 190 },
  ]);
}

window.__ready = true;
