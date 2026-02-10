# Realistic watercolor and chromatography effects in GLSL

**A watercolor shader must simulate five interacting physical systems: fluid flow across textured paper, pigment transport and deposition, edge darkening from evaporation-driven capillary currents, chromatographic pigment separation, and subtractive optical compositing through transparent layers over a white surface.** The good news: decades of academic research, starting with Curtis et al.'s landmark 1997 SIGGRAPH paper, have reduced these systems to tractable mathematical models. The even better news: modern fragment shaders can approximate most of these effects convincingly using noise-based techniques—FBM, domain warping, SDFs, and Kubelka-Munk compositing—without running a full fluid simulation. This report synthesizes the physics, the target aesthetic, the academic literature, and the concrete GLSL techniques needed to build a chromatography-style watercolor shader.

---

## The physics of pigment, water, and paper

Watercolor is fundamentally a particle transport system. Pigment particles (**0.05–0.5 μm** grain size) are suspended in water with gum arabic binder, carried across a porous cellulose matrix by capillary action, and deposited when water evaporates or is absorbed. The paper's sizing—typically gelatin—controls absorption rate. Without it, paint soaks in instantly and diffuses uncontrollably. With it, water remains as a thin surface film long enough for the artist to manipulate flow.

**Capillary flow** follows Washburn's equation: penetration distance scales with √(γ·r·t / 2η), where γ is surface tension, r is pore radius, t is time, and η is viscosity. For shader purposes, this means water spread is proportional to the square root of time—fast at first, then decelerating. The paper's height field (its texture) creates local variations in fluid capacity. Cold-press paper has deep valleys that hold more water and trap more pigment; hot-press is smoother with less texture interaction.

**Edge darkening** is the single most recognizable visual signature of watercolor, and it arises from the **coffee ring effect** first rigorously described by Deegan et al. (1997). When a wash begins drying, the contact line at the boundary is pinned by adhesion to the paper. Evaporation is fastest at the thin edges, so capillary flow compensates by pulling water—and suspended pigment—outward from the center to the boundary. This creates a sustained outward current that concentrates pigment at the stroke's perimeter. The effect accelerates dramatically in the final drying stage as the remaining water film becomes extremely thin, producing a last-minute "rush hour" of pigment to the edges. For a shader, this means **opacity should be highest near shape boundaries and lower in the interior**, with noise modulating the boundary position.

