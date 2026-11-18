import {it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';

/** 原生建世界端到端黄金数据：App 建新世界时网页引擎实际执行的 generate(options) 与 nativeWorld()，
 * 四种地形模板 × 两种命名。仓库里只存每段 JSON 的长度与两个散列（文件小），完整输出写到
 * NATIVE_CREATION_DUMP 指定的本机目录供逐键比对。世界编号固定。用 EXPORT_NATIVE_WORLD=1 运行。 */
export const NATIVE_CREATION_CASES=[
  {seed:'421730',template:'continents',count:8,cityCount:80,relations:'peace',naming:'culture-generated',cultures:['chinese','japanese','english','arab','roman','german']},
  {seed:'421730',template:'continents',count:8,cityCount:80,relations:'peace',naming:'historical-names',cultures:[]},
  {seed:'777',template:'pangea',count:12,cityCount:120,relations:'war',naming:'culture-generated',cultures:['chinese','roman','persian','norse']},
  {seed:'777',template:'pangea',count:12,cityCount:120,relations:'war',naming:'historical-names',cultures:['chinese','roman','persian','norse']},
  {seed:'421730',template:'highIsland',count:5,cityCount:40,relations:'peace',naming:'culture-generated',cultures:[],climate:{precipitation:120,temperatureOffset:-4,north:0.6,south:-0.9}},
  {seed:'421730',template:'highIsland',count:5,cityCount:40,relations:'peace',naming:'historical-names',cultures:[]},
  {seed:'777',template:'archipelago',count:24,cityCount:80,relations:'war',naming:'culture-generated',cultures:[]},
  {seed:'777',template:'archipelago',count:24,cityCount:80,relations:'war',naming:'historical-names',cultures:['chinese','japanese','english','arab','roman','german']},
] as const;
export const DEFAULT_CLIMATE={precipitation:80,temperatureOffset:0,north:0.9,south:-0.9};

/** 两个 32 位散列（FNV-1a 与 djb2 变体），按 UTF-8 字节；Swift 端 NativeCreationTests 用同一算法。 */
export function digest(text:string){
  const bytes=new TextEncoder().encode(text);let a=0x811c9dc5,b=5381;
  for(const x of bytes){a=Math.imul(a^x,0x1000193)>>>0;b=(Math.imul(b,33)^x)>>>0;}
  return [bytes.length,a,b];
}
function parts(o:Record<string,unknown>){return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,digest(JSON.stringify(v))]));}

it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports native creation end-to-end digests',async()=>{
  let n=0;
  vi.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}` as `${string}-${string}-${string}-${string}-${string}`);
  const engine=await import('../native-bridge/engine');
  const dump=process.env.NATIVE_CREATION_DUMP;
  if(dump)await mkdir(dump,{recursive:true});
  const samples:unknown[]=[];
  for(const [i,c] of NATIVE_CREATION_CASES.entries()){
    n=0;
    const options={climate:'climate'in c?c.climate:DEFAULT_CLIMATE,seed:c.seed,template:c.template,count:c.count,cityCount:c.cityCount,relations:c.relations,naming:c.naming,cultures:c.cultures};
    const generated=JSON.parse(await engine.generate(JSON.stringify(options))) as {bin:string;meta:unknown;state:unknown};
    const nativeText=engine.nativeWorld(),world=JSON.parse(nativeText) as {run:Record<string,unknown>;statics:Record<string,unknown>};
    const {map,...statics}=world.statics as {map:{bin:string;meta:unknown}}&Record<string,unknown>;
    samples.push({options,
      run:parts(world.run),runKeys:Object.keys(world.run),statics:parts(statics),staticKeys:Object.keys(world.statics),
      map:{bin:digest(map.bin),meta:digest(JSON.stringify(map.meta))},state:digest(JSON.stringify(generated.state)),whole:digest(nativeText)});
    if(dump){
      await writeFile(`${dump}/case${i}-native.json`,nativeText);
      await writeFile(`${dump}/case${i}-state.json`,JSON.stringify(generated.state));
    }
  }
  expect(samples.length).toBe(NATIVE_CREATION_CASES.length);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/native-creation.json',JSON.stringify({samples}));
},3600000);
