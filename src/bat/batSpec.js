// Physical and virtual bat numbers.
//
// Bat frame (all modules use it): origin on the handle axis at the shoulder
// line, where the printed handle sits on the controller frame. +Y points up
// the handle, +Z points out of the hitting face, +X = Y x Z. Metres, kg.
// (In the .scad file that is: X_bat = x, Y_bat = z, Z_bat = -y.)
import mount from './mountProfile.json' with { type: 'json' };

export const MOUNT = mount;

const mm = (v) => v / 1000;

// Virtual bat: a short-handle (SH) senior bat, about 85 cm long, 1.18 kg.
// Laws of Cricket, Law 5: length <= 96.5 cm, width <= 10.8 cm, depth <= 6.7 cm,
// edges <= 4.0 cm.
// The printed handle is the bat's handle, and the virtual blade starts just
// below it. The controller sits inside the top of the virtual blade.
const handleTop = mm(mount.handleLength) + 0.002; // top of the knob
const shoulder = mm(mount.headTop) - 0.02;
const bladeLength = 0.61;
const toe = shoulder - bladeLength;

export const BAT_SPEC = Object.freeze({
  handleTop,
  shoulder,
  toe,
  bladeLength,
  length: handleTop - toe,
  handleRadius: 0.0185,
  gripRadius: 0.0198,
  bladeWidth: 0.108,
  // Face plane sits slightly in front of the handle axis
  faceZ: 0.017,
  edgeThickness: 0.038,
  spineThickness: 0.063,
  // Collision box depth (face to back); the spine hump is visual only
  collisionDepth: 0.05,
  edgeRadius: 0.013,
  ballRadius: 0.036, // men's ball: 22.4-22.9 cm circumference
  ballMass: 0.16,
  mass: 1.18,
  // Balance point about 55 cm from the top of the handle (typical "mid" pickup)
  centerOfMassY: handleTop - 0.55,
  // Moments of inertia about the centre of mass (kg m^2)
  inertiaSwing: 0.056, // about X (face-on impacts away from the CoM)
  inertiaEdge: 0.059, // about Z (edge-on swings)
  inertiaTwist: 0.0013, // about the long axis (impacts off the centre line)
  // Where the sweet spot (vibration node) is, measured from the toe
  sweetSpotFromToe: 0.17,
});

export const SWEET_SPOT_Y = BAT_SPEC.toe + BAT_SPEC.sweetSpotFromToe;
