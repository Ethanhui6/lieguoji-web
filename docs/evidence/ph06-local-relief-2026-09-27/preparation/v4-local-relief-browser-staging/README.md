# 局部山地原生浏览器流程候选

唯一拟提升目标：`tests/atlas-local-relief.spec.ts`。目前只编写，没有运行浏览器、构建、单元、lint或类型检查，不能记为通过。默认总时限450秒，与既有追加大陆完整流程相同；没有增加重试、reload循环或应用状态注入。

测试使用实际首页空白海洋、标准256规模、natural@2大大陆轮廓和真实mouse/CDP touch。流程为一笔大陆→确认保存→原生地图点击一处由存储样本证明的陆地→仅重生成山地（默认16×16/2格过渡）→预览取消→同参数再次预览并确认→同会话撤销→再次预览并确认→一次刷新恢复。首片只生成一次，局部预览共三次。种子与起伏、最后局部表单在刷新后按真实UI检查。

只读观察直接读取实际v4 IndexedDB及LGDC字节，不导入生产生成器、几何或base高程算法，不写IDB。全部粗块与锁的原始字节先核内容hash，再比较引用和摘要；全部64×64 owner的coverage作规范语义摘要，允许uniform land物化为samples，但每个coverage值必须等同。已有samples owner的高程字节hash须确有变化，不能只认摘要UI数字。撤销恢复全部原细块与真实地理，重复确认与第一次地理相同，最后刷新恢复同一修订与manifest。

空白世界正常没有锁。测试会如实记录实际lockCount，空锁集合保持不变不能充当已有锁冲突保护通过；后者仍由内核/adapter的真实锁用例承担。本例也不宣称局部之外全部高度保护、任意几何边界、自然外观、真机或性能验收。截图与时长只是本轮功能原始证据。

UI接口依据 `v4-local-relief-ui-staging` 的冻结候选：按钮「仅重生成山地」「预览山地变化」「取消生成」「确认生成并保存」「撤销大世界编辑」；aria「局部山地种子」「局部山地起伏」；region「山地生成预览」及testid `local-relief-scope`、`local-relief-changed-nodes`。要求实际新build带 `localDetailReliefGenerator.sha256`。旧preview.11没有该功能，不能在它上面冒充新流程通过。

依赖现有 `tests/helpers/atlas-shape-readonly.ts` 的readonly audit/metrics/saved/databaseDigest，仅复制必要原生输入和新存储观察代码；没有复制旧整套追加流程。候选按最终tests路径写相对imports。由root统一提升、静态检查、实际构建及三端顺序执行，首轮失败须保留。
