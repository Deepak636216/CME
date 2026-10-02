import { AdditiveBlending, BackSide, Color, ShaderMaterial, Vector3, Vector4, type Texture } from "three";

export const MAX_SPOTS = 24;
export const MAX_FLARES = 4;

/**
 * Hand-written shaders for the bodies (design review board 2). All of them include three's
 * logarithmic-depth chunks, because the Canvas uses a logarithmic depth buffer.
 */

// Hash, value noise, fbm and Worley (cellular) noise. Small, self-written; good enough for looks.
const NOISE = /* glsl */ `
float hash31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
float worley(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 r = g + hash33(i + g) - f; d = min(d, dot(r, r));
  }
  return sqrt(d);
}
`;

const VERT_SURFACE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj;      // object-space position on the unit sphere (noise lookups)
varying vec3 vNormalW;  // world normal
varying vec3 vPosW;     // world position
varying vec2 vUv;
void main() {
  vObj = position;
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

// ---- Sun -------------------------------------------------------------------------------------

/**
 * Photosphere: linear limb darkening I(μ) = 1 − u(1 − μ) with u = 0.6, colour shifting to orange at the limb,
 * slowly evolving granulation cells, and faculae (bright patches) near the limb. Fine detail fades out when
 * the Sun is small on screen, so it never shimmers. Colours are written in display space (no tone mapping).
 */
export function createSunMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // sunspot groups: xyz = direction in the Sun's frame (+Z Earth, +Y north, +X west), w = angular radius
      uSpots: { value: Array.from({ length: MAX_SPOTS }, () => new Vector4()) },
      uSpotCount: { value: 0 },
      // flares: xyz = direction, w = strength 0…1 (already pulsed)
      uFlares: { value: Array.from({ length: MAX_FLARES }, () => new Vector4()) },
      uFlareCount: { value: 0 },
    },
    defines: { MAX_SPOTS, MAX_FLARES },
    vertexShader: VERT_SURFACE,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform vec4 uSpots[MAX_SPOTS]; uniform int uSpotCount;
uniform vec4 uFlares[MAX_FLARES]; uniform int uFlareCount;
varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float limb = 1.0 - 0.6 * (1.0 - mu);

  vec3 gp = vObj * 60.0;                               // fine cells: a texture, not pebbles, even up close
  float detail = 1.0 - smoothstep(0.25, 0.9, length(fwidth(gp)));
  float cells = detail > 0.01 ? worley(gp + vec3(0.0, uTime * 0.020, uTime * 0.013)) : 0.5;
  float granulation = mix(1.0, 1.05 - 0.2 * smoothstep(0.05, 0.85, cells), detail);
  float big = fbm(vObj * 3.5 + vec3(uTime * 0.004));
  float faculae = smoothstep(0.58, 0.74, big) * pow(1.0 - mu, 1.5) * detail;

  // warm yellow centre → orange → deep orange limb; limb darkening on top, never below ~55 %
  vec3 core = vec3(1.0, 0.90, 0.58);
  vec3 mid = vec3(1.0, 0.68, 0.24);
  vec3 edge = vec3(1.0, 0.50, 0.12);
  vec3 col = mu > 0.45 ? mix(mid, core, smoothstep(0.45, 1.0, mu)) : mix(edge, mid, smoothstep(0.0, 0.45, mu));
  col *= max(limb, 0.55) * 1.12 * granulation * (0.94 + 0.12 * big);
  col += vec3(1.0, 0.85, 0.6) * faculae * 0.15;

  // Sunspot groups (NOAA regions): dark umbra inside a lighter, filamented penumbra with a ragged edge,
  // and bright faculae (plage) around them that stand out toward the limb.
  vec3 n = normalize(vObj);
  float shade = 1.0;
  float plage = 0.0;
  for (int i = 0; i < MAX_SPOTS; i++) {
    if (i >= uSpotCount) break;
    vec4 sp = uSpots[i];
    float d = acos(clamp(dot(n, sp.xyz), -1.0, 1.0));
    float aa = fwidth(d) * 1.5 + 1e-5;
    float rag = 1.0 + 0.22 * (vnoise(n * 55.0 + float(i) * 7.13) - 0.5);
    float R = sp.w * rag;
    float pen = 1.0 - smoothstep(R - aa, R + aa, d);
    float umb = 1.0 - smoothstep(R * 0.42 - aa, R * 0.42 + aa, d);
    float fil = 0.82 + 0.36 * vnoise(n * 140.0 + float(i));
    shade = min(shade, mix(mix(1.0, 0.5 * fil, pen), 0.15, umb));
    plage = max(plage, smoothstep(R * 3.2, R * 1.15, d) * (1.0 - pen));
  }
  col *= shade;
  col += vec3(1.0, 0.88, 0.65) * plage * (0.05 + 0.3 * pow(1.0 - mu, 1.5));

  // Flares: a white-hot kernel where the energy is released (values above 1 clip to white on purpose).
  for (int i = 0; i < MAX_FLARES; i++) {
    if (i >= uFlareCount) break;
    vec4 f = uFlares[i];
    float d = acos(clamp(dot(n, f.xyz), -1.0, 1.0));
    float k = exp(-pow(d / (0.025 + 0.05 * f.w), 2.0));
    col += vec3(1.0, 0.97, 0.9) * k * f.w * 1.8;
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
  });
}