**Wet-on-wet diffusion** operates through two mechanisms: advection (bulk flow driven by pressure differentials when wet paint meets wet paper) and Brownian diffusion (random pigment particle movement governed by Fick's laws). The balance is characterized by the Péclet number (Pe = vL/D). In pooled, still water, diffusion dominates and colors blend with soft gradients. In actively flowing water, advection dominates and pigment follows visible flow lines. The degree of paper wetness is the primary control: very wet paper produces wide, soft, unpredictable blending; damp paper produces narrower, more controlled diffusion; nearly dry paper triggers **blooms** (backruns)—the Marangoni effect creates surface tension gradients that push pigment into fractal, cauliflower-like patterns with hard scalloped edges.

**Pigment granulation** results from two distinct phenomena. True granulation is **sedimentation**—heavy particles settling under gravity into paper valleys, governed by Stokes' law: settling velocity scales with particle radius squared times the density differential between pigment and water. Inorganic pigments like cobalts (specific gravity ~4.0) and cadmiums (~4.7) granulate dramatically; organic pigments like phthalocyanines (~1.6) stay uniformly suspended. **Flocculation** is the second mechanism: pigment particles attract each other through van der Waals forces and clump into visible aggregates, as with French Ultramarine. Both effects create the characteristic mottled, speckled texture where pigment clusters in paper valleys and thins on peaks.

**Chromatographic separation** is the effect that ties this aesthetic together. Watercolor paper acts as a chromatography medium: different pigments in a mixture travel at different rates through the wet cellulose. Smaller, lighter, more water-soluble pigment particles (staining pigments like Quinacridone Rose, Phthalo Blue) travel further with the water front, while heavier sedimentary pigments (Cerulean Blue, Raw Umber) lag behind. This produces visible **color splitting along the flow direction**—a green mixed from blue and yellow may show the yellow running ahead of the blue. Convenience mixes and earth pigments (natural mixtures of iron and manganese oxides) show this most dramatically.

**Transparency and glazing** give watercolor its luminosity. Light passes through the thin pigment layer, bounces off the white paper, and returns through the pigment—a double-pass that makes the paper glow from within. Layering transparent glazes creates subtractive color mixing: each layer independently filters wavelengths, and the product of all transmittances determines the final color. The **Kubelka-Munk model** formalizes this with absorption coefficient K and scattering coefficient S per wavelength per pigment. Transparent pigments (Quinacridone Rose: K high, S ≈ 0) produce clean, vibrant glazes; opaque pigments (Cadmium Red: both K and S high) produce chalky overlays. Curtis et al. published reference K, S, density, staining power, and granularity values for common watercolor pigments.

---

## What the chromatography floral aesthetic looks like

The target aesthetic—exemplified by artists like Helen Dealtry and Melissa Conde and curated on boards like Andrew Hulin's "Ash (Chromatography)"—has mathematically describable characteristics that a shader must reproduce.

**Loose gestural florals** dominate the composition. Petal forms are suggested by broad, single-stroke gestures rather than outlined precisely. Each stroke carries opacity variation from loaded (saturated center) to dry (fading edge). The shapes are fundamentally organic: irregular ellipses and blob forms, not geometric. A shader should generate petal shapes using **polar coordinates with noise-perturbed radius functions**, where `r(θ) = baseRadius + amplitude * fbm(θ * frequency + seed)`.

**Wet-on-wet bleeding** creates the signature look: pink, orange, green, and dark burgundy pigments flow into each other with soft, undefined edges. The transition zone between colors is typically **5–15% of the shape radius** on very wet paper, narrowing to 1–3% on damp paper. Colors don't fully homogenize—both original hues remain visible with a mixed zone between them. The falloff from saturated center to diffuse edge should follow a noise-modulated Gaussian-like profile, not a clean gradient.

**Negative space** is compositional bedrock. Typically **30–60% of the total area** is unpainted white paper (not pure white but slightly warm cream, approximately RGB 252, 248, 240). Flowers are often partially rendered—one side defined by paint, the other dissolving into white. White areas define form by their absence. The boundary between painted and unpainted must feel organic, never masked.

**Layering and transparency** create depth. Most compositions use **2–4 transparent layers** with increasing opacity: first wash at α ≈ 0.08–0.15, second at 0.15–0.30, detail layers at 0.30–0.50, and dark accents at 0.60–1.0. Where layers overlap, colors mix subtractively—pink over green yields muted warm gray-brown. Each layer contributes edge darkening independently, creating cumulative luminous depth.

**Dark ink accents** provide the crucial contrast. Stems are thin, confident, single-stroke lines (1–3px) with near-full opacity and very hard edges—the opposite of the surrounding washes. Flower centers are dense dark marks. These are typically the darkest values in the composition: warm near-black (RGB ~30, 20, 15) or cool blue-black (RGB ~20, 25, 35), never pure black. They're applied wet-on-dry for crisp definition.

**Chromatographic color separation** manifests within single washes as visible constituent pigments: a dark purple wash reveals blue zones and red zones as it dries; mixed greens show yellow and blue components separating. Sedimentary pigments concentrate in paper texture valleys while staining pigments spread uniformly, creating a "three-color effect" where the mix color coexists with glimpses of each component. For a shader, this requires decomposing each mixed color into **two virtual sub-pigments with different mobility values**—the staining component gets a larger diffusion radius, the sedimentary component concentrates in high-frequency noise valleys.

---

## Academic foundations for watercolor simulation

### Curtis et al.'s three-layer model remains the gold standard

The 1997 SIGGRAPH paper "Computer-Generated Watercolor" by Curtis, Anderson, Seims, Fleischer, and Salesin established a **three-layer physical simulation** that captures all major watercolor phenomena. The shallow-water layer models the thin surface film using simplified 2D Navier-Stokes equations, tracking velocity (u, v), pressure (p), and a wet-area mask (M). The pigment-deposition layer tracks per-pigment concentration in water (gₖ) and deposited on paper (dₖ), with adsorption governed by `δ_down = gₖ(1 − h·γₖ)·ρₖ` (pigment settles into valleys proportional to density × granularity) and desorption resisted by staining power ω. The capillary layer models paper absorption at rate α, with wet-mask expansion when saturation exceeds threshold σ, producing realistic backrun patterns through irregular capacity variation.

Edge darkening emerges naturally from the fluid dynamics: the formula `p = p − η(1 − M')M` removes water pressure preferentially near boundaries (M' is the Gaussian-blurred wet-area mask), creating the outward capillary flow that transports pigment to edges. Optical compositing uses **Kubelka-Munk theory** with per-pigment K and S coefficients to layer translucent glazes over white paper.

This model is too expensive for a single-pass shader but provides the physical understanding needed to create convincing approximations.

### Luft and Deussen's image-space approach enables real-time rendering

Luft and Deussen (University of Konstanz, 2005) departed from physical simulation entirely, using **image-space processing with hardware shaders**. Their pipeline assigns unique IDs to objects, Gaussian-blurs the ID images for shape smoothing, and uses `smoothstep(κ_ρ - κ_δ, κ_ρ + κ_δ, ρ)` for edge softness control—small κ_δ gives hard wet-on-dry edges, large κ_δ gives feathery wet-on-wet blending. Edge darkening comes from modulating alpha with the blurred ID gradient: `λ_a = λ_a · ρ · κ_ω`. Paper texture modulates both alpha and boundary shape. This runs at **26–134 FPS** at 720×720 on contemporary hardware and maps directly to fragment shader passes.

### Bousseau et al.'s density model is the most shader-friendly

Bousseau, Kaplan, Thollot, and Sillion (INRIA, NPAR 2006) introduced an elegant **empirical pigment density model** that avoids Kubelka-Munk entirely: `C' = C − (C − C²)(d − 1)`, where d is pigment density. At d=1 the color is unchanged; d=2 gives the equivalent of two transparent layers (C squared); d<1 lightens. Three grayscale images modulate density: turbulent flow (low-frequency Perlin noise), pigment dispersion (high-frequency Gaussian noise), and paper grain (scanned texture). Edge darkening uses the image gradient magnitude via a symmetric kernel: `Δ = |p_{x-1} − p_{x+1}| + |p_{y-1} − p_{y+1}|`. A wobbling effect distorts coordinates using paper texture gradients as displacement. **The entire effects pipeline can run in a single fragment shader pass.**

### Kubelka-Munk pigment mixing has practical real-time implementations

The KM model characterizes pigments by absorption (K) and scattering (S) coefficients. The remission function `K/S = (1−R)² / (2R)` relates these to reflectance. For real-time use, the simplified approach (assuming S=1) converts RGB to absorption space, mixes linearly, and converts back:

```glsl
vec3 rgb_to_k(vec3 rgb) {
    return pow(1.0 - rgb, vec3(2.0)) / (2.0 * max(rgb, 0.001));
}
vec3 k_to_rgb(vec3 k) {
    return 1.0 + k - sqrt(k * (k + 2.0));
}
```

**Mixbox** (shipped in Rebelle 5 Pro and Blender's FLIP Fluids) is the most practical solution: it uses a 256×256 LUT texture to convert between RGB and a CMYW pigment latent space, performs KM mixing, and returns RGB. It correctly produces green from blue + yellow. Spectral.js takes a similar approach using 7 primary pigment basis curves.

---

## Mathematical building blocks for the shader

### FBM creates the organic base texture

Fractal Brownian Motion sums octaves of noise at increasing frequency and decreasing amplitude: `fbm(p) = Σ amplitude_i · noise(frequency_i · p)`. The critical parameters are **octaves** (3–5 for watercolor textures), **lacunarity** (frequency multiplier, typically 2.0), and **gain/persistence** (amplitude multiplier, typically 0.5). Lower gain (0.3–0.4) produces smoother, more cloud-like textures; higher gain (0.6–0.7) produces rougher textures. Applying a **rotation matrix between octaves** (`mat2(0.80, 0.60, -0.60, 0.80)`) reduces axis-aligned artifacts and creates more organic patterns. The turbulence variant `abs(noise(p))` creates sharp valleys useful for watercolor edge effects; ridge noise creates vein-like patterns for petals.

### Domain warping is the single most important technique

Inigo Quilez's domain warping articles describe the core technique for watercolor-like organic patterns. The formulation builds in levels:

- **Level 1**: `f(p + fbm(p))` — single warp, creates gently flowing distortion
- **Level 2**: `fbm(p + fbm(p + fbm(p)))` — multi-level warp, creates deeply organic, fluid-like patterns that closely mimic watercolor pigment flow

The key formula from Quilez:

```glsl
float pattern(vec2 p, out vec2 q, out vec2 r) {
    q = vec2(fbm(p + vec2(0.0, 0.0)), fbm(p + vec2(5.2, 1.3)));
    r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2)), fbm(p + 4.0*q + vec2(8.3, 2.8)));
    return fbm(p + 4.0 * r);
}
```

The multiplier (4.0) controls warp intensity—**2.0–6.0** works for watercolor. The intermediate values q and r drive organic color variation: `mix(color1, color2, length(q))` and `mix(result, color3, r.y)` create the flowing color gradients characteristic of wet-on-wet painting. Each level of warping multiplies FBM evaluations—a 4-octave FBM with 2 warp levels requires ~12 noise evaluations per pixel.

### SDFs enable smooth organic shapes and edge effects

Signed distance fields return the distance from any point to the nearest shape boundary, enabling:

- **Organic blobs**: `sdCircle(p, r) + fbm(p * 5.0) * 0.05` adds noise to a circle's boundary
- **Smooth blending**: Quilez's polynomial smooth minimum `smin(a, b, k) = mix(b, a, h) - k*h*(1-h)` where `h = clamp(0.5 + 0.5*(b-a)/k, 0, 1)` merges shapes like wet paint pooling together. Parameter k (0.1–0.5) controls the organic blend radius.
- **Edge darkening**: `1.0 - smoothstep(0.0, edgeWidth, abs(d))` naturally creates the coffee ring effect
- **Anti-aliasing**: `smoothstep(fwidth(d), -fwidth(d), d)` gives pixel-perfect AA regardless of scale

### Polar coordinates generate floral patterns

The rose curve `r = a · cos(k · θ)` produces k petals (if k is odd) or 2k petals (if k is even). For organic irregularity, sample 2D noise on a circle: `fbm(vec2(cos(θ), sin(θ)) * scale)` naturally loops seamlessly as θ traverses 0 to 2π. Raising the sinusoidal modulation to a power controls petal width: `pow(0.5 + 0.5*sin(n*θ), exponent)` where exponent < 1 widens petals, > 1 narrows them. Variable petal sizes come from low-frequency noise modulating the per-petal radius.

### Noise derivatives indicate flow and pooling

Analytical noise derivatives—computed alongside the noise value for nearly zero additional cost—indicate the gradient direction. Quilez's terrain technique reduces FBM contribution where slopes are steep: `a += b * n.x / (1.0 + dot(d,d))`. For watercolor, this means **pigment accumulates in valleys (low derivative magnitude) and thins on slopes (high derivative magnitude)**, creating natural pooling. The gradient direction can drive displacement for flow-aligned patterns.

---

## GLSL implementation techniques

### Organic petal shapes from polar noise

```glsl
float organicPetal(vec2 p, int numPetals, float size, float seed) {
    float r = length(p);
    float theta = atan(p.y, p.x);
    float petalR = size * (0.5 + 0.5 * cos(float(numPetals) * theta));
    vec2 noiseCoord = vec2(cos(theta), sin(theta)) * 2.0 + seed;
    petalR += fbm(noiseCoord) * 0.1;        // irregular edges
    petalR *= (0.8 + 0.4 * noise(vec2(theta * 0.5, seed))); // variable sizes
    return r - petalR;
}
```

### Wet bleeding edges via smoothstep + noise boundary distortion

The approach combines a base SDF distance with noise-perturbed boundaries and dual smoothstep zones—an inner saturated region and an outer bleeding halo:

```glsl
float dist = shapeSDF(uv);
float boundaryNoise = fbm(uv * 8.0 + seed) * 0.15;
dist -= boundaryNoise;
float innerEdge = smoothstep(0.0, -0.05, dist);     // main shape
float outerBleed = smoothstep(0.08, 0.0, dist);      // bleeding halo
vec3 color = mix(paperColor, pigmentColor * 0.3, outerBleed);
color = mix(color, pigmentColor, innerEdge);
```

The noise on the boundary creates the irregular, organic edge where pigment seeps outward. The smoothstep width controls the bleeding distance—wider for wet-on-wet (0.08–0.15), narrower for wet-on-dry (0.01–0.03).

### Edge darkening through multiple approaches

**Inverted Gaussian blur** (Luft & Deussen): Subtract a blurred version from the original—positive values at transitions indicate edges. `edgeIntensity = length(original - blurred)` then `color *= 1.0 - edgeIntensity * strength`.

**Gradient magnitude** (Bousseau): A symmetric kernel `Δ = |p_{x-1} - p_{x+1}| + |p_{y-1} - p_{y+1}|` finds edge strength; darken proportionally. Cheap—only 4 texture samples.

**SDF-based** (most practical for procedural shapes): `edgeDark = smoothstep(edgeWidth, 0.0, abs(sdfDist)) * darkStrength` concentrates opacity at the shape boundary. Modulate edgeWidth with noise for organic variation.

### Paper texture and pigment granulation

Paper texture uses high-frequency noise (scale ~50–200 in UV space) as a heightfield. Pigment accumulates in valleys: `granulation = 1.0 - paperHeight(uv)` multiplied into the alpha channel. For physically convincing results, layer Worley noise (cellular structure) with fine FBM (fiber texture). **Pre-baked paper textures are strongly recommended for mobile**—procedural generation at these frequencies is expensive.

Granulation is controlled per-pigment: sedimentary pigments (high density/granularity) get strong paper-texture modulation; staining pigments get weak modulation. The formula from Curtis et al. captures this: `δ_down = gₖ(1 - h·γₖ)·ρₖ`, where h is paper height, γₖ is granularity, and ρₖ is density.

### Color separation for the chromatography effect

The key technique: sample each pigment component at **noise-offset positions** with different displacement magnitudes to simulate different pigments traveling at different rates:

```glsl
vec3 chromatography(vec2 uv, vec3 baseColor, float amount) {
    vec2 flowDir = vec2(fbm(uv * 3.0), fbm(uv * 3.0 + 7.1));
    float heavyPigment = fbm(uv * 4.0) * 0.3;           // short flow
    float lightPigment = fbm((uv + flowDir * amount) * 2.0); // long flow
    float mixFactor = smoothstep(0.3, 0.7, lightPigment - heavyPigment * 0.5);
    return mix(pigment1Color, pigment2Color, mixFactor) * baseColor;
}
```

This works best combined with domain warping: the intermediate q and r values from Quilez's pattern function naturally provide different "flow fields" for each pigment channel, creating organic color variation without additional computation.

### Transparent layered washes with subtractive compositing

Each wash is computed separately with its own shape function, opacity, and noise, then composited back-to-front:

```glsl
vec4 result = vec4(paperColor, 1.0);
for (int i = 0; i < NUM_LAYERS; i++) {
    vec4 wash = computeWash(uv, layerParams[i]);
    // Subtractive blend (Bousseau's density model):
    result.rgb = result.rgb * (1.0 - (1.0 - result.rgb) * (wash.a - 1.0) * wash.rgb);
    // Or simple alpha composite:
    result.rgb = mix(result.rgb, wash.rgb, wash.a);
}
```

For physical accuracy, use Kubelka-Munk compositing: compute reflectance R and transmittance T per layer, then composite using `R_total = R₁ + T₁²R₂/(1 − R₁R₂)`. Limit to **3–5 layers** for real-time performance.

### Making each instance unique via seed hashing

Pass a seed uniform and incorporate it into all noise functions. The modern approach uses integer hashes (PCG) for quality, with the seed added at an intermediate hash step for proper decorrelation:

```glsl
uniform float uSeed;
// Add seed inside hash chain, not just as coordinate offset
float seededNoise(vec2 p) {
    return noise(p + hash(vec2(uSeed, uSeed * 1.7)) * 100.0);
}
```

This ensures each flower, splotch, or element gets unique edge shapes, bleeding patterns, and pigment distributions from identical shader code.

---

## Key Shadertoy references and blog resources

The most influential Shadertoy watercolor shader is **flockaroo's "watercolor" (ltyGRV)**—a multi-pass CFD simulation achieving realistic ink spreading and bleeding, ported to Unity as KinoAqua by Keijiro Takahashi. A KM-model shader by candycat implements Curtis et al.'s physical pigment model directly, with `BrushEffect()` using distance fields for stroke shapes and `CompositeLayers()` for Kubelka-Munk glazing. Domain-warped FBM shaders (like **wttXz8**) demonstrate Quilez's warping technique producing fluid, marble-like patterns ideal for watercolor bases. Fabrice Neyret curates a comprehensive NPR shader collection including watercolor examples.

**Maxime Heckel's "On Crafting Painterly Shaders"** (October 2024) provides a complete walkthrough of the Kuwahara filter pipeline: basic 4-sector variant, anisotropic extension using the structure tensor for brush-stroke-aligned smoothing, color correction to restore post-filtering vibrancy, and paper texture overlay as the final "sell." **Cyan's watercolour shader experiments** (Unity URP) demonstrate three complementary components: an object shader using triplanar noise with patchy watercolor darkening (`abs(noise * strength - 0.3)`), an image-effect blit shader with distortion and Roberts Cross depth-edge detection, and a decal shader for paint splodge projections with noise-distorted boundaries and darker/more opaque edges.

---

## Performance considerations for mobile and real-time

Mobile GPUs have specific constraints that shape shader architecture. **Precision qualifiers matter**: use `lowp` for colors, `mediump` for UVs and normals, `highp` only for position calculations. Mobile hardware has true 16-bit execution paths—using them is both faster and lower power. **Reduce FBM octaves** from 6–8 to 3–4 on mobile; reduce domain warping from 2 levels to 1. **Pre-bake noise and paper textures** into texture maps rather than generating procedurally—texture lookups are far cheaper than computed noise at high frequencies.

Minimize expensive per-pixel operations: `sin()`, `cos()`, `pow()`, `log()` are costly on mobile tile-based architectures. Replace branching (`if/else`) with branchless alternatives (`step()`, `mix()`, `clamp()`). Move computation from fragment to vertex shader where possible—there are typically an order of magnitude more pixels than vertices. For complex post-processing like Kuwahara filtering, **render at half resolution and upscale**. Limit transparent wash layers to 2–3 on mobile. Use separable Gaussian blur passes and reduce Kuwahara kernel sizes from 8–12 (desktop) to 4–6 (mobile). Always test on actual mobile hardware—PC GPUs handle precision and branching very differently.

---

## Conclusion

Building a convincing watercolor chromatography shader is an exercise in principled approximation. The physical phenomena—capillary flow, coffee-ring edge darkening, Marangoni-driven backruns, sedimentation-based granulation, chromatographic pigment separation, and Kubelka-Munk transparency—are well understood and have been simulated with full fidelity since Curtis et al.'s 1997 work. But the real insight from Bousseau, Luft and Deussen, and the Shadertoy community is that **noise-based approximations capture the perceptual essence** without the computational overhead of fluid simulation. Domain warping (`fbm(p + fbm(p + fbm(p)))`) generates the organic flow. SDF shapes with noise-perturbed boundaries create irregular botanical forms. Smoothstep falloff with noise-modulated edges simulates bleeding. Gradient-based or SDF-based darkening at boundaries recreates the coffee ring effect. Per-channel noise offset simulates chromatographic separation. Paper texture height maps drive granulation. And Kubelka-Munk (or Mixbox) handles physically correct subtractive color mixing through transparent glazes over white paper. The entire pipeline—shape generation, flow simulation, edge effects, color separation, paper interaction, and layer compositing—can be collapsed into a manageable multi-layer single-pass fragment shader that runs in real time, with careful optimization enabling mobile deployment.