# 原作战斗动画与战术差异核验

2026-10-06。用户要求继续核实自己的Fantasy Map Simulator安装包，恢复战争细节和动画。根任务独占写入，三份子任务只读核对。本记录不是完整战术系统验收。

## 本轮实际适配

从授权目录的resources.assets和resources.assets.resS窄提取BattleSword：GameObject698 → Animator3351 → Controller425 → Clip420。40张258×194 RGBA帧，12Hz，循环3.333333秒；3.25秒CheckStatus事件。帧序由pptrCurveMapping与StreamedClip时间键共同验证，没有按path_id猜顺序。源文件摘要、40帧来源与PNG摘要见source.json。图集为5列8行1290×1552、482109字节，SHA256 12b0852354a1975fa927cb9f5191665741cc87d262810a54d21f8b1d3f21b3b3。

只将这一明确游戏动画适配为网页图集，不加入原assets/resS、安装目录、完整dump、SDK配置或个人存档。资源使用依据为用户声明拥有原作并明确授权复用；不把该素材标为MIT或虚构第三方许可。check-dist只允许此文件名模式及精确内容摘要，不放开任意PNG。

陆战与海战绑定证据：Province.UpdateBattleSword(0x45E450)在0x45E59C调用ReportLandBattle；Navy.BattleInSeaProvince(0x4211A0)在0x4214AE调用ReportSeaBattle；包装器0x3F79D5/0x3F7A75均调用Upsert(0x3F82F0)。Upsert在0x3F8683读World+0x2D8=battleSwordPrefab，0x3F86A2实例化，0x3F88C4配置托管模式。未按陆海改用另一Prefab。BattleSword.UpdateAnimatorSpeedByPauseState(0x361F20)按暂停设置Animator速度0/1。

网页使用现有真实land engagement/sea contact创建或删除实例，沿原40帧12Hz循环，保留跨重绘相位；暂停冻结、减少动态用静帧，隐藏页返回不追赶整段装饰动画。每屏最多32个，远中近宽22/32/42像素。尺寸、显示上限和减少动态是网页适配，不冒充原作设置。伤亡仍由Worker计算，不由动画帧或原CheckStatus事件制造伤害。当前玩法指纹保持0026798b10d65cfb186247b0e65148310c3e72965698dd94633a640594fee504。

已有部队图标同时改按实际兵员总数分级，千人单位小于实际5000/12000人集群；选中只加轮廓尺寸，22像素点选范围保持。没有凭空增加小点或宣布拥有团—师组织树，独立小编制的兵员/位置/命令仍是后续规则工作。

另核实BattleSwordNoParticle为sharedassets0.assets的Clip194/Controller206/Prefab427，同为40帧12Hz；当前a/b质量切换条件未恢复，本轮只接默认BattleSword。waterAll绑定FrameAnimationUI，Fireball属于技能链，均未混当普通海战或军队炮火。

## 战术核验发现，尚未接入的规则

