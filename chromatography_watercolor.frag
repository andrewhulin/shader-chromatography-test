// ============================================================
// Chromatography Watercolor Shader — Flutter Edition
// ============================================================
// A single-pass fragment shader simulating watercolor painting
// with chromatographic pigment separation. Designed for Flutter's
// FragmentProgram API with seed-based personalization.
//
// Uniforms:
//   uResolution (vec2) — canvas size in pixels
//   uTime (float)      — animation time (0.0 for static)
//   uSeed (float)      — composition seed (unique per user)
//
// Techniques:
//   - Blob-cluster SDF flowers merged with smooth-min
//   - Quilez two-level domain warping
//   - Chromatographic pigment separation
//   - Subtractive glaze compositing (Bousseau model)
//   - Coffee-ring edge darkening
//   - Marangoni backrun splotches
//   - Paper texture (FBM + Worley)
// ============================================================

#include <flutter/runtime_effect.glsl>

uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;

out vec4 fragColor;

// ─── PAPER COLOR ───
#define PAPER vec3(0.988, 0.973, 0.941)

// ─── HASH FUNCTIONS ───
float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash1f(float p) {
    return fract(sin(p * 127.1) * 43758.5453);
}

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

// ─── VALUE NOISE ───
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash1(i), b = hash1(i + vec2(1.0, 0.0));
    float c = hash1(i + vec2(0.0, 1.0)), d = hash1(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ─── ROTATION MATRIX (for FBM octave rotation) ───
const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

// ─── FBM (3 octaves — mobile-optimized) ───
float fbm3(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
        s += a * noise(p);
        p = ROT * p * 2.0;
        a *= 0.5;
    }
    return s;
}

// ─── TURBULENCE (3 octaves) ───
float turbulence(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
        s += a * abs(noise(p) * 2.0 - 1.0);
        p = ROT * p * 2.0;
        a *= 0.5;
    }
    return s;
}

// ─── DOMAIN WARP (Quilez two-level) ───
float domainWarp(vec2 p, out vec2 q, out vec2 r) {
    q = vec2(fbm3(p), fbm3(p + vec2(5.2, 1.3)));
    r = vec2(fbm3(p + 4.0 * q + vec2(1.7, 9.2)),
             fbm3(p + 4.0 * q + vec2(8.3, 2.8)));
    return fbm3(p + 4.0 * r);
}

// ─── SDF PRIMITIVES ───
float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdEllipseApprox(vec2 p, vec2 r) {
    float k = length(p / r);
    return (k - 1.0) * min(r.x, r.y) / max(k, 0.001);
}

// Smooth minimum — merges shapes like wet paint pooling
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── PAPER TEXTURE ───
float paperTex(vec2 uv) {
    return fbm3(uv * 50.0) * 0.6
         + noise(uv * 150.0) * 0.25
         + turbulence(uv * 90.0) * 0.15;
}

float worley(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float md = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 nb = vec2(float(x), float(y));
            vec2 pt = hash2(i + nb) * 0.5 + 0.5;
            md = min(md, length(nb + pt - f));
        }
    }
    return md;
}

// ─── ORGANIC FLOWER SDF (blob-cluster petals) ───
// Each petal is an elongated ellipse randomly placed around center,
// merged with smin for the loose gestural watercolor floral look.
float flowerSDF(vec2 p, float size, float seed, float nPetals) {
    float d = 1e5;

    for (float i = 0.0; i < 8.0; i++) {
        if (i >= nPetals) break;

        float baseAngle = i / nPetals * 6.2832;
        float angleJitter = (hash1f(seed + i * 13.7) - 0.5) * 0.9;
        float angle = baseAngle + angleJitter;

        float reach = size * (0.35 + 0.3 * hash1f(seed + i * 7.3));
        vec2 petalCenter = vec2(cos(angle), sin(angle)) * reach;

        float petalLen = size * (0.3 + 0.25 * hash1f(seed + i * 23.1));
        float petalWidth = petalLen * (0.3 + 0.35 * hash1f(seed + i * 31.7));

        float petalAngle = angle + (hash1f(seed + i * 41.3) - 0.5) * 0.7;
        float ca = cos(petalAngle), sa = sin(petalAngle);
        mat2 rot = mat2(ca, sa, -sa, ca);

        vec2 lp = rot * (p - petalCenter);
        float pd = sdEllipseApprox(lp, vec2(petalLen, petalWidth));

        // Domain warp on each petal boundary for organic feel
        pd += fbm3((p + petalCenter) * 8.0 / size + seed + i * 5.0) * size * 0.09;

        // Smooth-min merge (wet paint pooling)
        float k = size * (0.05 + 0.04 * hash1f(seed + i * 51.3));
        d = smin(d, pd, k);
    }

    return d;
}

