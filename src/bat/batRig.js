// Turns the controller in the printed bat into the bat pose.
//
// The printed bat (hardware/bat-handle/bat_handle.scad) holds ONE controller
// at the bottom of the handle, in line with it: head up toward the handle,
// trigger toward the back of the bat, faceplate tilting toward the hitting
// face. The other controller isn't used while batting.
//
// Each frame:
//   1. Pick the bat controller: the one chosen in settings, or in 'auto'
//      mode whichever controller is actually tracked (right preferred).
//   2. bat = controllerPose * inverse(mount), then the user's alignment trims.
//   3. A light One Euro filter takes out jitter when the bat is still. It
//      adds almost no lag during a swing.
//   4. Linear and angular velocity come from consecutive poses. The physics
//      uses them for the bat speed at the exact contact point.
import * as THREE from 'three';
import { MOUNT } from './batSpec.js';

const mm = (v) => v / 1000;

// WebXR gripSpace: -Z runs along the grip toward the head, +Y points from the
// trigger side to the back of the controller. Upright in the bat, that is:
const GRIP_AXES = { x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] };

const v3 = (a) => new THREE.Vector3(...a);

// Mount transform: the controller's grip pose in the bat frame.
export function nominalMount(profile = MOUNT) {
  const m = new THREE.Matrix4().makeBasis(v3(GRIP_AXES.x), v3(GRIP_AXES.y), v3(GRIP_AXES.z));
  // SCAD -> bat frame: X = x, Y = z, Z = -y
  return m.setPosition(0, mm(profile.gripOriginZ), mm(-profile.podY));
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
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export class BatRig {
  // controller: 'right' | 'left' | 'auto'
  constructor({ controller = 'auto', trims = {}, profile = MOUNT, filter = true, onControllerChange = null } = {}) {
    this.preference = controller;
    this.useFilter = filter;
    this.onControllerChange = onControllerChange;
    this.filter = new PoseFilter();
    this.trim = trimMatrix(trims);
    this.mount = nominalMount(profile);
    this.mountInv = this.mount.clone().invert();
    this.pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };
    this.prevPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.active = this.preference === 'left' ? 'left' : 'right';
    this.missing = 0;
    this.valid = false;
    this.hasPrev = false;
    this.emulated = false;
    this.filter.reset();
  }

  setController(controller) {
    this.preference = controller;
    this.reset();
  }

  setTrims(trims) {
    this.trim = trimMatrix(trims);
  }

  // inputs: { left, right }. Each is null or { position: Vector3,
  // quaternion: Quaternion, emulatedPosition: boolean } in the XR reference
  // space (the gripSpace pose). dt is in seconds.
  update(inputs, dt) {
    dt = Math.min(1 / 20, Math.max(1 / 240, dt || 1 / 72));

    // In auto mode, follow whichever controller is actually being tracked.
    if (this.preference === 'auto') {
      const other = this.active === 'right' ? 'left' : 'right';
      this.missing = inputs[this.active] ? 0 : this.missing + dt;
      if (this.missing > 0.5 && inputs[other]) {
        this.active = other;
        this.missing = 0;
        this.filter.reset();
        this.hasPrev = false;
        if (this.onControllerChange) this.onControllerChange(other);
      }
    }

    const c = inputs[this.active];
    if (!c) {
      // keep the last pose for a moment; the physics stops using it
      this.valid = false;
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      return this.pose;
    }
    this.emulated = !!c.emulatedPosition;

    const m = _m.compose(c.position, c.quaternion, ONE).multiply(this.mountInv).multiply(this.trim);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(p, q, _s);
    if (this.useFilter) this.filter.apply(p, q, dt);

    this.prevPose.position.copy(this.pose.position);
    this.prevPose.quaternion.copy(this.pose.quaternion);
    this.prevPose.matrix.copy(this.pose.matrix);
    if (this.hasPrev) {
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
    return this.pose;
  }

  // Velocity of a point on the bat (world space), e.g. the contact point.
  // Pass `origin` when the point belongs to an interpolated (mid-frame) pose.
  pointVelocity(worldPoint, out = new THREE.Vector3(), origin = this.pose.position) {
    const r = _p.subVectors(worldPoint, origin);
    return out.crossVectors(this.angularVelocity, r).add(this.velocity);
  }

  // Where the bat controller should be (world), e.g. to draw a ghost.
  predictedControllerMatrix(out = new THREE.Matrix4()) {
    return out.copy(this.pose.matrix).multiply(_m.copy(this.trim).invert()).multiply(this.mount);
  }
}
