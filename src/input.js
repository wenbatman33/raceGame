// 輸入：鍵盤（平滑化）、手把（類比）、觸控按鈕
import { PHYS } from './config.js';

const ACTIONS = {
  KeyM: 'toggleTrans', KeyC: 'camera', KeyR: 'reset', KeyT: 'restart', KeyN: 'night',
  KeyK: 'mute', KeyG: 'quality', KeyH: 'help', Backquote: 'dev', F2: 'dev', Escape: 'pause',
};

export class Input {
  constructor(onAction) {
    this.keys = new Set();
    this.onAction = onAction;
    this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = 0;
    this.shiftUp = false; this.shiftDown = false;
    this.touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0 };
    this.padPrev = [];
    this.usingPad = false;
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F2'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (ACTIONS[e.code]) this.onAction(ACTIONS[e.code]);
        if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._up = true;
        if (e.code === 'KeyQ' || e.code === 'ControlLeft' || e.code === 'ControlRight') this._down = true;
      }
      this.keys.add(e.code);
      this.usingPad = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(el, key) {
    const on = (e) => { e.preventDefault(); this.touch[key] = 1; el.classList.add('on'); };
    const off = (e) => { e.preventDefault(); this.touch[key] = 0; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
  }

  update(dt) {
    const P = PHYS, k = this.keys, T = this.touch;
    let left = k.has('KeyA') || k.has('ArrowLeft') || T.left;
    let right = k.has('KeyD') || k.has('ArrowRight') || T.right;
    let gas = k.has('KeyW') || k.has('ArrowUp') || T.gas;
    let brk = k.has('KeyS') || k.has('ArrowDown') || T.brake;
    let hand = k.has('Space') || T.hand;
    this.shiftUp = !!this._up; this.shiftDown = !!this._down; this._up = this._down = false;

    // ---- 手把 ----
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    let padSteer = null, padGas = 0, padBrake = 0, padHand = 0;
    if (pad) {
      const b = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
      const pressed = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const edge = (i) => { const p = pressed(i), was = this.padPrev[i]; this.padPrev[i] = p; return p && !was; };
      const ax = pad.axes[0] || 0;
      const dz = 0.07;
      const m = Math.abs(ax) < dz ? 0 : (Math.abs(ax) - dz) / (1 - dz);
      padGas = b(7); padBrake = b(6); padHand = Math.max(b(0), b(2));
      if (m > 0 || padGas > 0.05 || padBrake > 0.05) this.usingPad = true;
      padSteer = -Math.sign(ax) * Math.pow(m, 1.35);
      if (edge(5)) this.shiftUp = true;
      if (edge(4)) this.shiftDown = true;
      if (edge(3)) this.onAction('camera');
      if (edge(9)) this.onAction('restart');
      if (edge(8)) this.onAction('reset');
      if (edge(1)) this.onAction('toggleTrans');
    }

    if (this.usingPad && padSteer !== null) {
      this.steer = padSteer;
      this.throttle = padGas; this.brake = padBrake; this.handbrake = padHand;
      return this;
    }

    // ---- 鍵盤平滑 ----
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    let rate;
    if (target === 0) rate = P.steerReturn;
    else if (Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0) rate = P.steerReturn + P.steerRate;
    else rate = P.steerRate;
    const d = target - this.steer;
    this.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);

    const ramp = (cur, on, up, down) => on ? Math.min(1, cur + up * dt) : Math.max(0, cur - down * dt);
    this.throttle = ramp(this.throttle, gas, 7, 12);
    this.brake = ramp(this.brake, brk, 7, 12);
    this.handbrake = hand ? 1 : 0;
    return this;
  }
}