// ─── CHROMATOGRAPHIC PIGMENT SEPARATION ───
// Simulates how different pigments travel at different rates
// through wet paper via capillary action.
vec3 chromatography(vec2 uv, vec3 pig1, vec3 pig2, float amount, float seed) {
    vec2 flow = vec2(fbm3(uv * 3.0 + seed), fbm3(uv * 3.0 + vec2(7.1, 3.3) + seed));
    float heavy = fbm3(uv * 4.0 + seed * 0.7);
    float light = fbm3((uv + flow * amount) * 2.5 + seed * 1.3);
    float separation = smoothstep(0.2, 0.8, light - heavy * 0.4);
    return mix(pig1, pig2, separation);
}

// ─── SUBTRACTIVE GLAZE COMPOSITING (Bousseau model) ───
vec3 glazeOver(vec3 under, vec3 pigment, float alpha) {
    vec3 transmittance = mix(vec3(1.0), pigment, alpha);
    return under * transmittance;
}

// ─── WASH LAYER ───
// Renders a single flower/shape with wet bleeding halo and coffee-ring edges.
vec4 computeWash(vec2 uv, vec2 center, float size, float nPetals, float seed,
                  vec3 pig1, vec3 pig2, float opacity, float wetness, float anim) {
    vec2 local = uv - center;

    // Subtle animation: breathe boundaries
    vec2 animOffset = vec2(0.0);
    if (anim > 0.0) {
        animOffset = vec2(
            sin(anim * 0.3 + seed * 2.0) * 0.003,
            cos(anim * 0.25 + seed * 3.0) * 0.003
        );
    }
    local += animOffset;

    // Organic flower shape
    float dist = flowerSDF(local, size, seed, nPetals);

    // Large-scale boundary warp
    vec2 q, r;
    float warpVal = domainWarp(local * 2.5 / size + seed * 0.3, q, r);
    dist += (warpVal - 0.5) * size * 0.18;

    // Finer boundary noise
    dist -= fbm3(uv * 12.0 + seed) * size * 0.07;

    // Dual-zone: saturated interior + bleeding halo
    float bleedDist = size * wetness;
    float innerEdge = smoothstep(0.0, -size * 0.04, dist);
    float outerBleed = smoothstep(bleedDist, 0.0, dist);

    // Coffee-ring edge darkening (stronger)
    float edgeWidth = size * 0.03 * (1.0 + fbm3(uv * 15.0 + seed * 2.0) * 0.9);
    float edgeDark = smoothstep(edgeWidth, 0.0, abs(dist)) * 0.7;

    // Chromatographic color (stronger separation)
    float chromaAmt = 0.06 + 0.08 * hash1f(seed * 3.7);
    vec3 pigColor = chromatography(uv, pig1, pig2, chromaAmt, seed);

    // Opacity variation
    float densityVar = 0.6 + 0.4 * fbm3(uv * 6.0 + seed * 1.1);
    float centerFade = smoothstep(size * 1.2, size * 0.1, length(local));

    // Paper granulation
    float gran = hash1f(seed * 5.3) * 0.7;
    float paper = paperTex(uv);
    float granMod = mix(1.0, 1.0 - paper * 0.5, gran);

    // Combine alpha
    float alpha = outerBleed * 0.2 + innerEdge * 0.7;
    alpha *= opacity * densityVar * centerFade * granMod;
    alpha += edgeDark * opacity * 0.55;
    alpha = clamp(alpha, 0.0, 1.0);

    // Color adjustments
    pigColor = mix(pigColor, pigColor * 0.35, edgeDark);
    pigColor = mix(pigColor, pig2, length(q) * 0.18);

    return vec4(pigColor, alpha);
}

