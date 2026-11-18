// Renders the design sheet (tools/design-sheet.html) from the exported STLs.
// Run `npm run render-design`; it screenshots this page to
// hardware/bat-handle/renders/design-sheet.png.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBatMesh } from '../src/bat/batModel.js';
import { MOUNT, BAT_SPEC, SWEET_SPOT_Y } from '../src/bat/batSpec.js';

const Z_TOP_BASE = MOUNT.junctionZ + MOUNT.topBase; // top controller's grip bottom (SCAD z)
const Z_BOT_BASE = MOUNT.junctionZ + MOUNT.bottomBase; // bottom controller's grip bottom
const H = MOUNT.bodyHeight;

const COLORS = {
  body: 0xf07a2c,
  cap: 0xffc29a,
  strap: 0x1b1d21,
  shell: 0xe6e9ed,
  controls: 0x2b2f35,
};

// SCAD (x, y, z) in mm -> three.js world (x, z, -y)
const S = (x, y, z) => new THREE.Vector3(x, z, -y);

async function loadStl(url) {
  const geo = new STLLoader().parse(await (await fetch(url)).arrayBuffer());
  return toCreasedNormals(geo, THREE.MathUtils.degToRad(28));
}

const [bodyGeo, proxyGeo, controlsGeo, strapGeo] = await Promise.all([
  loadStl('/hardware/bat-handle/stl/bat_handle_body.stl'),
  loadStl('/tools/.render-cache/proxy_right.stl'),
  loadStl('/tools/.render-cache/proxy_right_controls.stl'),
  loadStl('/tools/.render-cache/strap_bands.stl'),
]);

const mats = {
  body: new THREE.MeshPhysicalMaterial({ color: COLORS.body, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
  strap: new THREE.MeshStandardMaterial({ color: COLORS.strap, roughness: 0.95 }),
  shell: new THREE.MeshPhysicalMaterial({ color: COLORS.shell, roughness: 0.38, clearcoat: 0.3 }),
  controls: new THREE.MeshStandardMaterial({ color: COLORS.controls, roughness: 0.45 }),
};

function controller({ mirror = false }) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(proxyGeo, mats.shell), new THREE.Mesh(controlsGeo, mats.controls));
  if (mirror) g.scale.y = -1;
  return g;
}

// The assembly in SCAD coordinates, wrapped so that SCAD +Z is three +Y.
function assembly({ explodeTop = 0, explodeBottom = 0, clip = null, straps = true } = {}) {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  const bodyMat = clip ? mats.body.clone() : mats.body;
  if (clip) bodyMat.clippingPlanes = [clip];
  root.add(new THREE.Mesh(bodyGeo, bodyMat));
  if (clip) {
    const capMat = new THREE.MeshBasicMaterial({ color: COLORS.cap, side: THREE.BackSide, clippingPlanes: [clip] });
    root.add(new THREE.Mesh(bodyGeo, capMat));
  }
  if (straps) {
    const strapMat = clip ? mats.strap.clone() : mats.strap;
    if (clip) strapMat.clippingPlanes = [clip];
    root.add(new THREE.Mesh(strapGeo, strapMat));
  }
  if (explodeTop !== null) {
    // right-handed batter: left controller on top, upside down (= right one mirrored)
    const top = controller({ mirror: true });
    top.position.z = Z_TOP_BASE + explodeTop;
    root.add(top);
  }
  if (explodeBottom !== null) {
    const bottom = controller({});
    bottom.rotation.x = Math.PI;
    bottom.position.z = Z_BOT_BASE - explodeBottom;
    root.add(bottom);
  }
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
  shadowBlob(scene, -112, 70, 0.5);
  const target = S(0, 0, 26);
  const cam = camera(width, height, target, [-0.85, -1.0, 0.28], 880, 23);
  cam.setViewOffset(width, height, 70, 0, width, height);
  renderer.render(scene, cam);
  const R = 512;
  const L = 22;
  callouts(panel, cam, width, height, [
    { side: 'left', x: L, anchor: S(-14, 0, 150), html: '<span class="k">Top-hand controller</span> sits upside down<small>Its faceplate, where the tracking LEDs are, faces up at the headset like the knob of a bat</small>', width: 210 },
    { side: 'left', x: L, anchor: S(-18, 0, -70), html: '<span class="g">Bottom-hand controller</span>, held normally<small>Thumb on <b>A</b> = Run, <b>B</b> = Go back</small>', width: 210, color: '#3ddc84' },
    { side: 'right', x: R, anchor: S(12, -21, 74), html: 'Hook-and-loop strap<small>Squeezes the slotted rim onto the grip. Open it and the controller slides out.</small>', width: 250 },
    { side: 'right', x: R, anchor: S(16, -19, 55), html: 'Top hand grips the printed sleeve<small>Oval, about 44 × 49 mm, like a bat handle with two grips</small>', width: 250 },
    { side: 'right', x: R, anchor: S(3, -21.6, 41), html: 'Lanyard window<small>Clip the wrist straps on for safety</small>', width: 250 },
    { side: 'right', x: R, anchor: S(12, -19, 11), html: 'Second strap locks the base cup', width: 250 },
    { side: 'right', x: R, anchor: S(27, 0, -37), html: 'Index finger on the <b>trigger</b> = Dive<small>Only counts while you are running. Ignored mid-swing.</small>', width: 250, color: '#3ddc84' },
  ]);
  bracket(panel, cam, width, height, S(0, 0, 86), S(0, 0, 3), 452, 'TOP HAND', '#ff8a3d');
  bracket(panel, cam, width, height, S(0, 0, -3), S(0, 0, -88), 452, 'BOTTOM HAND', '#3ddc84');
}

