// 通用車模型：載入任意 glTF 車，自動量測軸距/輪距/輪徑，重新掛上轉向與輪轉軸心
// 物理座標：車頭 +z、左邊 +x；重心在原點，前軸位於 z = a
import * as THREE from 'three';
import { VIS } from './config.js';

function blobShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let blobTex = null;

const test = (re, ...names) => !!re && names.some((n) => n && re.test(n));

// 把「四輪合併成一個」的網格依四個角落拆開（車體座標：+z 前、+x 左）
// 回傳 [左前, 右前, 左後, 右後] 四個新網格，原網格移除
function splitByCorner(mesh, cx, cz) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const m = mesh.matrixWorld, v = new THREE.Vector3();
  const buckets = [[], [], [], []];
  for (let t = 0; t < triCount; t++) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, vi(t, k)).applyMatrix4(m); x += v.x; z += v.z; }
    x /= 3; z /= 3;
    buckets[(z > cz ? 0 : 2) + (x > cx ? 0 : 1)].push(t);
  }
  const out = buckets.map((tris, q) => {
    const ng = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const n = a.itemSize, arr = new Float32Array(tris.length * 3 * n);
      let o = 0;
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const i = vi(t, k);
        arr[o++] = a.getX(i); if (n > 1) arr[o++] = a.getY(i); if (n > 2) arr[o++] = a.getZ(i); if (n > 3) arr[o++] = a.getW(i);
      }
      ng.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    const nm = new THREE.Mesh(ng, mesh.material);
    nm.name = `${mesh.name}_${['FL', 'FR', 'RL', 'RR'][q]}`;
    nm.position.copy(mesh.position); nm.quaternion.copy(mesh.quaternion); nm.scale.copy(mesh.scale);
    nm.castShadow = nm.receiveShadow = true;
    mesh.parent.add(nm);
    return nm;
  });
  mesh.parent.remove(mesh);
  return out;
}

