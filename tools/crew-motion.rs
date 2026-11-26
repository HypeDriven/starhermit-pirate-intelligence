//! Per-sailor locomotion and joint angles for the StarHermit scene adapter.
use std::f64::consts::FRAC_PI_2;

use crate::motion::{angle_delta, motion_buffer};

const FIELDS: usize = 16;
const MAX_CREW: usize = 6;

#[derive(Clone, Copy, PartialEq)]
enum Pose {
    Stand,
    Walk,
    Helm,
    Scope,
    Climb,
    Carry,
    Place,
    Hammer,
    Fish,
    Stir,
    Rest,
    Ram,
}

impl Pose {
    fn from_index(index: usize) -> Self {
        [
            Self::Stand,
            Self::Walk,
            Self::Helm,
            Self::Scope,
            Self::Climb,
            Self::Carry,
            Self::Place,
            Self::Hammer,
            Self::Fish,
            Self::Stir,
            Self::Rest,
            Self::Ram,
        ]
        .get(index)
        .copied()
        .unwrap_or(Self::Stand)
    }
}

// Rotations in display order: body X/Z, left leg X, left arm X/Z,
// right leg X, right arm X/Z. All unlisted axes are zero.
fn joints(pose: Pose, phase: f64, time: f64) -> [f64; 8] {
    use Pose::*;
    match pose {
        Walk => {
            let s = phase.sin();
            [0.0, 0.0, s * 0.55, -s * 0.45, 0.0, -s * 0.55, s * 0.45, 0.0]
        }
        Carry => {
            let s = phase.sin() * 0.45;
            [0.0, 0.0, s, -1.05, -0.25, -s, -1.05, 0.25]
        }
        Climb => {
            let c = (phase * 0.8).sin();
            [
                0.0,
                0.0,
                -0.5 - c * 0.4,
                -2.7 + c * 0.35,
                0.0,
                -0.5 + c * 0.4,
                -2.7 - c * 0.35,
                0.0,
            ]
        }
        Helm => {
            let turn = (time * 0.7).sin() * 0.12;
            [0.0, 0.0, 0.0, -1.2 + turn, -0.2, 0.0, -1.2 - turn, 0.2]
        }
        Scope => [0.0, 0.0, 0.0, -1.85, -0.15, 0.0, -2.25, 0.55],
        Place => {
            let k = 0.5 + 0.5 * (time * 3.0).sin();
            [
                0.25 * k,
                0.0,
                -0.35 * k,
                -0.7 - k * 0.5,
                0.0,
                -0.35 * k,
                -0.7 - k * 0.5,
                0.0,
            ]
        }
        Ram => {
            let k = (time * 2.6).sin();
            [
                0.12 + k * 0.06,
                0.0,
                -0.25,
                -1.3 + k * 0.35,
                0.0,
                0.3,
                -1.3 + k * 0.35,
                0.0,
            ]
        }
        Hammer => [
            0.18,
            0.0,
            -1.4,
            -0.6,
            0.0,
            0.2,
            -1.6 + (time * 6.0).sin().max(0.0) * 1.1,
            0.0,
        ],
        Fish => [
            0.0,
            0.0,
            0.0,
            -0.9,
            0.0,
            0.0,
            -0.9 + (time * 0.9).sin() * 0.08,
            0.0,
        ],
        Stir => {
            let (sin, cos) = (time * 3.0).sin_cos();
            [0.0, 0.0, 0.0, -0.4, 0.0, 0.0, -1.0 + sin * 0.25, cos * 0.25]
        }
        Rest => [0.0, FRAC_PI_2, -0.1, -0.2, 0.0, 0.1, -2.8, 0.0],
        Stand => {
            let swing = (time * 0.9).sin() * 0.04;
            [0.0, 0.0, 0.0, swing, 0.0, 0.0, -swing, 0.0]
        }
    }
}

#[no_mangle]
pub extern "C" fn pose_crew(count: usize, dt: f64) {
    let rows =
        unsafe { std::slice::from_raw_parts_mut(motion_buffer(), count.min(MAX_CREW) * FIELDS) };
    for row in rows.chunks_exact_mut(FIELDS) {
        // A hidden model has no waypoint or pose to update.
        if row[15] == 0.0 {
            continue;
        }
        let [mut x, mut y, mut z, mut face, mut phase, gx, gy, gz, heading, goal, time, prop, ..] =
            *<&[f64; FIELDS]>::try_from(&*row).unwrap();
        let dx = gx - x;
        let dy = gy - y;
        let dz = gz - z;
        let flat_squared = dx * dx + dz * dz;
        let climbing = dy.abs() > 0.3;
        let mut pose = Pose::from_index(goal as usize);
        if climbing {
            let step = (1.4 * dt / (dy * dy + flat_squared).sqrt().max(0.001)).min(1.0);
            x += dx * step;
            y += dy * step;
            z += dz * step;
            face = (-x).atan2(1.15 - z);
            phase += dt * 7.0;
            pose = Pose::Climb;
        } else {
            y += dy * (dt * 6.0).min(1.0);
            if flat_squared > 0.03 * 0.03 {
                let flat = flat_squared.sqrt();
                let step = flat.min(0.75 * dt);
                x += dx / flat * step;
                z += dz / flat * step;
                face += angle_delta(face, dx.atan2(dz)) * (dt * 10.0).min(1.0);
                phase += dt * 8.5;
                if pose != Pose::Carry {
                    pose = Pose::Walk;
                }
            } else {
                face += angle_delta(face, heading) * (dt * 4.0).min(1.0);
            }
        }
        row[..5].copy_from_slice(&[x, y, z, face, phase]);
        row[5..13].copy_from_slice(&joints(pose, phase, time));
        row[13] = if climbing { 0.0 } else { prop };
        row[14] = if pose == Pose::Hammer {
            -0.9 + (time * 6.0).sin().max(0.0) * 1.1
        } else {
            0.0
        };
    }
}
