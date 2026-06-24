// Star/sun shaders: 3D noise fBm sphere (from https://sangillee.com/2024-06-29-create-realistic-sun-with-shaders/), camera-facing glow
import * as THREE from 'three';
import { SHADER_DEFAULTS } from '../constants/defaults.js';

const sunSphereVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vNormalModel;
varying vec3 vNormalView;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vNormalModel = normal;
    vNormalView = normalize(normalMatrix * normal);
    vPosition = normalize(vec3(modelViewMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const sunSphereFragmentShader = `
precision highp float;

#define NUM_OCTAVES 6

uniform float uTime;
uniform float uBrightness;
uniform float uNoiseScale;
uniform float uGlowPower;
uniform float uFresnelPower;
uniform vec3 uSpectralColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vNormalModel;
varying vec3 vNormalView;
varying vec3 vPosition;

float random(in vec3 st) {
    return fract(sin(dot(st, vec3(12.9898, 78.233, 23.112))) * 12943.145);
}

float noise(in vec3 _pos) {
    vec3 i_pos = floor(_pos);
    vec3 f_pos = fract(_pos);

    float i_time = floor(uTime * 0.2);
    float f_time = fract(uTime * 0.2);

    float aa = random(i_pos + i_time);
    float ab = random(i_pos + i_time + vec3(1.0, 0.0, 0.0));
    float ac = random(i_pos + i_time + vec3(0.0, 1.0, 0.0));
    float ad = random(i_pos + i_time + vec3(1.0, 1.0, 0.0));
    float ae = random(i_pos + i_time + vec3(0.0, 0.0, 1.0));
    float af = random(i_pos + i_time + vec3(1.0, 0.0, 1.0));
    float ag = random(i_pos + i_time + vec3(0.0, 1.0, 1.0));
    float ah = random(i_pos + i_time + vec3(1.0, 1.0, 1.0));

    float ba = random(i_pos + (i_time + 1.0));
    float bb = random(i_pos + (i_time + 1.0) + vec3(1.0, 0.0, 0.0));
    float bc = random(i_pos + (i_time + 1.0) + vec3(0.0, 1.0, 0.0));
    float bd = random(i_pos + (i_time + 1.0) + vec3(1.0, 1.0, 0.0));
    float be = random(i_pos + (i_time + 1.0) + vec3(0.0, 0.0, 1.0));
    float bf = random(i_pos + (i_time + 1.0) + vec3(1.0, 0.0, 1.0));
    float bg = random(i_pos + (i_time + 1.0) + vec3(0.0, 1.0, 1.0));
    float bh = random(i_pos + (i_time + 1.0) + vec3(1.0, 1.0, 1.0));

    vec3 t = smoothstep(0.0, 1.0, f_pos);
    float t_time = smoothstep(0.0, 1.0, f_time);

    float a = mix(
        mix(mix(aa, ab, t.x), mix(ac, ad, t.x), t.y),
        mix(mix(ae, af, t.x), mix(ag, ah, t.x), t.y),
        t.z
    );
    float b = mix(
        mix(mix(ba, bb, t.x), mix(bc, bd, t.x), t.y),
        mix(mix(be, bf, t.x), mix(bg, bh, t.x), t.y),
        t.z
    );

    return mix(a, b, t_time);
}

#define NUM_OCTAVES 6

float fBm(in vec3 _pos, in float sz) {
    float v = 0.0;
    float a = 0.2;
    _pos *= sz;

    vec3 angle = vec3(-0.001 * uTime, 0.0001 * uTime, 0.0004 * uTime);
    mat3 rotx = mat3(
        1.0, 0.0, 0.0,
        0.0, cos(angle.x), -sin(angle.x),
        0.0, sin(angle.x), cos(angle.x)
    );
    mat3 roty = mat3(
        cos(angle.y), 0.0, sin(angle.y),
        0.0, 1.0, 0.0,
        -sin(angle.y), 0.0, cos(angle.y)
    );
    mat3 rotz = mat3(
        cos(angle.z), -sin(angle.z), 0.0,
        sin(angle.z), cos(angle.z), 0.0,
        0.0, 0.0, 1.0
    );

    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(_pos);
        _pos = rotx * roty * rotz * _pos * 2.0;
        a *= 0.8;
    }
    return v;
}

void main() {
    vec3 st = vNormalModel;

    vec3 q = vec3(0.0);
    q.x = fBm(st, uNoiseScale);
    q.y = fBm(st + vec3(1.2, 3.2, 1.52), uNoiseScale);
    q.z = fBm(st + vec3(0.02, 0.12, 0.152), uNoiseScale);

    float n = fBm(st + q + vec3(1.82, 1.32, 1.09), uNoiseScale);

    vec3 color = mix(uSpectralColor * 0.4, vec3(1.0), n * n);
    color = mix(color, uSpectralColor * (0.3 + 0.7 * q.x), 0.3);

    float ndotv = dot(vPosition, vNormalView);
    float glow = pow(max(-ndotv, 0.0), uGlowPower);
    float fresnel = pow(1.0 + ndotv, uFresnelPower);

    color = color * (1.0 + glow + fresnel * 0.5);
    gl_FragColor = vec4(uBrightness * color, 1.0);
}
`;

// ShaderMaterial for sun sphere: 3D value noise fBm, spectral-color surface, fresnel edge glow
export function generateSunSphereMaterial(spectralColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBrightness: { value: SHADER_DEFAULTS.sphereBrightness },
      uNoiseScale: { value: SHADER_DEFAULTS.noiseScale },
      uGlowPower: { value: SHADER_DEFAULTS.glowPower },
      uFresnelPower: { value: SHADER_DEFAULTS.fresnelPower },
      uSpectralColor: { value: spectralColor || new THREE.Color(1, 1, 1) },
    },
    vertexShader: sunSphereVertexShader,
    fragmentShader: sunSphereFragmentShader,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
  });
}

