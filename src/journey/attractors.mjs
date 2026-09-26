import { clamp, hash, random, lerp, pointAt, frameAt, TAU } from './math.mjs';
import { ribbonPoint } from './ribbon.mjs';
const smooth = x => { const t=clamp(x);return t*t*t*(10+t*(-15+6*t)); };
/** C2 birth/death envelope, exactly zero outside the source trail's lifetime. */
export function trailEnvelope(t) {
  if(t<=0 || t>=1) return 0;
  return smooth(t/.22)*smooth((1-t)/.32);
}
const norm = p => {const d=Math.hypot(...p)||1;return p.map(v=>v/d);};
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// The same local frame for all nearby paths keeps perturbations attached to
// the ribbon's 3D orientation, including places that overlap in projection.
const basis=Array.from({length:513},(_,i)=>{
  const u=i/512,p=ribbonPoint(u,0),edge=ribbonPoint(u,.02),a=ribbonPoint(Math.max(0,u-.0005),0),b=ribbonPoint(Math.min(1,u+.0005),0);
  const normal=norm(edge.map((v,k)=>v-p[k])),tangent=norm(b.map((v,k)=>v-a[k]));
  return [...normal,...norm(cross(tangent,normal))];
});
function basisAt(u) {const q=clamp(u)*512,i=Math.min(511,Math.floor(q));return basis[i].map((v,k)=>lerp(v,basis[i+1][k],q-i));}
function attach(points,parent,fraction) {
  const frame=frameAt(parent.points,fraction),origin=frame.position,ideal=points[0];
  const delta=origin.map((v,k)=>v-ideal[k]),length=Math.hypot(points[1][0]-ideal[0],points[1][1]-ideal[1]);
  const first=[Math.cos(frame.heading)*length,Math.sin(frame.heading)*length,frame.slope*length];
  const error=points[1].map((v,k)=>origin[k]+first[k]-(v+delta[k]));
  for(let i=0;i<Math.min(points.length,14);i++) {
    const fade=1-smooth(Math.max(0,i-1)/12);
    points[i]=points[i].map((v,k)=>v+(delta[k]+error[k]*i)*fade);
  }
  points[0]=[...origin];
}
function diverge(paths,settings) {
  if(settings.detail===0) return;
  const parents=new Map(),packets=new Map();
  const scale={submission:.018,pharmacy:.009,recipient:.0045,stock:.0045,medication:.0022};
  for(const path of paths) {
    if(path.kind==='clinic'){parents.set(path.id,path);packets.set(path.id,[]);continue;}
    const rng=random(`${settings.seed}/${path.id}/detail`);
    const packet={start:path.flow.start,end:path.flow.end,amplitude:scale[path.kind]*settings.detail*(.6+rng()*.8),phase:rng()*TAU,frequency:.8+rng()*1.2};
    const inherited=[...packets.get(path.parentId),packet];packets.set(path.id,inherited);
    path.points=path.points.map((p,i)=>{
      const u=lerp(path.flow.start,path.flow.end,i/(path.points.length-1));let a=0,b=0;
      for(const wave of inherited){
        const t=(u-wave.start)/(wave.end-wave.start),e=trailEnvelope(t);if(!e)continue;
        const phase=t*TAU*wave.frequency+wave.phase,amp=wave.amplitude*e;
        a+=amp*(Math.sin(phase)+.28*Math.sin(phase*2.7)+.09*Math.sin(phase*6.1));
        b+=amp*.42*Math.cos(phase*1.3);
      }
      const frame=basisAt(u);return p.map((v,k)=>v+frame[k]*a+frame[k+3]*b);
    });
    attach(path.points,parents.get(path.parentId),path.parentFraction);parents.set(path.id,path);
  }
}
export function selectAttractors(paths,settings) {
  if(settings.attraction===0) return [];
  const sources=paths.filter(p=>p.kind==='submission').sort((a,b)=>hash(`${settings.seed}/${a.id}/attractor`)-hash(`${settings.seed}/${b.id}/attractor`)||a.id.localeCompare(b.id)).slice(0,32);
  return sources.map(path=>{
    const rng=random(`${settings.seed}/${path.id}/attractor-shape`),radius=settings.attractorRadius*[.4,.8,1.4][hash(path.id)%3];
    return {id:path.id,start:path.flow.start,end:path.flow.end,points:path.points,radius,strength:settings.attraction*(.65+rng()*.35),spin:(rng()<.5?-1:1)*.45};
  });
}
/** Local bounded attraction plus a weak tangential component; no point masses. */
export function attractionAt(p,u,sources,excludeId) {
  let fx=0,fy=0,fz=0,total=0;
  for(const source of sources){
    if(source.id===excludeId || u<=source.start || u>=source.end)continue;
    const t=(u-source.start)/(source.end-source.start),pos=t*(source.points.length-1),i=Math.min(source.points.length-2,Math.floor(pos)),mix=pos-i;
    const a=source.points[i],b=source.points[i+1];
    const dx=lerp(a[0],b[0],mix)-p[0],dy=lerp(a[1],b[1],mix)-p[1],dz=lerp(a[2],b[2],mix)-p[2];
    const r2=(dx*dx+dy*dy+dz*dz)/(source.radius*source.radius);if(r2>=1)continue;
    const w=(1-r2)**3*trailEnvelope(t)*source.strength;
    const tx=b[0]-a[0],ty=b[1]-a[1],tz=b[2]-a[2],inv=1/(Math.hypot(tx,ty,tz)||1),spin=source.spin*inv;
    fx+=w*(dx+(ty*dz-tz*dy)*spin);fy+=w*(dy+(tz*dx-tx*dz)*spin);fz+=w*(dz+(tx*dy-ty*dx)*spin);total+=w;
  }
  const divisor=Math.max(1,total);return [fx/divisor,fy/divisor,fz/divisor];
}
export function applyTrailDetails(paths,settings) {
  if(settings.detail===0 && settings.attraction===0)return [];
  diverge(paths,settings);
  const sources=selectAttractors(paths,settings);if(!sources.length)return [];
  const sourceIds=new Set(sources.map(s=>s.id)),parents=new Map(),offsets=new Map();
  const buckets=Array.from({length:128},()=>[]);
  for(const source of sources)for(let i=Math.floor(source.start*128);i<=Math.min(127,Math.floor(source.end*128));i++)buckets[i].push(source);
  for(const path of paths){
    const baseline=path.points;
    if(path.kind==='clinic' || sourceIds.has(path.id)){
      parents.set(path.id,path);offsets.set(path.id,baseline.map(()=>[0,0,0]));continue;
    }
    let offset=pointAt(offsets.get(path.parentId),path.parentFraction);
    path.points=baseline.map((p,i)=>{
      const u=lerp(path.flow.start,path.flow.end,i/(baseline.length-1));
      const force=attractionAt(p,u,buckets[Math.min(127,Math.floor(u*128))],path.id);
      const ds=i?Math.hypot(...p.map((v,k)=>v-baseline[i-1][k])):0,alpha=1-Math.exp(-ds/.012);
      offset=offset.map((v,k)=>lerp(v,force[k],alpha));
      const magnitude=Math.hypot(...offset),cap=settings.attractorRadius*.35*settings.attraction;
      if(magnitude>cap)offset=offset.map(v=>v*cap/magnitude);
      return p.map((v,k)=>v+offset[k]);
    });
    attach(path.points,parents.get(path.parentId),path.parentFraction);
    offsets.set(path.id,path.points.map((p,i)=>p.map((v,k)=>v-baseline[i][k])));parents.set(path.id,path);
  }
  return sources.map(({points,...source})=>source);
}
