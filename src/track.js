// 賽道資料：中心線取樣、投影查詢、地形高度場
import { buildCenterline, ROAD_HALF_WIDTH, RAIL_OFFSET } from './trackLayout.js';
import { makeNoise } from './noise.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Track {
  constructor() {
    const pts = buildCenterline(1);
    const n = pts.length;
    this.n = n;
    this.halfWidth = ROAD_HALF_WIDTH;
    this.railOffset = RAIL_OFFSET;
    this.px = new Float32Array(n); this.pz = new Float32Array(n);
    this.ph = new Float32Array(n); this.ps = new Float32Array(n);
    this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    this.nx = new Float32Array(n); this.nz = new Float32Array(n);
    this.slope = new Float32Array(n); this.curv = new Float32Array(n);
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      this.px[i] = p.x; this.pz[i] = p.z; this.ps[i] = p.s; raw[i] = p.h;
      this.tx[i] = Math.sin(p.yaw); this.tz[i] = Math.cos(p.yaw);
      this.nx[i] = Math.cos(p.yaw); this.nz[i] = -Math.sin(p.yaw);
    }
    // 高度平滑（避免坡度折角）
    const W = 18;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -W; k <= W; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); s += raw[j]; c++; }
      this.ph[i] = s / c;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      this.slope[i] = (this.ph[b] - this.ph[a]) / (this.ps[b] - this.ps[a]);
      const ya = Math.atan2(this.tx[a], this.tz[a]), yb = Math.atan2(this.tx[b], this.tz[b]);
      let dy = yb - ya; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      this.curv[i] = dy / (this.ps[b] - this.ps[a]);
    }
    this.length = this.ps[n - 1];
    this.startS = 14;
    this.finishS = this.length - 40;
    this.checkpoints = [0.25, 0.5, 0.75].map((f) => this.startS + (this.finishS - this.startS) * f);

    // 空間雜湊（20m 格）
    this.cell = 20;
    this.hash = new Map();
    for (let i = 0; i < n; i += 2) {
      const k = this._key(Math.floor(this.px[i] / this.cell), Math.floor(this.pz[i] / this.cell));
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(i);
    }
    this._buildTerrain();
  }

  _key(cx, cz) { return cx * 73856093 + cz * 19349663; }

  // 將點投影到中心線；hint>=0 時只搜尋附近
  project(x, z, hint = -1, win = 30) {
    const n = this.n;
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      const a = Math.max(0, hint - win), b = Math.min(n - 1, hint + win);
      for (let i = a; i <= b; i++) {
        const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    let i = best;
    let u = (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i];
    if (u < 0 && i > 0) { i--; u = (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i]; }
    const lat = (x - this.px[i]) * this.nx[i] + (z - this.pz[i]) * this.nz[i];
    return {
      i: best, s: this.ps[i] + u, lat,
      h: this.ph[i] + this.slope[i] * u, slope: this.slope[i],
      tx: this.tx[i], tz: this.tz[i], nx: this.nx[i], nz: this.nz[i],
    };
  }

  // 最近道路距離（地形/樹木用）
  nearestRoad(x, z, maxR = 60) {
    const c = this.cell, r = Math.ceil(maxR / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    let bd = maxR * maxR, bi = -1;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const list = this.hash.get(this._key(cx + a, cz + b));
      if (!list) continue;
      for (const i of list) {
        const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; bi = i; }
      }
    }
    return { d: Math.sqrt(bd), i: bi };
  }

  sampleAt(s) {
    const i = Math.min(this.n - 1, Math.max(0, Math.round(s)));
    return { x: this.px[i], z: this.pz[i], h: this.ph[i], yaw: Math.atan2(this.tx[i], this.tz[i]), i };
  }

  _buildTerrain() {
    const N = makeNoise(7);
    this.noise = N;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minx = Math.min(minx, this.px[i]); maxx = Math.max(maxx, this.px[i]);
      minz = Math.min(minz, this.pz[i]); maxz = Math.max(maxz, this.pz[i]);
    }
    const M = 520, step = 5;
    this.tMinX = Math.floor((minx - M) / step) * step;
    this.tMinZ = Math.floor((minz - M) / step) * step;
    this.tw = Math.ceil((maxx - minx + 2 * M) / step) + 1;
    this.th = Math.ceil((maxz - minz + 2 * M) / step) + 1;
    this.tStep = step;
    const H = new Float32Array(this.tw * this.th);
    const D = new Float32Array(this.tw * this.th);
    // IDW 來源：每 10m 取一點
    const src = [];
    for (let i = 0; i < this.n; i += 10) src.push(i);
    const sx = src.map((i) => this.px[i]), sz = src.map((i) => this.pz[i]), sh = src.map((i) => this.ph[i]);
    const hw = this.halfWidth;
    for (let gz = 0; gz < this.th; gz++) {
      for (let gx = 0; gx < this.tw; gx++) {
        const x = this.tMinX + gx * step, z = this.tMinZ + gz * step;
        let ws = 0, hs = 0;
        for (let k = 0; k < src.length; k++) {
          const dx = x - sx[k], dz = z - sz[k];
          const d2 = dx * dx + dz * dz + 25;
          const w = 1 / (d2 * d2);
          ws += w; hs += w * sh[k];
        }
        const hIdw = hs / ws;
        const nr = this.nearestRoad(x, z, 80);
        const d = nr.d;
        const hr = nr.i >= 0 ? this.ph[nr.i] : hIdw;
        let base = hr + (hIdw - hr) * smooth(hw + 2, hw + 34, d);
        const hills = N.fbm(x / 210, z / 210, 5) * 38 * smooth(hw + 10, hw + 140, d)
          + N.fbm(x / 45, z / 45, 3) * 4.5 * smooth(hw + 3, hw + 28, d)
          + smooth(60, 520, d) * (70 + N.fbm(x / 400, z / 400, 3) * 90);
        let hgt = base + hills;
        // 路面下方壓低，路肩過渡
        const t = smooth(hw + 1.0, hw + 5.5, d);
        hgt = (hr - 0.45) * (1 - t) + hgt * t;
        H[gz * this.tw + gx] = hgt;
        D[gz * this.tw + gx] = d;
      }
    }
    this.tH = H; this.tD = D;
  }

  terrainHeight(x, z) {
    const fx = (x - this.tMinX) / this.tStep, fz = (z - this.tMinZ) / this.tStep;
    const ix = Math.max(0, Math.min(this.tw - 2, Math.floor(fx)));
    const iz = Math.max(0, Math.min(this.th - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - ix)), v = Math.min(1, Math.max(0, fz - iz));
    const H = this.tH, w = this.tw;
    const a = H[iz * w + ix], b = H[iz * w + ix + 1], c = H[(iz + 1) * w + ix], d = H[(iz + 1) * w + ix + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
}