/**
 * Corona: a camera-facing quad (8 × 8 radii) around the Sun, additive, with a 1/r² falloff and faint
 * streamers. The quad is turned toward the camera in the vertex shader, so the Sun's own rotation doesn't matter.
 */
export function createCoronaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uActivity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vXY;
void main() {
  vXY = position.xy;                                  // in Sun radii
  float r = length(modelMatrix[0].xyz);               // world radius of the Sun
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * r;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uActivity; // 0 quiet … 1 major flare (from the live X-ray flux)
varying vec2 vXY;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vXY);
  if (r < 0.98) discard;
  float a = atan(vXY.y, vXY.x);
  float streamers = 0.75 + 0.5 * fbm(vec3(cos(a) * 2.5, sin(a) * 2.5, r * 0.6 - uTime * 0.01));
  float glow = 0.55 / (r * r) - 0.55 / 16.0;          // 1/r², zero at the quad's edge (r = 4)
  glow *= smoothstep(0.98, 1.0, r) * streamers;
  glow *= 0.85 + 0.9 * uActivity;
  vec3 tint = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.85, 0.65), uActivity);
  gl_FragColor = vec4(tint * max(glow, 0.0), 1.0);
}
`,
  });
}

// ---- Earth -----------------------------------------------------------------------------------

/**
 * Earth: day map lit by the Sun, city lights past the terminator, clouds (shifted slowly in longitude),
 * glint on the oceans, and a blue rim brighter on the day side. Until the maps arrive (uReady 0 → 1)
 * it is drawn as the old flat blue, so the first paint never waits on a download.
 */
export function createEarthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uDay: { value: null as Texture | null },
      uNight: { value: null as Texture | null },
      uClouds: { value: null as Texture | null },
      uReady: { value: 0 },
      uCloudShift: { value: 0 },
      uSunDir: { value: new Vector3(1, 0, 0) },
      uFlat: { value: new Color("#4f8fe8") },
    },
    vertexShader: VERT_SURFACE,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds;
uniform float uReady; uniform float uCloudShift; uniform vec3 uSunDir; uniform vec3 uFlat;
varying vec3 vNormalW; varying vec3 vPosW; varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);
  float nl = dot(N, L);
  float lit = max(nl, 0.0);
  float dayMix = smoothstep(-0.10, 0.20, nl);         // twilight band around the terminator

  vec3 col = uFlat * (0.06 + 0.94 * lit);
  if (uReady > 0.0) {
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    float cloud = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
    float ocean = smoothstep(0.015, 0.06, day.b - max(day.r, day.g)) * (1.0 - smoothstep(0.25, 0.45, day.g));
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(N, H), 0.0), 70.0) * ocean * (1.0 - cloud) * 0.8;
    cloud = pow(cloud, 1.4) * 0.8;  // thinner, so land and sea read through
    vec3 dayCol = mix(day, vec3(1.0), cloud) * (0.03 + 1.05 * lit) + glint * vec3(1.0, 0.92, 0.8) * lit;
    vec3 nightCol = max(night - 0.02, 0.0) * vec3(1.0, 0.78, 0.5) * 2.0 * (1.0 - cloud * 0.8);
    vec3 textured = mix(nightCol, dayCol, dayMix);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    textured += vec3(0.25, 0.55, 1.0) * fresnel * (0.08 + 0.8 * smoothstep(-0.3, 0.6, nl));
    col = mix(col, textured, uReady);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  });
}

/** Thin atmosphere halo just outside Earth: back faces of a slightly larger sphere, additive, day side only. */
export function createAtmosphereMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uSunDir: { value: new Vector3(1, 0, 0) } },
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: VERT_SURFACE,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir;
varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float rim = pow(clamp(1.0 + dot(N, V) * 1.6, 0.0, 1.0), 2.0);   // brightest at the silhouette
  float day = smoothstep(-0.25, 0.5, dot(N, normalize(uSunDir)));
  gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * rim * day * 0.7, 1.0);
}
`,
  });
}

