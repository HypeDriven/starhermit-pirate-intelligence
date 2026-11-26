use std::f64::consts::{PI, TAU};

const MAX_SHIPS: usize = 32;
const POSE_FIELDS: usize = 6;
const HULL_FIELDS: usize = 11;
const CAMERA_FIELDS: usize = 21;
const BUFFER_SIZE: usize = MAX_SHIPS * HULL_FIELDS;

// Pack a fleet into one call. JavaScript fills and reads this buffer one batch
// at a time, so switching phases needs neither a copy nor a new allocation.
static mut MOTION: [f64; BUFFER_SIZE] = [0.0; BUFFER_SIZE];

#[no_mangle]
pub extern "C" fn motion_buffer() -> *mut f64 {
    (&raw mut MOTION).cast()
}

#[no_mangle]
pub extern "C" fn motion_capacity() -> usize {
    MAX_SHIPS
}

fn blend(dt: f64, rate: f64) -> f64 {
    1.0 - (-dt * rate).exp()
}

pub(crate) fn angle_delta(from: f64, to: f64) -> f64 {
    let delta = to - from;
    // Headings usually arrive already normalized. Only reduce large accumulated turns.
    let delta = if delta.abs() <= TAU {
        delta
    } else {
        delta % TAU
    };
    if delta > PI {
        delta - TAU
    } else if delta < -PI {
        delta + TAU
    } else {
        delta
    }
}

#[no_mangle]
pub extern "C" fn smooth_poses(count: usize, dt: f64) {
    let rows = unsafe {
        std::slice::from_raw_parts_mut(motion_buffer(), count.min(MAX_SHIPS) * POSE_FIELDS)
    };
    let t = blend(dt.max(0.0), 12.0);
    for row in rows.chunks_exact_mut(POSE_FIELDS) {
        let [x, z, heading, tx, tz, target_heading] =
            *<&[f64; POSE_FIELDS]>::try_from(&*row).unwrap();
        let dx = tx - x;
        let dz = tz - z;
        if dx * dx + dz * dz > 144.0 {
            row[..3].copy_from_slice(&[tx, tz, target_heading]);
        } else {
            row[..3].copy_from_slice(&[
                x + dx * t,
                z + dz * t,
                heading + angle_delta(heading, target_heading) * t,
            ]);
        }
    }
}

#[no_mangle]
pub extern "C" fn pose_hulls(count: usize, dt: f64, elapsed: f64) {
    let rows = unsafe {
        std::slice::from_raw_parts_mut(motion_buffer(), count.min(MAX_SHIPS) * HULL_FIELDS)
    };
    let t = blend(dt, 3.0);
    let furl_step = dt * 0.45;
    for row in rows.chunks_exact_mut(HULL_FIELDS) {
        let [x, heading, pitch, bob, roll, furl, furl_target, wave, wave_height, sx, sz] =
            *<&[f64; HULL_FIELDS]>::try_from(&*row).unwrap();
        let base_height = (elapsed * 1.3 + x).sin() * 0.12;
        let base_roll = (elapsed + x).sin() * 0.012;
        let mut height = base_height;
        let mut next_pitch = pitch * (1.0 - t);
        let mut next_bob = bob;
        let mut next_roll = roll;
        let mut visible_roll = base_roll;
        if wave != 0.0 {
            let (sin, cos) = heading.sin_cos();
            let previous_height = if bob.is_nan() { base_height } else { bob };
            next_bob = previous_height + (wave_height - previous_height) * t;
            next_pitch = pitch + (-(sx * sin + sz * cos).atan() - pitch) * t;
            next_roll = roll + ((sx * cos - sz * sin).atan() - roll) * t;
            height = next_bob;
            visible_roll += next_roll;
        }
        let next_furl = if furl.is_nan() {
            furl_target
        } else {
            furl + (furl_target - furl).clamp(-furl_step, furl_step)
        };
        row[..6].copy_from_slice(&[
            height,
            next_pitch,
            visible_roll,
            next_bob,
            next_roll,
            next_furl,
        ]);
    }
}

#[no_mangle]
pub extern "C" fn pose_camera() {
    let frame = unsafe { &mut *motion_buffer().cast::<[f64; CAMERA_FIELDS]>() };
    let [yaw, range, battle, aim_x, aim_z, focus_x, focus_z, foe_dx, foe_dz, target_yaw, dt, elapsed, zoom, deck, orbit_yaw, orbit_pitch, shake, narrow, away, has_foe, metres] =
        *frame;
    let next_battle = battle + (has_foe - battle) * blend(dt, 1.5);
    let (aim_x, aim_z, gap) = if has_foe != 0.0 {
        (foe_dx, foe_dz, (foe_dx * foe_dx + foe_dz * foe_dz).sqrt())
    } else {
        (aim_x, aim_z, 0.0)
    };
    let focus_x = focus_x + aim_x * 0.45 * next_battle;
    let focus_z = focus_z + aim_z * 0.45 * next_battle;
    let target_range = if narrow != 0.0 { 1.2 } else { 1.0 }
        * if away != 0.0 { 1.15 } else { 1.0 }
        * (1.0 + next_battle * ((gap * 0.24).clamp(1.3, 3.4) - 1.0));
    let next_range =
        range + (target_range - range) * blend(dt, if has_foe != 0.0 { 2.0 } else { 5.0 });
    let next_yaw = yaw + angle_delta(yaw, target_yaw) * blend(dt, 4.0);
    let cx = focus_x * zoom * metres;
    let cz = focus_z * zoom * metres;
    let dist = 1.0 - zoom;
    let quake = shake * zoom;
    let qx = (elapsed * 53.0).sin() * quake * 0.6;
    let qy = (elapsed * 71.0).sin() * quake * 0.4;
    let yaw_now = next_yaw + orbit_yaw * zoom;
    let below = deck > 0.0;
    let elevation = (if below { 0.74 } else { 0.25 } + orbit_pitch * zoom).clamp(0.12, 1.42);
    let reach = if below { 62.8 } else { 74.0 } * zoom * next_range;
    let (elev_sin, elev_cos) = elevation.sin_cos();
    let (yaw_sin, yaw_cos) = yaw_now.sin_cos();
    let flat = elev_cos * reach;
    frame[..13].copy_from_slice(&[
        next_yaw,
        next_range,
        next_battle,
        aim_x,
        aim_z,
        focus_x,
        focus_z,
        qx + cx + 340.0 * dist + yaw_sin * flat,
        qy + 660.0 * dist + elev_sin * reach,
        cz + 540.0 * dist + yaw_cos * flat,
        cx,
        zoom * if below { 3.0 } else { 7.5 },
        cz,
    ]);
}
