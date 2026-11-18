// CricketVR dual-controller bat handle
// For Meta Quest 3 / 3S Touch Plus controllers (no tracking rings).
//
// How it works:
//   - The TOP-hand controller drops grip-first, upside down, into the top
//     sleeve. Its faceplate (where the tracking LEDs are) ends up facing
//     up, like the knob of a bat, where the headset can see it.
//   - The BOTTOM-hand controller's base pushes up into the bottom cup.
//     You hold it normally, so the thumb reaches A/B and the stick and the
//     index finger reaches the trigger (run / go back / dive).
//   - A 20 mm hook-and-loop strap around each slotted rim clamps each
//     controller. EVA foam tape lines the inside.
//
// Units are mm. Z is the handle axis, +Z points to the top (knob)
// controller, and the part prints standing on the bottom-cup rim (z = 0)
// with no supports. +X is the "trigger side": put both controllers in with
// their triggers facing the engraved arrow.
//
// Every number under "Your controller" is an estimate. Measure your own
// controller, or print part = "fit_test" first (about 15 minutes).

/* [Part to render] */
part = "body"; // [body, fit_test, assembly, proxy_right, proxy_right_controls, strap_bands]

/* [Your controller (measure with calipers)] */
// Grip front-to-back (trigger side to back), 15 mm above the bottom of the grip
grip_depth_low = 37;
// Grip side-to-side, 15 mm above the bottom of the grip
grip_width_low = 33;
// Grip front-to-back, 45 mm above the bottom of the grip
grip_depth_high = 40;
// Grip side-to-side, 45 mm above the bottom of the grip
grip_width_high = 35;
// Cross-section shape: 2 = ellipse, 3 = rounded rectangle
grip_shape = 2.6;
// From the bottom of the grip up to the lowest point of the trigger/head on the trigger side
stem_height = 62;
// From the bottom of the grip to the WebXR grip-pose origin (game only, estimate)
grip_origin = 40;

/* [Fit] */
// EVA foam tape lining thickness (0 = no foam)
foam = 1.5;
// Extra clearance per side on top of the foam
clearance = 0.3;

/* [Handle] */
// Bottom cup depth, rim to the start of the seat
bottom_depth = 28;
// Top sleeve depth, ledge to the top rim (keep it at least 10 mm under stem_height)
top_depth = 48;
// Wall thickness
wall = 2.4;
// Width of the ledge both controller bases stop against
ledge_width = 4.5;
ledge_thick = 3;
// Strap groove width (fits 20 mm or narrower hook-and-loop straps)
strap_width = 20.5;
// Strap groove depth
strap_depth = 1.0;
// Lip at each rim that keeps the strap from sliding off
rim_lip = 1.5;
// Number of clamp slits per rim
slits = 6;
slit_width = 1.6;
// How far the slits run past the strap groove
slit_extra = 1.5;
// Side windows for the wrist lanyards (also let the base LED shine out)
windows = true;
window_w = 10;
window_h = 7;
// Shallow grip flutes on the outside (0 = smooth)
flutes = 28;
flute_depth = 0.45;
// Engraved "TRIGGER" arrow
engrave = true;

/* [Quality] */
profile_points = 224;
$fn = 64;

// ---------------------------------------------------------------- math --
function lerp(a, b, t) = a + (b - a) * t;
function spow(v, p) = v >= 0 ? pow(v, p) : -pow(-v, p);

// Grip size [front-to-back, side-to-side] at height h above the grip bottom.
function grip_at(h) = let(t = (h - 15) / 30)
  [lerp(grip_depth_low, grip_depth_high, t), lerp(grip_width_low, grip_width_high, t)];

pad = foam + clearance;
// Cavity and outer semi-axes [a (x), b (y)]
function cav_at(h) = grip_at(h) / 2 + [pad, pad];
function out_at(h) = cav_at(h) + [wall, wall];

