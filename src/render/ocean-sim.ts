// Tessendorf FFT ocean on the GPU: a port of Ultra Water's
// src/water/OceanSim.js (MIT, Copyright (c) 2026 Humpalumps; the notice is in
// crates/starhermit-water/src/lib.rs) to the scene API's WGSL materials and
// FloatType render targets (host API 1.34). crates/starhermit-water is the
// CPU reference: same spectrum, hash, normalisation and texel layout.
//
// Four cascades of 256^2 (600, 85, 12 and 2.1 m tiles) stacked in one
// 256 x 1024 atlas, so every IFFT stage is one draw per field set:
//   h0      RGBA32F atlas: (h0(k), conj(h0(-k)))           made once on the GPU
//   evolve  two RGBA32F atlases (A, B): four real fields packed as two
//           complex spectra each (A: Dx + iDz, Dy + iDxz; B: Dyx + iDyz,
//           Dxx + iDzz)
//   IFFT    16 Stockham radix-2 stages (8 along rows, 8 along columns),
//           ping-ponging A and B separately (no MRT: one draw per output)
//   assemble
//           displacement atlas RGBA32F (lambda Dx, Dy, lambda Dz, turbulence),
//           double-buffered for the foam's memory, and one slope target per
//           cascade (sx, sz, sx^2, sz^2), repeat-wrapped; with `slopeMips`
//           FloatType + mipmaps (RGBA16F), whose mips give the slope variance
//           for roughness (off by default: see the constructor).
//
// Differences from the JS, forced by the engine today:
//   - no MRT: the evolve, IFFT and assemble passes are split per output;
//   - the IFFT ping-pong is RGBA32F (the JS uses half floats for bandwidth);
//   - displacement is one atlas, not four targets (a game holds 16 targets:
//     this uses 11); `oceanSampleWgsl` reads it with manual wrap + bilinear;
//   - all uniforms are f32 (the seed and integers are converted in WGSL);
//     WGSL here has no tanh, written out with exp.
// Texel (x, y) of an atlas is row y from the top as f.coord and textureLoad
// count it; cascade c owns rows c N to c N + N - 1; texel n sits at world
// (n + 1/2) L / N, as crates/starhermit-water's WaveField assumes.

import {
  DoubleSide,
  FloatType,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
  renderer,
  DataTexture,
} from "starhermit:scene";

export const N = 256;

export const CASCADE_LENGTHS = [600, 85, 12, 2.1] as const;
export const CASCADES = CASCADE_LENGTHS.length;
const G = 9.81;
const SIGMA_RHO = 7.4e-5;
export const LOOP = 300;
const DEFAULT_SEED = 1337;

export interface OceanParams {
  windSpeed: number;
  windDirection: number;
  fetchKm: number;
  spreadBlend: number;
  windSwell: number;
  gamma: number;
  shortWavesFade: number;
  /** Cascade 3's short-wave fade (calibrated so the summed mean square slope
   * matches Cox-Munk at the default wind). */
  capillaryFade: number;
  waveScale: number;
  swellScale: number;
  swellWindSpeed: number;
  swellDirection: number;
  swellFetchKm: number;
  swellSwell: number;
  choppiness: number;
  foamRecovery: number;
  timeScale: number;
}

export const defaultOceanParams = (): OceanParams => ({
  windSpeed: 9,
  windDirection: 20,
  fetchKm: 120,
  spreadBlend: 0.85,
  windSwell: 0.25,
  gamma: 3.3,
  shortWavesFade: 0.04,
  capillaryFade: 0.007,
  waveScale: 1,
  swellScale: 0.7,
  swellWindSpeed: 7,
  swellDirection: -15,
  swellFetchKm: 900,
  swellSwell: 1,
  choppiness: 0.85,
  foamRecovery: 0.7,
  timeScale: 1,
});

function jonswapParams(windSpeed: number, fetchKm: number) {
  const fetch = fetchKm * 1000;
  return {
    alpha: 0.076 * Math.pow((G * fetch) / (windSpeed * windSpeed), -0.22),
    peakOmega: 22 * Math.pow((windSpeed * fetch) / (G * G), -0.33),
  };
}

const f = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : x.toExponential(10));

/** Per texel of the h0 layout, the loop harmonic n = floor(omega / W0) in
 * f64 (as crates/starhermit-water's loop_harmonic), split as (n >> 8, n & 255). */
