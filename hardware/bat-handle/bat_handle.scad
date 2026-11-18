// CricketVR mini bat: a proper two-hand bat handle with both Meta Quest 3 /
// 3S Touch Plus controllers mounted side by side just below it.
//
// How it works:
//   - Both hands grip a real, round bat handle (it takes a standard cricket
//     bat rubber grip). No controller is in your hands.
//   - Below the handle, a "yoke" holds both controllers upright, side by
//     side, like the shoulders of a bat. Their faceplates face up toward
//     your bottom hand, so your thumb drops straight onto A/X (run), B/Y (go
//     back) and the thumbstick (dive).
//   - Each controller's base sits in a heel cup: rock it in, stand it
//     upright, and one hook-and-loop strap through the centre spine holds it.
//     When you swing, centrifugal force pushes the controllers down into
//     their cups.
//   - An M8 threaded rod runs from the knob to the bottom of the yoke and
//     clamps the two printed parts together.
//   - Nothing covers the faceplates, which hold the tracking LEDs.
//
// Units are mm. Z is the bat axis (+Z = up the handle). Z = 0 is the shoulder
// line where the handle sits on the yoke. -Y is the hitting FACE (the
// faceplates tilt toward it). X runs edge to edge. Looking at the face, the
// left controller goes in the left pod.
//
// The controller numbers are estimates. Print part = "fit_test" first.

/* [Part to render] */
part = "yoke"; // [yoke, handle, fit_test, assembly, proxy_right, proxy_right_controls, strap_bands, rod]

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
// Head, side to side (the controller's thickness)
head_width = 43;
// Overall length, bottom of the grip to the top of the head
controller_length = 126;
// From the bottom of the grip up to the lowest point of the head on the trigger side
stem_height = 62;
// From the bottom of the grip to the WebXR grip-pose origin (game only, estimate)
grip_origin = 40;

/* [Fit] */
// EVA foam tape lining thickness (0 = no foam)
foam = 1.5;
// Extra clearance per side on top of the foam
clearance = 0.3;

/* [Handle] */
handle_length = 230;
// Edge to edge
handle_width = 30.5;
// Face to back (real bat handles are slightly oval)
handle_depth = 33;
// Shallow grip grooves (0 = smooth; leave smooth if you fit a rubber bat grip)
handle_grooves = 0;

/* [Rod: M8 threaded rod + 2 nuts + 2 washers] */
rod_hole = 8.6;
// Counterbore for a nut and washer at each end
counterbore_d = 17.5;
counterbore_depth = 9;

/* [Controller pods] */
// Faceplate tops sit this far below the handle (smaller = easier thumb reach)
head_gap = 4;
// Gap between each controller head and the centre spine
head_clearance = 2;
// Spine thickness between the controller heads (holds the rod)
spine_top = 16;
// Spine thickness between the grips (saddles are cut into it)
spine_bottom = 30;
// Grips sit this far toward the face from the handle axis
pod_offset_y = -3;
// Heel cup: depth, floor, wall, and the low outer wall you rock the base over
cup_depth = 22;
cup_floor = 3;
cup_wall = 2.4;
cup_low_wall = 8;
// Strap slots through the spine (one 20 mm strap per controller)
strap_width = 20.5;
strap_thick = 3.2;
// Gap between the cup rim and the strap
strap_gap = 3;
// Engraved "FACE" on the hitting side
engrave = true;

/* [Quality] */
profile_points = 160;
$fn = 64;

// ---------------------------------------------------------------- math --
function lerp(a, b, t) = a + (b - a) * t;
function spow(v, p) = v >= 0 ? pow(v, p) : -pow(-v, p);
// Grip size [front-to-back, side-to-side] at height h above the grip bottom
function grip_at(h) = let(t = (h - 15) / 30)
  [lerp(grip_depth_low, grip_depth_high, t), lerp(grip_width_low, grip_width_high, t)];
pad = foam + clearance;
// Pod cavity semi-axes [x (side to side), y (front to back)]
function pod_cav(h) = let(g = grip_at(h)) [g[1] / 2 + pad, g[0] / 2 + pad];

// ------------------------------------------------------------ key levels
pod_x   = spine_top / 2 + head_clearance + head_width / 2; // controller axis, each side
z_head  = -head_gap;                      // top of each controller
z_base  = z_head - controller_length;     // bottom of each grip
z_hbot  = z_base + stem_height;           // underside of the head
z_floor = z_base - cup_floor;             // underside of the yoke
z_strap = z_base + cup_depth + strap_gap; // bottom of the strap slots
z_thick = z_hbot - 8;                     // spine thickens below the heads
rod_len = handle_length - z_floor - 2 * counterbore_depth + 2 * 7; // two nuts ~6.5 mm, a little thread spare