// ------------------------------------------------------------ key Z levels
z_rim_b     = 0;                              // bottom cup rim (on the print bed)
z_seat      = bottom_depth;                   // seat chamfer starts
z_ledge_bot = z_seat + ledge_width;           // 45 degree seat
z_ledge_top = z_ledge_bot + ledge_thick;      // top controller base rests here
z_rim_t     = z_ledge_top + top_depth;        // top sleeve rim
// The bottom controller's rounded base edge lands about 2 mm up the 45 degree seat
z_base_b    = z_seat + min(2.0, ledge_width);
z_junction  = (z_base_b + z_ledge_top) / 2;   // origin of the game's bat frame

h_rim_b = z_base_b - z_rim_b;                 // bottom grip height at the bottom rim
h_rim_t = z_rim_t - z_ledge_top;              // top grip height at the top rim

finger_len = rim_lip + strap_width + slit_extra;

// ------------------------------------------------------------- 2D shapes
module se2d(ab, n = grip_shape, fl = 0, fd = 0, N = profile_points) {
  polygon([for (i = [0 : N - 1])
    let(t = i * 360 / N,
        p = [ab[0] * spow(cos(t), 2 / n), ab[1] * spow(sin(t), 2 / n)],
        r = norm(p),
        m = fl > 0 ? fd * pow(max(0, cos(fl * t)), 6) : 0)
      p * (r - m) / r]);
}

// Straight loft between two superellipse sections (same shape, scaled).
module loft(z0, z1, ab0, ab1, fl = 0, fd = 0) {
  translate([0, 0, z0])
    linear_extrude(height = z1 - z0, scale = [ab1[0] / ab0[0], ab1[1] / ab0[1]], convexity = 6)
      se2d(ab0, grip_shape, fl, fd);
}

// ---------------------------------------------------------------- body --
module outer_solid() {
  fl = flutes; fd = flute_depth;
  union() {
    loft(z_rim_b, z_seat, out_at(h_rim_b), out_at(0), fl, fd);
    loft(z_seat - 0.01, z_ledge_top + 0.01, out_at(0), out_at(0), fl, fd);
    loft(z_ledge_top, z_rim_t, out_at(0), out_at(h_rim_t), fl, fd);
  }
}

module cavities() {
  e = 0.02;
  ledge_hole = cav_at(0) - [ledge_width, ledge_width];
  // bottom cup (narrows toward the seat)
  loft(z_rim_b - 1, z_seat + e, cav_at(h_rim_b + 1), cav_at(0));
  // 45 degree seat under the ledge (printable without support)
  loft(z_seat, z_ledge_bot + e, cav_at(0), ledge_hole);
  // through-hole in the ledge (lanyards, airflow, saves plastic)
  loft(z_ledge_bot, z_ledge_top + e, ledge_hole, ledge_hole);
  // top sleeve (widens toward the rim, like the grip)
  loft(z_ledge_top, z_rim_t + 1, cav_at(0), cav_at(h_rim_t + 1));
}

// Ring-shaped cutter that leaves the outside at the groove floor.
module strap_groove(z0, h_mid) {
  translate([0, 0, z0])
    linear_extrude(height = strap_width, convexity = 4)
      difference() {
        square(200, center = true);
        offset(delta = -strap_depth) se2d(out_at(h_mid));
      }
}

// Vertical slits make flexible fingers that the strap squeezes in.
// up = true: slit opens toward +Z (top rim). Closed ends point 45 degrees
// so they print cleanly.
module slit_cuts(z_open, length, up) {
  // offset by half a pitch so no slit lands on the trigger (+X) or back (-X) side
  for (i = [0 : slits - 1]) rotate(180 / slits + i * 360 / slits) {
    if (up) {
      translate([0, -slit_width / 2, z_open - length]) cube([60, slit_width, length + 1]);
    } else {
      translate([0, -slit_width / 2, z_open - 1]) cube([60, slit_width, length + 1]);
      // pointed (45 degree) closed end on top
      translate([0, 0, z_open + length])
        rotate([0, 90, 0]) linear_extrude(60)
          rotate(45) square(slit_width / sqrt(2), center = true);
    }
  }
}

