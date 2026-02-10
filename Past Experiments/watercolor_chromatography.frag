// ============================================================
// Watercolor Chromatography Shader v2
// ============================================================
// A single-pass fragment shader simulating watercolor painting
// with chromatographic pigment separation.
//
// KEY CHANGES from v1:
//   - Flowers built from clusters of warped ellipse-blobs
//     merged with smooth-min (not rigid rose curves)
//   - Heavy domain warping on all boundaries
//   - Curved bezier stems with pressure variation
//   - Stronger chromatographic pigment separation
//   - Subtractive glaze compositing (Bousseau model)
//   - Organic opacity variation via warp intermediates
//
// Uniforms: iResolution (vec3), iTime (float)
// Compatible: Shadertoy, glslViewer, glsl-canvas, Bonzomatic
// ============================================================

#ifdef GL_ES
precision highp float;
#endif

uniform vec3  iResolution;
uniform float iTime;

// ─── PAPER COLOR ───
#define PAPER vec3(0.988, 0.973, 0.941)

// ─── HASH ───
float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1f(float p) { return fract(sin(p * 127.1) * 43758.5453); }
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

// ─── NOISE ───
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash1(i), b = hash1(i + vec2(1, 0));
    float c = hash1(i + vec2(0, 1)), d = hash1(i + vec2(1, 1));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = ROT * p * 2.0; a *= 0.5; }
    return s;
}

float fbm3(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * noise(p); p = ROT * p * 2.0; a *= 0.5; }
    return s;
}

float turbulence(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * abs(noise(p) * 2.0 - 1.0); p = ROT * p * 2.0; a *= 0.5; }
    return s;
}

// ─── DOMAIN WARP (Quilez two-level) ───
float domainWarp(vec2 p, out vec2 q, out vec2 r) {
    q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
    r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)),
             fbm(p + 4.0 * q + vec2(8.3, 2.8)));
    return fbm(p + 4.0 * r);
}

// ─── SDF TOOLS ───
float sdCircle(vec2 p, float r) { return length(p) - r; }

// Fast ellipse SDF approximation
float sdEllipseApprox(vec2 p, vec2 r) {
    float k = length(p / r);
    return (k - 1.0) * min(r.x, r.y) / max(k, 0.001);
}

// Smooth minimum — merges shapes like wet paint pooling together
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── PAPER TEXTURE ───
float paperTex(vec2 uv) {
    return fbm3(uv * 50.0) * 0.6 + noise(uv * 150.0) * 0.25 + turbulence(uv * 90.0) * 0.15;
}

float worley(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float md = 1.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 nb = vec2(float(x), float(y));
        vec2 pt = hash2(i + nb) * 0.5 + 0.5;
        md = min(md, length(nb + pt - f));
    }
    return md;
}

// ─── ORGANIC FLOWER (blob-cluster, not rose curve) ───
// Each petal is a separate elongated ellipse, randomly placed
// around center, merged with smin. Produces the loose gestural
// look of real watercolor florals.
float flowerSDF(vec2 p, float size, float seed, float nPetals) {
    float d = 1e5;

    for (float i = 0.0; i < 8.0; i++) {
        if (i >= nPetals) break;

        // Unique angle with irregularity
        float baseAngle = i / nPetals * 6.2832;
        float angleJitter = (hash1f(seed + i * 13.7) - 0.5) * 0.8;
        float angle = baseAngle + angleJitter;

        // Petal center offset (variable reach)
        float reach = size * (0.35 + 0.3 * hash1f(seed + i * 7.3));
        vec2 petalCenter = vec2(cos(angle), sin(angle)) * reach;

        // Petal dimensions — elongated, variable
        float petalLen = size * (0.3 + 0.25 * hash1f(seed + i * 23.1));
        float petalWidth = petalLen * (0.3 + 0.35 * hash1f(seed + i * 31.7));

        // Rotate petal to point roughly outward (with jitter)
        float petalAngle = angle + (hash1f(seed + i * 41.3) - 0.5) * 0.6;
        float ca = cos(petalAngle), sa = sin(petalAngle);
        mat2 rot = mat2(ca, sa, -sa, ca);

        vec2 lp = rot * (p - petalCenter);
        float pd = sdEllipseApprox(lp, vec2(petalLen, petalWidth));

        // Heavy domain warp on each petal boundary
        pd += fbm((p + petalCenter) * 8.0 / size + seed + i * 5.0) * size * 0.08;

        // Smooth-min merge (wet paint pooling)
        float k = size * (0.04 + 0.03 * hash1f(seed + i * 51.3));
        d = smin(d, pd, k);
    }

    return d;
}

