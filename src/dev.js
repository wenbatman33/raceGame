// DEV 微調工具：` 鍵或右下角齒輪開啟。所有滑桿即時生效，可拖曳 HUD，匯出 JSON。
import { PHYS, CAM, VIS, DRIFT, LAYOUT_PC, LAYOUT_MOBILE, DEFAULTS } from './config.js';

const STORE = 'akina_tune_v2';
const OBJS = { PHYS, CAM, VIS, DRIFT, LAYOUT_PC, LAYOUT_MOBILE };

const SCHEMA = [
  ['輪胎 / 抓地', 'PHYS', [
    ['muFront', '前輪抓地 μ', 0.5, 2, 0.01], ['muRear', '後輪抓地 μ', 0.5, 2, 0.01],
    ['alphaPeak', '側滑峰值角 rad', 0.04, 0.3, 0.005], ['sxPeak', '縱向滑移峰值', 0.04, 0.3, 0.005],
    ['slideGrip', '滑動後剩餘抓地', 0.4, 1, 0.01], ['slideFalloff', '抓地衰減速度', 0.2, 5, 0.05],
    ['spinCap', '空轉力方向上限', 0.5, 10, 0.1], ['loadSensitivity', '載重敏感度', 0, 0.3, 0.005],
  ]],
  ['車體 / 懸吊', 'PHYS', [
    ['mass', '車重 kg', 700, 2000, 10], ['inertiaScale', '偏航慣量倍率', 0.4, 2, 0.02],
    ['cgHeight', '重心高度 m', 0.2, 1, 0.01], ['weightFront', '前軸配重', 0.35, 0.65, 0.005],
    ['rollFront', '前側傾分配', 0.3, 0.8, 0.01], ['downforce', '下壓力', 0, 1, 0.01],
    ['drag', '風阻', 0, 1.5, 0.01], ['wallRestitution', '護欄反彈', 0, 0.8, 0.01], ['wallFriction', '護欄摩擦', 0, 1, 0.01],
  ]],
  ['轉向 / 輔助', 'PHYS', [
    ['maxSteer', '最大轉向角 rad', 0.3, 1.1, 0.01], ['steerSpeedRef', '速度敏感參考 m/s', 5, 60, 0.5],
    ['steerRate', '鍵盤轉向速度', 1, 12, 0.1], ['steerReturn', '鍵盤回正速度', 1, 15, 0.1],
    ['countersteerAssist', '反打輔助', 0, 1, 0.01],
  ]],
  ['動力 / 煞車', 'PHYS', [
    ['powerScale', '動力倍率', 0.3, 3, 0.05], ['finalDrive', '終傳比', 2.5, 6, 0.05],
    ['autoUpRpm', '自排升檔 rpm', 5000, 8500, 50], ['autoDownRpm', '自排降檔 rpm', 2000, 6000, 50],
    ['shiftTime', '換檔時間 s', 0.02, 0.5, 0.01], ['engineBrake', '引擎煞車', 0, 150, 1],
    ['brakeTorque', '煞車力', 1000, 10000, 50], ['brakeBias', '煞車前比', 0.3, 0.9, 0.01],
    ['handbrakeTorque', '手煞車力', 500, 8000, 50],
  ]],
  ['鏡頭', 'CAM', [
    ['distance', '距離', 2, 14, 0.1], ['height', '高度', 0.5, 6, 0.05], ['lookAhead', '前瞻', 0, 8, 0.1],
    ['lookHeight', '注視高度', 0, 3, 0.05], ['yawFollow', '偏航跟隨', 0.5, 20, 0.1],
    ['velocityFollow', '跟隨行進方向', 0, 1, 0.01], ['posStiffness', '位置剛性', 2, 40, 0.5],
    ['fovBase', '基礎 FOV', 40, 100, 1], ['fovSpeed', '速度 FOV 增量', 0, 0.8, 0.01], ['shake', '震動', 0, 2, 0.05],
  ]],
  ['畫面', 'VIS', [
    ['carColor', '車色', 'color'], ['bodyRoll', '車身側傾', 0, 0.08, 0.001], ['bodyPitch', '車身俯仰', 0, 0.05, 0.001],
    ['smokeAmount', '煙量', 0, 3, 0.05], ['sunAzimuth', '天空/太陽旋轉°', 0, 360, 1], ['ao', '環境光遮蔽 AO（高畫質）', 'bool'], ['bloom', '光暈 Bloom', 0, 1.5, 0.01], ['dynamicRes', '動態解析度', 'bool'],
    ['fogDensity', '霧濃度', 0, 0.006, 0.0001], ['exposure', '曝光', 0.3, 2, 0.01], ['night', '夜間模式', 'bool'],
  ]],
  ['甩尾計分', 'DRIFT', [
    ['minAngle', '最小角度°', 3, 40, 1], ['minSpeed', '最低速度 m/s', 2, 30, 0.5], ['pointsRate', '得分速率', 0.02, 1, 0.01],
    ['multStep', '倍率成長/秒', 0, 4, 0.05], ['multMax', '倍率上限', 1, 10, 0.5], ['chainGrace', '連段寬限 s', 0.2, 5, 0.1],
    ['driftColor', '分數顏色', 'color'],
  ]],
];

