import { Vehicle } from '../src/vehicle.js';
const car = new Vehicle();
const env = { gx: 0, gz: 0 };
const dt = 1 / 600;
function run(sec, inp, log) {
  for (let t = 0; t < sec; t += dt) {
    if (Math.round(t / dt) % 10 === 0) car.updateGearbox(dt * 10, inp);
    car.step(dt, inp, env);
    if (!isFinite(car.x)) throw new Error('NaN');
    if (log && Math.abs(t % log) < dt) console.log(t.toFixed(1), 'kmh', (car.speed*3.6).toFixed(1), 'g', car.gear, 'rpm', car.rpm.toFixed(0), 'drift', car.driftAngle.toFixed(1), 'yawR', car.yawRate.toFixed(2), 'rslip', car.wheels[2].slip.toFixed(2));
  }
}
const I = (o) => Object.assign({ throttle: 0, brake: 0, handbrake: 0, steer: 0 }, o);
// 0-100
let t100 = null;
for (let t = 0; t < 30; t += dt) { if (Math.round(t/dt)%10===0) car.updateGearbox(dt*10, I({throttle:1})); car.step(dt, I({ throttle: 1 }), env); if (!t100 && car.speed*3.6 >= 100) t100 = t; }
console.log('0-100', t100?.toFixed(2), 's; 30s speed', (car.speed*3.6).toFixed(0), 'gear', car.gear);
// 煞車
car.reset(0,0,0); run(8, I({throttle:1}));
const v0 = car.speed; let d0 = car.z; run(6, I({brake:1}));
console.log('brake from', (v0*3.6).toFixed(0), 'dist', (car.z-d0).toFixed(1), 'end', car.speed.toFixed(2));
// 穩態轉彎 60km/h
car.reset(0,0,0); run(5, I({throttle:0.6}));
console.log('--- 定速左彎');
run(4, I({throttle:0.35, steer:0.5}), 1);
// 手煞車甩尾 + 油門維持
car.reset(0,0,0); run(6, I({throttle:1}));
console.log('--- 手煞車入彎 + 油門');
run(0.5, I({steer:1, handbrake:1}), 0.25);
run(3, I({throttle:1, steer:0}), 0.5);
console.log('--- 放油回正');
run(3, I({throttle:0.2}), 1);
