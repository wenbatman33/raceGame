// HUD：計時、甩尾分數、轉速/時速表、小地圖；支援 DEV 模式拖曳版面
import { LAYOUT_PC, LAYOUT_MOBILE, DRIFT } from './config.js';

export const fmtTime = (t) => {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};

export class HUD {
  constructor(root, track) {
    this.root = root; this.track = track;
    this.mode = (window.innerWidth < 820 || matchMedia('(pointer: coarse)').matches) ? 'mobile' : 'pc';
    this.els = {};
    const mk = (id, html) => {
      const d = document.createElement('div'); d.className = 'hud-el'; d.dataset.id = id; d.innerHTML = html;
      root.appendChild(d); this.els[id] = d; return d;
    };
    mk('timer', `<div class="t-label">TIME</div><div class="t-main" id="tMain">00:00.000</div>
      <div class="t-row"><span>BEST</span><b id="tBest">--:--.---</b></div>
      <div class="t-row"><span>SECTOR</span><b id="tSplit"></b></div>
      <div class="t-prog"><div id="tProg"></div></div>`);
    mk('drift', `<div class="d-main"><span id="dScore"></span><span id="dMult"></span></div>
      <div class="d-sub" id="dSub"></div><div class="d-bank" id="dBank"></div>`);
    mk('speedo', `<canvas id="speedo" width="260" height="260"></canvas>`);
    mk('minimap', `<canvas id="minimap" width="230" height="230"></canvas>`);
    mk('hint', `<div id="hintText"></div>`);
    this.speedo = root.querySelector('#speedo').getContext('2d');
    this.mini = root.querySelector('#minimap').getContext('2d');
    this.$ = (id) => root.querySelector('#' + id);
    // 預先建立賽道路徑
    const p = new Path2D();
    for (let i = 0; i < track.n; i += 3) (i ? p.lineTo : p.moveTo).call(p, track.px[i], track.pz[i]);
    this.path = p;
    this.bankTimer = 0;
    this.applyLayout();
    window.addEventListener('resize', () => this.applyLayout());
    this._initDrag();
  }

  get layout() { return this.mode === 'pc' ? LAYOUT_PC : LAYOUT_MOBILE; }

  applyLayout() {
    const L = this.layout;
    for (const [id, el] of Object.entries(this.els)) {
      const c = L[id]; if (!c) continue;
      el.style.left = (c.x * 100) + '%';
      el.style.top = (c.y * 100) + '%';
      el.style.transform = `translate(-50%,-50%) scale(${c.scale})`;
    }
    this.root.style.setProperty('--drift', DRIFT.driftColor);
  }

  setDragEnabled(on) { this.dragOn = on; this.root.classList.toggle('dev-drag', on); }

  _initDrag() {
    let cur = null, ox = 0, oy = 0;
    this.root.addEventListener('pointerdown', (e) => {
      if (!this.dragOn) return;
      const el = e.target.closest('.hud-el'); if (!el) return;
      cur = el; const c = this.layout[el.dataset.id];
      ox = e.clientX - c.x * innerWidth; oy = e.clientY - c.y * innerHeight;
      el.setPointerCapture(e.pointerId); e.preventDefault();
      this.onSelect && this.onSelect(el.dataset.id);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const c = this.layout[cur.dataset.id];
      c.x = +((e.clientX - ox) / innerWidth).toFixed(4);
      c.y = +((e.clientY - oy) / innerHeight).toFixed(4);
      this.applyLayout(); this.onDrag && this.onDrag();
    });
    const end = () => { cur = null; };
    this.root.addEventListener('pointerup', end); this.root.addEventListener('pointercancel', end);
    this.root.addEventListener('wheel', (e) => {
      if (!this.dragOn) return;
      const el = e.target.closest('.hud-el'); if (!el) return;
      const c = this.layout[el.dataset.id];
      c.scale = +Math.max(0.3, Math.min(2.5, c.scale * (e.deltaY < 0 ? 1.05 : 0.95))).toFixed(3);
      this.applyLayout(); this.onDrag && this.onDrag(); e.preventDefault();
    }, { passive: false });
  }

  bank(text, color) {
    const b = this.$('dBank'); b.textContent = text; b.style.color = color || '';
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }

