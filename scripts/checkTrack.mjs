import { buildCenterline } from '../src/trackLayout.js';
import { writeFileSync } from 'fs';
const p = buildCenterline(2);
let minD = 1e9, at = null;
for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
  if (p[j].s - p[i].s < 80) continue;
  const d = Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z);
  if (d < minD) { minD = d; at = [p[i].s, p[j].s, p[i].h - p[j].h]; }
}
const L = p[p.length - 1].s;
console.log('length', L.toFixed(0), 'drop', p[p.length-1].h.toFixed(1), 'minDist(non-local)', minD.toFixed(1), 'at s', at.map(v=>v.toFixed(0)));
const xs = p.map(q=>q.x), zs = p.map(q=>q.z);
const mnx=Math.min(...xs), mxx=Math.max(...xs), mnz=Math.min(...zs), mxz=Math.max(...zs);
console.log('bbox', mnx.toFixed(0), mxx.toFixed(0), mnz.toFixed(0), mxz.toFixed(0));
const sc = 800 / Math.max(mxx-mnx, mxz-mnz);
const path = p.map((q,i)=>`${i?'L':'M'}${((q.x-mnx)*sc+20).toFixed(1)},${((mxz-q.z)*sc+20).toFixed(1)}`).join('');
writeFileSync(process.argv[2], `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="840"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="none" stroke="#333" stroke-width="${9*sc}"/><circle cx="${(p[0].x-mnx)*sc+20}" cy="${(mxz-p[0].z)*sc+20}" r="6" fill="green"/></svg>`);
