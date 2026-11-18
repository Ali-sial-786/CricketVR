// Ball vs bat: swept contact detection and impact response.
//
// Contact detection is continuous. Between two frames the bat pose is
// interpolated (lerp + slerp) and the ball follows its own flight, checked
// in sub-steps that are small compared with the ball. Even a 40 m/s ball
// meeting a 30 m/s toe at 72 Hz can't tunnel through.
//
// The impact model is the standard one for bat-ball collisions (e.g. Cross;
// Nathan): an impulse along the contact normal, with
//   - the bat's effective mass at the contact point (from its mass and its
//     moments of inertia, so off-centre and edge hits transfer less),
//   - a coefficient of restitution that is highest at the sweet spot
//     (vibration node) and falls toward the toe and the splice,
//   - Coulomb friction for the tangential part (gives spin and makes thin
//     edges deflect rather than rebound).
// The bat speed at the contact point is what the player swung. The printed
// handle is light, but the ball responds as if hit by a 1.18 kg willow bat.
import * as THREE from 'three';
import { BAT_SPEC, SWEET_SPOT_Y } from './batSpec.js';

const spec = BAT_SPEC;
const BLADE_CENTER = new THREE.Vector3(0, (spec.shoulder + spec.toe) / 2, spec.faceZ - spec.collisionDepth / 2);
const BLADE_HALF = new THREE.Vector3(spec.bladeWidth / 2, (spec.shoulder - spec.toe) / 2, spec.collisionDepth / 2);
const CM = new THREE.Vector3(0, spec.centerOfMassY, spec.faceZ - 0.024);

function sdRoundBox(p, c, half, r) {
  const qx = Math.abs(p.x - c.x) - (half.x - r);
  const qy = Math.abs(p.y - c.y) - (half.y - r);
  const qz = Math.abs(p.z - c.z) - (half.z - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function sdCapsuleY(p, y0, y1, r) {
  const y = Math.min(y1, Math.max(y0, p.y));
  return Math.hypot(p.x, p.y - y, p.z) - r;
}

// Signed distance from a point in the bat frame to the bat surface.
export function batSdf(p) {
  const blade = sdRoundBox(p, BLADE_CENTER, BLADE_HALF, spec.edgeRadius);
  const handle = sdCapsuleY(p, spec.shoulder - 0.02, spec.handleTop - spec.gripRadius, spec.gripRadius);
  return Math.min(blade, handle);
}

const _n = new THREE.Vector3();
export function batNormal(p, out = new THREE.Vector3()) {
  const e = 2e-4;
  const f = (x, y, z) => batSdf(_n.set(x, y, z));
  out.set(
    f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z),
    f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z),
    f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e),
  );
  return out.normalize();
}

const _inv = new THREE.Matrix4();
const _local = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _bq = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

function batMatrixAt(prev, cur, tau, out) {
  _bp.lerpVectors(prev.position, cur.position, tau);
  _bq.slerpQuaternions(prev.quaternion, cur.quaternion, tau);
  return out.compose(_bp, _bq, _one);
}

function ballAt(p0, v0, g, t, out) {
  return out.copy(p0).addScaledVector(v0, t).addScaledVector(g, 0.5 * t * t);
}

const TOE_LOCAL = new THREE.Vector3(0, spec.toe, 0);

