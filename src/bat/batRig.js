// Turns the two Touch Plus controller poses into one rigid bat pose.
//
// The printed handle holds the controllers in a known layout (see
// hardware/bat-handle/bat_handle.scad):
//   top    = the batter's top hand, upside down in the sleeve, faceplate up
//   bottom = the batter's bottom hand, held normally, head toward the blade
// For a right-handed batter the LEFT controller is on top. For a
// left-handed batter the RIGHT controller is on top.
//
// What it does each frame:
//   1. Each tracked controller gives its own estimate of the bat pose:
//      bat = controllerPose * inverse(mount).
//   2. The estimates are blended. Weights depend on tracking quality, and
//      they ramp smoothly so losing one controller never makes the bat jump.
//   3. While both are tracked well, it learns where the top controller
//      really sits relative to the bottom one. That absorbs foam/strap fit
//      differences of a few mm or degrees.
//   4. A light One Euro filter takes out jitter when the bat is still. It
//      adds almost no lag during a swing.
//   5. Linear and angular velocity come from consecutive poses. The physics
//      uses them for the bat speed at the exact contact point.
import * as THREE from 'three';
import { MOUNT } from './batSpec.js';

const mm = (v) => v / 1000;

// Grip-space axes (WebXR gripSpace: -Z along the grip toward the thumb, +X
// out of the back of the right hand, +Y toward the forearm) expressed in the
// bat frame.
const LAYOUT = {
  right: {
    top: { hand: 'left', x: [0, 0, 1], y: [-1, 0, 0], z: [0, -1, 0], originKey: 'topGripOrigin' },
    bottom: { hand: 'right', x: [0, 0, -1], y: [-1, 0, 0], z: [0, 1, 0], originKey: 'bottomGripOrigin' },
  },
  left: {
    top: { hand: 'right', x: [0, 0, -1], y: [1, 0, 0], z: [0, -1, 0], originKey: 'topGripOrigin' },
    bottom: { hand: 'left', x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0], originKey: 'bottomGripOrigin' },
  },
};

const v3 = (a) => new THREE.Vector3(...a);

// Mount transforms: controller grip pose expressed in the bat frame.
export function nominalMounts(battingHand = 'right', profile = MOUNT) {
  const layout = LAYOUT[battingHand === 'left' ? 'left' : 'right'];
  const make = (m) => {
    const matrix = new THREE.Matrix4().makeBasis(v3(m.x), v3(m.y), v3(m.z));
    matrix.setPosition(0, mm(profile[m.originKey]), 0);
    return { hand: m.hand, matrix };
  };
  return { top: make(layout.top), bottom: make(layout.bottom) };
}

export function trimMatrix({ rollDeg = 0, pitchDeg = 0, offsetMm = 0 } = {}) {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg), THREE.MathUtils.degToRad(rollDeg), 0, 'YXZ'),
  );
  return new THREE.Matrix4().compose(new THREE.Vector3(0, mm(offsetMm), 0), q, new THREE.Vector3(1, 1, 1));
}

