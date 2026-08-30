/**
 * logo3d.js — Axyom 3D hero mark
 * =============================================================================
 *
 * Renders the four-pointed Axyom sparkle in WebGL as a real extruded solid with
 * a physical material, studio lighting and a procedural environment. Nothing is
 * traced from, or textured with, the PNG; the silhouette is four cubic Beziers
 * whose control points were least-squares fitted to the logo's traced contour
 * (IoU 0.93 against the artwork, RMS ~3.5px on a 1664px-wide source).
 *
 * USAGE
 * -----
 *   import { mountLogo3D } from './js/logo3d.js';
 *   const logo = mountLogo3D(document.getElementById('hero-mark'));
 *   // later, from a scroll handler:
 *   logo.setProgress(0.42);
 *   // on teardown (SPA nav, etc.):
 *   logo.destroy();
 *
 * The container should have a non-zero size from CSS (the module fills it and
 * watches it with a ResizeObserver; it never sets the container's own size).
 * A container of 320-720px square works well. Calling mountLogo3D twice on the
 * same element is safe only if you destroy() the first handle.
 *
 * CONTRACT
 * --------
 *   mountLogo3D(container: HTMLElement, options?: Object) -> handle
 *
 *   handle.destroy()            Idempotent. Stops the loop, disconnects every
 *                               observer/listener, disposes all GPU resources,
 *                               force-loses the WebGL context and removes the
 *                               canvas (or fallback <img>) from the container.
 *   handle.setProgress(t)       t is clamped to 0..1. Drives the scroll pose:
 *                               yaw/pitch/scale interpolate from the settled
 *                               state (t=0) to the options below at t=1. Safe
 *                               to call before the renderer has finished
 *                               initialising, after destroy(), in the fallback
 *                               path, and under prefers-reduced-motion (where
 *                               it is intentionally a no-op).
 *   handle.isFallback           true when no WebGL context could be created and
 *                               an <img> is showing instead.
 *   handle.reducedMotion        true when prefers-reduced-motion: reduce is on.
 *   handle.canvas               The <canvas>, or null in the fallback path.
 *   handle.frames               Diagnostic: frames drawn since mount. Stops
 *                               increasing while the mark is off-screen or the
 *                               document is hidden.
 *
 * OPTIONS (all optional; defaults shown)
 * --------------------------------------
 *   color:            0x00B39C   Base teal of the mark (hex number or CSS string).
 *   rotationZ:        0          In-plane roll, radians. 0 = long axis vertical
 *                                (the mark stood upright). Pass -0.75347
 *                                (= -43.17 deg) to reproduce the diagonal
 *                                orientation the sparkle has in the wordmark.
 *   depth:            0.26       Front-to-back thickness at the thickest point,
 *                                in units where the long point is 1.0 from the
 *                                centre. This sets the ridge height, so it is
 *                                what controls how sculpted the mark looks.
 *   rim:              0.026      Height of the vertical band along the
 *                                silhouette. Small, but it is what the rim light
 *                                catches and what keeps the edge from looking
 *                                infinitely thin.
 *   tipRound:         0.014      Radius of the fillet at each of the four points.
 *                                0 gives razor tips (and aliasing on them).
 *   outlinePoints:    640        Outline samples, spaced by arc length. Drives
 *                                the triangle count (~6 tris per sample).
 *   padding:          0.10       Fraction of extra room around the mark when
 *                                fitting the camera. Larger = smaller mark.
 *   fov:              26         Camera field of view, degrees.
 *   maxPixelRatio:    2          devicePixelRatio cap.
 *   antialias:        true       MSAA on the default framebuffer.
 *   exposure:         1.0        Tone-mapping exposure (Khronos PBR Neutral).
 *   shadow:           true       Draw the soft contact shadow plane.
 *   shadowOpacity:    0.22       Peak alpha of that shadow.
 *   entry:            true       Play the entry animation on first reveal.
 *   entryDuration:    1500       Entry length in ms (total choreography <1.6s).
 *   idle:             true       Keep a very slow drift alive once settled.
 *   idleAmount:       1          Multiplier on the idle drift amplitude.
 *   progressYaw:      0.62       rotation.y in radians at setProgress(1).
 *   progressPitch:   -0.20       rotation.x in radians at setProgress(1).
 *   progressScale:    0.82       Uniform scale at setProgress(1).
 *   fallbackSrc:      'Assets/axyomlogo.png'   Used when WebGL is unavailable.
 *   fallbackAlt:      'Axyom'                  alt text for that image.
 *   onReady:          null       Called with the handle once the first frame
 *                                has been drawn (never called in the fallback
 *                                path; use handle.isFallback for that).
 *
 * BEHAVIOUR GUARANTEES
 * --------------------
 *   - No WebGL / context creation throws / context lost at runtime -> the
 *     fallback <img> is swapped in and every handle method keeps working.
 *   - prefers-reduced-motion: reduce -> one static, fully-lit frame is drawn at
 *     the settled pose. No entry, no idle drift, no scroll rotation, no rAF
 *     loop. Resizes redraw that single frame.
 *   - Rendering is suspended when the container leaves the viewport
 *     (IntersectionObserver) and when document.hidden becomes true. The entry
 *     clock is suspended with it, so a hero scrolled past and returned to still
 *     plays its animation from where it stopped.
 *   - GL initialisation is deferred to the next animation frame, so calling
 *     mountLogo3D() never blocks first paint.
 *
 * three.js is vendored at ../vendor/three.module.min.js (r169). No network
 * imports, no external HDR, no extra dependencies.
 */