// ------------------------------------------------------------- 2D shapes
module se2d(ab, n = grip_shape, N = profile_points) {
  polygon([for (i = [0 : N - 1])
    let(t = i * 360 / N) [ab[0] * spow(cos(t), 2 / n), ab[1] * spow(sin(t), 2 / n)]]);
}
module loft(z0, z1, ab0, ab1, n = grip_shape) {
  translate([0, 0, z0])
    linear_extrude(height = z1 - z0, scale = [ab1[0] / ab0[0], ab1[1] / ab0[1]], convexity = 6)
      se2d(ab0, n);
}
module rbox(x0, x1, y0, y1, z0, z1, r = 2.5) {
  hull() for (x = [x0 + r, x1 - r], y = [y0 + r, y1 - r])
    translate([x, y, z0]) cylinder(r = r, h = z1 - z0, $fn = 24);
}

// --------------------------------------------------------------- handle --
module handle() {
  ab = [handle_width / 2, handle_depth / 2];
  difference() {
    union() {
      loft(0, handle_length - 8, ab, ab, 2);
      // knob: a gentle flare and a rounded top
      hull() {
        translate([0, 0, handle_length - 8]) linear_extrude(0.01) se2d(ab, 2);
        translate([0, 0, handle_length - 4]) linear_extrude(0.01) se2d(ab + [1.5, 1.5], 2);
        translate([0, 0, handle_length]) linear_extrude(0.01) se2d(ab - [1, 1], 2);
      }
    }
    // rod channel and the counterbore for the top nut + washer
    translate([0, 0, -1]) cylinder(d = rod_hole, h = handle_length + 2);
    translate([0, 0, handle_length - counterbore_depth]) cylinder(d = counterbore_d, h = counterbore_depth + 1);
    // key slot that sits over the yoke's tongue (sets the face direction)
    translate([-3.3, -15, -1]) cube([6.6, 30, 5]);
    if (handle_grooves > 0)
      for (i = [0 : handle_grooves - 1]) rotate(i * 360 / handle_grooves)
        translate([0, 0, 6]) linear_extrude(handle_length - 20, twist = 160, convexity = 4)
          translate([handle_width / 2 + 0.25, 0]) circle(r = 0.9, $fn = 12);
  }
}

// ----------------------------------------------------------------- yoke --
// Volume a controller's grip takes up in its pod (grip + foam)
module grip_keepout(side) {
  translate([side * pod_x, pod_offset_y, z_base])
    loft(-0.01, stem_height + 2, pod_cav(-0.01), pod_cav(stem_height + 2));
}

module heel_cup(side) {
  translate([side * pod_x, pod_offset_y, z_floor]) difference() {
    loft(0, cup_floor + cup_depth, pod_cav(0) + [cup_wall, cup_wall], pod_cav(cup_depth) + [cup_wall, cup_wall]);
    // hole in the floor: base LED and the wrist lanyard
    translate([0, 0, -1]) cylinder(d = 16, h = cup_floor + 2);
    // lower the outer wall so the base can be rocked in (45 degree slope),
    // limited to the outer half so the spine side stays full height
    x_out = pod_cav(0)[0] + cup_wall;
    intersection() {
      translate([side * x_out, 0, cup_floor + cup_low_wall])
        rotate([0, side * 45, 0]) translate([-50, -50, 0]) cube([100, 100, 100]);
      translate([side > 0 ? -2 : -60, -40, 0]) cube([62, 80, 60]);
    }
  }
}

module spine() {
  // deeper base block around the bottom nut counterbore
  rbox(-spine_bottom / 2, spine_bottom / 2, -16, 13, z_floor, z_floor + counterbore_depth + 4);
  hull() {
    rbox(-spine_bottom / 2, spine_bottom / 2, -15, 9, z_floor, z_thick - 8);
    rbox(-spine_top / 2, spine_top / 2, -15, 9, z_thick, z_thick + 0.1);
  }
  rbox(-spine_top / 2, spine_top / 2, -15, 9, z_thick, 0);
  // tongue that keys into the handle's slot
  translate([-3, -14.5, 0]) cube([6, 29, 3.5]);
}

