// Desktop preview: a scripted batter that "holds" the printed handle and
// plays a straight drive at each ball. It produces the same two controller
// poses the headset would, so the full BatRig -> physics pipeline runs even
// without a headset.
import * as THREE from 'three';
import { nominalMounts } from '../bat/batRig.js';
import { SWEET_SPOT_Y, BAT_SPEC } from '../bat/batSpec.js';

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export class AutoBatter {
  constructor(hand = 'right') {
    this.setHand(hand);
    this.plan = null;
    this.matrix = new THREE.Matrix4();
  }

  setHand(hand) {
    this.hand = hand === 'left' ? 'left' : 'right';
    this.mounts = nominalMounts(this.hand);
  }

  // Called when a ball is bowled; `crossing` is the predicted point and
  // time (seconds from now) where it reaches the batting plane.
  planShot(nowSec, crossing, lineXValue) {
    const target = crossing.point;
    const handsY = THREE.MathUtils.clamp(target.y - SWEET_SPOT_Y - BAT_SPEC.faceZ * 0, 0.82, 1.25);
    this.plan = { tImpact: nowSec + crossing.time, x: target.x, handsY, lineX: lineXValue };
  }

  batPose(t, lineXValue) {
    const p = this.plan;
    const ta = p ? p.tImpact : Infinity;
    let phi = -0.25 + 0.02 * Math.sin(t * 1.7);
    let forward = 0;
    if (p) {
      if (t > ta - 0.75 && t < ta - 0.16) phi = THREE.MathUtils.lerp(-0.25, -1.9, smooth((t - (ta - 0.75)) / 0.59));
      else if (t >= ta - 0.16 && t < ta + 0.7) phi = 1.9 * Math.tanh(((t - ta) * 34) / 1.9);
      else if (t >= ta + 0.7) phi = THREE.MathUtils.lerp(1.9, -0.25, smooth((t - ta - 0.7) / 1.2));
      forward = -0.22 * Math.tanh((t - ta) * 9) * (t < ta + 0.7 ? 1 : 1 - smooth((t - ta - 0.7) / 1.2));
    }
    const x = p ? p.x : lineXValue;
    const y = p ? p.handsY : 1.0;
    const q = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), phi)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return this.matrix.compose(new THREE.Vector3(x, y, forward), q, new THREE.Vector3(1, 1, 1));
  }

  // Controller poses (gripSpace) for the BatRig, like an XR frame gives.
  controllerPoses(t, lineXValue) {
    const bat = this.batPose(t, lineXValue);
    const out = {};
    for (const key of ['top', 'bottom']) {
      const m = bat.clone().multiply(this.mounts[key].matrix);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      m.decompose(position, quaternion, new THREE.Vector3());
      out[this.mounts[key].hand] = { position, quaternion, emulatedPosition: false };
    }
    return out;
  }
}
