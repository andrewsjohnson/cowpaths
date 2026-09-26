import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildScene, DEFAULTS } from '../src/journey/scene.mjs';
import { validateHistory } from '../src/journey/data.mjs';
import { validateSettings } from '../src/journey/project.mjs';
import { trailEnvelope, attractionAt } from '../src/journey/attractors.mjs';
const history=validateHistory(JSON.parse(await readFile(new URL('../examples/history-small.json',import.meta.url))));
test('attractor lifetime eases from zero, reaches full strength, and dies smoothly',()=>{
  for(const t of [-1,0,1,2])assert.equal(trailEnvelope(t),0);
  assert.equal(trailEnvelope(.5),1);
  for(let i=1;i<=20;i++)assert.ok(trailEnvelope(i*.01)>=trailEnvelope((i-1)*.01));
  for(let i=70;i<100;i++)assert.ok(trailEnvelope((i+1)*.01)<=trailEnvelope(i*.01));
  // Both value and endpoint slope vanish; no impulsive birth or death.
  assert.ok(trailEnvelope(1e-5)/1e-5<1e-6);
  assert.ok(trailEnvelope(1-1e-5)/1e-5<1e-6);
});
test('field attracts locally in 3D, rejects self influence, and has no singularities',()=>{
  const source={id:'s',start:0,end:1,points:[[0,0,0],[1,0,0]],radius:.1,strength:1,spin:.45};
  const force=attractionAt([.5,.05,0],.5,[source]);
  assert.ok(force[1]<0 && force[2]!==0,'attraction and weak circulation should both act');
  assert.deepEqual(attractionAt([.5,.11,0],.5,[source]),[0,0,0]);
  assert.deepEqual(attractionAt([.5,0,.11],.5,[source]),[0,0,0],'projection overlap alone must not couple distant depths');
  assert.deepEqual(attractionAt([.5,.05,0],.5,[source],'s'),[0,0,0]);
  assert.deepEqual(attractionAt([.5,0,0],.5,[source]),[0,0,0]);
  for(const t of [0,1])assert.deepEqual(attractionAt([t,.05,0],t,[source]),[0,0,0]);
  const crowded=attractionAt([.5,.05,0],.5,Array(100).fill(source));
  assert.ok(crowded.every(Number.isFinite) && Math.hypot(...crowded)<.1,'overlapping sources must not explode');
});
test('zero detail restores renderer 1.3 exactly; active sources are actual stable order trails',()=>{
  const base=buildScene(history,{rendererVersion:'1.3.0'}),off=buildScene(history,{detail:0,attraction:0});
  assert.deepEqual(off.trajectories,base.trajectories);
  assert.equal(createHash('sha256').update(JSON.stringify(base.trajectories)).digest('hex'),'7add468182f77e6a4cbdf4bbb308f79a95919204d7718378076814078ee6ca60');
  const divergence=buildScene(history,{attraction:0}),active=buildScene(history);
  const guides=new Map(divergence.trajectories.filter(p=>p.kind==='submission').map(p=>[p.id,p]));
  for(const source of active.attractors){
    assert.ok(guides.has(source.id));
    assert.deepEqual(active.trajectories.find(p=>p.id===source.id).points,guides.get(source.id).points);
  }
  assert.notDeepEqual(active.trajectories,divergence.trajectories,'neighbors should respond to the attractors');
  assert.equal(active.trajectories.length,base.trajectories.length);
  assert.deepEqual(active.trajectories.map(p=>[p.id,p.parentId]),base.trajectories.map(p=>[p.id,p.parentId]));
});
test('maximum controls remain finite and attraction stays a local displacement',()=>{
  const settings={...DEFAULTS,detail:1.5,attraction:1.5,attractorRadius:.1};
  const base=buildScene(history,{...settings,attraction:0}),active=buildScene(history,settings);
  let changed=0,max=0;
  active.trajectories.forEach((path,i)=>path.points.forEach((p,j)=>{
    assert.ok(p.every(Number.isFinite));
    const distance=Math.hypot(...p.map((v,k)=>v-base.trajectories[i].points[j][k]));
    max=Math.max(max,distance);if(distance>1e-8)changed++;
  }));
  assert.ok(changed>0 && max<.065,`field escaped its neighborhood: ${max}`);
  for(const settings of [{detail:-1},{attraction:2},{attractorRadius:0},{attractorRadius:Infinity}])assert.throws(()=>validateSettings(settings));
});