- 原作Army.RecalCombatEfficiency(0x34E5B0,1040字节)不读armyCount+0x80。依次处理国运/指挥/领袖、城防核心与攻守政体、突出部和资金；夹0.1—10后再乘兵种与精锐因子。省伤害基础10×SiegeDamageBoost，对军基础40×FieldCombatEfficiency，不能一起乱加速。
- 网页当前平均省抵抗400，2000步兵、80士气、平原城防1且无守军，理论约25.75日；满100军粮仅支持25日，行军已耗粮后会更早断粮。断粮降低战力/士气并减员，围城进一步变慢；敌省idle AI又跳过日常调度。这是WEB-04-13需要修复的真实闭环，不是播放器速度问题。旧测试压抵抗到.01仅证明转移，不能证明满抵抗节奏。
- State.GetAllyBorderEnemyProvince(0x5CA080)实际被Army.FindRegularTargetProvince的0x34860B调用，盟友borderEnemyProvinces参与择敌。完整条约和共同敌人过滤还未恢复，网页目前外交仅peace/war，不得声称已有盟军协同。
- 原作MilitaryProfile.GetUnitCombatModifier(0x3FEE10)经BuildTerrainContext(0x405560)和Evaluate(0x40E140)，区分Attack/Defense表、按biome比例加权，再乘山地权重。MilitaryProfile.json SHA256仍为395030721678acdfcd5ce1cc6ae75872b595c2a72e1b160a8f5ad3f41657cfcf。骑兵草原攻1.45、山地攻0.7/守0.75，盾兵山地守1.3。全局乘数名称尚未核实，不宣称完整等价。
- 网页已有同路途中扫掠遭遇、每12tick持续同时损耗、实际到场军队加入；没有专门援军调度、联盟、补给线路或AI情报状态。道路战地形目前按排序端点取省，不能称精确战场取样。
- 原作ShouldReorganization(0x351500)要求armyCount<=0等条件；Reorganization(0x34F9D0)回本籍省设10%编制，再由Update(0x34F7D0)按人口决定的10—20个模拟时间单位补齐。这是覆灭后本籍重编，不是前线无限回血或运输增援。
- 未发现足够证据证明原作有侦察—埋伏、AI战争迷雾或团—师—集团军组织树。ArmyOrganization仅Regular/Reorganization/Destroy，SetVisibility仅显示接口。若新增，必须明确为网页规则，并让AI只读自身情报、小编制拥有真实位置/兵员/损耗，不能用装饰图标冒充。

旧v6/v7执行字节guard继续保留，当前v8已存在验证存档。后续围城/AI/编制规则改动必须先冻结当前v8执行和独立版本分发，不能仅换指纹或静默迁移。真机、用户视觉、原作整体等价和完整动画覆盖仍未验收。

## 最新用户范围与已开始的地图层级

用户再次要求战争进度、全图大型战役、放大详细部队、点击参战国对比，以及河流/土地类型自主编辑、传位/迁都/投降/独立/联盟/叛乱/家族。plan/tasks.json新增具体依赖，未把这些后续机制记为完成。

WEB-04-20本地实现按屏幕上实际省份平均尺度划分全图/区域/近景；全图过滤不足5000陆军、4支部队或5艘舰船的小型接触，选中例外并保留完整战争列表。附近同参战国集合的交战可合并显示，面板按实际army/fleet ID去重；目前只显示真实在场兵员、士气、军粮、舰体和仍在场陆军的当前交锋损失。没有从160条滚动事件拼出整场战争累计伤亡，不自动给多国贴同盟标签。规则版本未改变。

UI采用motion-design的反馈与定位用途：按钮反馈100ms、战况展开220ms，均不延迟操作；减少动态关闭过渡。国色作为身份标识，颜色组织参考color-systems；背景和边框保持原作方向的纸色/深绿中性色。真实交锋逐帧动画表达当前作战状态，不随机播放胜负动画。

## 追加限定恢复：箭头与沉船

Province.EnableBattleArrow(0x452120)在0x4531D5调用FadeIn(1.0)。FadeIn(0x35F220)从growth=.1开始，协程MoveNext(0x3763C0)在非World.isGamePaused时累加Time.deltaTime/duration并夹0—1，因此正常累计约.9秒长满；暂停冻结，隐藏箭头不停止协程，重新显示完成箭头不重播。DestroyBattleArrow(0x451CA0)直接Destroy，无反向缩短。UpdateBezierCurveWithGrowth(0x35FFD0)的采样t=startOffset+(1-startOffset-endOffset)*q*growth，默认30点；宽度/颜色仍按q。尖头锚点随最后采样点和末段切线，三角网格尖角偏移尚未恢复。原世界单位阈值不得直接当CSS像素；网页现已按稳定路线身份接入10%到100%的线性生长；隐藏仍累计、暂停冻结，旧存档首次打开的已有军令直接画满，路线消耗后保留进度。尖头沿当前末端切线，网页9像素尖角长度是明确适配，不冒充原网格。预览立即画满；减少动态立即完成。

