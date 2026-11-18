// Cricket ball flight: gravity, air drag, pitch bounce, bat contact.
import * as THREE from 'three';
import { BAT_SPEC } from '../bat/batSpec.js';
import { sweepBall, resolveImpact } from '../bat/batPhysics.js';
import { PITCH } from './world.js';

export const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const R = BAT_SPEC.ballRadius;
// 0.5 * rho * Cd * area / mass
const DRAG_K = (0.5 * 1.2 * 0.45 * Math.PI * R * R) / BAT_SPEC.ballMass;

function stepFlight(p, v, dt) {
  const speed = v.length();
  v.addScaledVector(GRAVITY, dt).addScaledVector(v, -DRAG_K * speed * dt);
  p.addScaledVector(v, dt);
}

function onPitch(p, pitchX) {
  return Math.abs(p.x - pitchX) < PITCH.width / 2 && p.z < PITCH.stumpsZ + 1.5 && p.z > PITCH.stumpsZ - PITCH.length - 1.5;
}

function bounce(p, v, pitchX) {
  if (p.y >= R || v.y >= 0) return false;
  p.y = R;
  if (Math.abs(v.y) < 0.6) {
    v.y = 0; // rolling, not bouncing: rolling resistance is applied elsewhere
    return false;
  }
  const hard = onPitch(p, pitchX);
  const e = hard ? 0.55 : 0.42;
  const keep = hard ? 0.88 : 0.78;
  v.y = -v.y * e;
  v.x *= keep;
  v.z *= keep;
  return true;
}

// Launch velocity from `release` that pitches at `bounceAt` with `speed` m/s.
export function solveDelivery(release, bounceAt, speed) {
  const flat = new THREE.Vector3(bounceAt.x - release.x, 0, bounceAt.z - release.z).normalize();
  const heightAtBounce = (angle) => {
    const p = release.clone();
    const v = flat.clone().multiplyScalar(Math.cos(angle) * speed);
    v.y = Math.sin(angle) * speed;
    for (let i = 0; i < 2400; i++) {
      stepFlight(p, v, 1 / 480);
      if ((p.z - bounceAt.z) * Math.sign(flat.z) >= 0) return p.y - R;
    }
    return -10;
  };
  let lo = THREE.MathUtils.degToRad(-30);
  let hi = THREE.MathUtils.degToRad(15);
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (heightAtBounce(mid) > 0) hi = mid;
    else lo = mid;
  }
  const a = (lo + hi) / 2;
  const v = flat.multiplyScalar(Math.cos(a) * speed);
  v.y = Math.sin(a) * speed;
  return v;
}

