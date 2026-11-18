// CricketVR nets: try the printed bat handle against a bowling machine.
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BatRig } from '../bat/batRig.js';
import { createBatMesh } from '../bat/batModel.js';
import { BatInput } from '../bat/batInput.js';
import { impactHaptics } from '../bat/batPhysics.js';
import { Ball, solveDelivery, predictCrossing } from './ball.js';
import { createWorld, PITCH, lineX } from './world.js';
import { Hud } from './hud.js';
import { AutoBatter } from './sim.js';

// ------------------------------------------------------------ settings --
const DEFAULTS = { hand: 'auto', speed: 120, roll: 0, pitch: 0, offset: 0, sweet: false, ghosts: false };
const settings = { ...DEFAULTS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('cricketvr.settings') || '{}'));
} catch {
  /* private mode: defaults */
}
const save = () => {
  try {
    localStorage.setItem('cricketvr.settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
};
const params = new URLSearchParams(location.search);
if (params.has('hand')) settings.hand = params.get('hand');

const battingHand = () => (settings.hand === 'left' ? 'left' : settings.hand === 'right' ? 'right' : rig?.battingHand || 'right');

// --------------------------------------------------------------- scene --
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 800);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let rig = null;
const world = createWorld(scene, 'right');
const bat = createBatMesh({ sweetSpot: true });
bat.matrixAutoUpdate = false;
scene.add(bat);
const sweetMark = bat.getObjectByName('sweet-spot');

const ghostMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.4 });
const ghosts = {};
for (const hand of ['left', 'right']) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.038, 0.125), ghostMat);
  body.position.z = -0.022; // grip origin sits about 40 mm above the grip bottom
  g.add(body, new THREE.AxesHelper(0.05));
  g.visible = false;
  scene.add(g);
  ghosts[hand] = g;
}

const ball = new Ball(scene);
const hud = new Hud(scene);
const autoBatter = new AutoBatter('right');

rig = new BatRig({
  battingHand: settings.hand === 'left' ? 'left' : 'right',
  autoHand: settings.hand === 'auto',
  trims: { rollDeg: settings.roll, pitchDeg: settings.pitch, offsetMm: settings.offset },
  onHandDetected: (hand) => {
    applyHand(hand);
    hud.set({ status: `Detected a ${hand}-handed batter` });
  },
});

function applyHand(hand) {
  world.setBattingHand(hand);
  hud.place(hand);
  autoBatter.setHand(hand);
  placeDesktopCamera(hand);
}

function placeDesktopCamera(hand) {
  // side-on view from the off side, like a broadcast camera at point
  const side = hand === 'left' ? -1 : 1;
  camera.position.set(lineX(hand) + 3.4 * side, 1.3, -0.4);
  controls.target.set(lineX(hand), 0.8, -1.0);
  controls.update();
}
applyHand(battingHand());

// ------------------------------------------------------------- runner --
const runner = { running: false, progress: 0, runTime: 3.2, ballRuns: 0 };
function scoreRun() {
  runner.ballRuns += 1;
  hud.set({ runs: hud.state.runs + 1 });
}
function onAction(action) {
  if (action === 'run') {
    if (!runner.running) {
      runner.running = true;
      runner.progress = 0;
      hud.set({ headline: 'RUN!', detail: 'Trigger to dive for the crease', running: 0.001 });
    }
  } else if (action === 'back') {
    if (runner.running && runner.progress < 0.5) {
      runner.running = false;
      hud.set({ headline: 'GO BACK!', detail: 'Run called off', running: 0 });
    } else if (runner.running) hud.set({ detail: 'Too late to turn back - keep running!' });
  } else if (action === 'dive') {
    if (!runner.running) return;
    if (runner.progress > 0.72) {
      runner.running = false;
      scoreRun();
      hud.set({ headline: 'DIVE - SAFE!', detail: 'Stretched in just in time', running: 0 });
    } else hud.set({ detail: 'Dived too early!' });
  }
}
const input = new BatInput({ onAction });

