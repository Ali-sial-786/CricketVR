// CricketVR bat: a compact single-controller cricket bat attachment for
// Meta Quest 3 / 3S Touch Plus controllers, in the style of the short bat
// handles used for iB Cricket. Every part is 3D printed: nothing to buy.
//
// How it works:
//   - A short bat handle for both hands, with printed grip grooves.
//   - ONE controller sits at the bottom of the handle, in line with it,
//     head up, like the start of the blade. Its faceplate faces up and
//     toward the hitting face, right under your bottom thumb (A/X = run,
//     B/Y = go back, thumbstick = dive), and it stays where the headset can
//     see its tracking LEDs. The other controller isn't used while batting.
//   - The controller's base rocks into a heel cup with small crush ribs. Its
//     grip clicks into a printed snap clip. When you swing, centrifugal force
//     pushes it down into the cup.
//   - A printed bolt goes up through the frame's shoulder block and screws
//     into a thread inside the bottom of the handle.
//
// Parts (all PETG, no supports): handle, frame, bolt, clip (+ fit_test).
//
// Units are mm. Z is the bat axis (+Z = up the handle). Z = 0 is the shoulder
// line where the handle sits on the frame. -Y is the hitting FACE (the
// faceplate tilts toward it). X runs edge to edge; the spine is on the -X edge.
//
// The controller numbers are estimates. Print part = "fit_test" first.

/* [Part to render] */
part = "frame"; // [frame, handle, bolt, clip, fit_test, assembly, frame_upright, bolt_placed, clip_placed, proxy_right, proxy_right_controls]

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
// Clearance per side around the grip
clearance = 0.3;
// Crush ribs inside the heel cup: how far they stick in (0 = none)
rib_height = 0.5;

/* [Handle] */
handle_length = 200;
handle_d = 31;
// Printed grip grooves (0 = smooth)
handle_grooves = 10;

/* [Printed bolt] */
thread_d = 18;
thread_pitch = 3.5;
thread_depth = 1.7;
// Extra room in the handle's thread (raise it if the bolt is too tight)
thread_tol = 0.35;
// How far the bolt screws into the handle
bolt_engage = 22;
bolt_head_d = 23;
bolt_head_h = 6;

/* [Snap clip] */
clip_h = 14;
clip_wall = 3.0;
// Where the clip's mouth starts, as a fraction of the grip half-width past
// its centre (bigger = tighter snap, smaller = easier)
clip_wrap = 0.42;
clip_tol = 0.25;
tongue_len = 6.5;
tongue_w0 = 9;
tongue_w1 = 13;

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
// Height of the clip above the bottom of the grip
clip_z = 30;
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
// Cavity semi-axes [x (side to side), y (front to back)] for the grip at height h
function pod_cav(h) = let(g = grip_at(h)) [g[1] / 2 + clearance, g[0] / 2 + clearance];

// ------------------------------------------------------------ key levels
z_head  = -(shoulder_h + head_clearance); // top of the controller
z_base  = z_head - controller_length;     // bottom of the grip
z_hbot  = z_base + stem_height;           // underside of the head
z_floor = z_base - cup_floor;             // bottom of the frame
z_thick = z_hbot - 8;                     // spine thickens below the head
z_clip  = z_base + clip_z;                // bottom of the clip
x_out   = -(head_width / 2 + head_clearance + spine_t);
x_in    = -(head_width / 2 + head_clearance);
x_in_lo = -(pod_cav(stem_height)[0] - 1.8);
cy      = pod_offset_y;
cup_ab  = pod_cav(cup_depth) + [cup_wall, cup_wall];
clip_ab = pod_cav(clip_z + clip_h / 2);
cb_d    = bolt_head_d + 1;                // counterbore for the bolt head
cb_h    = bolt_head_h + 0.4;
bolt_len = shoulder_h - cb_h + bolt_engage - 1;

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
// Hole profile with a 45 degree point toward +X (up when the frame is
// printed on its side), so horizontal holes need no support.
module teardrop(r) {
  hull() { circle(r); translate([r * sqrt(2), 0]) square(0.01, center = true); }
}