// Finds the first contact between the ball and the moving bat during one
// frame.
//   ball:  { position, velocity }  at the start of the frame (world)
//   prev, cur: bat poses { position, quaternion } at the frame start / end
//   dt: frame length (s); gravity: Vector3
// Returns null or { tau, time, pointWorld, normalWorld, pointLocal,
// normalLocal, ballCenter, batMatrix }.
export function sweepBall(ball, prev, cur, dt, gravity, radius = spec.ballRadius) {
  const toe0 = TOE_LOCAL.clone().applyQuaternion(prev.quaternion).add(prev.position);
  const toe1 = TOE_LOCAL.clone().applyQuaternion(cur.quaternion).add(cur.position);
  const reach = ball.velocity.length() * dt + toe0.distanceTo(toe1) + prev.position.distanceTo(cur.position);
  // quick reject: ball far from the bat for the whole frame
  const mid = ballAt(ball.position, ball.velocity, gravity, dt / 2, new THREE.Vector3());
  if (mid.distanceTo(cur.position) > spec.length + reach + 0.3) return null;

  const steps = Math.min(96, Math.max(6, Math.ceil(reach / (radius * 0.5))));
  const m = new THREE.Matrix4();
  const c = new THREE.Vector3();
  const distAt = (tau) => {
    batMatrixAt(prev, cur, tau, m);
    ballAt(ball.position, ball.velocity, gravity, tau * dt, c);
    _local.copy(c).applyMatrix4(_inv.copy(m).invert());
    return batSdf(_local) - radius;
  };
  let d0 = distAt(0);
  if (d0 <= 0) return null; // already touching: the caller handles separation
  let lo = 0;
  for (let k = 1; k <= steps; k++) {
    const tau = k / steps;
    const d = distAt(tau);
    if (d <= 0) {
      let a = lo;
      let b = tau;
      for (let it = 0; it < 12; it++) {
        const midT = (a + b) / 2;
        if (distAt(midT) > 0) a = midT;
        else b = midT;
      }
      const tauHit = b;
      distAt(tauHit);
      const ballCenter = c.clone();
      const pointLocalCenter = _local.clone();
      const normalLocal = batNormal(pointLocalCenter);
      // surface contact point = ball centre pulled back along the normal
      const pointLocal = pointLocalCenter.clone().addScaledVector(normalLocal, -(batSdf(pointLocalCenter)));
      const batMatrix = m.clone();
      const normalWorld = normalLocal.clone().transformDirection(batMatrix);
      const pointWorld = pointLocal.clone().applyMatrix4(batMatrix);
      return { tau: tauHit, time: tauHit * dt, pointWorld, normalWorld, pointLocal, normalLocal, ballCenter, batMatrix };
    }
    lo = tau;
    d0 = d;
  }
  return null;
}

// Coefficient of restitution at a point on the bat (bat frame).
export function restitutionAt(pointLocal, normalSpeed) {
  // Ball-on-willow COR drops a little with impact speed
  const base = THREE.MathUtils.clamp(0.6 - 0.0035 * normalSpeed, 0.42, 0.56);
  const y = pointLocal.y;
  if (y > spec.shoulder) return 0.22; // handle / splice: dead
  const fromNode = (y - SWEET_SPOT_Y) / 0.26;
  let vib = 1 - 0.5 * Math.min(1, fromNode * fromNode);
  const fromToe = y - spec.toe;
  if (fromToe < 0.06) vib *= 0.65 + 0.35 * (fromToe / 0.06);
  return base * vib;
}

// How much the bat "stings" (0 = pure sweet spot, 1 = jarring)
export function stingAt(pointLocal) {
  if (pointLocal.y > spec.shoulder) return 1;
  const fromNode = Math.abs(pointLocal.y - SWEET_SPOT_Y) / 0.17;
  const across = Math.abs(pointLocal.x) / (spec.bladeWidth / 2);
  return THREE.MathUtils.clamp(fromNode * fromNode + 0.5 * across * across, 0, 1);
}

export function classifyContact(pointLocal, normalLocal) {
  const half = spec.bladeWidth / 2;
  const y = pointLocal.y;
  let region;
  if (y > spec.shoulder) region = 'handle';
  else if (y > spec.shoulder - 0.08) region = 'shoulder';
  else if (y - spec.toe < 0.055) region = 'toe';
  // The fastest-exit zone runs from the vibration node up toward the CoM
  else if (y > SWEET_SPOT_Y - 0.05 && y < SWEET_SPOT_Y + 0.11) region = 'sweet';
  else region = 'middle';
  const edge = region !== 'handle' && (Math.abs(pointLocal.x) > half - spec.edgeRadius * 0.6 || Math.abs(normalLocal.x) > 0.55);
  const back = normalLocal.z < -0.6;
  return { region, edge, back, edgeSide: edge ? Math.sign(pointLocal.x) : 0 };
}