// ─── ABSTRACT WASH (large transparent color field) ───
// Creates the "color study" / stripe wash effect seen in the reference.
vec4 computeAbstractWash(vec2 uv, float seed, vec3 color, float anim) {
    // Flow direction derived from seed
    float angle = hash1f(seed * 7.7) * 3.14159;
    vec2 dir = vec2(cos(angle), sin(angle));

    // Project UV onto flow direction
    float proj = dot(uv, dir);

    // Animate gently
    if (anim > 0.0) {
        proj += sin(anim * 0.15 + seed) * 0.02;
    }

    // Create a soft band shape with noise
    float center = hash1f(seed * 11.3) * 0.6 + 0.2;
    float width = 0.15 + hash1f(seed * 19.1) * 0.2;
    float band = smoothstep(width, 0.0, abs(proj - center));

    // Domain warp the band heavily
    vec2 q, r;
    float warp = domainWarp(uv * 2.0 + seed * 0.5, q, r);
    band *= (0.5 + warp * 0.8);

    // Very soft edges with noise
    band *= fbm3(uv * 5.0 + seed * 2.0);

    // Chromatographic color shift within the wash
    vec3 washColor = mix(color, color * vec3(1.1, 0.85, 1.15), fbm3(uv * 3.0 + seed));

    // Very transparent
    float alpha = band * 0.12;

    return vec4(washColor, clamp(alpha, 0.0, 1.0));
}