function harmonicTexture(N: number): DataTexture {
  const data = new Float32Array(N * N * CASCADES * 4);
  const w0 = (2 * Math.PI) / LOOP;
  for (let c = 0; c < CASCADES; c++) {
    const dk = (2 * Math.PI) / CASCADE_LENGTHS[c]!;
    for (let iy = 0; iy < N; iy++)
      for (let ix = 0; ix < N; ix++) {
        const kx = (ix - N / 2) * dk, ky = (iy - N / 2) * dk;
        const k = Math.sqrt(kx * kx + ky * ky);
        const n = Math.floor(Math.sqrt(G * k + SIGMA_RHO * k * k * k) / w0);
        const o = ((c * N + iy) * N + ix) * 4;
        data[o] = Math.floor(n / 256);
        data[o + 1] = n % 256;
      }
  }
  const t = new DataTexture(data, N, N * CASCADES, undefined, FloatType);
  t.needsUpdate = true;
  return t;
}

const COMMON = /* wgsl */ `
const OCEAN_N: i32 = ${N};
const OCEAN_PI: f32 = 3.14159265359;
const OCEAN_G: f32 = ${f(G)};
const OCEAN_ST: f32 = ${f(SIGMA_RHO)};
fn ocean_cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
fn ocean_omega(k: f32) -> f32 { return sqrt(OCEAN_G * k + OCEAN_ST * k * k * k); }
fn ocean_texel(f: Fragment) -> vec2i { return vec2i(floor(f.coord.xy)); }
`;

// Draws a 2 x 2 plane over the whole target, whatever the camera.
const FULLSCREEN_VERTEX = /* wgsl */ `
fn vertex(v: Vertex) -> Vertex { var o = v; o.clip = vec4f(v.position.xy, 0.0, 1.0); return o; }
`;

const INIT = COMMON + /* wgsl */ `
fn ocean_pcg2d(v0: vec2u) -> vec2u {
  var v = v0 * 1664525u + vec2u(1013904223u);
  v.x = v.x + v.y * 1664525u; v.y = v.y + v.x * 1664525u;
  v = v ^ (v >> vec2u(16u));
  v.x = v.x + v.y * 1664525u; v.y = v.y + v.x * 1664525u;
  v = v ^ (v >> vec2u(16u));
  return v;
}
fn ocean_gauss(id: vec2i, c: i32) -> vec2f {
  let cu = u32(c);
  let seed = u32(uniforms.seed);
  let h = ocean_pcg2d(vec2u(id) + vec2u(cu * 7919u, cu * 104729u) + vec2u(seed));
  let u1 = (f32(h.x) + 1.0) / 4294967296.0;
  let u2 = f32(h.y) / 4294967296.0;
  let r = sqrt(-2.0 * log(u1));
  return r * vec2f(cos(2.0 * OCEAN_PI * u2), sin(2.0 * OCEAN_PI * u2));
}
fn ocean_jonswap(w: f32, a: vec4f, b: vec4f) -> f32 {
  let wp = b.y;
  let sigma = select(0.09, 0.07, w <= wp);
  let r = exp(-(w - wp) * (w - wp) / (2.0 * sigma * sigma * wp * wp));
  let iw = 1.0 / w;
  let q = wp * iw;
  return a.x * b.x * OCEAN_G * OCEAN_G * iw * iw * iw * iw * iw * exp(-1.25 * q * q * q * q) * pow(b.z, r);
}
fn ocean_normalisation(s: f32) -> f32 {
  let s2 = s * s; let s3 = s2 * s; let s4 = s3 * s;
  if (s < 5.0) { return -0.000564 * s4 + 0.00776 * s3 - 0.044 * s2 + 0.192 * s + 0.163; }
  return -4.80e-08 * s4 + 1.07e-05 * s3 - 9.53e-04 * s2 + 5.90e-02 * s + 3.93e-01;
}
fn ocean_tanh(x: f32) -> f32 { return 1.0 - 2.0 / (exp(2.0 * x) + 1.0); }
fn ocean_directional(theta: f32, w: f32, a: vec4f, b: vec4f) -> f32 {
  let x = w / b.y;
  var s = select(6.97 * pow(x, 5.0), 9.77 * pow(x, -2.5), x > 1.0);
  s = s + 16.0 * ocean_tanh(min(x, 20.0)) * a.w * a.w;
  let t = theta - a.y;
  let cosine2s = ocean_normalisation(s) * pow(abs(cos(0.5 * t)), 2.0 * s);
  return mix(2.0 / OCEAN_PI * cos(t) * cos(t), cosine2s, a.z);
}
fn ocean_h0(id: vec2i, c: i32) -> vec2f {
  let L = uniforms.lengths[c];
  let dk = 2.0 * OCEAN_PI / L;
  let k = vec2f(id - vec2i(OCEAN_N / 2)) * dk;
  let kl = length(k);
  var lo = 1e-4;
  if (c > 0) { lo = uniforms.cut[c - 1]; }
  var hi = 1e4;
  if (c < 3) { hi = uniforms.cut[c]; }
  // Texels (+-6, 0) and (0, +-6) of cascades 1 to 3 sit exactly on their low
  // cut (6 of their fundamentals): a binary32 length() one ulp short (ANGLE on
  // D3D) would drop them, so the edges get a relative slack of 1e-5 (no other
  // texel is within 3e-4 of an edge).
  if (kl < lo * (1.0 - 1e-5) || kl > hi * (1.0 + 1e-5)) { return vec2f(0.0); }
  let w = ocean_omega(kl);
  let dwdk = (OCEAN_G + 3.0 * OCEAN_ST * kl * kl) / (2.0 * w);
  let theta = atan2(k.y, k.x);
  var S = 0.0;
  for (var i = 0; i < 2; i++) {
    let a = uniforms.specA[i];
    let b = uniforms.specB[i];
    if (a.x > 0.0) {
      let fade = select(b.w, uniforms.capFade, c == 3);
      S = S + ocean_jonswap(w, a, b) * ocean_directional(theta, w, a, b) * exp(-fade * fade * kl * kl);
    }
  }
  // E|g|^2 = 2 and h(k) sums h0(k) and conj(h0(-k)), so 1/4 gives sum E|h|^2 = sum S(k) dk^2
  return ocean_gauss(id, c) * sqrt(0.25 * S * dwdk / kl * dk * dk);
}
fn fragment(f: Fragment) -> vec4f {
  let p = ocean_texel(f);
  let c = p.y / OCEAN_N;
  let id = vec2i(p.x, p.y - c * OCEAN_N);
  let a = ocean_h0(id, c);
  let b = ocean_h0((vec2i(OCEAN_N) - id) % vec2i(OCEAN_N), c);
  return vec4f(a, b.x, -b.y);
}`;

