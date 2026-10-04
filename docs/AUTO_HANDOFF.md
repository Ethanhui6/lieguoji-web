# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-04，本批原生Hill接入。先核实Git，读CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild及本文件；旧tasks/phaseState/programme只作历史及发布审计。

## 最新授权与方向

用户在旧香港时间08:00截止之后再次直接要求“运用以前素材和生成方法，全方位移植网页端，按照图片方法”。**本地执行已恢复，不再等待解除旧截止。** 原调度时段结束，不代表重启或延长后台调度；本次未修改自动化。不要以旧截止重新停工，也不声称会话结束后仍后台开发。

目标仍为iPhone13ProMax，用户报告iOS27，Safari/Chrome，竖屏优先、原作风格、折叠工具。**WEB-PH02 / WEB-02-01仍in_progress**；首份真机与用户视觉门未过，不扩建国家、行政、家族、信仰。

用户截图流程按实际Windows PE/Unity IL2CPP转换：既有类型/地址/资源索引 → 有界恢复原函数输入输出 → 接网页可运行切片 → 数值/操作/画面对照 → 再扩展。暂无ELF/DWARF/hk4e-mcp，不假称用了。只读子任务可并行，root独占写入。不重复恢复已完成GetHeightMap/SetCellAsSea，不再把V5自研噪声等同原作方法。

## 本批实际可玩变化

- 功能源码 **fd9f366c565aad7a8f6ee2e2c8ca64d3d990ae37**；当前HEAD以git核实，证据另作本地checkpoint。基线bfad048/旧源码fb8e821。
- 新入口：`/?fms=1 → 绘图设置 → 山丘 → 放置山丘`。在已有陆地点击，拖动调整单次落点、松手Worker预览；对照原图/取消/确认，确认后整步撤销与保存恢复。
- 真实调用原恢复 `generateFmsHillContributions`（GetHeightMap）和 `applyFmsHillBrush(max)`。既有平面画笔保留；上方“生成地形”仍是网页保形算法，不冒称已经换成原JS模板。
- 网页适配明确：圆与重建Voronoi相交、近点中心、文档存储邻接顺序、Alea种子流；非Unity Collider/随机流逐点等价。高度25—100、衰减0.8—0.98、默认85/.96是网页支持域，非原活动UI值；无静默clamp。
- 完整传播后再冻结海点/h20/混合海陆面全部顶点及玩家锁；保护点仍可传递传播。实际插值海岸固定，阴影和水文可以变化。Worker无写库，确认才commit；原CAS/原子升级/beforeProtection不变。
- 19文件367/367相关测试、整体lint/typecheck、生产build通过。首次类型声明失败已修复保留；计划记录曾把nextBatch写成文字，检查拒绝后改回V5 ID，未放宽检查。
- 开发实际40789点/590锁地图：山丘237处抬高；9942次跨海陆面边交点比例变化最大0，保护高度改变0，点/三角网完全相同。取消存档完全相等；确认→撤销保存与原地图除revision外相等；重做→保存→刷新完整存档相等，启用前归档不变。
- 生产实际37550点/371锁图：山丘232处抬高；严格CSP加载真实Worker、确认保存刷新完成，详见production-browser.json。build.json绑定fd9f366，仅39允许游戏产物。
- 浏览器是428×926桌面Chromium，实际鼠标/键盘。IAB不支持Input.dispatchTouchEvent，本批未补成真实或合成触控通过；手机/WebKit/用户视觉未验收。

本批：[原作来源和恢复结果](evidence/fms-native-hill-v5-2026-10-04/ORIGINAL_PORT.md)、[检查](evidence/fms-native-hill-v5-2026-10-04/checks.json)、[开发浏览器](evidence/fms-native-hill-v5-2026-10-04/dev-browser.json)、[生产浏览器](evidence/fms-native-hill-v5-2026-10-04/production-browser.json)、[源码产物指纹](evidence/fms-native-hill-v5-2026-10-04/verification.json)。本地测试不是云端CI，不是原进程联调。

## 本批原函数/素材核对

