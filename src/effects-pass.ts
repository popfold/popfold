// The effects pass: what plays on the way along a link (transitions.ts). While an effect plays, the frame is drawn
// to the screen as always, copied into a texture, and one full-screen shader draws it back, bent by the effect.
// When none plays, nothing here runs: the frame is the plain render it always was.
//
// Why a copy of the finished frame, and not the scene drawn into a target: three.js tone-maps and sRGB-encodes
// each fragment on its way to the screen, before it is blended, so glows, shadows and soft edges over the
// transparent page would come out differently if the whole picture were tone-mapped afterwards. The copy is the
// frame exactly as it would have been shown (antialiased too), so an effect that changes nothing changes no
// pixel, and an effect starting or ending does not make anything jump. Effects work on the encoded colours.
import * as THREE from 'three';

/**
 * An effect: GLSL that defines `vec4 effect(vec2 uv)`, the colour at `uv` (0..1), as shown (sRGB, premultiplied by
 * its alpha: the page shows through where alpha is below 1). It may read
 * `uniform sampler2D scene` (the picture), `uniform float progress` (0 at the start of the link, 1 at its end),
 * `uniform float strength`, `uniform float time` (seconds), `uniform vec2 aspect` (width / height, 1) and `PI`.
 */
export interface Effect {
  fragment: string;
  /** what plays instead with reduced motion, or on a device too slow for the full effect: a fade (default) or a cut */
  reduced?: 'fade' | 'cut';
  /**
   * Things that exist only while the effect plays between two neighbouring beats (a tube to fly through), made
   * once per link from the camera's route between them. `update` is given the progress (0..1) and the time; the
   * engine shows the object only while the effect plays. No lights in it: a light would change the light count.
   */
  objects?: (route: { curve: THREE.Curve<THREE.Vector3> }) => { object: THREE.Object3D; update: (progress: number, time: number) => void };
}

/** How far along the effect is at its strongest: 0 at both ends, 1 in the middle. */
const ENVELOPE = 'float envelope() { return sin(PI * clamp(progress, 0.0, 1.0)); }';

/** The effects Popfold ships. `cut` has no shader: the link is a jump. */
export const BUILT_IN_EFFECTS: Record<string, Effect | null> = {
  cut: null,
  // the picture dims and turns transparent (the page shows through), then comes back
  fade: {
    fragment: `${ENVELOPE}
vec4 effect(vec2 uv) {
  float k = envelope() * clamp(strength, 0.0, 1.0);
  return texture2D(scene, uv) * (1.0 - k);
}`,
  },
  // a rush towards the middle: the picture blurs outwards along the lines from its centre
  zoom: {
    fragment: `${ENVELOPE}
vec4 effect(vec2 uv) {
  float k = envelope() * 0.18 * strength;
  vec2 d = uv - 0.5;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 12; i++) sum += texture2D(scene, 0.5 + d * (1.0 - k * float(i) / 11.0));
  return sum / 12.0 * (1.0 - 0.25 * envelope() * clamp(strength, 0.0, 1.0));
}`,
    reduced: 'fade',
  },
  // a glowing tube along the camera's route between two beats (its `via` points), with rings that run past, and the
  // edges of the picture darkening as it closes in. Without a route (a door), only the darkening plays.
  tunnel: {
    fragment: `${ENVELOPE}
vec4 effect(vec2 uv) {
  vec4 c = texture2D(scene, uv);
  float r = length((uv - 0.5) * aspect);
  float dark = envelope() * clamp(strength, 0.0, 1.5) * 0.7 * smoothstep(0.15, 0.75, r);
  return vec4(c.rgb * (1.0 - dark), c.a);
}`,
    objects: ({ curve }) => tube(curve),
    reduced: 'fade',
  },
  // the picture turns about the middle, most at the centre, and dims a little at its strongest
  vortex: {
    fragment: `${ENVELOPE}
vec4 effect(vec2 uv) {
  float k = envelope();
  vec2 d = (uv - 0.5) * aspect;
  float r = length(d);
  float a = k * strength * 5.0 * (1.0 - smoothstep(0.0, 0.75, r));
  float c = cos(a), s = sin(a);
  d = mat2(c, -s, s, c) * d;
  return texture2D(scene, d / aspect + 0.5) * (1.0 - 0.35 * k * clamp(strength, 0.0, 1.0));
}`,
    reduced: 'fade',
  },
};

const VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** The tunnel's tube: rings of light running along it, most solid halfway, invisible at both ends. */
function tube(curve: THREE.Curve<THREE.Vector3>) {
  const length = curve.getLength();
  const material = new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, time: { value: 0 }, rings: { value: Math.max(6, length * 4) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float progress; uniform float time; uniform float rings;
varying vec2 vUv;
void main() {
  float k = sin(3.141592653589793 * clamp(progress, 0.0, 1.0));
  float ring = 0.5 + 0.5 * sin((vUv.x * rings - time * 1.6) * 6.2831853);
  float seam = smoothstep(0.92, 1.0, ring);
  vec3 deep = vec3(0.09, 0.07, 0.22), glow = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.35, 0.85), vUv.y);
  gl_FragColor = vec4(mix(deep, glow, 0.25 + 0.75 * seam), k * (0.55 + 0.45 * seam));
}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(32, Math.round(length * 24)), 0.9, 28, false), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return {
    object: mesh,
    update: (progress: number, time: number) => { material.uniforms.progress.value = progress; material.uniforms.time.value = time; },
  };
}

export function createEffectPass(renderer: THREE.WebGLRenderer) {
  let frame: THREE.FramebufferTexture | null = null;
  const size = new THREE.Vector2();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const screen = new THREE.Scene();
  screen.add(quad);
  const eye = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const materials = new Map<Effect, THREE.ShaderMaterial>();

  const materialOf = (effect: Effect) => {
    let m = materials.get(effect);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: { scene: { value: null }, progress: { value: 0 }, strength: { value: 1 }, time: { value: 0 }, aspect: { value: new THREE.Vector2(1, 1) } },
        vertexShader: VERTEX,
        // the frame as shown goes in, the effect's colour comes out as it is: no second tone mapping or encoding
        fragmentShader: `uniform sampler2D scene; uniform float progress; uniform float strength; uniform float time; uniform vec2 aspect;
varying vec2 vUv;
#define PI 3.141592653589793
${effect.fragment}
void main() { gl_FragColor = effect(vUv); }`,
        depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
      });
      materials.set(effect, m);
    }
    return m;
  };
  /** the texture the frame is copied into, at the size of what the renderer draws */
  const ready = () => {
    renderer.getDrawingBufferSize(size);
    if (frame && (frame.image.width !== size.x || frame.image.height !== size.y)) { frame.dispose(); frame = null; }
    frame ??= new THREE.FramebufferTexture(size.x, size.y);
    return frame;
  };

  return {
    /** Draw the scene through an effect, at `progress` (0..1). */
    render(scene: THREE.Scene, camera: THREE.Camera, effect: Effect, progress: number, strength: number, time: number) {
      const t = ready();
      renderer.render(scene, camera); // the frame, as always
      renderer.copyFramebufferToTexture(t);
      const m = materialOf(effect);
      m.uniforms.scene.value = t;
      m.uniforms.progress.value = progress;
      m.uniforms.strength.value = strength;
      m.uniforms.time.value = time;
      (m.uniforms.aspect.value as THREE.Vector2).set(size.x / Math.max(1, size.y), 1);
      quad.material = m;
      renderer.render(screen, eye);
    },
    /** Build these effects' shaders and the frame's texture now, unseen (the warm-up), so the first one does not stall. */
    async warm(effects: Effect[]) {
      ready();
      for (const effect of effects) {
        quad.material = materialOf(effect);
        await renderer.compileAsync(screen, eye).catch(() => undefined);
      }
    },
    dispose() {
      frame?.dispose();
      for (const m of materials.values()) m.dispose();
      quad.geometry.dispose();
    },
  };
}