const EVOLVE = COMMON + /* wgsl */ `
fn ocean_pack2(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x - b.y, a.y + b.x); }
fn fragment(f: Fragment) -> vec4f {
  let p = ocean_texel(f);
  let c = p.y / OCEAN_N;
  let k = vec2f(vec2i(p.x, p.y - c * OCEAN_N) - vec2i(OCEAN_N / 2)) * (2.0 * OCEAN_PI / uniforms.lengths[c]);
  let kl = length(k);
  let ik = select(0.0, 1.0 / kl, kl > 1e-6);
  // omega = n W0 with n = 256 hi + lo from harmonicTexture (exact, from f64 on
  // the CPU: a binary32 floor(omega / W0) flips n near integers between GPUs).
  // turns = n t / LOOP = lo u + hi fract(256 u), u = loopTurns.x, fract(256 u)
  // = loopTurns.y, so no large binary32 product appears.
  let n = textureLoad(harmonicTexture, p, 0).xy;
  let ph = 2.0 * OCEAN_PI * fract(fract(n.y * uniforms.loopTurns.x) + fract(n.x * uniforms.loopTurns.y));
  let e = vec2f(cos(ph), sin(ph));
  let h0 = textureLoad(h0Texture, p, 0);
  let h = ocean_cmul(h0.xy, e) + ocean_cmul(h0.zw, vec2f(e.x, -e.y));
  let ih = vec2f(-h.y, h.x);
  if (uniforms.which < 0.5) {
    let dx = ih * k.x * ik; let dz = ih * k.y * ik;
    let dxdz = -h * k.x * k.y * ik;
    return vec4f(ocean_pack2(dx, dz), ocean_pack2(h, dxdz));
  }
  let dxdx = -h * k.x * k.x * ik; let dzdz = -h * k.y * k.y * ik;
  let dydx = ih * k.x; let dydz = ih * k.y;
  return vec4f(ocean_pack2(dydx, dydz), ocean_pack2(dxdx, dzdz));
}`;