const I_INV = new THREE.Vector3(1 / spec.inertiaSwing, 1 / spec.inertiaTwist, 1 / spec.inertiaEdge);

// Inverse effective mass of the (free) bat at a contact point along the
// normal, in the bat frame. The impact lasts about 1 ms, too short for the
// hands to add much, so the bat is treated as free.
export function inverseEffectiveMass(pointLocal, normalLocal) {
  const r = pointLocal.clone().sub(CM);
  const rxn = r.clone().cross(normalLocal);
  const w = rxn.multiply(I_INV);
  return 1 / spec.mass + w.cross(r).dot(normalLocal);
}

// Resolves an impact.
//   ballVelocity, ballSpin (rad/s, world), batPointVelocity (world)
//   contact: result of sweepBall
// Returns { velocity, spin, cor, normalSpeed, quality, sting, exitSpeed }.
export function resolveImpact({ ballVelocity, ballSpin = new THREE.Vector3(), batPointVelocity, contact, radius = spec.ballRadius, mass = spec.ballMass }) {
  const n = contact.normalWorld;
  const rel = ballVelocity.clone().sub(batPointVelocity);
  const un = rel.dot(n);
  const quality = classifyContact(contact.pointLocal, contact.normalLocal);
  const sting = stingAt(contact.pointLocal);
  if (un >= 0) {
    return { velocity: ballVelocity.clone(), spin: ballSpin.clone(), cor: 0, normalSpeed: 0, quality, sting, exitSpeed: ballVelocity.length(), separating: true };
  }
  const e = restitutionAt(contact.pointLocal, -un);
  const invM = inverseEffectiveMass(contact.pointLocal, contact.normalLocal);
  const jn = (-(1 + e) * un) / (1 / mass + invM);
  const out = ballVelocity.clone().addScaledVector(n, jn / mass);

  // Friction: slip velocity of the ball's contact point relative to the bat
  const rContact = n.clone().multiplyScalar(-radius);
  const slip = rel.clone().addScaledVector(n, -un).add(ballSpin.clone().cross(rContact));
  const slipSpeed = slip.length();
  const spin = ballSpin.clone();
  if (slipSpeed > 1e-4) {
    const mu = 0.35;
    // impulse that would make the ball roll (solid sphere: 2/7 of m * slip)
    const jtRoll = (2 / 7) * mass * slipSpeed;
    const jt = Math.min(mu * jn, jtRoll);
    const jtVec = slip.multiplyScalar(-jt / slipSpeed);
    out.addScaledVector(jtVec, 1 / mass);
    const inertia = 0.4 * mass * radius * radius;
    spin.add(rContact.clone().cross(jtVec).multiplyScalar(1 / inertia));
  }
  return { velocity: out, spin, cor: e, normalSpeed: -un, quality, sting, exitSpeed: out.length(), separating: false };
}

// Haptic pulse for both controllers: a clean middle feels crisp and light,
// a toe-end or splice hit buzzes long and hard, like a real bat.
export function impactHaptics(result) {
  const s = result.sting;
  const power = THREE.MathUtils.clamp(result.normalSpeed / 35, 0.15, 1);
  return {
    bottom: { intensity: THREE.MathUtils.clamp(0.25 + 0.75 * s * power, 0, 1), duration: Math.round(18 + 110 * s) },
    top: { intensity: THREE.MathUtils.clamp(0.15 + 0.6 * s * power, 0, 1), duration: Math.round(14 + 80 * s) },
  };
}
