import { Vehicle } from '../src/vehicle.js';
const dt=1/600, env={gx:0,gz:0};
const I=(o)=>Object.assign({throttle:0.8,brake:0,handbrake:0,drift:0,steer:0},o);
for (const hold of [0.15, 0.5, 1.2]) {
  const car=new Vehicle(); const run=(s,i)=>{for(let n=0;n<s*600;n++){if(n%10===0)car.updateGearbox(dt*10,i);car.step(dt,i,env);}};
  run(4,I({throttle:1})); let mx=0;
  for(let n=0;n<hold*600;n++){const i=I({steer:0.6,drift:1}); car.step(dt,i,env); mx=Math.max(mx,Math.abs(car.driftAngle));}
  for(let n=0;n<1.2*600;n++){const i=I({steer:0.6}); car.step(dt,i,env); mx=Math.max(mx,Math.abs(car.driftAngle));}
  console.log(`按 ${hold}s → 最大甩尾角 ${mx.toFixed(0)}°，1.2 秒後仍在甩尾：${car.drifting}`);
}
