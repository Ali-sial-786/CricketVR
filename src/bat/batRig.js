// Turns the two Touch Plus controller poses into one rigid bat pose.
//
// The printed mini bat (hardware/bat-handle/bat_handle.scad) holds both
// controllers upright, side by side, just below the handle. Each head points
// up at the handle, its trigger toward the back of the bat, and its faceplate
// tilts toward the hitting face. Looking at the face, the left controller is
// in the left pod. If they go in the other way round it's detected and
// handled. The layout is mirror-symmetric, so the same bat works for left-
// and right-handed batters.
//
// Each frame:
//   1. Each tracked controller gives its own estimate of the bat pose:
//      bat = controllerPose * inverse(mount).
//   2. The estimates are blended. Weights depend on tracking quality, and
//      they ramp smoothly so losing one controller never makes the bat jump.
//   3. While both are tracked well, it learns where the right-pod controller
//      really sits relative to the left-pod one. That absorbs foam/strap fit
//      differences of a few mm or degrees.
//   4. A light One Euro filter takes out jitter when the bat is still. It
//      adds almost no lag during a swing.
//   5. Linear and angular velocity come from consecutive poses. The physics
//      uses them for the bat speed at the exact contact point.
import * as THREE from 'three';
import { MOUNT } from './batSpec.js';

const mm = (v) => v / 1000;

// WebXR gripSpace: -Z runs along the grip toward the head, +Y points from the
// trigger side to the back of the controller. With both controllers upright
// in their pods, both have the same axes in the bat frame:
const GRIP_AXES = { x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] };

const v3 = (a) => new THREE.Vector3(...a);