// ─── CHROMATOGRAPHIC SEPARATION ───
vec3 chromatography(vec2 uv, vec3 pig1, vec3 pig2, float amount, float seed) {
    vec2 flow = vec2(fbm(uv * 3.0 + seed), fbm(uv * 3.0 + vec2(7.1, 3.3) + seed));
    float heavy = fbm(uv * 4.0 + seed * 0.7);
    float light = fbm((uv + flow * amount) * 2.5 + seed * 1.3);
    float separation = smoothstep(0.25, 0.75, light - heavy * 0.4);
    return mix(pig1, pig2, separation);
}

// ─── SUBTRACTIVE GLAZE COMPOSITING ───
vec3 glazeOver(vec3 under, vec3 pigment, float alpha) {
    vec3 transmittance = mix(vec3(1.0), pigment, alpha);
    return under * transmittance;
}

// ─── WASH LAYER ───
vec4 computeWash(vec2 uv, vec2 center, float size, float nPetals, float seed,
                  vec3 pig1, vec3 pig2, float opacity, float wetness) {
    vec2 local = uv - center;

    // Organic flower shape
    float dist = flowerSDF(local, size, seed, nPetals);

    // Large-scale boundary warp
    vec2 q, r;
    float warpVal = domainWarp(local * 2.5 / size + seed * 0.3, q, r);
    dist += (warpVal - 0.5) * size * 0.15;

    // Finer boundary noise
    dist -= fbm(uv * 12.0 + seed) * size * 0.06;

    // Dual-zone: saturated interior + bleeding halo
    float bleedDist = size * wetness;
    float innerEdge = smoothstep(0.0, -size * 0.04, dist);
    float outerBleed = smoothstep(bleedDist, 0.0, dist);

    // Coffee-ring edge darkening
    float edgeWidth = size * 0.025 * (1.0 + fbm(uv * 15.0 + seed * 2.0) * 0.8);
    float edgeDark = smoothstep(edgeWidth, 0.0, abs(dist)) * 0.6;

    // Chromatographic color
    float chromaAmt = 0.04 + 0.05 * hash1f(seed * 3.7);
    vec3 pigColor = chromatography(uv, pig1, pig2, chromaAmt, seed);

    // Opacity variation
    float densityVar = 0.6 + 0.4 * fbm(uv * 6.0 + seed * 1.1);
    float centerFade = smoothstep(size * 1.2, size * 0.1, length(local));

    // Paper granulation
    float gran = hash1f(seed * 5.3) * 0.7;
    float paper = paperTex(uv);
    float granMod = mix(1.0, 1.0 - paper * 0.5, gran);

    // Combine
    float alpha = outerBleed * 0.15 + innerEdge * 0.65;
    alpha *= opacity * densityVar * centerFade * granMod;
    alpha += edgeDark * opacity * 0.5;
    alpha = clamp(alpha, 0.0, 1.0);

    pigColor = mix(pigColor, pigColor * 0.4, edgeDark);
    pigColor = mix(pigColor, pig2, length(q) * 0.15);

    return vec4(pigColor, alpha);
}

