# Chromatography Watercolor Shader — Project Learnings

## Project Goal
Create a GLSL fragment shader for a Flutter/Dart mobile app that generates unique, personalized watercolor/chromatography artwork for each user. The shader should produce beautiful images that match the aesthetic from the [Pinterest reference board](https://www.pinterest.com/hulinandrew/ash-chromatography/).

## Target Aesthetic
- **Palette**: Vibrant hot pinks, magentas, deep corals, golds, olive greens, rich purples, blues, warm browns
- **Style**: Loose gestural watercolor florals (anemones, abstract flowers)
- **Effects**: Heavy wet-on-wet bleeding, chromatographic pigment separation, coffee-ring edge darkening
- **Paper**: Abundant white/cream paper showing through, realistic paper grain texture
- **Composition**: Mix of tight floral clusters and loose abstract color washes

## Technical Approach
- **Single-pass fragment shader** — all rendering in one `.frag` file
- **Seed-based personalization** — `uSeed` uniform drives all composition randomness (user ID hashed to seed)
- **Dual-mode rendering** — `uTime = 0.0` for static export, `uTime > 0.0` for subtle animation
- **Mobile-optimized** — FBM capped at 3 octaves, minimal loop iterations, `mediump` precision where safe

## Key Techniques
1. **Noise-based SDF flowers**: Blob-cluster petals (elongated ellipses) merged with smooth-min for organic shapes
2. **Quilez domain warping**: Two-level FBM warping for natural boundary distortion
3. **Chromatographic separation**: Dual-pigment splitting via noise-offset sampling (lighter pigment travels further)
4. **Subtractive glaze compositing**: Bousseau-model light transmission for realistic watercolor layering
5. **Coffee-ring edge darkening**: Pigment accumulation at drying boundaries
6. **Marangoni backrun splotches**: Domain-warped circles for wet-on-wet bloom effects
7. **Paper texture**: FBM + Worley noise simulating cold-press watercolor paper

## Files
- `chromatography_watercolor.frag` — Flutter-compatible shader (main deliverable)
- `preview_viewer.html` — WebGL preview for browser testing
- `Past Experiments/watercolor_chromatography.frag` — Original v2 Shadertoy shader (reference)
- `Research/chromatography research.md` — Comprehensive research document

## Flutter Integration
```dart
// Load the shader
final program = await FragmentProgram.fromAsset('shaders/chromatography_watercolor.frag');
final shader = program.fragmentShader();

// Set uniforms
shader.setFloat(0, size.width);   // uResolution.x
shader.setFloat(1, size.height);  // uResolution.y
shader.setFloat(2, time);         // uTime (0.0 for static)
shader.setFloat(3, userSeed);     // uSeed (unique per user)

// Paint
canvas.drawRect(rect, Paint()..shader = shader);
```

## Uniform Reference
| Index | Name | Type | Description |
|-------|------|------|-------------|
| 0-1 | uResolution | vec2 | Canvas width and height in pixels |
| 2 | uTime | float | Animation time (0.0 for static image) |
| 3 | uSeed | float | Composition seed (0.0–1000.0 range recommended) |

## Implementation Details

### Shader Architecture (chromatography_watercolor.frag)
The shader renders in a single pass with the following layer order:
1. **Paper base** — cream-colored with FBM + Worley grain texture
2. **Abstract background washes** (x3) — large transparent color bands for depth
3. **Marangoni splotches** (x8) — domain-warped bloom effects
4. **Flower washes** (6–8, seed-dependent) — the main focal elements with blob-cluster SDF petals
5. **Curved stems** (2–4) — quadratic Bezier stems with branches
6. **Flower center marks** — clustered ink dots for stamens
7. **Final paper texture overlay** — granulation on unpainted areas
8. **Warm vignette** — subtle edge darkening

### Color Palette
10 colors designed to match the Pinterest reference aesthetic:
- **Hot Pink** `(0.95, 0.18, 0.55)` — dominant color
- **Magenta** `(0.88, 0.12, 0.45)` — chromatographic partner to pink
- **Coral** `(0.96, 0.40, 0.28)` — warm accent
- **Purple** `(0.55, 0.15, 0.60)` — cool depth
- **Olive** `(0.35, 0.52, 0.22)` — foliage
- **Gold** `(0.94, 0.72, 0.20)` — warm highlight
- **Blue** `(0.15, 0.25, 0.60)` — cool accent
- **Blush** `(0.92, 0.55, 0.50)` — soft warm
- **Brown** `(0.55, 0.30, 0.18)` — earthy accent
- **Deep Red** `(0.75, 0.10, 0.20)` — rich accent

Colors are paired for chromatographic separation (e.g., hot pink splits into magenta at edges).

### Seed-Based Personalization
Every compositional decision derives from `uSeed`:
- Flower count, position, size, petal count
- Color pair selection per flower
- Stem count and curvature
- Background splotch placement
- Abstract wash angles and widths
- Same seed always produces the same composition

### Animation
When `uTime > 0.0`:
- Flower boundaries gently undulate (breathing effect)
- Abstract washes slowly drift
- Stems subtly sway
- No structural changes — same composition, living edges

### Mobile Performance Notes
- All FBM limited to **3 octaves** (vs. 5 in original)
- Bezier stem sampling at **0.05 step** (21 samples vs. 25)
- Max **8 flower washes**, **8 splotches**, **4 stems** — bounded loops
- No texture sampling — all procedural
- Estimated ~60fps on mid-range mobile GPUs at 1080p

### Browser Preview
Open `preview_viewer.html` in any browser to test:
- **New Seed** button generates a new composition
- **Pause/Play** toggles animation
- Seed value displayed in bottom bar
- Same shader logic as the Flutter version (adapted for WebGL)

### Key Differences from Original v2 Shader
1. **Flutter format** — uses `#include <flutter/runtime_effect.glsl>`, `FlutterFragCoord()`, `out vec4 fragColor`
2. **Vibrant palette** — much more saturated (hot pink/magenta dominant vs softer pink)
3. **Seed-driven** — `uSeed` replaces time-based `epoch` for deterministic composition
4. **More flowers** — 6–8 vs. 5, with variable sizing (focal, medium, accent)
5. **Abstract washes** — new layer type for color-study backgrounds
6. **Stronger chromatography** — `chromaAmt` range increased (0.06–0.14 vs 0.04–0.09)
7. **More splotches** — 8 vs. 6 for denser background depth
8. **Flower clustering** — flowers tend to group around a seed-determined center point
