/**
 * logo3d.js — Axyom 3D hero mark
 * =============================================================================
 *
 * Renders the COMPLETE Axyom logo — the "axyom" wordmark AND the four-pointed
 * sparkle, composed exactly as they sit in the artwork — in WebGL, as real
 * extruded solids with physical materials, studio lighting and a procedural
 * environment. Nothing is textured with the PNG.
 *
 * The vector source is Assets/axyom-logo.svg (potrace of Assets/axyomlogo.png,
 * viewBox 0 0 1664 749), inlined verbatim below as LOGO_SVG so the module makes
 * no network request at all. It is parsed with the vendored three.js SVGLoader,
 * turned into filled Shapes by SVGLoader.createShapes() — which is what gets the
 * counters of "a" and "o" assigned as holes rather than filled — and extruded
 * with ExtrudeGeometry.
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
 * The logo is ~2.23:1, so a wide container suits it; in a container narrower
 * than that the fit falls back to filling the width (see `padding` below).
 * Calling mountLogo3D twice on the same element is safe only if you destroy()
 * the first handle.
 *
 * CONTRACT (unchanged)
 * --------------------
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
 * UNITS
 * -----
 * Everything spatial is expressed in "logo units": the composed logo's ink
 * bounding box is centred on the origin and is exactly 2.0 wide, so x runs
 * -1..1 and y runs about -0.449..0.449. (The previous revision used units where
 * the sparkle's long point was 1.0 from the centre; every length option below
 * therefore has a different numeric range now, even where its meaning survived.)
 *
 * OPTIONS (all optional; defaults shown)
 * --------------------------------------
 *   color:            0x00B39C   Base teal of the SPARKLE. Meaning preserved —
 *                                it is still "the base colour of the mark" —
 *                                but it now colours only the star, because the
 *                                wordmark has its own colour (`wordColor`).
 *   wordColor:        0x060C11   NEW. Near-black of the wordmark.
 *   starGradient:     0.82       NEW. 0..1. How much of the artwork's teal
 *                                gradient (bright at the top-right point, deep
 *                                at the bottom-left) to bake in as vertex
 *                                colour on top of the shading. 0 = flat teal.
 *   rotationZ:        0          In-plane roll, radians. MEANING CHANGED: it is
 *                                now the roll of the WHOLE composed logo, and 0
 *                                is the artwork's own orientation (wordmark
 *                                level, sparkle lying diagonally across the x).
 *                                The old "pass -0.75347 to tilt the sparkle"
 *                                advice is obsolete — the tilt comes from the
 *                                vector source now.
 *   depth:            0.115      Total front-to-back thickness of the wordmark
 *                                (bevels included), in logo units.
 *   starDepthScale:   1.45       NEW. Sparkle thickness as a multiple of
 *                                `depth`. >1 is what puts it in front.
 *   rim:              0.0055     MEANING CHANGED, purpose preserved: this used
 *                                to be the height of the vertical band along
 *                                the silhouette; it is now the ExtrudeGeometry
 *                                bevel size (lateral inset), which is the band
 *                                the rim light catches. bevelThickness is
 *                                derived from it as rim * 1.25.
 *   bevelSegments:    3          NEW. Facets across the bevel.
 *   tipRound:         0.010      Radius of the fillet at each of the sparkle's
 *                                four points, in logo units. Meaning preserved.
 *                                0 gives razor tips — and, because a bevel is
 *                                offset along the corner bisector, razor tips
 *                                make the bevel shoot a spike out of each point.
 *                                Keep this comfortably larger than `rim`.
 *   outlinePoints:    512        Arc-length-spaced samples taken around the
 *                                sparkle outline. Meaning preserved (it drives
 *                                the sparkle's triangle count) but it no longer
 *                                affects the wordmark — see `curveSegments`.
 *   curveSegments:    8          NEW. Subdivisions per source Bezier for the
 *                                wordmark contours.
 *   creaseAngle:      32         NEW. Degrees. Vertex normals are averaged only
 *                                across faces closer than this, so letter walls
 *                                shade smooth while the bevel stays crisp.
 *   cullOccluded:     0.6        NEW. Drop wordmark subpaths with at least this
 *                                fraction of their outline inside the sparkle.
 *                                potrace assigns the sparkle's darkest tip to
 *                                the black path; that fragment is invisible in
 *                                the artwork (the sparkle covers it) and would
 *                                otherwise be a black chip on the lower-left
 *                                point. Set > 1 to keep everything.
 *   padding:          0.10       Fraction of extra room around the logo when
 *                                fitting the camera. Larger = smaller logo. The
 *                                fit is "contain": in a container narrower than
 *                                the logo's 2.23:1 the width constraint binds,
 *                                so the logo fills the width and is centred
 *                                vertically, which is what a tall phone
 *                                container should do.
 *   fov:              20         Camera field of view, degrees. Low, on
 *                                purpose: at 2.23:1 the logo is wide enough
 *                                that a wider lens visibly splays its ends.
 *   maxPixelRatio:    2          devicePixelRatio cap.
 *   antialias:        true       MSAA on the default framebuffer.
 *   exposure:         1.0        Tone-mapping exposure (Khronos PBR Neutral).
 *   shadow:           true       Draw the soft contact shadow plane.
 *   shadowOpacity:    0.18       Peak alpha of that shadow.
 *   entry:            true       Play the entry animation on first reveal.
 *   entryDuration:    1500       Entry length in ms (total choreography <1.6s).
 *   idle:             true       Keep a very slow drift alive once settled.
 *   idleAmount:       1          Multiplier on the idle drift amplitude.
 *   progressYaw:      0.46       rotation.y in radians at setProgress(1).
 *   progressPitch:   -0.16       rotation.x in radians at setProgress(1).
 *   progressScale:    0.86       Uniform scale at setProgress(1).
 *   svgSource:        LOGO_SVG   NEW. Override the vector source with your own
 *                                SVG markup (a string). Must contain a dark
 *                                wordmark path and a lighter sparkle path;
 *                                id="word" / id="star" are used when present,
 *                                otherwise the darkest path is taken as the
 *                                wordmark.
 *   fallbackSrc:      'Assets/axyomlogo.png'   Used when WebGL is unavailable.
 *   fallbackAlt:      'Axyom'                  alt text for that image.
 *   onReady:          null       Called with the handle once the first frame
 *                                has been drawn (never called in the fallback
 *                                path; use handle.isFallback for that).
 *
 * BEHAVIOUR GUARANTEES (unchanged)
 * --------------------------------
 *   - No WebGL / context creation throws / context lost at runtime -> the
 *     fallback <img> is swapped in and every handle method keeps working. A
 *     failure to parse or build the vector source degrades the same way.
 *   - prefers-reduced-motion: reduce -> exactly one static, fully-lit frame is
 *     drawn at the settled pose. No entry, no idle drift, no scroll rotation,
 *     no rAF loop. A resize that actually changes the pixel size redraws that
 *     single frame; a resize notification that does not is ignored.
 *   - Rendering is suspended when the container leaves the viewport
 *     (IntersectionObserver) and when document.hidden becomes true. The entry
 *     clock is suspended with it, so a hero scrolled past and returned to still
 *     plays its animation from where it stopped.
 *   - GL initialisation is deferred to the next animation frame, so calling
 *     mountLogo3D() never blocks first paint.
 *
 * three.js is vendored at ../vendor/three.module.min.js (r169) and its
 * SVGLoader at ../vendor/SVGLoader.js. No network imports, no external HDR, no
 * extra dependencies.
 */

