// 車模型：three.js 範例 Ferrari 458（Draco glTF），車頭轉向 +z，並對齊物理軸距
import * as THREE from 'three';
import { PHYS, VIS } from './config.js';

export function buildCar(gltf, aoTex) {
  const P = PHYS;
  const a = P.wheelbase * (1 - P.weightFront);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const model = gltf.scene.children[0].clone(true);
  model.rotation.y = Math.PI;                 // 原模型車頭朝 -z
  const holder = new THREE.Group();
  holder.add(model);
  holder.position.z = a - 1.155;              // 前軸對齊物理前軸
  body.add(holder);

  // ---- 材質 ----
  const paint = new THREE.MeshPhysicalMaterial({
    color: VIS.carColor, metalness: 0.6, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x111418, metalness: 0.2, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.9, roughness: 0.28 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a10, emissiveIntensity: 0.3, roughness: 0.25 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff3dd, emissiveIntensity: 0, roughness: 0.1, metalness: 0.2 });
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const n = o.name;
    if (n === 'body') o.material = paint;
    else if (n === 'glass') o.material = glass;
    else if (n.startsWith('rim_')) o.material = rimMat;
    else if (n === 'lights_red') o.material = tailMat;
    else if (n === 'lights') o.material = headMat;
    else if (n === 'blue' || n === 'yellow_trim' || n.startsWith('centre')) o.material = paint; // 去掉廠徽色塊
  });

  // 接觸陰影（AO 貼片）
  const ao = new THREE.Mesh(
    new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: aoTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true, depthWrite: false }),
  );
  ao.position.set(0, 0.01, holder.position.z);
  ao.renderOrder = 2;
  root.add(ao);

  // ---- 輪子：取模型中的輪子節點，轉向用 YXZ 順序 ----
  const names = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
  const wheels = names.map((n) => {
    const w = model.getObjectByName(n);
    w.rotation.order = 'YXZ';
    return { pivot: w, spin: w, baseY: w.position.y };
  });

  // ---- 大燈（夜間） ----
  const lights = [];
  for (const s of [1, -1]) {
    const L = new THREE.SpotLight(0xfff1d8, 0, 140, 0.42, 0.45, 1.2);
    L.position.set(0.65 * s, 0.7, a + 1.0);
    L.target.position.set(0.9 * s, -1.2, a + 24);
    body.add(L, L.target);
    lights.push(L);
  }

  return {
    root, body, wheels, paint, tailMat, headMat, lights, flipSpin: -1,
    setColor(hex) { paint.color.set(hex); },
    setNight(on) { for (const L of lights) L.intensity = on ? 120 : 0; headMat.emissiveIntensity = on ? 3 : 0; },
  };
}
