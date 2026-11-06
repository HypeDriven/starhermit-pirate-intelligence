// The planar reflection: a port of Ultra Water's src/engine/PlanarReflection.js
// (MIT, Copyright (c) 2026 Humpalumps; the notice is in
// crates/starhermit-water/src/lib.rs). A mirror camera about the plane y = 0
// with three.js r185 Reflector's oblique near plane (host API 1.34's
// writable camera.projectionMatrix; the same math as the engine's
// camera-projection test package) draws the terrain into a mipmapped
// half-float target at a fraction of the window, cleared to alpha 0 so the
// water falls back to the sky wherever nothing was drawn.
//
// Adapted for the game's sea level and per-tier resolution. The caller hides
// the sea and sky dome while this pass reflects the visible world.
import {
  Color,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  RenderTarget,
  Vector3,
  Vector4,
  renderer,
  type Object3D,
} from "starhermit:scene";

const normal = new Vector3(0, 1, 0);
const camPos = new Vector3();
const lookAt = new Vector3();
const target = new Vector3();
const rot = new Matrix4();
const plane = new Plane();
const clip = new Vector4();
const q = new Vector4();
const black = new Color(0x000000);
const savedColor = new Color();

export class PlanarReflection {
  readonly camera = new PerspectiveCamera();
  readonly textureMatrix = new Matrix4();
  target: RenderTarget;
  private width = 0;
  private height = 0;

  constructor(public scale = 0.5, public maxWidth = 1280, public seaLevel = -2.1) {
    this.target = PlanarReflection.make(1, 1);
  }

  private static make(w: number, h: number): RenderTarget {
    // mipmapped: the water blurs it by its roughness
    return new RenderTarget(w, h, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
  }

  /** Resizes the target to scale x the window; true when it was remade. */
  setSize(w: number, h: number): boolean {
    // Each graphics tier caps reflection resolution independently of display size.
    const s = Math.min(this.scale, this.maxWidth / Math.max(1, w));
    const tw = Math.max(1, Math.floor(w * s));
    const th = Math.max(1, Math.floor(h * s));
    if (tw === this.width && th === this.height) return false;
    this.width = tw;
    this.height = th;
    this.target.dispose();
    this.target = PlanarReflection.make(tw, th);
    return true;
  }

  dispose() { this.target.dispose(); }

  render(scene: Object3D, camera: PerspectiveCamera): void {
    const rc = this.camera;
    camera.updateMatrixWorld();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.set(lookAt.x, 2 * this.seaLevel - lookAt.y, lookAt.z);
    rc.position.set(camPos.x, 2 * this.seaLevel - camPos.y, camPos.z);
    rc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    rc.lookAt(target);
    rc.near = camera.near;
    rc.far = camera.far;
    rc.fov = camera.fov;
    rc.aspect = camera.aspect;
    rc.updateMatrixWorld();
    rc.updateProjectionMatrix();
    rc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(rc.projectionMatrix)
      .multiply(rc.matrixWorldInverse);

    // Reflector's oblique near plane: the world plane y = 0, above it kept
    plane.setFromNormalAndCoplanarPoint(normal, target.set(0, this.seaLevel, 0)).applyMatrix4(rc.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = rc.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + p[8]!) / p[0]!, (Math.sign(clip.y) + p[9]!) / p[5]!, -1, (1 + p[10]!) / p[14]!);
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1;
    p[14] = clip.w;
    rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();

    const previous = renderer.getRenderTarget();
    renderer.getClearColor(savedColor);
    const savedAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(black, 0);
      renderer.render(scene, rc);
    } finally {
      renderer.setClearColor(savedColor, savedAlpha);
      renderer.setRenderTarget(previous);
    }
  }
}
