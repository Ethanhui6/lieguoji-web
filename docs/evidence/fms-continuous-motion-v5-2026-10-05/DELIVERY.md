# WEB-04-07 首都与连续运动（有限显示层切片）

日期：2026-10-05。源提交 bdb8c3bc159a6adfcc6336aac9fe6dde05cecad6。根据本线程最新反馈优先实施；本地开发、发布锁不变。

## 已接入

- 首都单独末层绘制，黑白同心环约18 CSS像素，名称15px加描边；普通城市为5px点/11px名称。身份不写进真实城市名。缩放不把首都图标缩成小点，迁都后旧城恢复普通标记，新首都即时更新。
- 陆军与舰队在相邻权威日快照间按实际经过路径连续绘制。陆军保留省中心拐点；海军保留湿边gate，按弧长走，不用起止直线跨半岛。新生、覆灭、无法证明的战斗重置不编造路径。
- rAF只更新单位容器位置并渲染；不逐帧销毁重建全部省界/文字/地形。暂停、继续、变速保持当前显示姿态。静态视图重绘、点击与定位共用显示位置。
- 分向行军的单位独立显示，不被固定合并军标的平均位置拖住。重叠陆军点击进入原有择军列表。
- 计时循环在Worker busy重试后重新检查当前运动剩余时间，避免改速/恢复时多推进一天；清理旧循环后未完成Worker不会另排后续推进。

## 原作证据与适配边界

只读分析指定安装包。实际Windows PE/Unity2021.3.36f1/IL2CPP29，并非ELF/DWARF；未运行原作。GameAssembly.dll SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。

- Province.GetProvinceCityType RVA0x455600，在0x4557F3–0x4557FC比较province.capitalBurgID(+0x64)与state.capitalBurgID(+0xE0)，走Capital=0分支。类型枚举Capital/Port/Fortress/City/HolyCity在dump.cs33970。
- World.GetCityIconPrefab 0x6B50B0区分CapitalPrefab字段0x60与普通CityPrefab0x50；GetCityScale 0x6B5290，Capital/HolyCity取1.5、普通1.0。这是函数尺度，不是最终屏幕像素。
- ResourceManager的prefab/citycapitalfinal：sharedassets0.assets GO424 CityCapitalFinal，三个Shapes.Disc黑/白/黑，局部尺度.43/.885/1.3，父尺度.23。普通CityMain GO423为不同圆组。Shapes属于独立第三方运行库，本批只用Pixi几何适配圆形结构，未复制其运行库。当前场景CapitalPrefab是否绑定该prefab尚未核实，因此不声称像素等价。
- World.UpdateCityIcon 0x6C7AD0重新建立图标/标签。陆军移动协程0x377860中GetSpeed→Time.deltaTime(0x378767)→向量接近→Transform.position(0x3787D9)→下一帧yield，证明原作有逐帧移动。陆军基础1.5另受单位/地形修正；海军基础2.2*deltaTime见前一海軍证据。原作timeScale、游戏日历与真实秒的完整映射未恢复。

## 真实验证

- lint/typecheck通过；11文件105相关测试通过（play全目录、手势、相机）。覆盖跨省拐点、多个湿面/gate、自动巡航起步、暂停变速、未完成路径承接、分向军团，以及延迟Worker期间重建计时循环。不是全量测试/e2e或云端CI。
- 生产构建通过，dist审查42项游戏产物。5181实际build.json为bdb8c3b，fmsPlayFingerprint仍532842498fac9067d87ca2dfffd53188ccfd3bf1ca2b1277e08740fa02c63f79；实际play/biome Worker正常加载。
- 5180开发版第41日约1.8秒采样31次：7支陆军和2舰队各出现13个不同诊断位置；同一日内绘制计数增加473。诊断位置每150ms更新一次；不是FPS基准，不宣称手机性能通过。早期隐藏标签曾被后台节流，仅3个位置；切换可见预览后再测，未把节流样本冒充顺滑验收。
- 暂停后跨两次观察单位位置完全相等。第44日原“尤溪”迁至“卫桦”：首都数据c-233→c-8、位置即时改变，其余五国不变；此专用QA分支未保存，5180存档仍第14日。
- 5181真实构建由第21日保存恢复，推进到第22日：连续运动诊断记录见production-motion-samples.json。按途中fleet-10-4屏幕坐标点击，准确选中“叙永港水师”；没有点到未来位置。
- 428×926 Chromium画布428×926/文档scrollWidth428，六首都标记存在，控制区可操作；mobile.png与desktop.png保存。不等于iPhone13ProMax/iOS27 Safari或Chrome真机。
- 第22日保存并刷新恢复的最终结果见browser.json。浏览器warn/error为空。

## 尚未完成

本切片是连续运动显示，不是完整原作即时权威模拟：经济/外交/战斗仍按日结算，日期显示已完成的日；途中暂停画面可能处于该日路线中段，命令验证与保存取权威日末状态，刷新恢复到权威位置，不保存显示alpha。战斗重置可能直接切到交战位置。要实现可在真实途中拦截/转向、子日交战，必须先封存当前规则并开发新的模拟版本，不能悄悄改已有存档的规则。

海战、运输、原作完整政体/家族/信仰仍待接入。原作等价、长期平衡、真机与用户视觉均未验收。无push/上传/Pages触发。
