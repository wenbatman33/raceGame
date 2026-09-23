import { Vehicle } from '../src/vehicle.js';
const dt=1/600, env={gx:0,gz:0}, car=new Vehicle();
const run=(sec,inp,log)=>{for(let n=0;n<sec*600;n++){ if(n%10===0)car.updateGearbox(dt*10,inp); car.step(dt,inp,env); if(!isFinite(car.x)) throw 'NaN'; if(log&&n%300===0) console.log(log,(n*dt).toFixed(1),'kmh',(car.speed*3.6).toFixed(0),'ang',car.driftAngle.toFixed(0),'drift',car.drifting,'yawR',car.yawRate.toFixed(2));}};
const I=(o)=>Object.assign({throttle:0,brake:0,handbrake:0,drift:0,steer:0},o);
run(5,I({throttle:1}));
console.log('entry kmh',(car.speed*3.6).toFixed(0));
run(2,I({throttle:1,steer:1,drift:1}),'左甩+Space');
run(1.5,I({throttle:1,steer:0.3}),'只按方向');
run(1,I({throttle:1,steer:-1,drift:1}),'反向切換');
run(1.5,I({throttle:0.5}),'全放開');
// 抓地模式全油門急轉不應打轉
const c2=new Vehicle(); const r2=(s,i)=>{for(let n=0;n<s*600;n++){if(n%10===0)c2.updateGearbox(dt*10,i);c2.step(dt,i,env);}};
r2(4,I({throttle:1})); let mx=0; for(let k=0;k<30;k++){r2(0.1,I({throttle:1,steer:1})); mx=Math.max(mx,Math.abs(c2.driftAngle));} console.log('抓地急轉最大角',mx.toFixed(0),'kmh',(c2.speed*3.6).toFixed(0));
