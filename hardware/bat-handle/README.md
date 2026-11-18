# CricketVR mini bat

A 3D-printed mini bat for Meta Quest 3 / 3S Touch Plus controllers. Both
hands grip a proper bat handle. Both controllers sit side by side just below
it, in the bat's "shoulders", with their buttons right under your bottom
thumb.

![Design sheet](renders/design-sheet.png)

## How it works

- **Handle:** a real two-hand bat handle, 30 × 33 mm oval and 230 mm long.
  It fits a standard cricket bat rubber grip. No controller is in your hands.
- **Yoke:** under the handle, it holds both controllers upright, side by
  side, like the shoulders of a bat. Their faceplates face up toward your
  bottom hand, so your thumb drops straight onto the buttons.
- **Heel cups + straps:** each controller's base rocks into a heel cup. One
  hook-and-loop strap per controller, threaded through the centre spine,
  holds it upright. Swinging pushes the controllers down into their cups,
  not out.
- **M8 threaded rod:** runs from the knob to the bottom of the yoke and
  clamps the two printed parts together, so the joint can't snap off
  mid-swing. It also adds some bat-like weight.
- **Tracking LEDs:** nothing covers the faceplates (that's where the LEDs
  are), and they face up toward the headset in your stance.
- **Either batting hand:** the bat is symmetric, so it's the same for left-
  and right-handed batters.

## Files

| File | What it is |
| --- | --- |
| `bat_handle.scad` | Parametric source (OpenSCAD 2021.01+). Every size is a named parameter. |
| `stl/handle.stl` | The handle, standing on its knob, ready to print. |
| `stl/yoke.stl` | The controller yoke, standing on its cups, ready to print. |
| `stl/fit_test_rings.stl` | Two 10 mm rings to check the grip size before the full print. |
| `renders/design-sheet.png` | The design picture above. |

## 1. Check the fit first (about 15 minutes)

The controller sizes in the file are estimates. I couldn't measure a real
Touch Plus controller, so print `fit_test_rings.stl` first.

- Ring with **one notch**: the grip 15 mm above its bottom.
- Ring with **two notches**: the grip 45 mm above its bottom.

Slide each ring over the grip from the bottom, notch toward the trigger. It
should go on with a hair of play, less than 1 mm of wiggle.

If not, measure the grip with calipers at those two heights. Set these in
`bat_handle.scad`, then re-export (`npm run export-stl` from the repo root,
or OpenSCAD with `part = "yoke"`):

```
grip_depth_low  = 37;  // front-to-back (trigger side to back) at 15 mm
grip_width_low  = 33;  // side-to-side at 15 mm
grip_depth_high = 40;  // front-to-back at 45 mm
grip_width_high = 35;  // side-to-side at 45 mm
head_width      = 43;  // thickness of the head, side to side
```

## 2. Print

Both parts print standing up with no supports.

| Setting | Bambu Lab A1 | Bambu Lab P2S |
| --- | --- | --- |
| Filament | PETG | PETG (PETG-CF works too with a hardened nozzle) |
| Plate | Textured PEI | Textured PEI |
| Layer height | 0.20 mm | 0.20 mm |
| Wall loops | 4 | 4 |
| Infill | 15 % gyroid (handle), 25 % gyroid (yoke) | same |
| Supports | Off | Off |
| Brim | 5 mm on the handle; 3 mm on the yoke | 3 mm on both |

- **Handle:** 230 mm tall, stands on its knob. It's tall and thin. On the A1
  use the brim and slow the outer walls a little, or just print it on the
  P2S.
- **Yoke:** 106 × 46 × 137 mm, stands on its cups.
- **Material and time:** about 140 g of PETG and roughly 3–4 hours for both
  parts. These are estimates, so check your slicer.

## 3. What else you need

- M8 threaded rod, cut to **360 mm**, with 2 × M8 nuts and 2 × M8 washers
  (16 mm). Any hardware store has them. A dome nut on the knob end looks
  nicer.
- 2 × hook-and-loop straps, 20 mm wide (or narrower), about 20 cm long.
- 1.5 mm self-adhesive EVA foam tape.
- Optional: a cricket bat rubber grip on the handle for the real feel.

## 4. Assemble the bat

1. Push the rod up through the yoke from the bottom. Add a washer and a nut
   in the bottom counterbore.
2. Slide the handle down over the rod so its slot sits on the yoke's tongue.
3. Add a washer and a nut in the knob counterbore. Tighten until the handle
   can't wiggle, then stop. Don't crush the plastic.
4. Line both heel cups and the spine saddles with foam tape.
5. Thread one strap through each spine slot.

## 5. Put the controllers in

Hold the bat so the **FACE** mark faces you. The left controller goes in the
left pod and the right one in the right pod. If you swap them, the game
notices and copes.

1. Tilt the controller outward and set its base in the heel cup.
2. Swing it upright against the spine, with the **trigger toward the back**
   (away from the FACE side). The faceplate then tilts toward the face.
3. Wrap the strap round its grip and press it closed.

To take a controller out, open its strap, tilt the controller outward and
lift it out.

## Buttons while batting

Your bottom thumb reaches down onto either faceplate. Both controllers do
the same thing:

| Button | Action |
| --- | --- |
| A (right) / X (left) | Run |
| B (right) / Y (left) | Go back |
| Thumbstick: click, or flick it hard in any direction | Dive (only while running; ignored mid-swing) |

The triggers and grip buttons face into the yoke and aren't used.

## Safety

Clear plenty of space around you (at least 2 m) before swinging. The
controllers are at the business end of the bat, so check the straps and the
rod nut before each session. The wrist lanyards can come out through the
holes in the cup floors if you want to wear them.

## Changing the design

Open `bat_handle.scad` in OpenSCAD and use the Customizer panel. Useful knobs:

- `handle_length`, `handle_width`, `handle_depth`: handle size.
- `handle_grooves = 8`: grip grooves if you won't fit a rubber grip.
- `head_gap`: how far below the handle the faceplates sit. Smaller is an
  easier thumb reach. Larger leaves more room between your hand and the
  LEDs.
- `foam`, `clearance`: tighter or looser fit.
- `part = "assembly"`: preview with simplified stand-in controllers.

After changing sizes, run `npm run export-stl` so the game's
`src/bat/mountProfile.json` matches the printed parts.
