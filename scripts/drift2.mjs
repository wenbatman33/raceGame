import { Vehicle } from '../src/vehicle.js';
const dt=1/600, env={gx:0,gz:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
for (const target of [20, 35, 50]) {
  const c=new Vehicle();
  for(let n=0;n<6*600;n++){ if(n%10===0)c.updateGearbox(dt*10,{throttle:1}); c.step(dt,{throttle:1,brake:0,handbrake:0,steer:0},env); }
  for(let n=0;n<0.4*600;n++){ c.step(dt,{throttle:0,brake:0,handbrake:1,steer:1},env); }
  let log=[];
  for(let n=0;n<6*600;n++){
    const ang=c.driftAngle, e=ang-target;
    const steer=clamp(-e/25 - 0.0*c.yawRate + 0.15, -1, 1);
    const th=clamp(0.55 - e/40, 0, 1);
    const inp={throttle:th,brake:0,handbrake:0,steer};
    if(n%10===0)c.updateGearbox(dt*10,inp); c.step(dt,inp,env);
    if(n%600===0) log.push(`${ang.toFixed(0)}°/${(c.speed*3.6).toFixed(0)}k/g${c.gear}/th${th.toFixed(1)}/st${steer.toFixed(1)}`);
  }
  console.log('target',target, log.join('  '));
}
