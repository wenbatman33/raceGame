// 素材載入：HDRI 天空、PBR 貼圖（Poly Haven CC0）、車模型（three.js 範例 Ferrari 458）
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CARS } from './config.js';

const TEX = [
  'asphalt_02_Diffuse', 'asphalt_02_nor_gl', 'asphalt_02_Rough',
  'aerial_grass_rock_Diffuse', 'aerial_grass_rock_nor_gl',
  'forest_ground_04_Diffuse', 'forest_ground_04_nor_gl',
  'rock_face_Diffuse', 'rock_face_nor_gl',
  'gravel_ground_01_Diffuse', 'gravel_ground_01_nor_gl',
  'pine_bark_Diffuse', 'pine_bark_nor_gl',
];

// 載入失敗自動重試（本機伺服器偶爾會掉連線）
async function retry(fn, name, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries - 1) throw new Error(`素材載入失敗：${name}`);
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

export async function loadAssets(renderer, onProgress) {
  const mgr = new THREE.LoadingManager();
  mgr.onProgress = (_u, loaded, total) => onProgress && onProgress(loaded / total);
  const tl = new THREE.TextureLoader(mgr);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = {};
  const jobs = TEX.map((name) => retry(() => tl.loadAsync(`assets/tex/${name}.jpg`), name).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, maxAniso);
    t.colorSpace = name.endsWith('Diffuse') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex[name] = t;
  }));
  const hdr = retry(() => new RGBELoader(mgr).setDataType(THREE.FloatType).loadAsync('assets/hdri/sky_2k.hdr'), 'sky_2k.hdr');
  const bg = retry(() => tl.loadAsync('assets/hdri/sky_bg.jpg'), 'sky_bg.jpg').then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4; return t;
  });
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  const gl = new GLTFLoader(mgr).setDRACOLoader(draco);
  const cars = {};
  const carJobs = CARS.map((c) => retry(() => gl.loadAsync(c.model), c.model).then((g) => { cars[c.id] = g; }));
  const [hdrTex, bgTex] = await Promise.all([hdr, bg, ...carJobs, ...jobs]);
  hdrTex.mapping = THREE.EquirectangularReflectionMapping;
  const sun = findSun(hdrTex);
  clampHDR(hdrTex, 6); // 移除太陽亮點：環境光只保留天空，太陽交給有陰影的平行光
  return { tex, hdr: hdrTex, bg: bgTex, cars, sun, horizon: horizonColor(hdrTex) };
}

// 從 HDR 找出最亮像素 → 太陽方向（three.js equirect 對應）
function findSun(t) {
  const { width: W, height: H, data } = t.image;
  let best = -1, bi = 0;
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    if (l > best) { best = l; bi = y * W + x; }
  }
  const x = bi % W, y = Math.floor(bi / W);
  const u = (x + 0.5) / W, v = 1 - (y + 0.5) / H;
  const lat = (v - 0.5) * Math.PI, lon = (u - 0.5) * 2 * Math.PI;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
}

// 地平線附近平均色 → 霧色
function horizonColor(t) {
  const { width: W, height: H, data } = t.image;
  const c = [0, 0, 0]; let n = 0;
  for (let y = Math.floor(H * 0.44); y < Math.floor(H * 0.48); y++) for (let x = 0; x < W; x += 4) {
    const i = (y * W + x) * 4; c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; n++;
  }
  return new THREE.Color(c[0] / n, c[1] / n, c[2] / n);
}

function clampHDR(t, maxL) {
  const d = t.image.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    if (l > maxL) { const k = maxL / l; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  }
  t.needsUpdate = true;
}