const sunGlowVertexShader = `
attribute vec3 aPos;

varying float vRadial;
varying vec3 vWorld;

uniform mat4 uViewProjection;
uniform float uRadius;
uniform vec3 uCamUp;
uniform vec3 uCamPos;

void main() {
  vRadial = aPos.z;
  vec3 side = normalize(cross(normalize(-uCamPos), uCamUp));
  vec3 p = aPos.x * side + aPos.y * uCamUp;
  p *= 1.0 + aPos.z * uRadius;
  vec4 world = vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = uViewProjection * world;
}
`;

const sunGlowFragmentShader = `
precision highp float;

varying float vRadial;
varying vec3 vWorld;

uniform float uTint;
uniform float uBrightness;
uniform float uFalloffColor;
uniform vec3  uSpectralColor;

vec3 brightnessToColor(float b) {
  b *= uTint;
  return (vec3(b, b*b, b*b*b*b) / uTint) * uBrightness * uSpectralColor;
}

void main() {
  float alpha = (1.0 - vRadial);
  alpha *= alpha;
  float brightness = 1.0 + alpha * uFalloffColor;
  gl_FragColor.xyz = brightnessToColor(brightness) * alpha;
  gl_FragColor.w = alpha;
}
`;

// Generate camera-facing quad ring geometry for sun glow aura (inner ring → outer ring, triangulated)
export function generateSunGlowGeometry() {
  const verts = [];
  const aPos = [];
  const divs = 32;
  for (let i = 0; i <= divs; i++) {
    const t = i / divs;
    const angle = t * 2 * Math.PI;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const innerR = 0.1, outerR = 1.0;
    for (let ring = 0; ring < 2; ring++) {
      const r = ring === 0 ? innerR : outerR;
      aPos.push(x * r, y * r, ring);
      verts.push(i * 2 + ring);
    }
  }
  const indices = [];
  for (let i = 0; i < divs; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('aPos', new THREE.BufferAttribute(new Float32Array(aPos), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  return geom;
}

// ShaderMaterial for sun glow: camera-facing aura with radial falloff, brightness-to-color mapping
export function createSunGlowMaterial(params) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: params.tint },
      uBrightness: { value: params.brightness },
      uFalloffColor: { value: params.falloffColor },
      uSpectralColor: { value: params.spectralColor || new THREE.Color(1, 1, 1) },
      uViewProjection: { value: new THREE.Matrix4() },
      uRadius: { value: params.radius },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamPos: { value: new THREE.Vector3(0, 0, 2.5) },
    },
    vertexShader: sunGlowVertexShader,
    fragmentShader: sunGlowFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
