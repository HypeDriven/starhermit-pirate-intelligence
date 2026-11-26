//! SmolLM2 forward pass. JavaScript owns the token stream and schedules the
//! bounded chunks returned by layer_step; all tensor math stays in WASM.
use core::{
    arch::wasm32::{f64x2_extract_lane, f64x2_splat, f64x2_sqrt},
    slice,
};

use super::{attention, exp, linear};

const WIDTH: usize = 576;
const KV_WIDTH: usize = 192;
const FFN_WIDTH: usize = 1536;
const HEAD_WIDTH: usize = 64;
const HEADS: usize = WIDTH / HEAD_WIDTH;
const KV_HEADS: usize = KV_WIDTH / HEAD_WIDTH;
const ROWS_PER_STEP: usize = 64;

// The model's buffers and weights are disjoint, allocated from this
// module's linear memory. Each pointer in these tables is a byte address.
#[repr(C)]
struct Buffers {
    hidden: *mut f32,
    norm: *mut f32,
    queries: *mut f32,
    key: *mut f32,
    value: *mut f32,
    context: *mut f32,
    projection: *mut f32,
    gate: *mut f32,
    up: *mut f32,
    scores: *mut f32,
    rope: *const f64,
}

#[repr(C)]
struct Layer {
    attn_norm: *const f32,
    q: *const u8,
    k: *const u8,
    v: *const u8,
    attn_out: *const u8,
    ffn_norm: *const f32,
    gate: *const u8,
    up: *const u8,
    down: *const u8,
    keys: *mut f32,
    values: *mut f32,
}

#[no_mangle]
pub unsafe extern "C" fn normalize(
    out: *mut f32,
    input: *const f32,
    weight: *const f32,
    epsilon: f64,
) {
    let input = slice::from_raw_parts(input, WIDTH);
    let weight = slice::from_raw_parts(weight, WIDTH);
    let output = slice::from_raw_parts_mut(out, WIDTH);
    let square_sum = input
        .iter()
        .map(|&x| f64::from(x) * f64::from(x))
        .sum::<f64>();
    let mean = square_sum / WIDTH as f64 + epsilon;
    let scale = 1.0 / f64x2_extract_lane::<0>(f64x2_sqrt(f64x2_splat(mean)));
    for ((out, &value), &weight) in output.iter_mut().zip(input).zip(weight) {
        *out = (f64::from(value) * scale * f64::from(weight)) as f32;
    }
}

unsafe fn add_residual(hidden: *mut f32, projection: *const f32) {
    for (h, &p) in slice::from_raw_parts_mut(hidden, WIDTH)
        .iter_mut()
        .zip(slice::from_raw_parts(projection, WIDTH))
    {
        *h += p;
    }
}

unsafe fn rotate(vector: *mut f32, heads: usize, angles: *const f64) {
    let angles = slice::from_raw_parts(angles, HEAD_WIDTH);
    for head in slice::from_raw_parts_mut(vector, heads * HEAD_WIDTH).chunks_exact_mut(HEAD_WIDTH) {
        for (pair, rotation) in head.chunks_exact_mut(2).zip(angles.chunks_exact(2)) {
            let (a, b) = (f64::from(pair[0]), f64::from(pair[1]));
            let (cos, sin) = (rotation[0], rotation[1]);
            pair[0] = (a * cos - b * sin) as f32;
            pair[1] = (a * sin + b * cos) as f32;
        }
    }
}

/// Advance a layer by a bounded number of matrix rows or one non-matrix
/// operation. A zero continuation starts a layer and is returned at its end.
#[no_mangle]
pub unsafe extern "C" fn layer_step(
    buffers: usize,
    layer: usize,
    position: usize,
    continuation: usize,
    epsilon: f64,
) -> usize {
    let b = &*(buffers as *const Buffers);
    let l = &*(layer as *const Layer);
    let phase = continuation >> 16;
    let row = continuation & 0xffff;
    let (weights, input, output, columns, rows) = match phase {
        0 => {
            if row == 0 {
                normalize(b.norm, b.hidden, l.attn_norm, epsilon);
            }
            (l.q, b.norm, b.queries, WIDTH, WIDTH)
        }
        1 => (l.k, b.norm, b.key, WIDTH, KV_WIDTH),
        2 => (l.v, b.norm, b.value, WIDTH, KV_WIDTH),
        3 => {
            let angles = b.rope.add(position * HEAD_WIDTH);
            rotate(b.queries, HEADS, angles);
            rotate(b.key, KV_HEADS, angles);
            core::ptr::copy_nonoverlapping(b.key, l.keys.add(position * KV_WIDTH), KV_WIDTH);
            core::ptr::copy_nonoverlapping(b.value, l.values.add(position * KV_WIDTH), KV_WIDTH);
            attention(
                b.queries, l.keys, l.values, b.context, b.scores, position, HEADS, KV_HEADS,
                HEAD_WIDTH,
            );
            return 4 << 16;
        }
        4 => (l.attn_out, b.context, b.projection, WIDTH, WIDTH),
        5 => {
            if row == 0 {
                add_residual(b.hidden, b.projection);
                normalize(b.norm, b.hidden, l.ffn_norm, epsilon);
            }
            (l.gate, b.norm, b.gate, WIDTH, FFN_WIDTH)
        }
        6 => (l.up, b.norm, b.up, WIDTH, FFN_WIDTH),
        7 => {
            if row == 0 {
                for (gate, &up) in slice::from_raw_parts_mut(b.gate, FFN_WIDTH)
                    .iter_mut()
                    .zip(slice::from_raw_parts(b.up, FFN_WIDTH))
                {
                    *gate = *gate / (1.0 + exp(-*gate)) * up;
                }
            }
            (l.down, b.gate, b.projection, FFN_WIDTH, WIDTH)
        }
        8 => {
            add_residual(b.hidden, b.projection);
            return 0;
        }
        _ => return 0,
    };
    let end = rows.min(row + ROWS_PER_STEP);
    linear(weights, input, output, columns, row, end);
    if end == rows {
        (phase + 1) << 16
    } else {
        (phase << 16) | end
    }
}
