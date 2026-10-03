# 当前续接：Fantasy Map Simulator 网页重建 V5

更新2026-10-04。先读根目录 CODEX_AUTOPILOT_V5.md 和 docs/FMS_WEB_REBUILD_PLAN.md，当前状态只认 plan/tasks.json.webRebuild。用户要求重做旧计划；本轮不是继续旧PH06扩展，也不是已交付新的游戏版本。普通本地工作每批1—3项自动推进，必要产品问题分批问，不重问已回答内容。

## 当前目标与用户确认

- 把用户自己的Fantasy Map Simulator做成网页/PWA，优先忠实还原画地图方式、地图表现、配色、按钮和菜单。原作风格覆盖旧iOS设计方向。
- 第一份试玩：闭合轮廓＋陆地/海洋笔刷；保留大陆主体，只细化湾岬和内陆自然地形；连续缩放；可反复改、撤销、保存、刷新恢复。尚未实现并验收这份新合同。
- iPhone13ProMax、用户报告**iOS27**、Safari与Chrome、**竖屏优先，工具收入可展开菜单**。具体小版本/构建号真机测试时再记；移动仿真不能代真机。
- WEB-PH00—07为新执行顺序，WEB-PH02是首个用户体验门；未通过前修绘图/地理/表现，暂停继续堆国家/家族/信仰面板。完整范围未删除：不同国家制度、手工/自动行政区、城市首都、兵种战争、家族信仰、历史和PWA仍在后续阶段。

## Git、旧版本与发布

- 分支 codex/ph06-world-generation。重规划前HEAD **bd07208d31349862f7da788eaefc991089ba6f2d**，旧产品源码基准 **42af5433aedcb0e02cbcb1cabf88aa538f184c1a**。本轮提交以git log最新V5 checkpoint为准，文档不写虚构自引用SHA。
- 旧产品/构建 **0.5.0-preview.33**，构建基准 **199f20d65cdfccff0367a9770d4516ff573e1a4c**，build.json SHA256 **dba141d82cb35649a927d88475ed13aca314138335e72aa0fda788aa38f989c3**。本轮没有改产品代码、版本或dist；旧检查不是V5通过。
- 本地remote已核为 https://github.com/Ethanhui6/lieguoji-web.git；hooksPath=.githooks。Pages历史项目lieguoji-web，唯一原生Git链main生产/其他分支预览，历史地址 https://lieguoji-web.pages.dev/ 。本轮没有联网核验部署、访问账户或云端写入，不能声称旧站已更新。
- **所有push/tag/远端PR/Issue/Milestone/上传/Pages触发仍禁止。** 9月24单次试玩例外已消耗；旧releasePolicy、旧全部任务与pre-push原样保留。V5阶段改名不能解锁，最后逐项对照全部旧要求和新合同后正式修订门。
- 旧61任务/36PH/144子项及全部原JSON顶层字段语义原样保留；仅追加webRebuild。旧phaseState/programme描述历史，不是当前排期。未删旧源码、历史或存档。

## 本轮实际工作

1. 用户选择落盘；新增V5执行指令、8阶段计划和首轮9项任务，更新AGENTS/README/ROADMAP入口。WEB-00-01完成；WEB-00-02与WEB-00-03仍进行中；所有新试玩/真机/用户视觉结果均未通过。
2. 现有引擎只读审查确认：手绘轮廓与复用高度核未接通、旧陆块相接保护限制塑形、源地形细节和转换/材质必须分开比较、预览全量准备影响响应。证据见 [EXISTING_ENGINE_AUDIT.md](evidence/fms-web-replan-2026-10-04/EXISTING_ENGINE_AUDIT.md)。
3. 已寻找公开原作演示。观察官方两个短片尾帧及B站描图教学的部分片段；B站约1:46出现登录提示，未继续，不能当成完整画笔观察。清楚记录 [参考基线](FMS_REFERENCE_BASELINE_2026-10-04.md)，未下载/转载媒体到产品。
4. 按用户图片方法做了真实的三函数静态试验：DrawMapHeightLogic→DrawMapHeight确认；原选区走Raycast/OverlapSphere的Collider集合，没有直接调用GetCellIndexInRadius；局部高度算术、海陆变化和若干实体维护调用已证实。自然Hill分支依赖**HeightMapGenerator.GetHeightMap RVA 0x38BC80**，仍未展开。见 [BRUSH_STATIC_AUDIT.md](evidence/fms-web-replan-2026-10-04/BRUSH_STATIC_AUDIT.md) 与 [manifest](evidence/fms-web-replan-2026-10-04/brush-static-manifest.json)。静态证据不是网页行为等价。

## 安装包与工具边界

- 授权只读 D:/steam/steamapps/common/FantasyMapSimulator；不写安装目录，不读认证、SDK配置、envs.log或个人存档。未运行原作EXE/DLL或完整recovered main。源GameAssembly读取前后摘要一致。
- 实际为Windows x64 PE / Unity2021.3.36f1 / IL2CPP v29。已有Il2CppDumper6.7.46、Capstone、UnityPy；没有已确认可调用hk4e-mcp。用户截图的ELF/DWARF流程只能借用方法，不能伪称已照其工具运行。
- 已恢复高度模块与四模板仍可复用；原始main、loader材料、完整dump和临时解析器仍ignored。BasicMap四文件只证实坐标点，高程全0、没有原生邻接；不能把它们认作完整大陆。
- 已有恢复报告在 .autopilot/fms-audit/binary/recovered/；本轮临时静态试验在 .autopilot/fms-audit/binary/brush-static/。不重复全包解密/扫描，不复制raw到docs或dist。详情仍见 [包复用记录](FMS_PACKAGE_REUSE_2026-10-03.md)。

## 下一批，按新计划推进

1. WEB-00-02：补原作实际画陆擦海、半径/强度、菜单、撤销与连续缩放的可见参照。优先已有 [基本操作视频](https://www.bilibili.com/video/BV1d9YTeREpR/) 或官方频道；已看的不足保持未知，不要求用户凭记忆填链接。需要原作进程对照时单独界定运行/保存写入范围。
2. WEB-00-03：只展开GetHeightMap这一直接依赖，恢复Hill数值传播；选区集合显式输入，先做有界数值fixture。Collider与网页多边形对应未知，不用圆内点查询冒称原行为。原始方法没恢复时，不把四模板新增当画笔恢复。
3. 满足上述合同后执行WEB-01-01—03：独立本地创世入口/存储，原作风格竖屏折叠工具、轮廓和海陆笔刷、逐笔撤销保存。先源码地形直接渲染与Atlas转换对照，不强制走旧420万点转换；最终保存校验和旧档保护保持。

## 检查与未通过

- 本轮只做计划/文档和静态分析。计划保留检查、引用/依赖/旧字段完整性与发布锁状态证据写入 [verification.json](evidence/fms-web-replan-2026-10-04/verification.json)；最终以文件结果为准。没有必要重跑旧游戏全套检查或构建，新网页数值fixture和浏览器/真机尚未执行。
- 旧preview.33检查和浏览器结果保存在 docs/evidence/fms-direct-generation-2026-10-04/；旧试玩存档atlas-17708eca-a8dc-465b-9763-8f82a1539ca6继续保留。旧localhost4173是否运行要续接时核实，不承诺常驻，不能当新V5试玩。
- 第一体验门、原作完整画笔/拓扑/海洋渲染、真机与用户视觉均未通过。CANON正式设定、正式核图/正史、旧档规则和原长征要求独立保留。
- 目前没有需要登录或秘密输入才能继续的本地工程阻塞。会话结束后不在后台继续开发；下次按本记录核实状态后接续。