// Stockham radix-2 inverse FFT stage (e^{+i}).
const FFT = COMMON + /* wgsl */ `
fn fragment(f: Fragment) -> vec4f {
  let p = ocean_texel(f);
  let vertical = uniforms.vertical > 0.5;
  let sub = i32(uniforms.sub);
  let i = select(p.x, p.y % OCEAN_N, vertical);
  let hs = sub / 2;
  let e = (i / sub) * hs + (i & (hs - 1));
  var pe = vec2i(e, p.y);
  var po = vec2i(e + OCEAN_N / 2, p.y);
  if (vertical) {
    let base = p.y - i;
    pe = vec2i(p.x, base + e);
    po = vec2i(p.x, base + e + OCEAN_N / 2);
  }
  let a = 2.0 * OCEAN_PI * f32(i & (sub - 1)) / f32(sub);
  let tw = vec2f(cos(a), sin(a));
  let e0 = textureLoad(source, pe, 0);
  let o0 = textureLoad(source, po, 0);
  return vec4f(e0.xy + ocean_cmul(tw, o0.xy), e0.zw + ocean_cmul(tw, o0.zw));
}`;

const ASSEMBLE_DISPLACEMENT = COMMON + /* wgsl */ `
fn fragment(f: Fragment) -> vec4f {
  let p = ocean_texel(f);
  let c = p.y / OCEAN_N;
  let id = vec2i(p.x, p.y - c * OCEAN_N);
  // undo the centred-k frequency shift
  let s = select(-1.0, 1.0, ((id.x + id.y) & 1) == 0);
  let a = textureLoad(fieldA, p, 0) * s; // Dx, Dz, Dy, Dxz
  let b = textureLoad(fieldB, p, 0) * s; // Dyx, Dyz, Dxx, Dzz
  let l = uniforms.lambda;
  let dxx = l * b.z; let dzz = l * b.w; let dxz = l * a.w;
  let jac = (1.0 + dxx) * (1.0 + dzz) - dxz * dxz;
  let prev = textureLoad(previous, p, 0).w;
  // foam follows the jacobian down instantly and recovers at a dt-based rate
  let turb = min(jac, prev + uniforms.dt * uniforms.foamRecovery / max(jac, 0.5));
  return vec4f(l * a.x, a.z, l * a.y, turb);
}`;

const ASSEMBLE_SLOPE = COMMON + /* wgsl */ `
fn fragment(f: Fragment) -> vec4f {
  let id = ocean_texel(f);
  let p = id + vec2i(0, i32(uniforms.cascade) * OCEAN_N);
  let s = select(-1.0, 1.0, ((id.x + id.y) & 1) == 0);
  let b = textureLoad(fieldB, p, 0) * s;
  let l = uniforms.lambda;
  let slope = b.xy / max(vec2f(1.0 + l * b.z, 1.0 + l * b.w), vec2f(0.2));
  return vec4f(slope, slope * slope);
}`;

/** WGSL for a material that has the displacement atlas as texture uniform
 * `name`: `ocean_displacement(xz)` sums cascades 0 to `cascades - 1`
 * (bilinear, wrapped) at rest position xz, and `ocean_surface(xz)` inverts
 * the horizontal displacement (4 fixed-point steps, as WaveField::sample)
 * and returns the displacement of the surface point over xz. Works in
 * vertex and fragment code (textureLoad only). */
export function oceanSampleWgsl(name: string, cascades = 3, N = 256): string {
  const lengths = CASCADE_LENGTHS.map((l, c) => `if (c == ${c}) { return ${f(l)}; }`).join(" ");
  return /* wgsl */ `
fn ocean_length(c: i32) -> f32 { ${lengths} return 1.0; }
fn ocean_load(c: i32, t: vec2i) -> vec4f {
  let w = ((t % vec2i(${N})) + vec2i(${N})) % vec2i(${N});
  return textureLoad(${name}, vec2i(w.x, w.y + c * ${N}), 0);
}
fn ocean_bilinear(c: i32, xz: vec2f) -> vec4f {
  let u = xz / ocean_length(c) * ${f(N)} - 0.5;
  let f0 = floor(u);
  let w = u - f0;
  let i = vec2i(f0);
  let a = mix(ocean_load(c, i), ocean_load(c, i + vec2i(1, 0)), w.x);
  let b = mix(ocean_load(c, i + vec2i(0, 1)), ocean_load(c, i + vec2i(1, 1)), w.x);
  return mix(a, b, w.y);
}
fn ocean_displacement(xz: vec2f) -> vec4f {
  var d = vec4f(0.0);
  for (var c = 0; c < ${cascades}; c++) { d = d + ocean_bilinear(c, xz); }
  return d;
}
fn ocean_surface(xz: vec2f) -> vec4f {
  var p = xz;
  for (var i = 0; i < 4; i++) { p = xz - ocean_displacement(p).xz; }
  return ocean_displacement(p);
}
`;
}

