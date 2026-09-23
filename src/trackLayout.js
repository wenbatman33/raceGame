// 秋名山風格下坡賽道：以「直線 / 圓弧」段落描述中心線（純資料，可在 node 驗證）
// deg 正值 = 左彎，負值 = 右彎
export const SEGMENTS = [
  { s: 150 },                       // 起點長直線
  { r: 140, deg: -28 },
  { s: 90 },
  { r: 70, deg: 62 },
  { s: 70 },
  { r: 48, deg: -85 },
  { s: 130 },
  { r: 160, deg: 22 },
  { s: 110 },
  { r: 16, deg: 172 },              // 第一個髮夾彎（左）
  { s: 120 },
  { r: 55, deg: -48 },
  { s: 60 },
  { r: 90, deg: 40 },
  { s: 140 },
  // ===== 五連髮夾 =====
  { r: 14, deg: -176 },
  { s: 95 },
  { r: 13, deg: 178 },
  { s: 85 },
  { r: 13, deg: -178 },
  { s: 90 },
  { r: 14, deg: 177 },
  { s: 95 },
  { r: 15, deg: -172 },
  // ===== 高速 S 彎區 =====
  { s: 120 },
  { r: 85, deg: 38 },
  { r: 85, deg: -42 },
  { r: 75, deg: 45 },
  { s: 180 },
  { r: 30, deg: -105 },
  { s: 90 },
  { r: 45, deg: 80 },
  { s: 110 },
  { r: 22, deg: -140 },             // 最後髮夾
  { s: 200 },                       // 終點直線
];

export const ROAD_HALF_WIDTH = 4.4;   // 路面半寬 (m)
export const RAIL_OFFSET = 5.3;       // 護欄距中心線 (m)

// 高度剖面：平均約 -6.5% 下坡，帶起伏
export function elevationAt(s, total) {
  const g = (u) => 0.062 + 0.022 * Math.sin(u / 260) + 0.012 * Math.sin(u / 83 + 1.3);
  // 數值積分（呼叫端會逐步累加，這裡回傳坡度）
  return -g(s);
}

// 取樣中心線：每 ds 公尺一點
export function buildCenterline(ds = 1) {
  const pts = [];
  let x = 0, z = 0, yaw = 0, h = 0, s = 0;
  const push = () => pts.push({ x, z, yaw, h, s });
  push();
  for (const seg of SEGMENTS) {
    if (seg.s) {
      const n = Math.max(1, Math.round(seg.s / ds));
      const d = seg.s / n;
      for (let i = 0; i < n; i++) {
        x += Math.sin(yaw) * d; z += Math.cos(yaw) * d;
        h += elevationAt(s) * d; s += d; push();
      }
    } else {
      const ang = (seg.deg * Math.PI) / 180;
      const len = Math.abs(ang) * seg.r;
      const n = Math.max(2, Math.round(len / ds));
      const d = len / n, dy = ang / n;
      for (let i = 0; i < n; i++) {
        // 中點法積分弧線
        const mid = yaw + dy / 2;
        x += Math.sin(mid) * d; z += Math.cos(mid) * d;
        yaw += dy; h += elevationAt(s) * d * 0.55; // 彎道坡度較緩
        s += d; push();
      }
    }
  }
  return pts;
}
