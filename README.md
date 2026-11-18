# CricketVR

WebXR cricket for Meta Quest 3 / 3S, played with a 3D-printed bat handle that
holds both controllers.

![Bat handle design sheet](hardware/bat-handle/renders/design-sheet.png)

## What's here

| Path | What it is |
| --- | --- |
| `hardware/bat-handle/` | The printable dual-controller bat handle: OpenSCAD source, STLs, print guide. Start with its [README](hardware/bat-handle/README.md). |
| `src/bat/` | Game-side bat: turns the two controllers into one rigid bat, plus swept ball-bat collision, impact physics, haptics and run/back/dive input. Plain three.js ES modules. |
| `src/demo/` | A nets practice scene (bowling machine) to try the bat in the headset. |
| `test/` | Unit tests for the bat rig and the physics (`npm test`). |
| `tools/` | STL/mount export (`npm run export-stl`) and the design-sheet renderer (`npm run render-design`). |

## How the bat responds like a real bat

- **One rigid bat from two controllers.** Each controller gives its own
  estimate of the bat pose through its known seat in the handle
  (`src/bat/batRig.js`). The estimates are blended by tracking quality, so if
  one controller is blocked the other carries on with no jump. While both
  are tracked, the rig learns the exact offset between them, which absorbs
  foam and strap fit differences.
- **No tunnelling.** Contact is swept between frames. The bat pose is
  interpolated and the ball's flight sub-stepped, so a 40 m/s ball can't pass
  through a 30 m/s toe at 72 Hz (`src/bat/batPhysics.js`).
- **Real impact physics.** The impulse uses the bat's effective mass at the
  contact point (1.18 kg, real moments of inertia). Restitution peaks at the
  sweet spot and drops toward the toe and the splice. Friction gives spin
  and makes edges deflect. A well-timed drive off a 130 km/h ball leaves the
  middle at about 120 km/h; the same swing off the toe gives about 65 km/h.
- **Feel.** The middle gives a short, crisp haptic tap on both controllers.
  The toe and the splice buzz long and hard.
- **Buttons.** A/X = run, B/Y = go back, trigger = dive. All on the
  bottom-hand controller (`src/bat/batInput.js`).

## Try it in the headset

```bash
npm install
npm run dev
```

Open the printed `https://<your-computer-ip>:5173` address in the Quest
browser, accept the self-signed certificate warning, and press **Enter VR**.
WebXR needs HTTPS, which is why the dev server uses one. The page also has
sliders for lining up the virtual bat with your real handle: face roll,
forward tilt, and slide along the handle.

Without a headset, the same page shows a desktop preview: a scripted batter
plays a drive at each ball through the full pipeline.

## Use the bat in your own scene

```js
import { BatRig } from './src/bat/batRig.js';
import { createBatMesh } from './src/bat/batModel.js';
import { sweepBall, resolveImpact, impactHaptics } from './src/bat/batPhysics.js';

const rig = new BatRig({ battingHand: 'right' }); // or autoHand: true
// each XR frame: rig.update({ left: pose, right: pose }, dt)
// pose = { position, quaternion, emulatedPosition } from frame.getPose(gripSpace, refSpace)
// then sweepBall(ball, rig.prevPose, rig.pose, dt, gravity) -> resolveImpact(...)
```

See `src/demo/main.js` and `src/demo/ball.js` for the full loop.
