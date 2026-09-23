// 特效：輪胎煙霧粒子、撞牆火花、胎痕
import * as THREE from 'three';

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Particles {
  constructor(scene, max, opts = {}) {
    this.max = max; this.opts = opts;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.a0 = new Float32Array(max); this.rot = new Float32Array(max);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: opts.additive ? null : puffTexture() },
        color: { value: new THREE.Color(opts.color ?? 0xdddddd) },
        scale: { value: 600 },
        fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 },
        additive: { value: opts.additive ? 1 : 0 },
      },
      vertexShader: `
        attribute float size; attribute float alpha; attribute float rot;
        uniform float scale; varying float vA; varying float vFog; varying float vRot;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / max(0.5, -mv.z);
          vA = alpha; vFog = -mv.z; vRot = rot;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 color; uniform vec3 fogColor; uniform float fogDensity; uniform float additive;
        varying float vA; varying float vFog; varying float vRot;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5;
          float a;
          if (additive > 0.5) { a = smoothstep(0.5, 0.0, length(gl_PointCoord-0.5)); }
          else { a = texture2D(map, p).a * 2.2; }
          float f = 1.0 - exp(-fogDensity*fogDensity*vFog*vFog);
          vec3 col = mix(color, fogColor, additive > 0.5 ? 0.0 : f);
          gl_FragColor = vec4(col, a * vA);
          if (gl_FragColor.a < 0.004) discard;
        }`,
      transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, size, life, alpha, grow) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.a0[i] = alpha; this.grow[i] = grow;
    this.rot[i] = Math.random() * 6.28;
  }

  update(dt) {
    const o = this.opts;
    const drag = Math.exp(-dt * (o.drag ?? 1.6));
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + (o.gravity ?? 0.6) * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      // 淡入淡出
      this.alpha[i] = this.a0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.rot.needsUpdate = true;
  }
}

// 胎痕：環形緩衝的四邊形帶
export class SkidMarks {
  constructor(scene, maxSeg = 4000) {
    this.max = maxSeg; this.head = 0;
    this.pos = new Float32Array(maxSeg * 4 * 3);
    this.col = new Float32Array(maxSeg * 4 * 4);
    const idx = new Uint32Array(maxSeg * 6);
    for (let i = 0; i < maxSeg; i++) {
      const v = i * 4;
      idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.last = [null, null, null, null];
  }

  clear() {
    this.col.fill(0); this.geo.attributes.color.needsUpdate = true; this.last = [null, null, null, null];
  }

  // 每幀對每個輪子呼叫；intensity 0 表示不留痕
  add(w, x, y, z, dirx, dirz, intensity) {
    if (intensity <= 0.02) { this.last[w] = null; return; }
    const hw = 0.1;
    const lx = -dirz * hw, lz = dirx * hw;
    const cur = { lx: x + lx, lz: z + lz, rx: x - lx, rz: z - lz, y: y + 0.035, x, z, a: intensity };
    const L = this.last[w];
    if (!L) { this.last[w] = cur; return; }
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < 0.3) return;
    if (d > 3) { this.last[w] = cur; return; }
    const i = this.head; this.head = (this.head + 1) % this.max;
    const p = this.pos, c = this.col;
    const v = i * 4;
    p.set([L.lx, L.y, L.lz, L.rx, L.y, L.rz, cur.lx, cur.y, cur.lz, cur.rx, cur.y, cur.rz], v * 3);
    for (let k = 0; k < 4; k++) {
      const a = (k < 2 ? L.a : cur.a) * 0.55;
      c.set([0.03, 0.03, 0.03, a], (v + k) * 4);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.last[w] = cur;
  }
}