// Through-wall window with a 45 degree pointed top.
module window(z0, side, w, h) {
  rotate(side) translate([0, 0, z0])
    rotate([0, 90, 0]) linear_extrude(60) {
      translate([-h, -w / 2]) square([h, w]);
      translate([-h, 0]) rotate(45) square(w / sqrt(2), center = true);
    }
}

// "TRIGGER" plus an up arrow on the +X side, between the ledge and the top
// strap groove. Both controllers go in with their triggers on this side.
module trigger_mark() {
  depth = 0.6;
  z_text = z_ledge_top + 2;
  z_arrow = z_rim_t - rim_lip - strap_width - 10.5;
  x_s = out_at((z_arrow - z_ledge_top) / 2)[0] - flute_depth;
  translate([x_s - depth, 0, z_text])
    rotate([90, -90, 90]) linear_extrude(depth + 3)
      text("TRIGGER", size = 3.2, font = "Liberation Sans:style=Bold", halign = "left", valign = "center");
  translate([x_s - depth, 0, z_arrow])
    rotate([90, 0, 90]) linear_extrude(depth + 3) {
      polygon([[-2.6, 5], [2.6, 5], [0, 9]]);
      translate([-0.6, 0]) square([1.2, 5.2]);
    }
}

module body() {
  difference() {
    outer_solid();
    cavities();
    // strap grooves, each with a small lip at the rim
    strap_groove(z_rim_b + rim_lip, h_rim_b - rim_lip - strap_width / 2);
    strap_groove(z_rim_t - rim_lip - strap_width, h_rim_t - rim_lip - strap_width / 2);
    // clamp fingers
    slit_cuts(z_rim_b, finger_len, false);
    slit_cuts(z_rim_t, finger_len, true);
    // Bottom-cup windows on +/-X and top-sleeve windows on +/-Y, so the
    // junction never loses wall on the same side twice.
    if (windows) for (s = [0, 180]) {
      window(z_rim_b + finger_len + 1.0, s, window_w - 1, window_h - 2);
      window(z_ledge_top + 0.6, s + 90, window_w, window_h);
    }
    if (engrave) trigger_mark();
  }
}

// ------------------------------------------------------------- fit test --
// Two 10 mm rings with no foam allowance. Each should slide over the grip
// from the bottom with a hair of play. Ring with one notch = 15 mm size,
// two notches = 45 mm size. The notch side is the trigger side.
module fit_ring(h, notches) {
  c = grip_at(h) / 2 + [clearance, clearance];
  difference() {
    linear_extrude(10, convexity = 4) difference() {
      se2d(c + [2.0, 2.0]);
      se2d(c);
    }
    for (i = [1 : notches]) translate([c[0] + 1, (i - (notches + 1) / 2) * 5, 10])
      rotate([0, 45, 0]) cube(2.5, center = true);
  }
}

module fit_test() {
  fit_ring(15, 1);
  translate([0, grip_width_high + 12, 0]) fit_ring(45, 2);
}

// ------------------------------------------- controller stand-in (visual)
// A rough Touch Plus stand-in for renders and clearance checks only.
// Do NOT use it to size anything. Local frame: z = up the grip from its
// bottom, +x = trigger side. Right hand; mirror y for the left.
module se_slice(z, ab) { translate([0, 0, z]) linear_extrude(0.01) se2d(ab, grip_shape, 0, 0, 96); }

