# 本批失败与修复

- 首轮定向30通过、5失败：五族群月结测试把ledger解释字段baseIncome/inventoryFactor/goldBeforeArmyCost拿去比账户根对象，比较层级错误。改为完整比较ledger，并继续比较账户全部四实际财政值；原数值断言没有删掉。修后36通过，含新增自动起义的真实tick首结。失败报告unit-first.json保留。
- 首轮三尺寸浏览器全部失败：CulturePanel与PeoplePanel同级使用相同React key，选择/保存更新后文化面板重复4份，严格定位拒绝多匹配。生产UI改不同culture/people前缀，增加两面板唯一数量断言；没有用.first或放宽断言隐藏重复。修后3尺寸同流程通过。browser-first-duplicate-key-failure.json保留。
- 只读审查发现说明仅提资源未提财政战力，以及“增加20%”未体现多步取整。最终UI和确认补充下次月结财政战力，说明匹配资源项计算值×1.2、最终另算取整。纯结算逻辑未改。
- 普通手动试玩首次原作模板点击在空海且保留海岸，正确拒绝新增陆地；通过UI关闭保留海岸后生成大陆。不是生成器出错，也没有注入用户存档绕过绘图。
- 包大小仍有警告：FmsApp959.31kB、play.worker851.82kB，未做性能/真机PASS。原作全面视觉、家族/年龄/死亡调度、全部文化命名未完成。
