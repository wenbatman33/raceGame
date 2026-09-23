// 所有可微調參數（DEV 工具會即時修改這些物件，匯出後再 bake 回這裡）

export const PHYS = {
  mass: 1380,            // 車重 kg
  inertiaScale: 1.0,     // 偏航慣量倍率
  wheelbase: 2.65,
  track: 1.66,
  cgHeight: 0.46,
  weightFront: 0.45,     // 前軸重量比例（中置引擎）
  rollFront: 0.55,       // 前軸側向重量轉移分配（越高越轉向不足）
  wheelRadius: 0.358,
  halfWidth: 0.96,       // 碰撞用車身半寬
  frontLen: 2.48,        // 重心到車頭
  rearLen: 1.95,         // 重心到車尾

  // 輪胎
  muFront: 1.12,
  muRear: 1.06,
  alphaPeak: 0.13,       // 側滑峰值角 (rad)
  sxPeak: 0.11,          // 縱向滑移峰值
  slideGrip: 0.80,       // 過峰值後剩餘抓地比例
  slideFalloff: 1.3,     // 抓地下降速度
  vMinSlip: 4.0,         // 低速滑移分母
  spinCap: 2.5,          // 空轉時力方向的縱向上限（越小越好控）
  loadSensitivity: 0.08, // 載重敏感度（越高重量轉移影響越明顯）

  // 動力
  powerScale: 1.55,
  finalDrive: 4.4,
  gears: [3.35, 2.15, 1.58, 1.24, 1.0, 0.84],
  reverseRatio: 3.2,
  idleRpm: 950,
  redline: 8200,
  launchRpm: 4200,
  engineInertia: 0.14,
  engineBrake: 55,
  shiftTime: 0.14,
  autoUpRpm: 7850,
  autoDownRpm: 4200,

  // 煞車
  brakeTorque: 5200,
  brakeBias: 0.66,
  handbrakeTorque: 3600,

  // 轉向
  maxSteer: 0.70,        // 最大轉向角 (rad)
  steerSpeedRef: 21,     // 速度敏感轉向參考速度 (m/s)
  steerRate: 3.6,        // 鍵盤轉向速度
  steerReturn: 6.0,
  countersteerAssist: 0.72, // 自動回正/反打輔助 0~1

  // 空力 / 阻力
  drag: 0.40,
  rolling: 11,
  downforce: 0.12,

  // 牆
  wallRestitution: 0.18,
  wallFriction: 0.35,
};

// 可選車輛：每台都是真實 glTF 模型。軸距/輪距/輪徑由模型自動量測後套進物理。
// hp 為原廠馬力（powerScale 1.0 ≈ 250 匹）；phys 只列出與 PHYS 預設不同的參數
// 新增車輛：把 glb 放進 assets/cars/，照格式加一筆（wheels 填模型內四個輪子節點名：左前、右前、左後、右後）
export const CARS = [
  { id: 'ae86', name: 'AE86 Trueno', hp: 130, kg: 950, desc: '秋名山之王，輕巧好甩', color: '#f4f4f2',
    // 原檔 94MB 經 scripts/slimGlb.py 瘦身（移除內裝、貼圖 2048）
    model: 'assets/cars/ae86_kouki.glb', length: 4.2,
    wheels: ['FL_Wheel', 'FR_Wheel', 'RL_Wheel', 'RR_Wheel'],
    steerParts: ['FL_Caliper', 'FR_Caliper', 'RL_Caliper', 'RR_Caliper'],
    hide: /Shadow/, glassOpacity: 0.88,
    credit: '「Toyota AE86 Black Limited Kouki」by TinoD2 / Martin Trafas (Sketchfab), CC-BY 4.0',
    phys: { mass: 950, weightFront: 0.53, cgHeight: 0.5, muFront: 1.04, muRear: 1.0, finalDrive: 4.3, maxSteer: 0.72, inertiaScale: 0.9 } },
  { id: 'v8', name: 'V8 中置超跑', hp: 390, kg: 1380, desc: '最快，油門要收著踩', color: '#f4f4f2',
    model: 'assets/car/ferrari.glb', draco: true, rotY: Math.PI, wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    paint: /^(body|blue|yellow_trim|centre.*)$/, tail: /^lights_red$/, head: /^lights$/,
    credit: 'Ferrari 458 model: three.js examples',
    phys: { mass: 1380, weightFront: 0.45, cgHeight: 0.46, muFront: 1.12, muRear: 1.06, finalDrive: 4.4 } },
];

