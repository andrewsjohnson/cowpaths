import { clamp, lerp, frameAt } from './math.mjs';
const smooth = x => { const u = clamp(x); return u*u*u*(10 + u*(-15 + 6*u)); };
// Shared sculpture: a rising fold, open upper loop, and returning lower sweep.
// All data strands sample this same surface rather than selecting destinations.
const knots = [
  [.425,.595,.02], [.26,.71,.04], [.18,.50,.20], [.39,.29,.20],
  [.70,.35,-.10], [.77,.16,-.25], [.58,.22,-.10], [.44,.50,.17],
  [.75,.70,.30], [.59,.84,.30], [.35,.61,-.12], [.80,.47,-.24]
];
// Natural cubic interpolation is C2: offset strands do not kink at knots.
const second = knots.map(() => [0,0,0]);
for (let k=0;k<3;k++) {
  const upper=[], rhs=[];
  for(let i=1;i<knots.length-1;i++) {
    const divisor=4-(upper[i-1]??0);
    upper[i]=1/divisor;
    rhs[i]=(6*(knots[i+1][k]-2*knots[i][k]+knots[i-1][k])-(rhs[i-1]??0))/divisor;
  }
  for(let i=knots.length-2;i>0;i--) second[i][k]=rhs[i]-upper[i]*second[i+1][k];
}
function center(u) {
  const pos=clamp(u)*(knots.length-1),i=Math.min(knots.length-2,Math.floor(pos)),b=pos-i,a=1-b;
  return knots[i].map((v,k)=>a*v+b*knots[i+1][k]+((a*a*a-a)*second[i][k]+(b*b*b-b)*second[i+1][k])/6);
}
export function ribbonPoint(u, lane, depth = 0) {
  const p = center(u), a = center(Math.max(0,u-.0002)), b=center(Math.min(1,u+.0002));
  const heading = Math.atan2(b[1]-a[1],b[0]-a[0]);
  const width = .60 + 1.15 * Math.sin(u*9+.5)**2;
  const twist = u*14-.8, offset = lane * width;
  return [p[0]-Math.sin(heading)*offset*Math.cos(twist),.5+(p[1]+Math.cos(heading)*offset*Math.cos(twist)-.5)*.93,p[2]+offset*Math.sin(twist)*2+depth];
}
function channels(flow, u) {
  let lane=flow.base, depth=0;
  for (const band of flow.bands) {
    const mix=smooth((u-band.start)/band.release);
    lane += (band.lane + band.wave*Math.sin((u-band.start)*36))*mix;
    depth += band.depth*mix;
  }
  return { lane,depth };
}
function sample(flow,u) { const {lane,depth}=channels(flow,u); return ribbonPoint(u,lane,depth); }
export function clinicRibbon(start,end,lane) {
  const flow={start,end,base:lane,bands:[]};
  const count=Math.max(2,Math.ceil((end-start)*1800));
  return {flow,points:Array.from({length:count},(_,i)=>sample(flow,lerp(start,end,i/(count-1))))};
}
export function branchRibbon(parent,fraction,length,lane,wave=0,depth=0) {
  const start=lerp(parent.flow.start,parent.flow.end,fraction), end=start+(1-start)*length;
  const flow={start,end,base:parent.flow.base,bands:[...parent.flow.bands,{start,release:Math.min(.06,(end-start)*.45),lane,wave,depth}]};
  const steps=Math.max(18,Math.ceil((end-start)*2000));
  const points=Array.from({length:steps+1},(_,i)=>sample(flow,lerp(start,end,i/steps)));
  const frame=frameAt(parent.points,fraction), origin=frame.position, ideal=points[0];
  const delta=origin.map((v,k)=>v-ideal[k]);
  const firstLength=Math.hypot(points[1][0]-ideal[0],points[1][1]-ideal[1]);
  const tangent=[Math.cos(frame.heading)*firstLength,Math.sin(frame.heading)*firstLength,frame.slope*firstLength];
  const error=points[1].map((v,k)=>origin[k]+tangent[k]-(v+delta[k]));
  // Correct only polyline interpolation error, fading with zero end slope.
  // The first edge exactly matches the actual drawn parent's forward tangent.
  for(let i=0;i<points.length;i++) {
    const fade=1-smooth(Math.max(0,i-1)/12);
    points[i]=points[i].map((v,k)=>v+(delta[k]+error[k]*i)*fade);
  }
  points[0]=[...origin];
  return {flow,points};
}
