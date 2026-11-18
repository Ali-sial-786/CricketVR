// Run / go back / dive from the two controllers in the bat's yoke.
//
// Both faceplates sit just below your bottom hand, so the same actions work
// on either controller. Use whichever one your thumb lands on.
//
// WebXR "xr-standard" gamepad layout for Touch Plus:
//   buttons[0] trigger   buttons[1] grip   buttons[3] thumbstick press
//   buttons[4] A / X     buttons[5] B / Y  axes[2], axes[3] thumbstick
//
// Default mapping:
//   A or X                       -> run      (call and set off for a run)
//   B or Y                       -> back     (turn back / "no!")
//   thumbstick click or flick    -> dive     (only while running)
// The triggers and grips face into the yoke and aren't used.
// Dives that start mid-swing are ignored so a hard shot can't trigger one.
export const BUTTONS = Object.freeze({ trigger: 0, grip: 1, stick: 3, a: 4, b: 5 });

export const DEFAULT_MAPPING = Object.freeze({ run: ['a'], back: ['b'], dive: ['stick', 'flick'] });

export class BatInput {
  constructor({ mapping = DEFAULT_MAPPING, onAction = () => {}, flickThreshold = 0.9, swingGuardRadPerSec = 7, swingGuardHoldMs = 180, repeatMs = 250 } = {}) {
    this.mapping = mapping;
    this.onAction = onAction;
    this.flickThreshold = flickThreshold;
    this.swingGuardRadPerSec = swingGuardRadPerSec;
    this.swingGuardHoldMs = swingGuardHoldMs;
    this.repeatMs = repeatMs;
    this.down = new Map(); // `${pad}:${input}` -> boolean
    this.lastFired = {};
    this.lastSwingMs = -Infinity;
  }

  isDown(gamepad, input) {
    if (input === 'flick') {
      const x = gamepad.axes[2] || 0;
      const y = gamepad.axes[3] || 0;
      return Math.hypot(x, y) >= this.flickThreshold;
    }
    const b = gamepad.buttons[BUTTONS[input]];
    return !!b && b.pressed;
  }

  // gamepads: { left, right } Gamepad objects (either may be null)
  // context: { timeMs, batAngularSpeed, running }
  update(gamepads, { timeMs, batAngularSpeed = 0, running = false }) {
    if (batAngularSpeed > this.swingGuardRadPerSec) this.lastSwingMs = timeMs;
    for (const [padName, pad] of Object.entries(gamepads)) {
      for (const [action, inputs] of Object.entries(this.mapping)) {
        for (const input of inputs) {
          const key = `${padName}:${input}`;
          const isDown = pad ? this.isDown(pad, input) : false;
          const was = this.down.get(key) || false;
          this.down.set(key, isDown);
          if (!isDown || was) continue;
          if (action === 'dive' && (!running || timeMs - this.lastSwingMs < this.swingGuardHoldMs)) continue;
          // pressing on both controllers at once counts as one action
          if (timeMs - (this.lastFired[action] ?? -Infinity) < this.repeatMs) continue;
          this.lastFired[action] = timeMs;
          this.onAction(action, { timeMs, controller: padName });
        }
      }
    }
  }
}