- InverseVoronoiTransformPoint真实RVA0x6BADC0，105字节；每步float32的加偏移/除边界尺寸/乘地图尺寸，z未读。GetCellIndex真实RVA0x6B4E30，628字节，边界检查后KD最近点返回第一个结果。KD树构造/tie、真实Collider仍未知，网页已有地图域坐标不重复换算。旧0x43A1D9/0x43A29F是调用点。
- 原JS click生成是零高程跑完整模板后max(old,new)，不是从旧高度叠单Hill；centerPoint/sizeFactor及指数影响局部模板，当前engine固定参数且要求规则格点，不能直接把加密图伪装规则图接入。
- OceanNew材质#12→Shader#298 Custom/OceanUnlit：片元输出_Color，Stencil Ref2/Always/Replace，是蒙版链的一环；运行颜色未知。BlurOcean材质#9→Shader#242：17点十字模糊，总权1.772972979，原程序未归一化；RenderTexture、ScreenSize、颜色空间/采样和蒙版消费者待恢复。不能把任意噪声或Water_Cartoon_Min图集当原海洋。
- 已提取图片此前均未被V5 renderer消费。第三方来源、具体活动UI/材质消费者要逐项核对；完整安装包、dump、私密材料不提交/dist。

## 下一批：按原作移植继续

1. 在WEB-02-01内沿原JS click-template接口及UI设置调用，恢复centerPoint/sizeFactor输入与模板操作，再接当前V5候选链；保形策略与原生成器分开记录，避免又叠自研生成替代。
2. 核OceanUnlit颜色、BlurOcean实际RenderTexture/ScreenSize和Stencil消费者，恢复后再适配GLSL与资源；完整海洋/缩放对照仍依赖WEB-02-01。已有函数不反复重做索引。
3. WEB-02-03首份真机/用户视觉不能代验；其余不依赖它的绘图/素材恢复可继续。完整国家城市行政家族信仰战争PWA需求保留，依赖满足后逐模块移植。

## Git、发布与本地入口

- D:/游戏/架空地图模拟器；分支codex/ph06-world-generation。remote沿用https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。
- **禁止push任何分支/tag、远程PR/Issue/Milestone、上传、Pages触发。** pre-push/发布策略/CSP未改，9月24例外已消耗。V5完成不自动解除旧全PH门。唯一Pages原生Git链lieguoji-web保留，不另建替代链。
- 开发 http://127.0.0.1:5180/?fms=1，当前session26969；严格CSP产物预览 http://127.0.0.1:5181/?fms=1，当前session94966。旧服务失效已恢复，续接核存活；不是公网/手机可访问地址。
- 两个origin均独立FMS命名空间lieguoji-fms-web-v1/DB2，旧4173草稿未打开/覆盖。
- 开发最终v2 revision38/storedRevision18/40789点/590锁，checksum=4abb63f05bc1c6711069b54de01c4cfdb105c92cc2f56a28531acec58689f02e，beforeProtection仍v1revision10。本批测试图保留山丘。
- 生产最终数值以production-browser.json为准，beforeProtection保持。原始完整测试地图不提交或dist。

## 既有约束与未通过项

海岸粗折角、简单海洋与整体观感未达到用户要求。1536单位/36864基础点、50k上限仍非最终大图。主线程选区/几何与面积水文校验的手机成本未知。

海岸固定合同是实际float32三角面h20插值，不以mask代替。加密/平滑每次最大偏移0—4，每正面积组件面积变动≤2%，对应点间距倍率[.8,1.2]；小组件边界、保护面固定，重复确认可累积；并非永久锚定初稿。面积汇流已改land-area-runoff-v2，但路径仍受邻接影响；当前数据派生水系，旧图加载可能改变视觉。

DB1有效backup归档路径已经修复：chosen current??backup保存首份有效v1，不覆盖beforeProtection，保留CAS/原子升级/失败不迟到写入；不要重复修同缺口。原schema/规则旧历史隔离、CANON未知、正式地图/正史和旧完整要求不变。

材料只读范围D:/steam/steamapps/common/FantasyMapSimulator，不读取SDK/认证/envs.log/个人存档、不运行完整原作或恢复脚本。raw/dump仅ignored .autopilot/fms-audit；第三方组件许可独立记录。