import {
  Scene,
  Group,
  PerspectiveCamera,
  WebGLRenderer,
  Shape,
  BufferGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  SphereGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  ShaderMaterial,
  PointLight,
  DirectionalLight,
  AmbientLight,
  Color,
  CanvasTexture,
  PMREMGenerator,
  NeutralToneMapping,
  SRGBColorSpace,
  BackSide,
  DoubleSide,
  MathUtils,
  Vector2,
  Vector4
} from '../vendor/three.module.min.js';

/* ---------------------------------------------------------------------------
 * 1. The silhouette
 * ---------------------------------------------------------------------------
 * Measured off Assets/axyomlogo.png: the teal mask was isolated by channel
 * threshold, the outline traced with Moore neighbourhood tracing, the two axes
 * intersected to find the true centre (431.8, 394.3 px) and the four tips
 * located by ray marching. Each of the four edges was then fitted as a cubic
 * Bezier with free control points (coordinate descent on point-to-curve
 * distance). Everything below is normalised so the longest point sits at
 * radius 1, and rotated +43.17 deg so that long axis is vertical.
 *
 * Resulting proportions, which are what actually make it read as the Axyom
 * mark: long point 1.000, opposite point 0.853, side points 0.729 and 0.725,
 * the horizontal axis tilted ~2.4 deg off perpendicular, and a waist that
 * pinches to ~0.15 of the tip radius. That last number is why the edges look
 * this concave.
 */
const TIP_UP = [-0.00007, 0.99934];
const TIP_RIGHT = [0.72887, -0.03023];
const TIP_DOWN = [0.00037, -0.85328];
const TIP_LEFT = [-0.72495, 0.03010];

/** Four cubic segments, walking the outline U -> R -> D -> L -> U. */
const EDGES = [
  { a: TIP_UP, c1: [0.18014, -0.15490], c2: [-0.12575, 0.18365], b: TIP_RIGHT },
  { a: TIP_RIGHT, c1: [-0.15119, -0.15384], c2: [0.16194, 0.16697], b: TIP_DOWN },
  { a: TIP_DOWN, c1: [-0.17460, 0.06959], c2: [0.15879, -0.16024], b: TIP_LEFT },
  { a: TIP_LEFT, c1: [0.16309, 0.12902], c2: [-0.15723, -0.16281], b: TIP_UP }
];

/** Unit vectors toward each of the four points, for the entry shader. */
const TIP_DIRS = [TIP_UP, TIP_RIGHT, TIP_DOWN, TIP_LEFT].map((t) => {
  const len = Math.hypot(t[0], t[1]);
  return [t[0] / len, t[1] / len];
});

/** Bounding box of the outline above, used to centre the mark and fit the camera. */
const BOX = { minX: -0.7250, maxX: 0.7289, minY: -0.8533, maxY: 0.9993 };
const BOX_W = BOX.maxX - BOX.minX;
const BOX_H = BOX.maxY - BOX.minY;
const BOX_CY = (BOX.maxY + BOX.minY) / 2;

const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** de Casteljau: return the piece of a cubic on [t, 1]. */
function cubicAfter(a, c1, c2, b, t) {
  const p01 = lerp2(a, c1, t);
  const p12 = lerp2(c1, c2, t);
  const p23 = lerp2(c2, b, t);
  const p012 = lerp2(p01, p12, t);
  const p123 = lerp2(p12, p23, t);
  const p = lerp2(p012, p123, t);
  return { a: p, c1: p123, c2: p23, b };
}

/** de Casteljau: return the piece of a cubic on [0, t]. */
function cubicBefore(a, c1, c2, b, t) {
  const p01 = lerp2(a, c1, t);
  const p12 = lerp2(c1, c2, t);
  const p23 = lerp2(c2, b, t);
  const p012 = lerp2(p01, p12, t);
  const p123 = lerp2(p12, p23, t);
  const p = lerp2(p012, p123, t);
  return { a, c1: p01, c2: p012, b: p };
}

/**
 * Build the outline as a THREE.Shape.
 *
 * `tipRound` trims a short piece off each end of every edge and rejoins the two
 * trimmed ends with a quadratic through the original tip. Geometrically this is
 * a tiny fillet — invisible at hero size — but it keeps the turn angle at the
 * needles finite, which matters both for the rim band and for anti-aliasing at
 * a 9-degree point.
 */
