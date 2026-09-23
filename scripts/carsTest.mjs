import { Vehicle } from '../src/vehicle.js';
import { PHYS, CARS, DEFAULTS } from '../src/config.js';
const dt=1/600, env={gx:0,gz:0};
for (const c of CARS) {
  Object.assign(PHYS, JSON.parse(JSON.stringify(DEFAULTS.PHYS)), c.phys);
  const car=new Vehicle(); let t100=null;
  for(let n=0;n<25*600;n++){const i={throttle:1,brake:0,handbrake:0,drift:0,steer:0}; if(n%10===0)car.updateGearbox(dt*10,i); car.step(dt,i,env); if(!t100&&car.speed*3.6>=100)t100=n*dt;}
  const top=car.speed*3.6;
  const c2=new Vehicle(); let mx=0;
  for(let n=0;n<4*600;n++){const i={throttle:1,brake:0,handbrake:0,drift:0,steer:0}; if(n%10===0)c2.updateGearbox(dt*10,i); c2.step(dt,i,env);}
  for(let n=0;n<3*600;n++){const i={throttle:1,brake:0,handbrake:0,drift:0,steer:1}; if(n%10===0)c2.updateGearbox(dt*10,i); c2.step(dt,i,env); mx=Math.max(mx,Math.abs(c2.driftAngle));}
  console.log(c.name.padEnd(8), '0-100', t100?.toFixed(1)+'s', '25s極速', top.toFixed(0), '全油急轉最大角', mx.toFixed(0));
}