export function buildCar(def, gltf) {
  const root = new THREE.Group();
  const body = new THREE.Group();   // 車身（側傾/俯仰）
  root.add(body);
  const holder = new THREE.Group();
  holder.rotation.y = def.rotY || 0;
  body.add(holder);
  const model = gltf.scene.clone(true);
  holder.add(model);
  // 依真實車長自動縮放（Sketchfab 模型比例常常不對）
  if (def.length) {
    holder.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(holder, true);
    holder.scale.setScalar(def.length / (b0.max.z - b0.min.z));
  }

  // ---- 材質 ----
  const paint = new THREE.MeshPhysicalMaterial({ color: VIS.carColor, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a10, emissiveIntensity: 0.3, roughness: 0.25 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff3dd, emissiveIntensity: 0, roughness: 0.1, metalness: 0.2 });
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mn = o.material && o.material.name, n = o.name;
    if (test(def.paint, n, mn)) o.material = paint;
    else if (test(def.clearcoat, n, mn)) {
      // 保留原貼圖，加上亮漆層
      const p = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(p, o.material);
      p.clearcoat = 1; p.clearcoatRoughness = 0.05; p.roughness = Math.min(p.roughness, 0.45);
      o.material = p;
    }
    else if (test(def.tail, n, mn)) o.material = tailMat;
    else if (test(def.head, n, mn)) o.material = headMat;
    else if (test(def.hide, n, mn)) o.visible = false;
    // transmission 玻璃會觸發整個場景額外渲染一次，改為一般半透明
    else if (o.material && o.material.transmission > 0) {
      const m = o.material.clone(); m.transmission = 0; m.transparent = true; m.opacity = def.glassOpacity ?? 0.35; m.depthWrite = false; o.material = m;
    }
  });

  // ---- 輪子：以包圍盒中心為軸心，重新掛到 轉向群組 → 旋轉群組 ----
  root.updateMatrixWorld(true);
  const wheels = [];
  const centers = [];
  let radius = 0;
  // 輪子來源：(1) 各角指定節點名  (2) 合併網格依角落拆開
  const find = (name) => { const o = model.getObjectByName(name); if (!o) throw new Error(`車模型找不到節點：${name}`); return o; };
  let corners, staticCorners = [[], [], [], []];
  if (def.splitWheels) {
    const merged = def.splitWheels.map(find);
    const ub = new THREE.Box3(); for (const o of merged) ub.expandByObject(o, true);
    const ucx = (ub.min.x + ub.max.x) / 2, ucz = (ub.min.z + ub.max.z) / 2;
    corners = [[], [], [], []];
    for (const o of merged) splitByCorner(o, ucx, ucz).forEach((p, q) => corners[q].push(p));
    for (const name of def.splitStatic || []) splitByCorner(find(name), ucx, ucz).forEach((p, q) => staticCorners[q].push(p));
    root.updateMatrixWorld(true);
  } else {
    corners = def.wheels.map((e) => (Array.isArray(e) ? e : [e]).map(find));
    if (def.steerParts) staticCorners = def.steerParts.map((e) => (Array.isArray(e) ? e : [e]).map(find));
  }
  for (let q = 0; q < 4; q++) {
    const nodes = corners[q];
    const b = new THREE.Box3();
    for (const o of nodes) b.expandByObject(o, true);
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    radius += Math.max(s.y, s.z) / 2 / 4;
    const steer = new THREE.Group(); steer.position.copy(c); root.add(steer); // 輪子不跟車身側傾
    const spin = new THREE.Group(); steer.add(spin);
    steer.updateMatrixWorld(true);
    for (const o of staticCorners[q]) steer.attach(o); // 煞車等：跟著轉向但不旋轉
    for (const node of nodes) {
      spin.attach(node);
      // 煞車卡鉗等不旋轉的零件：改掛在轉向群組
      if (def.noSpin) {
        const keep = [];
        node.traverse((o) => { if (o !== node && test(def.noSpin, o.name)) keep.push(o); });
        for (const o of keep) steer.attach(o);
      }
    }
    wheels.push({ pivot: steer, spin, base: c.clone() });
    centers.push(c);
  }
  if (def.radius) radius = def.radius;
  const zf = (centers[0].z + centers[1].z) / 2, zr = (centers[2].z + centers[3].z) / 2;
  const wheelbase = zf - zr;
  const track = Math.abs(centers[0].x - centers[1].x);
  const cy = centers.reduce((s, c) => s + c.y, 0) / 4;
  const cx = centers.reduce((s, c) => s + c.x, 0) / 4; // 左右置中
  const box = new THREE.Box3().setFromObject(holder, true);
  const dims = {
    wheelbase, track, wheelRadius: radius,
    halfWidth: Math.min(1.0, (box.max.x - box.min.x) / 2 - 0.05),
    frontOver: box.max.z - zf, rearOver: zr - box.min.z,
  };

  // 接觸陰影
  blobTex = blobTex || blobShadowTexture();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.track + 0.9, box.max.z - box.min.z + 0.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.8 }),
  );
  blob.renderOrder = 2; root.add(blob);

  // ---- 大燈（夜間） ----
  const lights = [];
  for (const s of [1, -1]) {
    const L = new THREE.SpotLight(0xfff1d8, 0, 140, 0.42, 0.45, 1.2);
    L.position.set(0.65 * s, 0.7, box.max.z - 0.4);
    L.target.position.set(0.9 * s, -1.2, box.max.z + 22);
    body.add(L, L.target);
    lights.push(L);
  }

  // 對齊：輪底貼地、前軸位於 z = a
  const align = (a) => {
    const dz = a - zf, dy = radius - cy, dx = -cx;
    holder.position.set(dx, dy, dz);
    for (const w of wheels) { w.pivot.position.set(w.base.x + dx, w.base.y + dy, w.base.z + dz); w.baseY = w.base.y + dy; }
    blob.position.set(0, 0.02, (box.max.z + box.min.z) / 2 + dz);
    lights.forEach((L, i) => { const s = i ? -1 : 1; L.position.set(0.65 * s, 0.7, box.max.z - 0.4 + dz); L.target.position.set(0.9 * s, -1.2, box.max.z + 22 + dz); });
  };

  return {
    root, body, wheels, paint, tailMat, headMat, lights, dims, align,
    setColor(hex) { paint.color.set(hex); },
    setNight(on) { for (const L of lights) L.intensity = on ? 120 : 0; headMat.emissiveIntensity = on ? 3 : 0; },
  };
}