function buildShape(tipRound) {
  const segs = EDGES.map((e) => ({ a: e.a, c1: e.c1, c2: e.c2, b: e.b }));

  if (tipRound > 0) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      // Approximate arc length near each endpoint by the control-net speed.
      const speedA = 3 * Math.hypot(s.c1[0] - s.a[0], s.c1[1] - s.a[1]);
      const speedB = 3 * Math.hypot(s.b[0] - s.c2[0], s.b[1] - s.c2[1]);
      const tA = Math.min(0.2, tipRound / Math.max(speedA, 1e-4));
      const tB = Math.min(0.2, tipRound / Math.max(speedB, 1e-4));
      let cut = cubicAfter(s.a, s.c1, s.c2, s.b, tA);
      cut = cubicBefore(cut.a, cut.c1, cut.c2, cut.b, 1 - tB);
      segs[i] = { ...cut, tipStart: s.a, tipEnd: s.b };
    }
  }

  const shape = new Shape();
  shape.moveTo(segs[0].a[0], segs[0].a[1]);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    shape.bezierCurveTo(s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.b[0], s.b[1]);
    if (tipRound > 0) {
      const next = segs[(i + 1) % segs.length];
      // Round the point: quadratic from this edge's end, through the real tip,
      // to the next edge's start.
      shape.quadraticCurveTo(s.tipEnd[0], s.tipEnd[1], next.a[0], next.a[1]);
    }
  }
  shape.closePath();
  return shape;
}

/**
 * Build the solid.
 *
 * Not a flat extrusion: a slab facing the camera reads as a sticker no matter
 * how good the material is. And not a simple cone to a central apex either —
 * these points are 1.0 long and only ~0.10 wide, so a central apex would give
 * the whole face a 7-degree slope and shade almost flat.
 *
 * The section used here is a roof over the medial axis: height above the rim is
 * proportional to the distance from the silhouette, so every point gets a ridge
 * running along its own centreline out to its tip, and each waist gets a
 * valley. The cross-slope is then set by the point's half-width — around 40
 * degrees — which is what makes the two flanks of every point read as clearly
 * different surfaces.
 *
 * Construction: for each outline sample, find which of the four points it
 * belongs to (nearest tip direction), project it onto that point's axis, and
 * raise that projection by k * half-width. Those projections form a closed
 * ridge loop that runs out and back along each of the four axes, enclosing zero
 * area, so one triangle strip from the outline ring to the ridge loop tiles the
 * whole face with no holes and no centre fan.
 *
 * That geometry is also where the colour gradient comes from. Eight flanks all
 * face different ways, so one key light puts the upper-right of the mark near
 * #00b3a1 and the lower-left near #0d6155 — the logo's own gradient, but
 * produced by shading, so it reorganises itself as the mark turns.
 *
 * Deliberately non-indexed: computeVertexNormals() on unshared vertices yields
 * per-face normals, so the ridges and the waist valleys stay crisp instead of
 * being smoothed into a blob.
 */
