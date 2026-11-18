import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BatRig, nominalMounts } from '../src/bat/batRig.js';
import { MOUNT, BAT_SPEC } from '../src/bat/batSpec.js';

const ONE = new THREE.Vector3(1, 1, 1);

// Controller poses that the assembled bat at `batMatrix` produces.
function controllerPoses(batMatrix, { swapped = false, rightError = null } = {}) {
  const mounts = nominalMounts();
  const out = {};
  for (const pod of ['left', 'right']) {
    let mount = mounts[pod].clone();
    if (pod === 'right' && rightError) mount = mount.multiply(rightError);
    const m = batMatrix.clone().multiply(mount);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    m.decompose(position, quaternion, new THREE.Vector3());
    const hand = swapped ? (pod === 'left' ? 'right' : 'left') : pod;
    out[hand] = { position, quaternion, emulatedPosition: false };
  }
  return out;
}

function batAt(x, y, z, yawDeg, tiltDeg) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(tiltDeg), THREE.MathUtils.degToRad(yawDeg), 0, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, ONE);
}

const decompose = (m) => {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  m.decompose(p, q, new THREE.Vector3());
  return { p, q };
};

test('mount layout matches the printed yoke', () => {
  const m = nominalMounts();
  for (const pod of ['left', 'right']) {
    assert.ok(Math.abs(m[pod].determinant() - 1) < 1e-9, 'proper rotation');
    // both controllers stand upright: grip -Z (toward the head) points up the handle
    const head = new THREE.Vector3(0, 0, -1).transformDirection(m[pod]);
    assert.ok(head.y > 0.999, `${pod} head points up the handle`);
    // trigger side (grip -Y) faces the back of the bat, so the faceplate tilts to the face
    const trigger = new THREE.Vector3(0, -1, 0).transformDirection(m[pod]);
    assert.ok(trigger.z < -0.999, `${pod} trigger toward the back`);
    // controllers sit below the handle, inside the top of the virtual blade
    const p = new THREE.Vector3().setFromMatrixPosition(m[pod]);
    assert.ok(p.y < 0 && p.y > BAT_SPEC.toe);
  }
  const l = new THREE.Vector3().setFromMatrixPosition(m.left);
  const r = new THREE.Vector3().setFromMatrixPosition(m.right);
  assert.ok(Math.abs(r.x - l.x - (2 * MOUNT.podX) / 1000) < 1e-9, 'left pod on -X, right pod on +X');
});

test('recovers the bat pose from either or both controllers', () => {
  const bat = batAt(0.2, 1.0, -0.3, 35, -60);
  const poses = controllerPoses(bat);
  const e = decompose(bat);
  for (const inputs of [poses, { left: poses.left }, { right: poses.right }]) {
    const rig = new BatRig({ filter: false });
    rig.update(inputs, 1 / 72);
    assert.ok(rig.pose.position.distanceTo(e.p) < 1e-6);
    assert.ok(rig.pose.quaternion.angleTo(e.q) < 1e-6);
  }
});

test('handles the controllers going in the wrong pods', () => {
  let event = null;
  const rig = new BatRig({ filter: false, onSwapDetected: (s) => (event = s) });
  let bat;
  for (let i = 0; i < 72; i++) {
    bat = batAt(0, 1, -0.2, 10 * Math.sin(i / 20), 15);
    rig.update(controllerPoses(bat, { swapped: true }), 1 / 72);
  }
  assert.equal(event, true);
  assert.equal(rig.swapped, true);
  // after the swap is detected, one controller alone still gives the right pose
  bat = batAt(0.1, 1.1, -0.2, 20, 30);
  const poses = controllerPoses(bat, { swapped: true });
  rig.update({ left: poses.left }, 1 / 72);
  assert.ok(rig.pose.position.distanceTo(decompose(bat).p) < 1e-6);
});

test('learns a controller that sits a few mm / degrees off nominal', () => {
  const err = new THREE.Matrix4().compose(
    new THREE.Vector3(0.004, -0.003, 0.002),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, -0.03, 0.04)),
    ONE,
  );
  const swing = (rig, frames) => {
    for (let i = 0; i < frames; i++) {
      const bat = batAt(0.1 * Math.sin(i / 50), 1.0, -0.2, 20 * Math.sin(i / 70), 10 * Math.cos(i / 40));
      rig.update(controllerPoses(bat, { rightError: err }), 1 / 72);
    }
  };
  const fixed = new BatRig({ filter: false, learnRelative: false });
  swing(fixed, 72 * 3);
  const rig = new BatRig({ filter: false });
  swing(rig, 72 * 12);
  const bat = batAt(0, 1.1, -0.2, 10, 20);
  rig.update({ right: controllerPoses(bat, { rightError: err }).right }, 1 / 72);
  const e = decompose(bat);
  assert.ok(fixed.disagreement.mm > 3, `starts out disagreeing (${fixed.disagreement.mm.toFixed(1)} mm)`);
  assert.ok(rig.pose.position.distanceTo(e.p) < 0.0015, `right-only error ${(rig.pose.position.distanceTo(e.p) * 1000).toFixed(2)} mm`);
  assert.ok(THREE.MathUtils.radToDeg(rig.pose.quaternion.angleTo(e.q)) < 0.5);
});

test('velocity and angular velocity follow the swing', () => {
  const rig = new BatRig({ filter: false });
  const w = 12; // rad/s about world Y
  for (let i = 0; i < 10; i++) rig.update(controllerPoses(batAt(0, 1, 0, THREE.MathUtils.radToDeg((w * i) / 72), 90)), 1 / 72);
  assert.ok(Math.abs(rig.angularVelocity.y - w) < 0.05, `omega ${rig.angularVelocity.y}`);
  const toe = new THREE.Vector3(0, BAT_SPEC.toe, 0).applyMatrix4(rig.pose.matrix);
  assert.ok(Math.abs(rig.pointVelocity(toe).length() - w * -BAT_SPEC.toe) < 0.2);
});

test('flags controllers that are not in the bat', () => {
  const rig = new BatRig({ filter: false });
  const a = { position: new THREE.Vector3(-0.3, 1, -0.3), quaternion: new THREE.Quaternion(), emulatedPosition: false };
  const b = { position: new THREE.Vector3(0.3, 1, -0.3), quaternion: new THREE.Quaternion(), emulatedPosition: false };
  for (let i = 0; i < 40; i++) rig.update({ left: a, right: b }, 1 / 72);
  assert.equal(rig.inHandle, false);
});
