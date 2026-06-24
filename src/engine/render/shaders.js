// Shader materials: colormap surface, lines, overlays, gas giant, clouds
import * as THREE from 'three';
import { SimplexNoise } from '../../lib/redblob.lib.js';
import colormapTexture from './colormap-texture.js';
import aleaPRNG from '../../lib/aleaPRNG-1.1.js';

const planetVertexShader = `
varying vec2 v_tm;
void main() {
    v_tm = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const planetFragmentShader = `
precision highp float;

uniform sampler2D u_colormap;
uniform vec2 u_light_angle;
uniform float u_inverse_texture_size;
uniform float u_slope;
uniform float u_flat;
uniform float u_c;
uniform float u_d;
uniform float u_outline_strength;

varying vec2 v_tm;

void main() {
    float e = v_tm.x > 0.0 ? 0.5 * (v_tm.x * v_tm.x + 1.0) : 0.5 * (v_tm.x + 1.0);
    float dedx = dFdx(v_tm.x);
    float dedy = dFdy(v_tm.x);
    vec3 slope_vector = normalize(vec3(dedy, dedx, u_d * 2.0 * u_inverse_texture_size));
    vec3 light_vector = normalize(vec3(u_light_angle, mix(u_slope, u_flat, slope_vector.z)));
    float light = u_c + max(0.0, dot(light_vector, slope_vector));
    float outline = 1.0 + u_outline_strength * max(dedx, dedy);
    gl_FragColor = vec4(texture2D(u_colormap, vec2(e, v_tm.y)).rgb * light / outline, 1);
}
`;

// ShaderMaterial for planet surface: colormap texture lookup with derivative-based normals and lighting
export function createPlanetSurfaceMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_colormap: { value: colormapTexture },
            u_light_angle: { value: new THREE.Vector2(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)) },
            u_inverse_texture_size: { value: 1.0 / 2048 },
            u_d: { value: 60 },
            u_c: { value: 0.15 },
            u_slope: { value: 6 },
            u_flat: { value: 2.5 },
            u_outline_strength: { value: 5 },
        },
        vertexShader: planetVertexShader,
        fragmentShader: planetFragmentShader,
        side: THREE.FrontSide,
        depthWrite: true,
        depthTest: true,
    });
}

const lineVertexShader = `
attribute vec4 a_rgba;
varying vec4 v_rgba;
void main() {
    v_rgba = a_rgba;
    vec3 outward = normalize(position) * 1.002;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(outward, 1.0);
}
`;

const lineFragmentShader = `
precision highp float;
uniform vec4 u_multiply_rgba;
uniform vec4 u_add_rgba;
varying vec4 v_rgba;
void main() {
    gl_FragColor = v_rgba * u_multiply_rgba + u_add_rgba;
}
`;

// ShaderMaterial for line rendering (rivers, borders, vectors) with per-vertex RGBA and premultiplied blending
export function createLineMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_multiply_rgba: { value: new THREE.Vector4(1, 1, 1, 1) },
            u_add_rgba: { value: new THREE.Vector4(0, 0, 0, 0) },
        },
        vertexShader: lineVertexShader,
        fragmentShader: lineFragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendEquation: THREE.AddEquation,
    });
}

// Basic mesh material for culture/state/province overlays: vertex colors, transparent, no depth-write
export function createOverlayMaterial() {
    return new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
    });
}

const cloudVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const cloudFragmentShader = `
precision highp float;

uniform sampler2D u_cloud_texture;
uniform float u_time;

varying vec2 vUv;

