import { Vehicle } from '../src/vehicle.js';
const dt=1/600, env={gx:0,gz:0};
function sim(car, sec, inp){ for(let n=0;n<sec*600;n++){ if(n%10===0) car.updateGearbox(dt*10,inp); car.step(dt,inp,env);} }
for (const th of [0.4,0.6,0.8,1]) { let row=[];
 for (const st of [0,-0.3,-0.6,-1]) {
  const c=new Vehicle(); sim(c,6,{throttle:1,brake:0,handbrake:0,steer:0});
  sim(c,0.45,{throttle:0,brake:0,handbrake:1,steer:1});
  let maxA=0, sumA=0, n=0;
  for(let k=0;k<30;k++){ sim(c,0.1,{throttle:th,brake:0,handbrake:0,steer:st}); maxA=Math.max(maxA,Math.abs(c.driftAngle)); if(k>=10){sumA+=c.driftAngle;n++;} }
  row.push(`st${st}: avg${(sumA/n).toFixed(0)} max${maxA.toFixed(0)} v${(c.speed*3.6).toFixed(0)} g${c.gear}`);
 } console.log('th',th, row.join(' | ')); }
