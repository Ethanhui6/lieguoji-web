# 原 InitState 创建入口闭合

原授权安装包 GameAssembly.dll，函数 RVA838EE0。只读静态恢复，未运行原作。

输入文化 null 或空串跳过查找；空白字符串照常查询，不 trim。找到文化时保留输入 ID，不改成对象内部 ID。找不到则获取默认 ID，再 Ensure；Ensure 仍空立即返回 null 及有效 ID，不读取父亲、不抽名字。

成功调用 GenerateName(gender,null,false,father?.firstName)。父亲 familyId>0 时先读姓氏 getter 判断非空，再读一次取原值；不缓存第一次结果。随后以有效文化 ID 创建人物，返回 null 也原样保留。

网页核 native-culture/character-init.ts 已接 v23 新局家庭。未闭合的 Ensure 838CB0 保留显式端口；网页正常路径先核实文化映射，缺失时中止私有新局，而不是猜测原作缺文化策略。此包装与生日/家族/继承等受影响核共 133 项最终回归的独立报告见 unit-guard-final.json。