import {
  Scene,
  Group,
  PerspectiveCamera,
  WebGLRenderer,
  Shape,
  Path,
  ExtrudeGeometry,
  BufferGeometry,
  BufferAttribute,
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
  Vector2
} from '../vendor/three.module.min.js';

import { SVGLoader } from '../vendor/SVGLoader.js';

/* ---------------------------------------------------------------------------
 * 1. The vector source
 * ---------------------------------------------------------------------------
 * Verbatim copy of Assets/axyom-logo.svg. Inlined rather than fetched so the
 * module keeps its "no network request" guarantee and its synchronous, single
 * failure path. If the asset is ever re-traced, re-paste it here (or pass the
 * new markup as options.svgSource).
 *
 * Structure, which the builder below relies on:
 *   <g transform="translate(0,749) scale(0.1,-0.1)">   <- potrace, note the Y flip
 *     <path id="word" fill="#020a10" .../>   7 subpaths; 2 of them (the "a" and
 *                                            "o" counters) are holes
 *     <path id="star" fill="#00b3a1" .../>   1 subpath, lying diagonally
 * SVGLoader applies the group matrix, so the points arrive in viewBox space
 * with y pointing DOWN; every point is passed through toLogoUnits() below,
 * which is where the y flip back to three.js' y-up happens.
 */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1664 749" width="1664" height="749">
