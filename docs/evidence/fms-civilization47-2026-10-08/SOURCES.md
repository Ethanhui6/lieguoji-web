# 真实文化目录：来源与适用范围

2026-10-08。本批实现是用户要求的现实文化扩展，**不是从原作六库恢复出的额外十二种文化**。原作安装包现有六库及翻译列已核查，见 [既有审查](../fms-real-culture-2026-10-08/AUDIT.md)。本批没有运行原作、读取存档或再次转储安装包。

## 两种模式

- `culture-generated`：依据文化风格设计的构词材料，组合新的国名、城市名和人物名；生成名不宣称历史上确有其人其地。
- `historical-names`：复用有限的完整历史名称材料。国家基础名称含历史国家、王朝和地域；玩家另选政体后产生架空世界全称。例如历史地域配共和国后缀，不代表该共和国在历史上存在。人物可来自不同时代，其新职务、年龄、能力、世数和经历均属于本次模拟。
- 人物的完整名称材料固定选取，不交叉拼接两个历史人物的姓和名。导入人物的原王号数字不决定本局的“几世”；本局另记国家第几任和同王号几世。
- 文化、宗教、政体分开选择。默认组合只是开局建议，不是对民族或宗教的固定属性判断。印度、斯拉夫、日耳曼等目前是较宽的文化组，尚未细分时代/区域语法；不能声称精确复刻各时代人物命名制度。
- 宗族/王族字段和显示名分开；阿拉伯、希腊、北欧、印度生成名先单独显示个人名，家族由独立字段保留；这不代表已经实现历史父名制或完整宗谱规则。罗马女性采用独立词形模板，避免 `Julia Julius`。
- 历史城市初始每文化32条，历史国家材料每文化8或16条。名称用尽明确拒绝该次创建，不回退生成名、不添加数字后缀。生成库容量不同，重复组合也计入实际去重约束；不能承诺任意数量单文化历史城市。

## 本轮已核的主要依据

只读研究者 `culture_sources47` 浏览了以下一手机构资料。链接支持相应样本和数据分类；**不表示手工目录中的每一条名称都逐条核查过**。完整词库审校与时代/地域标签仍待继续。

| 文化 | 核实样本与命名边界 | 依据 |
|---|---|---|
| 中华 | 李世民与唐太宗的关系；庙号与个人名不能混同 | [故宫唐太宗](https://www.dpm.org.cn/lemmas/240121.html)、[故宫人物题跋资料](https://www.dpm.org.cn/collection/impres/228624.html) |
| 日本 | 江户、京都、奈良、德川家康；幕府与国家身份分开 | [东京都江户历史](https://edolegacytravel.metro.tokyo.lg.jp/about/)、[术语](https://edolegacytravel.metro.tokyo.lg.jp/guide/)、[UNESCO奈良](https://whc.unesco.org/en/list/870/)、[京都](https://whc.unesco.org/en/list/688/) |
| 英格兰 | Henry、Elizabeth及Tudor王族，王号序数与个人名分开 | [Historic Royal Palaces](https://www.hrp.org.uk/hampton-court-palace/history-and-stories/henry-viii/) |
| 阿拉伯 | 大马士革、巴格达、倭马亚、阿拔斯；前伊斯兰阿拉伯语人物存在，文化不等于宗教 | [Met倭马亚](https://www.metmuseum.org/es/essays/the-art-of-the-umayyad-period-661-750)、[Met展览](https://www.metmuseum.org/exhibitions/listings/2012/byzantium-and-islam)、[卢浮宫纳马拉铭文](https://collections.louvre.fr/ark:/53355/cl010123278) |
| 罗马 | 共和国/帝国、个人名、氏族、尊号分开；恺撒不能统一等同皇帝 | [大英博物馆标签资料](https://www.britishmuseum.org/sites/default/files/2021-06/Nero_the_man_behind_the_myth_From_republic_to_empire_label_text.pdf) |
| 法兰西 | Louis de Bourbon、Louis XIV；王族、个人名、序数分开 | [凡尔赛宫路易十四](https://www.chateauversailles.fr/decouvrir/histoire/grands-personnages/louis-xiv) |
| 日耳曼 | 德意志样本：普鲁士、腓特烈、霍亨索伦、柏林/波茨坦 | [德国历史博物馆](https://www.dhm.de/archiv/ausstellungen/friedrich-der-grosse/)、[波茨坦市](https://www.potsdam.de/de/marmorpalais) |
| 希腊 | 雅典/马其顿不同制度；城邦人名不能统一套王号 | [Met古典希腊](https://www.metmuseum.org/ko/essays/the-art-of-classical-greece-ca-480-323-b-c)、[埃盖研究](https://www.aigai.gr/assets/site/content/pdf/Kottaridi_Academia_edu/MaceFragm_3_3.kings_poleis_and_politics_from_philip_ii_compressed.pdf) |
| 波斯 | 波斯波利斯、阿契美尼德、大流士；王朝不等于现代通用姓氏 | [UNESCO波斯波利斯](https://whc.unesco.org/en/list/114) |
| 斯拉夫 | 基辅罗斯、雅罗斯拉夫；“智者”是绰号，此样本不代表全部斯拉夫地区 | [UNESCO基辅](https://whc.unesco.org/en/list/527) |
| 北欧 | Jelling、Harald、Gorm、Thyra、改宗；文化和宗教可独立变化 | [丹麦国家博物馆耶灵石](https://en.natmus.dk/historical-knowledge/denmark/prehistoric-period-until-1050-ad/the-viking-age/the-monuments-at-jelling/the-jelling-stone/) |
| 印度 | 华氏城/孔雀与南部朱罗来自不同区域传统，尚未做地域专属语法 | [印度考古局](https://asipatnacircle.gov.in/)、[铭文项目](https://bharatshri.asi.gov.in/AboutEpigraphy?lang=en)、[UNESCO朱罗](https://whc.unesco.org/en/list/250/) |

## 游戏规则和资料事实的边界

中华/日本默认帝制分别显示皇帝/天皇，玩家选王国时显示国王/女王，选共和国时显示总统；罗马共和国为执政官。神权制按宗教选择哈里发、教宗、牧首、法王或祭主。这是本游戏的明确简化模板，不是所有历史国家的普遍称号规则。`polityAtAccession` 和 `titleAtAccession` 保存原任次的快照，当前职位另由国家当前制度派生。

本批已修正目录中的建康/金陵、Badami/Vatapi、Massilia/Massalia明显同地别名重复；这不是全目录历史地理去重验收。后续扩容需追加来源和别名标识，不能仅因字符串不同就宣称历史地点不同。
