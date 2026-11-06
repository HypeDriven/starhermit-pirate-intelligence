// Sharp sun shadows of the floaters alone: a port of Ultra Water's
// src/scene/floaterShadow.js (MIT, Copyright (c) 2026 Humpalumps; the notice
// is in crates/starhermit-water/src/lib.rs). A 1024^2 depth map from an
// orthographic sun camera fitted round the bodies each frame, so the static
// scene's shadows are never drawn again for them; the sea bed (world.ts) and
// the underwater shafts (underwater.ts) take it
// through FLOAT_SHADOW_WGSL's float_shadow(), a hardware 2x2 PCF tap of the
// DepthTexture's comparison sampler (host API 1.35), as the JS's
// sampler2DShadow.
//
// The water takes it too (surface.ts), as the JS's does.
//
// Differences: the engine has one scene (no nested Scene of the floaters),
// so the floaters are also on layer FLOATER_LAYER (floaters.ts) and the
// pass draws the scene under its depth-only overrideMaterial (colorWrite
// false) from a light camera that sees that layer alone (host API 1.35); a
// pass of the floaters' group alone would ignore the override. The receivers project with the light camera's view
// matrix and its ortho extent rather than a combined shadow matrix (the
// depth is linear in view depth under an orthographic camera).
import {
  DepthTexture,
  DoubleSide,
  FloatType,
  LessEqualCompare,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  RedFormat,
  RenderTarget,
  Vector3,
  Vector4,
  renderer,
  scene,
} from "starhermit:scene";

/** The layer the floaters are on besides 0: the light camera sees it alone. */
export const FLOATER_LAYER = 1;

/** float_shadow(world) -> 1 lit, 0 in a floater's shadow. Needs the
 * `floatShadow` depth texture and the floatShadowView/Params uniforms. */
export const FLOAT_SHADOW_WGSL = /* wgsl */ `
fn float_shadow(p: vec3f) -> f32 {
  let s = uniforms.floatShadowParams;   // half size, near, far, bias in depth units (0: no casters)
  if (s.w <= 0.0) { return 1.0; }
  let v = (uniforms.floatShadowView * vec4f(p, 1.0)).xyz;
  // depth rows run as the colour's: v down from the top
  let sc = vec3f(v.x / s.x * 0.5 + 0.5, 0.5 - v.y / s.x * 0.5, (-v.z - s.y) / (s.z - s.y));
  if (any(sc < vec3f(0.0)) || any(sc > vec3f(1.0))) { return 1.0; }
  return textureSampleCompareLevel(floatShadow, floatShadow_sampler, sc.xy, sc.z - s.w);
}
`;

const c = new Vector3();

export class WaterShadow {
  readonly target: RenderTarget;
  readonly depth: DepthTexture;
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 10);
  readonly material = new MeshBasicMaterial({ side: DoubleSide, colorWrite: false });
  /** The receivers' uniforms (share the objects); floatShadow first, among
   * every receiver's first five textures. */
  readonly uniforms: Record<string, { value: unknown }>;
  private ready = false;

  constructor(size = 1024) {
    this.depth = new DepthTexture(size, size, FloatType);
    this.depth.compareFunction = LessEqualCompare; // hardware 2x2 PCF
    this.depth.minFilter = this.depth.magFilter = LinearFilter;
    this.target = new RenderTarget(size, size, { format: RedFormat, depthTexture: this.depth, generateMipmaps: false });
    this.camera.layers.set(FLOATER_LAYER);
    this.uniforms = {
      floatShadow: { value: this.depth },
      floatShadowView: { value: new Matrix4() },
      floatShadowParams: { value: new Vector4() },
    };
  }

  /** bodies are the floaters' centres and radii (on FLOATER_LAYER); sunDir towards the sun. */
  update(bodies: readonly { pos: Vector3; radius: number }[], sunDir: Vector3) {
    const params = this.uniforms.floatShadowParams!.value as Vector4;
    if (!this.ready) {
      this.render(false);
      this.ready = true;
    }
    if (!bodies.length || sunDir.y <= 0.01) {
      params.w = 0;
      return;
    }
    c.set(0, 0, 0);
    for (const b of bodies) c.add(b.pos);
    c.divideScalar(bodies.length);
    let r = 1;
    for (const b of bodies) r = Math.max(r, b.pos.distanceTo(c) + b.radius);
    // receivers lie along the light rays behind the casters, so the xy
    // footprint is the casters'; depth runs far past them for the sea bed
    // under a low sun
    const cam = this.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 1;
    cam.far = r + 3000;
    cam.position.copy(c).addScaledVector(sunDir, r + 20);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    (this.uniforms.floatShadowView!.value as Matrix4).copy(cam.matrixWorldInverse);
    params.set(r, cam.near, cam.far, 0.03 / (cam.far - cam.near));
    this.render(true);
  }

  dispose(){this.target.dispose();this.depth.dispose();this.material.dispose();}

  /** The casters' layer of the scene under the override; false clears. */
  private render(draw: boolean) {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    if (draw) {
      const old=scene.overrideMaterial;
      try {scene.overrideMaterial = this.material;renderer.render(scene, this.camera);}
      finally {scene.overrideMaterial = old;}
    } else {
      renderer.clear();
    }
    renderer.setRenderTarget(previous);
  }
}
