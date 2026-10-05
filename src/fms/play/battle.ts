import type {Army,World,Point} from '../../compat/v0_4/sim/types';
import {createMilitaryCore} from './military-core';
import {unitProfile,type UnitAssignments} from './military-profile';
import {nationsAtWar} from './realtime-statecraft';
export interface Engagement {id:string;a:string;b:string|null;t:number;armies:string[];started:number;pulse:number;carry:Record<string,number>;losses:Record<string,number>}
export interface BattleState {version:1;nextId:number;engagements:Engagement[];plans:Record<string,{path:string[];targets:string[]}>}
export type BattleAction={type:'attack-route';armyId:string;targets:string[]}|{type:'withdraw';armyId:string};
export const initialBattles=():BattleState=>({version:1,nextId:1,engagements:[],plans:{}});
const alive=(a:Army)=>a.troops>0&&a.status!=='destroyed';
const log=(w:World,kind:'battle'|'order'|'retreat',text:string,reason:string)=>{w.events.push({id:w.nextEventId++,day:w.day,kind,text,reason});if(w.events.length>160)w.events.splice(0,w.events.length-160);};
const pos=(w:World,a:Army):Point=>{const p=w.provinces.find(p=>p.id===a.provinceId)!.center,q=w.provinces.find(p=>p.id===a.route[0])?.center??p;return {x:p.x+(q.x-p.x)*a.progress,y:p.y+(q.y-p.y)*a.progress};};
export function engagementPoint(w:World,e:Engagement):Point{const a=w.provinces.find(p=>p.id===e.a)!.center,b=w.provinces.find(p=>p.id===e.b)?.center??a;return {x:a.x+(b.x-a.x)*e.t,y:a.y+(b.y-a.y)*e.t};}
const rate=(w:World,a:Army,u:UnitAssignments)=>{if(!['marching','retreating'].includes(a.status)||!a.route.length)return 0;const p=w.provinces.find(p=>p.id===a.route[0])!,days={plain:2,forest:3,mountain:4}[p.terrain];return (a.supplies>0?1:.55)/Math.max(1,(days-(a.status==='retreating'?1:0))/unitProfile(u[a.id]).speed);};
function edge(a:Army){if(!a.route.length)return null;const [x,y]=[a.provinceId,a.route[0]].sort();return {a:x,b:y,t:a.provinceId===x?a.progress:1-a.progress,sign:a.provinceId===x?1:-1};}
function retreat(w:World,a:Army,core:ReturnType<typeof createMilitaryCore>){
  if(a.progress>0&&a.route.length){const from=a.provinceId,to=a.route[0],p=a.progress,loss=Math.min(a.troops,Math.max(1,Math.ceil(a.troops*.025)));a.troops-=loss;if(!a.troops){core.destroyArmy(w,a,'脱离路段接触时耗尽兵力。');return;}a.provinceId=to;a.route=[from];a.progress=1-p;a.status='retreating';log(w,'retreat',`${a.name}脱离接触，追击损失 ${loss}`,'一次扣除2.5%现有兵力，沿原路撤回并保留当前实际位置；撤退取消后续进攻路线。');}
  else core.forceRetreat(w,a);
}
function sync(w:World,s:BattleState,tick:number){
  // Existing contacts may lose enemies to a peace command or retreat.
  for(const e of s.engagements){e.armies=e.armies.filter(id=>{const a=w.armies.find(a=>a.id===id);return a&&alive(a)&&a.status==='fighting';});}
  const groups=new Map<string,{a:string;b:string|null;t:number;armies:Army[]}>();
  for(const a of w.armies.filter(alive).sort((a,b)=>a.id.localeCompare(b.id))){
    if(a.status==='retreating')continue;
    const at=edge(a);if(a.progress>0&&a.status!=='fighting')continue;
    const key=at&&a.progress>0?`${at.a}/${at.b}/${at.t.toFixed(8)}`:`node/${a.provinceId}`;
    const g=groups.get(key)??{a:at&&a.progress>0?at.a:a.provinceId,b:at&&a.progress>0?at.b:null,t:at&&a.progress>0?at.t:0,armies:[]};g.armies.push(a);groups.set(key,g);
  }
  for(const g of groups.values()){
    const participants=g.armies.filter(a=>g.armies.some(b=>nationsAtWar(w,a.nationId,b.nationId)));if(participants.length<2)continue;
    let e=s.engagements.find(e=>e.a===g.a&&e.b===g.b&&Math.abs(e.t-g.t)<1e-7);
    if(!e){e={id:`engagement-${s.nextId++}`,a:g.a,b:g.b,t:g.t,armies:[],started:tick,pulse:tick,carry:{},losses:{}};s.engagements.push(e);log(w,'battle',`${participants[0].name}遭遇敌军`,g.b?'双方在同一路段实际相遇并停止；战斗每十二个日内步同时结算。':'双方在同一路口接战；战斗持续结算，胜利后按进攻计划继续推进。');}
    for(const a of participants){a.status='fighting';if(!g.b){a.route=[];a.progress=0;}if(!e.armies.includes(a.id)){e.armies.push(a.id);e.carry[a.id]=0;e.losses[a.id]=0;}}
    e.armies.sort();
  }
}
function finish(w:World,s:BattleState){
  s.engagements=s.engagements.filter(e=>{
    const present=e.armies.flatMap(id=>{const a=w.armies.find(a=>a.id===id);return a&&alive(a)&&a.status==='fighting'?[a]:[];});
    const members=present.filter(a=>present.some(b=>nationsAtWar(w,a.nationId,b.nationId)));
    for(const a of present)if(!members.includes(a))a.status=a.route.length?'marching':'idle';
    if(members.some(a=>members.some(b=>nationsAtWar(w,a.nationId,b.nationId)))){e.armies=members.map(a=>a.id);for(const key of Object.keys(e.carry))if(!e.armies.includes(key)){delete e.carry[key];delete e.losses[key];}return true;}
    for(const a of members){a.status=a.route.length?'marching':'idle';}
    log(w,'battle',`${w.provinces.find(p=>p.id===e.a)!.name}附近交锋结束`,'敌对接触已解除；存活军队恢复剩余命令，和平领土仍禁止进攻。');return false;
  });
  for(const [id,plan] of Object.entries(s.plans)){
    const a=w.armies.find(a=>a.id===id);if(!a||!alive(a)||a.status==='retreating'){delete s.plans[id];continue;}
    const future=plan.path.slice(plan.path.indexOf(a.provinceId)+1);if(future.some(id=>{const p=w.provinces.find(p=>p.id===id)!;return p.controller!==a.nationId&&!nationsAtWar(w,a.nationId,p.controller);})){delete s.plans[id];if(a.route.length){a.route=a.progress>0?a.route.slice(0,1):[];if(!a.route.length&&a.status!=='fighting')a.status='idle';}log(w,'order',`${a.name}取消敌对进攻路线`,'后续目标已经和平；完成已进入的路段后按停战规则撤离。');continue;}
    if(a.status==='idle'){
      // Clearing the defenders does not complete a siege. Keep the remaining
      // plan, including its final waypoint, until this province is secured.
      const here=w.provinces.find(p=>p.id===a.provinceId)!;
      if(nationsAtWar(w,a.nationId,here.controller))continue;
      const i=plan.path.indexOf(a.provinceId),remaining=plan.path.slice(i+1);
      if(i<0||!remaining.length){delete s.plans[id];continue;}
      if(remaining.some(id=>{const p=w.provinces.find(p=>p.id===id)!;return p.controller!==a.nationId&&!nationsAtWar(w,a.nationId,p.controller);})){delete s.plans[id];log(w,'order',`${a.name}停止进攻路线`,'后续路线出现和平领土，已取消，不会和平越境。');continue;}
      a.route=remaining;a.progress=0;a.status='marching';
    }
  }
}
/** Reconcile deaths and diplomacy without spending time or applying damage. */
export function reconcileCombat(world:World,state:BattleState,tick:number){const w=structuredClone(world),s=structuredClone(state);finish(w,s);sync(w,s,tick);finish(w,s);return {world:w,battles:s};}
function contact(w:World){
  const armies=w.armies.filter(a=>alive(a)&&a.status!=='retreating'&&a.progress>0&&a.route.length).sort((a,b)=>a.id.localeCompare(b.id));
  for(let i=0;i<armies.length;i++)for(let j=i+1;j<armies.length;j++){const a=armies[i],b=armies[j],ea=edge(a)!,eb=edge(b)!;if(ea.a===eb.a&&ea.b===eb.b&&Math.abs(ea.t-eb.t)<1e-9&&nationsAtWar(w,a.nationId,b.nationId)){
    // Canonicalize floating point contact before creating a group. Keep an
    // established battlefield fixed when a moving reinforcement reaches it.
    const t=a.status==='fighting'?ea.t:b.status==='fighting'?eb.t:(ea.t+eb.t)/2;
    a.progress=ea.sign===1?t:1-t;b.progress=eb.sign===1?t:1-t;a.status='fighting';b.status='fighting';
  }}
}
function pulse(w:World,s:BattleState,u:UnitAssignments,tick:number,core:ReturnType<typeof createMilitaryCore>){
  for(const e of s.engagements){if(tick-e.pulse<12)continue;e.pulse=tick;
    const participants=e.armies.map(id=>w.armies.find(a=>a.id===id)!).filter(a=>alive(a)&&a.status==='fighting');
    const p=w.provinces.find(p=>p.id===e.a)!,powers=new Map(participants.map(a=>{const unit=unitProfile(u[a.id]);const defense=!e.b&&p.controller===a.nationId?{plain:1,forest:1.15,mountain:1.3}[p.terrain]*(1+Math.max(0,...w.cities.filter(c=>c.provinceId===p.id).map(c=>c.fort))*.12):1;const mountain=p.terrain==='mountain'?(!e.b&&p.controller===a.nationId?unit.mountainDefense:unit.mountainAttack):1;return [a.id,a.troops*(.35+a.morale*.0065)*(a.supplies>0?1:.5)*unit.power*mountain*defense];}));
    const damage=participants.map(a=>{const enemies=participants.filter(b=>nationsAtWar(w,a.nationId,b.nationId)),friendly=participants.filter(b=>b.nationId===a.nationId).length;const total=enemies.reduce((v,b)=>v+powers.get(b.id)!,0)*.0085/friendly+(e.carry[a.id]??0),loss=Math.min(a.troops,Math.floor(total));return {a,loss,carry:total-Math.floor(total)};});
    for(const {a,loss,carry} of damage){const before=a.troops;e.carry[a.id]=carry;e.losses[a.id]=(e.losses[a.id]??0)+loss;a.troops-=loss;a.morale=Math.max(0,a.morale-Math.max(.2,loss/Math.max(1,before)*45));}
    // One summary per simulated day plus explicit start/end/retreat events.
    if(tick-e.started>=120&&Math.floor((tick-e.started)/120)!==Math.floor((tick-e.started-12)/120))log(w,'battle',`${p.name}交锋损耗：${damage.map(({a})=>`${a.name}累计 −${e.losses[a.id]}`).join('；')}`,'每0.1日按敌方有效军力×0.85%均摊，同时结算，小数伤亡保留至下一次；道路交战无城防加成。');
    for(const {a} of damage)if(!a.troops){core.destroyArmy(w,a,'持续交锋耗尽兵力。');delete s.plans[a.id];}else if(a.troops<=120||a.morale<=20){retreat(w,a,core);delete s.plans[a.id];}
  }
}
/** Event-time movement: stop at a node or first swept same-edge contact before
 * spending the remainder of a tick. Stable IDs make pair selection independent
 * of army array order; unrelated crossing roads are not a shared battlefield. */
