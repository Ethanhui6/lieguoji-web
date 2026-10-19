# 方案C：找到并恢复边境邻接格写入链

## 原作新证据

只读原安装包 GameAssembly.dll（SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b），已有IL2CPP索引＋Capstone。没有读取认证、SDK配置或个人存档，没有运行原作。原始反汇编与引用扫描保留在本机忽略目录，未打包。

- BurgsAndStateGenerator.FilterProvinceCells：RVA489FE0，1248字节，SHA256 d2a444589adddf2351c3fb07e9d150840268ae6875c9d4e02e1ab02771198c8d。
- 每省回调：RVA727900，1200字节，SHA256 3de51f63cbb51a8dc1c8aac62a2354d0ced86f3ec801480d03da8ee57785df9d。
- 主函数初始化/清空cells、neighbors、borderNeighborCells和两个bool；按CellData.Province把有效正编号格放入对应非空省槽，再执行每省回调。
- 727B0C排除本省，727B11排除省份0；727B15读取Province.borderNeighborCells，727B2F追加外侧邻接格编号，不去重。727B59检查Elevation<20设置isSeaNeighbor，随后加入相邻省份集合。
- 727C20起检查本省cells的CellData.Feature是否全部相同，写isAllCellsConnected；名称不能理解为重新进行图BFS。
- 明确字段来源：CellData+0xC0 Province、+0x108 Neighbor、+0x18 Elevation、+0x78 Feature。不是三角行军面或绘图边缘采样。

扫描用户逻辑RVA300000—800000范围内索引方法的直接call指令，找到调用：Generate（48C3E8、48C3FD）、RegenerateSeaProvinceOnly（493E4D）、AddNewProvinceAndRegenerateSeaProvince（483E7B）、PlayerController.DrawMapHeight（43BE2B）、SaveSystem.LoadGame（4B5B30）。这是直接调用证据，不宣称覆盖所有间接/反射路径。

## 已实现

native-combat/province-cells53.ts恢复完整派生数据构造；与上一批突出部计算和既有原生选敌评分连测。重复接触按原序保留，省0排除，海岸阈值严格小于20，重建不保留旧列表。无效数组/索引抛错为网页输入保护。

解决了上一批“非空列表写入者未知”的具体缺口。上一批证据仍保留，不重写历史状态。

## 验收边界和下一项

本批4个文件39项测试通过：38项小样例/原生选敌回归，另1项加载原作19,928格，采用明确的固定合成省份划分，以独立共享边统计核对每省外侧接触的多重集合。还验证动态国家归属变化后的突出部结果。这不是原作真实战局或原生执行对拍。新增文件ESLint与全仓TypeScript通过；任务表检查/15项计划回归通过。没有重建生产产物或用旧浏览器结果充当本批验收。

当前新增模块尚未导入生产Worker。原生格/省/国家编号的统一映射仍须对齐当前网页多边形省份与三角行军面，不能将行军三角形数量伪称原作格子数量。因此本批没有改变当前军队AI、没有新UI，也不宣称游戏节奏变快。原作每帧10省/1国完整调度仍未完成。

下一步先核实State.Update的边界消费者，明确原生CellData投影与生产引擎规则版本，再把生产者和消费者一起接入。不要再次查找已找到的FilterProvinceCells写入链。旧档、即时防御更新、日财政、发布锁不变；未上传。
