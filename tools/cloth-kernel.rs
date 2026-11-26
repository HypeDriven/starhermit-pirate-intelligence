//! Fixed-step Verlet solver for the ships' sails and flags.

const STEP: f64 = 1.0 / 30.0;

struct Link {
    a: usize,
    b: usize,
    rest_squared: f64,
    weight_a: f64,
    weight_b: f64,
}

pub struct Cloth {
    columns: usize,
    rows: usize,
    flag: bool,
    positions: Vec<[f32; 3]>,
    previous: Vec<[f32; 3]>,
    rest: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    pinned: Vec<u8>,
    links: Vec<Link>,
}

impl Cloth {
    fn new(columns: usize, rows: usize, flag: bool) -> Self {
        let count = columns * rows;
        Self {
            columns,
            rows,
            flag,
            positions: vec![[0.0; 3]; count],
            previous: vec![[0.0; 3]; count],
            rest: vec![[0.0; 3]; count],
            normals: vec![[0.0; 3]; count],
            pinned: vec![0; count],
            links: Vec::with_capacity(count * 3),
        }
    }

    fn connect(&mut self, a: usize, b: usize) {
        let (weight_a, weight_b) = match (self.pinned[a] != 0, self.pinned[b] != 0) {
            (true, true) => return,
            (true, false) => (0.0, 1.0),
            (false, true) => (1.0, 0.0),
            (false, false) => (0.5, 0.5),
        };
        let [dx, dy, dz] = difference(self.rest[b], self.rest[a]);
        let length = (dx * dx + dy * dy + dz * dz).sqrt() as f32;
        self.links.push(Link {
            a,
            b,
            rest_squared: f64::from(length * length),
            weight_a,
            weight_b,
        });
    }

    fn connect_grid(&mut self) {
        let width = self.columns;
        for y in 0..self.rows {
            for x in 0..width {
                let a = y * width + x;
                if x + 1 < width {
                    self.connect(a, a + 1);
                }
                if y + 1 < self.rows {
                    let below = a + width;
                    self.connect(a, below);
                    if x + 1 < width {
                        if y % 2 == 0 {
                            self.connect(a + 1, below);
                        } else {
                            self.connect(a, below + 1);
                        }
                    }
                }
            }
        }
    }

    fn tick(&mut self, time: f64, wx: f64, wz: f64, gust: f64) {
        let (damping, gravity) = if self.flag {
            (0.985, -2.2)
        } else {
            (0.97, -1.2)
        };
        for (i, (position, previous)) in self
            .positions
            .iter_mut()
            .zip(&mut self.previous)
            .enumerate()
        {
            if self.pinned[i] != 0 {
                *position = self.rest[i];
                *previous = *position;
                continue;
            }

            let [x, y, _] = position.map(f64::from);
            let ripple = if self.flag {
                (time * 11.0 - x * 9.0 + y * 3.0).sin() * 0.9
                    + (time * 17.0 - x * 14.0).sin() * 0.45
            } else {
                (time * 2.3 + x * 1.7 + y * 1.3).sin() * 0.35 + (time * 5.1 - y * 2.2).sin() * 0.15
            };
            let wind = 1.0 + gust * ripple;
            let mut acceleration = [wx * wind, gravity, wz * wind];
            if self.flag {
                acceleration[0] += (time * 9.0 + x * 6.0).sin() * 0.6 * gust;
                acceleration[1] += (time * 13.0 - x * 11.0).sin() * 1.2 * gust;
                acceleration[2] += (time * 10.0 - x * 8.0).cos() * 1.4 * gust;
            }
            let current = *position;
            for i in 0..3 {
                let speed = (f64::from(current[i]) - f64::from(previous[i])) * damping;
                position[i] =
                    (f64::from(current[i]) + speed + acceleration[i] * (STEP * STEP)) as f32;
            }
            *previous = current;
        }
        for _ in 0..2 {
            for &Link {
                a,
                b,
                rest_squared,
                weight_a,
                weight_b,
            } in &self.links
            {
                let pa = self.positions[a];
                let pb = self.positions[b];
                let delta = difference(pb, pa);
                let [dx, dy, dz] = delta;
                let ratio = 1.0 - 2.0 * rest_squared / (dx * dx + dy * dy + dz * dz + rest_squared);
                let displacement = delta.map(|component| component * ratio);
                self.positions[a] =
                    std::array::from_fn(|i| (f64::from(pa[i]) + displacement[i] * weight_a) as f32);
                self.positions[b] =
                    std::array::from_fn(|i| (f64::from(pb[i]) - displacement[i] * weight_b) as f32);
            }
        }
    }

    fn update_normals(&mut self) {
        let w = self.columns;
        for y in 0..self.rows {
            for x in 0..w {
                let left = y * w + x.saturating_sub(1);
                let right = y * w + (x + 1).min(w - 1);
                let up = y.saturating_sub(1) * w + x;
                let down = (y + 1).min(self.rows - 1) * w + x;
                let [ux, uy, uz] = difference(self.positions[right], self.positions[left]);
                let [vx, vy, vz] = difference(self.positions[down], self.positions[up]);
                let [cx, cy, cz] = [vy * uz - vz * uy, vz * ux - vx * uz, vx * uy - vy * ux];
                let length = (cx * cx + cy * cy + cz * cz).sqrt();
                let divisor = if length > 0.0 { length } else { 1.0 };
                self.normals[y * w + x] = [
                    (cx / divisor) as f32,
                    (cy / divisor) as f32,
                    (cz / divisor) as f32,
                ];
            }
        }
    }
}

fn difference(a: [f32; 3], b: [f32; 3]) -> [f64; 3] {
    std::array::from_fn(|i| f64::from(a[i]) - f64::from(b[i]))
}

#[no_mangle]
pub extern "C" fn cloth_new(nx: usize, ny: usize, flag: u32) -> *mut Cloth {
    Box::into_raw(Box::new(Cloth::new(nx + 1, ny + 1, flag != 0)))
}

// The game initializes each buffer once and reads positions and normals after
// stepping. The vectors retain their allocations for this cloth's lifetime.
#[no_mangle]
pub unsafe extern "C" fn cloth_buffers(cloth: *mut Cloth) -> *const [usize; 5] {
    let cloth = &mut *cloth;
    let pointers = [
        cloth.positions.as_mut_ptr().addr(),
        cloth.previous.as_mut_ptr().addr(),
        cloth.rest.as_mut_ptr().addr(),
        cloth.pinned.as_mut_ptr().addr(),
        cloth.normals.as_mut_ptr().addr(),
    ];
    scratch_pointers(pointers)
}

fn scratch_pointers(pointers: [usize; 5]) -> *const [usize; 5] {
    static mut SCRATCH: [usize; 5] = [0; 5];
    unsafe {
        let address = &raw mut SCRATCH;
        address.write(pointers);
        address
    }
}

#[no_mangle]
pub unsafe extern "C" fn cloth_setup(cloth: *mut Cloth) {
    let cloth = &mut *cloth;
    cloth.connect_grid();
}

#[no_mangle]
pub unsafe extern "C" fn cloth_step(
    cloth: *mut Cloth,
    steps: usize,
    time: f64,
    wx: f64,
    wz: f64,
    gust: f64,
) {
    let cloth = &mut *cloth;
    for _ in 0..steps {
        cloth.tick(time, wx, wz, gust);
    }
    cloth.update_normals();
}