export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE); if (!raw) return false;
    applyJSON(JSON.parse(raw)); return true;
  } catch { return false; }
}

function applyJSON(data) {
  for (const [k, obj] of Object.entries(OBJS)) {
    if (!data[k]) continue;
    for (const [kk, v] of Object.entries(data[k])) {
      if (typeof obj[kk] === 'object' && !Array.isArray(obj[kk]) && obj[kk]) Object.assign(obj[kk], v);
      else if (kk in obj) obj[kk] = v;
    }
  }
}

function snapshot() { return JSON.parse(JSON.stringify(OBJS)); }

export class DevPanel {
  constructor(game) {
    this.game = game;
    this.open = false;
    const btn = document.createElement('button');
    btn.id = 'devBtn'; btn.title = 'DEV 微調（` 鍵）'; btn.textContent = '⚙';
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);
    const el = document.createElement('div'); el.id = 'dev'; document.body.appendChild(el);
    this.el = el;
    this.build();
    let t = null;
    this.save = () => { clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(snapshot())); } catch {} }, 250); };
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('open', this.open);
    this.game.hud.setDragEnabled(this.open);
  }

  build() {
    const g = this.game;
    const el = this.el;
    el.innerHTML = `
      <div class="dv-head"><b>DEV 微調</b><span class="dv-note">即時生效・自動存本機</span><button data-x="close">✕</button></div>
      <div class="dv-sec open"><div class="dv-title">狀態 / 測試</div><div class="dv-body">
        <div class="dv-btns">
          <button data-x="countdown">倒數</button><button data-x="finish">結算畫面</button>
          <button data-x="drift">觸發甩尾分數</button><button data-x="crash">觸發撞牆</button>
          <button data-x="hairpins">傳送：五連髮夾</button><button data-x="restart">重新開始</button>
          <button data-x="night">日 / 夜</button><button data-x="trans">AT / MT</button>
        </div>
        <pre id="dvTele"></pre>
      </div></div>
      <div class="dv-sec open"><div class="dv-title">HUD 版面（面板開啟時可直接拖曳 / 滾輪縮放）</div><div class="dv-body">
        <div class="dv-btns"><button data-x="modePC">編輯 PC</button><button data-x="modeMobile">編輯 Mobile</button></div>
        <div class="dv-row"><label>元件</label><select id="dvEl">${Object.keys(LAYOUT_PC).map((k) => `<option>${k}</option>`).join('')}</select></div>
        <div id="dvLayout"></div>
      </div></div>
      <div id="dvGroups"></div>
      <div class="dv-sec open"><div class="dv-title">匯出 / 匯入</div><div class="dv-body">
        <div class="dv-btns"><button data-x="export" class="hi">💾 匯出 / 鎖定</button><button data-x="import">套用下方 JSON</button><button data-x="reset">重設預設</button></div>
        <textarea id="dvJson" spellcheck="false" placeholder="按「匯出」後 JSON 會出現在這裡並複製到剪貼簿"></textarea>
      </div></div>`;

    const groups = el.querySelector('#dvGroups');
    for (const [title, objName, items] of SCHEMA) {
      const sec = document.createElement('div'); sec.className = 'dv-sec';
      sec.innerHTML = `<div class="dv-title">${title}</div><div class="dv-body"></div>`;
      const body = sec.querySelector('.dv-body');
      for (const it of items) body.appendChild(this.row(OBJS[objName], it));
      groups.appendChild(sec);
    }
    el.querySelectorAll('.dv-title').forEach((t) => (t.onclick = () => t.parentElement.classList.toggle('open')));
    el.querySelector('#dvEl').onchange = () => this.buildLayoutRows();
    g.hud.onSelect = (id) => { el.querySelector('#dvEl').value = id; this.buildLayoutRows(); };
    g.hud.onDrag = () => { this.syncLayoutRows(); this.save(); };
    this.buildLayoutRows();

    el.addEventListener('click', (e) => {
      const x = e.target.dataset.x; if (!x) return;
      const act = {
        close: () => this.toggle(false),
        countdown: () => g.startCountdown(),
        finish: () => g.showFinish(true),
        drift: () => g.debugDrift(),
        crash: () => g.debugCrash(),
        hairpins: () => g.teleport(1480),
        restart: () => g.restart(),
        night: () => { VIS.night = !VIS.night; g.applyVisuals(); this.refresh(); },
        trans: () => g.action('toggleTrans'),
        modePC: () => { g.hud.mode = 'pc'; g.hud.applyLayout(); this.buildLayoutRows(); },
        modeMobile: () => { g.hud.mode = 'mobile'; g.hud.applyLayout(); this.buildLayoutRows(); },
        export: () => this.exportJSON(),
        import: () => { try { applyJSON(JSON.parse(el.querySelector('#dvJson').value)); this.after(); } catch (err) { alert('JSON 格式錯誤：' + err.message); } },
        reset: () => { if (confirm('重設所有參數為程式預設值？')) { applyJSON(JSON.parse(JSON.stringify(DEFAULTS))); try { localStorage.removeItem(STORE); } catch {} this.after(); } },
      }[x];
      act && act();
    });
    // 面板內按鍵不要驅動車子
    el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  after() { this.game.applyVisuals(); this.game.hud.applyLayout(); this.refresh(); this.save(); }

  refresh() { this.build(); this.el.classList.toggle('open', this.open); }

  row(obj, [key, label, min, max, step]) {
    const r = document.createElement('div'); r.className = 'dv-row';
    if (min === 'color') {
      r.innerHTML = `<label>${label}</label><input type="color" value="${obj[key]}">`;
      r.querySelector('input').oninput = (e) => { obj[key] = e.target.value; this.game.applyVisuals(); this.game.hud.applyLayout(); this.save(); };
      return r;
    }
    if (min === 'bool') {
      r.innerHTML = `<label>${label}</label><input type="checkbox" ${obj[key] ? 'checked' : ''}>`;
      r.querySelector('input').onchange = (e) => { obj[key] = e.target.checked; this.game.applyVisuals(); this.save(); };
      return r;
    }
    r.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${obj[key]}"><input type="number" step="${step}" value="${obj[key]}">`;
    const [rg, nb] = r.querySelectorAll('input');
    const set = (v) => { v = parseFloat(v); if (!isFinite(v)) return; obj[key] = v; rg.value = v; nb.value = v; this.game.applyVisuals(); this.save(); };
    rg.oninput = (e) => set(e.target.value); nb.onchange = (e) => set(e.target.value);
    return r;
  }

  buildLayoutRows() {
    const id = this.el.querySelector('#dvEl').value;
    const L = this.game.hud.layout[id];
    const box = this.el.querySelector('#dvLayout');
    box.innerHTML = `<div class="dv-note">目前編輯：${this.game.hud.mode === 'pc' ? 'PC' : 'Mobile'}</div>`;
    for (const [k, lab, mn, mx, st] of [['x', 'X 位置', 0, 1, 0.001], ['y', 'Y 位置', 0, 1, 0.001], ['scale', '縮放', 0.3, 2.5, 0.01]]) {
      const r = document.createElement('div'); r.className = 'dv-row';
      r.innerHTML = `<label>${lab}</label><input type="range" min="${mn}" max="${mx}" step="${st}" value="${L[k]}"><input type="number" step="${st}" value="${L[k]}">`;
      const [rg, nb] = r.querySelectorAll('input');
      const set = (v) => { v = parseFloat(v); if (!isFinite(v)) return; L[k] = v; rg.value = v; nb.value = v; this.game.hud.applyLayout(); this.save(); };
      rg.oninput = (e) => set(e.target.value); nb.onchange = (e) => set(e.target.value);
      r.dataset.k = k; box.appendChild(r);
    }
  }

  syncLayoutRows() {
    const id = this.el.querySelector('#dvEl').value;
    const L = this.game.hud.layout[id];
    this.el.querySelectorAll('#dvLayout .dv-row').forEach((r) => { r.querySelectorAll('input').forEach((i) => (i.value = L[r.dataset.k])); });
  }

  exportJSON() {
    const json = JSON.stringify(snapshot(), null, 2);
    const ta = this.el.querySelector('#dvJson'); ta.value = json;
    try { navigator.clipboard.writeText(json); } catch {}
    try { localStorage.setItem(STORE, json); } catch {}
    console.log('[AKINA TUNE EXPORT]\n' + json);
    ta.select();
  }

  updateTelemetry(car) {
    if (!this.open) return;
    const w = car.wheels, n = ['FL', 'FR', 'RL', 'RR'];
    const lines = w.map((x, i) => `${n[i]} Fz ${x.Fz.toFixed(0).padStart(5)}  α ${(x.alpha * 57.3).toFixed(1).padStart(6)}°  sx ${x.sx.toFixed(2).padStart(6)}  s ${x.slip.toFixed(2).padStart(5)}`);
    lines.push(`速度 ${(car.speed * 3.6).toFixed(1)} km/h  甩尾角 ${car.driftAngle.toFixed(1)}°  偏航 ${car.yawRate.toFixed(2)} rad/s`);
    const g = this.game; lines.push(`FPS ${g.fps.toFixed(0)}  畫質 ${g.preset.label}  解析度 ${(g.resScale * 100).toFixed(0)}%  三角形 ${(g.renderer.info.render.triangles / 1000).toFixed(0)}k`);
    lines.push(`轉向 ${(car.steerAngle * 57.3).toFixed(1)}°  檔 ${car.gear}  rpm ${car.rpm.toFixed(0)}  ax ${car.axS.toFixed(1)} ay ${car.ayS.toFixed(1)}`);
    this.el.querySelector('#dvTele').textContent = lines.join('\n');
  }
}
