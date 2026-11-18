// Nets practice ground: sky, outfield, pitch, creases, stumps, bowling machine.
import * as THREE from 'three';

export const PITCH = Object.freeze({
  length: 20.12,
  width: 3.05,
  stumpsZ: 1.1, // batter's stumps, behind the batter (who stands at the origin)
  popping: 1.22,
  stumpHeight: 0.711,
  stumpsWidth: 0.2286,
  boundary: 65,
});

// Middle-stump line in x: the ball passes in front of a side-on batter.
export const lineX = (battingHand) => (battingHand === 'left' ? -0.36 : 0.36);

function skyDome() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x4f8fd6) }, bottom: { value: new THREE.Color(0xdfeaf2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  });
  return new THREE.Mesh(geo, mat);
}

function stripeTexture(a, b, stripes) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(0, (i * c.height) / stripes, c.width, c.height / stripes + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createStumps(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.5 });
  for (const dx of [-1, 0, 1]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, PITCH.stumpHeight, 16), mat);
    s.position.set(x + (dx * (PITCH.stumpsWidth - 0.036)) / 2, PITCH.stumpHeight / 2, z);
    g.add(s);
  }
  for (const dx of [-0.5, 0.5]) {
    const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 8), mat);
    bail.rotation.z = Math.PI / 2;
    bail.position.set(x + dx * 0.1, PITCH.stumpHeight + 0.008, z);
    g.add(bail);
  }
  return g;
}

export function createWorld(scene, battingHand = 'right') {
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);
  world.add(skyDome());

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x3b5a2a, 1.4);
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  sun.position.set(-6, 12, 4);
  world.add(hemi, sun);

  const grass = stripeTexture('#4f8a3a', '#5a9842', 24);
  if (grass) {
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(1, 1);
  }
  const outfield = new THREE.Mesh(
    new THREE.CircleGeometry(PITCH.boundary + 8, 96),
    new THREE.MeshStandardMaterial({ color: grass ? 0xffffff : 0x57923f, map: grass, roughness: 0.95 }),
  );
  outfield.rotation.x = -Math.PI / 2;
  outfield.position.z = PITCH.stumpsZ - PITCH.length / 2;
  world.add(outfield);

  const rope = new THREE.Mesh(
    new THREE.TorusGeometry(PITCH.boundary, 0.06, 6, 160),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
  );
  rope.rotation.x = -Math.PI / 2;
  rope.position.set(0, 0.04, 0);
  world.add(rope);

  const pitchGroup = new THREE.Group();
  world.add(pitchGroup);
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.width, PITCH.length + 2.4),
    new THREE.MeshStandardMaterial({ color: 0xc8b07a, roughness: 1 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.002;
  pitchGroup.add(strip);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const crease = (z, w = PITCH.width + 0.6) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.05), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.004, z);
    pitchGroup.add(m);
  };
  const farStumpsZ = PITCH.stumpsZ - PITCH.length;
  for (const sz of [PITCH.stumpsZ, farStumpsZ]) {
    const dir = sz > 0 ? -1 : 1;
    crease(sz, 2.64); // bowling crease
    crease(sz + dir * PITCH.popping); // popping crease
  }
  const stumpsNear = createStumps(0, PITCH.stumpsZ);
  const stumpsFar = createStumps(0, farStumpsZ);
  pitchGroup.add(stumpsNear, stumpsFar);

  // Bowling machine at the far end
  const machine = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5, metalness: 0.3 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b52f, roughness: 0.45 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 1.6, 12), dark);
  legs.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), yellow);
  head.position.y = 1.9;
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 16), dark);
  mouth.rotation.x = Math.PI / 2;
  mouth.position.set(0, 2.05, 0.35);
  machine.add(legs, head, mouth);
  machine.position.z = farStumpsZ + 1.6;
  pitchGroup.add(machine);

  const layout = {
    world,
    pitchGroup,
    machine,
    stumpsNear,
    setBattingHand(hand) {
      // Shift the whole pitch so the stumps line sits in front of the batter.
      pitchGroup.position.x = lineX(hand);
    },
    releasePoint(hand) {
      return new THREE.Vector3(lineX(hand), 2.05, machine.position.z + 0.45);
    },
  };
  layout.setBattingHand(battingHand);
  return layout;
}
