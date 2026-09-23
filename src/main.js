// 主程式：場景、遊戲迴圈、鏡頭、計時與甩尾計分
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';
import { loadAssets } from './assets.js';
import { PHYS, CAM, VIS, DRIFT } from './config.js';
import { Track } from './track.js';
import { buildWorld } from './world.js';
import { buildCar } from './carModel.js';
import { Vehicle } from './vehicle.js';
import { Particles, SkidMarks } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD, fmtTime } from './hud.js';
import { Input } from './input.js';
import { DevPanel, loadSaved } from './dev.js';

const PHYS_DT = 1 / 600;
// 畫質預設：pr=像素比上限、shadow=陰影貼圖、range=陰影範圍(m)、tree/grass=高細節距離(m)
const PRESETS = {
  low:    { label: '低', pr: 0.85, ao: false, bloom: false, smaa: false, shadow: 1024, range: 35, tree: 110, grass: 60,  treeShadow: false },
  medium: { label: '中', pr: 1.0,  ao: false, bloom: true,  smaa: true,  shadow: 2048, range: 45, tree: 160, grass: 100, treeShadow: true },
  high:   { label: '高', pr: 1.5,  ao: true,  bloom: true,  smaa: true,  shadow: 4096, range: 60, tree: 230, grass: 150, treeShadow: true },
};
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// 調色 + 暗角（顯示空間）
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, sat: { value: 1.08 }, contrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette, sat, contrast; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      c.rgb = mix(vec3(l), c.rgb, sat);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb *= vec3(1.02, 1.0, 0.97);
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vignette * dot(d, d) * 1.6;
      gl_FragColor = c;
    }`,
};

class Game {
  async init() {
    const savedTune = loadSaved();
    // ---- 渲染器 ----
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    $('app').appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM.fovBase, innerWidth / innerHeight, 0.1, 9000);

    // ---- 素材 ----
    const bar = $('loadBar');
    const assets = await loadAssets(r, (f) => { if (bar) bar.style.width = (f * 100).toFixed(0) + '%'; });
    assets.renderer = r;
    this.assets = assets;
    $('loadText').textContent = '建構山路與森林…';
    await new Promise((res) => setTimeout(res, 30));

    // ---- 天空 / 光（HDRI） ----
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envRT = this.pmrem.fromEquirectangular(assets.hdr);
    this.hemi = new THREE.HemisphereLight(0x4060a0, 0x101010, 0); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1de, 3.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05; sc.updateProjectionMatrix();
    this.scene.add(sun, sun.target);
    this.sun = sun; this.sunDir = new THREE.Vector3();
    this.scene.fog = new THREE.FogExp2(0xb8c6d4, VIS.fogDensity);

    // ---- 世界 ----
    this.track = new Track();
    this.world = buildWorld(this.scene, this.track, assets);
    this.carView = buildCar(assets.car, assets.carAO);
    this.scene.add(this.carView.root);
    this.car = new Vehicle();
    this.smoke = new Particles(this.scene, 2200, { color: 0xe4e4e4, drag: 1.4, gravity: 0.35 });
    this.sparks = new Particles(this.scene, 300, { additive: true, color: 0xffa040, drag: 0.5, gravity: -9 });
    this.skids = new SkidMarks(this.scene, 5000);
    this.audio = new GameAudio();
    this.hud = new HUD($('hud'), this.track);
    this.input = new Input((a) => this.action(a));
    this.dev = new DevPanel(this);
    if (savedTune) console.info('[DEV] 已載入本機儲存的微調參數');

    // 觸控按鈕
    if (matchMedia('(pointer: coarse)').matches) {
      document.body.classList.add('touch');
      for (const [id, key] of [['tcL', 'left'], ['tcR', 'right'], ['tcGas', 'gas'], ['tcBrake', 'brake'], ['tcHand', 'hand']]) this.input.bindTouch($(id), key);
    }

    // ---- 狀態 ----
    this.state = 'title';
    this.camMode = 0;
    this.camYaw = 0; this.camPos = new THREE.Vector3(); this.camInit = false;
    this.shake = 0;
    this.drift = { chain: 0, mult: 1, time: 0, idle: 0, total: 0 };
    this.best = parseFloat(localStorage.getItem('akina_best')) || null;
    this.bestSplits = JSON.parse(localStorage.getItem('akina_splits') || 'null');
    this.acc = 0;
    this.impactCd = 0;
    // ---- 後製 ----
    const composer = new EffectComposer(r, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType }));
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.aoPass = new N8AOPass(this.scene, this.camera, innerWidth, innerHeight);
    Object.assign(this.aoPass.configuration, { aoRadius: 3.0, distanceFalloff: 1.5, intensity: 2.6, gammaCorrection: false, halfRes: true });
    this.aoPass.setQualityMode('Medium');
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.25, 0.5, 0.92);
    composer.addPass(this.renderPass); composer.addPass(this.aoPass); composer.addPass(this.bloomPass);
    composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(GradeShader); composer.addPass(this.gradePass);
    this.smaaPass = new SMAAPass(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio()); composer.addPass(this.smaaPass);
    this.composer = composer;
    addEventListener('resize', () => {
      r.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); this.resScale = 1; this.applyPixelRatio();
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    });

    this.applyVisuals();
    this.restart(false);

    $('startBtn').onclick = () => this.begin();
    $('muteBtn').onclick = (e) => { e.currentTarget.blur(); this.action('mute'); };
    $('qualityBtn').onclick = (e) => { e.currentTarget.blur(); this.action('quality'); };
    this.resScale = 1; this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.applyQuality();
    addEventListener('keydown', (e) => { if (this.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) this.begin(); });
    this.last = performance.now();
    r.setAnimationLoop(() => this.frame());
    $('loading').classList.add('hide');
  }

  // ---------- 視覺參數套用 ----------
  applyVisuals() {
    const r = this.renderer, night = VIS.night, A = this.assets;
    r.toneMappingExposure = VIS.exposure * (night ? 1.3 : 1);
    const rot = THREE.MathUtils.degToRad(VIS.sunAzimuth);
    this.scene.backgroundRotation.set(0, rot, 0);
    this.scene.environmentRotation.set(0, rot, 0);
    this.sunDir.copy(A.sun).applyAxisAngle(new THREE.Vector3(0, 1, 0), -rot);
    if (night) {
      this.scene.background = new THREE.Color(0x02040a);
      this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = 0.04;
      this.scene.fog.color.set(0x04060c);
      this.sun.color.set(0x8fa6ff); this.sun.intensity = 0.18;
      this.hemi.intensity = 0.1;
    } else {
      this.scene.background = A.bg; this.scene.backgroundIntensity = 1.0;
      this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = 1.0;
      this.scene.fog.color.copy(A.horizon).multiplyScalar(0.9);
      this.sun.color.set(0xfff1de); this.sun.intensity = 3.4;
      this.hemi.intensity = 0;
    }
    this.scene.fog.density = VIS.fogDensity;
    if (this.world?.far) this.world.far.visible = !night;
    if (this.bloomPass) this.bloomPass.strength = VIS.bloom * (night ? 2 : 1);
    if (this.world?.lod && this.composer) this.applyQuality();
    this.carView.setColor(VIS.carColor);
    this.carView.setNight(night);
    this.smoke.mat.uniforms.color.value.set(night ? 0x3a3d44 : 0xe8e8e8);
  }

  // ---------- 畫質 ----------
  get preset() { return PRESETS[VIS.quality] || PRESETS.medium; }

  applyPixelRatio() {
    const pr = Math.min(devicePixelRatio, this.preset.pr) * this.resScale;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
  }

  applyQuality() {
    const q = this.preset;
    const ao = q.ao && VIS.ao;
    this.aoPass.enabled = ao; this.renderPass.enabled = !ao;
    this.bloomPass.enabled = q.bloom && VIS.bloom > 0;
    this.smaaPass.enabled = q.smaa;
    // 全部後製都關閉時直接渲染，省掉整條後製管線
    this.bypassPost = !ao && !this.bloomPass.enabled && !q.smaa;
    const sun = this.sun;
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    const c = sun.shadow.camera; c.left = c.bottom = -q.range; c.right = c.top = q.range; c.updateProjectionMatrix();
    this.world.lod.dist.tree = q.tree; this.world.lod.dist.grass = q.grass;
    this.world.lod.setTreeShadow(q.treeShadow);
    this.resScale = 1; this.applyPixelRatio();
    $('qualityBtn').textContent = '畫質 ' + q.label;
  }

  // 動態解析度：每秒檢查平均幀時間，掉幀就降解析度，順暢時慢慢回升
  updateDynamicRes(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc < 1) return;
    this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
    if (!VIS.dynamicRes || this.state === 'title') return;
    let s = this.resScale;
    if (this.fps < 45) s = Math.max(0.7, s - 0.1);
    else if (this.fps > 57 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.resScale) { this.resScale = s; this.applyPixelRatio(); }
  }

  // ---------- 流程 ----------
  begin() {
    if (this.state !== 'title') return;
    this.audio.start();
    $('title').classList.add('hide');
    this.startCountdown();
  }

  restart(countdown = true) {
    const t = this.track, sm = t.sampleAt(t.startS);
    this.car.reset(sm.x, sm.z, sm.yaw);
    this.car.trackIdx = sm.i;
    this.time = 0; this.progress = 0; this.splits = []; this.nextCp = 0; this.splitText = '';
    this.drift = { chain: 0, mult: 1, time: 0, idle: 0, total: 0 };
    this.skids.clear();
    this.camInit = false;
    this.showFinish(false);
    if (countdown && this.state !== 'title') this.startCountdown();
  }

  startCountdown() {
    if (this.state === 'title') { $('title').classList.add('hide'); this.audio.start(); }
    this.state = 'countdown'; this.countT = 3.2;
    this.time = 0;
  }

  teleport(s) {
    const sm = this.track.sampleAt(s);
    this.car.reset(sm.x, sm.z, sm.yaw); this.car.trackIdx = sm.i;
    const v = 14; this.car.vx = Math.sin(sm.yaw) * v; this.car.vz = Math.cos(sm.yaw) * v;
    this.car.rearOmega = v / PHYS.wheelRadius; for (const w of this.car.wheels) w.omega = v / PHYS.wheelRadius;
    this.car.gear = 2;
    this.camInit = false;
    if (this.state !== 'racing') this.state = 'free';
  }

  resetToRoad() {
    const q = this.track.project(this.car.x, this.car.z, this.car.trackIdx, 60);
    const sm = this.track.sampleAt(Math.max(this.track.startS, q.s));
    const keep = { gear: 1 };
    this.car.reset(sm.x, sm.z, sm.yaw); this.car.trackIdx = sm.i; this.car.gear = keep.gear;
    this.drift.chain = 0; this.drift.mult = 1; this.drift.time = 0;
    this.camInit = false;
  }

  showFinish(on) {
    const el = $('finish');
    if (!on) { el.classList.add('hide'); return; }
    const t = this.state === 'finished' ? this.time : (this.time || 123.456);
    $('fTime').textContent = fmtTime(t);
    $('fBest').textContent = fmtTime(this.best);
    $('fDrift').textContent = Math.floor(this.drift.total).toLocaleString();
    $('fNew').style.display = this._newRecord ? 'block' : 'none';
    el.classList.remove('hide');
  }

  action(a) {
    switch (a) {
      case 'toggleTrans': this.car.auto = !this.car.auto; this.flash(this.car.auto ? '自排 AT' : '手排 MT（E / Q 換檔）'); break;
      case 'camera': this.camMode = (this.camMode + 1) % 4; this.camInit = false; break;
      case 'reset': if (this.state !== 'title') this.resetToRoad(); break;
      case 'restart': if (this.state !== 'title') this.restart(true); break;
      case 'night': VIS.night = !VIS.night; this.applyVisuals(); this.dev.save(); break;
      case 'mute': {
        const m = this.audio.toggleMute();
        if (!m && this.state !== 'title') this.audio.start();
        $('muteBtn').textContent = m ? '🔇' : '🔊';
        this.flash(m ? '靜音' : '音效開啟'); break;
      }
      case 'help': $('help').classList.toggle('hide'); break;
      case 'quality': {
        const order = ['low', 'medium', 'high'];
        VIS.quality = order[(order.indexOf(VIS.quality) + 1) % 3];
        this.applyQuality(); this.dev.save(); this.flash('畫質：' + this.preset.label); break;
      }
      case 'dev': this.dev.toggle(); break;
      case 'pause': if (!$('help').classList.contains('hide')) $('help').classList.add('hide'); else this.dev.toggle(false); break;
    }
  }

  flash(msg) {
    const el = $('flash'); el.textContent = msg;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  debugDrift() {
    this.drift.chain = 1234; this.drift.mult = 3.5; this.drift.idle = 0; this.drift.time = 2.5;
    this._debugDriftHold = 2.5;
  }
  debugCrash() { this.hud.bank('CRASH', '#ff3b3b'); this.shake = 1; this.audio.impact(12); }

  // ---------- 每幀 ----------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const inp = this.input.update(dt);
    const car = this.car;

    // 倒數：鎖車但可轟油
    let drive = { steer: inp.steer, throttle: inp.throttle, brake: inp.brake, handbrake: inp.handbrake };
    if (this.state === 'title' || this.state === 'countdown') drive = { steer: inp.steer, throttle: this.state === 'title' ? 0 : inp.throttle, brake: 1, handbrake: 1 };
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.countT);
      this.countT -= dt;
      const c = Math.ceil(this.countT);
      const el = $('count');
      if (this.countT > 0) { el.textContent = c; if (c !== prev) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.audio.burst(0.12, 1200, 6, 0.3, 'bandpass'); } }
      else { this.state = 'racing'; el.textContent = 'GO!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.audio.burst(0.3, 1600, 6, 0.4, 'bandpass'); setTimeout(() => (el.textContent = ''), 900); }
    }

    // ---- 物理 ----
    const locked = this.state === 'title' || this.state === 'countdown';
    car.updateGearbox(dt, { ...drive, brake: locked ? 0 : drive.brake, shiftUp: inp.shiftUp, shiftDown: inp.shiftDown });
    this.acc += dt;
    let maxImpact = 0, scraping = false;
    const env = { gx: 0, gz: 0 };
    let steps = 0;
    while (this.acc >= PHYS_DT && steps < 60) {
      const q = this.track.project(car.x, car.z, car.trackIdx, 8);
      car.trackIdx = q.i;
      env.gx = q.slope * q.tx; env.gz = q.slope * q.tz;
      car.step(PHYS_DT, drive, env);
      car.collide(this.track, PHYS_DT);
      maxImpact = Math.max(maxImpact, car.impact); scraping = scraping || car.scraping;
      this.acc -= PHYS_DT; steps++;
    }
    if (steps >= 60) this.acc = 0;
    car.scraping = scraping;
    car.rpmDisplay += (car.rpm - car.rpmDisplay) * Math.min(1, dt * 22);
    if (car.shiftEvent !== this._lastShift) { this._lastShift = car.shiftEvent; if (car.rpm > 5000) this.audio.shiftPop(); }

    const q = this.track.project(car.x, car.z, car.trackIdx, 8);

    // ---- 撞擊 ----
    this.impactCd -= dt;
    if (maxImpact > 2.2 && this.impactCd <= 0) {
      this.audio.impact(maxImpact); this.shake = Math.min(1.2, maxImpact * 0.08); this.impactCd = 0.25;
      if (this.drift.chain > 0 && maxImpact > 3.5) { this.hud.bank('CRASH', '#ff3b3b'); this.drift.chain = 0; this.drift.mult = 1; this.drift.time = 0; }
    }

    // ---- 計時 / 分段 ----
    if (this.state === 'racing') {
      this.time += dt;
      const t = this.track;
      this.progress = (q.s - t.startS) / (t.finishS - t.startS);
      if (this.nextCp < t.checkpoints.length && q.s > t.checkpoints[this.nextCp]) {
        this.splits.push(this.time);
        const b = this.bestSplits?.[this.nextCp];
        const d = b != null ? this.time - b : null;
        this.splitText = `S${this.nextCp + 1} ${fmtTime(this.time)}` + (d != null ? ` <i class="${d <= 0 ? 'g' : 'r'}">${d <= 0 ? '' : '+'}${d.toFixed(2)}</i>` : '');
        this.nextCp++;
      }
      if (q.s > t.finishS) this.finishRace();
    } else if (this.state !== 'finished') this.progress = (q.s - this.track.startS) / (this.track.finishS - this.track.startS);

    this.updateDrift(dt, maxImpact);
    this.updateCarVisual(q, dt);
    this.updateEffects(dt, q);
    this.updateCamera(dt, q);
    this.audio.update(dt, car, Math.max(car.wheels[2].slip, car.wheels[3].slip), Math.max(car.wheels[0].slip, car.wheels[1].slip));

    // 太陽陰影跟車
    const cp = this.carView.root.position;
    this.sun.position.copy(cp).addScaledVector(this.sunDir, 160);
    this.sun.target.position.copy(cp);

    const hints = { title: '', countdown: '', racing: '', finished: '按 <b>T</b> 重新開始', free: '自由練習 · 按 <b>T</b> 從起點計時' };
    this.hud.update({
      car, time: this.state === 'title' ? 0 : this.time, best: this.best, progress: this.progress,
      splitText: this.splitText, drift: this.drift,
      hint: hints[this.state] ?? '',
    });
    this.dev.updateTelemetry(car);
    this.world.lod.update(this.camera.position);
    if (this.bypassPost) this.renderer.render(this.scene, this.camera); else this.composer.render();
    this.updateDynamicRes(dt);
  }

  finishRace() {
    this.state = 'finished';
    // 結算前把甩尾連段入帳
    if (this.drift.chain > 0) { this.drift.total += this.drift.chain * this.drift.mult; this.drift.chain = 0; }
    this._newRecord = false;
    if (this.best == null || this.time < this.best) {
      this.best = this.time; this._newRecord = true;
      try { localStorage.setItem('akina_best', String(this.time)); localStorage.setItem('akina_splits', JSON.stringify(this.splits)); } catch {}
      this.bestSplits = this.splits.slice();
    }
    this.showFinish(true);
  }

  updateDrift(dt, impact) {
    const d = this.drift, car = this.car;
    if (this._debugDriftHold > 0) { this._debugDriftHold -= dt; return; }
    const ang = Math.abs(car.driftAngle), spd = car.speed;
    const active = this.state !== 'title' && this.state !== 'countdown' && ang > DRIFT.minAngle && ang < 110 && spd > DRIFT.minSpeed && car.vLong > 0;
    if (active) {
      d.time += dt; d.idle = 0;
      d.mult = Math.min(DRIFT.multMax, 1 + d.time * DRIFT.multStep);
      d.chain += ang * spd * DRIFT.pointsRate * dt;
    } else if (d.chain > 0) {
      d.idle += dt;
      if (d.idle > DRIFT.chainGrace) {
        const pts = Math.floor(d.chain * d.mult);
        d.total += pts;
        this.hud.bank('+' + pts.toLocaleString(), DRIFT.driftColor);
        d.chain = 0; d.mult = 1; d.time = 0;
      }
    }
  }

  updateCarVisual(q, dt) {
    const car = this.car, v = this.carView;
    const root = v.root;
    root.position.set(car.x, q.h, car.z);
    const n = new THREE.Vector3(-q.slope * q.tx, 1, -q.slope * q.tz).normalize();
    const qTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
    root.quaternion.copy(qTilt).multiply(qYaw);
    v.body.rotation.z = clamp(car.ayS * VIS.bodyRoll, -0.1, 0.1);
    v.body.rotation.x = clamp(-car.axS * VIS.bodyPitch, -0.06, 0.06);
    v.body.position.y = Math.abs(car.ayS) * 0.004;
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i], vw = v.wheels[i];
      if (i < 2) vw.pivot.rotation.y = car.steerAngle;
      vw.spin.rotation.x = w.spin * (v.flipSpin || 1);
      vw.pivot.position.y = vw.baseY + clamp((w.Fz - 3400) / 70000, -0.03, 0.03);
    }
    const braking = car.brake > 0.1 || car.handbrake > 0.1;
    v.tailMat.emissiveIntensity = braking ? 3 : (VIS.night ? 1.0 : 0.25);
  }

  updateEffects(dt, q) {
    const car = this.car, sn = Math.sin(car.yaw), cs = Math.cos(car.yaw);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const wx = car.x + w.px * cs + w.pz * sn, wz = car.z - w.px * sn + w.pz * cs;
      const y = q.h;
      const slip = w.slip;
      const spinning = Math.abs(w.sx) > 0.35 && (Math.abs(w.omega) * PHYS.wheelRadius > 2);
      const intensity = clamp((slip - 1.05) * 0.5, 0, 1) * (car.speed > 1 || spinning ? 1 : 0);
      this.skids.add(i, wx, y, wz, car.vx / (car.speed || 1), car.vz / (car.speed || 1), car.speed > 0.8 ? intensity : 0);
      // 煙：後輪為主
      const smokeK = (i >= 2 ? 1 : 0.35) * VIS.smokeAmount;
      const amt = clamp((slip - 1.4) * 0.6, 0, 1.8) * smokeK * clamp(car.speed / 15, 0.05, 1);
      let n = amt * dt * 55;
      while (n > 0) {
        if (Math.random() < n) {
          this.smoke.emit(
            wx + (Math.random() - 0.5) * 0.5, y + 0.25, wz + (Math.random() - 0.5) * 0.5,
            car.vx * 0.3 + (Math.random() - 0.5) * 2.2, 0.4 + Math.random() * 0.8, car.vz * 0.3 + (Math.random() - 0.5) * 2.2,
            0.9 + Math.random() * 0.6, 2.0 + Math.random() * 1.4, 0.3 + 0.08 * Math.min(1, amt), 2.2 + Math.random() * 1.2,
          );
        }
        n -= 1;
      }
    }
    // 刮牆火花
    if (car.scraping && car.speed > 4) {
      const side = q.lat > 0 ? 1 : -1;
      for (let k = 0; k < 4; k++) {
        const lz = (Math.random() - 0.5) * 3.5;
        const x = car.x + 0.85 * side * cs + lz * sn, z = car.z - 0.85 * side * sn + lz * cs;
        this.sparks.emit(x, q.h + 0.4, z, car.vx * 0.5 + (Math.random() - 0.5) * 5, 1 + Math.random() * 3, car.vz * 0.5 + (Math.random() - 0.5) * 5, 0.12, 0.35 + Math.random() * 0.3, 1, -0.1);
      }
    }
    const fog = this.scene.fog;
    for (const p of [this.smoke]) { p.mat.uniforms.fogColor.value.copy(fog.color); p.mat.uniforms.fogDensity.value = fog.density; }
    this.smoke.mat.uniforms.scale.value = innerHeight * 0.9;
    this.sparks.mat.uniforms.scale.value = innerHeight * 0.9;
    this.smoke.update(dt); this.sparks.update(dt);
  }

  updateCamera(dt, q) {
    const car = this.car, cam = this.camera, root = this.carView.root;
    const spd = car.speed;
    if (this.camMode >= 2) {
      // 車內 / 保險桿視角：固定於車體
      const off = this.camMode === 2 ? new THREE.Vector3(0.36, 1.12, -0.1) : new THREE.Vector3(0, 0.55, 2.15);
      cam.position.copy(off); root.localToWorld(cam.position);
      const look = new THREE.Vector3(off.x, off.y - 0.05, 30); root.localToWorld(look);
      cam.lookAt(look);
      cam.fov = CAM.fovBase + 8 + spd * CAM.fovSpeed * 0.6; cam.updateProjectionMatrix();
      this.camInit = false;
      return;
    }
    const far = this.camMode === 1;
    const dist = CAM.distance * (far ? 1.55 : 1), height = CAM.height * (far ? 1.45 : 1);
    // 目標偏航：車頭方向與行進方向混合
    let target = car.yaw;
    if (spd > 2 && car.vLong > -0.5) {
      const vYaw = Math.atan2(car.vx, car.vz);
      const blend = CAM.velocityFollow * clamp((spd - 2) / 10, 0, 1);
      target = car.yaw + angDiff(vYaw, car.yaw) * blend;
    }
    if (!this.camInit) { this.camYaw = target; }
    this.camYaw += angDiff(target, this.camYaw) * (1 - Math.exp(-CAM.yawFollow * dt));
    const bx = Math.sin(this.camYaw), bz = Math.cos(this.camYaw);
    const desired = new THREE.Vector3(car.x - bx * dist, root.position.y + height, car.z - bz * dist);
    if (!this.camInit) { this.camPos.copy(desired); this.camInit = true; }
    const k = 1 - Math.exp(-CAM.posStiffness * dt);
    this.camPos.x += (desired.x - this.camPos.x) * k;
    this.camPos.z += (desired.z - this.camPos.z) * k;
    this.camPos.y += (desired.y - this.camPos.y) * Math.min(1, k * 1.5);
    // 不鑽地
    const groundY = Math.max(this.track.terrainHeight(this.camPos.x, this.camPos.z), root.position.y - 1) + 0.6;
    if (this.camPos.y < groundY) this.camPos.y = groundY;
    cam.position.copy(this.camPos);
    // 震動
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = (this.shake + Math.max(0, spd - 30) * 0.002) * CAM.shake;
    if (sh > 0) { cam.position.x += (Math.random() - 0.5) * sh * 0.25; cam.position.y += (Math.random() - 0.5) * sh * 0.2; }
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const la = CAM.lookAhead * clamp(spd / 8, 0.3, 1);
    cam.lookAt(car.x + fx * la * 0.5 + bx * la * 0.5, root.position.y + CAM.lookHeight, car.z + fz * la * 0.5 + bz * la * 0.5);
    cam.fov = clamp(CAM.fovBase + spd * CAM.fovSpeed, 30, 115);
    cam.updateProjectionMatrix();
  }
}

// 讓載入畫面先渲染再建構世界
requestAnimationFrame(() => setTimeout(() => {
  const g = new Game(); window.game = g;
  g.init().catch((e) => { console.error(e); $('loadText').textContent = '載入失敗：' + e.message; });
}, 30));