// ─── SPLOTCH (Marangoni backrun) ───
vec4 computeSplotch(vec2 uv, vec2 center, float size, vec3 color, float seed) {
    vec2 local = uv - center;
    float dist = sdCircle(local, size);

    vec2 q, r;
    float w = domainWarp(local * 3.0 / size + seed, q, r);
    dist += w * size * 0.3;
    dist -= fbm(uv * 8.0 + seed * 3.0) * size * 0.15;

    float fill = smoothstep(size * 0.02, -size * 0.03, dist) * 0.08;
    float bloom = smoothstep(size * 0.2, 0.0, dist) * 0.06;
    float scallop = smoothstep(size * 0.015, 0.0, abs(dist)) * 0.25;

    float alpha = fill + bloom + scallop;
    alpha *= (0.6 + 0.4 * turbulence(uv * 6.0 + seed));

    vec3 sc = mix(color, color * 0.5, length(q) * 0.6);
    sc = mix(sc, color * 1.3, r.y * 0.25);
    return vec4(clamp(sc, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}

// ─── CURVED STEM (quadratic bezier) ───
float sdBezier(vec2 p, vec2 a, vec2 b, vec2 c) {
    float d = 1e5;
    for (float i = 0.0; i <= 1.0; i += 0.04) {
        vec2 q = mix(mix(a, b, i), mix(b, c, i), i);
        d = min(d, length(p - q));
    }
    return d;
}

float curvedStem(vec2 uv, vec2 start, vec2 end, vec2 ctrl, float width, float seed) {
    float d = sdBezier(uv, start, ctrl, end);
    d += fbm(uv * 40.0 + seed) * width * 0.6;

    float t = clamp(dot(uv - start, end - start) / dot(end - start, end - start), 0.0, 1.0);
    float taper = smoothstep(0.0, 0.08, t) * mix(1.0, 0.4, t);
    float w = width * taper * (0.7 + 0.3 * noise(vec2(t * 8.0, seed)));

    return smoothstep(w, w * 0.15, d);
}

// ─── MAIN COMPOSITION ───
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float aspect = iResolution.x / iResolution.y;
    vec2 uvA = vec2(uv.x * aspect, uv.y);

    float t = iTime * 0.025;
    float epoch = floor(t * 0.4);
    float es = hash1f(epoch * 7.13);

    // Paper base
    float paper = paperTex(uv);
    float pw = worley(uv * 70.0);
    vec3 result = PAPER - vec3(paper * 0.025 + pw * 0.012);
    result += vec3(0.004, 0.001, -0.002) * fbm(uv * 4.0);

    // Palette
    vec3 pink   = vec3(0.88, 0.30, 0.40) + 0.08 * sin(vec3(es, es*2.1, es*3.7));
    vec3 coral  = vec3(0.94, 0.52, 0.30) + 0.06 * sin(vec3(es*1.3, es*0.7, es*2.9));
    vec3 mauve  = vec3(0.58, 0.28, 0.50) + 0.08 * sin(vec3(es*2.3, es*1.1, es*0.5));
    vec3 sage   = vec3(0.28, 0.50, 0.34) + 0.05 * sin(vec3(es*0.9, es*3.1, es*1.7));
    vec3 gold   = vec3(0.92, 0.74, 0.28) + 0.04 * sin(vec3(es*1.7, es*0.3, es*2.1));
    vec3 blush  = vec3(0.90, 0.60, 0.55) + 0.04 * sin(vec3(es*0.5, es*1.9, es*3.1));
    vec3 ink    = vec3(0.10, 0.07, 0.05);

    // Background splotches
    for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float s = hash1f(fi * 31.7 + epoch);
        vec2 ctr = vec2(hash1f(fi*13.3 + epoch) * aspect, hash1f(fi*23.1 + epoch));
        float sz = 0.15 + hash1f(fi*41.3 + epoch) * 0.25;
        vec3 col = (fi<1.0) ? blush : (fi<2.0) ? coral : (fi<3.0) ? mauve : (fi<4.0) ? sage : gold;
        vec4 sp = computeSplotch(uvA, ctr, sz, col * 0.9, s * 100.0);
        result = glazeOver(result, sp.rgb, sp.a * 0.6);
    }

    // Flower washes
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float s = hash1f(fi * 17.3 + epoch);
        vec2 ctr = vec2(
            0.15 + hash1f(fi*7.1 + epoch) * (aspect - 0.3),
            0.15 + hash1f(fi*11.3 + epoch) * 0.7
        );
        float sz = 0.10 + hash1f(fi*29.7 + epoch) * 0.14;
        float np = 4.0 + floor(hash1f(fi*37.1 + epoch) * 4.0);

        vec3 p1, p2;
        if      (fi < 1.0) { p1 = pink;  p2 = mauve; }
        else if (fi < 2.0) { p1 = coral; p2 = gold;  }
        else if (fi < 3.0) { p1 = mauve; p2 = pink;  }
        else if (fi < 4.0) { p1 = sage;  p2 = vec3(0.48, 0.58, 0.18); }
        else                { p1 = blush; p2 = coral; }

        float op = 0.25 + fi * 0.08;
        float wet = 0.10 + hash1f(fi*43.1 + epoch) * 0.08;

        vec4 wash = computeWash(uvA, ctr, sz, np, s*100.0, p1, p2, op, wet);
        result = glazeOver(result, wash.rgb, wash.a);
    }

    // Curved stems
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float s = hash1f(fi * 71.3 + epoch);
        vec2 start = vec2(0.25 + s*(aspect-0.5), 0.05 + hash1f(fi*79.1+epoch)*0.15);
        vec2 end = start + vec2((hash1f(fi*83.3+epoch)-0.5)*0.25, 0.35+hash1f(fi*89.1+epoch)*0.35);
        vec2 ctrl = mix(start, end, 0.5) + vec2((hash1f(fi*91.7+epoch)-0.5)*0.15, (hash1f(fi*97.3+epoch)-0.5)*0.1);

        result = mix(result, ink, curvedStem(uvA, start, end, ctrl, 0.0025, s*100.0) * 0.8);

        float bt = 0.4 + s * 0.3;
        vec2 bp = mix(mix(start, ctrl, bt), mix(ctrl, end, bt), bt);
        vec2 be = bp + vec2((hash1f(fi*103.1+epoch)-0.5)*0.12, 0.04+hash1f(fi*107.3+epoch)*0.06);
        vec2 bc = mix(bp, be, 0.5) + vec2((hash1f(fi*109.7+epoch)-0.5)*0.06, 0.02);
        result = mix(result, ink, curvedStem(uvA, bp, be, bc, 0.0018, s*200.0) * 0.65);
    }

    // Flower center marks (clustered dots)
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        vec2 ctr = vec2(
            0.15 + hash1f(fi*7.1 + epoch) * (aspect - 0.3),
            0.15 + hash1f(fi*11.3 + epoch) * 0.7
        );
        for (float j = 0.0; j < 3.0; j++) {
            vec2 offset = vec2(
                hash1f(fi*113.0 + j*17.0 + epoch) - 0.5,
                hash1f(fi*119.0 + j*23.0 + epoch) - 0.5
            ) * 0.012;
            float ds = 0.004 + hash1f(fi*97.1 + j*29.0) * 0.004;
            float d = sdCircle(uvA - ctr - offset, ds);
            d += fbm((uvA - ctr) * 60.0 + fi + j) * ds * 1.0;
            float dt = smoothstep(ds * 0.5, -ds * 0.3, d);
            result = mix(result, ink * (0.7 + 0.3 * noise(uvA * 30.0 + fi)), dt * 0.85);
        }
    }

    // Final paper texture overlay
    float finalPaper = paperTex(uv * 1.05 + 0.3);
    float painted = 1.0 - clamp(length(result - PAPER) * 4.0, 0.0, 1.0);
    result += vec3(finalPaper * 0.015) * painted;

    // Subtle warm vignette
    vec2 vc = uv - 0.5;
    result *= 1.0 - dot(vc, vc) * 0.25;

    fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}

// Compatibility shim
void main() {
    vec4 c;
    mainImage(c, gl_FragCoord.xy);
    gl_FragColor = c;
}
