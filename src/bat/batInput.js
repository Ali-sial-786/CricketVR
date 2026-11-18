// Run / go back / dive from the bottom-hand controller (the one you hold
// normally in the bat handle).
//
// WebXR "xr-standard" gamepad layout for Touch Plus:
//   buttons[0] trigger   buttons[1] grip (squeeze)   buttons[3] thumbstick press
//   buttons[4] A / X     buttons[5] B / Y            axes[2], axes[3] thumbstick
//
// Default mapping (right-handed batter: right controller; left-handed: left):
//   A / X       -> run      (call and set off for a run)
//   B / Y       -> back     (turn back / "no!")
//   trigger     -> dive     (full pull, only counts while running)
// The grip button isn't mapped: your bottom hand squeezes it all the time
// while batting. Trigger presses that start mid-swing are ignored, so a
// hard shot can't dive by accident.
export const BUTTONS = Object.freeze({ trigger: 0, grip: 1, stick: 3, a: 4, b: 5 });

export const DEFAULT_MAPPING = Object.freeze({ run: 'a', back: 'b', dive: 'trigger' });

export class BatInput {
  constructor({ mapping = DEFAULT_MAPPING, onAction = () => {}, triggerThreshold = 0.85, swingGuardRadPerSec = 7, swingGuardHoldMs = 180 } = {}) {
    this.mapping = { ...mapping };
    this.onAction = onAction;
    this.triggerThreshold = triggerThreshold;
    this.swingGuardRadPerSec = swingGuardRadPerSec;
    this.swingGuardHoldMs = swingGuardHoldMs;
    this.down = {};
    this.lastSwingMs = -Infinity;
  }

  pressed(gamepad, name) {
    const b = gamepad.buttons[BUTTONS[name]];
    if (!b) return false;
    if (name === 'trigger') return b.value >= this.triggerThreshold;
    return b.pressed;
  }

  // gamepad: the bottom controller's Gamepad (or null)
  // context: { timeMs, batAngularSpeed, running }
  update(gamepad, { timeMs, batAngularSpeed = 0, running = false }) {
    if (batAngularSpeed > this.swingGuardRadPerSec) this.lastSwingMs = timeMs;
    if (!gamepad) {
      this.down = {};
      return;
    }
    for (const [action, button] of Object.entries(this.mapping)) {
      const isDown = this.pressed(gamepad, button);
      const was = this.down[action] || false;
      this.down[action] = isDown;
      if (!isDown || was) continue;
      if (action === 'dive') {
        if (!running) continue;
        if (button === 'trigger' && timeMs - this.lastSwingMs < this.swingGuardHoldMs) continue;
      }
      this.onAction(action, { timeMs });
    }
  }
}