export function advanceCombat(world:World,state:BattleState,units:UnitAssignments,tick:number){
  const s=structuredClone(state),core=createMilitaryCore(units,true,true);
  let w=structuredClone({...world,provinces:[]}) as World;w.provinces=world.provinces.map(p=>({...p}));
  for(const a of w.armies)if(alive(a)&&a.progress===0&&a.status==='marching'&&nationsAtWar(w,a.nationId,w.provinces.find(p=>p.id===a.provinceId)!.controller)){a.status='idle';a.route=[];}
  contact(w);sync(w,s,tick);finish(w,s);let left=1/120,iterations=0;
  while(left>1e-10){if(++iterations>512)throw Error('交锋推进超出安全步数，已取消此批。');
    const armies=w.armies.filter(alive).sort((a,b)=>a.id.localeCompare(b.id));let dt=left;
    for(const a of armies){const v=rate(w,a,units);if(v)dt=Math.min(dt,Math.max(1e-10,(1-a.progress)/v));}
    for(let i=0;i<armies.length;i++)for(let j=i+1;j<armies.length;j++){
      const a=armies[i],b=armies[j],ea=edge(a),eb=edge(b);if(!ea||!eb||ea.a!==eb.a||ea.b!==eb.b||!nationsAtWar(w,a.nationId,b.nationId)||a.status==='retreating'||b.status==='retreating')continue;
      const va=rate(w,a,units)*ea.sign,vb=rate(w,b,units)*eb.sign,closing=va-vb,gap=eb.t-ea.t;if(Math.abs(closing)<1e-12||gap*closing<=0)continue;
      const t=gap/closing;if(t<=dt+1e-10&&t>1e-10)dt=Math.min(dt,t);
    }
    w=core.advanceMovement(w,Math.max(1e-10,dt));left-=dt;
    contact(w);
    sync(w,s,tick);finish(w,s);
  }
  pulse(w,s,units,tick,core);finish(w,s);core.resolveControl(w);
  return {world:w,battles:s};
}
export function previewBattle(w:World,state:BattleState,u:UnitAssignments,action:BattleAction){
  const invalid=(reason:string)=>({valid:false,reason,route:[] as string[],details:[] as string[]});
  if(!action||typeof action!=='object'||!['attack-route','withdraw'].includes(action.type)||Object.keys(action).sort().join('/')!==(action.type==='withdraw'?'armyId/type':'armyId/targets/type'))return invalid('交锋命令格式无效。');
  const a=w.armies.find(a=>a.id===action.armyId);if(!a||!alive(a))return invalid('军队不存在或已失去战斗力。');
  if(action.type==='withdraw'){
    if(!state.engagements.some(e=>e.armies.includes(a.id)))return invalid('这支军队当前没有交锋。');
    if(a.progress===0){const test=structuredClone(w),copy=test.armies.find(v=>v.id===a.id)!;createMilitaryCore(u,true,true).forceRetreat(test,copy);if(copy.status==='destroyed')return invalid('周围没有通向本国控制区的安全退路，无法主动撤退。');}
    return {valid:true,reason:'从当前交锋撤出，保留实际位置，取消进攻路线。',route:[] as string[],details:['路段中沿原路返回；路口交战沿安全路口撤向本国控制区。','脱离接触承受一次2.5%追击损失；后续移动不会重复扣除。']};
  }
  if(action.type!=='attack-route'||!Array.isArray(action.targets)||action.targets.length<1||action.targets.length>8||new Set(action.targets).size!==action.targets.length||action.targets.some(id=>typeof id!=='string'||!w.provinces.some(p=>p.id===id)))return invalid('请设置1—8个不重复的有效路点。');
  if(a.status==='fighting'||a.status==='retreating')return invalid('交战或撤退中不能重排进攻路线，请先脱离接触。');
  if(a.progress===0&&w.armies.some(b=>alive(b)&&b.status!=='retreating'&&b.progress===0&&b.provinceId===a.provinceId&&nationsAtWar(w,a.nationId,b.nationId)))return invalid('当前路口已有敌军，先处理交锋。');
  const temp=structuredClone(w),army=temp.armies.find(v=>v.id===a.id)!;
  // Planning beyond defenders is conditional, never an uninterrupted ETA.
  for(const other of temp.armies)if(other.id!==a.id){other.status='destroyed';other.troops=0;other.route=[];other.progress=0;}
  const core=createMilitaryCore(u,true,true),route:string[]=[];let days=0;
  for(const targetId of action.targets){const p=core.previewOrder(temp,{armyId:a.id,targetId,kind:'march'});if(!p.valid)return invalid(p.reason);route.push(...(route.length?p.route.slice(1):p.route));days+=p.days;temp.provinces.find(p=>p.id===targetId)!.controller=army.nationId;army.provinceId=targetId;army.route=[];army.progress=0;army.status='idle';}
  if(new Set(route).size!==route.length)return invalid('进攻路线不能折返重复经过同一辖区，请调整路点。');
  const guards=w.armies.filter(b=>alive(b)&&nationsAtWar(w,a.nationId,b.nationId)&&route.includes(b.provinceId));
  return {valid:true,reason:`按 ${action.targets.length} 个路点沿 ${route.length-1} 段道路进攻。`,route,details:[`仅行军约 ${days} 日；不含沿途交战与围攻。`,`每个敌方辖区都要驻军削减抵抗；未完成占领前，后续路点等待。`,guards.length?`已知沿线有 ${guards.length} 支敌军；先交锋，再推进占领。`:'空省也需要占领时间，抵达不会立即变色。','路段保留实际位置；和平国家禁止借道，撤退将取消整条计划。']};
}
export function applyBattle(world:World,state:BattleState,u:UnitAssignments,action:BattleAction){const p=previewBattle(world,state,u,action);if(!p.valid)throw Error(p.reason);const w=structuredClone(world),s=structuredClone(state),a=w.armies.find(a=>a.id===action.armyId)!,core=createMilitaryCore(u,true,true);
  if(action.type==='withdraw'){retreat(w,a,core);delete s.plans[a.id];finish(w,s);}
  else {a.route=p.route.slice(1);a.status='marching';s.plans[a.id]={path:p.route,targets:[...action.targets]};log(w,'order',`${a.name}执行进攻路线`,`${p.reason}${p.details.join('')}`);}
  return {world:w,battles:s};
}
export function assertBattles(s:BattleState,w:World,tick:number){
  const exact=(o:object,keys:string[])=>!!o&&typeof o==='object'&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
  const fail=()=>{throw Error('交锋或进攻路线数据无效，已保留原档。');};
  if(!exact(s,['version','nextId','engagements','plans'])||s.version!==1||!Number.isSafeInteger(s.nextId)||s.nextId<1||!Array.isArray(s.engagements)||s.engagements.length>500||!s.plans||typeof s.plans!=='object'||Array.isArray(s.plans))fail();
  const used=new Set<string>(),battleIds=new Set<string>();
  for(const e of s.engagements){if(!exact(e,['id','a','b','t','armies','started','pulse','carry','losses'])||!/^engagement-\d+$/.test(e.id)||Number(e.id.slice(11))>=s.nextId||battleIds.has(e.id)||!w.provinces.some(p=>p.id===e.a)||!Number.isFinite(e.t)||e.t<0||e.t>=1||(e.b===null?e.t!==0:!(e.a<e.b&&e.t>0&&w.provinces.find(p=>p.id===e.a)!.neighbors.includes(e.b)))||!Number.isInteger(e.started)||e.started<0||e.started>tick||!Number.isInteger(e.pulse)||e.pulse<e.started||e.pulse>tick||!Array.isArray(e.armies)||e.armies.length<2||e.armies.length>500||!exact(e.carry,e.armies)||!exact(e.losses,e.armies))fail();battleIds.add(e.id);
    const at=engagementPoint(w,e);for(const id of e.armies){const a=w.armies.find(a=>a.id===id);if(!a||!alive(a)||a.status!=='fighting'||used.has(id)||!Number.isFinite(e.carry[id])||e.carry[id]<0||e.carry[id]>=1||!Number.isSafeInteger(e.losses[id])||e.losses[id]<0)fail();used.add(id);const loc=edge(a!);if(e.b===null?a!.progress!==0||a!.provinceId!==e.a:!loc||loc.a!==e.a||loc.b!==e.b)fail();if(!e.armies.some(id=>{const b=w.armies.find(b=>b.id===id);return b&&nationsAtWar(w,a!.nationId,b.nationId);})||Math.hypot(pos(w,a!).x-at.x,pos(w,a!).y-at.y)>1e-5)fail();}
  }
  for(const a of w.armies)if(a.status==='fighting'&&a.progress>0&&!used.has(a.id))fail();
  for(const [id,p] of Object.entries(s.plans)){if(!exact(p,['path','targets'])||!w.armies.some(a=>a.id===id&&alive(a)&&a.status!=='retreating'&&p.path?.includes(a.provinceId))||!Array.isArray(p.path)||p.path.length<2||p.path.length>w.provinces.length||new Set(p.path).size!==p.path.length||p.path.some((id,i)=>!w.provinces.some(q=>q.id===id)||(i>0&&!w.provinces.find(q=>q.id===p.path[i-1])!.neighbors.includes(id)))||!Array.isArray(p.targets)||p.targets.length<1||p.targets.length>8||p.targets.some((id,i)=>!p.path.includes(id)||(i>0&&p.path.indexOf(id)<=p.path.indexOf(p.targets[i-1])))||p.targets.at(-1)!==p.path.at(-1))fail();}
}