// ---- Venus and Mercury -----------------------------------------------------------------------

/**
 * Procedural surfaces, no download: Venus is a banded cream cloud deck with a soft terminator (thick air);
 * Mercury is grey cratered rock with a hard one. Colours are linear; tone mapping and sRGB applied at the end.
 */
export function createRockyMaterial(kind: "venus" | "mercury"): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uSunDir: { value: new Vector3(1, 0, 0) }, uTime: { value: 0 } },
    defines: { VENUS: kind === "venus" ? 1 : 0 },
    vertexShader: VERT_SURFACE,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir; uniform float uTime;
varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float nl = dot(N, normalize(uSunDir));
  vec3 col;
#if VENUS
  float bands = fbm(vec3(vObj.x * 1.5 + uTime * 0.003, vObj.y * 10.0, vObj.z * 1.5));
  vec3 base = mix(vec3(0.62, 0.45, 0.22), vec3(0.95, 0.82, 0.58), bands);
  float lit = smoothstep(-0.15, 1.0, nl);
  col = base * (0.05 + 1.1 * lit);
  col += vec3(0.9, 0.8, 0.6) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.25 * smoothstep(-0.2, 0.5, nl);
#else
  float rough = fbm(vObj * 7.0);
  vec3 cp = vObj * 6.0;
  float detail = 1.0 - smoothstep(0.3, 1.0, length(fwidth(cp)));
  float c = detail > 0.01 ? worley(cp) : 1.0;
  float crater = (smoothstep(0.30, 0.18, c) * -0.25 + smoothstep(0.42, 0.30, c) * smoothstep(0.24, 0.32, c) * 0.25) * detail;
  vec3 base = vec3(0.32, 0.30, 0.28) * (0.7 + 0.6 * rough + crater);
  col = base * (0.06 + 1.2 * max(nl, 0.0));  // a little fill so the night side still reads as a body
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  });
}

/** A flare's glow seen from afar: a camera-facing additive spot, sized and brightened by flare strength. */
export function createFlareGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uStrength;
varying vec2 vXY;
void main() {
  vXY = position.xy * 2.0;                             // −1…1 across the quad
  float r = length(modelMatrix[0].xyz);                // world radius of the Sun (parent scale)
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * r * (0.35 + 0.9 * uStrength);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uStrength;
varying vec2 vXY;
void main() {
  #include <logdepthbuf_fragment>
  float d = length(vXY);
  float core = exp(-d * d * 18.0);
  float halo = exp(-d * d * 4.0) * 0.45;
  float a = (core + halo) * (0.35 + 0.9 * uStrength) * (1.0 - smoothstep(0.85, 1.0, d));
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, 1.0);
}
`,
  });
}
