import { Vehicle } from '../src/vehicle.js';
const car = new Vehicle(); const env={gx:0,gz:0}; const dt=1/600;
const inp={throttle:0.6,brake:0,handbrake:0,steer:0};
for (let n=0;n<600*6;n++){ if(n%10===0) car.updateGearbox(dt*10,inp); car.step(dt,inp,env);
 if(n%300===0) console.log((n*dt).toFixed(1),(car.speed*3.6).toFixed(1),car.gear,car.rpm.toFixed(0),car.limiter.toFixed(3),car.shiftTimer.toFixed(2),'sx',car.wheels[2].sx.toFixed(3),'Fx',(car.wheels[2].Fx+car.wheels[3].Fx).toFixed(0));}