// ------------------------------------------------------------ bowling --
let nextBallAt = 1.5;
let tNow = 0;
function bowl() {
  const hand = battingHand();
  const release = world.releasePoint(hand);
  const length = THREE.MathUtils.randFloat(4.5, 7.2);
  const line = lineX(hand) + THREE.MathUtils.randFloatSpread(0.22);
  const bounceAt = new THREE.Vector3(line, 0, PITCH.stumpsZ - length);
  const speed = (settings.speed / 3.6) * THREE.MathUtils.randFloat(0.95, 1.03);
  ball.bowl(release, solveDelivery(release, bounceAt, speed), lineX(hand));
  hud.set({ balls: hud.state.balls + 1, headline: `${Math.round(speed * 3.6)} km/h`, detail: length > 6.2 ? 'Good length' : 'Full and straight', running: 0 });
  runner.running = false;
  runner.ballRuns = 0;
  if (!renderer.xr.isPresenting) {
    const crossing = predictCrossing(ball, -0.05, lineX(hand));
    if (crossing) autoBatter.planShot(tNow, crossing, lineX(hand));
  }
}

const REGION_TEXT = {
  sweet: 'MIDDLED IT!',
  middle: 'Good contact',
  toe: 'Off the toe',
  shoulder: 'Off the shoulder',
  handle: 'Jammed on the handle',
};

const events = [];
if (params.has('debug')) window.__cvr = { hud, ball, rig, events, settings };

function onBallEvent(ev, sources) {
  if (!ev) return;
  if (params.has('debug')) events.push({ t: tNow, type: ev.type, region: ev.impact?.quality.region, edge: ev.impact?.quality.edge, exit: ev.impact?.exitSpeed, bat: ev.batSpeed, carry: ev.carry, dist: ev.distance });
  if (ev.type === 'hit') {
    const q = ev.impact.quality;
    const kmh = Math.round(ev.impact.exitSpeed * 3.6);
    const headline = q.back ? 'Off the back!' : q.edge ? 'EDGED!' : REGION_TEXT[q.region];
    hud.set({ headline, detail: `${kmh} km/h off the bat  -  bat speed ${Math.round(ev.batSpeed * 3.6)} km/h`, flash: 0.3 });
    const h = impactHaptics(ev.impact);
    pulse(sources[rig.bottomHand], h.bottom);
    pulse(sources[rig.topHand], h.top);
    if (!renderer.xr.isPresenting) setTimeout(() => onAction('run'), 450);
  } else if (ev.type === 'landed') {
    hud.set({ detail: `${hud.state.detail.split('  -  ')[0]}  -  carried ${Math.round(ev.carry)} m` });
  } else if (ev.type === 'six' || ev.type === 'four') {
    // a boundary replaces the runs already run off this ball (unless more were run)
    const r = Math.max(0, (ev.type === 'six' ? 6 : 4) - runner.ballRuns);
    runner.running = false;
    hud.set({ runs: hud.state.runs + r, headline: ev.type === 'six' ? 'SIX!' : 'FOUR!', running: 0 });
    nextBallAt = tNow + 3;
  } else if (ev.type === 'bowled') {
    hud.set({ headline: 'BOWLED!', detail: 'Watch the ball onto the bat', running: 0 });
    nextBallAt = tNow + 3;
  } else if (ev.type === 'dead') {
    nextBallAt = tNow + (runner.running ? 3.5 : 2.2);
  }
}

function pulse(source, { intensity, duration }) {
  const act = source?.gamepad?.hapticActuators?.[0];
  if (act?.pulse) act.pulse(intensity, duration);
}

// ---------------------------------------------------------------- loop --
let lastMs = null;
const pose = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), emulatedPosition: false });
const xrPoses = { left: pose(), right: pose() };

// One simulation step. The ball is advanced over the same interval the bat
// moved through (rig.prevPose -> rig.pose), then a new ball may be bowled.
function step(dt, poses, sources, timeMs) {
  tNow += dt;
  rig.update(poses, dt);

  const bottomPad = sources[rig.bottomHand]?.gamepad || null;
  input.update(bottomPad, { timeMs, batAngularSpeed: rig.angularVelocity.length(), running: runner.running });

  onBallEvent(ball.update(dt, rig.valid ? { prev: rig.prevPose, cur: rig.pose, rig } : null), sources);
  if ((ball.state === 'idle' || ball.state === 'dead') && tNow >= nextBallAt) bowl();

  if (runner.running) {
    runner.progress += dt / runner.runTime;
    if (!renderer.xr.isPresenting && runner.progress > 0.8 && runner.progress - dt / runner.runTime <= 0.8) onAction('dive');
    if (runner.progress >= 1) {
      runner.running = false;
      scoreRun();
      hud.set({ headline: 'Run completed', running: 0 });
    } else hud.set({ running: runner.progress });
  }
  if (hud.state.flash > 0) hud.set({ flash: Math.max(0, hud.state.flash - dt) });
}

