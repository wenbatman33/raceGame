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
  smokeAmount: 1.0,
  sunElevation: 22,
  sunAzimuth: 0,         // 天空 HDRI 旋轉角度
  fogDensity: 0.0011,
  exposure: 0.85,
  ao: true,              // 環境光遮蔽
  bloom: 0.25,
  pixelRatio: 1.5,
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

export const DEFAULTS = JSON.parse(JSON.stringify({ PHYS, CAM, VIS, DRIFT, LAYOUT_PC, LAYOUT_MOBILE }));
