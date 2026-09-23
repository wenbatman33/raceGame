// 植被：枝葉卡片杉木（近景）+ 烘焙 impostor（遠景）+ 草叢卡片
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---- 針葉枝條貼圖（含實心核心，遠距離 alpha test 不會變稀疏） ----
export function needleTexture() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const R = rng(5);
  const cy = H / 2;
  const twig = (x0, y0, ang, len, width, depth) => {
    const pts = [];
    let x = x0, y = y0, a = ang;
    for (let i = 0; i <= 24; i++) { pts.push([x, y]); a += (R() - 0.5) * 0.05; x += Math.cos(a) * len / 24; y += Math.sin(a) * len / 24; }
    // 針葉
    for (let i = 2; i < pts.length; i++) {
      const [px, py] = pts[i]; const t = i / pts.length;
      const nl = (26 - t * 14) * (depth ? 0.75 : 1) * (0.8 + R() * 0.4);
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        const na = ang + side * (0.6 + R() * 0.7) + (R() - 0.5) * 0.3;
        const l = nl * (0.7 + R() * 0.5);
        const shade = 30 + R() * 45;
        g.strokeStyle = `rgba(${shade * 0.55 | 0},${shade * 1.15 + 20 | 0},${shade * 0.45 | 0},1)`;
        g.lineWidth = 1.6 + R() * 1.2;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * l, py + Math.sin(na) * l); g.stroke();
      }
    }
    g.strokeStyle = '#3a2a1c'; g.lineWidth = width;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    if (depth < 1) for (let i = 4; i < 20; i += 3) {
      const [px, py] = pts[i]; const side = i % 2 ? 1 : -1;
      twig(px, py, ang + side * (0.55 + R() * 0.3), len * (0.42 - i * 0.012), width * 0.6, depth + 1);
    }
  };
  // 實心核心（葉叢陰影色）
  g.fillStyle = 'rgb(22,40,18)';
  g.beginPath(); g.moveTo(8, cy);
  g.quadraticCurveTo(W * 0.45, cy - H * 0.36, W - 30, cy); g.quadraticCurveTo(W * 0.45, cy + H * 0.36, 8, cy); g.fill();
  twig(4, cy, 0, W - 20, 5, 0);
  // 高光針尖
  for (let i = 0; i < 700; i++) {
    const x = 20 + R() * (W - 50), y = cy + (R() - 0.5) * H * 0.7 * Math.sin((x / W) * Math.PI);
    g.fillStyle = `rgba(${90 + R() * 60 | 0},${130 + R() * 60 | 0},${60 + R() * 30 | 0},0.9)`;
    g.fillRect(x, y, 2, 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---- 單棵杉木幾何（高度 1 的正規化尺寸） ----
function pineGeometry(seed, bareFrac = 0.32) {
  const R = rng(seed);
  const pos = [], nrm = [], uv = [], col = [];
  const whorls = 16;
  for (let wi = 0; wi < whorls; wi++) {
    const t = wi / (whorls - 1);
    const y = bareFrac + (1 - bareFrac) * t * 0.97;
    const L = 0.26 * Math.pow(1 - t, 0.85) + 0.035;
    const n = wi > whorls - 3 ? 4 : 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + wi * 2.39996 + (R() - 0.5) * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      const len = L * (0.8 + R() * 0.4);
      const w = len * 0.62;
      const droop = len * (0.25 + R() * 0.25) - 0.02;
      const rise = len * 0.12;
      const roll = (R() - 0.5) * 1.6;
      // 卡片局部座標：沿 d 方向，寬度方向為 side（含 roll 旋轉）
      const sx = -dz, sz = dx;
      const sideV = [sx * Math.cos(roll), Math.sin(roll), sz * Math.cos(roll)];
      const pts = [];
      for (const [u, along] of [[0, 0], [0.5, 0.5], [1, 1]]) {
        const d = along * len;
        const py = y + rise * along - droop * along * along;
        pts.push([dx * d, py, dz * d, u]);
      }
      const shadeBase = 0.42 + 0.35 * t;
      for (let s = 0; s < 2; s++) {
        const A = pts[s], B = pts[s + 1];
        const hwA = w * 0.5 * (s === 0 ? 0.35 : 1), hwB = w * 0.5 * (s === 0 ? 1 : 0.55);
        const q = [
          [A[0] + sideV[0] * hwA, A[1] + sideV[1] * hwA, A[2] + sideV[2] * hwA, A[3], 0],
          [A[0] - sideV[0] * hwA, A[1] - sideV[1] * hwA, A[2] - sideV[2] * hwA, A[3], 1],
          [B[0] + sideV[0] * hwB, B[1] + sideV[1] * hwB, B[2] + sideV[2] * hwB, B[3], 0],
          [B[0] - sideV[0] * hwB, B[1] - sideV[1] * hwB, B[2] - sideV[2] * hwB, B[3], 1],
        ];
        for (const idx of [0, 1, 2, 2, 1, 3]) {
          const v = q[idx];
          pos.push(v[0], v[1], v[2]);
          uv.push(v[3], v[4]);
          // 柔和法線：向外 + 向上
          const nx = dx * 0.55, ny = 0.8, nz = dz * 0.55; const l = Math.hypot(nx, ny, nz);
          nrm.push(nx / l, ny / l, nz / l);
          const sh = shadeBase + v[3] * 0.35 + (R() - 0.5) * 0.06;
          col.push(sh, sh, sh);
        }
      }
    }
  }
  // 樹頂
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI; const dx = Math.cos(a) * 0.035, dz = Math.sin(a) * 0.035;
    const y0 = 0.9, y1 = 1.02;
    const q = [[dx, y0, dz, 0, 0], [-dx, y0, -dz, 0, 1], [0, y1, 0, 1, 0.5], [0, y1, 0, 1, 0.5]];
    for (const idx of [0, 1, 2]) { const v = q[idx]; pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); nrm.push(0, 1, 0); col.push(0.8, 0.8, 0.8); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function trunkGeometry() {
  const g = new THREE.CylinderGeometry(0.0045, 0.02, 1, 7, 1, true);
  g.translate(0, 0.5, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 10);
  return g;
}

// 修正 alpha test 在遠距 mip 下變稀疏的問題
function alphaCoverageFix(mat) {
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <alphatest_fragment>', `
      #ifdef USE_MAP
        vec2 dUV = fwidth(vMapUv) * vec2(512.0, 256.0);
        float mip = max(0.0, 0.5 * log2(max(dot(dUV, dUV), 1e-6)));
        diffuseColor.a *= 1.0 + mip * 0.28;
      #endif
      #include <alphatest_fragment>`);
  };
}

export function buildTreeAssets(renderer, tex) {
  const needles = needleTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: needles, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.92, metalness: 0,
  });
  alphaCoverageFix(leafMat);
  const barkMat = new THREE.MeshStandardMaterial({
    map: tex.pine_bark_Diffuse, normalMap: tex.pine_bark_nor_gl, roughness: 0.95,
  });
  const variants = [0, 1, 2].map((i) => {
    const leaves = pineGeometry(100 + i * 17, 0.28 + i * 0.06);
    const trunk = trunkGeometry();
    return { leaves, trunk };
  });

  // ---- 烘焙 impostor（側視，3 片交叉） ----
  const RT_W = 256, RT_H = 512;
  const rt = new THREE.WebGLRenderTarget(RT_W * 3, RT_H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a4535, 1.4));
  const dl = new THREE.DirectionalLight(0xfff2dd, 2.2); dl.position.set(0.6, 1, 0.8); sc.add(dl);
  const cam = new THREE.OrthographicCamera(-0.36, 0.36, 1.05, 0, 0.01, 10);
  cam.position.set(0, 0.5, 3); cam.lookAt(0, 0.5, 0);
  cam.top = 1.05; cam.bottom = -0.02; cam.updateProjectionMatrix();
  const prevTarget = renderer.getRenderTarget();
  const prevVP = renderer.getViewport(new THREE.Vector4());
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x2a3a22, 0); renderer.clear();
  variants.forEach((v, i) => {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(v.leaves, leafMat), new THREE.Mesh(v.trunk, barkMat));
    sc.add(grp);
    renderer.setViewport(i * RT_W, 0, RT_W, RT_H);
    renderer.setScissor(i * RT_W, 0, RT_W, RT_H); renderer.setScissorTest(true);
    renderer.render(sc, cam);
    sc.remove(grp);
  });
  renderer.setScissorTest(false);
  renderer.setRenderTarget(prevTarget);
  const sz = renderer.getSize(new THREE.Vector2());
  renderer.setViewport(0, 0, sz.x, sz.y); renderer.setScissor(0, 0, sz.x, sz.y);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;

  const impMat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  const impGeos = variants.map((_, i) => {
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(0.72, 1.07);
      p.translate(0, 0.515, 0);
      const uv = p.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + i) / 3);
      p.rotateY((k / 3) * Math.PI);
      // 法線朝上偏向，避免背光面全黑
      const n = p.attributes.normal; for (let j = 0; j < n.count; j++) n.setXYZ(j, n.getX(j) * 0.4, 0.9, n.getZ(j) * 0.4);
      parts.push(p);
    }
    return mergeGeometries(parts);
  });
  return { variants, leafMat, barkMat, impGeos, impMat };
}