module proxy_shell() {
  g0 = grip_at(15) / 2; g1 = grip_at(45) / 2; g2 = grip_at(stem_height) / 2;
  hull() {
    se_slice(0, g0 - [3, 3]);
    se_slice(3, g0 - [0.8, 0.8]);
    se_slice(15, g0);
    se_slice(45, g1);
  }
  // head: grip top, faceplate puck tilted 40 degrees back, trigger nose
  hull() {
    se_slice(45, g1);
    se_slice(stem_height - 4, g2 + [1, 1]);
    translate([7, 0, stem_height + 36]) rotate([0, -40, 0])
      linear_extrude(5, center = true) se2d([29, 22], 2.4, 0, 0, 96);
    translate([25, 0, stem_height + 10]) scale([1, 1.1, 1]) sphere(11);
  }
}

module proxy_controls() {
  // thumbstick, two face buttons, menu button, trigger
  translate([7, 0, stem_height + 36]) rotate([0, -40, 0]) {
    translate([4, -8, 2]) { cylinder(r = 4, h = 7); translate([0, 0, 7]) cylinder(r = 8, h = 3); }
    translate([12, 9, 2]) cylinder(r = 4.5, h = 2.5);
    translate([-2, 12, 2]) cylinder(r = 4.5, h = 2.5);
    translate([-14, 2, 2]) cylinder(r = 2.5, h = 1.5);
  }
  translate([31, 0, stem_height + 4]) rotate([0, 25, 0])
    hull() for (z = [-7, 7]) translate([0, 0, z]) scale([0.6, 1, 1]) sphere(7);
}

// --------------------------------------------------------- assembly view --
module strap_bands() {
  // the two hook-and-loop straps, shown as bands sitting in their grooves
  for (b = [[z_rim_b + rim_lip, h_rim_b - rim_lip - strap_width / 2],
            [z_rim_t - rim_lip - strap_width, h_rim_t - rim_lip - strap_width / 2]])
    translate([0, 0, b[0] + 0.5]) linear_extrude(strap_width - 1) difference() {
      offset(delta = 0.6) se2d(out_at(b[1]));
      offset(delta = -strap_depth) se2d(out_at(b[1]));
    }
}

module assembly() {
  color("BurlyWood") body();
  color("DimGray") strap_bands();
  // right-handed batter: left controller on top (upside down), right below
  color("WhiteSmoke") translate([0, 0, z_ledge_top]) mirror([0, 1, 0]) { proxy_shell(); proxy_controls(); }
  color("WhiteSmoke") translate([0, 0, z_base_b]) rotate([180, 0, 0]) { proxy_shell(); proxy_controls(); }
}

// ------------------------------------------------- numbers for the game --
// tools/export-mount.mjs reads this line from the OpenSCAD console and
// writes src/bat/mountProfile.json. Distances are along the handle axis in
// mm, measured from z_junction (the bat frame origin).
echo(str("MOUNT_JSON{",
  "\"bodyHeight\":", z_rim_t - z_rim_b, ",",
  "\"junctionZ\":", z_junction, ",",
  "\"topBase\":", z_ledge_top - z_junction, ",",
  "\"bottomBase\":", z_base_b - z_junction, ",",
  "\"topGripOrigin\":", z_ledge_top + grip_origin - z_junction, ",",
  "\"bottomGripOrigin\":", z_base_b - grip_origin - z_junction, ",",
  "\"topRim\":", z_rim_t - z_junction, ",",
  "\"bottomRim\":", z_rim_b - z_junction, ",",
  "\"controllerLength\":126,",
  "\"outerAtJunction\":[", 2 * out_at(0)[0], ",", 2 * out_at(0)[1], "],",
  "\"outerAtTopRim\":[", 2 * out_at(h_rim_t)[0], ",", 2 * out_at(h_rim_t)[1], "]",
  "}"));

if (top_depth > stem_height - 10)
  echo("WARNING: top_depth is close to stem_height; the top rim may touch the top controller's trigger.");

if (part == "body") body();
else if (part == "fit_test") fit_test();
else if (part == "assembly") assembly();
else if (part == "proxy_right") proxy_shell();
else if (part == "proxy_right_controls") proxy_controls();
else if (part == "strap_bands") strap_bands();