module face_mark() {
  depth = 0.6;
  translate([0, -15 + depth, (z_thick + z_head) / 2 - 2])
    rotate([90, -90, 0]) linear_extrude(depth + 2)
      text("FACE", size = 5, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}

module yoke() {
  difference() {
    union() {
      spine();
      heel_cup(-1);
      heel_cup(1);
    }
    // saddles and cup cavities
    grip_keepout(-1);
    grip_keepout(1);
    // rod channel and the counterbore for the bottom nut + washer
    translate([0, 0, z_floor - 1]) cylinder(d = rod_hole, h = -z_floor + 10);
    translate([0, 0, z_floor - 1]) cylinder(d = counterbore_d, h = counterbore_depth + 1);
    // one strap slot per controller, either side of the rod, front to back
    for (side = [-1, 1])
      translate([side * (rod_hole / 2 + 1.6) - (side < 0 ? strap_thick : 0), -40, z_strap]) {
        cube([strap_thick, 80, strap_width]);
        // pointed top so the slot prints without support
        translate([strap_thick / 2, 0, strap_width]) rotate([-90, 0, 0])
          linear_extrude(80) rotate(45) square(strap_thick / sqrt(2), center = true);
      }
    if (engrave) face_mark();
  }
}

// ------------------------------------------------------------- fit test --
// Two 10 mm rings with no foam allowance. Each should slide over the grip
// from the bottom with a hair of play. One notch = 15 mm size, two notches =
// 45 mm size; the notch side goes toward the trigger.
module fit_ring(h, notches) {
  g = grip_at(h);
  c = [g[0] / 2 + clearance, g[1] / 2 + clearance];
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
// A rough Touch Plus stand-in for renders only. Do NOT size anything from
// it. Local frame: z = up the grip from its bottom, +x = trigger (nose)
// side, right hand (thumbstick on +y); mirror y for the left hand.
function g_xy(h) = let(g = grip_at(h)) [g[0] / 2, g[1] / 2];
module se_slice(z, ab) { translate([0, 0, z]) linear_extrude(0.01) se2d(ab, grip_shape, 72); }
module proxy_shell() {
  hull() {
    se_slice(0, g_xy(15) - [3, 3]);
    se_slice(3, g_xy(15) - [0.8, 0.8]);
    se_slice(15, g_xy(15));
    se_slice(45, g_xy(45));
  }
  hull() {
    se_slice(45, g_xy(45));
    se_slice(stem_height - 4, g_xy(stem_height) + [1, 1]);
    translate([10, 0, controller_length - 22]) rotate([0, -40, 0])
      linear_extrude(5, center = true) se2d([29, head_width / 2], 2.4, 72);
    translate([27, 0, stem_height + 10]) scale([1, 1.1, 1]) sphere(11);
  }
}
module proxy_controls() {
  translate([10, 0, controller_length - 22]) rotate([0, -40, 0]) {
    translate([4, 8, 2]) { cylinder(r = 4, h = 7); translate([0, 0, 7]) cylinder(r = 8, h = 3); }
    translate([12, -9, 2]) cylinder(r = 4.5, h = 2.5);
    translate([-2, -12, 2]) cylinder(r = 4.5, h = 2.5);
    translate([-14, -2, 2]) cylinder(r = 2.5, h = 1.5);
  }
  translate([33, 0, stem_height + 4]) rotate([0, 25, 0])
    hull() for (z = [-7, 7]) translate([0, 0, z]) scale([0.6, 1, 1]) sphere(7);
}

// Controller in its pod: upright, trigger toward the back (+Y), faceplate
// tilting toward the FACE (-Y). side = -1 left pod, +1 right pod.
module placed(side) {
  translate([side * pod_x, pod_offset_y, z_base]) rotate(90)
    if (side < 0) mirror([0, 1, 0]) children(); else children();
}

module strap_bands() {
  for (side = [-1, 1]) translate([0, 0, z_strap + 0.5]) linear_extrude(strap_width - 1)
    difference() {
      hull() {
        translate([side * pod_x, pod_offset_y]) se2d(pod_cav(cup_depth + 12) - [pad - 1.2, pad - 1.2]);
        translate([side * (rod_hole / 2 + 1.6 + strap_thick / 2), -3]) square([strap_thick, 26], center = true);
      }
      hull() {
        translate([side * pod_x, pod_offset_y]) se2d(pod_cav(cup_depth + 12) - [pad, pad]);
        translate([side * (rod_hole / 2 + 1.6 + strap_thick / 2), -3]) square([0.4, 24.4], center = true);
      }
    }
}

module rod() {
  translate([0, 0, z_floor + counterbore_depth - 7]) cylinder(d = 8, h = rod_len, $fn = 24);
}

module assembly() {
  color("DarkOrange") yoke();
  color("Tan") handle();
  color("DimGray") strap_bands();
  color("WhiteSmoke") placed(-1) { proxy_shell(); proxy_controls(); }
  color("WhiteSmoke") placed(1) { proxy_shell(); proxy_controls(); }
}

// ------------------------------------------------- numbers for the game --
// tools/export-stl.mjs reads this line and writes src/bat/mountProfile.json.
// mm, in the bat frame's SCAD axes (origin = shoulder line on the axis).
echo(str("MOUNT_JSON{",
  "\"handleLength\":", handle_length, ",",
  "\"handleSize\":[", handle_width, ",", handle_depth, "],",
  "\"podX\":", pod_x, ",",
  "\"podY\":", pod_offset_y, ",",
  "\"headTop\":", z_head, ",",
  "\"gripBase\":", z_base, ",",
  "\"gripOriginZ\":", z_base + grip_origin, ",",
  "\"yokeBottom\":", z_floor, ",",
  "\"yokeWidth\":", 2 * (pod_x + head_width / 2), ",",
  "\"controllerLength\":", controller_length, ",",
  "\"rodLength\":", rod_len,
  "}"));

if (z_strap + strap_width > z_hbot - 4)
  echo("WARNING: the strap slots reach the controller heads; reduce cup_depth or strap_gap.");

if (part == "yoke") yoke();
else if (part == "handle") handle();
else if (part == "fit_test") fit_test();
else if (part == "assembly") assembly();
else if (part == "proxy_right") proxy_shell();
else if (part == "proxy_right_controls") proxy_controls();
else if (part == "strap_bands") strap_bands();
else if (part == "rod") rod();