// ─── SPLOTCH (Marangoni backrun bloom) ───
vec4 computeSplotch(vec2 uv, vec2 center, float size, vec3 color, float seed) {
    vec2 local = uv - center;
    float dist = sdCircle(local, size);

    vec2 q, r;
    float w = domainWarp(local * 3.0 / size + seed, q, r);
    dist += w * size * 0.35;
    dist -= fbm3(uv * 8.0 + seed * 3.0) * size * 0.18;

    float fill = smoothstep(size * 0.02, -size * 0.03, dist) * 0.1;
    float bloom = smoothstep(size * 0.25, 0.0, dist) * 0.08;
    float scallop = smoothstep(size * 0.018, 0.0, abs(dist)) * 0.3;

    float alpha = fill + bloom + scallop;
    alpha *= (0.6 + 0.4 * turbulence(uv * 6.0 + seed));

    vec3 sc = mix(color, color * 0.45, length(q) * 0.6);
    sc = mix(sc, color * 1.3, r.y * 0.25);
    return vec4(clamp(sc, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}

// ─── CURVED STEM (quadratic bezier) ───
float sdBezier(vec2 p, vec2 a, vec2 b, vec2 c) {
    float d = 1e5;
    for (float i = 0.0; i <= 1.0; i += 0.05) {
        vec2 q = mix(mix(a, b, i), mix(b, c, i), i);
        d = min(d, length(p - q));
    }
    return d;
}

float curvedStem(vec2 uv, vec2 start, vec2 end, vec2 ctrl, float width, float seed) {
    float d = sdBezier(uv, start, ctrl, end);
    d += fbm3(uv * 40.0 + seed) * width * 0.6;

    float t = clamp(dot(uv - start, end - start) / dot(end - start, end - start), 0.0, 1.0);
    float taper = smoothstep(0.0, 0.08, t) * mix(1.0, 0.4, t);
    float w = width * taper * (0.7 + 0.3 * noise(vec2(t * 8.0, seed)));

    return smoothstep(w, w * 0.15, d);
}

// ─── PALETTE SELECTION ───
// Returns a pair of pigments for chromatographic separation based on index and seed.
void getPigmentPair(int idx, float seed, out vec3 pig1, out vec3 pig2) {
    // Vibrant palette matching Pinterest aesthetic
    vec3 hotPink  = vec3(0.95, 0.18, 0.55);
    vec3 magenta  = vec3(0.88, 0.12, 0.45);
    vec3 coral    = vec3(0.96, 0.40, 0.28);
    vec3 purple   = vec3(0.55, 0.15, 0.60);
    vec3 olive    = vec3(0.35, 0.52, 0.22);
    vec3 gold     = vec3(0.94, 0.72, 0.20);
    vec3 blue     = vec3(0.15, 0.25, 0.60);
    vec3 blush    = vec3(0.92, 0.55, 0.50);
    vec3 brown    = vec3(0.55, 0.30, 0.18);
    vec3 deepRed  = vec3(0.75, 0.10, 0.20);

    // Seed modulates the palette slightly for variety
    float sv = hash1f(seed * 3.1);

    if (idx == 0)      { pig1 = hotPink + 0.06 * sv; pig2 = magenta; }
    else if (idx == 1) { pig1 = coral;   pig2 = gold + 0.05 * sv; }
    else if (idx == 2) { pig1 = magenta; pig2 = purple; }
    else if (idx == 3) { pig1 = olive;   pig2 = vec3(0.48, 0.58, 0.18) + 0.04 * sv; }
    else if (idx == 4) { pig1 = blush;   pig2 = coral; }
    else if (idx == 5) { pig1 = purple;  pig2 = blue + 0.04 * sv; }
    else if (idx == 6) { pig1 = deepRed; pig2 = hotPink; }
    else               { pig1 = brown;   pig2 = gold; }
}

// ─── MAIN COMPOSITION ───
void main() {
    vec2 fragCoord = FlutterFragCoord();
    vec2 uv = fragCoord / uResolution;
    float aspect = uResolution.x / uResolution.y;
    vec2 uvA = vec2(uv.x * aspect, uv.y);

    // Seed is the sole driver of composition
    float seed = uSeed;
    float anim = uTime * 0.025;

    // ─── Paper base ───
    float paper = paperTex(uv);
    float pw = worley(uv * 70.0);
    vec3 result = PAPER - vec3(paper * 0.025 + pw * 0.012);
    result += vec3(0.004, 0.001, -0.002) * fbm3(uv * 4.0);

    vec3 ink = vec3(0.10, 0.07, 0.05);

    // ─── Abstract background washes (color study fields) ───
    // 3 large transparent washes for depth
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float ws = hash1f(seed + fi * 53.7);
        vec3 p1, p2;
        getPigmentPair(int(mod(fi + floor(hash1f(seed * 2.3) * 3.0), 8.0)), seed + fi, p1, p2);
        vec4 aw = computeAbstractWash(uvA, ws * 100.0 + seed, mix(p1, p2, 0.3), anim);
        result = glazeOver(result, aw.rgb, aw.a * 0.7);
    }

    // ─── Background splotches (Marangoni backruns) ───
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float s = hash1f(fi * 31.7 + seed);
        vec2 ctr = vec2(hash1f(fi * 13.3 + seed) * aspect, hash1f(fi * 23.1 + seed));
        float sz = 0.12 + hash1f(fi * 41.3 + seed) * 0.3;

        vec3 p1, p2;
        getPigmentPair(int(mod(fi, 8.0)), seed + fi * 0.1, p1, p2);
        vec3 col = mix(p1, p2, hash1f(fi * 67.3 + seed));

        vec4 sp = computeSplotch(uvA, ctr, sz, col * 0.85, s * 100.0);
        result = glazeOver(result, sp.rgb, sp.a * 0.55);
    }

    // ─── Flower washes (main focal elements) ───
    // Determine flower count from seed (6 to 8)
    int nFlowers = 6 + int(floor(hash1f(seed * 9.7) * 3.0));

    for (int i = 0; i < 8; i++) {
        if (i >= nFlowers) break;

        float fi = float(i);
        float s = hash1f(fi * 17.3 + seed);

        // Position with clustering tendency (not uniform)
        float clusterX = hash1f(seed * 5.1) * aspect * 0.5 + aspect * 0.25;
        float clusterY = hash1f(seed * 8.3) * 0.4 + 0.3;
        vec2 ctr = vec2(
            clusterX + (hash1f(fi * 7.1 + seed) - 0.5) * aspect * 0.6,
            clusterY + (hash1f(fi * 11.3 + seed) - 0.5) * 0.6
        );
        // Clamp to keep flowers mostly in view
        ctr = clamp(ctr, vec2(0.05, 0.05), vec2(aspect - 0.05, 0.95));

        // Variable sizing — some large focal, some small accent
        float sz;
        if (fi < 2.0) {
            sz = 0.14 + hash1f(fi * 29.7 + seed) * 0.10; // Larger focal flowers
        } else if (fi < 5.0) {
            sz = 0.08 + hash1f(fi * 29.7 + seed) * 0.08; // Medium
        } else {
            sz = 0.05 + hash1f(fi * 29.7 + seed) * 0.06; // Small accent
        }

        float np = 4.0 + floor(hash1f(fi * 37.1 + seed) * 4.0);

        vec3 p1, p2;
        int palIdx = int(mod(fi + floor(hash1f(seed * 4.7) * 3.0), 8.0));
        getPigmentPair(palIdx, seed + fi, p1, p2);

        // Opacity: front flowers more opaque, back ones softer
        float op = 0.20 + fi * 0.06 + hash1f(fi * 61.3 + seed) * 0.1;
        // Wetness: more dramatic bleeding
        float wet = 0.12 + hash1f(fi * 43.1 + seed) * 0.10;

        vec4 wash = computeWash(uvA, ctr, sz, np, s * 100.0, p1, p2, op, wet, anim);
        result = glazeOver(result, wash.rgb, wash.a);
    }

    // ─── Curved stems ───
    int nStems = 2 + int(floor(hash1f(seed * 13.9) * 3.0));
    for (int i = 0; i < 4; i++) {
        if (i >= nStems) break;

        float fi = float(i);
        float s = hash1f(fi * 71.3 + seed);

        vec2 start = vec2(
            0.2 + s * (aspect - 0.4),
            0.05 + hash1f(fi * 79.1 + seed) * 0.15
        );
        vec2 end = start + vec2(
            (hash1f(fi * 83.3 + seed) - 0.5) * 0.3,
            0.3 + hash1f(fi * 89.1 + seed) * 0.4
        );
        vec2 ctrl = mix(start, end, 0.5) + vec2(
            (hash1f(fi * 91.7 + seed) - 0.5) * 0.18,
            (hash1f(fi * 97.3 + seed) - 0.5) * 0.12
        );

        float stemAlpha = curvedStem(uvA, start, end, ctrl, 0.0025, s * 100.0) * 0.8;

        // Animate stem sway slightly
        if (anim > 0.0) {
            stemAlpha *= 0.95 + 0.05 * sin(anim * 0.2 + fi * 2.0);
        }

        result = mix(result, ink, stemAlpha);

        // Branch off the stem
        float bt = 0.35 + s * 0.35;
        vec2 bp = mix(mix(start, ctrl, bt), mix(ctrl, end, bt), bt);
        vec2 be = bp + vec2(
            (hash1f(fi * 103.1 + seed) - 0.5) * 0.14,
            0.04 + hash1f(fi * 107.3 + seed) * 0.08
        );
        vec2 bc = mix(bp, be, 0.5) + vec2(
            (hash1f(fi * 109.7 + seed) - 0.5) * 0.07,
            0.02
        );
        result = mix(result, ink, curvedStem(uvA, bp, be, bc, 0.0018, s * 200.0) * 0.6);
    }

    // ─── Flower center marks (clustered stamens) ───
    for (int i = 0; i < 8; i++) {
        if (i >= nFlowers) break;

        float fi = float(i);
        float clusterX = hash1f(seed * 5.1) * aspect * 0.5 + aspect * 0.25;
        float clusterY = hash1f(seed * 8.3) * 0.4 + 0.3;
        vec2 ctr = vec2(
            clusterX + (hash1f(fi * 7.1 + seed) - 0.5) * aspect * 0.6,
            clusterY + (hash1f(fi * 11.3 + seed) - 0.5) * 0.6
        );
        ctr = clamp(ctr, vec2(0.05, 0.05), vec2(aspect - 0.05, 0.95));

        // Only larger flowers get visible center marks
        float sz = fi < 2.0 ? 0.014 : (fi < 5.0 ? 0.010 : 0.006);

        for (int j = 0; j < 3; j++) {
            float fj = float(j);
            vec2 offset = vec2(
                hash1f(fi * 113.0 + fj * 17.0 + seed) - 0.5,
                hash1f(fi * 119.0 + fj * 23.0 + seed) - 0.5
            ) * sz;
            float ds = sz * (0.3 + hash1f(fi * 97.1 + fj * 29.0 + seed) * 0.4);
            float d = sdCircle(uvA - ctr - offset, ds);
            d += fbm3((uvA - ctr) * 60.0 + fi + fj) * ds * 1.0;
            float dt = smoothstep(ds * 0.5, -ds * 0.3, d);
            result = mix(result, ink * (0.7 + 0.3 * noise(uvA * 30.0 + fi)), dt * 0.85);
        }
    }

    // ─── Final paper texture overlay ───
    float finalPaper = paperTex(uv * 1.05 + 0.3);
    float painted = 1.0 - clamp(length(result - PAPER) * 4.0, 0.0, 1.0);
    result += vec3(finalPaper * 0.015) * painted;

    // ─── Subtle warm vignette ───
    vec2 vc = uv - 0.5;
    result *= 1.0 - dot(vc, vc) * 0.2;

    fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