function buildGeometry(opts) {
  const shape = buildShape(opts.tipRound);
  // Spaced, not uniform-in-t: a cubic covers most of its parameter range near
  // the waist and races through the tip, so getPoints() leaves the points
  // coarsely faceted exactly where the silhouette is sharpest.
  const raw = shape.getSpacedPoints(opts.outlinePoints);

  // Drop duplicated join points and the repeated closing point.
  const ring = [];
  for (const p of raw) {
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) ring.push(p);
  }
  while (
    ring.length > 2 &&
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-6
  ) {
    ring.pop();
  }

  // Force counter-clockwise so front faces point at +Z.
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) ring.reverse();

  const N = ring.length;
  const t = opts.rim / 2;

  // Ridge partner for every outline sample: which point it belongs to, where it
  // lands on that point's axis, and how far it is from the axis.
  const ridge = new Array(N);
  const flanks = [[[], []], [[], []], [[], []], [[], []]];
  for (let i = 0; i < N; i++) {
    const p = ring[i];
    const r = Math.hypot(p.x, p.y) || 1e-6;
    let q = 0;
    let best = -2;
    for (let j = 0; j < 4; j++) {
      const d = (p.x * TIP_DIRS[j][0] + p.y * TIP_DIRS[j][1]) / r;
      if (d > best) {
        best = d;
        q = j;
      }
    }
    const u = TIP_DIRS[q];
    const s = p.x * u[0] + p.y * u[1];
    const ax = u[0] * s;
    const ay = u[1] * s;
    const hw = Math.hypot(p.x - ax, p.y - ay);
    const side = u[0] * p.y - u[1] * p.x >= 0 ? 0 : 1;
    ridge[i] = { x: ax, y: ay, s, hw, q };
    flanks[q][side].push({ s, hw });
  }

  // The two flanks of a point meet along its axis, but they are sampled at
  // different stations and the point is not perfectly symmetric, so evaluating
  // the ridge height from each flank's own half-width leaves them disagreeing
  // by a few thousandths — which renders as a hairline crack straight down the
  // middle of every point. Average the two flanks into one height profile per
  // point instead, so both halves land on exactly the same 3D curve.
  for (const sides of flanks) for (const list of sides) list.sort((a, b) => a.s - b.s);
  const sample = (list, s) => {
    if (!list.length) return 0;
    if (s <= list[0].s) return list[0].hw;
    if (s >= list[list.length - 1].s) return list[list.length - 1].hw;
    let lo = 0;
    let hi = list.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (list[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const span = list[hi].s - list[lo].s;
    const f = span > 1e-9 ? (s - list[lo].s) / span : 0;
    return list[lo].hw + (list[hi].hw - list[lo].hw) * f;
  };

  // One evenly-spaced height table per point, evaluated by both flanks. Sharing
  // the table matters: both halves then terminate on the same piecewise-linear
  // ridge curve, vertex for vertex, instead of on two curves that differ by a
  // few thousandths and leak a hairline of background between them.
  const TABLE = 128;
  const tables = [];
  for (let q = 0; q < 4; q++) {
    const a = flanks[q][0];
    const b = flanks[q][1];
    const sMin = Math.min(a.length ? a[0].s : 0, b.length ? b[0].s : 0);
    const sMax = Math.max(a.length ? a[a.length - 1].s : 1, b.length ? b[b.length - 1].s : 1);
    const hw = new Float64Array(TABLE + 1);
    for (let j = 0; j <= TABLE; j++) {
      const sv = sMin + ((sMax - sMin) * j) / TABLE;
      hw[j] = 0.5 * (sample(a, sv) + sample(b, sv));
    }
    tables.push({ sMin, sMax, hw });
  }
  const ridgeHalfWidth = (q, s) => {
    const tb = tables[q];
    const span = tb.sMax - tb.sMin || 1;
    const f = Math.min(TABLE, Math.max(0, ((s - tb.sMin) / span) * TABLE));
    const lo = Math.min(TABLE - 1, Math.floor(f));
    return tb.hw[lo] + (tb.hw[lo + 1] - tb.hw[lo]) * (f - lo);
  };

  let maxHalfWidth = 0;
  for (let i = 0; i < N; i++) {
    const g = ridge[i];
    g.hw = ridgeHalfWidth(g.q, g.s);
    if (g.hw > maxHalfWidth) maxHalfWidth = g.hw;
  }
  const k = (opts.depth / 2 - t) / (maxHalfWidth || 1);
  for (let i = 0; i < N; i++) ridge[i].z = t + k * ridge[i].hw;
  // Where the ridge loop hands over from one point's axis to the next it cuts a
  // chord across the middle, so the loop encloses a small quadrilateral at the
  // centre. Four triangles to a centre apex close it.
  const apexZ = opts.depth / 2;

  const pos = [];
  const push = (x, y, z) => pos.push(x, y, z);

  for (let i = 0; i < N; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % N];
    const ra = ridge[i];
    const rb = ridge[(i + 1) % N];

    // Front roof: outline ring -> ridge loop.
    push(a.x, a.y, t);
    push(b.x, b.y, t);
    push(rb.x, rb.y, rb.z);
    push(a.x, a.y, t);
    push(rb.x, rb.y, rb.z);
    push(ra.x, ra.y, ra.z);

    // Back roof: the mirror, wound the other way.
    push(b.x, b.y, -t);
    push(a.x, a.y, -t);
    push(rb.x, rb.y, -rb.z);
    push(rb.x, rb.y, -rb.z);
    push(a.x, a.y, -t);
    push(ra.x, ra.y, -ra.z);

    // Rim band along the silhouette.
    push(a.x, a.y, t);
    push(a.x, a.y, -t);
    push(b.x, b.y, -t);
    push(a.x, a.y, t);
    push(b.x, b.y, -t);
    push(b.x, b.y, t);

    // Close the centre quad where the ridge changes axis.
    if (ra.q !== rb.q) {
      push(0, 0, apexZ);
      push(ra.x, ra.y, ra.z);
      push(rb.x, rb.y, rb.z);
      push(0, 0, -apexZ);
      push(rb.x, rb.y, -rb.z);
      push(ra.x, ra.y, -ra.z);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* ---------------------------------------------------------------------------
 * 2. Easing
 * ------------------------------------------------------------------------- */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -9 * x));
// Slow start, long glide, hard stop — the "engineered, not bouncy" curve.
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const stagger = (t, start, span) => clamp01((t - start) / span);

/* ---------------------------------------------------------------------------
 * 3. Procedural studio environment (no HDR files)
 * ------------------------------------------------------------------------- */
const ENV_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ENV_FRAG = `
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  // Bright, slightly cool ceiling falling to a warm neutral floor: a seamless
  // cyclorama, the way a white-cove product shot actually looks.
  float up = d.y * 0.5 + 0.5;
  vec3 sky = mix(vec3(0.16, 0.17, 0.18), vec3(0.86, 0.88, 0.90), pow(up, 0.9));
  // Soft key glow high on the right so reflections carry a direction.
  float key = pow(max(dot(d, normalize(vec3(0.62, 0.68, 0.40))), 0.0), 5.0);
  sky += vec3(1.05, 1.02, 0.98) * key * 1.1;
  // Cool bounce low-left, so the deep side of the mark stays green-teal
  // instead of going muddy grey.
  float bounce = pow(max(dot(d, normalize(vec3(-0.70, -0.45, 0.35))), 0.0), 4.0);
  sky += vec3(0.30, 0.44, 0.42) * bounce * 0.55;
  gl_FragColor = vec4(sky, 1.0);
}`;

function buildEnvironment(renderer) {
  const envScene = new Scene();

  const dome = new Mesh(
    new SphereGeometry(12, 40, 28),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      vertexShader: ENV_VERT,
      fragmentShader: ENV_FRAG
    })
  );
  envScene.add(dome);

  // Two explicit softboxes give crisp, believable specular shapes on the bevel.
  // The two grazing panels are the important ones. The roof flanks are tilted
  // ~48 degrees, so what they mirror into the camera is whatever sits almost in
  // the plane of the mark, not what is in front of it.
  const boxes = [
    { size: 9, pos: [7.5, 8.5, 6.5], color: 0xffffff, intensity: 1.8 },
    { size: 7, pos: [10.0, 3.5, -1.5], color: 0xffffff, intensity: 3.4 },
    { size: 7, pos: [3.5, 10.0, -1.5], color: 0xf4fffd, intensity: 2.6 },
    { size: 7, pos: [-8.0, 2.0, 5.0], color: 0xe8fbf6, intensity: 0.45 },
    { size: 8, pos: [-1.5, -7.5, 4.0], color: 0xd7f2ec, intensity: 0.2 }
  ];
  const temp = [];
  for (const b of boxes) {
    const c = new Color(b.color).multiplyScalar(b.intensity);
    const m = new Mesh(
      new PlaneGeometry(b.size, b.size),
      new MeshBasicMaterial({ color: c, side: DoubleSide, toneMapped: false })
    );
    m.position.set(b.pos[0], b.pos[1], b.pos[2]);
    m.lookAt(0, 0, 0);
    envScene.add(m);
    temp.push(m);
  }

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();

  dome.geometry.dispose();
  dome.material.dispose();
  for (const m of temp) {
    m.geometry.dispose();
    m.material.dispose();
  }
  return target;
}

