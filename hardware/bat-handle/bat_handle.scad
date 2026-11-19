// CricketVR bat: a compact single-controller cricket bat attachment for
// Meta Quest 3 / 3S Touch Plus controllers, in the style of the short bat
// handles used for iB Cricket.
//
// How it works:
//   - A short, real bat handle for both hands (fits a standard cricket bat
//     rubber grip).
//   - ONE controller sits at the bottom of the handle, in line with it,
//     head up, like the start of the blade. Its faceplate faces up and
//     toward the hitting face, right under your bottom thumb (A/X = run,
//     B/Y = go back, thumbstick = dive), and it stays where the headset can
//     see its tracking LEDs. The other controller isn't used while batting.
//   - The controller's base rocks into a heel cup. One hook-and-loop strap
//     through the side spine holds it upright. When you swing, centrifugal
//     force pushes it down into the cup.
//   - An M8 threaded rod runs from the knob into the shoulder block and
//     clamps the two printed parts together.
//
// Units are mm. Z is the bat axis (+Z = up the handle). Z = 0 is the shoulder
// line where the handle sits on the frame. -Y is the hitting FACE (the
// faceplate tilts toward it). X runs edge to edge; the spine is on the -X edge.
//
// The controller numbers are estimates. Print part = "fit_test" first.

/* [Part to render] */
part = "frame"; // [frame, handle, fit_test, assembly, frame_upright, proxy_right, proxy_right_controls, strap_band, rod]

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
handle_length = 200;
// Edge to edge
handle_width = 30.5;
// Face to back (real bat handles are slightly oval)
handle_depth = 33;
// Shallow grip grooves (0 = smooth; leave smooth if you fit a rubber bat grip)
handle_grooves = 0;

/* [Rod: M8 threaded rod + 2 nuts + washer] */
rod_hole = 8.6;
// Counterbore for the top nut + washer in the knob
counterbore_d = 17.5;
counterbore_depth = 9;
// Hex pocket for the bottom nut, under the shoulder block
nut_af = 13.4;
nut_depth = 6.8;

/* [Frame] */
// Shoulder block between the handle and the controller head
shoulder_h = 11;
// Gap between the shoulder block / spine and the controller head
head_clearance = 2;
// Side spine thickness beside the head (it gets thicker below the head)
spine_t = 14;
// Controller axis sits this far toward the face, so the head is centred under the handle
pod_offset_y = -13;
// Heel cup: depth, floor, wall, and the low outer wall you rock the base over
cup_depth = 22;
cup_floor = 3;
cup_wall = 2.4;
cup_low_wall = 8;
// Strap slot through the spine
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
// Cavity semi-axes [x (side to side), y (front to back)] for the grip at height h
function pod_cav(h) = let(g = grip_at(h)) [g[1] / 2 + pad, g[0] / 2 + pad];

// ------------------------------------------------------------ key levels
z_head  = -(shoulder_h + head_clearance); // top of the controller
z_base  = z_head - controller_length;     // bottom of the grip
z_hbot  = z_base + stem_height;           // underside of the head
z_floor = z_base - cup_floor;             // bottom of the frame
z_strap = z_base + cup_depth + strap_gap; // bottom of the strap slot
z_thick = z_hbot - 8;                     // spine thickens below the head
// spine x range beside the head, and beside the grip (saddle side)
x_out   = -(head_width / 2 + head_clearance + spine_t);
x_in    = -(head_width / 2 + head_clearance);
x_in_lo = -(pod_cav(stem_height)[0] - 1.8);
cy      = pod_offset_y;
cup_ab  = pod_cav(cup_depth) + [cup_wall, cup_wall];
rod_len = handle_length - counterbore_depth + 8 + shoulder_h; // washer + nut at the knob

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
    translate([0, 0, -1]) cylinder(d = rod_hole, h = handle_length + 2);
    translate([0, 0, handle_length - counterbore_depth]) cylinder(d = counterbore_d, h = counterbore_depth + 1);
    // key slot that sits over the frame's tongue (sets the face direction)
    translate([-3.3, -15, -1]) cube([6.6, 30, 5]);
    if (handle_grooves > 0)
      for (i = [0 : handle_grooves - 1]) rotate(i * 360 / handle_grooves)
        translate([0, 0, 6]) linear_extrude(handle_length - 20, twist = 160, convexity = 4)
          translate([handle_width / 2 + 0.25, 0]) circle(r = 0.9, $fn = 12);
  }
}

// ---------------------------------------------------------------- frame --
// Volume the controller's grip takes up (grip + foam)
module grip_keepout() {
  translate([0, cy, z_base]) loft(-0.01, stem_height + 2, pod_cav(-0.01), pod_cav(stem_height + 2));
}

