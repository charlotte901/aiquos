import * as THREE from "three";

/**
 * Scheme A: Aerodynamic 3D Stamp Flight with Perforations and Holographic Sheen.
 */

export const STAMP_VERTEX_SHADER = /* glsl */ `
  uniform float uProgress;
  uniform float uSpeed;
  uniform vec2 uDirection;
  uniform float uBendingIntensity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;

    vec3 pos = position;

    // Aerodynamic bow: paper arches backward against velocity
    // Center deflects most, edges remain anchored
    float arch = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    float bend = arch * uSpeed * uBendingIntensity * (1.0 - uProgress * 0.7);
    pos.z -= bend;

    // Lateral twist proportional to horizontal travel direction
    float twist = (uv.x - 0.5) * uDirection.x * (1.0 - uProgress) * 0.35;
    pos.z += twist;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const STAMP_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uProgress;
  uniform float uHoloIntensity;
  uniform vec2 uResolution;
  uniform float uPerforationRadius;
  uniform float uPerforationSpacing;
  uniform float uTearRadius;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  // Signed distance to edge perforation circles
  float stampPerforation(vec2 uv, float edgeFade) {
    vec2 pixelPos = uv * uResolution;

    // Edges
    float dLeft = pixelPos.x;
    float dRight = uResolution.x - pixelPos.x;
    float dTop = pixelPos.y;
    float dBottom = uResolution.y - pixelPos.y;

    float r = uPerforationRadius * edgeFade;
    float spacing = uPerforationSpacing;

    // Horizontal edges
    float modX = mod(pixelPos.x + spacing * 0.5, spacing) - spacing * 0.5;
    float holeTop = length(vec2(modX, dTop)) - r;
    float holeBottom = length(vec2(modX, dBottom)) - r;

    // Vertical edges
    float modY = mod(pixelPos.y + spacing * 0.5, spacing) - spacing * 0.5;
    float holeLeft = length(vec2(dLeft, modY)) - r;
    float holeRight = length(vec2(dRight, modY)) - r;

    // Tear line punch holes at the split line (uv.x = 0.72): 26px DOM discs
    // centred ON the top/bottom edges, so r = 13 and they never fade — the
    // real card keeps them at rest.
    float splitX = uResolution.x * 0.72;
    float tearNotchTop = length(vec2(pixelPos.x - splitX, dTop)) - uTearRadius;
    float tearNotchBottom = length(vec2(pixelPos.x - splitX, dBottom)) - uTearRadius;

    return min(min(min(holeTop, holeBottom), min(holeLeft, holeRight)), min(tearNotchTop, tearNotchBottom));
  }

  void main() {
    vec4 texColor = texture2D(uMap, vUv);

    // The stamp is a POSTAGE stamp mid-air (edge teeth + foil sheen) but the
    // DOM ticket it lands as has neither: both retire before the freeze so
    // the final frame is the real card.
    float edgeFade = 1.0 - smoothstep(0.72, 0.95, uProgress);
    float holoFade = 1.0 - smoothstep(0.55, 0.85, uProgress);

    // Fresnel view angle for iridescent foil sheen
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
    fresnel = pow(fresnel, 2.4);

    // Sweeping holographic rainbow band
    float sweep = vUv.x * 3.5 + vUv.y * 1.8 - uProgress * 5.0;
    vec3 rainbow = 0.5 + 0.5 * cos(sweep + vec3(0.0, 2.0, 4.0));
    vec3 holo = rainbow * fresnel * uHoloIntensity * holoFade;

    // Perforation holes are anti-aliased alpha cutouts (no hard discard):
    // a 3px smoothstep rim keeps the punched edges as soft as the card art.
    float dist = stampPerforation(vUv, edgeFade);
    float hole = 1.0 - smoothstep(-1.5, 1.5, dist);

    // Canvas edge pixels carry partial alpha with black RGB (premultiplied
    // storage), which would blend as dark fringes on the rounded corners —
    // wash them toward the paper colour instead.
    vec3 paper = vec3(1.0, 0.992, 0.984);
    vec3 finalRgb = mix(paper, texColor.rgb, texColor.a) + holo;
    float alpha = texColor.a * (1.0 - hole);

    gl_FragColor = vec4(finalRgb, alpha);
  }
`;

export function createStampMaterial(texture, width = 706, height = 383) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uProgress: { value: 0 },
      uSpeed: { value: 0 },
      uDirection: { value: new THREE.Vector2(0, 0) },
      uBendingIntensity: { value: 0.65 },
      uHoloIntensity: { value: 0.4 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uPerforationRadius: { value: 4.0 },
      uPerforationSpacing: { value: 19.0 },
      uTearRadius: { value: 13.0 },
    },
    vertexShader: STAMP_VERTEX_SHADER,
    fragmentShader: STAMP_FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}
