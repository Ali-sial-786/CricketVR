import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sweepBall, resolveImpact, batSdf, inverseEffectiveMass, restitutionAt, impactHaptics } from '../src/bat/batPhysics.js';
import { BAT_SPEC, SWEET_SPOT_Y } from '../src/bat/batSpec.js';

const G = new THREE.Vector3(0, -9.81, 0);
const pose = (p, q = new THREE.Quaternion()) => ({ position: p.clone(), quaternion: q.clone() });

test('bat surface: face, back, edges and handle', () => {
  assert.ok(Math.abs(batSdf(new THREE.Vector3(0, SWEET_SPOT_Y, BAT_SPEC.faceZ))) < 1e-6);
  assert.ok(batSdf(new THREE.Vector3(0, SWEET_SPOT_Y, 0)) < 0, 'inside the blade');
  assert.ok(batSdf(new THREE.Vector3(0.1, SWEET_SPOT_Y, 0)) > 0.04, 'beside the edge');
  assert.ok(Math.abs(batSdf(new THREE.Vector3(0, 0, BAT_SPEC.gripRadius))) < 1e-6, 'handle surface');
});

test('a 40 m/s ball does not tunnel through a fast-swinging bat at 72 Hz', () => {
  // Bat hanging down (blade along -Y), face toward +Z (toward the bowler).
  // It swings 25 rad/s about X, so the sweet spot moves at about 14 m/s.
  const dt = 1 / 72;
  const w = 25;
  const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35);
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35 + w * dt);
  const prev = pose(new THREE.Vector3(0, 1, 0), q0);
  const cur = pose(new THREE.Vector3(0, 1, 0), q1);
  // ball heading for the face at sweet-spot height, starting 0.5 m out
  const hitY = 1 + SWEET_SPOT_Y;
  const ball = { position: new THREE.Vector3(0, hitY + 0.003, -0.5), velocity: new THREE.Vector3(0, 0, 40) };
  // (the face points toward -Z after rotating: check both sides)
  const contact = sweepBall(ball, prev, cur, dt, G);
  assert.ok(contact, 'contact found inside the frame');
  assert.ok(contact.tau > 0 && contact.tau <= 1);
  assert.ok(Math.abs(batSdf(contact.pointLocal)) < 0.002, 'contact point is on the surface');
});

test('sweet spot sends the ball faster than the toe or the shoulder', () => {
  const batVel = new THREE.Vector3(0, 0, 22); // bat face moving toward +Z at 22 m/s
  const ballVel = new THREE.Vector3(0, -2, -36); // ball coming in at 36 m/s
  const exitAt = (y, x = 0) => {
    const pointLocal = new THREE.Vector3(x, y, BAT_SPEC.faceZ);
    const normalLocal = new THREE.Vector3(0, 0, 1);
    const contact = { pointLocal, normalLocal, normalWorld: normalLocal.clone(), pointWorld: pointLocal.clone() };
    return resolveImpact({ ballVelocity: ballVel, batPointVelocity: batVel, contact });
  };
  const sweet = exitAt(SWEET_SPOT_Y);
  const toe = exitAt(BAT_SPEC.toe + 0.02);
  const shoulder = exitAt(BAT_SPEC.shoulder - 0.03);
  const edge = exitAt(SWEET_SPOT_Y, BAT_SPEC.bladeWidth / 2 - 0.005);
  assert.equal(sweet.quality.region, 'sweet');
  assert.ok(sweet.exitSpeed > toe.exitSpeed + 5, `sweet ${sweet.exitSpeed.toFixed(1)} vs toe ${toe.exitSpeed.toFixed(1)}`);
  assert.ok(sweet.exitSpeed > shoulder.exitSpeed + 3, `sweet vs shoulder ${shoulder.exitSpeed.toFixed(1)}`);
  assert.ok(sweet.exitSpeed > edge.exitSpeed, 'off-centre loses energy to twist');
  // A well-timed drive with a 22 m/s bat and a 36 m/s ball leaves at 32-40 m/s
  assert.ok(sweet.exitSpeed > 30 && sweet.exitSpeed < 42, `sweet-spot exit ${sweet.exitSpeed.toFixed(1)} m/s`);
  assert.ok(sweet.sting < toe.sting && toe.sting > 0.5);
  const h = impactHaptics(toe);
  assert.ok(h.bottom.duration > impactHaptics(sweet).bottom.duration);
});

test('a still bat (forward defence) kills the ball', () => {
  const pointLocal = new THREE.Vector3(0, SWEET_SPOT_Y, BAT_SPEC.faceZ);
  const n = new THREE.Vector3(0, 0, 1);
  const r = resolveImpact({
    ballVelocity: new THREE.Vector3(0, 0, -30),
    batPointVelocity: new THREE.Vector3(),
    contact: { pointLocal, normalLocal: n, normalWorld: n, pointWorld: pointLocal },
  });
  // Rebound well below the incoming speed (effective mass < bat mass, COR about 0.5)
  assert.ok(r.velocity.z > 5 && r.velocity.z < 14, `rebound ${r.velocity.z.toFixed(1)}`);
});

test('effective mass is largest near the centre of mass', () => {
  const n = new THREE.Vector3(0, 0, 1);
  const at = (y) => 1 / inverseEffectiveMass(new THREE.Vector3(0, y, BAT_SPEC.faceZ), n);
  assert.ok(at(BAT_SPEC.centerOfMassY) > at(BAT_SPEC.toe + 0.03));
  assert.ok(at(BAT_SPEC.centerOfMassY) <= BAT_SPEC.mass + 1e-9);
  assert.ok(restitutionAt(new THREE.Vector3(0, SWEET_SPOT_Y, 0), 30) > restitutionAt(new THREE.Vector3(0, BAT_SPEC.toe + 0.01, 0), 30));
});