// One Euro filter for a pose (position + rotation).
class PoseFilter {
  constructor({ minCutoff = 4, beta = 40, betaRot = 3, dCutoff = 2 } = {}) {
    Object.assign(this, { minCutoff, beta, betaRot, dCutoff });
    this.reset();
  }
  reset() {
    this.p = null;
    this.q = null;
    this.speed = 0;
    this.angSpeed = 0;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  apply(p, q, dt) {
    if (!this.p) {
      this.p = p.clone();
      this.q = q.clone();
      return;
    }
    const aD = PoseFilter.alpha(this.dCutoff, dt);
    this.speed += aD * (p.distanceTo(this.p) / dt - this.speed);
    this.angSpeed += aD * ((2 * Math.acos(Math.min(1, Math.abs(this.q.dot(q))))) / dt - this.angSpeed);
    const aP = PoseFilter.alpha(this.minCutoff + this.beta * this.speed, dt);
    const aR = PoseFilter.alpha(this.minCutoff + this.betaRot * this.angSpeed, dt);
    this.p.lerp(p, aP);
    this.q.slerp(q, aR);
    p.copy(this.p);
    q.copy(this.q);
  }
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function poseMatrix(ctrl, out = new THREE.Matrix4()) {
  return out.compose(ctrl.position, ctrl.quaternion, _s.set(1, 1, 1));
}

export class BatRig {
  constructor({
    battingHand = 'right',
    autoHand = true,
    trims = {},
    profile = MOUNT,
    learnRelative = true,
    filter = true,
    onHandDetected = null,
  } = {}) {
    this.profile = profile;
    this.autoHand = autoHand;
    this.learnRelative = learnRelative;
    this.useFilter = filter;
    this.onHandDetected = onHandDetected;
    this.filter = new PoseFilter();
    this.trim = trimMatrix(trims);
    this.pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };
    this.prevPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.nominalSpacing = mm(profile.topGripOrigin - profile.bottomGripOrigin);
    this.setBattingHand(battingHand);
  }

  setBattingHand(hand) {
    this.battingHand = hand === 'left' ? 'left' : 'right';
    this.mounts = nominalMounts(this.battingHand, this.profile);
    this.learnedTop = this.mounts.top.matrix.clone();
    this.weights = { top: 0, bottom: 0 };
    this.handEvidence = 0;
    this.handLocked = !this.autoHand;
    this.valid = false;
    this.hasPrev = false;
    this.offHandleTime = 0;
    this.inHandle = true;
    this.disagreement = { mm: 0, deg: 0 };
    this.filter.reset();
  }

  setTrims(trims) {
    this.trim = trimMatrix(trims);
  }

  // Re-arm the automatic batting-hand detection (for example after the
  // controllers were taken out and put back).
  redetectHand() {
    this.handEvidence = 0;
    this.handLocked = false;
  }

  get topHand() {
    return this.mounts.top.hand;
  }

  get bottomHand() {
    return this.mounts.bottom.hand;
  }

  // inputs: { left, right }. Each is null or { position: Vector3,
  // quaternion: Quaternion, emulatedPosition: boolean } in the XR
  // reference space (the gripSpace pose). dt is in seconds.
  update(inputs, dt) {
    dt = Math.min(1 / 20, Math.max(1 / 240, dt || 1 / 72));
    const left = inputs.left || null;
    const right = inputs.right || null;

    // --- is the bat assembled, and which hand bats? ---
    if (left && right) {
      const d = _p.subVectors(left.position, right.position);
      const dist = d.length();
      const off = Math.abs(dist - this.nominalSpacing) > 0.03;
      this.offHandleTime = off ? this.offHandleTime + dt : 0;
      this.inHandle = this.offHandleTime < 0.3;
      if (!this.handLocked && this.inHandle && !left.emulatedPosition && !right.emulatedPosition && Math.abs(d.y) > 0.75 * dist) {
        // In the stance the top controller is the higher one.
        this.handEvidence += Math.sign(d.y) * dt;
        if (Math.abs(this.handEvidence) > 1.0) {
          const hand = this.handEvidence > 0 ? 'right' : 'left'; // left controller above => right-handed batter
          this.handLocked = true;
          if (hand !== this.battingHand) {
            this.setBattingHand(hand);
            this.handLocked = true;
          }
          if (this.onHandDetected) this.onHandDetected(hand);
        }
      }
    }

    const top = this.topHand === 'left' ? left : right;
    const bottom = this.bottomHand === 'left' ? left : right;

    // --- learn the top controller's real seat relative to the bottom one ---
    if (this.learnRelative && top && bottom && !top.emulatedPosition && !bottom.emulatedPosition && this.inHandle) {
      const angSpeed = this.angularVelocity.length();
      if (angSpeed < 6) {
        // observedTop = M_bottom * inv(T_bottom) * T_top
        const observed = _m
          .copy(this.mounts.bottom.matrix)
          .multiply(_m2.copy(poseMatrix(bottom)).invert())
          .multiply(poseMatrix(top, _m2));
        const obsP = new THREE.Vector3();
        const obsQ = new THREE.Quaternion();
        observed.decompose(obsP, obsQ, _s);
        const nomP = new THREE.Vector3();
        const nomQ = new THREE.Quaternion();
        this.mounts.top.matrix.decompose(nomP, nomQ, _s);
        const posErr = obsP.distanceTo(nomP);
        const angErr = THREE.MathUtils.radToDeg(obsQ.angleTo(nomQ));
        if (posErr < 0.015 && angErr < 12) {
          const a = 1 - Math.exp(-dt / 2.0);
          const curP = new THREE.Vector3();
          const curQ = new THREE.Quaternion();
          this.learnedTop.decompose(curP, curQ, _s);
          curP.lerp(obsP, a);
          curQ.slerp(obsQ, a);
          this.learnedTop.compose(curP, curQ, _s.set(1, 1, 1));
        }
      }
    }

    // --- per-controller bat estimates ---
    const est = [];
    const target = {
      top: top ? (top.emulatedPosition ? 0.15 : 1) : 0,
      bottom: bottom ? (bottom.emulatedPosition ? 0.15 : 1) : 0,
    };
    const ramp = 1 - Math.exp(-dt / 0.08);
    for (const key of ['top', 'bottom']) {
      // a controller that disappears drops out at once; others ramp
      this.weights[key] = target[key] === 0 ? 0 : this.weights[key] + (target[key] - this.weights[key]) * ramp;
      const ctrl = key === 'top' ? top : bottom;
      if (!ctrl || this.weights[key] <= 1e-4) continue;
      const mount = key === 'top' ? this.learnedTop : this.mounts.bottom.matrix;
      const m = new THREE.Matrix4().copy(poseMatrix(ctrl)).multiply(_m2.copy(mount).invert());
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      m.decompose(p, q, _s);
      est.push({ key, p, q, w: this.weights[key] });
    }
    if (!est.length) {
      this.valid = false;
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      return this.pose;
    }
    if (est.length === 2) {
      const dmm = est[0].p.distanceTo(est[1].p) * 1000;
      const ddeg = THREE.MathUtils.radToDeg(est[0].q.angleTo(est[1].q));
      const a = 1 - Math.exp(-dt / 0.5);
      this.disagreement.mm += (dmm - this.disagreement.mm) * a;
      this.disagreement.deg += (ddeg - this.disagreement.deg) * a;
    }

    // --- blend ---
    const wSum = est.reduce((s, e) => s + e.w, 0);
    const p = new THREE.Vector3();
    const q4 = [0, 0, 0, 0];
    const ref = est[0].q;
    for (const e of est) {
      p.addScaledVector(e.p, e.w / wSum);
      const sgn = ref.dot(e.q) < 0 ? -1 : 1;
      q4[0] += sgn * e.q.x * e.w;
      q4[1] += sgn * e.q.y * e.w;
      q4[2] += sgn * e.q.z * e.w;
      q4[3] += sgn * e.q.w * e.w;
    }
    const q = new THREE.Quaternion(q4[0], q4[1], q4[2], q4[3]).normalize();

    // --- trims (user alignment) ---
    const fused = new THREE.Matrix4().compose(p, q, _s.set(1, 1, 1)).multiply(this.trim);
    fused.decompose(p, q, _s);
    if (this.useFilter) this.filter.apply(p, q, dt);

    // --- velocities from consecutive poses ---
    this.prevPose.position.copy(this.pose.position);
    this.prevPose.quaternion.copy(this.pose.quaternion);
    this.prevPose.matrix.copy(this.pose.matrix);
    if (this.hasPrev && this.valid) {
      this.velocity.subVectors(p, this.prevPose.position).divideScalar(dt);
      const dq = _q.copy(q).multiply(new THREE.Quaternion().copy(this.prevPose.quaternion).invert());
      if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
      const angle = 2 * Math.acos(Math.min(1, dq.w));
      const sinHalf = Math.sqrt(Math.max(0, 1 - dq.w * dq.w));
      if (sinHalf > 1e-6) this.angularVelocity.set(dq.x / sinHalf, dq.y / sinHalf, dq.z / sinHalf).multiplyScalar(angle / dt);
      else this.angularVelocity.set(0, 0, 0);
    } else {
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      this.prevPose.position.copy(p);
      this.prevPose.quaternion.copy(q);
      this.prevPose.matrix.compose(p, q, _s.set(1, 1, 1));
    }
    this.pose.position.copy(p);
    this.pose.quaternion.copy(q);
    this.pose.matrix.compose(p, q, _s.set(1, 1, 1));
    this.hasPrev = true;
    this.valid = true;
    this.tracking = est.length === 2 ? 'both' : est[0].key;
    return this.pose;
  }

  // Velocity of a point on the bat (world space), e.g. the contact point.
  // Pass `origin` when the point belongs to an interpolated (mid-frame) pose.
  pointVelocity(worldPoint, out = new THREE.Vector3(), origin = this.pose.position) {
    const r = _p.subVectors(worldPoint, origin);
    return out.crossVectors(this.angularVelocity, r).add(this.velocity);
  }

  // World-space pose of a controller as the handle layout predicts it (for
  // drawing ghost controllers or checking alignment).
  predictedControllerMatrix(which, out = new THREE.Matrix4()) {
    const mount = which === 'top' ? this.learnedTop : this.mounts.bottom.matrix;
    return out.copy(this.pose.matrix).multiply(_m.copy(this.trim).invert()).multiply(mount);
  }
}