// ------------------------------------------------------------------ 2 ---
{
  const panel = document.getElementById('cut');
  arrowDefs(panel);
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  // keep the half with SCAD y < 0 (three z > 0) and look into it from SCAD +y
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  scene.add(assembly({ explodeTop: null, explodeBottom: null, clip }));
  const target = S(0, 0, H / 2 - 2);
  const cam = camera(width, height, target, [0.42, 1, 0.38], 262, 30);
  cam.setViewOffset(width, height, -70, -6, width, height);
  renderer.render(scene, cam);
  callouts(panel, cam, width, height, [
    { side: 'left', x: 18, anchor: S(23.4, 0, 76), html: 'Slotted rim + strap groove<small>6 fingers flex in to clamp the grip</small>', width: 170 },
    { side: 'left', x: 18, anchor: S(19.6, 0, 56), html: 'Line both cavities with 1.5 mm EVA foam', width: 170 },
    { side: 'left', x: 18, anchor: S(15, 0, 35.4), html: '<span class="k">Ledge</span>: both controller bases stop here', width: 170 },
    { side: 'left', x: 18, anchor: S(17.6, 0, 30), html: '45° seat: <b>no supports</b>', width: 170, dy: 18 },
  ]);
  dimension(panel, cam, width, height, S(-24, 0, H), S(-24, 0, 0), 34, `${H.toFixed(1)} mm`);
  dimension(panel, cam, width, height, S(24.3, 0, H), S(-24.3, 0, H), 22, `${MOUNT.outerAtTopRim[0].toFixed(1)} mm`, false);
  const n = document.createElement('div');
  n.className = 'note';
  n.style.cssText = 'right: 22px; bottom: 16px; text-align: right;';
  n.innerHTML = 'Prints standing on the bottom rim<br/>one piece, about 30 g PETG';
  panel.appendChild(n);
}