// 動力等級：套在原廠馬力上
export const POWER_LEVELS = [
  { id: 'entry', label: '入門', k: 0.6 },
  { id: 'sport', label: '運動', k: 0.8 },
  { id: 'full', label: '原廠', k: 1.0 },
];

// 街機甩尾（空白鍵 + 方向鍵）
export const ARC = {
  enabled: true,         // true = 街機模式，false = 純模擬（空白鍵 = 手煞車）
  angle: 30,             // 按滿力道時的基本甩尾角 (度)
  angleRange: 12,        // 方向鍵可增減的角度
  angleRate: 3.5,        // 角度追隨速度
  angleMin: 10,          // 輕點空白鍵的甩尾角 (度)
  holdTime: 1.0,         // 按住多久達到最大力道 (s)
  holdDecay: 1.2,        // 放開後力道消退速度
  holdKeep: 0.3,         // 放開空白鍵但方向鍵壓著時保留的力道
  radiusTight: 12,       // 往彎內壓時的甩尾半徑 (m)
  radiusWide: 42,        // 反打時的甩尾半徑 (m)
  accel: 3.0,            // 甩尾中油門加速 m/s²
  decel: 1.0,            // 甩尾中自然減速 m/s²
  brakeDecel: 8,         // 甩尾中煞車減速 m/s²
  maxGain: 3,            // 甩尾中最多比進入速度快多少 m/s
  yawK: 7,               // 車頭角度修正強度
  exitTime: 0.35,        // 放開後回正時間 (s)
  minSpeed: 8,           // 可進入甩尾的最低速度 m/s
  stability: 3,          // 抓地時防打轉輔助
  catchDeadzone: 7,      // 防打轉介入角度 (度)
  tcSlip: 0.15,          // 循跡控制容許空轉
};

export const CAM = {
  distance: 6.8,
  height: 2.0,
  lookAhead: 2.6,
  lookHeight: 0.85,
  yawFollow: 5.5,        // 鏡頭偏航跟隨速度
  velocityFollow: 0.55,  // 甩尾時鏡頭跟隨速度方向比例
  posStiffness: 14,
  fovBase: 62,
  fovSpeed: 0.22,        // 每 m/s 增加的 FOV
  shake: 0.6,
};

export const VIS = {
  carColor: '#f4f4f2',
  bodyRoll: 0.030,       // 每 m/s² 車身側傾
  bodyPitch: 0.012,
  smokeAmount: 0.5,
  sunElevation: 22,
  sunAzimuth: 0,         // 天空 HDRI 旋轉角度
  fogDensity: 0.0011,
  exposure: 0.85,
  ao: true,              // 環境光遮蔽
  bloom: 0.25,
  quality: 'medium',     // low / medium / high
  dynamicRes: false,     // 掉幀時自動降解析度（預設關閉：鎖 30fps 的環境會被誤判而變糊）
  night: false,
};

export const DRIFT = {
  minAngle: 12,          // 度
  minSpeed: 8,           // m/s
  pointsRate: 0.22,
  multStep: 1.0,         // 每秒連續甩尾倍率增加
  multMax: 5,
  chainGrace: 1.6,       // 秒，中斷後可接續
  driftColor: '#ffe600',
};

// HUD 版面：x,y 為畫面比例（元素中心），scale 為縮放
export const LAYOUT_PC = {
  timer:   { x: 0.085, y: 0.075, scale: 1 },
  drift:   { x: 0.50,  y: 0.13,  scale: 1 },
  speedo:  { x: 0.885, y: 0.80,  scale: 1 },
  minimap: { x: 0.105, y: 0.79,  scale: 1 },
  hint:    { x: 0.50,  y: 0.965, scale: 1 },
};

export const LAYOUT_MOBILE = {
  timer:   { x: 0.16, y: 0.07, scale: 0.75 },
  drift:   { x: 0.50, y: 0.16, scale: 0.8 },
  speedo:  { x: 0.85, y: 0.18, scale: 0.6 },
  minimap: { x: 0.14, y: 0.25, scale: 0.6 },
  hint:    { x: 0.50, y: 0.97, scale: 0.7 },
};

export const DEFAULTS = JSON.parse(JSON.stringify({ PHYS, ARC, CAM, VIS, DRIFT, LAYOUT_PC, LAYOUT_MOBILE }));
