import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('plan/tasks.json','utf8'));
const ids=new Set(data.tasks.map(t=>t.id));
if(ids.size!==data.tasks.length) throw new Error('Duplicate task IDs');
for(const task of data.tasks){
 if(!['todo','in_progress','blocked','done','pending_acceptance'].includes(task.status)) throw new Error(`Unknown status: ${task.id}`);
 if(!task.acceptance || !Array.isArray(task.dependsOn)) throw new Error(`Missing acceptance/dependencies: ${task.id}`);
 for(const dependency of task.dependsOn) if(!ids.has(dependency)) throw new Error(`Unknown dependency: ${dependency}`);
 if(task.status==='done' && (!task.evidence?.length || task.dependsOn.some(id=>data.tasks.find(t=>t.id===id).status!=='done'))) throw new Error(`Missing evidence or dependency for ${task.id}`);
 for(const evidence of task.evidence??[]) if(evidence.startsWith('docs/')&&!fs.existsSync(evidence.split('#')[0])) throw new Error(`Missing evidence file ${evidence}`);
}
console.log(`Plan checked: ${data.tasks.length} tasks; original v2 plan present: ${data.originalPlanPresent}`);