  update(g) {
    const { car } = g;
    // 計時
    this.$('tMain').textContent = fmtTime(g.time);
    this.$('tBest').textContent = fmtTime(g.best);
    this.$('tSplit').innerHTML = g.splitText || '';
    this.$('tProg').style.width = (Math.max(0, Math.min(1, g.progress)) * 100).toFixed(1) + '%';
    // 甩尾
    const d = g.drift;
    const show = d.chain > 0;
    this.els.drift.classList.toggle('active', show);
    this.$('dScore').textContent = show ? Math.floor(d.chain).toLocaleString() : '';
    this.$('dMult').textContent = show ? ' x' + d.mult.toFixed(1) : '';
    this.$('dSub').innerHTML = `DRIFT <b>${Math.floor(d.total).toLocaleString()}</b>` + (show ? ` · ${Math.abs(car.driftAngle).toFixed(0)}°` : '');
    this.$('hintText').innerHTML = g.hint || '';
    this._drawSpeedo(car);
    this._drawMini(car);
  }

  _drawSpeedo(car) {
    const g = this.speedo, W = 260, cx = 130, cy = 130, R = 108;
    g.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, maxRpm = 9000;
    const ang = (r) => a0 + (a1 - a0) * (r / maxRpm);
    g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cy, R + 14, 0, Math.PI * 2); g.fillStyle = 'rgba(8,10,14,0.55)'; g.fill();
    g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    g.strokeStyle = 'rgba(255,40,80,0.55)';
    g.beginPath(); g.arc(cx, cy, R, ang(car.P.redline), a1); g.stroke();
    const rpm = Math.min(maxRpm, car.rpmDisplay);
    const hot = rpm > car.P.autoUpRpm - 300;
    g.strokeStyle = hot ? '#ff2d6f' : '#f4f4f4';
    g.lineWidth = 10;
    g.beginPath(); g.arc(cx, cy, R, a0, ang(rpm)); g.stroke();
    // 刻度
    g.fillStyle = '#ddd'; g.font = 'bold 15px "Rajdhani", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 0; r <= 9; r++) {
      const a = ang(r * 1000);
      g.strokeStyle = '#ccc'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); g.lineTo(cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20)); g.stroke();
      g.fillText(r, cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32));
    }
    // 指針
    const na = ang(rpm);
    g.strokeStyle = '#ff2d6f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 12, cy - Math.sin(na) * 12); g.lineTo(cx + Math.cos(na) * (R - 6), cy + Math.sin(na) * (R - 6)); g.stroke();
    // 速度
    g.fillStyle = '#fff'; g.font = 'italic 700 52px "Rajdhani", Arial';
    g.fillText(Math.round(car.speed * 3.6), cx + 6, cy + 30);
    g.font = '600 13px Arial'; g.fillStyle = '#aaa'; g.fillText('km/h', cx + 50, cy + 58);
    // 檔位圈
    const gear = car.gear === 0 ? (car.pendingGear === -1 ? 'R' : 'N') : car.gear === -1 ? 'R' : car.gear;
    g.beginPath(); g.arc(cx - 34, cy - 14, 20, 0, Math.PI * 2);
    g.strokeStyle = '#ff2d6f'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ff2d6f'; g.font = 'bold 26px "Rajdhani", Arial'; g.fillText(gear, cx - 34, cy - 13);
    g.font = 'bold 11px Arial'; g.fillStyle = car.auto ? '#8fd3ff' : '#ffd166';
    g.fillText(car.auto ? 'AT' : 'MT', cx + 30, cy - 14);
    if (hot && Math.floor(performance.now() / 70) % 2) {
      g.fillStyle = '#ff2d6f'; g.beginPath(); g.arc(cx + 30, cy - 36, 6, 0, 7); g.fill();
    }
  }

  _drawMini(car) {
    const g = this.mini, W = 230, c = W / 2, sc = 0.42;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.fillStyle = 'rgba(8,12,10,0.55)'; g.fill(); g.clip();
    g.translate(c, c + 28);
    // 車頭朝上：世界 (x,z) → 畫面，需鏡像 x（世界 +x 為車左）
    g.scale(-sc, -sc);
    g.rotate(car.yaw);
    g.translate(-car.x, -car.z);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 16; g.stroke(this.path);
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 9; g.stroke(this.path);
    const t = this.track;
    for (const [s, col] of [[t.startS, '#35d07f'], [t.finishS, '#ff2d6f']]) {
      const sm = t.sampleAt(s); g.fillStyle = col; g.beginPath(); g.arc(sm.x, sm.z, 12, 0, 7); g.fill();
    }
    g.restore();
    // 自車
    g.save(); g.translate(c, c + 28);
    g.fillStyle = '#ff2d6f'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
