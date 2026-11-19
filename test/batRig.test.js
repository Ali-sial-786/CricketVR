import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BatRig, nominalMount } from '../src/bat/batRig.js';
import { BAT_SPEC } from '../src/bat/batSpec.js';

const ONE = new THREE.Vector3(1, 1, 1);

// Controller pose that the bat at `batMatrix` produces.
function controllerPose(batMatrix) {
  const m = batMatrix.clone().multiply(nominalMount());
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  m.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion, emulatedPosition: false };
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

test('mount layout matches the printed frame', () => {
  const m = nominalMount();
  assert.ok(Math.abs(m.determinant() - 1) < 1e-9, 'proper rotation');
  // the controller stands upright: grip -Z (toward the head) points up the handle
  assert.ok(new THREE.Vector3(0, 0, -1).transformDirection(m).y > 0.999);
  // trigger side (grip -Y) faces the back of the bat, so the faceplate tilts to the face
  assert.ok(new THREE.Vector3(0, -1, 0).transformDirection(m).z < -0.999);
  // it sits below the handle, inside the top of the virtual blade, on the centre line
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(p.y < 0 && p.y > BAT_SPEC.toe && p.x === 0);
});

test('recovers the bat pose from the controller', () => {
  const bat = batAt(0.2, 1.0, -0.3, 35, -60);
  const e = decompose(bat);
  for (const hand of ['right', 'left']) {
    const rig = new BatRig({ controller: hand, filter: false });
    rig.update({ [hand]: controllerPose(bat) }, 1 / 72);
    assert.ok(rig.valid);
    assert.ok(rig.pose.position.distanceTo(e.p) < 1e-6);
    assert.ok(rig.pose.quaternion.angleTo(e.q) < 1e-6);
  }
});

test('auto mode follows whichever controller is in the bat', () => {
  let changed = null;
  const rig = new BatRig({ controller: 'auto', filter: false, onControllerChange: (h) => (changed = h) });
  const bat = batAt(0, 1, -0.2, 0, 10);
  for (let i = 0; i < 72; i++) rig.update({ left: controllerPose(bat) }, 1 / 72);
  assert.equal(rig.active, 'left');
  assert.equal(changed, 'left');
  assert.ok(rig.valid);
  // a fixed choice ignores the other controller
  const fixed = new BatRig({ controller: 'right', filter: false });
  fixed.update({ left: controllerPose(bat) }, 1 / 72);
  assert.equal(fixed.valid, false);
});

test('velocity and angular velocity follow the swing', () => {
  const rig = new BatRig({ controller: 'right', filter: false });
  const w = 12; // rad/s about world Y
  for (let i = 0; i < 10; i++) rig.update({ right: controllerPose(batAt(0, 1, 0, THREE.MathUtils.radToDeg((w * i) / 72), 90)) }, 1 / 72);
  assert.ok(Math.abs(rig.angularVelocity.y - w) < 0.05, `omega ${rig.angularVelocity.y}`);
  const toe = new THREE.Vector3(0, BAT_SPEC.toe, 0).applyMatrix4(rig.pose.matrix);
  assert.ok(Math.abs(rig.pointVelocity(toe).length() - w * -BAT_SPEC.toe) < 0.2);
});

test('trims move the virtual bat relative to the controller', () => {
  const bat = batAt(0, 1, 0, 0, 0);
  const rig = new BatRig({ controller: 'right', filter: false, trims: { offsetMm: 20 } });
  rig.update({ right: controllerPose(bat) }, 1 / 72);
  assert.ok(Math.abs(rig.pose.position.y - 1.02) < 1e-6);
});
