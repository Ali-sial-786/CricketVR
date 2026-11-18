# Dual-controller bat handle

A small 3D-printed handle that holds both Meta Quest 3 / 3S Touch Plus
controllers as one rigid bat. You keep run, go back and dive under your
thumb and index finger while batting.

![Design sheet](renders/design-sheet.png)

## How it works

- **Top-hand controller** goes in upside down, grip first, into the top
  sleeve. Your top hand grips the printed sleeve like a bat handle. The
  controller's faceplate faces up, where the headset can see its tracking
  LEDs.
- **Bottom-hand controller** pushes its base up into the bottom cup. You hold
  it normally, so the thumb reaches **A/B** and the index finger reaches the
  **trigger**.
- Both triggers face the engraved **TRIGGER ▲** mark.
- A hook-and-loop strap around each slotted rim clamps each controller.
  1.5 mm EVA foam tape lines the inside for a snug, rattle-free fit.
- Nothing covers either faceplate. Those are the LEDs Quest 3 tracks.

For a right-handed batter the **left** controller goes on top. For a
left-handed batter, the **right** one goes on top. It's the same print either
way.

## Files

| File | What it is |
| --- | --- |
| `bat_handle.scad` | Parametric source (OpenSCAD 2021.01+). Every size is a named parameter. |
| `stl/bat_handle_body.stl` | The handle, oriented for printing (bottom rim on the plate). |
| `stl/fit_test_rings.stl` | Two 10 mm rings to check the grip size before the full print. |
| `renders/design-sheet.png` | The design picture above. |

## 1. Check the fit first (about 15 minutes)

The grip sizes in the file are estimates. I couldn't measure a real Touch
Plus controller, so print `fit_test_rings.stl` first.

- Ring with **one notch**: the grip 15 mm above its bottom.
- Ring with **two notches**: the grip 45 mm above its bottom.

Slide each ring over the grip from the bottom, notch toward the trigger. It
should go on with a hair of play, less than 1 mm of wiggle.

If a ring is tight or loose, measure the grip with calipers at those two
heights. Then set these in `bat_handle.scad`:

```
grip_depth_low  = 37;  // front-to-back (trigger side to back) at 15 mm
grip_width_low  = 33;  // side-to-side at 15 mm
grip_depth_high = 40;  // front-to-back at 45 mm
grip_width_high = 35;  // side-to-side at 45 mm
stem_height     = 62;  // grip bottom up to the lowest point of the trigger
```

Re-export with OpenSCAD (`part = "body"`), or run `npm run export-stl` from
the repo root. That also updates the numbers the game uses.

## 2. Print

Both printers handle this part easily. It stands on the bottom rim and needs
no supports.

| Setting | Bambu Lab A1 | Bambu Lab P2S |
| --- | --- | --- |
| Filament | PETG (e.g. PETG HF / Basic) | PETG; PETG-CF if you want it stiffer (needs a hardened nozzle) |
| Plate | Textured PEI | Textured PEI |
| Layer height | 0.20 mm | 0.20 mm |
| Wall loops | 4 | 4 |
| Infill | 25 % gyroid | 25 % gyroid |
| Supports | Off | Off |
| Brim | 5 mm outer brim (the A1's bed moves, and the slotted rim has a small footprint) | 3–5 mm outer brim |
| Rough time | about 1.5 h | about 1 h |

The part is about 30 g, 83.5 mm tall, and 48.7 × 43.6 mm at its widest. Use
PETG rather than PLA, because PETG is tougher if the bat clips a wall or a
table. The times are rough estimates, so check your slicer.

## 3. What else you need

- 2 × hook-and-loop straps, 20 mm wide (or narrower), about 25 cm long.
- 1.5 mm self-adhesive EVA foam tape.
- Optional: a tennis overgrip around the top-hand part for a real bat feel.

## 4. Assemble

1. Line both cavities with foam tape: the top sleeve and the bottom cup. Keep
   it off the ledge in the middle. Add a second layer anywhere a controller
   still wobbles.
2. Loosely wrap a strap in each strap groove.
3. **Top hand:** drop that controller into the top sleeve grip first, upside
   down, trigger facing the **TRIGGER ▲** mark, until its base sits on the
   ledge. Tighten the top strap.
4. **Bottom hand:** push the other controller's base up into the bottom cup,
   trigger on the same side. Tighten the bottom strap.
5. Optional but recommended: feed each controller's wrist lanyard out
   through the side windows and wear them on your wrists.

To take the controllers out, open the straps and slide them out.

## Buttons while batting

All of these are on the bottom-hand controller:

| Button | Action |
| --- | --- |
| A (right) / X (left) | Run |
| B (right) / Y (left) | Go back |
| Trigger, full pull | Dive (only while running; presses that start mid-swing are ignored) |

The grip button isn't mapped, because your bottom hand squeezes it the whole
time. The top controller's buttons are still reachable for menus if you lift
your top hand.

## Safety

The handle makes your swing light and fast. Clear plenty of space (at least
2 m around you), wear the wrist lanyards, and check the straps before each
session.

## Changing the design

Open `bat_handle.scad` in OpenSCAD and use the Customizer panel. Useful knobs:

- `foam`, `clearance`: tighter or looser fit.
- `top_depth`, `bottom_depth`: how far each controller sits inside.
- `wall`: thicker or thinner handle (a thinner handle is closer to a real bat).
- `flutes = 0`: smooth outside. `engrave = false`: no text.
- `part = "assembly"`: preview with simplified stand-in controllers.

After changing sizes, run `npm run export-stl` so the game's
`src/bat/mountProfile.json` matches the printed part.