renderer.setAnimationLoop((timeMs, frame) => {
  const dt = lastMs === null ? 1 / 72 : Math.min(0.1, (timeMs - lastMs) / 1000);
  lastMs = timeMs;

  let poses = {};
  const sources = {};
  if (frame) {
    // Headset: one step per XR frame with the real controller poses
    const ref = renderer.xr.getReferenceSpace();
    for (const src of frame.session.inputSources) {
      if (!src.gripSpace || (src.handedness !== 'left' && src.handedness !== 'right') || src.hand) continue;
      const p = frame.getPose(src.gripSpace, ref);
      sources[src.handedness] = src;
      if (!p) continue;
      const o = xrPoses[src.handedness];
      const t = p.transform;
      o.position.set(t.position.x, t.position.y, t.position.z);
      o.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      o.emulatedPosition = p.emulatedPosition;
      poses[src.handedness] = o;
    }
    step(Math.min(dt, 0.05), poses, sources, timeMs);
  } else {
    // Desktop preview: fixed 90 Hz sub-steps so a slow GPU can't spoil the timing
    const n = Math.max(1, Math.ceil(dt * 90));
    for (let i = 0; i < n; i++) {
      poses = autoBatter.controllerPoses(tNow + dt / n, lineX(battingHand()));
      step(dt / n, poses, sources, timeMs);
    }
  }

  bat.matrix.copy(rig.pose.matrix);
  bat.matrixWorldNeedsUpdate = true;
  bat.visible = rig.valid;
  sweetMark.visible = settings.sweet;
  for (const hand of ['left', 'right']) {
    const g = ghosts[hand];
    const p = poses[hand];
    g.visible = settings.ghosts && !!p;
    if (p) g.position.copy(p.position), g.quaternion.copy(p.quaternion);
  }

  let status = `Bat tracking: ${rig.valid ? rig.tracking : 'none'}`;
  if (rig.valid && rig.tracking === 'both') status += `  -  fit ${rig.disagreement.mm.toFixed(1)} mm`;
  if (!rig.inHandle) status = 'Controllers are not in the bat handle';
  else if (rig.disagreement.mm > 10) status = 'Check the straps: a controller has moved';
  if (status !== hud.state.status && !hud.state.status.startsWith('Detected')) hud.set({ status });
  hud.draw();

  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ UI --
document.getElementById('vr-slot').appendChild(VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] }));
renderer.xr.addEventListener('sessionstart', () => {
  ball.state = 'dead';
  ball.mesh.visible = false;
  nextBallAt = tNow + 4;
  hud.set({ runs: 0, balls: 0, headline: 'Take guard', detail: 'Stand side-on, bat in front of your toes' });
  if (settings.hand === 'auto') rig.redetectHand();
});

const $ = (id) => document.getElementById(id);
const bind = (id, key, fmt) => {
  const el = $(id);
  const out = $(`${id}-out`);
  const isBox = el.type === 'checkbox';
  if (isBox) el.checked = !!settings[key];
  else el.value = settings[key];
  const show = () => out && (out.textContent = fmt(settings[key]));
  show();
  el.addEventListener('input', () => {
    settings[key] = isBox ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    show();
    save();
    applySettings(key);
  });
};
bind('hand', 'hand', (v) => v);
bind('speed', 'speed', (v) => `${v} km/h`);
bind('roll', 'roll', (v) => `${v} deg`);
bind('pitch', 'pitch', (v) => `${v} deg`);
bind('offset', 'offset', (v) => `${v} mm`);
bind('sweet', 'sweet', () => '');
bind('ghosts', 'ghosts', () => '');

function applySettings(key) {
  if (key === 'hand') {
    rig.autoHand = settings.hand === 'auto';
    rig.setBattingHand(battingHand());
    applyHand(battingHand());
  }
  if (['roll', 'pitch', 'offset'].includes(key)) rig.setTrims({ rollDeg: settings.roll, pitchDeg: settings.pitch, offsetMm: settings.offset });
}

$('toggle').addEventListener('click', () => {
  const p = $('panel');
  const hidden = p.style.display === 'none';
  p.style.display = hidden ? '' : 'none';
  $('toggle').textContent = hidden ? 'Hide panel' : 'Show panel';
});
if (params.has('nopanel')) $('toggle').click();
$('status').textContent = navigator.xr ? '' : 'WebXR is not available here. Showing the desktop preview (scripted batter).';
