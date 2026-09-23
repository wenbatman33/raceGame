// 車輛物理：四輪合併滑移輪胎模型 + 重量轉移 + 後驅鎖定差速 + 引擎/變速箱
// 座標：車體 local +z = 前方，+x = 左方；世界 y 向上，yaw 為繞 +y 旋轉
import { PHYS, ARC } from './config.js';

const G = 9.81;
const RPM_PER_RAD = 60 / (2 * Math.PI);

// 引擎扭力曲線 [rpm, Nm]
const TORQUE = [
  [0, 120], [1000, 150], [2000, 182], [3000, 212], [4000, 236], [5000, 252],
  [6000, 262], [7000, 252], [7800, 232], [8400, 190], [9000, 120],
];
function engineTorque(rpm) {
  if (rpm <= TORQUE[0][0]) return TORQUE[0][1];
  for (let i = 1; i < TORQUE.length; i++) {
    if (rpm < TORQUE[i][0]) {
      const [r0, t0] = TORQUE[i - 1], [r1, t1] = TORQUE[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return TORQUE[TORQUE.length - 1][1];
}

// 正規化輪胎曲線：s=1 為峰值，之後衰減到 slideGrip
function tireCurve(s, slide, falloff) {
  if (s <= 1) return 1.5 * s - 0.5 * s * s * s;
  return slide + (1 - slide) * Math.exp(-(s - 1) * falloff);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export class Vehicle {
  constructor() {
    this.P = PHYS;
    this.wheels = [0, 1, 2, 3].map((i) => ({
      i, omega: 0, Fz: 0, Fx: 0, Fy: 0, sx: 0, alpha: 0, slip: 0,
      vxw: 0, vyw: 0, spin: 0, px: 0, pz: 0,
    }));
    this.auto = true;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.yawRate = 0;
    this.axS = 0; this.ayS = 0;
    this.rearOmega = 0;
    for (const w of this.wheels) { w.omega = 0; w.slip = 0; w.sx = 0; w.alpha = 0; }
    this.gear = 1; this.pendingGear = 1; this.shiftTimer = 0;
    this.rpm = this.P.idleRpm; this.rpmDisplay = this.rpm;
    this.limiter = 0; this.reverseHold = 0;
    this.steerAngle = 0;
    this.throttle = 0; this.brake = 0; this.handbrake = 0;
    this.impact = 0; this.scraping = false;
    this.trackIdx = -1;
    this.shiftEvent = 0;
    this.drifting = false; this.driftDir = 1; this.driftAng = 0; this.driftExit = 0; this.flipCd = 0; this.tc = 1;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get vLong() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get vLat() { return this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw); }
  // 甩尾角（度）：車頭與行進方向夾角
  get driftAngle() {
    const vl = this.vLong, vt = this.vLat;
    if (Math.hypot(vl, vt) < 2) return 0;
    return (Math.atan2(-vt, Math.abs(vl)) * 180) / Math.PI;
  }

  gearRatio(g = this.gear) {
    const P = this.P;
    if (g === 0) return 0;
    if (g < 0) return -P.reverseRatio * P.finalDrive;
    return P.gears[g - 1] * P.finalDrive;
  }

  shift(to) {
    const top = this.P.gears.length;
    to = clamp(to, -1, top);
    if (to === this.gear || this.shiftTimer > 0) return;
    this.pendingGear = to;
    this.gear = 0;
    this.shiftTimer = this.P.shiftTime;
    this.shiftEvent++;
  }

  // 每幀：變速箱邏輯（自排/手排、倒車）
  updateGearbox(dt, inp) {
    const P = this.P;
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) { this.gear = this.pendingGear; this.shiftTimer = 0; }
      return;
    }
    if (inp.shiftUp) this.shift(this.gear === -1 ? 1 : this.gear + 1);
    if (inp.shiftDown) this.shift(this.gear === 1 ? (Math.abs(this.vLong) < 2 ? -1 : 1) : this.gear - 1);
    if (!this.auto) return;
    const vl = this.vLong;
    if (this.gear >= 1) {
      const ratio = this.gearRatio();
      const speedRpm = (this.speed / P.wheelRadius) * ratio * RPM_PER_RAD;
      const drifting = Math.abs(this.driftAngle) > 12;
      this.limiterTime = this.limiter > 0 ? (this.limiterTime || 0) + dt : 0;
      if (drifting) {
        // 甩尾中維持檔位：只有持續撞轉速限制才升檔、轉速過低才降檔
        if (this.limiterTime > 0.35 && this.gear < P.gears.length) this.shift(this.gear + 1);
        else if (this.gear > 1 && this.rpm < 3000) this.shift(this.gear - 1);
      } else if (speedRpm > P.autoUpRpm && this.gear < P.gears.length) this.shift(this.gear + 1);
      else if (this.gear > 1) {
        const lowerRpm = speedRpm * (this.gearRatio(this.gear - 1) / ratio);
        if (speedRpm < P.autoDownRpm && lowerRpm < P.autoUpRpm - 700) this.shift(this.gear - 1);
      }
      // 停住後按住煞車 → 倒檔
      if (this.gear === 1 && vl < 0.6 && inp.brake > 0.5 && inp.throttle < 0.1) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.3) { this.gear = -1; this.reverseHold = 0; }
      } else this.reverseHold = 0;
    } else if (this.gear === -1) {
      if (inp.throttle > 0.3 && vl > -0.8) this.gear = 1;
    }
  }

  // 輪胎力（輪胎座標系）
  _tire(w, omega, Fz0avg) {
    const P = this.P;
    const mu = (w.i < 2 ? P.muFront : P.muRear) * (1 - P.loadSensitivity * (w.Fz / Fz0avg - 1));
    const vden = Math.max(Math.abs(w.vxw), P.vMinSlip);
    const sx = (omega * P.wheelRadius - w.vxw) / vden;
    const alpha = Math.atan2(w.vyw, vden);
    const nx = sx / P.sxPeak, ny = alpha / P.alphaPeak;
    const s = Math.hypot(nx, ny);
    if (s < 1e-9) return [0, 0, 0, sx, alpha];
    const F = mu * w.Fz * tireCurve(s, P.slideGrip, P.slideFalloff);
    // 力的方向：限制縱向滑移的主導程度，讓大量空轉時仍保有部分側向抓地（可控甩尾）
    const dx = clamp(nx, -P.spinCap, P.spinCap);
    const dn = Math.hypot(dx, ny);
    return [(F * dx) / dn, (-F * ny) / dn, s, sx, alpha];
  }

  // 物理子步進
  step(dt, inp, env) {
    const P = this.P, W = this.wheels;
    const m = P.mass, L = P.wheelbase, R = P.wheelRadius;
    const a = L * (1 - P.weightFront), b = L * P.weightFront, tw = P.track / 2, h = P.cgHeight;
    const Iz = m * (a * a + b * b) * 0.62 * P.inertiaScale;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const vLong = this.vx * sn + this.vz * cs;
    const vLat = this.vx * cs - this.vz * sn;
    const speed = Math.hypot(this.vx, this.vz);

    // 倒檔時油門/煞車對調（自排）
    let throttle = inp.throttle, brake = inp.brake;
    if (this.gear === -1 && this.auto) { throttle = inp.brake; brake = inp.throttle; }
    // 街機循跡控制：抓地行駛時限制後輪空轉
    if (ARC.enabled && !this.drifting) throttle *= this.tc;
    this.throttle = throttle; this.brake = brake; this.handbrake = inp.handbrake;

    // ---- 轉向：速度敏感 + 反打輔助（前輪自動對齊行進方向） ----
    const fwd = Math.max(0, vLong);
    const lock = P.maxSteer / (1 + (fwd / P.steerSpeedRef) ** 2);
    let betaF = 0;
    if (vLong > 1.5) betaF = Math.atan2(vLat + this.yawRate * a, vLong);
    const assist = P.countersteerAssist * clamp((vLong - 1.5) / 5, 0, 1);
    this.steerAngle = clamp(inp.steer * lock + assist * betaF, -P.maxSteer, P.maxSteer);

    // ---- 載重（含重量轉移、下壓力） ----
    const Fz0f = (m * G * P.weightFront) / 2, Fz0r = (m * G * (1 - P.weightFront)) / 2;
    const Fz0avg = (m * G) / 4;
    const down = (P.downforce * speed * speed) / 4;
    const dLong = (m * this.axS * h) / L;
    const dLat = (m * this.ayS * h) / P.track;
    W[0].Fz = Fz0f - dLong / 2 - dLat * P.rollFront + down;
    W[1].Fz = Fz0f - dLong / 2 + dLat * P.rollFront + down;
    W[2].Fz = Fz0r + dLong / 2 - dLat * (1 - P.rollFront) + down;
    W[3].Fz = Fz0r + dLong / 2 + dLat * (1 - P.rollFront) + down;

    const pos = [[tw, a], [-tw, a], [tw, -b], [-tw, -b]];
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      w.Fz = Math.max(30, w.Fz);
      w.px = pos[i][0]; w.pz = pos[i][1];
      const pvx = vLat + this.yawRate * w.pz;
      const pvz = vLong - this.yawRate * w.px;
      const d = i < 2 ? this.steerAngle : 0;
      const sd = Math.sin(d), cd = Math.cos(d);
      w.sd = sd; w.cd = cd;
      w.vxw = pvx * sd + pvz * cd;
      w.vyw = pvx * cd - pvz * sd;
    }

    // ---- 引擎 / 傳動 ----
    const ratio = this.gearRatio();
    let Tdrive = 0, Irear = 2.3;
    if (ratio !== 0) {
      const wheelRpm = Math.abs(this.rearOmega * ratio) * RPM_PER_RAD;
      const floorRpm = P.idleRpm + throttle * (P.launchRpm - P.idleRpm);
      let rpm = wheelRpm, slipping = false;
      if (rpm < floorRpm) { rpm = floorRpm; slipping = true; }
      this.rpm = rpm;
      if (rpm >= P.redline) this.limiter = 0.07;
      let Te = this.limiter > 0 ? 0 : engineTorque(rpm) * P.powerScale * throttle;
      Tdrive = Te * ratio * 0.9;
      if (!slipping) {
        const eb = P.engineBrake * (1 - throttle) * (rpm / P.redline) * Math.abs(ratio);
        Tdrive -= Math.sign(this.rearOmega) * eb;
      }
      Irear += P.engineInertia * ratio * ratio * (slipping ? 0.25 : 1);
    } else {
      // 空檔/換檔中：引擎自由轉動
      const target = P.idleRpm + throttle * (P.redline - P.idleRpm);
      this.rpm += (target - this.rpm) * Math.min(1, dt * (throttle > this.rpm / P.redline ? 9 : 3));
      if (this.rpm > P.redline) this.limiter = 0.07;
    }
    if (this.limiter > 0) this.limiter -= dt;

    // ---- 後軸（鎖定差速）隱式積分 ----
    const rearTorque = (om) => {
      const f2 = this._tire(W[2], om, Fz0avg)[0], f3 = this._tire(W[3], om, Fz0avg)[0];
      return Tdrive - R * (f2 + f3);
    };
    {
      const eps = 0.05;
      const t0 = rearTorque(this.rearOmega);
      const dT = Math.min(0, (rearTorque(this.rearOmega + eps) - t0) / eps);
      let om = this.rearOmega + (dt * t0) / (Irear - dt * dT);
      const Tb = brake * P.brakeTorque * (1 - P.brakeBias) + inp.handbrake * P.handbrakeTorque;
      const dOm = (Tb * dt) / Irear;
      om = om > 0 ? Math.max(0, om - dOm) : Math.min(0, om + dOm);
      this.rearOmega = om;
      W[2].omega = W[3].omega = om;
    }
    // ---- 前輪各自積分 ----
    for (let i = 0; i < 2; i++) {
      const w = W[i], I = 1.0, eps = 0.05;
      const t0 = -R * this._tire(w, w.omega, Fz0avg)[0];
      const dT = Math.min(0, (-R * this._tire(w, w.omega + eps, Fz0avg)[0] - t0) / eps);
      let om = w.omega + (dt * t0) / (I - dt * dT);
      const dOm = ((brake * P.brakeTorque * P.brakeBias) / 2) * dt / I;
      om = om > 0 ? Math.max(0, om - dOm) : Math.min(0, om + dOm);
      w.omega = om;
    }

    // ---- 最終輪胎力 → 車體 ----
    let FxL = 0, FzL = 0, Tq = 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const [fx, fy, s, sx, al] = this._tire(w, w.omega, Fz0avg);
      w.Fx = fx; w.Fy = fy; w.slip = s; w.sx = sx; w.alpha = al;
      const lx = fx * w.sd + fy * w.cd;
      const lz = fx * w.cd - fy * w.sd;
      FxL += lx; FzL += lz;
      Tq += w.pz * lx - w.px * lz;
      w.spin += w.omega * dt;
    }

    // 循跡控制狀態更新
    const rs = Math.max(W[2].sx, W[3].sx);
    this.tc = clamp(this.tc + (rs > ARC.tcSlip && speed > 1.5 ? -dt * 10 : dt * 3), 0.2, 1);
    // 街機甩尾：接管車體運動
    if (this._arcade(dt, inp, env, speed)) return;

    // 局部 → 世界
    let Fwx = FxL * cs + FzL * sn;
    let Fwz = -FxL * sn + FzL * cs;
    // 空氣阻力 + 滾動阻力
    Fwx -= (P.drag * speed + P.rolling) * this.vx;
    Fwz -= (P.drag * speed + P.rolling) * this.vz;
    // 坡度重力
    Fwx -= m * G * env.gx;
    Fwz -= m * G * env.gz;

    this.vx += (Fwx / m) * dt;
    this.vz += (Fwz / m) * dt;
    this.yawRate += (Tq / Iz) * dt;
    this.yaw += this.yawRate * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 重量轉移用加速度（低通模擬懸吊反應）
    const k = 1 - Math.exp(-dt / 0.075);
    this.axS += (FzL / m - this.axS) * k;
    this.ayS += (FxL / m - this.ayS) * k;
    this.Iz = Iz;
  }

  // ---- 街機甩尾：空白鍵 + 方向鍵進入，方向鍵控制角度與半徑 ----
  _arcade(dt, inp, env, speed) {
    const A = ARC, P = this.P;
    if (!A.enabled) { this.drifting = false; return false; }
    const velYaw = Math.atan2(this.vx, this.vz);
    const beta = angDiff(this.yaw, velYaw);
    const vLong = this.vLong;
    this.flipCd -= dt;
    if (!this.drifting) {
      if (inp.drift && Math.abs(inp.steer) > 0.15 && speed > A.minSpeed && vLong > 0) {
        this.drifting = true; this.driftDir = Math.sign(inp.steer); this.driftExit = 0;
        this.driftSpeed = speed; this.driftAng = Math.abs(beta); this.driftHold = 0;
      } else {
        // 防打轉：車尾滑出超過容許角度時自動拉回
        const dz = A.catchDeadzone * DEG;
        if (speed > 5 && Math.abs(beta) > dz) this.yawRate -= (beta - Math.sign(beta) * dz) * A.stability * 6 * dt;
        return false;
      }
    }
    // 空白鍵按住時反向壓到底 → 左右切換
    if (inp.drift && inp.steer * this.driftDir < -0.6 && this.flipCd <= 0) { this.driftDir = -this.driftDir; this.driftAng = -this.driftAng; this.flipCd = 0.6; }
    const d = this.driftDir;
    const si = clamp(inp.steer * d, -1, 1);
    const hold = inp.drift || si > 0.25;
    this.driftExit = hold ? 0 : this.driftExit + dt;
    if (this.driftExit > A.exitTime || speed < A.minSpeed * 0.6 || this.impact > 4) { this.drifting = false; this.yawRate *= 0.3; return false; }
    const fade = 1 - this.driftExit / A.exitTime;
    // 力道：按住空白鍵越久越大；放開後消退（方向鍵壓著時保留一點）
    if (inp.drift) this.driftHold = Math.min(A.holdTime, this.driftHold + dt);
    else {
      // 方向鍵壓著：力道最多保留到 holdKeep，不會往上補
      const floor = si > 0.25 ? Math.min(this.driftHold, A.holdKeep * A.holdTime) : 0;
      this.driftHold = Math.max(floor, this.driftHold - dt * A.holdDecay);
    }
    const power = A.holdTime > 0 ? this.driftHold / A.holdTime : 1;
    this.driftPower = power;
    const full = clamp(A.angle + si * A.angleRange, 8, 60);
    const target = (A.angleMin + (full - A.angleMin) * power) * DEG * fade;
    this.driftAng += (target - this.driftAng) * Math.min(1, dt * A.angleRate);
    // 力道小時路線較寬，力道大時依方向鍵收緊
    const Rsteer = A.radiusWide + (A.radiusTight - A.radiusWide) * (si + 1) / 2;
    const R = A.radiusWide * 1.3 + (Rsteer - A.radiusWide * 1.3) * power;
    const omegaPath = d * (speed / R) * fade;
    // 速度：油門補速、自然減速、煞車、坡度
    const slopeAcc = -9.81 * (env.gx * Math.sin(velYaw) + env.gz * Math.cos(velYaw));
    const acc = this.throttle * A.accel - A.decel - this.brake * A.brakeDecel + slopeAcc * 0.7 - (P.drag * speed * speed) / P.mass;
    let v = clamp(speed + acc * dt, 0, Math.min(this.driftSpeed + A.maxGain, 60));
    if (this.throttle < 0.1) this.driftSpeed = Math.min(this.driftSpeed, v + A.maxGain * 0.5);
    const nv = velYaw + omegaPath * dt;
    this.vx = Math.sin(nv) * v; this.vz = Math.cos(nv) * v;
    const err = angDiff(nv + d * this.driftAng, this.yaw);
    this.yawRate = omegaPath + clamp(err * A.yawK, -3.2, 3.2);
    this.yaw += this.yawRate * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // 視覺：後輪空轉冒煙、前輪順滾
    const R0 = P.wheelRadius;
    this.rearOmega += ((v * 1.35 + 3) / R0 - this.rearOmega) * Math.min(1, dt * 10);
    this.wheels[2].omega = this.wheels[3].omega = this.rearOmega;
    this.wheels[0].omega = this.wheels[1].omega = (v * Math.cos(this.driftAng)) / R0;
    const k = 1 - Math.exp(-dt / 0.1);
    this.axS += (acc - this.axS) * k;
    this.ayS += (d * v * Math.abs(omegaPath) * Math.cos(this.driftAng) - this.ayS) * k;
    return true;
  }

  // 護欄 / 端牆碰撞（以四個車角點對賽道橫向距離判定）
  collide(track, dt) {
    const P = this.P, m = P.mass, Iz = this.Iz || 2000;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const hw = P.halfWidth, fl = P.frontLen, rl = P.rearLen;
    const corners = [[hw, fl], [-hw, fl], [hw, -rl], [-hw, -rl], [hw, 0], [-hw, 0]];
    const limit = track.railOffset - 0.28;
    let impact = 0, scraping = false;
    for (const [lx, lz] of corners) {
      const rx = lx * cs + lz * sn, rz = -lx * sn + lz * cs;
      const q = track.project(this.x + rx, this.z + rz, this.trackIdx, 30);
      let nx = 0, nz = 0, pen = 0;
      if (Math.abs(q.lat) > limit) {
        pen = Math.abs(q.lat) - limit;
        const sg = -Math.sign(q.lat);
        nx = sg * q.nx; nz = sg * q.nz;
      } else if (q.s < 1.5) {
        pen = 1.5 - q.s; nx = q.tx; nz = q.tz;
      } else if (q.s > track.length - 1.5) {
        pen = q.s - (track.length - 1.5); nx = -q.tx; nz = -q.tz;
      }
      if (pen <= 0) continue;
      scraping = true;
      this.x += nx * pen; this.z += nz * pen;
      const vcx = this.vx + this.yawRate * rz, vcz = this.vz - this.yawRate * rx;
      const vn = vcx * nx + vcz * nz;
      if (vn >= 0) continue;
      const c = rz * nx - rx * nz;
      const j = (-(1 + P.wallRestitution) * vn) / (1 / m + (c * c) / Iz);
      this.vx += (j * nx) / m; this.vz += (j * nz) / m; this.yawRate += (c * j) / Iz;
      // 切向摩擦
      const tx = -nz, tz = nx;
      const vcx2 = this.vx + this.yawRate * rz, vcz2 = this.vz - this.yawRate * rx;
      const vt = vcx2 * tx + vcz2 * tz;
      const ct = rz * tx - rx * tz;
      let jt = -vt / (1 / m + (ct * ct) / Iz);
      jt = clamp(jt, -P.wallFriction * j, P.wallFriction * j);
      this.vx += (jt * tx) / m; this.vz += (jt * tz) / m; this.yawRate += (ct * jt) / Iz;
      impact = Math.max(impact, -vn);
    }
    this.impact = impact; this.scraping = scraping;
  }
}
