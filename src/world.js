// 靜態場景：PBR 路面 + 標線、路肩、W 型護欄、混合材質地形、杉木林、草叢、電線桿、標誌
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTreeAssets, buildGrassAssets, ChunkLOD } from './vegetation.js';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function chevronTexture(dir) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd400'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#111';
    g.save(); g.translate(w / 2, h / 2); if (dir < 0) g.scale(-1, 1);
    for (const o of [-22, 18]) {
      g.beginPath(); g.moveTo(o - 14, -40); g.lineTo(o + 12, 0); g.lineTo(o - 14, 40); g.lineTo(o - 32, 40); g.lineTo(o - 6, 0); g.lineTo(o - 32, -40); g.closePath(); g.fill();
    }
    g.restore();
  }, false);
}

function bannerTexture(text, sub, bg = '#b3121b') {
  return canvasTex(1024, 192, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(0, 10, w, 6); g.fillRect(0, h - 16, w, 6);
    g.font = 'italic 900 100px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 - (sub ? 14 : 0));
    if (sub) { g.font = 'bold 30px Arial'; g.fillText(sub, w / 2, h - 42); }
  }, false);
}

// 沿中心線建立帶狀網格：offsets = [[lateral, dy], ...] 橫向剖面
function ribbon(track, profile, vScale, from = 0, to = track.n - 1, stride = 1, uvFn = null) {
  const cols = profile.length;
  const pos = [], uv = [], idx = [];
  let rows = 0;
  for (let i = from; i <= to; i += stride) {
    for (let c = 0; c < cols; c++) {
      const [lat, dy, u] = profile[c];
      pos.push(track.px[i] + track.nx[i] * lat, track.ph[i] + dy, track.pz[i] + track.nz[i] * lat);
      if (uvFn) uv.push(...uvFn(lat, track.ps[i], c)); else uv.push(u, track.ps[i] / vScale);
    }
    rows++;
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 標線疊層貼圖：橫向 = 路寬，縱向 = 24m（白色邊線、中央虛線、輪跡磨損）
function markingsTexture(halfW) {
  const R = rand(3);
  const t = canvasTex(512, 2048, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const m2px = w / (halfW * 2);
    // 輪跡：較暗、較平滑
    for (const off of [-2.95, -1.35, 1.35, 2.95]) {
      const cx = w / 2 + off * m2px;
      const grd = g.createLinearGradient(cx - 0.5 * m2px, 0, cx + 0.5 * m2px, 0);
      grd.addColorStop(0, 'rgba(12,12,14,0)'); grd.addColorStop(0.5, 'rgba(12,12,14,0.32)'); grd.addColorStop(1, 'rgba(12,12,14,0)');
      g.fillStyle = grd; g.fillRect(cx - 0.5 * m2px, 0, m2px, h);
    }
    const line = (x, y, lw, lh) => {
      g.fillStyle = 'rgba(232,232,224,0.9)'; g.fillRect(x, y, lw, lh);
      // 磨損：細小柔和斑點（用 destination-out 降低透明度）
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < lw * lh * 0.012; i++) {
        g.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.35})`;
        g.beginPath(); g.arc(x + R() * lw, y + R() * lh, 0.6 + R() * 1.6, 0, 7); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    };
    const lw = 0.15 * m2px, edge = 0.3 * m2px;
    line(edge, 0, lw, h); line(w - edge - lw, 0, lw, h);
    // 中央虛線：5m 線 + 7m 間隔，24m 內兩段
    line(w / 2 - lw / 2, 0, lw, h * (5 / 24)); line(w / 2 - lw / 2, h * (12 / 24), lw, h * (5 / 24));
  });
  return t;
}

export function buildWorld(scene, track, assets) {
  const hw = track.halfWidth, ro = track.railOffset;
  const tex = assets.tex;
  const group = new THREE.Group();
  scene.add(group);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  // ---- PBR 路面 ----
  const RS = 3.2; // 柏油貼圖實際尺寸 (m)
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.asphalt_02_Diffuse, normalMap: tex.asphalt_02_nor_gl, roughnessMap: tex.asphalt_02_Rough,
    color: 0x9a9a9a, roughness: 1, normalScale: new THREE.Vector2(0.9, 0.9),
  });
  const road = new THREE.Mesh(ribbon(track, [[hw + 0.05, 0.02], [0, 0.035], [-hw - 0.05, 0.02]], 1, 0, track.n - 1, 1, (lat, s) => [lat / RS, s / RS]), roadMat);
  road.receiveShadow = true; group.add(road);
  // 標線疊層
  const markMat = new THREE.MeshStandardMaterial({
    map: markingsTexture(hw), transparent: true, depthWrite: false, roughness: 0.55,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const marks = new THREE.Mesh(ribbon(track, [[hw, 0.022, 0], [0, 0.037, 0.5], [-hw, 0.022, 1]], 24), markMat);
  marks.receiveShadow = true; marks.renderOrder = 1; group.add(marks);

  // ---- 路肩碎石 ----
  const grMat = new THREE.MeshStandardMaterial({ map: tex.gravel_ground_01_Diffuse, normalMap: tex.gravel_ground_01_nor_gl, roughness: 1, color: 0xb0a898 });
  for (const side of [1, -1]) {
    const prof = side > 0
      ? [[hw + 3.2, -0.42], [hw + 1.2, -0.08], [hw, 0.015]]
      : [[-hw, 0.015], [-hw - 1.2, -0.08], [-hw - 3.2, -0.42]];
    const m = new THREE.Mesh(ribbon(track, prof, 1, 0, track.n - 1, 1, (lat, s) => [lat / 2.6, s / 2.6]), grMat);
    m.receiveShadow = true; group.add(m);
  }

  // ---- W 型護欄 ----
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc4cad0, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide });
  const wProfile = [[0, 0.40], [-0.06, 0.45], [-0.075, 0.52], [-0.02, 0.585], [-0.075, 0.65], [-0.06, 0.72], [0, 0.77]];
  for (const side of [1, -1]) {
    const prof = wProfile.map(([dl, y]) => [(ro - dl) * side, y]);
    if (side < 0) prof.reverse();
    const m = new THREE.Mesh(ribbon(track, prof, 4), railMat);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  const postGeo = new THREE.BoxGeometry(0.1, 0.95, 0.14); postGeo.translate(0, 0.3, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8d9398, metalness: 0.7, roughness: 0.5 });
  const nPost = Math.floor(track.n / 4) * 2 + 2;
  const posts = new THREE.InstancedMesh(postGeo, postMat, nPost);
  let k = 0;
  for (let i = 0; i < track.n; i += 4) {
    for (const side of [1, -1]) {
      const o = (ro + 0.09) * side;
      P.set(track.px[i] + track.nx[i] * o, track.ph[i], track.pz[i] + track.nz[i] * o);
      Q.setFromAxisAngle(UP, Math.atan2(track.tx[i], track.tz[i]));
      M4.compose(P, Q, S); posts.setMatrixAt(k++, M4);
    }
  }
  posts.count = k; posts.castShadow = true; posts.receiveShadow = true; group.add(posts);

  // ---- 地形（四層材質混合） ----
  const tw = track.tw, th = track.th, st = track.tStep;
  const N = track.noise;
  const tpos = new Float32Array(tw * th * 3), tuv = new Float32Array(tw * th * 2);
  for (let z = 0; z < th; z++) for (let x = 0; x < tw; x++) {
    const i = z * tw + x;
    const wx = track.tMinX + x * st, wz = track.tMinZ + z * st;
    tpos[i * 3] = wx; tpos[i * 3 + 1] = track.tH[i]; tpos[i * 3 + 2] = wz;
    tuv[i * 2] = wx / 14; tuv[i * 2 + 1] = wz / 14;
  }
  const tidx = new Uint32Array((tw - 1) * (th - 1) * 6);
  let q = 0;
  for (let z = 0; z < th - 1; z++) for (let x = 0; x < tw - 1; x++) {
    const a = z * tw + x, b = a + 1, c = a + tw, d = c + 1;
    tidx[q++] = a; tidx[q++] = c; tidx[q++] = b; tidx[q++] = b; tidx[q++] = c; tidx[q++] = d;
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  tgeo.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  tgeo.setIndex(new THREE.BufferAttribute(tidx, 1));
  tgeo.computeVertexNormals();
  const nrm = tgeo.attributes.normal;
  const splat = new Float32Array(tw * th * 4), tcol = new Float32Array(tw * th * 3);
  const forestAt = (x, z) => N.fbm(x / 110, z / 110, 3);
  for (let i = 0; i < tw * th; i++) {
    const wx = tpos[i * 3], wz = tpos[i * 3 + 2], ny = nrm.getY(i), d = track.tD[i];
    let rock = Math.min(1, Math.max(0, (0.84 - ny) * 5));
    let gravel = Math.max(0, 1 - Math.max(0, d - hw - 2.5) / 2.5);
    let forest = Math.min(1, Math.max(0, (forestAt(wx, wz) + 0.2) * 2.2)) * Math.min(1, Math.max(0, (d - hw - 6) / 10));
    forest = Math.max(forest, Math.max(0, N.fbm(wx / 23, wz / 23, 2)) * 0.6);
    let grass = 1;
    // 疊加：rock > gravel > forest > grass
    const w = [grass, forest, rock, gravel];
    w[0] = (1 - forest); w[1] = forest;
    for (let j = 0; j < 2; j++) w[j] *= (1 - rock);
    w[2] = rock;
    for (let j = 0; j < 3; j++) w[j] *= (1 - gravel);
    w[3] = gravel;
    const sum = w[0] + w[1] + w[2] + w[3] || 1;
    for (let j = 0; j < 4; j++) splat[i * 4 + j] = w[j] / sum;
    const v = 0.88 + N.fbm(wx / 37 + 9, wz / 37, 3) * 0.28;
    tcol[i * 3] = v * (1.02 + N.noise2(wx / 90, wz / 90) * 0.08); tcol[i * 3 + 1] = v; tcol[i * 3 + 2] = v * 0.95;
  }
  tgeo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const terrainMat = new THREE.MeshStandardMaterial({
    map: tex.aerial_grass_rock_Diffuse, normalMap: tex.aerial_grass_rock_nor_gl, vertexColors: true, roughness: 0.96,
  });
  terrainMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tF: { value: tex.forest_ground_04_Diffuse }, tFN: { value: tex.forest_ground_04_nor_gl },
      tR: { value: tex.rock_face_Diffuse }, tRN: { value: tex.rock_face_nor_gl },
      tV: { value: tex.gravel_ground_01_Diffuse }, tVN: { value: tex.gravel_ground_01_nor_gl },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tF, tFN, tR, tRN, tV, tVN; varying vec4 vSplat; varying vec3 vWP;
        vec2 rockUV() { return vec2(vWP.x + vWP.z, vWP.y * 1.3) / 9.0; }`)
      .replace('#include <map_fragment>', `
        vec2 wuv = vWP.xz;
        vec4 cG = mix(texture2D(map, wuv / 16.0), texture2D(map, wuv / 61.0 + 0.37), 0.45);
        cG.rgb *= vec3(0.78, 0.92, 0.62);
        vec4 cF = mix(texture2D(tF, wuv / 4.2), texture2D(tF, wuv / 15.0 + 0.21), 0.35);
        vec4 cR = texture2D(tR, rockUV());
        vec4 cV = texture2D(tV, wuv / 3.0);
        diffuseColor *= cG * vSplat.x + cF * vSplat.y + cR * vSplat.z + cV * vSplat.w;`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
        vec3 mapN = (texture2D(normalMap, wuv / 16.0).xyz * vSplat.x + texture2D(tFN, wuv / 4.2).xyz * vSplat.y
          + texture2D(tRN, rockUV()).xyz * vSplat.z + texture2D(tVN, wuv / 3.0).xyz * vSplat.w) * 2.0 - 1.0;`);
  };
  const terrain = new THREE.Mesh(tgeo, terrainMat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // ---- 遠山剪影（霧色系，不受霧影響） ----
  {
    const cx = track.tMinX + (tw * st) / 2, cz = track.tMinZ + (th * st) / 2;
    const seg = 200, rings = 6;
    const pos = [], cols = [], idx = [];
    const haze = assets.horizon.clone().multiplyScalar(0.85), deep = new THREE.Color(0.10, 0.15, 0.11);
    for (let r = 0; r < rings; r++) {
      const rad = 1700 + r * 600;
      for (let s2 = 0; s2 <= seg; s2++) {
        const a = (s2 / seg) * Math.PI * 2;
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        const hgt = r === 0 ? -80 : (N.fbm(Math.cos(a) * 3 + r, Math.sin(a) * 3, 5) * 0.5 + 0.55) * (280 + r * 90) - 60;
        pos.push(x, hgt, z);
        const c = deep.clone().lerp(haze, Math.min(1, 0.45 + r * 0.11)); cols.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < rings - 1; r++) for (let s2 = 0; s2 < seg; s2++) {
      const a = r * (seg + 1) + s2, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    const far = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    group.add(far);
    group.userData.far = far;
  }

  // ---- 杉木林（近景卡片、遠景 impostor，160m 分區塊） ----
  const lod = new ChunkLOD();
  const trees = buildTreeAssets(assets.renderer, tex);
  const R = rand(99);
  const placed = [];
  const tryTree = (x, z) => {
    const nr = track.nearestRoad(x, z, 14);
    if (nr.d < hw + 6.5) return;
    if (forestAt(x, z) < -0.32) return; // 空地
    placed.push([x, track.terrainHeight(x, z), z]);
  };
  for (let t = 0; t < 22000; t++) {
    const i = Math.floor(R() * track.n);
    const side = R() < 0.5 ? 1 : -1;
    const d = hw + 6.5 + 260 * R() * R();
    const along = (R() - 0.5) * 6;
    tryTree(track.px[i] + track.nx[i] * d * side + track.tx[i] * along, track.pz[i] + track.nz[i] * d * side + track.tz[i] * along);
  }
  for (let t = 0; t < 2500; t++) tryTree(track.tMinX + R() * tw * st, track.tMinZ + R() * th * st);
  const CH = 160;
  const chunks = new Map();
  placed.forEach((p) => {
    const key = Math.floor(p[0] / CH) + ',' + Math.floor(p[2] / CH);
    if (!chunks.has(key)) chunks.set(key, [[], [], []]);
    chunks.get(key)[Math.floor(R() * 3)].push(p);
  });
  const tint = new THREE.Color();
  for (const [key, lists] of chunks) {
    const [cxk, czk] = key.split(',').map(Number);
    const center = new THREE.Vector3((cxk + 0.5) * CH, 0, (czk + 0.5) * CH);
    let cy = 0, cn = 0;
    const near = [], far = [];
    lists.forEach((list, vi) => {
      if (!list.length) return;
      const v = trees.variants[vi];
      const leaves = new THREE.InstancedMesh(v.leaves, trees.leafMat, list.length);
      const trunk = new THREE.InstancedMesh(v.trunk, trees.barkMat, list.length);
      const imp = new THREE.InstancedMesh(trees.impGeos[vi], trees.impMat, list.length);
      list.forEach((p, j) => {
        const H = 11 + R() * 13;
        const wScale = H * (0.62 + R() * 0.2);
        S.set(wScale, H, wScale);
        Q.setFromAxisAngle(UP, R() * 6.28);
        P.set(p[0], p[1] - 0.3, p[2]);
        M4.compose(P, Q, S);
        leaves.setMatrixAt(j, M4); trunk.setMatrixAt(j, M4); imp.setMatrixAt(j, M4);
        tint.setHSL(0.24 + R() * 0.06, 0.2 + R() * 0.25, 0.78 + R() * 0.22);
        leaves.setColorAt(j, tint); imp.setColorAt(j, tint);
        cy += p[1]; cn++;
      });
      for (const m of [leaves, trunk, imp]) { m.computeBoundingSphere(); m.castShadow = true; m.receiveShadow = m !== imp; group.add(m); }
      near.push(leaves, trunk); far.push(imp);
    });
    center.y = cy / Math.max(1, cn);
    lod.add(center, near, far, 'tree');
  }
  S.set(1, 1, 1);

  // ---- 草叢（路肩外側） ----
  const grass = buildGrassAssets();
  const gpts = [];
  for (let i = 0; i < track.n; i += 1) {
    for (const side of [1, -1]) {
      if (R() < 0.25) continue;
      const d = hw + 2.6 + Math.pow(R(), 1.6) * 16;
      const x = track.px[i] + track.nx[i] * d * side + (R() - 0.5), z = track.pz[i] + track.nz[i] * d * side + (R() - 0.5);
      if (track.nearestRoad(x, z, 8).d < hw + 2.3) continue;
      gpts.push([x, track.terrainHeight(x, z), z]);
    }
  }
  const gch = new Map();
  for (const p of gpts) { const key = Math.floor(p[0] / 80) + ',' + Math.floor(p[2] / 80); if (!gch.has(key)) gch.set(key, []); gch.get(key).push(p); }
  for (const [key, list] of gch) {
    const [a, b] = key.split(',').map(Number);
    const m = new THREE.InstancedMesh(grass.geo, grass.mat, list.length);
    list.forEach((p, j) => {
      const s = 0.7 + R() * 0.9;
      S.set(s * (1 + R() * 0.6), s * (0.8 + R() * 0.6), s * (1 + R() * 0.6));
      Q.setFromAxisAngle(UP, R() * 6.28); P.set(p[0], p[1] - 0.05, p[2]);
      M4.compose(P, Q, S); m.setMatrixAt(j, M4);
      tint.setHSL(0.18 + R() * 0.08, 0.35 + R() * 0.3, 0.55 + R() * 0.4); m.setColorAt(j, tint);
    });
    m.computeBoundingSphere(); m.receiveShadow = true; group.add(m);
    lod.add(new THREE.Vector3((a + 0.5) * 80, list[0][1], (b + 0.5) * 80), [m], null, 'grass');
  }
  S.set(1, 1, 1);
  group.userData.lod = lod;

  // ---- 電線桿（直線段一側） ----
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.13, 0.17, 9, 6).translate(0, 4.5, 0),
    new THREE.BoxGeometry(1.6, 0.12, 0.12).translate(0, 8.4, 0),
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 0.9 });
  const polePts = [];
  let lastS = -99;
  for (let i = 30; i < track.n - 30; i++) {
    if (track.ps[i] - lastS < 38) continue;
    let straight = true;
    for (let k = -22; k <= 22; k += 2) if (Math.abs(track.curv[i + k]) > 1 / 160) { straight = false; break; }
    if (!straight) continue;
    const o = -(ro + 2.2);
    const x = track.px[i] + track.nx[i] * o, z = track.pz[i] + track.nz[i] * o;
    if (track.nearestRoad(x, z, 10).d < ro + 1.8) continue;
    polePts.push({ x, z, y: track.terrainHeight(x, z), yaw: Math.atan2(track.tx[i], track.tz[i]), s: track.ps[i] });
    lastS = track.ps[i];
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, polePts.length);
  polePts.forEach((p, j) => { P.set(p.x, p.y - 0.3, p.z); Q.setFromAxisAngle(UP, p.yaw + Math.PI / 2); M4.compose(P, Q, S); poles.setMatrixAt(j, M4); });
  poles.castShadow = true; group.add(poles);
  const wirePts = [];
  for (let j = 0; j < polePts.length - 1; j++) {
    const a = polePts[j], b = polePts[j + 1];
    if (b.s - a.s > 50) continue;
    for (const off of [-0.7, 0.7]) {
      const ax = a.x + Math.cos(a.yaw) * off, az = a.z - Math.sin(a.yaw) * off;
      const bx = b.x + Math.cos(b.yaw) * off, bz = b.z - Math.sin(b.yaw) * off;
      for (let t = 0; t < 10; t++) {
        for (const tt of [t / 10, (t + 1) / 10]) {
          const y = a.y + (b.y - a.y) * tt + 8.4 - 0.3 - Math.sin(tt * Math.PI) * 0.9;
          wirePts.push(ax + (bx - ax) * tt, y + 0.05, az + (bz - az) * tt);
        }
      }
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1b1b1b })));

  // ---- 彎道箭頭標誌 ----
  const chevL = new THREE.MeshStandardMaterial({ map: chevronTexture(1), roughness: 0.6 });
  const chevR = new THREE.MeshStandardMaterial({ map: chevronTexture(-1), roughness: 0.6 });
  const signGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.3, 5);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
  let lastSign = -99;
  for (let i = 0; i < track.n; i++) {
    const k2 = track.curv[i];
    if (Math.abs(k2) < 1 / 34 || track.ps[i] - lastSign < 9) continue;
    lastSign = track.ps[i];
    const o = -Math.sign(k2) * (ro + 0.55);
    const x = track.px[i] + track.nx[i] * o, z = track.pz[i] + track.nz[i] * o;
    const sign = new THREE.Mesh(signGeo, k2 > 0 ? chevL : chevR);
    const yaw = Math.atan2(track.tx[i], track.tz[i]) + Math.PI; // 面向來車
    sign.position.set(x, track.ph[i] + 1.55, z); sign.rotation.y = yaw; sign.castShadow = true;
    const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x, track.ph[i] + 0.65, z);
    group.add(sign, leg);
  }

  // ---- 起終點拱門 / 端牆 ----
  const arch = (s, text, sub, color) => {
    const sm = track.sampleAt(s);
    const g = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.4, roughness: 0.5 });
    for (const side of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), pm);
      p.position.set((ro + 0.6) * side, 2.8, 0); p.castShadow = true; g.add(p);
    }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2 * ro + 1.2, 2.2), new THREE.MeshBasicMaterial({ map: bannerTexture(text, sub, color), side: THREE.DoubleSide }));
    b.position.set(0, 5.2, 0); b.rotation.y = Math.PI; g.add(b);
    g.position.set(sm.x, sm.h, sm.z); g.rotation.y = sm.yaw;
    group.add(g);
    // 地面格紋線
    const chk = canvasTex(256, 32, (c, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#eee'; c.fillRect(x * 16, y * 16, 16, 16); } }, false);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 1.1), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    line.rotation.x = -Math.PI / 2; line.position.set(sm.x, sm.h + 0.045, sm.z);
    line.rotation.z = sm.yaw; line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, sm.yaw, 0, 'YXZ');
    group.add(line);
  };
  arch(track.startS + 6, 'AKINA', 'DOWNHILL · START', '#b3121b');
  arch(track.finishS, 'GOAL', 'AKINA DOWNHILL', '#101820');
  for (const s of [0.6, track.length - 0.6]) {
    const sm = track.sampleAt(s);
    const tex = canvasTex(256, 32, (c, w, h) => { for (let x = 0; x < 16; x++) { c.fillStyle = x % 2 ? '#d11' : '#fff'; c.fillRect(x * 16, 0, 16, h); } }, false);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2 * ro + 0.6, 1.0, 0.5), new THREE.MeshStandardMaterial({ map: tex }));
    wall.position.set(sm.x, sm.h + 0.5, sm.z); wall.rotation.y = sm.yaw; wall.castShadow = true;
    group.add(wall);
  }

  return { group, far: group.userData.far, lod: group.userData.lod };
}
