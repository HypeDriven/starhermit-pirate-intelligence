//! Small single-threaded GGUF Q8_0 kernels. No network, threads or allocator.
#![no_std]
use core::arch::wasm32::*;
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! { core::arch::wasm32::unreachable() }
static mut NEXT: usize = 0;
extern "C" { static __heap_base: u8; }
#[no_mangle]
pub unsafe extern "C" fn reserve(bytes: usize) -> usize {
    if NEXT == 0 { NEXT = (&__heap_base as *const u8 as usize + 15) & !15; }
    let p = NEXT; NEXT = (NEXT + bytes + 15) & !15; p
}
fn half(h: u16) -> f32 {
    let s = if h & 0x8000 == 0 {1.0} else {-1.0};
    let e = (h >> 10) & 31; let m = h & 1023;
    if e == 0 { s * (m as f32) / 16_777_216.0 }
    else { s * f32::from_bits(((e as u32 + 112) << 23) | ((m as u32) << 13)) }
}
unsafe fn dot(w: *const u8, x: *const f32, n: usize) -> f32 {
    let mut sum = f32x4_splat(0.0);
    for b in 0..n/32 {
        let p = w.add(b*34); let d = f32x4_splat(half(core::ptr::read_unaligned(p as *const u16)));
        for j in 0..2 {
            let q = v128_load(p.add(2+j*16) as *const v128);
            let lo = i16x8_extend_low_i8x16(q); let hi = i16x8_extend_high_i8x16(q);
            let lanes = [i32x4_extend_low_i16x8(lo), i32x4_extend_high_i16x8(lo),
                         i32x4_extend_low_i16x8(hi), i32x4_extend_high_i16x8(hi)];
            for k in 0..4 {
                let v = v128_load(x.add(b*32+j*16+k*4) as *const v128);
                sum = f32x4_add(sum, f32x4_mul(f32x4_mul(f32x4_convert_i32x4(lanes[k]),d),v));
            }
        }
    }
    f32x4_extract_lane::<0>(sum)+f32x4_extract_lane::<1>(sum)+f32x4_extract_lane::<2>(sum)+f32x4_extract_lane::<3>(sum)
}
#[no_mangle]
pub unsafe extern "C" fn linear(w: *const u8, x: *const f32, y: *mut f32, cols: usize, first: usize, end: usize) {
    for row in first..end { *y.add(row) = dot(w.add(row*(cols/32)*34), x, cols); }
}
#[no_mangle]
pub unsafe extern "C" fn score(w: *const u8, x: *const f32, cols: usize, row: usize) -> f32 {
    dot(w.add(row*(cols/32)*34),x,cols)
}
#[no_mangle]
pub unsafe extern "C" fn embed(w: *const u8, y: *mut f32, cols: usize, row: usize) {
    let w = w.add(row*(cols/32)*34);
    for b in 0..cols/32 {
        let p=w.add(b*34); let d=half(core::ptr::read_unaligned(p as *const u16));
        for j in 0..32 { *y.add(b*32+j)=d*(*p.add(2+j) as i8 as f32); }
    }
}
#[link(wasm_import_module="math")]
extern "C" { fn exp(x: f32) -> f32; }
#[no_mangle]
pub unsafe extern "C" fn attention(q:*const f32,k:*const f32,v:*const f32,out:*mut f32,scores:*mut f32,pos:usize,heads:usize,kvheads:usize,hd:usize) {
    let kvdim=kvheads*hd;
    for h in 0..heads {
        let kh=h/(heads/kvheads); let mut max=f32::NEG_INFINITY;
        for t in 0..=pos {
            let mut a=0.0;
            for j in 0..hd { a+=*q.add(h*hd+j) * *k.add(t*kvdim+kh*hd+j); }
            a/=8.0; // SmolLM2's head dimension is 64.
            *scores.add(t)=a; if a>max {max=a;}
        }
        let mut total=0.0;
        for t in 0..=pos {let a=exp(*scores.add(t)-max);*scores.add(t)=a;total+=a;}
        for j in 0..hd {
            let mut a=0.0;
            for t in 0..=pos { a+=(*scores.add(t)/total) * *v.add(t*kvdim+kh*hd+j); }
            *out.add(h*hd+j)=a;
        }
    }
}
