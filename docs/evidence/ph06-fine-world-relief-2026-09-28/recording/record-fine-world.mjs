import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const archive='docs/evidence/ph06-fine-world-relief-2026-09-28', a=read(`${archive}/verification.json`), v=read(`${archive}/visual-review.json`);
if(!a.archiveComplete||!a.unit.passed||a.browsers.length!==3||!v.reviewedByRoot||v.buildJsonSha256!==a.buildJsonSha256||hash('dist/build.json')!==a.buildJsonSha256)throw Error('Actual reviewed evidence required');
const at=new Date().toISOString(), head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report='docs/evidence/2026-09-28-ph06-fine-world-relief.md';
fs.writeFileSync(report,`# PH06 新大陆真实细山脊 preview.20

记录 ${at}；检查基于 ${head} 加本批工作区修改。最终提交以 Git 与检查点为准。实际 build.json SHA256 ${a.buildJsonSha256}；全部源码与产物哈希见归档，单独 build.json 不能替代完整产物指纹。

## 实际改变

首次自然大陆与追加大陆显式采用 fine-world 高程规划：2 world 细采样、独立于粗模拟网格的脊宽、较低而收窄的山肩、沿弧长连续变化的真实脊宽。实际结果写入持久化细高程，渲染与拾取继续读取同一份数据。原 world 默认和 local 模式的逐值 oracle 保留；现有世界不迁移或重生成。

受控候选同形状在128/256/512粗网格上测得峰部半高带宽均24 world、峰高约2110m；旧128基线半高带宽88 world。测量原件在 initial-candidate/measurements.json，原样保留其候选范围，生产统一测试另核这组比较；数值结果不是自然视觉通过。

原 preview18 的11类实际生成指纹按命名空间加入存储历史，允许读取与恢复，禁止拿旧指纹执行新算法；实际源闭包重新计算。历史原件在相邻 ph06-preview18-generator-history-2026-09-28 目录，未改写旧 build.commit。

## 检查与失败修复

首轮136项中130项通过，writer文件的 beforeAll 在小大陆触发“山系局部密度超出有界查询预算”，其6项没有执行，因此整轮失败且未构建。诊断原件及随后修复轮全部保留。修复保留实际山脉节点和原192候选/262144引用上限；索引改变与内存影响以 density-repair 原始报告为准，不宣称原内存布局不变。

最终20个相关测试文件 ${a.unit.passedAssertions}/${a.unit.total} 通过；全局计划、lint、类型、生产构建、产物审查通过。全部11项当前/冻结源码闭包重新核验，旧引擎指纹未变。19的水文内部检查作为同源历史证据引用，本轮不重复计数。

| 浏览器仿真 | 完整流程耗时 | 结果 |
|---|---:|---|
${a.browsers.map(b=>`| ${b.project} | ${(b.elapsedMs/1000).toFixed(3)} 秒 | PASS，450秒，零重试 |`).join('\n')}

三端实际原生绘两陆、确认保存、追加时旧陆保护、撤销、重复追加、刷新恢复、同粗格细岸两侧拾取和重叠拒绝；手机/平板所有按钮用 tap，等实际修订再读取存档，不以预览的 ready 冒充已提交。截图新增真实最高粗采样格附近的中近景观察，不是预制展示。整个流程耗时包含独立读库和检查，不能当作单次生成或性能通过。

## 实际画面与剩余事项

${v.observations.join('\n\n')}

自然视觉、用户视觉、真机、整体PH与完整性能均未通过。PH06-T3/T4、PH07-T1保持in_progress，依赖不变。新Atlas仍无国家、行政区、城市、首都、兵种与战争；旧0.4独立能力不能算新版接入。下一批继续沿岸分区形态与山系主轴的模板感，再接续真实河湖和后续国家行政主线；不创建空面板。

[原件与完整清单](ph06-fine-world-relief-2026-09-28/verification.json)。仅本地临时验证构建与提交，无push、上传或部署。
`,{flag:'wx'});
const plan=read('plan/tasks.json'),phase=plan.tasks.find(t=>t.id==='PH06');
for(const item of [phase,...phase.workItems.filter(t=>['PH06-T3','PH06-T4'].includes(t.id))]){if(item.status!=='in_progress')throw Error('Unexpected phase state');for(const p of [report,`${archive}/verification.json`])if(!item.evidence.includes(p))item.evidence.push(p);}
fs.writeFileSync('plan/tasks.json',JSON.stringify(plan,null,2)+'\n');
let r=fs.readFileSync('README.md','utf8');r=r.replace(/本地最新源码与构建为[^\n]+/,`本地最新源码与构建为 \`0.5.0-preview.20\`。新大陆与追加大陆使用真实细山脊，脊宽不再随粗模拟格成倍变宽，原草稿与局部编辑规则保留。${a.unit.passedAssertions}/${a.unit.total}相关检查及桌面/手机/平板原生两大陆保存、追加、撤销、刷新流程通过，见[本地记录](${report})；仿真不等于真机。19的只读地形流向继续保留。`);fs.writeFileSync('README.md',r);
let h=fs.readFileSync('docs/AUTO_HANDOFF.md','utf8');
h=h.replace(/更新：[^\n]+/,`更新：${at}。先核实际Git、源码与dist；旧证据保留。`);
h=h.replace(/- 分支codex\/ph06-world-generation；[^\n]+/,`- 分支codex/ph06-world-generation；检查基于HEAD ${head}加本批修改。preview.20已检查待本地提交，最终提交以git log与.autopilot/checkpoint.json核实。`);
h=h.replace(/- 实际0\.5\.0-preview\.19[^\n]+/,`- 实际0.5.0-preview.20，build.json SHA256 ${a.buildJsonSha256}。${a.unit.passedAssertions}/${a.unit.total}相关检查与三端完整原生绘图/追加/撤销/刷新通过；[本批记录](evidence/2026-09-28-ph06-fine-world-relief.md)。首轮小大陆密度失败保留。`);
h=h.replace('## 最新实证','## 最新实证\n\npreview.20接入细山脊高程与真实18历史恢复。旧默认/local逐值保留；小大陆密度错误已修复。自然视觉仍未通过，真实中近景与所有失败见本批归档。19流向与触摸修复记录如下。');
h=h.replace(/- 下一批先处理用户指出的宽软山体：[\s\S]*?不堆空面板。/, '- preview.20细山脊已接入并检查；下一批沿岸分区候选在.autopilot/ph06/regional-coast-staging，仅候选且未提升。还须消除固定S形山系观感，保持真实高程/细岸/旧存档。随后继续跨页流域、真实水量/河湖与版本化持久层；国家行政城市军队仍依主计划，不堆空面板。');
fs.writeFileSync('docs/AUTO_HANDOFF.md',h);
const c=read('.autopilot/checkpoint.json');c.updatedAt=at;c.head=head;c.currentFocus='Preview20 fine-world height and bounded index repair checked in real game; natural visual still open.';c.currentBatch={id:'ph06-fine-world-relief',status:'checked-awaiting-local-commit',sourceChangesUncommitted:true,actualDistVersion:'0.5.0-preview.20',buildJsonSha256:a.buildJsonSha256,unitPassed:a.unit.passedAssertions,unitTotal:a.unit.total,browserPassed:true,phaseAccepted:false,naturalVisualAccepted:false,cloudWrites:false,evidence:`${archive}/verification.json`};c.nextTask='Review staged regional coast source and prove preserved handdrawn shape/straits; freeze actual20 identities before any new generator changes. Continue genuine hydrology, then dependent phases; no cloud.';fs.writeFileSync('.autopilot/checkpoint.json',JSON.stringify(c,null,2)+'\n');
console.log(JSON.stringify({report,version:a.version,unit:a.unit.total,browsers:a.browsers.length}));