// Mount transforms: each pod's controller grip pose in the bat frame.
export function nominalMounts(profile = MOUNT) {
  const make = (side) => {
    const m = new THREE.Matrix4().makeBasis(v3(GRIP_AXES.x), v3(GRIP_AXES.y), v3(GRIP_AXES.z));
    // SCAD -> bat frame: X = x, Y = z, Z = -y
    m.setPosition(mm(side * profile.podX), mm(profile.gripOriginZ), mm(-profile.podY));
    return m;
  };
  return { left: make(-1), right: make(1) };
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
const ONE = new THREE.Vector3(1, 1, 1);

function poseMatrix(ctrl, out = new THREE.Matrix4()) {
  return out.compose(ctrl.position, ctrl.quaternion, ONE);
}

export class BatRig {
  constructor({ trims = {}, profile = MOUNT, learnRelative = true, filter = true, autoSwap = true, onSwapDetected = null } = {}) {
    this.profile = profile;
    this.learnRelative = learnRelative;
    this.useFilter = filter;
    this.autoSwap = autoSwap;
    this.onSwapDetected = onSwapDetected;
    this.filter = new PoseFilter();
    this.trim = trimMatrix(trims);
    this.mounts = nominalMounts(profile);
    this.podSpacing = mm(2 * profile.podX);
    this.pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };
    this.prevPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.reset();
  }

  reset() {
    // swapped = the right controller is in the left pod (and vice versa)
    this.swapped = false;
    this.swapEvidence = 0;
    this.learnedRightPod = this.mounts.right.clone();
    this.weights = { leftPod: 0, rightPod: 0 };
    this.valid = false;
    this.hasPrev = false;
    this.offHandleTime = 0;
    this.inHandle = true;
    this.tracking = 'none';
    this.disagreement = { mm: 0, deg: 0 };
    this.filter.reset();
  }

  setTrims(trims) {
    this.trim = trimMatrix(trims);
  }

  // Which controller ('left' | 'right') sits in each pod right now.
  get pods() {
    return this.swapped ? { leftPod: 'right', rightPod: 'left' } : { leftPod: 'left', rightPod: 'right' };
  }

  // inputs: { left, right }. Each is null or { position: Vector3,
  // quaternion: Quaternion, emulatedPosition: boolean } in the XR reference
  // space (the gripSpace pose). dt is in seconds.
  update(inputs, dt) {
    dt = Math.min(1 / 20, Math.max(1 / 240, dt || 1 / 72));
    const left = inputs.left || null;
    const right = inputs.right || null;

    // --- assembled? which way round? ---
    if (left && right) {
      // right controller's position in the left controller's grip frame
      const d = _p.copy(right.position).applyMatrix4(_m.copy(poseMatrix(left)).invert());
      const off = Math.abs(d.length() - this.podSpacing) > 0.025 || Math.abs(d.x) < 0.04;
      this.offHandleTime = off ? this.offHandleTime + dt : 0;
      this.inHandle = this.offHandleTime < 0.3;
      if (this.autoSwap && this.inHandle && !left.emulatedPosition && !right.emulatedPosition) {
        // grip +X is the bat's +X for both, so d.x > 0 means right is in the right pod
        this.swapEvidence = THREE.MathUtils.clamp(this.swapEvidence + Math.sign(d.x) * dt, -0.6, 0.6);
        const swapped = this.swapEvidence < -0.5 ? true : this.swapEvidence > 0.5 ? false : this.swapped;
        if (swapped !== this.swapped) {
          this.swapped = swapped;
          this.learnedRightPod = this.mounts.right.clone();
          this.filter.reset();
          if (this.onSwapDetected) this.onSwapDetected(swapped);
        }
      }
    }

    const pods = this.pods;
    const ctrl = { leftPod: pods.leftPod === 'left' ? left : right, rightPod: pods.rightPod === 'left' ? left : right };
    const a = ctrl.leftPod;
    const b = ctrl.rightPod;

    // --- learn the right-pod controller's real seat relative to the left ---
    if (this.learnRelative && a && b && !a.emulatedPosition && !b.emulatedPosition && this.inHandle && this.angularVelocity.length() < 6) {
      // observed = M_left * inv(T_left) * T_right
      const observed = _m.copy(this.mounts.left).multiply(_m2.copy(poseMatrix(a)).invert()).multiply(poseMatrix(b, _m2));
      const obsP = new THREE.Vector3();
      const obsQ = new THREE.Quaternion();
      observed.decompose(obsP, obsQ, _s);
      const nomP = new THREE.Vector3();
      const nomQ = new THREE.Quaternion();
      this.mounts.right.decompose(nomP, nomQ, _s);
      if (obsP.distanceTo(nomP) < 0.015 && THREE.MathUtils.radToDeg(obsQ.angleTo(nomQ)) < 12) {
        const k = 1 - Math.exp(-dt / 2.0);
        const curP = new THREE.Vector3();
        const curQ = new THREE.Quaternion();
        this.learnedRightPod.decompose(curP, curQ, _s);
        curP.lerp(obsP, k);
        curQ.slerp(obsQ, k);
        this.learnedRightPod.compose(curP, curQ, ONE);
      }
    }

    // --- per-controller bat estimates ---
    const est = [];
    const ramp = 1 - Math.exp(-dt / 0.08);
    for (const key of ['leftPod', 'rightPod']) {
      const c = ctrl[key];
      const target = c ? (c.emulatedPosition ? 0.15 : 1) : 0;
      // a controller that disappears drops out at once; others ramp
      this.weights[key] = target === 0 ? 0 : this.weights[key] + (target - this.weights[key]) * ramp;
      if (!c || this.weights[key] <= 1e-4) continue;
      const mount = key === 'leftPod' ? this.mounts.left : this.learnedRightPod;
      const m = new THREE.Matrix4().copy(poseMatrix(c)).multiply(_m2.copy(mount).invert());
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      m.decompose(p, q, _s);
      est.push({ key, p, q, w: this.weights[key] });
    }
    if (!est.length) {
      this.valid = false;
      this.tracking = 'none';
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      return this.pose;
    }
    if (est.length === 2) {
      const k = 1 - Math.exp(-dt / 0.5);
      this.disagreement.mm += (est[0].p.distanceTo(est[1].p) * 1000 - this.disagreement.mm) * k;
      this.disagreement.deg += (THREE.MathUtils.radToDeg(est[0].q.angleTo(est[1].q)) - this.disagreement.deg) * k;
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
    const fused = new THREE.Matrix4().compose(p, q, ONE).multiply(this.trim);
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
      this.prevPose.matrix.compose(p, q, ONE);
    }
    this.pose.position.copy(p);
    this.pose.quaternion.copy(q);
    this.pose.matrix.compose(p, q, ONE);
    this.hasPrev = true;
    this.valid = true;
    this.tracking = est.length === 2 ? 'both' : pods[est[0].key];
    return this.pose;
  }

  // Velocity of a point on the bat (world space), e.g. the contact point.
  // Pass `origin` when the point belongs to an interpolated (mid-frame) pose.
  pointVelocity(worldPoint, out = new THREE.Vector3(), origin = this.pose.position) {
    const r = _p.subVectors(worldPoint, origin);
    return out.crossVectors(this.angularVelocity, r).add(this.velocity);
  }

  // World pose of a controller ('left' | 'right') as the bat layout predicts
  // it (for drawing ghost controllers or checking alignment).
  predictedControllerMatrix(hand, out = new THREE.Matrix4()) {
    const pod = this.pods.leftPod === hand ? 'leftPod' : 'rightPod';
    const mount = pod === 'leftPod' ? this.mounts.left : this.learnedRightPod;
    return out.copy(this.pose.matrix).multiply(_m.copy(this.trim).invert()).multiply(mount);
  }
}
