// WebAudio 合成音效：引擎（四缸）、輪胎尖叫、風切、撞擊、刮牆、回火
export class GameAudio {
  constructor() { this.ctx = null; this.muted = true; } // 預設靜音，K 鍵切換

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    this.master = master;

    // 噪音 buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };

    // ---- 引擎 ----
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    const eg = ctx.createGain(); eg.gain.value = 0;
    this.oscs = [
      { o: ctx.createOscillator(), type: 'sawtooth', mul: 1, g: 0.5 },
      { o: ctx.createOscillator(), type: 'square', mul: 0.5, g: 0.35 },
      { o: ctx.createOscillator(), type: 'sawtooth', mul: 2, g: 0.18 },
      { o: ctx.createOscillator(), type: 'triangle', mul: 3, g: 0.08 },
    ];
    for (const s of this.oscs) {
      s.o.type = s.type; const g = ctx.createGain(); g.gain.value = s.g; s.o.connect(g); g.connect(shaper); s.o.start();
    }
    shaper.connect(lp); lp.connect(eg); eg.connect(master);
    // 進氣噪音
    const intake = noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    const ig = ctx.createGain(); ig.gain.value = 0; intake.connect(bp); bp.connect(ig); ig.connect(master);
    this.eng = { lp, eg, bp, ig };

    // ---- 輪胎尖叫 ----
    const sq = noise(); const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.Q.value = 9; sbp.frequency.value = 1050;
    const sbp2 = ctx.createBiquadFilter(); sbp2.type = 'bandpass'; sbp2.Q.value = 14; sbp2.frequency.value = 1650;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sq.connect(sbp); sq.connect(sbp2); sbp.connect(sg); sbp2.connect(sg); sg.connect(master);
    const tone = ctx.createOscillator(); tone.type = 'sine'; tone.frequency.value = 980;
    const tg = ctx.createGain(); tg.gain.value = 0; tone.connect(tg); tg.connect(master); tone.start();
    this.sq = { sbp, sbp2, sg, tone, tg };

    // ---- 風切 ----
    const wn = noise(); const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 700;
    const wg = ctx.createGain(); wg.gain.value = 0; wn.connect(wlp); wlp.connect(wg); wg.connect(master);
    this.wind = { wlp, wg };

    // ---- 刮牆 ----
    const sc = noise(); const scb = ctx.createBiquadFilter(); scb.type = 'bandpass'; scb.frequency.value = 2600; scb.Q.value = 3;
    const scg = ctx.createGain(); scg.gain.value = 0; sc.connect(scb); scb.connect(scg); scg.connect(master);
    this.scrape = scg;
    this.popCooldown = 0;
    this.master.gain.value = this.muted ? 0 : 0.55;
  }

  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; }

  burst(dur, freq, q, vol, type = 'lowpass') {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  impact(strength) { this.burst(0.35, 260, 0.8, Math.min(1.2, strength * 0.12)); this.burst(0.18, 1800, 1.5, Math.min(0.5, strength * 0.05), 'bandpass'); }
  shiftPop() { this.burst(0.08, 900, 1, 0.25, 'bandpass'); }

  update(dt, car, rearSlip, frontSlip) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime, k = 0.03;
    const rpm = car.rpmDisplay;
    const f = (rpm / 60) * 2; // 四缸點火頻率
    const thr = car.throttle;
    const lim = car.limiter > 0 ? 0.55 : 1;
    for (const s of this.oscs) s.o.frequency.setTargetAtTime(f * s.mul * (1 + (Math.random() - 0.5) * 0.012), t, 0.015);
    this.eng.lp.frequency.setTargetAtTime(380 + thr * 2600 + rpm * 0.28, t, k);
    this.eng.eg.gain.setTargetAtTime((0.1 + thr * 0.3 + (rpm / 8000) * 0.12) * lim, t, 0.02);
    this.eng.bp.frequency.setTargetAtTime(f * 3.2, t, k);
    this.eng.ig.gain.setTargetAtTime(thr * 0.09 * (rpm / 8000), t, k);

    // 放油回火
    this.popCooldown -= dt;
    if (thr < 0.1 && rpm > 5200 && this.popCooldown <= 0 && Math.random() < dt * 9) {
      this.burst(0.06, 500 + Math.random() * 500, 1.5, 0.35, 'bandpass'); this.popCooldown = 0.06;
    }

    const spd = car.speed;
    const squeal = Math.min(1, Math.max(0, Math.max(rearSlip - 1.1, frontSlip - 1.3) * 0.45)) * Math.min(1, spd / 6);
    this.sq.sg.gain.setTargetAtTime(squeal * 0.5, t, 0.04);
    this.sq.tg.gain.setTargetAtTime(squeal * 0.035, t, 0.04);
    this.sq.tone.frequency.setTargetAtTime(900 + squeal * 250 + Math.sin(t * 23) * 25, t, 0.03);
    this.sq.sbp.frequency.setTargetAtTime(950 + squeal * 300, t, 0.05);
    this.wind.wg.gain.setTargetAtTime(Math.min(0.35, spd * spd * 0.00012), t, 0.1);
    this.wind.wlp.frequency.setTargetAtTime(400 + spd * 18, t, 0.1);
    this.scrape.gain.setTargetAtTime(car.scraping && spd > 2 ? Math.min(0.4, spd * 0.02) : 0, t, 0.03);
  }
}
