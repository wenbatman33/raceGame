import { Vehicle } from '../src/vehicle.js';
import { PHYS } from '../src/config.js';
const dt=1/600, env={gx:0,gz:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function trial(target, kp, kd, kt, base){
  const c=new Vehicle();
  for(let n=0;n<6*600;n++){ if(n%10===0)c.updateGearbox(dt*10,{throttle:1}); c.step(dt,{throttle:1,brake:0,handbrake:0,steer:0},env); }
  for(let n=0;n<0.4*600;n++){ c.step(dt,{throttle:0,brake:0,handbrake:1,steer:1},env); }
  let err=0, cnt=0, spun=false;
  for(let n=0;n<8*600;n++){
    const ang=c.driftAngle, e=ang-target;
    const steer=clamp(-e*kp - kd*(c.yawRate-1.0), -1, 1);
    const th=clamp(base - e*kt, 0, 1);
    const inp={throttle:th,brake:0,handbrake:0,steer};
    if(n%10===0)c.updateGearbox(dt*10,inp); c.step(dt,inp,env);
    if(n>2*600){err+=Math.abs(e);cnt++;}
    if(Math.abs(ang)>100) spun=true;
  }
  return {err:err/cnt, v:c.speed*3.6, g:c.gear, spun};
}
for (const target of [25,40]) {
  let best=null;
  for (const kp of [0,0.01,0.03,0.06]) for (const kd of [0,0.3,0.8]) for (const kt of [0.01,0.03,0.08]) for (const base of [0.4,0.7,1]) {
    const r=trial(target,kp,kd,kt,base); if(!r.spun && (!best||r.err<best.err)) best={...r,kp,kd,kt,base};
  }
  console.log('target',target, JSON.stringify(best));
}
