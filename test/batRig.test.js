import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BatRig, nominalMounts } from '../src/bat/batRig.js';
import { MOUNT } from '../src/bat/batSpec.js';

const ONE = new THREE.Vector3(1, 1, 1);

// Controller poses that a perfectly assembled bat at `batMatrix` produces.
function controllerPoses(batMatrix, hand, { topError = null } = {}) {
  const mounts = nominalMounts(hand);
  const out = {};
  for (const key of ['top', 'bottom']) {
    let mount = mounts[key].matrix.clone();
    if (key === 'top' && topError) mount = mount.multiply(topError);
    const m = batMatrix.clone().multiply(mount);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    m.decompose(position, quaternion, new THREE.Vector3());
    out[mounts[key].hand] = { position, quaternion, emulatedPosition: false };
  }
  return out;
}

function batAt(x, y, z, yawDeg, tiltDeg) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(tiltDeg), THREE.MathUtils.degToRad(yawDeg), 0, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, ONE);
}

test('mount layout matches the printed handle', () => {
  for (const hand of ['right', 'left']) {
    const m = nominalMounts(hand);
    assert.equal(m.top.hand, hand === 'right' ? 'left' : 'right');
    for (const key of ['top', 'bottom']) {
      assert.ok(Math.abs(m[key].matrix.determinant() - 1) < 1e-9, 'proper rotation');
      const p = new THREE.Vector3().setFromMatrixPosition(m[key].matrix);
      const expected = (key === 'top' ? MOUNT.topGripOrigin : MOUNT.bottomGripOrigin) / 1000;
      assert.ok(Math.abs(p.y - expected) < 1e-9);
    }
    // grip -Z (toward each controller's head) points away from the other controller
    const topHead = new THREE.Vector3(0, 0, -1).transformDirection(m.top.matrix);
    const botHead = new THREE.Vector3(0, 0, -1).transformDirection(m.bottom.matrix);
    assert.ok(topHead.y > 0.999 && botHead.y < -0.999);
    // both triggers (grip -Y side) face the same way
    const topNose = new THREE.Vector3(0, -1, 0).transformDirection(m.top.matrix);
    const botNose = new THREE.Vector3(0, -1, 0).transformDirection(m.bottom.matrix);
    assert.ok(topNose.dot(botNose) > 0.999);
    // bottom hand's palm (-X of a right hand, +X of a left hand) faces the bat face (+Z)
    const palm = new THREE.Vector3(hand === 'right' ? -1 : 1, 0, 0).transformDirection(m.bottom.matrix);
    assert.ok(palm.z > 0.999, `palm faces the bat face for a ${hand}-handed batter`);
  }
});

test('recovers the bat pose from either or both controllers', () => {
  const bat = batAt(0.2, 1.0, -0.3, 35, -60);
  const poses = controllerPoses(bat, 'right');
  for (const inputs of [poses, { left: poses.left }, { right: poses.right }]) {
    const rig = new BatRig({ autoHand: false, filter: false });
    rig.update(inputs, 1 / 72);
    const p = rig.pose.position;
    const q = rig.pose.quaternion;
    const ep = new THREE.Vector3();
    const eq = new THREE.Quaternion();
    bat.decompose(ep, eq, new THREE.Vector3());
    assert.ok(p.distanceTo(ep) < 1e-6, `position ${p.distanceTo(ep)}`);
    assert.ok(q.angleTo(eq) < 1e-6, `rotation ${q.angleTo(eq)}`);
  }
});

test('learns a top controller that sits a few mm / degrees off nominal', () => {
  const err = new THREE.Matrix4().compose(
    new THREE.Vector3(0.004, -0.003, 0.002),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, -0.03, 0.04)),
    ONE,
  );
  const ep = new THREE.Vector3();
  const eq = new THREE.Quaternion();
  const swing = (rig, frames) => {
    for (let i = 0; i < frames; i++) {
      const bat = batAt(0.1 * Math.sin(i / 50), 1.0, -0.2, 20 * Math.sin(i / 70), -70 + 10 * Math.cos(i / 40));
      rig.update(controllerPoses(bat, 'right', { topError: err }), 1 / 72);
    }
  };
  const fixed = new BatRig({ autoHand: false, filter: false, learnRelative: false });
  swing(fixed, 72 * 3);
  const before = fixed.disagreement.mm;
  const rig = new BatRig({ autoHand: false, filter: false });
  swing(rig, 72 * 12);
  // after learning, top-only tracking must agree with the true pose
  const bat = batAt(0, 1.1, -0.2, 10, -80);
  const poses = controllerPoses(bat, 'right', { topError: err });
  rig.update({ left: poses.left }, 1 / 72);
  bat.decompose(ep, eq, new THREE.Vector3());
  assert.ok(before > 3, `starts out disagreeing (${before.toFixed(1)} mm)`);
  assert.ok(rig.pose.position.distanceTo(ep) < 0.0015, `top-only position error ${(rig.pose.position.distanceTo(ep) * 1000).toFixed(2)} mm`);
  assert.ok(THREE.MathUtils.radToDeg(rig.pose.quaternion.angleTo(eq)) < 0.5);
});

test('detects a left-handed batter from which controller is on top', () => {
  let detected = null;
  const rig = new BatRig({ battingHand: 'right', autoHand: true, filter: false, onHandDetected: (h) => (detected = h) });
  for (let i = 0; i < 72 * 2; i++) {
    const bat = batAt(0, 0.9, -0.3, 0, 12 + 5 * Math.sin(i / 10)); // handle up, blade down: the stance
    rig.update(controllerPoses(bat, 'left'), 1 / 72);
  }
  assert.equal(detected, 'left');
  assert.equal(rig.battingHand, 'left');
});

test('velocity and angular velocity follow the swing', () => {
  const rig = new BatRig({ autoHand: false, filter: false });
  const w = 12; // rad/s about world Y
  for (let i = 0; i < 10; i++) {
    const bat = batAt(0, 1, 0, THREE.MathUtils.radToDeg((w * i) / 72), 90);
    rig.update(controllerPoses(bat, 'right'), 1 / 72);
  }
  assert.ok(Math.abs(rig.angularVelocity.y - w) < 0.05, `omega ${rig.angularVelocity.y}`);
  const toe = new THREE.Vector3(0, -0.7, 0).applyMatrix4(rig.pose.matrix);
  const v = rig.pointVelocity(toe);
  assert.ok(Math.abs(v.length() - w * 0.7) < 0.2, `toe speed ${v.length()}`);
});

test('flags controllers that are not in the handle', () => {
  const rig = new BatRig({ autoHand: false, filter: false });
  const a = { position: new THREE.Vector3(-0.3, 1, -0.3), quaternion: new THREE.Quaternion(), emulatedPosition: false };
  const b = { position: new THREE.Vector3(0.3, 1, -0.3), quaternion: new THREE.Quaternion(), emulatedPosition: false };
  for (let i = 0; i < 40; i++) rig.update({ left: a, right: b }, 1 / 72);
  assert.equal(rig.inHandle, false);
});
