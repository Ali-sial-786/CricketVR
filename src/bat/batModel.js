// Procedural cricket bat mesh in the bat frame (see batSpec.js).
// Works in Node (no textures) and in the browser (adds wood grain + grip texture).
import * as THREE from 'three';
import { BAT_SPEC, SWEET_SPOT_Y } from './batSpec.js';

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

// Blade cross-section numbers at s in [0, 1] (0 = shoulder, 1 = toe).
function bladeStation(s, spec) {
  const W = spec.bladeWidth;
  const len = spec.bladeLength;
  const d = (1 - s) * len; // distance from the toe
  // Sloped shoulders: the blade reaches full width about 5 cm below the splice
  let w = W * (0.5 + 0.5 * smooth(s / 0.09));
  // Rounded toe corners
  const r = 0.014;
  if (d < r) w = W - 2 * (r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));
  const edge = 0.024 + (spec.edgeThickness - 0.024) * smooth(s / 0.35) - 0.006 * smooth((s - 0.93) / 0.07);
  // Spine (the hump on the back) peaks around the sweet spot
  const peak = 1 - spec.sweetSpotFromToe / len;
  const bump = Math.exp(-((s - peak) ** 2) / (2 * 0.2 ** 2));
  const spine = 0.034 + (spec.spineThickness - 0.034) * bump - 0.008 * smooth((s - 0.9) / 0.1);
  return { w, edge, spine: Math.max(spine, edge + 0.004) };
}

function bladeRing(st, faceZ) {
  const pts = [];
  const half = st.w / 2;
  const NF = 22;
  const NE = 7;
  const faceAt = (u) => faceZ - 0.0022 * u * u; // slight bow across the face
  const backAt = (u) => faceZ - (st.edge + (st.spine - st.edge) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.2)), 1.25));
  for (let i = 0; i <= NF; i++) {
    const u = -1 + (2 * i) / NF;
    pts.push([u * half, faceAt(u)]);
  }
  const edgeArc = (sign) => {
    const z0 = faceAt(sign);
    const z1 = backAt(sign);
    for (let k = 1; k < NE; k++) {
      const a = (k / NE) * Math.PI;
      const zc = (z0 + z1) / 2;
      const rz = (z0 - z1) / 2;
      pts.push([sign * (half + Math.sin(a) * Math.min(0.006, rz * 0.35)), zc + Math.cos(a) * rz]);
    }
  };
  edgeArc(1);
  for (let i = NF; i >= 0; i--) {
    const u = -1 + (2 * i) / NF;
    pts.push([u * half, backAt(u)]);
  }
  edgeArc(-1);
  return pts;
}

export function buildBladeGeometry(spec = BAT_SPEC) {
  const stations = 70;
  const rings = [];
  for (let j = 0; j <= stations; j++) {
    // denser sampling near the shoulder and the toe
    const t = j / stations;
    const s = t < 0.12 ? (t / 0.12) * 0.12 : t;
    rings.push({ y: spec.shoulder - s * spec.bladeLength, pts: bladeRing(bladeStation(s, spec), spec.faceZ) });
  }
  const n = rings[0].pts.length;
  const pos = [];
  const uv = [];
  const idx = [];
  rings.forEach((ring, j) => {
    ring.pts.forEach(([x, z], i) => {
      pos.push(x, ring.y, z);
      uv.push(i / (n - 1), j / stations);
    });
  });
  for (let j = 0; j < stations; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  // caps: shoulder top and toe
  for (const [j, flip] of [[0, false], [stations, true]]) {
    const ring = rings[j];
    let cx = 0;
    let cz = 0;
    ring.pts.forEach(([x, z]) => { cx += x; cz += z; });
    const center = pos.length / 3;
    pos.push(cx / n, ring.y, cz / n);
    uv.push(0.5, j / stations);
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      if (flip) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildHandleGeometry(spec = BAT_SPEC) {
  // Cane handle (lathe around Y), slightly fatter where it enters the blade
  const pts = [];
  const y0 = spec.shoulder - 0.05;
  const y1 = spec.handleTop;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    const flare = 0.006 * (1 - smooth((y - spec.shoulder) / 0.06));
    let r = spec.handleRadius + flare;
    const top = y1 - y;
    if (top < 0.006) r *= Math.sqrt(Math.max(0.02, top / 0.006));
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 40);
}

export function buildGripGeometry(spec = BAT_SPEC) {
  // Rubber grip with shallow ribs, from just above the splice to the top
  const pts = [];
  const y0 = spec.shoulder + 0.045;
  const y1 = spec.handleTop - 0.001;
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    let r = spec.gripRadius + 0.0005 * Math.cos(((y - y0) / 0.009) * Math.PI * 2);
    if (i === 0) r = spec.handleRadius;
    const top = y1 - y;
    if (top < 0.007) r = spec.handleRadius + (r - spec.handleRadius) * Math.sqrt(Math.max(0, top / 0.007)) + 0.0004;
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 48);
}

function woodTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#e8cfa0';
  g.fillRect(0, 0, c.width, c.height);
  // straight willow grain along the blade
  for (let i = 0; i < 70; i++) {
    const x = (i / 70) * c.width + Math.random() * 3;
    g.strokeStyle = `rgba(150, 105, 55, ${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= c.height; y += 64) g.lineTo(x + Math.sin(y * 0.01 + i) * 1.5, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Returns a Group in the bat frame. Options:
//   sweetSpot: show a faint marker where the sweet spot is
//   gripColor: rubber grip colour
export function createBatMesh({ sweetSpot = false, gripColor = 0x9b1b1f } = {}) {
  const group = new THREE.Group();
  group.name = 'cricket-bat';
  const wood = woodTexture();
  const blade = new THREE.Mesh(
    buildBladeGeometry(),
    new THREE.MeshStandardMaterial({ color: wood ? 0xffffff : 0xe8cfa0, map: wood, roughness: 0.55, metalness: 0 }),
  );
  blade.name = 'blade';
  const handle = new THREE.Mesh(buildHandleGeometry(), new THREE.MeshStandardMaterial({ color: 0xd9bf8c, roughness: 0.6 }));
  handle.name = 'handle';
  const grip = new THREE.Mesh(buildGripGeometry(), new THREE.MeshStandardMaterial({ color: gripColor, roughness: 0.85 }));
  grip.name = 'grip';
  group.add(blade, handle, grip);
  if (sweetSpot) {
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(0.028, 0.034, 40),
      new THREE.MeshBasicMaterial({ color: 0x2bd47a, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    mark.position.set(0, SWEET_SPOT_Y, BAT_SPEC.faceZ + 0.0008);
    mark.name = 'sweet-spot';
    group.add(mark);
  }
  return group;
}