void main() {
    vec2 scrolledUv = vec2(vUv.x + u_time * 0.015, vUv.y);
    float alpha = texture2D(u_cloud_texture, scrolledUv).r;
    alpha = clamp(alpha * 0.7, 0.0, 0.55);
    gl_FragColor = vec4(1.0, 0.95, 0.85, alpha);
}
`;

const gasGiantVertexShader = `
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec3 vUnitSamplePoint;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPositionW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vUnitSamplePoint = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const gasGiantFragmentShader = `
precision highp float;

uniform float u_scale;
uniform float u_turbulence;
uniform float u_blur;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform float u_seed;

varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec3 vUnitSamplePoint;

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

float mod289(float x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289(((x*34.0)+10.0)*x);
}

float permute(float x) {
    return mod289(((x*34.0)+10.0)*x);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float taylorInvSqrt(float r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p,s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;
    return p;
}

#define F4 0.309016994374947451

float snoise(vec4 v) {
    const vec4 C = vec4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
    vec4 i = floor(v + dot(v, vec4(F4)));
    vec4 x0 = v - i + dot(i, C.xxxx);
    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;
    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0-1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0-2.0, 0.0, 1.0);
    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;
    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(permute(permute(permute(
        i.w + vec4(i1.w, i2.w, i3.w, 1.0))
        + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
        + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
        + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
    vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);
    vec4 p0 = grad4(j0, ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4,p4));
    vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * (dot(m0*m0, vec3(dot(p0,x0), dot(p1,x1), dot(p2,x2)))
        + dot(m1*m1, vec2(dot(p3,x3), dot(p4,x4))));
}

float simplex401(vec4 p) {
    return (snoise(p) + 1.0) / 2.0;
}

float fractalSimplex4(vec4 p, int nbOctaves, float decay, float lacunarity) {
    float totalAmplitude = 0.0;
    float value = 0.0;
    for(int i = 0; i < nbOctaves; ++i) {
        totalAmplitude += 1.0 / pow(decay, float(i));
        vec4 samplePoint = p * pow(lacunarity, float(i));
        value += simplex401(samplePoint) / pow(decay, float(i));
    }
    return value / totalAmplitude;
}

vec3 lerp(vec3 v1, vec3 v2, float s) {
    return s * v1 + (1.0 - s) * v2;
}

void main() {
    float seedImpact = mod(u_seed, 1e3);
    vec4 seededSamplePoint = vec4(vUnitSamplePoint * u_scale, seedImpact);
    seededSamplePoint.y *= 2.5;

    float latitude = seededSamplePoint.y;

    float warping = fractalSimplex4(seededSamplePoint, 5, 2.0, 2.0) * u_turbulence;

    float colorDecision1 = fractalSimplex4(
        vec4(latitude + warping, seedImpact, -seedImpact, seedImpact), 3, 2.0, 2.0);
    float colorDecision2 = fractalSimplex4(
        vec4(latitude - warping, seedImpact, -seedImpact, seedImpact), 3, 2.0, 2.0);

    float blurRange = 0.1 + u_blur * 0.3;

    vec3 color = lerp(u_colorA, u_colorC, smoothstep(0.5 - blurRange, 0.5 + blurRange, colorDecision1));
    color = lerp(color, u_colorB, smoothstep(0.2, 0.8, colorDecision2));

    vec3 lightDirection = normalize(vec3(0.5, 0.8, 0.3));
    vec3 normal = normalize(vNormalW);
    float ndl = max(0.0, dot(normal, lightDirection));

    vec3 viewDir = normalize(cameraPosition - vPositionW);
    vec3 halfDir = normalize(lightDirection + viewDir);
    float spec = pow(max(0.0, dot(normal, halfDir)), 16.0) * 0.3;

    color *= (ndl * 0.35 + 0.85);
    color += spec * ndl * 0.3;

    float rim = 1.0 - max(0.0, dot(viewDir, normal));
    rim = pow(rim, 3.0) * 0.2;
    color += rim * mix(u_colorB, u_colorA, 0.5);

    float pole = 1.0 - pow(abs(vUnitSamplePoint.y), 2.0) * 0.15;
    color *= pole;

    gl_FragColor = vec4(color, 1.0);
}
`;

// ShaderMaterial for gas giant: procedural horizontal bands + 4D simplex noise turbulence + 3-color mixing
export function createGasGiantMaterial(params) {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_scale: { value: params.scale },
            u_turbulence: { value: params.turbulence },
            u_blur: { value: params.blur },
            u_colorA: { value: params.colorA.clone ? params.colorA : new THREE.Color(params.colorA) },
            u_colorB: { value: params.colorB.clone ? params.colorB : new THREE.Color(params.colorB) },
            u_colorC: { value: params.colorC.clone ? params.colorC : new THREE.Color(params.colorC) },
            u_seed: { value: params.seed },
        },
        vertexShader: gasGiantVertexShader,
        fragmentShader: gasGiantFragmentShader,
        side: THREE.FrontSide,
        depthWrite: true,
        depthTest: true,
    });
}

// Procedural cloud sphere material: 512×256 simplex noise texture (4 octaves), UV.x scroll animation
export function createCloudMaterial(seed) {
    const width = 512, height = 256;
    const data = new Uint8Array(width * height * 4);
    const noise = new SimplexNoise(aleaPRNG(seed + 12345));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const nx = x / width * 4;
            const ny = y / height * 2;

            let n = 0;
            n += noise.noise3D(nx, ny, 0) * 0.5;
            n += noise.noise3D(nx * 2, ny * 2, 1) * 0.25;
            n += noise.noise3D(nx * 4, ny * 4, 2) * 0.125;
            n += noise.noise3D(nx * 8, ny * 8, 3) * 0.0625;
            n = n * 0.5 + 0.5;

            const v = Math.floor(n * 255);
            data[i] = v;
            data[i+1] = v;
            data[i+2] = v;
            data[i+3] = 255;
        }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;

    return new THREE.ShaderMaterial({
        uniforms: {
            u_cloud_texture: { value: texture },
            u_time: { value: 0 },
        },
        vertexShader: cloudVertexShader,
        fragmentShader: cloudFragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
    });
}