module frame_solid() {
  hb = [handle_width / 2, handle_depth / 2];
  // shoulder block: carries the handle and joins the spine
  hull() {
    translate([0, 0, -shoulder_h]) linear_extrude(shoulder_h) se2d(hb, 2);
    rbox(x_out, x_in, cy - 11, cy + 13, -shoulder_h, 0);
  }
  // tongue that keys into the handle's slot
  translate([-3, -14.5, 0]) cube([6, 29, 3.5]);
  // spine beside the head
  rbox(x_out, x_in, cy - 11, cy + 13, z_thick, -shoulder_h + 0.01);
  // spine beside the grip: thicker and as deep as the cup, so the cup sits on it
  hull() {
    rbox(x_out, x_in_lo, cy - cup_ab[1], cy + cup_ab[1], z_floor, z_thick - 8);
    rbox(x_out, x_in, cy - 11, cy + 13, z_thick, z_thick + 0.01);
  }
  // heel cup around the grip base
  translate([0, cy, 0]) rbox(-cup_ab[0], cup_ab[0], -cup_ab[1], cup_ab[1], z_floor, z_base + cup_depth, 6);
}

module frame() {
  difference() {
    frame_solid();
    grip_keepout();
    // hole in the cup floor: base LED and the wrist lanyard
    translate([0, cy, z_floor - 1]) cylinder(d = 16, h = cup_floor + 2);
    // lower the outer (+X) cup wall so the base rocks in (45 degree slope);
    // limited to the outer half so the spine side stays full height
    intersection() {
      translate([cup_ab[0], cy, z_base + cup_low_wall]) rotate([0, 45, 0]) translate([-60, -60, 0]) cube(120);
      translate([-2, cy - 40, z_floor]) cube([60, 80, 60]);
    }
    // rod channel and the hex pocket for the bottom nut (fit it before the controller)
    translate([0, 0, -shoulder_h - 1]) cylinder(d = rod_hole, h = shoulder_h + 6);
    translate([0, 0, -shoulder_h - 0.01]) cylinder(d = nut_af / cos(30), h = nut_depth, $fn = 6);
    // strap slot through the spine, front to back, pointed top for printing
    translate([x_in_lo - 0.5 - 2 - strap_thick, cy - 60, z_strap]) {
      cube([strap_thick, 120, strap_width]);
      translate([strap_thick / 2, 0, strap_width]) rotate([-90, 0, 0])
        linear_extrude(120) rotate(45) square(strap_thick / sqrt(2), center = true);
    }
    // "FACE" on the flat face side of the spine
    if (engrave)
      translate([(x_out + x_in) / 2, cy - 11 + 0.6, (z_thick - shoulder_h) / 2])
        rotate([90, -90, 0]) linear_extrude(3)
          text("FACE", size = 5, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
  }
}

// Printing orientation: lying on the spine's flat outer face, so the layers
// run along the spine (strongest way) and nothing needs support.
module frame_print() {
  translate([0, 0, -x_out]) rotate([0, -90, 0]) frame();
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

// Controller in the frame: upright, trigger toward the back (+Y), faceplate
// tilting toward the FACE (-Y).
module placed() {
  translate([0, cy, z_base]) rotate(90) children();
}

// The strap, shown as a band around the grip and through the spine slot
module strap_band() {
  xs = x_in_lo - 0.5 - 2 - strap_thick / 2;
  translate([0, 0, z_strap + 0.5]) linear_extrude(strap_width - 1) difference() {
    hull() {
      translate([0, cy]) se2d(pod_cav(cup_depth + 12) - [pad - 1.2, pad - 1.2]);
      translate([xs, cy]) square([strap_thick, 2 * pod_cav(cup_depth + 12)[1] - 4], center = true);
    }
    hull() {
      translate([0, cy]) se2d(pod_cav(cup_depth + 12) - [pad, pad]);
      translate([xs, cy]) square([0.4, 2 * pod_cav(cup_depth + 12)[1] - 6], center = true);
    }
  }
}

module rod() {
  translate([0, 0, -shoulder_h]) cylinder(d = 8, h = rod_len, $fn = 24);
}

module assembly() {
  color("DarkOrange") frame();
  color("DimGray") handle();
  color("Black") strap_band();
  color("WhiteSmoke") placed() { proxy_shell(); proxy_controls(); }
}

// ------------------------------------------------- numbers for the game --
// tools/export-stl.mjs reads this line and writes src/bat/mountProfile.json.
// mm, SCAD axes (origin = shoulder line on the handle axis).
echo(str("MOUNT_JSON{",
  "\"handleLength\":", handle_length, ",",
  "\"handleSize\":[", handle_width, ",", handle_depth, "],",
  "\"podY\":", pod_offset_y, ",",
  "\"headTop\":", z_head, ",",
  "\"gripBase\":", z_base, ",",
  "\"gripOriginZ\":", z_base + grip_origin, ",",
  "\"frameBottom\":", z_floor, ",",
  "\"frameWidth\":", cup_ab[0] - x_out, ",",
  "\"spineX\":[", x_out, ",", x_in, "],",
  "\"controllerLength\":", controller_length, ",",
  "\"rodLength\":", rod_len,
  "}"));

if (z_strap + strap_width > z_hbot - 4)
  echo("WARNING: the strap slot reaches the controller head; reduce cup_depth or strap_gap.");

if (part == "frame") frame_print();
else if (part == "frame_upright") frame();
else if (part == "handle") handle();
else if (part == "fit_test") fit_test();
else if (part == "assembly") assembly();
else if (part == "proxy_right") proxy_shell();
else if (part == "proxy_right_controls") proxy_controls();
else if (part == "strap_band") strap_band();
else if (part == "rod") rod();