/* ---------------------------------------------------------------------------
 * 4. Contact shadow
 * ------------------------------------------------------------------------- */
function buildShadowTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  // Two stacked radial gradients: a tight core plus a wide, very soft skirt.
  const wide = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  wide.addColorStop(0.0, 'rgba(6,26,24,0.55)');
  wide.addColorStop(0.35, 'rgba(6,26,24,0.26)');
  wide.addColorStop(0.68, 'rgba(6,26,24,0.07)');
  wide.addColorStop(1.0, 'rgba(6,26,24,0)');
  ctx.fillStyle = wide;
  ctx.fillRect(0, 0, S, S);
  const core = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22);
  core.addColorStop(0.0, 'rgba(4,20,18,0.45)');
  core.addColorStop(1.0, 'rgba(4,20,18,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, S, S);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/* ---------------------------------------------------------------------------
 * 5. Entry deformation, injected into the physical material
 * ---------------------------------------------------------------------------
 * Each of the four points is scaled along its own axis, from a stub to full
 * length, on its own schedule. A smoothstep on radius freezes the vertices near
 * the convergence point so the four blades stay knitted together instead of
 * tearing at the waists. At uK* = 1 the displacement is exactly zero, so the
 * settled geometry is the fitted shape, untouched.
 */
function installEntryDeformation(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uTip0; uniform vec2 uTip1; uniform vec2 uTip2; uniform vec2 uTip3;
        uniform vec4 uTipK;
        uniform float uDepthScale;`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
        {
          vec2 p = transformed.xy;
          float r = length( p );
          vec2 n = r > 1e-5 ? p / r : vec2( 0.0, 1.0 );
          vec2 axis = uTip0; float k = uTipK.x;
          float d = dot( n, uTip0 ); float best = d;
          d = dot( n, uTip1 ); if ( d > best ) { best = d; axis = uTip1; k = uTipK.y; }
          d = dot( n, uTip2 ); if ( d > best ) { best = d; axis = uTip2; k = uTipK.z; }
          d = dot( n, uTip3 ); if ( d > best ) { best = d; axis = uTip3; k = uTipK.w; }
          float hold = smoothstep( 0.08, 0.42, r );
          float s = mix( 1.0, k, hold );
          float along = dot( p, axis );
          vec2 perp = p - axis * along;
          transformed.xy = perp + axis * ( along * s );
          transformed.z *= uDepthScale;
        }`
      );
  };
  // A unique key per material instance: onBeforeCompile mutations are invisible
  // to three's default program cache, so without this a plain
  // MeshPhysicalMaterial elsewhere on the page could hand us its program.
  const key = 'axyom-logo3d-' + (installEntryDeformation.n = (installEntryDeformation.n || 0) + 1);
  material.customProgramCacheKey = () => key;
}

/* ---------------------------------------------------------------------------
 * 6. Fallback path
 * ------------------------------------------------------------------------- */
function mountFallback(container, opts, reducedMotion) {
  const img = document.createElement('img');
  img.src = opts.fallbackSrc;
  img.alt = opts.fallbackAlt;
  img.decoding = 'async';
  img.style.cssText =
    'display:block;width:100%;height:100%;object-fit:contain;object-position:center;';
  container.appendChild(img);
  return {
    destroy() {
      if (img.parentNode) img.parentNode.removeChild(img);
    },
    setProgress() {},
    isFallback: true,
    reducedMotion: !!reducedMotion,
    canvas: null,
    frames: 0,
    element: img
  };
}

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    const gl =
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      probe.getContext('experimental-webgl');
    if (!gl) return false;
    const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * 7. Entry point
 * ------------------------------------------------------------------------- */