// --------------------------------------------------------------- thread --
// A round single-start thread: an off-centre circle twisted along Z.
module thread_solid(major_d, len) {
  e = thread_depth / 2;
  linear_extrude(height = len, twist = -360 * len / thread_pitch, slices = ceil(len / thread_pitch * 24), convexity = 10)
    translate([e, 0]) circle(r = major_d / 2 - e, $fn = 48);
}

// --------------------------------------------------------------- handle --
module handle() {
  r = handle_d / 2;
  difference() {
    union() {
      cylinder(r = r, h = handle_length - 8);
      // knob: a gentle flare and a rounded top
      hull() {
        translate([0, 0, handle_length - 8]) cylinder(r = r, h = 0.01);
        translate([0, 0, handle_length - 4]) cylinder(r = r + 1.5, h = 0.01);
        translate([0, 0, handle_length]) cylinder(r = r - 1, h = 0.01);
      }
    }
    // thread for the printed bolt, with a lead-in chamfer
    translate([0, 0, -1]) thread_solid(thread_d + 2 * thread_tol, bolt_engage + 2);
    translate([0, 0, -0.01]) cylinder(d1 = thread_d + 2, d2 = thread_d - 2, h = 2);
    if (handle_grooves > 0)
      for (i = [0 : handle_grooves - 1]) rotate(i * 360 / handle_grooves)
        translate([0, 0, 12]) linear_extrude(handle_length - 26, twist = 150, convexity = 4)
          translate([r + 0.3, 0]) circle(r = 1.0, $fn = 12);
  }
}

// ----------------------------------------------------------------- bolt --
module bolt() {
  difference() {
    cylinder(d = bolt_head_d, h = bolt_head_h);
    // knurl for fingertip tightening
    for (i = [0 : 17]) rotate(i * 20) translate([bolt_head_d / 2 + 0.2, 0, -1]) cylinder(r = 1.1, h = bolt_head_h + 2, $fn = 12);
  }
  translate([0, 0, bolt_head_h - 0.01]) intersection() {
    thread_solid(thread_d, bolt_len);
    // chamfered tip so it starts easily
    cylinder(d1 = thread_d + 6, d2 = thread_d - 3, h = bolt_len);
  }
}

// ----------------------------------------------------------------- clip --
// Printed flat. A C-shaped spring that the controller's grip clicks into,
// with a dovetail tongue that slides into the frame's spine.
module clip_outline() {
  a = clip_ab;
  union() {
    se2d(a + [clip_wall, clip_wall]);
    polygon([[-a[0] - clip_wall + 1, -tongue_w0 / 2], [-a[0] - clip_wall - tongue_len, -tongue_w1 / 2],
             [-a[0] - clip_wall - tongue_len, tongue_w1 / 2], [-a[0] - clip_wall + 1, tongue_w0 / 2]]);
  }
}
module clip_2d() {
  a = clip_ab;
  x_cut = clip_wrap * a[0];
  difference() {
    clip_outline();
    se2d(a);
    translate([x_cut, -60]) square([100, 120]);
    // lead-in at the arm tips
    intersection() { offset(delta = 0.9) se2d(a); translate([x_cut - 3, -60]) square([100, 120]); }
  }
}
module clip() { linear_extrude(clip_h, convexity = 4) clip_2d(); }

// ---------------------------------------------------------------- frame --
// Volume the controller's grip takes up
module grip_keepout() {
  translate([0, cy, z_base]) loft(-0.01, stem_height + 2, pod_cav(-0.01), pod_cav(stem_height + 2));
}

