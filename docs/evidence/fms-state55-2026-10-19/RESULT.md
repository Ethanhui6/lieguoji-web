# 国家边界消费者接入（限定常规战争）

生产源码 1eeb869a0c7c9c2c9e37210a208c182803103f2c；引擎 f98b3e96bc9af0ff2b680a2ef51e8c3a7a105dc86c35898b8606b659f078818b。本机 http://127.0.0.1:5367/?fms=1 ，独立产物 .autopilot/fms-state55-checked。旧5366/dist保留。未上传。

## 原作证据与实际范围

只读既有 GameAssembly.dll，SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。
State.Update RVA5E16F0（352字节，sha ad0a09d0c54aef0bc8393dffc2f8164f6b03c17d690d11debb7a4d679df6a0d6）在有效游戏更新分支依次调用 FilterBorderProvince、FilterBorderEnemyProvince、CheckTooMuchArmy。
FilterBorderEnemyProvince RVA5C67E0（1456字节，sha 7586298b4c8299ea7d8f7702c7779f8403e0a641a0cb4ec639cce1abdb058f14）清空三个省份集合，遍历边境省邻省，排除本国，分别按 enemy/regular/rebel 国家集合独立加入并去重。已恢复这段集合计算至 native-war/state-border55.ts。
FilterBorderProvince RVA5C6D90另含无效省清理、可征服性和首都连通性，尚未完整移植；不能把本批说成整个State.Update或10省/1国轮转完成。私有反汇编仍仅在.autopilot，不进入产物。

生产 stateBorderReader55 复用上一批与渲染相同的格归属及边界接触，读取实时控制国，取当前常规战争敌国；真实陆军选敌已调用。旧polygon邻接不再决定本国相邻敌省集合。盟友支援与海岸候选仍为既有WEB规则，未声称全面替换。每次重新读取控制国与战争集合，攻占及停战不会留旧候选；实际路径、粮程和外交通行检查保留。未新增持久字段或篡改旧存档。上一版4ba5 Worker原字节冻结。

## 验证与未命中项

- 39项单测通过：原生独立分类/去重、显示格逐边核对、同一reader攻占与停战刷新、重载一致、真实纯内陆进攻目标属于新边界集合、旧地理绑定遭改写仍拒绝。
- TypeScript及改动文件lint通过；构建成功，125个允许产物通过隐私/冻结字节检查。
- 桌面与手机尺寸各2项核心浏览器流程通过，7项旧4ba5兼容/保存取消恢复通过，共11项。
- 56日真实编译Worker长跑：完整run/frame与5366基线相同，新版日志重载run/frame也完全相同。初次行为差异覆盖断言失败（目标和领土均0差异），保留behavior-coverage-failed.log；随后单独以严格run/frame相等约束做回归并通过。**这张样例未证明用户可感知的战略或节奏改善，不能以通过回归替代行为差异验收。**
- 初版针对性测试试图清空旧邻接以制造不一致，被既有地理绑定保护正确拒绝；最终保留该拒绝断言，并用未改写地理的全陆地图验证实际AI发出进攻军令。没有绕过校验。
- 没有提速、视觉或真机结论。此前手机事件条遮挡标题仍未处理。

下一批继续State.FilterBorderProvince的有效省/可征服性/首都连通性与版本化10省1国刷新，再接完整原作军队状态机。完整叛军分类、原作全等、全部PH及人工体验门仍未完成。停止重复恢复已接入的常规敌省集合。
