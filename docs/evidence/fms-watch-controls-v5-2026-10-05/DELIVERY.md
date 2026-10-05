# WEB-04-03：原作名称、可辨国家与看海操作

2026-10-05。配色/名称/操作提交 `66b204c74607fc637cf694954c456faef9a8776e`；
随后首都简称与动态国名源码提交 `1ea07be`（完整指纹见 checks.json）。
本地有界交付；WEB-PH04 完整阶段仍进行中，首份真机/用户视觉门及云端发布锁不变。

## 原作资料到网页的实际路径

用户明确要求从自己的 `D:/steam/steamapps/common/FantasyMapSimulator` 解析复用。
沿用既有 IL2CPP 元数据库定位函数、只读反汇编指定 PE 函数、有限词库适配、网页测试；
实际安装包是 PE/IL2CPP，不把图片中的 ELF/DWARF/hk4e 工具步骤假称已经运行。
两名只读复核代理分别定位命名和配色；根代理独占写入。

- 国名/地名：安装包 `FantasyMapSimulator_Data/StreamingAssets/Base/Culture/EasternFantasy/{StateNames,CityNames}.csv`。
  本次根代理再次核对这两份安装原件摘要与既有有限提取包一致；只读代理核对原清单20份资料均未改变。
  仅将 171 个中文国名和 1,010 个中文地名组成 `src/fms/play/eastern-names.json`，不带完整多文化包、脚本、SDK配置、存档或dump。源与输出摘要见 naming-provenance.json。
- 命名原生证据：`BurgsAndStateGenerator.InitCultureNameSet` RVA `0x48DF10` 调用文化列表、国名/城市key与翻译；
  `PickRandomCities` `0x490BE0`、`RandomProvinceName` `0x493130`、`RandomStateName` `0x493310` 包含随机取列表项再移除路径。
  `NameGenerator.GetCityNames/GetCountryNames` `0x408390/0x408440` 根据 `Localization.IsCNType` 分语言；
  `Province.MatchNameKeyBasedOnCulture` `0x458D10` 使用城市名称库。
  网页按地图种子稳定洗牌、不重复抽取；不宣称 Unity RNG 序列等价或全部文化分支恢复。
- 原作本地化将 District 称“区域”、Province 称“行省”。这批只替换真实模拟辖区的名字，
  不强加“县”后缀或冒充已完成省州县行政树；同辖区城市使用该地名。