module frame_solid() {
  // shoulder block: carries the handle and joins the spine
  hull() {
    translate([0, 0, -shoulder_h]) linear_extrude(shoulder_h) hull() {
      circle(d = handle_d);
      translate([3.5, 0]) circle(d = handle_d);
    }
    rbox(x_out, x_in, cy - 11, cy + 13, -shoulder_h, 0);
  }
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

module cup_ribs() {
  // three small crush ribs (back, front, spine side) for a snug, rattle-free fit
  for (p = [[0, 1], [0, -1], [-1, 0]]) {
    c = pod_cav(cup_depth / 2);
    translate([p[0] * (c[0] + 0.8 - rib_height), cy + p[1] * (c[1] + 0.8 - rib_height), z_base + 1])
      cylinder(r = 0.8, h = cup_depth - 3, $fn = 12);
  }
}

module frame() {
  difference() {
    union() {
      difference() {
        frame_solid();
        grip_keepout();
      }
      if (rib_height > 0) intersection() {
        cup_ribs();
        translate([0, cy, 0]) rbox(-cup_ab[0], cup_ab[0], -cup_ab[1], cup_ab[1], z_floor, z_base + cup_depth, 6);
      }
    }
    // hole in the cup floor: base LED and the wrist lanyard
    translate([0, cy, z_floor - 1]) cylinder(d = 16, h = cup_floor + 2);
    // lower the outer (+X) cup wall so the base rocks in (45 degree slope);
    // limited to the outer half so the spine side stays full height
    intersection() {
      translate([cup_ab[0], cy, z_base + cup_low_wall]) rotate([0, 45, 0]) translate([-60, -60, 0]) cube(120);
      translate([-2, cy - 40, z_floor]) cube([60, 80, 60]);
    }
    // bolt hole and the counterbore for its head, under the shoulder block
    translate([0, 0, -shoulder_h - 1]) linear_extrude(shoulder_h + 2) teardrop(thread_d / 2 + 0.4);
    translate([0, 0, -shoulder_h - 0.01]) linear_extrude(cb_h) teardrop(cb_d / 2);
    // clip pocket: dovetail slot in the spine, entered from the side just
    // below the head and slid down into place
    translate([0, cy, z_clip]) linear_extrude(z_thick - z_clip + clip_h + 2) offset(delta = clip_tol) clip_outline();
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
// Two 10 mm rings. Each should slide over the grip from the bottom with a
// hair of play. One notch = 15 mm size, two notches = 45 mm size; the notch
// side goes toward the trigger.
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

// Bolt and clip where they sit in the assembled bat
// (rotated so its thread lines up with the handle's)
module bolt_placed() { translate([0, 0, -shoulder_h]) rotate(360 / thread_pitch * (bolt_head_h - shoulder_h + 1)) bolt(); }
module clip_placed() { translate([0, cy, z_clip]) clip(); }

module assembly() {
  color("DarkOrange") frame();
  color("DimGray") handle();
  color("Gold") bolt_placed();
  color("Gold") clip_placed();
  color("WhiteSmoke") placed() { proxy_shell(); proxy_controls(); }
}

// ------------------------------------------------- numbers for the game --
// tools/export-stl.mjs reads this line and writes src/bat/mountProfile.json.
// mm, SCAD axes (origin = shoulder line on the handle axis).
echo(str("MOUNT_JSON{",
  "\"handleLength\":", handle_length, ",",
  "\"handleSize\":[", handle_d, ",", handle_d, "],",
  "\"podY\":", pod_offset_y, ",",
  "\"headTop\":", z_head, ",",
  "\"gripBase\":", z_base, ",",
  "\"gripOriginZ\":", z_base + grip_origin, ",",
  "\"clipZ\":", z_clip, ",",
  "\"frameBottom\":", z_floor, ",",
  "\"frameWidth\":", cup_ab[0] - x_out, ",",
  "\"spineX\":[", x_out, ",", x_in, "],",
  "\"controllerLength\":", controller_length, ",",
  "\"boltLength\":", bolt_len + bolt_head_h,
  "}"));

if (z_clip + clip_h > z_hbot - 4)
  echo("WARNING: the clip reaches the controller head; lower clip_z.");

if (part == "frame") frame_print();
else if (part == "frame_upright") frame();
else if (part == "handle") handle();
else if (part == "bolt") bolt();
else if (part == "clip") clip();
else if (part == "fit_test") fit_test();
else if (part == "assembly") assembly();
else if (part == "bolt_placed") bolt_placed();
else if (part == "clip_placed") clip_placed();
else if (part == "proxy_right") proxy_shell();
else if (part == "proxy_right_controls") proxy_controls();
