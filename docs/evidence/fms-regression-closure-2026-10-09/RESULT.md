# 继续游戏修复：冷恢复交接与历史回归闭环

2026-10-09。根独占写入；本批基线720b1ba，实际源码摘要见 artifact.json。仍是WEB-PH04 / WEB-04-37的限定修复，不是完整原作或全部PH验收。

## 玩家能实际验证的结果

本机原入口 http://127.0.0.1:5273/?fms=1 已接入检查通过的冷恢复界面。先确认同源第31日/3755tick已暂停保存，更新自己的静态服务，保留旧不可变产物与已加载旧hash资源，再通过真实浏览器刷新、进入世界、继续同一个存档。地图恢复到31日/3755tick；点击继续，打开越帝国详情，日期持续到42日且人口更新，随后暂停并保存于44日/5362tick。页面控制台错误列表为空。没有建立替代新局或修改存档引擎。

同源服务会话32928，使用 .autopilot/culture47-cold-live-server.mjs；根为 .autopilot/culture47-cold-handoff-checked，旧hash资源回退到 .autopilot/culture47-replay-final-checked。5274同一不可变新产物为自动测试入口，服务会话98513。两者均只绑定127.0.0.1，手机不能直接访问。5271第19日世界和5254/5261未动。

真实截图：continued-day31-detail.jpg / continued-day31-map.jpg 为更新前；continued-same-save-day44-detail.jpg / continued-same-save-day44-map.jpg 为同源更新、刷新、继续、保存后的实际页面。截图是JPEG，不是效果图；没有以这张合成地图宣称达到原作视觉。

冷恢复期间已看到真实“正在恢复历史79 /315 · 第7日”进度；从点击进入至后来观察到可继续的上界265.072秒，包括其他工具工作和非连续观察，不能冒称精确恢复时长。恢复完成后点击继续至观测到地图2.277秒，也包括输入/AX开销。1000日长档与目标帧率仍未验收。

## 实际修改

- CultureWorld47冷读取时建立真正执行过日志的候选Worker；完成原来的主槽/备份、版本、checksum及完整journal检查后才提升为可继续世界。点击继续复用该候选，避免再计算同一段历史。两槽主备日志属于当前执行的完整前缀时，实际命令为load、verify，verify返回私有见证；继续不再次load。
- 候选与读取effect、client和完整journal绑定。取消、卸载、线程关闭、未知引擎、验证器不可用会清理/阻断候选；新建世界会丢弃旧候选。关闭的候选重新真实load，保留原存档和CAS。不修改session/storage/Worker模拟规则。
- 所有引擎Fingerprint相对5273旧产物完全一致，两份已登记旧47引擎保留原字节。
- 修正八个旧浏览器用例的真实前置/产物验证：通过可见UI展开地图/舰队分组、显式战乱开局、按实际加载chunk确认Worker、资源哈希绑定实际服务目录并等所有审计完成。没有去掉战斗、海运、恢复、资源/版本或节奏断言。

## 检查与证据边界

类型、lint、生产构建及67产物审查通过。冷恢复首轮42项为40通过/2失败；失败是新增测试在首次写入前读取undefined.revision，修正轮询写法后该例三设备3/3通过，去重42个设备用例已有通过证据（不是45项）。含两个冻结旧引擎、不可用旧引擎锁写、取消迟到响应、候选丢失真实重载、ready旧档直接创建新局，以及默认36,864点地图继续/排队/保存刷新。默认地图4×首日实测桌面15.792秒、手机尺寸16.200秒、平板尺寸16.959秒，均保留30秒原门槛，不冒称4倍目标速度或iPhone真机达标。报告为cold-browser与cold-cancel-final，失败保留。

旧全量浏览器实际来自5266，计划369项，仅跑至191：181个ok、8失败、2skip，无最终JSON汇总。旧交接把失败写为6是计数错误，本记录更正为8。定点回归8个唯一(title,project)已通过：desktop报告提供Destiny20/Entry/Maritime；tactics-final提供两项战术；seed-final为种子完整流程；mobile提供Cartography；animation-final为战斗动画。Seed与动画重跑不重复计数。全部最终retry0，errors为空。

旧失败性质：Destiny20是100秒时3593tick不足3600的节奏失败；此轮保留门槛并实测82.702秒达到3709tick，且整项月结与恢复通过。Entry硬编码旧Worker文件名。Maritime切换选中对象后分组重新折叠。Tactics未明确战乱开局，不能在和平时绕过军令限制。Seed首次错误是服务旧产物却读当前dist的ENOENT。手机动画/Cartography未展开折叠地图工具。回归初轮desktop为4pass/2fail（标签不完整），下一tactics为0pass/2fail（访问错误的world.relations）；最后按实际完整标签及world.statecraft.relations修正为2/2，失败报告保留。

这些八项回归使用旧5273不可变产物，早于本批冷恢复改动；不能冒充当前候选全量通过。完整单测串行复验已启动，旧完整7超时仍须用最终结果关闭；完整浏览器也尚未全量完成。没有push、Pages上传或正式站变更。

## 后续

接续当前完整检查进程2130（.autopilot/culture47-full-serial.txt/json），不要重复开启重负载套件；完成全部适用检查后再做候选隐私审查与有界preview20261006合同，同分支GitHub/Pages预览，保留main。原作地图/手机/视觉门、完整官制与兵种编辑、多家族分封、900日海战仍独立未完成。此前历史13个中间blob只读审查见history-readonly-review.json，不能替代新提交后的完整隐私复扫。