// ------------------------------------------------------------------ 3 ---
{
  const panel = document.getElementById('explode');
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  scene.add(assembly({ explodeTop: 70, explodeBottom: 62 }));
  const target = S(0, 0, 22);
  const cam = camera(width, height, target, [1, -0.42, 0.2], 1100, 24);
  cam.setViewOffset(width, height, 135, -8, width, height);
  renderer.render(scene, cam);
  const svg = svgFor(panel);
  const arrow = (from, to, color) => {
    const a = toScreen(from, cam, width, height);
    const b = toScreen(to, cam, width, height);
    svgEl(svg, 'line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': 2.4, 'stroke-dasharray': '6 5' });
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const s = 9;
    svgEl(svg, 'path', { d: `M ${b.x} ${b.y} L ${b.x - s * Math.cos(ang - 0.45)} ${b.y - s * Math.sin(ang - 0.45)} L ${b.x - s * Math.cos(ang + 0.45)} ${b.y - s * Math.sin(ang + 0.45)} Z`, fill: color });
  };
  arrow(S(0, 34, 128), S(0, 34, 78), '#ff8a3d');
  arrow(S(0, 34, -78), S(0, 34, -28), '#3ddc84');
  callouts(panel, cam, width, height, [
    { side: 'right', x: 222, anchor: S(30, 0, 120), html: '<span class="k">1</span> Top-hand controller goes in grip first, upside down', width: 250 },
    { side: 'right', x: 222, anchor: S(25.6, 0, 50), html: '<span class="k">2</span> Both triggers face the <b>TRIGGER ▲</b> mark', width: 250 },
    { side: 'right', x: 222, anchor: S(24, 0, 12), html: '<span class="k">3</span> Strap both rims tight', width: 250, dy: 8 },
    { side: 'right', x: 222, anchor: S(22, 0, -58), html: '<span class="g">4</span> Push the bottom-hand controller\'s base up into the cup', width: 250, color: '#3ddc84' },
  ]);
}

// ------------------------------------------------------------------ 4 ---
{
  const panel = document.getElementById('game');
  const { renderer, width, height } = makeRenderer(panel);
  const scene = stage(renderer);
  scene.add(assembly());
  // Virtual bat in the bat frame (metres): bat +Y = SCAD +Z, +Z (face) = SCAD -Y,
  // origin at the junction. Shown as it would be for a right-handed batter.
  const bat = createBatMesh({ sweetSpot: true });
  bat.scale.setScalar(1000);
  bat.position.y = MOUNT.junctionZ;
  for (const name of ['handle', 'grip']) {
    const m = bat.getObjectByName(name);
    m.material = m.material.clone();
    m.material.transparent = true;
    m.material.opacity = 0.22;
    m.material.depthWrite = false;
  }
  const sweet = bat.getObjectByName('sweet-spot');
  sweet.material.opacity = 0.95;
  scene.add(bat);
  shadowBlob(scene, BAT_SPEC.toe * 1000 + MOUNT.junctionZ - 8, 120, 0.4);
  const midY = ((BAT_SPEC.handleTop + BAT_SPEC.toe) / 2) * 1000 + MOUNT.junctionZ;
  const target = new THREE.Vector3(0, midY + 10, 0);
  const cam = camera(width, height, target, [0.55, -1, 0.16], 2650, 24);
  cam.setViewOffset(width, height, -92, 4, width, height);
  renderer.render(scene, cam);
  const J = MOUNT.junctionZ;
  callouts(panel, cam, width, height, [
    { side: 'left', x: 20, anchor: new THREE.Vector3(-24, J + 40, 0), html: 'Your printed handle and controllers<small>The virtual handle is drawn around them</small>', width: 190 },
    { side: 'left', x: 20, anchor: new THREE.Vector3(-50, BAT_SPEC.shoulder * 1000 + J - 40, 22), html: 'Virtual blade starts just below your bottom hand', width: 190 },
    { side: 'left', x: 20, anchor: new THREE.Vector3(0, SWEET_SPOT_Y * 1000 + J, 22), html: '<span class="g">Sweet spot</span>, 17 cm from the toe<small>Crisp, light haptic tap. The toe and edges buzz hard.</small>', width: 190, color: '#3ddc84' },
    { side: 'left', x: 20, anchor: new THREE.Vector3(30, BAT_SPEC.toe * 1000 + J + 30, 22), html: '84 cm short-handle bat<small>Ball reacts as if hit by 1.18 kg of willow, at your real swing speed</small>', width: 190 },
  ]);
  const n = document.createElement('div');
  n.className = 'note';
  n.style.cssText = 'left: 20px; bottom: 22px; width: 200px; line-height: 1.4;';
  n.innerHTML = 'Both controllers are fused into one rigid bat. If one is blocked, the other keeps tracking.';
  panel.appendChild(n);
}

window.__ready = true;