Navy.PlaySinkAnimation.MoveNext(0x44A920)：elapsed+=unscaledDeltaTime，s=smoothstep(clamp01(elapsed/.8))；比例1-.72s、y偏移-.28s原世界单位、倾角14度×s、alpha=.95(1-s)。协程内无暂停检查，开始后暂停仍完成视觉退场。StartSinkAnimation(0x424370)幂等标记、禁用Collider和移动；加载已lost档不应重播。网页已用实际live→lost转换生成无拾取、无命令、无伤害的0.8秒退场；缩放/倾角/透明度沿恢复公式，屏幕向下位移采用原船图半径×0.7的适配，不宣称世界坐标等价。已lost存档和切换run不重播；减少动态立即退出。正在等待最终生产浏览器检查。

## 政治事件与编辑缺口的来源边界

原作WarV2元数据有Participants/DestroyedParticipants、KillsByState/DeathsByState、InitialProvinceCountByState等；RecordKillDeath定位0x692680，累加两侧字典的函数体已核，但上游归因尚未核。未来应在权威扣损时累计并保存。首都失守即时改选首都；其后的月度危机是独立机制，见下方追加机器码核验。StateSuccessionUtility.TryResolve(0x891750)、家族内战StartCivilWar(0x86B850)、省叛乱ProcessRebellion(0x5D4130)、附庸叛乱(0x658270)目前仅入口定位，不能宣称完整继承或独立公式已恢复。

河网原flux>=30、至少3项路径、降水PrecInput=80等有既有窄恢复证据；当前没有玩家密度/河流删改/地类画笔。地貌显示不是存档编辑。密度必须同时更改有效河网、riverIds湿度、分类和河带并进入Worker缓存身份；高度视图的面积阈值max(512,面积*.003)与flux不同单位。真实地类覆盖需要新文档版本及进入新世界闭环，旧档不得静默改写。

## 首都与国别伤亡追加机器码核验

GameAssembly SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。WarV2.RecordKillDeath(0x692680,256字节)对amount>0同时累加KillsByState[killer]和DeathsByState[victim]，不在此处扣兵、筛选参战国或分摊；上游归因仍待核。网页不能从滚动日志倒推累计损失。

更正先前只读建议：原作首都失守立即改选首都，月度首都危机是另一条链。Province.ConqueredBy的0x45148F先NotifyCapitalConquered；0x4514A4比较首都城ID；0x451500清旧首都标志，0x451516调用RecalculateCapital，0x451577之后才改省的国家引用。RecalculateCapital(0x5D4E00)排除旧首都对应省，优先随机核心省，否则随机其他候选，再否则省列表首项；核心条件为distanceFieldToCapital<=coreProvinceDistanceField。ApplyRelocationOutcome(0x6644D0)只有日志，没有迁都或扣金。

Resolve(0x666590)先标记已处理，计算pressure，以clamp(.15+.85*pressure,0,.85)判重大结果，命中后尝试吞并、再内战，否则记迁都结果日志。后续追加的ComputeCollapsePressure、吞并资格和内战事件入口证据见CAPITAL_CRISIS.md；内战深层分地及部分关系函数仍未知，不能宣称完整独立/投降/内战。上述新政治规则尚未接入网页；下一批必须使用独立v9。

## 显示计算复用

主线程PlayClient的v3—v8海路图按terrain引用、runId和版本复用；tick不携带地理，整份load/create/copy/命令结构化克隆会自然失效。未用于可变规则内核或绘图编辑。战争/国家报表只在对应面板计算，省份Graphics独立保留，领土、国色、选区、缩放、模式或完整地理引用改变时重建。真实开发局持续运行观察到politicalBuilds保持1，但RAF仍约1秒一次；没有宣称帧率改善或真机流畅。记录见display-performance-dev.json，最终生产浏览器另验。
