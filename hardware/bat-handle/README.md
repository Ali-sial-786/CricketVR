# CricketVR bat

A compact 3D-printed cricket bat attachment for one Meta Quest 3 / 3S Touch
Plus controller, in the style of the short bat handles used with iB Cricket.
You hold a real bat handle with both hands, and the controller is clipped
at the bottom of it with its buttons right under your bottom thumb.

**Nothing to buy.** Every part is printed: handle, frame, bolt and clip.

![Design sheet](renders/design-sheet.png)

## How it works

- **Handle:** a short bat handle, 31 mm round and 200 mm long, with printed
  grip grooves.
- **One controller** sits at the bottom of the handle, in line with it,
  head up, like the start of the blade.
  - Its faceplate faces up and toward the hitting face, right under your
    bottom thumb.
  - That also keeps its tracking LEDs where the headset can see them.
  - Either controller works. Put the other one down while you bat.
- **Heel cup + snap clip:** the controller's base rocks into a heel cup
  with small crush ribs for a snug fit. Its grip then clicks into a printed
  snap clip. Swinging pushes it down into the cup, not out.
- **Printed bolt:** goes up through the frame's shoulder block and screws
  into a thread printed inside the bottom of the handle. Once the
  controller is in, it sits right under the bolt head, so the bolt can't
  back out.
- **Either batting hand:** it's the same bat for left- and right-handed
  batters.
- **Size:** about 35 cm long with the controller fitted, 6 cm wide.

## Files

| File | What it is |
| --- | --- |
| `bat_handle.scad` | Parametric source (OpenSCAD 2021.01+). Every size is a named parameter. |
| `stl/handle.stl` | The handle, standing on its knob. |
| `stl/frame.stl` | The controller frame, lying on its flat spine. |
| `stl/bolt.stl` | The bolt that holds the handle on, head down. |
| `stl/clip.stl` | The snap clip for the controller's grip, flat. |
| `stl/fit_test_rings.stl` | Two 10 mm rings to check the grip size before the full print. |
| `renders/design-sheet.png` | The design picture above. |

All the STLs are already oriented for printing.

## 1. Check the fit first (about 15 minutes)

The controller sizes in the file are estimates. I couldn't measure a real
Touch Plus controller, so print `fit_test_rings.stl` first.

- Ring with **one notch**: the grip 15 mm above its bottom.
- Ring with **two notches**: the grip 45 mm above its bottom.

Slide each ring over the grip from the bottom, notch toward the trigger. It
should go on with a hair of play, less than 1 mm of wiggle.

If not, measure the grip with calipers at those two heights. Set these in
`bat_handle.scad`, then re-export (`npm run export-stl` from the repo root,
or OpenSCAD with the `part` you need):

```
grip_depth_low  = 37;  // front-to-back (trigger side to back) at 15 mm
grip_width_low  = 33;  // side-to-side at 15 mm
grip_depth_high = 40;  // front-to-back at 45 mm
grip_width_high = 35;  // side-to-side at 45 mm
head_width      = 43;  // thickness of the head, side to side
```

## 2. Print

Four parts, all PETG, no supports.

| Setting | Bambu Lab A1 | Bambu Lab P2S |
| --- | --- | --- |
| Filament | PETG | PETG |
| Plate | Textured PEI | Textured PEI |
| Layer height | 0.20 mm (0.16 mm for the bolt) | same |
| Wall loops | 4 (6 for the bolt and clip) | same |
| Infill | 15 % gyroid (handle), 25 % gyroid (frame), 100 % (bolt, clip) | same |
| Supports | Off | Off |
| Brim | 5 mm on the handle | 3 mm on the handle |

- **Handle:** 200 mm tall, stands on its knob.
- **Frame:** lies on its flat spine, so the layers run along the spine,
  which is the strongest way.
- **Bolt:** prints head down.
- **Clip:** prints flat, so its arms flex along the layers and spring back
  well.
- **Material and time:** about 135 g of PETG and roughly 3 hours for
  everything. These are estimates, so check your slicer.

## 3. Assemble the bat (once)

1. Slide the clip into the spine. Put its dovetail into the slot just below
   where the controller head will sit, then push it down until it stops.
   The open side of the clip faces away from the spine.
2. Put the handle on top of the frame's shoulder block. From underneath,
   screw the bolt up through the block into the handle, fingertight.

## 4. Put the controller in

Hold the bat so the **FACE** mark faces you.

1. Tilt the controller outward (away from the spine) and set its base in
   the heel cup.
2. Swing it upright, **trigger toward the back** (away from you), until the
   grip clicks into the clip. The faceplate now tilts toward the FACE side,
   under the handle.

To take it out, pull the controller's head outward to unclip it and lift
it out of the cup.

**Tuning the fit:**
- **Clip too stiff or too loose:** change `clip_wrap` (smaller is easier)
  and reprint just the clip. It's a 10-minute print.
- **Cup rattles or is too tight:** change `rib_height`.
- **Bolt too tight or too loose:** change `thread_tol`.

## Buttons while batting

Your bottom thumb reaches down onto the faceplate:

| Button | Action |
| --- | --- |
| A (right controller) / X (left) | Run |
| B (right controller) / Y (left) | Go back |
| Thumbstick: click, or flick it hard in any direction | Dive (only while running; ignored mid-swing) |

The trigger and grip face into the frame and aren't used.

## Safety

Clear plenty of space around you (at least 2 m) before swinging. The
controller is at the business end of the bat, so check that it has clicked
into the clip and that the bolt is snug before each session. The wrist
lanyard can come out through the hole in the cup floor if you want to wear
it.

## Changing the design

Open `bat_handle.scad` in OpenSCAD and use the Customizer panel. Useful knobs:

- `handle_length`, `handle_d`: handle size.
- `handle_grooves = 0`: a smooth handle (for example under a rubber grip
  you already own).
- `shoulder_h`, `head_clearance`: how far below the handle the faceplate
  sits. Smaller is an easier thumb reach, but `shoulder_h` must stay about
  11 mm to hold the bolt head.
- `clearance`, `rib_height`, `clip_wrap`, `thread_tol`: fit.
- `part = "assembly"`: preview with a simplified stand-in controller.

After changing sizes, run `npm run export-stl` so the game's
`src/bat/mountProfile.json` matches the printed parts.