type Pass = { group: Group; material: ShaderMaterial };

const passCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
passCamera.position.z = 5;

function pass(fragmentShader: string, uniforms: Record<string, { value: unknown }>): Pass {
  const material = new ShaderMaterial({
    uniforms: uniforms as ShaderMaterial["uniforms"],
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const group = new Group();
  group.add(mesh);
  return { group, material };
}

function draw(p: Pass, target: RenderTarget) {
  renderer.setRenderTarget(target);
  renderer.render(p.group, passCamera);
}

export class OceanSim {
  params: OceanParams;
  /** Loop time in seconds (0 to LOOP). */
  time = 0;
  /** Set to regenerate h0 (after changing spectrum params) on the next update. */
  dirty = true;
  readonly lengths = CASCADE_LENGTHS;
  readonly h0: RenderTarget;
  /** The displacement atlas the last update wrote: (lambda Dx, Dy, lambda Dz,
   * turbulence), cascade c in rows c N to c N + N - 1. */
  displacement: Texture;
  /** Per cascade: (sx, sz, sx^2, sz^2), repeat (mipmapped RGBA16F with `slopeMips`). */
  readonly slope: Texture[];
  readonly seed: number;

  private readonly fields: [RenderTarget, RenderTarget][]; // [A, B] x [ping, pong]
  private readonly disp: [RenderTarget, RenderTarget];
  private readonly slopeTargets: RenderTarget[];
  private readonly init: Pass;
  private readonly evolve: Pass[];
  private readonly fft: Pass[][]; // [field][stage]
  private readonly assemble: Pass[]; // by parity
  private readonly slopePasses: Pass[];
  private parity = 0;
  private readonly harmonics: DataTexture;
  readonly resolution: number;

  /** `slopeMips` gives the slope targets mipmaps (FloatType + generateMipmaps,
   * so RGBA16F, written unclamped from host API 1.34) for LEAN roughness. */
  constructor(params: OceanParams = defaultOceanParams(), seed = DEFAULT_SEED, slopeMips = true, N = 256) {
    if (![64, 128, 256, 512].includes(N)) throw new RangeError("Ocean resolution must be 64, 128, 256 or 512");
    this.resolution = N;
    const LOG_N = Math.log2(N);
    const shader = (code: string) => code.replace("const OCEAN_N: i32 = 256;", "const OCEAN_N: i32 = " + N + ";");
    this.params = params;
    this.seed = seed;
    const H = N * CASCADES;
    const data = { type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false } as const;
    this.h0 = new RenderTarget(N, H, data);
    this.fields = [0, 1].map(() => [new RenderTarget(N, H, data), new RenderTarget(N, H, data)] as [RenderTarget, RenderTarget]);
    this.disp = [new RenderTarget(N, H, data), new RenderTarget(N, H, data)];
    this.slopeTargets = CASCADE_LENGTHS.map(
      () =>
        new RenderTarget(N, N, {
          type: FloatType,
          generateMipmaps: slopeMips,
          minFilter: slopeMips ? LinearMipmapLinearFilter : LinearFilter,
          magFilter: LinearFilter,
          wrapS: RepeatWrapping,
          wrapT: RepeatWrapping,
          depthBuffer: false,
        }),
    );
    this.displacement = this.disp[0].texture;
    this.slope = this.slopeTargets.map((t) => t.texture);

    const lengths = new Vector4(...CASCADE_LENGTHS);
    // cascade c owns [cut[c-1], cut[c]); each cut sits at 6 fundamentals of the next cascade
    const cut = new Vector4(...CASCADE_LENGTHS.slice(1).map((L) => ((2 * Math.PI) / L) * 6), 0);
    this.init = pass(shader(INIT), {
      specA: { value: [new Vector4(), new Vector4()] },
      specB: { value: [new Vector4(), new Vector4()] },
      lengths: { value: lengths },
      cut: { value: cut },
      capFade: { value: 0 },
      seed: { value: seed },
    });
    const harmonics = this.harmonics = harmonicTexture(N);
    this.evolve = [0, 1].map((which) =>
      pass(shader(EVOLVE), {
        h0Texture: { value: this.h0.texture },
        harmonicTexture: { value: harmonics },
        lengths: { value: lengths },
        loopTurns: { value: new Vector2() },
        which: { value: which },
      }),
    );
    // Stage s reads ping (s even) or pong; 16 stages end back in ping.
    this.fft = this.fields.map((pair) => {
      const stages: Pass[] = [];
      for (let dir = 0; dir < 2; dir++)
        for (let s = 1; s <= LOG_N; s++) {
          const n = stages.length;
          stages.push(pass(shader(FFT), { source: { value: pair[n % 2]!.texture }, sub: { value: 1 << s }, vertical: { value: dir } }));
        }
      return stages;
    });
    const [A, B] = [this.fields[0]![0].texture, this.fields[1]![0].texture];
    this.assemble = [0, 1].map((parity) =>
      pass(shader(ASSEMBLE_DISPLACEMENT), {
        fieldA: { value: A },
        fieldB: { value: B },
        previous: { value: this.disp[parity]!.texture },
        lambda: { value: 1 },
        dt: { value: 0 },
        foamRecovery: { value: 0.7 },
      }),
    );
    this.slopePasses = CASCADE_LENGTHS.map((_, c) => pass(shader(ASSEMBLE_SLOPE), { fieldB: { value: B }, cascade: { value: c }, lambda: { value: 1 } }));

    // turbulence starts at 1 (no foam): clear to alpha 1
    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    renderer.setClearAlpha(1);
    for (const target of this.disp) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
    renderer.setClearAlpha(previousAlpha);
    renderer.setRenderTarget(previousTarget);
  }

  /** Regenerates h0 from `params` (the JS updateSpectrum). */
  updateSpectrum() {
    const p = this.params;
    const u = this.init.material.uniforms;
    const wind = jonswapParams(p.windSpeed, p.fetchKm);
    const swell = jonswapParams(p.swellWindSpeed, p.swellFetchKm);
    const rad = (d: number) => (d * Math.PI) / 180;
    u.specA!.value = [
      new Vector4(p.waveScale, rad(p.windDirection), p.spreadBlend, p.windSwell),
      new Vector4(p.swellScale * p.waveScale, rad(p.swellDirection), 1, p.swellSwell),
    ];
    u.specB!.value = [
      new Vector4(wind.alpha, wind.peakOmega, p.gamma, p.shortWavesFade),
      new Vector4(swell.alpha, swell.peakOmega, p.gamma, p.shortWavesFade),
    ];
    u.capFade!.value = p.capillaryFade;
    draw(this.init, this.h0);
    this.dirty = false;
  }

  /** Advances by dt seconds (times params.timeScale) and runs the passes. */
  update(dt: number) {
    const p = this.params;
    const previousTarget = renderer.getRenderTarget();
    if (this.dirty) this.updateSpectrum();
    dt *= p.timeScale;
    this.time = (((this.time + dt) % LOOP) + LOOP) % LOOP;

    for (let field = 0; field < 2; field++) {
      const u = this.time / LOOP;
      (this.evolve[field]!.material.uniforms.loopTurns!.value as Vector2).set(u, 256 * u - Math.floor(256 * u));
      draw(this.evolve[field]!, this.fields[field]![0]);
      const stages = this.fft[field]!;
      for (let s = 0; s < stages.length; s++) draw(stages[s]!, this.fields[field]![(s + 1) % 2]!);
    }

    const next = this.parity ^ 1;
    const a = this.assemble[this.parity]!.material.uniforms;
    a.lambda!.value = p.choppiness;
    a.dt!.value = dt;
    a.foamRecovery!.value = p.foamRecovery;
    draw(this.assemble[this.parity]!, this.disp[next]!);
    for (let c = 0; c < CASCADES; c++) {
      this.slopePasses[c]!.material.uniforms.lambda!.value = p.choppiness;
      draw(this.slopePasses[c]!, this.slopeTargets[c]!);
    }
    this.displacement = this.disp[next]!.texture;
    this.parity = next;
    renderer.setRenderTarget(previousTarget);
  }

  /** Compiles every pass's program now (a SyntaxError names the refused one). */
  compile() {
    for (const p of [this.init, ...this.evolve, ...this.fft.flat(), ...this.assemble, ...this.slopePasses]) p.material.compile();
  }

  dispose() {
    for (const t of [this.h0, ...this.fields.flat(), ...this.disp, ...this.slopeTargets]) t.dispose();
    this.harmonics.dispose();
    for (const p of [this.init, ...this.evolve, ...this.fft.flat(), ...this.assemble, ...this.slopePasses]) {
      for (const m of p.group.children as Mesh[]) m.geometry.dispose();
      p.material.dispose();
    }
  }
}