export class Ball {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xa3161a, roughness: 0.45 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), mat);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 1.002, 0.0016, 6, 40), new THREE.MeshStandardMaterial({ color: 0xf5f0e6 }));
    this.mesh.add(seam);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.state = 'idle'; // idle | bowled | hit | dead
    this.hitCooldown = 0;
    this.time = 0;
    this.bounces = 0;
    this.pitchX = 0;
  }

  bowl(release, velocity, pitchX) {
    this.position.copy(release);
    this.velocity.copy(velocity);
    this.spin.set(0, 0, 0);
    this.state = 'bowled';
    this.time = 0;
    this.bounces = 0;
    this.hitCooldown = 0;
    this.pitchX = pitchX;
    this.mesh.visible = true;
    this.mesh.position.copy(this.position);
    this.landed = false;
    this.maxDistance = 0;
  }

  // Advances one frame. `bat` = { prev, cur, rig } or null.
  // Returns an event or null: { type: 'hit', impact, contact } | { type: 'bounce' } | ...
  update(dt, bat) {
    if (this.state === 'idle' || this.state === 'dead') return null;
    this.time += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    let event = null;

    if (bat && bat.rig.valid && this.hitCooldown === 0) {
      const contact = sweepBall({ position: this.position, velocity: this.velocity }, bat.prev, bat.cur, dt, GRAVITY);
      if (contact) {
        // move to the contact time, apply the impulse, finish the frame
        const t = contact.time;
        this.position.copy(contact.ballCenter);
        this.velocity.addScaledVector(GRAVITY, t);
        const origin = new THREE.Vector3().lerpVectors(bat.prev.position, bat.cur.position, contact.tau);
        const batPointVelocity = bat.rig.pointVelocity(contact.pointWorld, new THREE.Vector3(), origin);
        const impact = resolveImpact({ ballVelocity: this.velocity, ballSpin: this.spin, batPointVelocity, contact });
        if (!impact.separating) {
          this.velocity.copy(impact.velocity);
          this.spin.copy(impact.spin);
          this.hitCooldown = 0.12;
          this.state = 'hit';
          this.hitAt = this.position.clone();
          event = { type: 'hit', impact, contact, batSpeed: batPointVelocity.length() };
        }
        // nudge the ball off the surface so it can't re-collide
        this.position.addScaledVector(contact.normalWorld, 0.002);
        const rest = dt - t;
        stepFlight(this.position, this.velocity, rest);
        this.finish(event);
        return event;
      }
    }

    const sub = 4;
    for (let i = 0; i < sub; i++) {
      stepFlight(this.position, this.velocity, dt / sub);
      if (bounce(this.position, this.velocity, this.pitchX)) {
        this.bounces++;
        if (this.state === 'hit' && !this.landed) {
          this.landed = true;
          this.carry = this.flatDistanceFromBat();
          event = event || { type: 'landed', carry: this.carry };
        }
      }
    }
    if (this.position.y <= R + 1e-4 && this.velocity.y === 0) {
      // rolling resistance on the outfield
      const hs = Math.hypot(this.velocity.x, this.velocity.z);
      const ns = Math.max(0, hs - 0.9 * dt);
      if (hs > 0) {
        this.velocity.x *= ns / hs;
        this.velocity.z *= ns / hs;
      }
    }
    this.finish(event);

    // Bowled: ball passes through the stumps without being hit
    const sx = this.pitchX;
    if (this.state === 'bowled' && Math.abs(this.position.z - PITCH.stumpsZ) < R + 0.02 && Math.abs(this.position.x - sx) < PITCH.stumpsWidth / 2 + R && this.position.y < PITCH.stumpHeight + R) {
      this.state = 'dead';
      return { type: 'bowled' };
    }
    if (this.state === 'hit') {
      const d = this.flatDistanceFromBat();
      this.maxDistance = Math.max(this.maxDistance, d);
      if (d > PITCH.boundary) {
        this.state = 'dead';
        return { type: this.landed ? 'four' : 'six', distance: d };
      }
    }
    const speed = this.velocity.length();
    if (this.time > 9 || (this.position.y <= R + 1e-3 && speed < 0.4) || this.position.z > PITCH.stumpsZ + 25) {
      const was = this.state;
      this.state = 'dead';
      return { type: 'dead', wasHit: was === 'hit', distance: this.maxDistance };
    }
    return event;
  }

  flatDistanceFromBat() {
    const o = this.hitAt || new THREE.Vector3();
    return Math.hypot(this.position.x - o.x, this.position.z - o.z);
  }

  finish() {
    this.mesh.position.copy(this.position);
    if (this.spin.lengthSq() > 0) {
      const w = this.spin.length();
      this.mesh.rotateOnWorldAxis(this.spin.clone().divideScalar(w), w / 72);
    }
  }
}

// Predicts where the ball will cross a plane z = zPlane (for the desktop
// auto-batter). Returns { time, point } or null.
export function predictCrossing(ball, zPlane, pitchX) {
  const p = ball.position.clone();
  const v = ball.velocity.clone();
  let t = 0;
  for (let i = 0; i < 2000; i++) {
    stepFlight(p, v, 1 / 480);
    bounce(p, v, pitchX);
    t += 1 / 480;
    if (p.z >= zPlane) return { time: t, point: p };
  }
  return null;
}