// ---- 草叢 ----
export function buildGrassAssets() {
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const R = rng(9);
  for (let i = 0; i < 170; i++) {
    const x = 20 + R() * (W - 40), h = H * (0.35 + R() * 0.6), lean = (R() - 0.5) * 70;
    const dry = R() < 0.3;
    const sh = 50 + R() * 70;
    g.fillStyle = dry ? `rgb(${sh + 90 | 0},${sh + 70 | 0},${sh * 0.5 | 0})` : `rgb(${sh * 0.6 | 0},${sh + 30 | 0},${sh * 0.35 | 0})`;
    const w = 2 + R() * 3;
    g.beginPath(); g.moveTo(x - w, H); g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h); g.quadraticCurveTo(x + lean * 0.3 + 1, H - h * 0.6, x + w, H); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const p = new THREE.PlaneGeometry(1, 0.7); p.translate(0, 0.35, 0); p.rotateY((k / 3) * Math.PI);
    const n = p.attributes.normal; for (let j = 0; j < n.count; j++) n.setXYZ(j, 0, 1, 0);
    parts.push(p);
  }
  return { geo: mergeGeometries(parts), mat };
}

// ---- 分區塊 LOD 管理 ----
export class ChunkLOD {
  constructor() { this.chunks = []; }
  add(center, near, far, nearDist) { this.chunks.push({ center, near, far, nearDist }); }
  update(camPos) {
    for (const c of this.chunks) {
      const d = c.center.distanceTo(camPos);
      const isNear = d < c.nearDist;
      if (c.near) for (const m of c.near) m.visible = isNear;
      if (c.far) for (const m of c.far) m.visible = !isNear;
    }
  }
}
