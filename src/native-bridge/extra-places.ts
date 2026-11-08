/** More place names for new worlds, so that one world's map does not read like the last one's. */
const list=(s:string)=>s.split(' ');
export const EXTRA_PLACES:Record<string,string[]>={
  chinese:list('姑苏 会稽 彭城 下邳 寿春 襄阳 江陵 夷陵 汉中 剑阁 阆中 晋阳 上党 邺城 涿郡 渔阳 辽西 敦煌 酒泉 张掖 武威 金城 天水 陈仓 潼关 虎牢 宛城 濮阳 临淄 即墨 琅琊 广陵 建业 吴兴 豫章 庐陵 桂阳 零陵 番禺 交趾'),
  japanese:list('甲斐 信浓 越后 尾张 三河 美浓 近江 伊势 纪伊 播磨 备前 出云 周防 长门 土佐 伊予 肥前 萨摩 陆奥 出羽'),
  english:list('温彻斯特 坎特伯雷 诺丁汉 兰开斯特 约克郡 德比 什鲁斯伯里 伍斯特 埃克塞特 普利茅斯 诺维奇 林肯 卡莱尔 达勒姆 斯特灵 珀斯 阿伯丁 卡迪夫 斯旺西 班戈'),
  arab:list('巴士拉 库法 摩苏尔 阿勒颇 霍姆斯 大马士革 耶路撒冷 麦加 麦地那 塔伊夫 萨那 亚丁 马斯喀特 凯鲁万 非斯 马拉喀什 突尼斯 的黎波里 班加西 科尔多瓦'),
  roman:list('拉文纳 卡普亚 塔兰托 布林迪西 叙拉古 卢格杜努姆 马西利亚 塔拉科 迦太基 乌提卡 亚历山大 安条克 尼科米底亚 塞萨洛尼基 特里尔 科洛尼亚 伦敦尼姆 约克 米底奥拉努姆 帕塔维翁'),
  french:list('里昂 马赛 图卢兹 波尔多 南特 兰斯 鲁昂 第戎 奥尔良 图尔 普瓦捷 阿维尼翁 格勒诺布尔 斯特拉斯堡 梅斯 南锡 里尔 卡昂 布雷斯特 蒙彼利埃'),
  german:list('科隆 美因茨 特里尔 亚琛 法兰克福 纽伦堡 奥格斯堡 雷根斯堡 乌尔姆 慕尼黑 德累斯顿 莱比锡 马格德堡 吕贝克 不来梅 汉堡 柯尼斯堡 但泽 波森 布雷斯劳'),
  greek:list('雅典 斯巴达 底比斯 科林斯 阿尔戈斯 德尔斐 迈锡尼 以弗所 米利都 帕加马 罗德 克里特 萨摩斯 莱斯沃斯 希俄斯 色雷斯 马其顿 伊庇鲁斯 色萨利 拜占庭'),
  persian:list('波斯波利斯 帕萨尔加德 苏萨 埃克巴坦那 泰西封 伊斯法罕 设拉子 大不里士 内沙布尔 赫拉特 木鹿 巴尔赫 撒马尔罕 布哈拉 雷伊 哈马丹 克尔曼 亚兹德 马什哈德 加兹温'),
  slavic:list('基辅 诺夫哥罗德 莫斯科 弗拉基米尔 苏兹达尔 梁赞 特维尔 普斯科夫 斯摩棱斯克 切尔尼戈夫 喀山 阿斯特拉罕 下诺夫哥罗德 雅罗斯拉夫尔 布拉格 布尔诺 贝尔格莱德 索非亚 萨格勒布 卢布尔雅那'),
  norse:list('乌普萨拉 特隆赫姆 卑尔根 奥斯陆 斯塔万格 哥特兰 比尔卡 海泽比 罗斯基勒 奥胡斯 雷克雅未克 法罗 奥克尼 设得兰 都柏林 约维克 拉德加 托尔斯港 卡尔马 隆德'),
  indian:list('华氏城 曲女城 德里 阿格拉 拉合尔 木尔坦 瓦拉纳西 乌贾因 坦焦尔 马杜赖 迈索尔 海得拉巴 浦那 孟买 加尔各答 达卡 克什米尔 阿约提亚 马图拉 甘吉布勒姆'),
  korean:list('汉城 开城 平壤 庆州 全州 公州 扶余 忠州 清州 大邱 釜山 晋州 咸兴 义州 江陵 原州 春川 罗州 济州 尚州'),
  mongol:list('和林 上都 大都 乌里雅苏台 科布多 库伦 呼和浩特 集宁 克鲁伦 斡难 阴山 贺兰 额尔古纳 土拉 鄂尔浑 色楞格 阿尔泰 杭爱 肯特 戈壁'),
  turkic:list('伊斯坦布尔 布尔萨 埃迪尔内 安卡拉 科尼亚 开塞利 特拉布宗 埃尔祖鲁姆 伊兹密尔 安塔利亚 喀什 于阗 龟兹 高昌 碎叶 怛罗斯 花剌子模 希瓦 浩罕 塔什干'),
  egyptian:list('孟菲斯 底比斯 赫利奥波利斯 卢克索 阿斯旺 阿拜多斯 塞易斯 坦尼斯 布巴斯提斯 法尤姆 象岛 卡纳克 尼科波利斯 瑙克拉提斯 西奈 努比亚 库施 麦罗埃 纳帕塔 亚历山大'),
  spanish:list('托莱多 塞维利亚 格拉纳达 巴伦西亚 萨拉戈萨 巴塞罗那 潘普洛纳 布尔戈斯 莱昂 萨拉曼卡 卡斯蒂利亚 阿拉贡 纳瓦拉 加的斯 马拉加 穆尔西亚 巴利亚多利德 奥维耶多 圣地亚哥 科尔多瓦'),
  italian:list('威尼斯 热那亚 佛罗伦萨 比萨 米兰 帕多瓦 维罗纳 博洛尼亚 锡耶纳 费拉拉 曼图亚 乌尔比诺 那不勒斯 巴勒莫 墨西拿 阿马尔菲 卢卡 都灵 帕尔马 摩德纳'),
};
/** A deterministic shuffle: the same seed gives the same map. */
function hash(s:string){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x1000193)>>>0;}return h;}
type Named={id:string;name:string};
/** Renames about half of each culture's cities (and their provinces) from the extra list, leaving no duplicates. Capitals keep theirs: states are named after them. */
export function varyPlaceNames(run:{world:{nations:{capitalId:string}[];cities:(Named&{provinceId:string})[];provinces:Named[]};civilization:{cities:Record<string,{cultureId:string;name:{value:string}}>}},seed:string){
  const used=new Set(run.world.cities.map(c=>c.name));
  const pools:Record<string,string[]>={},capitals=new Set(run.world.nations.map(n=>n.capitalId));
  for(const city of run.world.cities){
    const civ=run.civilization.cities[city.id];
    const extra=civ&&EXTRA_PLACES[civ.cultureId];
    if(!extra||capitals.has(city.id)||hash(seed+'|'+city.id)%2)continue;
    const pool=pools[civ.cultureId]??=[...extra].sort((a,b)=>hash(seed+a)-hash(seed+b));
    let next:string|undefined;
    while((next=pool.pop())&&used.has(next));
    if(!next)continue;
    used.delete(city.name);used.add(next);
    const province=run.world.provinces.find(p=>p.id===city.provinceId);
    if(province&&province.name===city.name)province.name=next;
    city.name=next;civ.name.value=next;
  }
}