- 国家配色：只读代理从真实 `GameAssembly.dll` 的 `DefaultNamespace.ColorUtils..cctor` RVA `0x842040`
  查明 c12：`#dababf #fb8072 #80b1d3 #fdb462 #b3de69 #fccde5 #c6b9c1 #bc80bd #ccebc5 #ffed6f #8dd3c7 #eb8de7`。
  `GetStatePaletteColors` `0x840B40` 与 `GetStateRandomColorSource` `0x840F40` 实际消费 c12/扩展表。
  原 DLL SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`；
  符号及字符串来源仍为 ignored `.autopilot/fms-audit/binary/dump/{dump.cs,stringliteral.json}`。
  原作没有执行，静态恢复不作为运行行为等价证明。
- 网页在原色表中选8种、重新安排顺序，政治填色由0.31提高至0.82，地形视图0.12；
  国界深边+浅描边、放大才显示内部辖区线，图例/军旗/外交列表共用颜色。
  透明度、线宽、排序属于网页适配；文化颜色不冒充国家色表。

## 可玩变化与存档合同

1. 政区/地形切换、国家图例点击定位；新局直接使用原作中文国名和地名。
   旧局仅识别上一版自动生成的精确数字占位名称及默认“国名京”首都名，在地图/列表/战报上统一做可逆显示投影，保留旧国名与玩家手填名。
   Worker和保存依然接收原 run，不回写原历史、不迁移格式；新增局的名称正常持久化。
2. 大事记按要闻、战事、内政补给、外交、全部类别筛选完整160条保留窗口。
   已知模板/唯一全名才提供历史辖区或命令目的地链接；无位置的军队事件只链接明确标注的“当前位置”。
   未知/歧义地点不猜测，记录不是完整历史。
3. 军旗真实点击、重叠军队选择、国家军队快捷入口；切军清空旧目标；显式目标模式、预览/确认/取消。
   镜头锚点避让桌面面板和手机底部面板，选择目标时禁止启动时间。
4. 可选“遇交战暂停”：7日批次逐日推进，在首次真实交战当日日结后停止。
   冻结核心也把断粮覆灭记为battle，因此本层只认接敌/交战模板；纯断粮覆灭不误报交战。
5. 后续同轮用户指出首都组合名过长、国名不随疆域更新：城市层只显示 `city.name`，首都用独立金色菱形；
   国名单独渲染，以当前 `controller` 的主要连通领土为候选，找边界间距大的真实陆地内点；
   控制归属变化使缓存失效，失去全部控制领土不再渲染国名。显示点不写入存档，城市实际坐标与国家首都引用不变。

### 动态国名的原作静态证据与适配差异

`BorderDataProcessor.UpdateStateLine` RVA `0x3744E0` 识别边界、连接成环；`0x3750CE–0x3751DB`
选择**边界点数最多**的环；`0x3755F6` 调 `PolyLabel.GetPolyLabel` (`0x806A40`) 求内部点。
渲染平滑环是另一分支，不能称定位环已平滑。
`PublishPendingStateLineTaskResult` (`0x36CC30`) 先检查任务时效再写 pole cache；
`UpdateBordersCal` (`0x36E430`) 更新 State.polePos 并置 isNeedNameLabelUpdate。
`State.UpdateStateName` (`0x5E0EE0`) 按可用长度调整文字设置；
World.CreateCityLabel 与 CreateStateLabel 为独立方法。证据由只读代理核对真实DLL小段机器码。

网页选择**最大连通面积**，以有限候选和7轮局部间距搜索求内部锚点，属于有界适配；
不是原生PolyLabel完整实现，不宣称边界选环规则、文字缩放、曲线/旋转完全等价。
回归覆盖面积与单元数不同的飞地、内海环形领土、当前控制变更、灭国、旧首都显示不回写。

规则源、schema、存档版本及引擎指纹均未变化：
`65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5`。

## 本批实际验证

- 受影响6文件59测试通过：原图创建、地理面积/海峡、真实战争、陈旧命令、存档CAS/备份/版本锁、
  军旗命中、移动插值、镜头锚点、事件筛选与歧义、原作词库唯一性/确定性/旧档不变，以及首个交战日暂停。
- lint、typecheck、生产构建通过；计划15、发布22测试通过；42个白名单游戏产物。
  上批全量196文件2458测试属于旧证据，本批没有重复全套或旧Playwright e2e。
- 开发页实际加载第147日旧局；看到原作地名“衢州、锁川、南雄、江油”等；图例定位、地图军旗点选、
  切军清空目标、地图选上洛→6日/36补给行军预览→取消通过。
  战报筛选为要闻10/内政补给117/全部160；控制战报定位南关并暂停。
- 开发页7倍临时运行147→560日，没有观察到新接敌，未保存。不能把这段运行称为浏览器已验证交战暂停；
  首次交战停止由真实模拟规则单元测试证明。第147日主档保留。
- 本地生产页从现有测试图创建6国：淮夷、北楚、北唐、南宋、蜀、曹；城名如零陵、安丰，无数字占位。
  新局未保存，退出后原第1日主档仍可恢复。最终提交构建指纹在浏览器核实，play/biome Worker加载，零warning/error。
- 428×926 Chromium尺寸仿真：无横向溢出，所有可见按钮至少44px；国家面板底742.4、时间条顶770.8，不重叠；定位实际操作通过。
  手机尺寸不是iPhone13ProMax实机，也不是Safari/WebKit测试或用户视觉认可。

## 尚未完成

多文化选择、完整原作国家AI、征募兵种、海军运输、行政树、城市近景与人物系统仍未完成。
飞地独立附属标签、相邻国家自动色差优化、完整的地名避让仍可后续改善；此批没有假称整作移植完毕。
一次国名内点细化出现TypeScript控制流推断错误，已显式标注Point并重跑通过；初次失败不记通过。
下一批优先真实军力补充/干预闭环的来源恢复及规则兼容方案，避免旧局军队消失后只剩静态边界。
只本地提交与验证，没有 push、云端CI、上传或Pages触发。