<g transform="translate(0.000000,749.000000) scale(0.100000,-0.100000)">
<path id="word" fill="#020a10" d="M9720 5449 c-441 -51 -771 -212 -1007 -492 -314 -375 -471 -853 -449
-1372 14 -332 74 -581 203 -840 194 -391 475 -649 839 -771 390 -131 928 -135
1314 -12 224 71 400 177 555 333 356 357 544 878 521 1445 -13 344 -80 607
-223 879 -268 512 -656 769 -1252 830 -119 13 -392 12 -501 0z m495 -764 c49
-14 117 -40 150 -58 82 -43 208 -171 262 -267 133 -237 182 -618 128 -990 -58
-396 -256 -655 -565 -737 -92 -25 -340 -24 -428 0 -215 60 -361 184 -462 392
-56 114 -83 203 -106 354 -20 131 -23 409 -5 541 73 534 358 812 816 796 91
-3 142 -11 210 -31z M1250 5420 c-262 -32 -508 -114 -670 -223 -263 -177 -428
-482 -465 -859 l-7 -68 424 0 423 0 23 83 c57 208 153 308 339 354 93 23 347
22 458 -1 197 -42 280 -116 306 -273 23 -140 -24 -235 -148 -300 -96 -50 -172
-66 -643 -133 -190 -27 -390 -61 -444 -75 -498 -130 -764 -401 -833 -850 -16
-109 -13 -311 7 -420 32 -175 110 -332 222 -451 177 -186 412 -291 700 -313
406 -30 731 87 1061 384 59 54 109 96 111 94 2 -2 9 -51 15 -109 7 -58 25
-141 39 -185 l27 -80 71 -3 72 -3 161 238 c88 131 228 326 310 433 l150 195 1
687 0 686 -63 79 c-130 160 -244 321 -615 860 -150 218 -123 198 -322 235 -82
15 -162 20 -370 23 -146 2 -299 0 -340 -5z m827 -2090 c-4 -191 -7 -237 -26
-304 -55 -199 -150 -314 -331 -404 -280 -138 -576 -130 -730 19 -152 147 -141
473 20 623 96 90 213 130 606 205 229 44 283 60 389 114 l70 35 3 -32 c2 -17
2 -132 -1 -256z M13436 5414 c-230 -31 -409 -116 -550 -259 -34 -34 -97 -112
-141 -174 l-80 -112 -3 236 -2 235 -424 0 -423 0 -6 -97 c-9 -128 -9 -2073 0
-2735 l6 -518 431 0 c237 0 436 4 443 8 10 6 13 261 16 1132 3 1048 4 1129 21
1184 70 233 224 342 498 354 73 3 141 0 180 -7 176 -35 287 -140 332 -315 33
-127 36 -223 36 -1288 l0 -1068 443 2 442 3 5 1100 c6 1194 2 1118 60 1264 82
209 260 321 510 321 265 0 421 -121 477 -371 14 -66 17 -200 20 -1196 l4
-1123 450 0 450 0 -4 1243 c-3 1082 -6 1254 -20 1332 -78 440 -338 723 -764
831 -309 78 -704 10 -964 -167 -86 -58 -205 -181 -274 -283 l-59 -86 -47 91
c-63 119 -104 173 -194 257 -128 120 -290 186 -518 211 -122 14 -226 12 -351
-5z M5160 5345 c0 -7 70 -199 75 -203 4 -4 235 197 235 205 0 1 -70 3 -155 3
-85 0 -155 -2 -155 -5z M7512 5168 c-480 -1718 -638 -2274 -643 -2265 -10 19
-371 1219 -560 1860 -24 81 -46 147 -49 147 -7 0 -627 -842 -635 -862 -4 -10
388 -1142 689 -1988 22 -62 77 -147 327 -505 165 -236 306 -436 313 -443 11
-11 29 22 99 180 126 286 215 528 512 1383 154 444 886 2541 919 2633 l15 42
-468 0 -468 0 -51 -182z M6030 1355 c-31 -8 -127 -13 -222 -14 l-168 -1 0
-348 0 -349 128 -6 c320 -17 535 -6 702 34 102 25 254 96 293 137 l29 30 -342
266 c-188 146 -347 265 -353 265 -7 -1 -37 -7 -67 -14z M1627 683 c-14 -14
-17 -15 -18 -3 0 10 -4 8 -9 -5 -8 -19 -9 -19 -9 -1 -1 16 -3 17 -18 5 -15
-12 -16 -12 -8 1 6 12 5 12 -5 3 -7 -6 -18 -10 -24 -7 -6 2 -18 -7 -27 -19
-259 -360 -429 -598 -439 -616 -11 -22 -11 -23 7 -10 58 42 723 635 723 645 0
7 -5 16 -12 20 -7 4 -8 3 -4 -4 5 -8 0 -12 -13 -12 -12 0 -21 5 -21 11 0 8 -6
7 -17 -2 -9 -8 -24 -13 -34 -11 -9 2 -20 -2 -24 -8 -5 -8 -11 -8 -21 1 -7 6
-11 15 -8 20 8 14 0 10 -19 -8z"/>
<path id="star" fill="#00b3a1" d="M6155 5835 c-1029 -910 -1875 -1654 -1882 -1653 -7 2 -616 491 -1353
1086 -738 596 -1344 1081 -1347 1078 -4 -3 2 -19 14 -34 11 -15 462 -645 1002
-1400 l982 -1374 -387 -541 c-214 -298 -774 -1081 -1245 -1739 -472 -658 -863
-1207 -870 -1220 -12 -22 -11 -22 7 -8 20 16 3171 2787 3215 2827 l26 24 1359
-1062 c1472 -1149 1414 -1105 1414 -1091 0 5 -429 619 -953 1363 -524 745
-967 1375 -985 1401 l-33 48 1432 1942 c788 1069 1443 1958 1457 1976 13 17
23 32 20 32 -2 0 -845 -745 -1873 -1655z"/>
</g></svg>`;

/* ---------------------------------------------------------------------------
 * 2. Small geometry helpers
 * ------------------------------------------------------------------------- */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutQuint = (x) => 1 - Math.pow(1 - clamp01(x), 5);
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -9 * x));
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const stagger = (t, start, span) => clamp01((t - start) / span);

/** Even-odd crossing test. `poly` is an array of {x, y}. */
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.y > py !== b.y > py &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y || 1e-12) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Drop consecutive duplicates and an explicit closing point. */
function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-7) out.push({ x: p.x, y: p.y });
  }
  while (
    out.length > 2 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-7
  ) {
    out.pop();
  }
  return out;
}

/**
 * Locate the four points of the sparkle: the vertices where the ring turns
 * hardest.
 *
 * Deliberately comparative rather than absolute — the turn measured at a needle
 * depends on the sample spacing (2.7 rad at 256 samples, 1.8 at 512 for the
 * shallowest of the four), so a fixed threshold is a trap. Take the `wanted`
 * hardest turns instead, with non-maximum suppression over a window wide enough
 * that one needle cannot supply two of them. The concave waists in between are
 * a clear step down (around 1.0 rad) and never displace a point.
 */
function findTips(ring, wanted) {
  const n = ring.length;
  if (n < wanted * 4) return [];
  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n];
    const m = ring[i];
    const c = ring[(i + 1) % n];
    const v1x = m.x - a.x;
    const v1y = m.y - a.y;
    const v2x = c.x - m.x;
    const v2y = c.y - m.y;
    turn[i] = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => turn[b] - turn[a]);
  const minSep = Math.max(2, Math.floor(n / (wanted * 3)));
  const picked = [];
  for (const i of order) {
    if (turn[i] < 0.9) break;
    let clear = true;
    for (const j of picked) {
      const d = Math.min((i - j + n) % n, (j - i + n) % n);
      if (d <= minSep) {
        clear = false;
        break;
      }
    }
    if (clear) picked.push(i);
    if (picked.length === wanted) break;
  }
  return picked;
}

function roundTips(ring, tipIndices, radius) {
  const tipPoints = tipIndices.map((i) => ring[i]);
  if (!(radius > 0) || tipIndices.length < 2) return { ring, tips: tipPoints };
  const n = ring.length;

  // Rotate so index 0 sits as far from every tip as possible, which stops any
  // fillet window from wrapping past the end of the array.
  let bestOffset = 0;
  let bestGap = -1;
  for (let o = 0; o < n; o++) {
    let gap = n;
    for (const t of tipIndices) {
      const d = Math.min((t - o + n) % n, (o - t + n) % n);
      if (d < gap) gap = d;
    }
    if (gap > bestGap) {
      bestGap = gap;
      bestOffset = o;
    }
  }
  const rot = ring.slice(bestOffset).concat(ring.slice(0, bestOffset));
  const tips = tipIndices.map((t) => (t - bestOffset + n) % n).sort((a, b) => a - b);

  // A fillet may never eat more than half the run between two neighbouring
  // points, or two windows would overlap and the splice would tear the ring.
  let minSpan = n;
  for (let i = 0; i < tips.length; i++) {
    const d = (tips[(i + 1) % tips.length] - tips[i] + n) % n;
    if (d > 0 && d < minSpan) minSpan = d;
  }
  const capM = Math.max(1, Math.floor(minSpan / 2) - 1);

  let perim = 0;
  for (let i = 0; i < n; i++) {
    perim += Math.hypot(rot[(i + 1) % n].x - rot[i].x, rot[(i + 1) % n].y - rot[i].y);
  }
  const seg = perim / n;
  const m = Math.max(1, Math.min(capM, Math.round(radius / Math.max(seg, 1e-9))));

  const skip = new Uint8Array(n);
  const fillet = new Map();
  for (const t of tips) {
    for (let d = -m; d <= m; d++) skip[(t + d + n) % n] = 1;
    fillet.set((t - m + n) % n, t);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (fillet.has(i)) {
      const t = fillet.get(i);
      const p0 = rot[i];
      const p1 = rot[t];
      const p2 = rot[(t + m) % n];
      const steps = 2 * m;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const w = 1 - u;
        out.push({
          x: w * w * p0.x + 2 * w * u * p1.x + u * u * p2.x,
          y: w * w * p0.y + 2 * w * u * p1.y + u * u * p2.y
        });
      }
      continue;
    }
    if (!skip[i]) out.push(rot[i]);
  }
  return { ring: cleanRing(out), tips: tipPoints };
}

/** Intersection of the lines (a,b) and (c,d); null when parallel. */
function lineIntersect(a, b, c, d) {
  const r1x = b.x - a.x;
  const r1y = b.y - a.y;
  const r2x = d.x - c.x;
  const r2y = d.y - c.y;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * r2y - (c.y - a.y) * r2x) / den;
  return { x: a.x + r1x * t, y: a.y + r1y * t };
}

/**
 * Per-vertex normals with a crease threshold, on a non-indexed geometry.
 *
 * ExtrudeGeometry finishes with computeVertexNormals(), and because its output
 * has no index that yields flat per-face normals — every segment of a letter's
 * curved wall shades as its own facet, which with a clearcoat reads as banding.
 * Averaging everything instead would round the edge between the front face and
 * the bevel, which is the one edge that has to stay sharp. So: average only
 * across faces that meet at less than `angleDeg`. Walls go smooth, the bevel
 * facets and the cap edges stay crisp.
 */
function creaseNormals(geo, angleDeg) {
  const pos = geo.attributes.position.array;
  const vCount = pos.length / 3;
  const tCount = vCount / 3;
  const fn = new Float32Array(tCount * 3);
  for (let t = 0; t < tCount; t++) {
    const i = t * 9;
    const ax = pos[i + 3] - pos[i];
    const ay = pos[i + 4] - pos[i + 1];
    const az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i];
    const by = pos[i + 7] - pos[i + 1];
    const bz = pos[i + 8] - pos[i + 2];
    fn[t * 3] = ay * bz - az * by;
    fn[t * 3 + 1] = az * bx - ax * bz;
    fn[t * 3 + 2] = ax * by - ay * bx;
  }
  const keys = new Array(vCount);
  const buckets = new Map();
  const Q = 1e4;
  for (let v = 0; v < vCount; v++) {
    const k =
      Math.round(pos[v * 3] * Q) + '|' + Math.round(pos[v * 3 + 1] * Q) + '|' + Math.round(pos[v * 3 + 2] * Q);
    keys[v] = k;
    let list = buckets.get(k);
    if (!list) buckets.set(k, (list = []));
    list.push(v);
  }
  const cosT = Math.cos((angleDeg * Math.PI) / 180);
  const out = new Float32Array(vCount * 3);
  for (let v = 0; v < vCount; v++) {
    const t = (v / 3) | 0;
    const nx = fn[t * 3];
    const ny = fn[t * 3 + 1];
    const nz = fn[t * 3 + 2];
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    let ax = 0;
    let ay = 0;
    let az = 0;
    const list = buckets.get(keys[v]);
    for (let q = 0; q < list.length; q++) {
      const u = (list[q] / 3) | 0;
      const mx = fn[u * 3];
      const my = fn[u * 3 + 1];
      const mz = fn[u * 3 + 2];
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      if ((nx * mx + ny * my + nz * mz) / (nl * ml) >= cosT) {
        ax += mx;
        ay += my;
        az += mz;
      }
    }
    const al = Math.sqrt(ax * ax + ay * ay + az * az);
    if (al > 1e-12) {
      out[v * 3] = ax / al;
      out[v * 3 + 1] = ay / al;
      out[v * 3 + 2] = az / al;
    } else {
      out[v * 3] = nx / nl;
      out[v * 3 + 1] = ny / nl;
      out[v * 3 + 2] = nz / nl;
    }
  }
  geo.setAttribute('normal', new BufferAttribute(out, 3));
  return geo;
}

/* ---------------------------------------------------------------------------
 * 3. Vector source -> logo-unit outlines
 * ---------------------------------------------------------------------------
 * Cached at module scope: parsing, flattening and filleting is pure and
 * deterministic, and the tests mount and destroy the module two dozen times in
 * a row. Only the GPU buffers are rebuilt per mount.
 */
let vectorCache = null;

function prepareVectors(opts) {
  const key = [
    opts.svgSource.length,
    opts.curveSegments,
    opts.outlinePoints,
    opts.tipRound,
    opts.cullOccluded
  ].join('/');
  if (vectorCache && vectorCache.key === key && vectorCache.src === opts.svgSource) {
    return vectorCache.value;
  }

  const parsed = new SVGLoader().parse(opts.svgSource);
  if (!parsed.paths.length) throw new Error('logo3d: no paths in the vector source');

  // Prefer the ids the asset carries; fall back to luminance (the wordmark is
  // the dark path) so a re-export without ids still composes correctly.
  let wordPath = null;
  let starPath = null;
  for (const p of parsed.paths) {
    const id = (p.userData && p.userData.node && p.userData.node.getAttribute('id')) || '';
    if (id === 'word') wordPath = p;
    else if (id === 'star') starPath = p;
  }
  if (!wordPath || !starPath) {
    const lum = (p) => {
      const c = p.color || new Color(0);
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    };
    const sorted = parsed.paths.slice().sort((a, b) => lum(a) - lum(b));
    wordPath = wordPath || sorted[0];
    starPath = starPath || sorted[sorted.length - 1];
    if (wordPath === starPath) throw new Error('logo3d: could not separate wordmark from sparkle');
  }

  // -- sparkle: one ring, arc-length sampled, then its four points located ----
  const starShapes = SVGLoader.createShapes(starPath);
  if (!starShapes.length) throw new Error('logo3d: sparkle path produced no shape');
  const rawRing = cleanRing(starShapes[0].getSpacedPoints(Math.max(64, opts.outlinePoints | 0)));
  const tipIdx = findTips(rawRing, 4);
  if (tipIdx.length < 4) throw new Error('logo3d: sparkle does not have four points');
  const rawTips = tipIdx.map((i) => rawRing[i]);

  // The convergence point is where the two axes through opposite points cross.
  // Ordering the four tips by angle about the ring's centroid makes 0/2 and 1/3
  // the opposite pairs.
  let bx = 0;
  let by = 0;
  for (const p of rawRing) {
    bx += p.x;
    by += p.y;
  }
  bx /= rawRing.length;
  by /= rawRing.length;
  const byAngle = rawTips
    .slice()
    .sort((a, b) => Math.atan2(a.y - by, a.x - bx) - Math.atan2(b.y - by, b.x - bx));
  let centre = { x: bx, y: by };
  const crossing = lineIntersect(byAngle[0], byAngle[2], byAngle[1], byAngle[3]);
  if (crossing) centre = crossing;

  // -- wordmark: every filled subpath with its counters as holes --------------
  const wordShapes = SVGLoader.createShapes(wordPath);
  const cs = Math.max(1, opts.curveSegments | 0);
  const wordParts = [];
  for (const sh of wordShapes) {
    const ep = sh.extractPoints(cs);
    const contour = cleanRing(ep.shape);
    if (contour.length < 3) continue;
    const holes = (ep.holes || []).map(cleanRing).filter((h) => h.length >= 3);
    // potrace hands the sparkle's darkest point to the black path. Anything
    // that lives entirely under the sparkle is invisible in the artwork, so
    // keeping it would only risk a black chip peeking out of a teal needle.
    let insideCount = 0;
    for (const p of contour) if (pointInPolygon(p.x, p.y, rawRing)) insideCount++;
    if (insideCount / contour.length >= opts.cullOccluded) continue;
    wordParts.push({ contour, holes });
  }
  if (!wordParts.length) throw new Error('logo3d: wordmark produced no shapes');

  // -- one common frame: ink bbox centred on origin, 2.0 units wide -----------
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const grow = (pts) => {
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  };
  for (const w of wordParts) grow(w.contour);
  grow(rawRing);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const S = 2 / (maxX - minX || 1);

  // Fillet the four points only now, because tipRound is quoted in logo units
  // and the source-to-logo scale is only known once the bounding box is.
  const starRing = roundTips(rawRing, tipIdx, opts.tipRound / S).ring;

  // y is negated here: SVG is y-down, three.js is y-up. Doing it on the points
  // rather than with a negative object scale keeps every matrix determinant
  // positive, so winding, culling and normals need no special-casing anywhere.
  const tf = (p) => new Vector2((p.x - cx) * S, -(p.y - cy) * S);

  const parts = wordParts.map((w) => {
    const contour = w.contour.map(tf);
    const holes = w.holes.map((h) => h.map(tf));
    let sx = 0;
    let sy = 0;
    for (const p of contour) {
      sx += p.x;
      sy += p.y;
    }
    return { contour, holes, cx: sx / contour.length, cy: sy / contour.length };
  });
  parts.sort((a, b) => a.cx - b.cx);

  const starCentre = tf(centre);
  const star = starRing.map(tf).map((p) => new Vector2(p.x - starCentre.x, p.y - starCentre.y));
  const tips = rawTips
    .map(tf)
    .map((p) => new Vector2(p.x - starCentre.x, p.y - starCentre.y))
    .sort((a, b) => b.length() - a.length());

  const value = {
    parts,
    star,
    starCentre,
    tips,
    box: {
      minX: (minX - cx) * S,
      maxX: (maxX - cx) * S,
      minY: -(maxY - cy) * S,
      maxY: -(minY - cy) * S
    }
  };
  vectorCache = { key, src: opts.svgSource, value };
  return value;
}

/* ---------------------------------------------------------------------------
 * 4. Outlines -> solids
 * ------------------------------------------------------------------------- */
function toShape(contour, holes) {
  const shape = new Shape(contour);
  for (const h of holes || []) shape.holes.push(new Path(h));
  return shape;
}

function extrude(shape, total, opts) {
  const bevelThickness = opts.rim * 1.25;
  // `depth` is the total thickness; ExtrudeGeometry adds a bevel at each end on
  // top of its own `depth`, so the flat core is what is left over.
  const core = Math.max(total - 2 * bevelThickness, total * 0.2);
  const geo = new ExtrudeGeometry(shape, {
    steps: 1,
    depth: core,
    curveSegments: 1, // the shapes arrive already flattened to polygons
    bevelEnabled: opts.rim > 0,
    bevelThickness,
    bevelSize: opts.rim,
    bevelOffset: 0,
    bevelSegments: Math.max(1, opts.bevelSegments | 0)
  });
  geo.translate(0, 0, -core / 2);
  return creaseNormals(geo, opts.creaseAngle);
}

/**
 * The wordmark: one solid per subpath, merged into a single non-indexed buffer
 * so the whole word is one draw call, but carrying two extra attributes —
 * `aDelay` (when this letter's entry starts) and `aCentroid` (what it pivots
 * about) — so the entry can still animate each letter independently.
 */
function buildWord(vec, opts) {
  const entries = [];
  let total = 0;
  const n = vec.parts.length;
  for (let i = 0; i < n; i++) {
    const part = vec.parts[i];
    const geo = extrude(toShape(part.contour, part.holes), opts.depth, opts);
    const count = geo.attributes.position.count;
    total += count;
    entries.push({ geo, count, delay: 0.02 + i * (0.38 / Math.max(1, n - 1)), cx: part.cx, cy: part.cy });
  }

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const del = new Float32Array(total);
  const cen = new Float32Array(total * 2);
  let o = 0;
  for (const e of entries) {
    pos.set(e.geo.attributes.position.array, o * 3);
    nor.set(e.geo.attributes.normal.array, o * 3);
    for (let i = 0; i < e.count; i++) {
      del[o + i] = e.delay;
      cen[(o + i) * 2] = e.cx;
      cen[(o + i) * 2 + 1] = e.cy;
    }
    o += e.count;
    e.geo.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
  geo.setAttribute('aDelay', new BufferAttribute(del, 1));
  geo.setAttribute('aCentroid', new BufferAttribute(cen, 2));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The sparkle: one solid, thicker than the wordmark and pushed forward so it
 * occludes the letters exactly as it does in the artwork.
 *
 * Three extra attributes drive the entry: which of the four axes a vertex rides
 * out along (`aTipAxis`), when that point fires (`aTipDelay`), and how much of
 * the extension it takes (`aHold`, ramped from 0 at the convergence point so
 * the four blades stay knitted together instead of tearing apart at the waist).
 * Doing the axis lookup here rather than in the shader keeps the vertex program
 * branch-free.
 *
 * The same pass bakes the artwork's teal gradient into a colour attribute:
 * bright at the long top-right point, deep at the bottom-left one.
 */
function buildStar(vec, opts) {
  const total = opts.depth * opts.starDepthScale;
  const geo = extrude(toShape(vec.star, null), total, opts);
  const pos = geo.attributes.position.array;
  const count = geo.attributes.position.count;

  const dirs = vec.tips.map((t) => t.clone().normalize());
  const radii = vec.tips.map((t) => t.length());
  const maxR = Math.max.apply(null, radii) || 1;
  // Longest point first (that is how prepareVectors sorted them), so the
  // staggered schedule reads as "the long axis fires, then the short one".
  const delays = [0.3, 0.345, 0.32, 0.365];

  const axis = new Float32Array(count * 2);
  const delay = new Float32Array(count);
  const hold = new Float32Array(count);
  const col = new Float32Array(count * 3);

  // Gradient axis: from the deep point to the bright one, in the artwork that
  // is bottom-left -> top-right, i.e. the two ends of the longest diagonal.
  const gA = vec.tips[0];
  const gB = vec.tips.length > 1 ? vec.tips[1] : new Vector2(-gA.x, -gA.y);
  const gx = gA.x - gB.x;
  const gy = gA.y - gB.y;
  const gLen2 = gx * gx + gy * gy || 1;
  const dark = 1 - 0.78 * clamp01(opts.starGradient);
  const bright = 1 + 0.12 * clamp01(opts.starGradient);

  for (let v = 0; v < count; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const r = Math.hypot(x, y) || 1e-6;
    let best = -2;
    let q = 0;
    for (let j = 0; j < dirs.length; j++) {
      const d = (x * dirs[j].x + y * dirs[j].y) / r;
      if (d > best) {
        best = d;
        q = j;
      }
    }
    axis[v * 2] = dirs[q].x;
    axis[v * 2 + 1] = dirs[q].y;
    delay[v] = delays[q % delays.length];
    const h = (r / maxR - 0.08) / 0.34;
    hold[v] = h <= 0 ? 0 : h >= 1 ? 1 : h * h * (3 - 2 * h);
    const t = clamp01(((x - gB.x) * gx + (y - gB.y) * gy) / gLen2);
    const m = dark + (bright - dark) * (t * t * (3 - 2 * t));
    col[v * 3] = m;
    col[v * 3 + 1] = m;
    col[v * 3 + 2] = m;
  }

  geo.setAttribute('aTipAxis', new BufferAttribute(axis, 2));
  geo.setAttribute('aTipDelay', new BufferAttribute(delay, 1));
  geo.setAttribute('aHold', new BufferAttribute(hold, 1));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/* ---------------------------------------------------------------------------
 * 5. Entry deformation, injected into the physical materials
 * ---------------------------------------------------------------------------
 * Both injections read a per-vertex delay, so a single shared material animates
 * six letters (or four points) on six (four) different schedules without any
 * uniform-array indexing — which GLSL ES 1.0 only conditionally allows — and
 * without splitting the mesh into six draw calls.
 *
 * At uEntry = 1 every displacement is exactly zero, so the settled frame is the
 * extruded geometry untouched.
 */
const EASE_GLSL = `
float axyEase( float x ) {
  x = clamp( x, 0.0, 1.0 );
  float m = 1.0 - x;
  return 1.0 - m * m * m * m * m;
}`;

function uniqueKey() {
  uniqueKey.n = (uniqueKey.n || 0) + 1;
  return 'axyom-logo3d-' + uniqueKey.n;
}

/** Wordmark: each letter flips up about its own vertical axis and rises. */
function installWordEntry(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aDelay;
        attribute vec2 aCentroid;
        uniform float uEntry;
        uniform float uSpan;
        uniform float uSpin;
        uniform float uRise;
        uniform float uShrink;
        uniform float uDepthScale;
        varying float vFade;
        ${EASE_GLSL}
        float axyK() { return axyEase( ( uEntry - aDelay ) / max( uSpan, 1e-4 ) ); }`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3( normal );
        {
          float ang = ( 1.0 - axyK() ) * uSpin;
          float cs = cos( ang );
          float sn = sin( ang );
          objectNormal = vec3(
            objectNormal.x * cs + objectNormal.z * sn,
            objectNormal.y,
            -objectNormal.x * sn + objectNormal.z * cs );
        }`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
        {
          float k = axyK();
          vFade = clamp( k * 3.0, 0.0, 1.0 );
          float ang = ( 1.0 - k ) * uSpin;
          float cs = cos( ang );
          float sn = sin( ang );
          vec3 q = vec3( transformed.xy - aCentroid, transformed.z );
          q.xy *= mix( uShrink, 1.0, k );
          q.z *= uDepthScale;
          transformed = vec3(
            aCentroid.x + q.x * cs + q.z * sn,
            aCentroid.y + q.y - ( 1.0 - k ) * uRise,
            -q.x * sn + q.z * cs );
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  const key = uniqueKey();
  material.customProgramCacheKey = () => key;
}

/** Sparkle: the four points extend along their own axes on staggered clocks. */
function installStarEntry(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aTipAxis;
        attribute float aTipDelay;
        attribute float aHold;
        uniform float uEntry;
        uniform float uSpan;
        uniform float uStub;
        uniform float uDepthScale;
        ${EASE_GLSL}`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
        {
          float k = mix( uStub, 1.0, axyEase( ( uEntry - aTipDelay ) / max( uSpan, 1e-4 ) ) );
          float s = mix( 1.0, k, aHold );
          float along = dot( transformed.xy, aTipAxis );
          transformed.xy = ( transformed.xy - aTipAxis * along ) + aTipAxis * ( along * s );
          transformed.z *= uDepthScale;
        }`
      );
  };
  const key = uniqueKey();
  material.customProgramCacheKey = () => key;
}

/* ---------------------------------------------------------------------------
 * 6. Procedural studio environment (no HDR files)
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
  // cyclorama, the way a white-cove product shot actually looks. The near-black
  // wordmark lives almost entirely off this: on white, a black solid only reads
  // as a solid because of what it reflects.
  float up = d.y * 0.5 + 0.5;
  vec3 sky = mix(vec3(0.13, 0.14, 0.15), vec3(0.94, 0.96, 0.98), pow(up, 0.85));
  // Soft key glow high on the right so reflections carry a direction.
  float key = pow(max(dot(d, normalize(vec3(0.62, 0.68, 0.40))), 0.0), 5.0);
  sky += vec3(1.05, 1.02, 0.98) * key * 1.25;
  // Cool bounce low-left, so the deep side of the sparkle stays green-teal
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

  // Explicit softboxes give crisp, believable specular shapes on the bevel.
  // The grazing panels are the important ones: a bevel is only a couple of
  // millimetres of surface, tilted ~45 degrees, so what it mirrors into the
  // camera is whatever sits almost in the plane of the logo.
  const boxes = [
    { size: 9, pos: [7.5, 8.5, 6.5], color: 0xffffff, intensity: 1.8 },
    { size: 7, pos: [10.0, 3.5, -1.5], color: 0xffffff, intensity: 3.4 },
    { size: 7, pos: [3.5, 10.0, -1.5], color: 0xf4fffd, intensity: 2.6 },
    { size: 9, pos: [-9.0, 4.0, 4.0], color: 0xeef7ff, intensity: 1.1 },
    { size: 8, pos: [-1.5, -7.5, 4.0], color: 0xd7f2ec, intensity: 0.35 }
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
 * 7. Contact shadow
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
 * 8. Fallback path
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
 * 9. Entry point
 * ------------------------------------------------------------------------- */
export function mountLogo3D(container, options = {}) {
  if (!container || !container.appendChild) {
    throw new TypeError('mountLogo3D: first argument must be an element');
  }

  const opts = {
    color: 0x00b39c,
    wordColor: 0x060c11,
    starGradient: 0.82,
    rotationZ: 0,
    depth: 0.115,
    starDepthScale: 1.45,
    rim: 0.0055,
    bevelSegments: 3,
    tipRound: 0.01,
    outlinePoints: 512,
    curveSegments: 8,
    creaseAngle: 32,
    cullOccluded: 0.6,
    padding: 0.1,
    fov: 20,
    maxPixelRatio: 2,
    antialias: true,
    exposure: 1.0,
    shadow: true,
    shadowOpacity: 0.18,
    entry: true,
    entryDuration: 1500,
    idle: true,
    idleAmount: 1,
    progressYaw: 0.46,
    progressPitch: -0.16,
    progressScale: 0.86,
    svgSource: LOGO_SVG,
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
  let booting = true; // suppress redraws until init has finished building
  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;

  let renderer = null;
  let scene = null;
  let camera = null;
  let logoGroup = null; // rotated / scaled as a whole
  let wordMesh = null;
  let starMesh = null;
  let wordGeo = null;
  let starGeo = null;
  let wordMat = null;
  let starMat = null;
  let shadowMesh = null;
  let shadowTex = null;
  let envTarget = null;
  let sweepLight = null;
  let resizeObs = null;
  let interObs = null;
  let canvas = null;
  let fallbackHandle = null;
  let box = null;

  const wordUniforms = {
    uEntry: { value: 1 },
    uSpan: { value: 0.5 },
    uSpin: { value: -1.15 },
    uRise: { value: 0.1 },
    uShrink: { value: 0.86 },
    uDepthScale: { value: 1 }
  };
  const starUniforms = {
    uEntry: { value: 1 },
    uSpan: { value: 0.58 },
    uStub: { value: 0.14 },
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
    if (booting) return;
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

  /**
   * Contain-fit. The logo is ~2.23:1, so in any container narrower than that —
   * every phone — the width term wins and the logo fills the width with the
   * padding respected, sitting centred in the leftover height. That is the
   * right answer for a tall container: fitting the height instead would leave
   * the mark a fifth of the width it could have had.
   */
  function fitCamera(w, h) {
    if (!camera || !box) return;
    const aspect = w / h;
    camera.aspect = aspect;
    const halfFov = MathUtils.degToRad(opts.fov) / 2;
    // ExtrudeGeometry's bevel pushes the flat core `rim` proud of the source
    // outline, so the real silhouette is a touch wider than the ink box.
    const halfH = ((box.maxY - box.minY) / 2 + opts.rim) * (1 + opts.padding) * 1.1; // room for the shadow
    const halfW = ((box.maxX - box.minX) / 2 + opts.rim) * (1 + opts.padding);
    const distH = halfH / Math.tan(halfFov);
    const distW = halfW / (Math.tan(halfFov) * aspect);
    camera.position.set(0, 0, Math.max(distH, distW));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  /**
   * Idempotent: a ResizeObserver fires once on observe() and again on every
   * layout pass that merely touches the element, and under reduced motion each
   * of those would repaint the one static frame for nothing.
   */
  function resize() {
    if (!renderer) return;
    const { w, h } = containerSize();
    const dpr = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio);
    if (w === lastW && h === lastH && dpr === lastDpr) return;
    lastW = w;
    lastH = h;
    lastDpr = dpr;
    renderer.setPixelRatio(dpr);
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
    // A malformed or missing vector source must not leave a blank hero.
    let vec;
    try {
      vec = prepareVectors(opts);
      wordGeo = buildWord(vec, opts);
      starGeo = buildStar(vec, opts);
    } catch (err) {
      // A broken vector source is a bug, not an environment condition, and it
      // is invisible from the outside (the hero simply shows the PNG), so say
      // so once rather than degrading in silence.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('logo3d: could not build the logo geometry, falling back to the image.', err);
      }
      degradeToFallback();
      return;
    }
    box = vec.box;

    // -- materials ---------------------------------------------------------
    // Near-black with a clearcoat: on a white page a black solid collapses to a
    // flat silhouette unless its bevel and its walls can catch the environment.
    // The roughness therefore stays low — but the environment contribution is
    // deliberately held well under 1, because a black object that mirrors a
    // white studio at full strength stops reading as black and starts reading
    // as 1990s chrome.
    wordMat = new MeshPhysicalMaterial({
      color: new Color(opts.wordColor),
      metalness: 0.0,
      roughness: 0.27,
      clearcoat: 0.42,
      clearcoatRoughness: 0.07,
      reflectivity: 0.4,
      envMapIntensity: 0.5,
      specularIntensity: 1,
      transparent: true,
      depthWrite: true,
      opacity: 1
    });
    installWordEntry(wordMat, wordUniforms);

    starMat = new MeshPhysicalMaterial({
      color: new Color(opts.color),
      vertexColors: true,
      metalness: 0.06,
      roughness: 0.16,
      clearcoat: 0.6,
      clearcoatRoughness: 0.045,
      reflectivity: 0.35,
      envMapIntensity: 0.3,
      specularIntensity: 1,
      transparent: true,
      depthWrite: true,
      opacity: 1
    });
    installStarEntry(starMat, starUniforms);

    wordMesh = new Mesh(wordGeo, wordMat);
    starMesh = new Mesh(starGeo, starMat);
    // Back faces very nearly coplanar would z-fight where the two solids
    // overlap, so the sparkle sits a hair proud at the back as well as
    // standing clearly in front.
    const lift = (opts.depth * (opts.starDepthScale - 1)) / 2 + 0.004;
    starMesh.position.set(vec.starCentre.x, vec.starCentre.y, lift);
    starMesh.renderOrder = 1;

    logoGroup = new Group();
    logoGroup.add(wordMesh);
    logoGroup.add(starMesh);
    logoGroup.rotation.z = opts.rotationZ;
    scene.add(logoGroup);

    // -- lights (key / fill / rim + the entry sweep) ------------------------
    // Point lights, not directionals, for key and fill: the inverse-square
    // falloff across a 2-unit-wide logo is part of what tips the right-hand
    // letters brighter than the left-hand ones.
    const key = new PointLight(0xffffff, 13, 0, 2);
    key.position.set(1.9, 2.2, 2.0);
    scene.add(key);

    const fill = new PointLight(0xbfe4dc, 4.2, 0, 2);
    fill.position.set(-2.4, -1.4, 1.9);
    scene.add(fill);

    const rim = new DirectionalLight(0x6fe6cf, 0.45);
    rim.position.set(-1.4, 1.2, -1.9);
    scene.add(rim);

    // Face-on fill. The front faces are flat and parallel, so without this the
    // whole word would sit in one flat tone.
    const front = new DirectionalLight(0xffffff, 0.42);
    front.position.set(0.5, 0.8, 3.0);
    scene.add(front);

    scene.add(new AmbientLight(0xcfeee8, 0.05));

    sweepLight = new DirectionalLight(0xffffff, 0);
    sweepLight.position.set(-3, 0.6, 2.4);
    scene.add(sweepLight);

    // -- contact shadow ----------------------------------------------------
    if (opts.shadow) {
      shadowTex = buildShadowTexture();
      const w = (box.maxX - box.minX) * 1.35;
      shadowMesh = new Mesh(
        new PlaneGeometry(w, w * 0.24),
        new MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          opacity: reducedMotion ? opts.shadowOpacity : 0,
          depthWrite: false,
          toneMapped: false
        })
      );
      shadowMesh.position.set(0, box.minY - 0.055, -0.16);
      scene.add(shadowMesh);
    }

    resize();

    resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    if (resizeObs) resizeObs.observe(container);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility, false);

    if (reducedMotion) {
      applyPose(1, 1);
      booting = false;
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
    booting = false;
    drawOnce();
    if (opts.onReady) opts.onReady(handle);
    syncLoop();
  }

  /* --- animation ---------------------------------------------------------- */
  /**
   * Places the logo for a given entry phase (0..1) and applies idle drift and
   * scroll progress. Kept as one function so the reduced-motion still frame and
   * the animated path cannot drift apart.
   *
   * Choreography, in units of the entry phase:
   *   0.00-0.55  thickness extrudes; the sparkle's core X is already present
   *   0.02-0.90  the six wordmark parts flip up and fade in, left to right
   *   0.30-0.98  the four sparkle points shoot out along their own axes
   *   0.08-0.90  a hard specular band sweeps across, resolving as it settles
   *   0.00-1.00  a controlled quarter turn coming to rest square-on
   */
  function applyPose(entry, settle) {
    const e = clamp01(entry);

    wordUniforms.uEntry.value = e;
    starUniforms.uEntry.value = e;
    const depthScale = 0.06 + 0.94 * easeOutExpo(stagger(e, 0.0, 0.55));
    wordUniforms.uDepthScale.value = depthScale;
    starUniforms.uDepthScale.value = depthScale;

    // Settling rotation: a controlled quarter turn coming to rest square-on.
    const s = easeInOutCubic(e);
    const entryYaw = (1 - s) * -0.52;
    const entryPitch = (1 - s) * 0.22;
    const entryRoll = (1 - s) * 0.06;
    const entryScale = 0.9 + 0.1 * easeOutQuint(stagger(e, 0.05, 0.8));

    // Idle drift, only once settled and only if enabled.
    const idleGain = opts.idle && !reducedMotion ? settle * opts.idleAmount : 0;
    const driftYaw = Math.sin(idleClock / 6400) * 0.075 * idleGain;
    const driftPitch = Math.sin(idleClock / 8900 + 1.1) * 0.034 * idleGain;
    const driftRoll = Math.sin(idleClock / 11700 + 2.3) * 0.014 * idleGain;

    // Scroll progress.
    const p = progress;
    const scale = entryScale * (1 + (opts.progressScale - 1) * p);

    logoGroup.rotation.y = entryYaw + driftYaw + opts.progressYaw * p;
    logoGroup.rotation.x = entryPitch + driftPitch + opts.progressPitch * p;
    logoGroup.rotation.z = opts.rotationZ + entryRoll + driftRoll;
    logoGroup.scale.setScalar(scale);

    // The wordmark fades per letter inside the shader; the sparkle fades whole.
    starMat.opacity = clamp01(stagger(e, 0.06, 0.3));

    // Light sweep: a hard specular band crossing the face, peaking mid-entry
    // and resolving to nothing exactly as the logo stops moving.
    const sweepPhase = stagger(e, 0.08, 0.82);
    const env = Math.sin(Math.PI * sweepPhase);
    sweepLight.intensity = env * env * 2.6;
    sweepLight.position.set(-3.4 + 6.8 * sweepPhase, 0.9 - 0.6 * sweepPhase, 2.6);

    if (shadowMesh) {
      shadowMesh.material.opacity = opts.shadowOpacity * easeOutQuint(stagger(e, 0.2, 0.7));
      const sw = 0.7 + 0.3 * easeOutQuint(stagger(e, 0.2, 0.7));
      shadowMesh.scale.set(sw * (1 - 0.1 * p), sw, 1);
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

    if (wordGeo) wordGeo.dispose();
    if (starGeo) starGeo.dispose();
    if (wordMat) wordMat.dispose();
    if (starMat) starMat.dispose();
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
    lastW = 0;
    lastH = 0;
    lastDpr = 0;
    wordMesh = null;
    starMesh = null;
    wordGeo = null;
    starGeo = null;
    wordMat = null;
    starMat = null;
    shadowMesh = null;
    shadowTex = null;
    envTarget = null;
    logoGroup = null;
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