export function mountLogo3D(container, options = {}) {
  if (!container || !container.appendChild) {
    throw new TypeError('mountLogo3D: first argument must be an element');
  }

  const opts = {
    color: 0x00b39c,
    rotationZ: 0,
    depth: 0.26,
    rim: 0.026,
    tipRound: 0.014,
    outlinePoints: 640,
    padding: 0.1,
    fov: 26,
    maxPixelRatio: 2,
    antialias: true,
    exposure: 1.0,
    shadow: true,
    shadowOpacity: 0.22,
    entry: true,
    entryDuration: 1500,
    idle: true,
    idleAmount: 1,
    progressYaw: 0.62,
    progressPitch: -0.2,
    progressScale: 0.82,
    fallbackSrc: 'Assets/axyomlogo.png',
    fallbackAlt: 'Axyom',
    onReady: null,
    ...options
  };
  // Guarded so a 0 or garbage duration cannot turn the entry phase into NaN.
  opts.entryDuration = Math.max(1, Number(opts.entryDuration) || 1500);

  const reduceQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const reducedMotion = !!(reduceQuery && reduceQuery.matches);

  if (!webglAvailable()) return mountFallback(container, opts, reducedMotion);

  // --- state shared between the deferred init and the handle -----------------
  let destroyed = false;
  let started = false;
  let inViewport = true;
  let pageVisible = !document.hidden;
  let rafId = 0;
  let initRaf = 0;
  let progress = 0;
  let entryClock = 0; // ms of entry animation actually elapsed while visible
  let lastTime = 0;
  let idleClock = 0;
  let frames = 0;
  let needsRender = true;

  let renderer = null;
  let scene = null;
  let camera = null;
  let markGroup = null; // rotated / scaled
  let centreGroup = null; // translated so the outline's bbox is centred
  let mesh = null;
  let geometry = null;
  let material = null;
  let shadowMesh = null;
  let shadowTex = null;
  let envTarget = null;
  let sweepLight = null;
  let keyLight = null;
  let resizeObs = null;
  let interObs = null;
  let canvas = null;
  let fallbackHandle = null;

  const uniforms = {
    uTip0: { value: new Vector2(TIP_DIRS[0][0], TIP_DIRS[0][1]) },
    uTip1: { value: new Vector2(TIP_DIRS[1][0], TIP_DIRS[1][1]) },
    uTip2: { value: new Vector2(TIP_DIRS[2][0], TIP_DIRS[2][1]) },
    uTip3: { value: new Vector2(TIP_DIRS[3][0], TIP_DIRS[3][1]) },
    uTipK: { value: new Vector4(1, 1, 1, 1) },
    uDepthScale: { value: 1 }
  };

  const handle = {
    destroy,
    setProgress,
    isFallback: false,
    reducedMotion,
    canvas: null,
    get frames() {
      return frames;
    }
  };

  function setProgress(t) {
    if (destroyed || reducedMotion) return;
    const v = clamp01(Number(t) || 0);
    if (v === progress) return;
    progress = v;
    requestFrame();
  }

  /**
   * Mark the scene dirty and make sure a frame will actually be drawn. With
   * idle drift off the loop parks itself once the entry is over, so anything
   * that changes the pose has to be able to wake it again.
   */
  function requestFrame() {
    needsRender = true;
    if (reducedMotion) {
      drawOnce();
      return;
    }
    if (!started) syncLoop();
  }

  /* --- sizing ------------------------------------------------------------- */
  function containerSize() {
    const w = Math.max(1, Math.round(container.clientWidth || 0));
    const h = Math.max(1, Math.round(container.clientHeight || 0));
    return { w, h };
  }

  function fitCamera(w, h) {
    const aspect = w / h;
    camera.aspect = aspect;
    const halfFov = MathUtils.degToRad(opts.fov) / 2;
    // Extra room below for the contact shadow.
    const halfH = (BOX_H / 2) * (1 + opts.padding) * 1.06;
    const halfW = (BOX_W / 2) * (1 + opts.padding);
    const distH = halfH / Math.tan(halfFov);
    const distW = halfW / (Math.tan(halfFov) * aspect);
    camera.position.set(0, 0, Math.max(distH, distW));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function resize() {
    if (!renderer) return;
    const { w, h } = containerSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio));
    renderer.setSize(w, h, false);
    fitCamera(w, h);
    requestFrame();
  }

  /* --- build -------------------------------------------------------------- */
  function init() {
    initRaf = 0;
    if (destroyed) return;

    try {
      renderer = new WebGLRenderer({
        antialias: opts.antialias,
        alpha: true,
        powerPreference: 'default',
        preserveDrawingBuffer: false
      });
    } catch (err) {
      renderer = null;
    }
    if (!renderer || !renderer.getContext || !renderer.getContext()) {
      degradeToFallback();
      return;
    }

    canvas = renderer.domElement;
    handle.canvas = canvas;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', opts.fallbackAlt);
    renderer.setClearAlpha(0);
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = opts.exposure;
    renderer.outputColorSpace = SRGBColorSpace;
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    container.appendChild(canvas);

    scene = new Scene();
    camera = new PerspectiveCamera(opts.fov, 1, 0.1, 60);

    envTarget = buildEnvironment(renderer);
    scene.environment = envTarget.texture;

    // -- geometry ----------------------------------------------------------
    geometry = buildGeometry(opts);

    // -- material ----------------------------------------------------------
    material = new MeshPhysicalMaterial({
      color: new Color(opts.color),
      metalness: 0.05,
      roughness: 0.16,
      clearcoat: 0.7,
      clearcoatRoughness: 0.04,
      reflectivity: 0.55,
      envMapIntensity: 0.5,
      specularIntensity: 1,
      transparent: true,
      depthWrite: true,
      opacity: 1
    });
    installEntryDeformation(material, uniforms);

    mesh = new Mesh(geometry, material);

    markGroup = new Group();
    markGroup.add(mesh);
    markGroup.rotation.z = opts.rotationZ;

    centreGroup = new Group();
    centreGroup.position.y = -BOX_CY;
    centreGroup.add(markGroup);
    scene.add(centreGroup);

    // -- lights (key / fill / rim + the entry sweep) ------------------------
    // Point lights, not directionals, for key and fill: the inverse-square
    // falloff across the mark is part of what tips the upper right brighter
    // than the lower left.
    keyLight = new PointLight(0xffffff, 22, 0, 2);
    keyLight.position.set(2.4, 2.3, 1.1);
    scene.add(keyLight);

    const fill = new PointLight(0x9ed8cd, 2.2, 0, 2);
    fill.position.set(-2.4, -2.0, 1.2);
    scene.add(fill);

    const rim = new DirectionalLight(0x6fe6cf, 0.5);
    rim.position.set(-1.5, 1.5, -1.9);
    scene.add(rim);

    // Face-on fill. The flanks are steep enough to live off grazing light, but
    // the flat facets at the centre would read as a dark knot without this.
    const front = new DirectionalLight(0xffffff, 0.9);
    front.position.set(0.7, 0.9, 3.0);
    scene.add(front);

    scene.add(new AmbientLight(0xcfeee8, 0.05));

    sweepLight = new DirectionalLight(0xffffff, 0);
    sweepLight.position.set(-3, 0.6, 2.4);
    scene.add(sweepLight);

    // -- contact shadow ----------------------------------------------------
    if (opts.shadow) {
      shadowTex = buildShadowTexture();
      shadowMesh = new Mesh(
        new PlaneGeometry(1.9, 0.72),
        new MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          opacity: reducedMotion ? opts.shadowOpacity : 0,
          depthWrite: false,
          toneMapped: false
        })
      );
      shadowMesh.position.set(0.02, -1.02, -0.22);
      scene.add(shadowMesh);
    }

    resize();

    resizeObs =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => resize())
        : null;
    if (resizeObs) resizeObs.observe(container);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility, false);

    if (reducedMotion) {
      applyPose(1, 1);
      drawOnce();
      if (opts.onReady) opts.onReady(handle);
      return;
    }

    if (!opts.entry) entryClock = opts.entryDuration;

    if (typeof IntersectionObserver === 'function') {
      interObs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) inViewport = e.isIntersecting;
          syncLoop();
        },
        { threshold: 0.01 }
      );
      interObs.observe(container);
    } else {
      inViewport = true;
    }

    // Render one frame immediately so the mark is present even if the loop is
    // suspended a moment later.
    applyPose(entryClock / opts.entryDuration, 1);
    drawOnce();
    if (opts.onReady) opts.onReady(handle);
    syncLoop();
  }

  /* --- animation ---------------------------------------------------------- */
  /**
   * Places the mark for a given entry phase (0..1) and applies idle drift and
   * scroll progress. Kept as one function so the reduced-motion still frame and
   * the animated path cannot drift apart.
   */
  function applyPose(entry, settle) {
    const e = clamp01(entry);

    // The four points extend on staggered schedules: long vertical pair leads,
    // horizontal pair follows a beat later. easeOutQuint = fast commit, long
    // deceleration, no overshoot.
    const k = uniforms.uTipK.value;
    k.x = 0.16 + 0.84 * easeOutQuint(stagger(e, 0.0, 0.72));
    k.y = 0.16 + 0.84 * easeOutQuint(stagger(e, 0.16, 0.72));
    k.z = 0.16 + 0.84 * easeOutQuint(stagger(e, 0.08, 0.72));
    k.w = 0.16 + 0.84 * easeOutQuint(stagger(e, 0.22, 0.72));

    // Thickness extrudes first: the mark gains its solidity before it settles.
    uniforms.uDepthScale.value = 0.05 + 0.95 * easeOutExpo(stagger(e, 0.0, 0.6));

    // Settling rotation: a controlled quarter turn coming to rest square-on.
    const s = easeInOutCubic(e);
    const entryYaw = (1 - s) * -0.78;
    const entryPitch = (1 - s) * 0.3;
    const entryRoll = (1 - s) * 0.12;
    const entryScale = 0.86 + 0.14 * easeOutQuint(stagger(e, 0.05, 0.8));

    // Idle drift, only once settled and only if enabled.
    const idleGain = opts.idle && !reducedMotion ? settle * opts.idleAmount : 0;
    const driftYaw = Math.sin(idleClock / 6400) * 0.105 * idleGain;
    const driftPitch = Math.sin(idleClock / 8900 + 1.1) * 0.048 * idleGain;
    const driftRoll = Math.sin(idleClock / 11700 + 2.3) * 0.022 * idleGain;

    // Scroll progress.
    const p = progress;
    const scale = entryScale * (1 + (opts.progressScale - 1) * p);

    markGroup.rotation.y = entryYaw + driftYaw + opts.progressYaw * p;
    markGroup.rotation.x = entryPitch + driftPitch + opts.progressPitch * p;
    markGroup.rotation.z = opts.rotationZ + entryRoll + driftRoll;
    markGroup.scale.setScalar(scale);

    material.opacity = clamp01(stagger(e, 0.0, 0.34));

    // Light sweep: a hard specular band crossing the face, peaking mid-entry
    // and resolving to nothing exactly as the mark stops moving.
    const sweepPhase = stagger(e, 0.08, 0.82);
    const env = Math.sin(Math.PI * sweepPhase);
    sweepLight.intensity = env * env * 5.2;
    sweepLight.position.set(-3.4 + 6.8 * sweepPhase, 0.9 - 0.6 * sweepPhase, 2.6);

    if (shadowMesh) {
      shadowMesh.material.opacity = opts.shadowOpacity * easeOutQuint(stagger(e, 0.2, 0.7));
      const sw = 0.6 + 0.4 * easeOutQuint(stagger(e, 0.2, 0.7));
      shadowMesh.scale.set(sw * (1 - 0.12 * p), sw, 1);
    }
  }

  function drawOnce() {
    if (!renderer || !scene || !camera || destroyed) return;
    renderer.render(scene, camera);
    frames++;
    needsRender = false;
  }

  function frame(now) {
    rafId = 0;
    if (destroyed) return;
    const dt = lastTime ? Math.min(64, now - lastTime) : 16;
    lastTime = now;

    if (entryClock < opts.entryDuration) {
      entryClock = Math.min(opts.entryDuration, entryClock + dt);
      needsRender = true;
    }
    const settled = entryClock >= opts.entryDuration;
    if (opts.idle && settled) {
      idleClock += dt;
      needsRender = true;
    }

    const settleGain = clamp01((entryClock / opts.entryDuration - 0.7) / 0.3);
    applyPose(entryClock / opts.entryDuration, settleGain);
    if (needsRender) drawOnce();

    // If nothing is animating any more (idle disabled, entry done) stop burning
    // frames until something asks for a redraw.
    if (!opts.idle && settled && !needsRender) {
      started = false;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function syncLoop() {
    if (destroyed || reducedMotion || !renderer) return;
    const shouldRun = inViewport && pageVisible;
    if (shouldRun && !started) {
      started = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    } else if (!shouldRun && started) {
      started = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function onVisibility() {
    pageVisible = !document.hidden;
    syncLoop();
  }

  /* --- failure paths ------------------------------------------------------ */
  function onContextLost(event) {
    if (event && event.preventDefault) event.preventDefault();
    degradeToFallback();
  }

  function degradeToFallback() {
    if (destroyed) return;
    teardownGL();
    fallbackHandle = mountFallback(container, opts, reducedMotion);
    handle.isFallback = true;
    handle.canvas = null;
  }

  function teardownGL() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    started = false;
    if (resizeObs) {
      resizeObs.disconnect();
      resizeObs = null;
    }
    if (interObs) {
      interObs.disconnect();
      interObs = null;
    }
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility, false);

    if (geometry) geometry.dispose();
    if (material) material.dispose();
    if (shadowMesh) {
      shadowMesh.geometry.dispose();
      shadowMesh.material.dispose();
    }
    if (shadowTex) shadowTex.dispose();
    if (envTarget) envTarget.dispose();
    if (scene) scene.environment = null;

    if (renderer) {
      renderer.dispose();
      const el = renderer.domElement;
      if (el) {
        el.removeEventListener('webglcontextlost', onContextLost, false);
        // Only force a context loss if the context is still alive; calling this
        // from inside a webglcontextlost handler would throw.
        try {
          if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
        } catch (e) {
          /* already gone */
        }
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    }
    renderer = null;
    scene = null;
    camera = null;
    mesh = null;
    geometry = null;
    material = null;
    shadowMesh = null;
    shadowTex = null;
    envTarget = null;
    markGroup = null;
    centreGroup = null;
    canvas = null;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (initRaf) cancelAnimationFrame(initRaf);
    initRaf = 0;
    teardownGL();
    if (fallbackHandle) {
      fallbackHandle.destroy();
      fallbackHandle = null;
    }
    handle.canvas = null;
  }

  // Defer every GPU allocation past the current frame so mounting the hero
  // never delays first paint.
  initRaf = requestAnimationFrame(init);

  return handle;
}

export default mountLogo3D;
