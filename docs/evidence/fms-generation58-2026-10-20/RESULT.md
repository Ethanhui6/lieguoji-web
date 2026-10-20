# 随机种子与实际行军箭头

源码 b4d35f0；本机 http://127.0.0.1:5370/?fms=1 。产物.autopilot/fms-generation58-checked；构建时基线commit 4d66cd9e25eef0b18da784d86d5110a208c5d111，包含随后提交为b4d35f0的生产修改；引擎 9d1d97dcd2b209983c26625dfe3ca74e8033e5b47dedc6e0e101ab9fcba30884。旧5369/dist保留，无上传。b0d1旧引擎逐字节冻结。

种子此前固定1337，没有随机按钮。现在初始随机，每次随机默认开启；手动输入或点击换一个种子后固定输入。生成候选捕获该次种子，取消不提交地形。浏览器实际保存高度数组证明不同种子不同结果，输入首次种子后逐点复现，不只验证输入框数字。

箭头此前依赖旧combat对象和world.armies.route；当前文化世界传入undefined，真实路径已迁至armyPositions，因此简单解除combat条件仍无箭头。现在读取actual travel records的remainingArmyTravelPoints47，敌对终点/正在移动/非撤退/存活才生成。绘制最多12条、同国同目标最多2条，屏幕长度少于12px隐藏；每帧按实际显示位置更新起点。旧combat分支保持。这里复用已有WEB曲线/宽度，并非原作prefab、动画全恢复；方向表达不改变寻路或战争规则。

检查：typecheck、相关ESLint通过；13项生成及冻结引擎单测、15项动效/战争视图单测通过；最终6项桌面/手机Chromium浏览器通过（种子真实高度比较2、箭头2、生成面板2）。构建及128项产物审查通过。手机仿真不是真机。

失败记录：generation58-browser首轮混入尚未重建的箭头产物及未启动时间的场景，不能作最终验收；generation58-final在启动时间后仍2项箭头失败，揭示旧route已不再使用。读取真实armyPositions修复后generation58-actual 6/6通过。保留日志，不跳过断言。截图用固定小型方格测试地图验证行为，不代表原作自然地图视觉等价。

日志位于.autopilot/generation58-{unit,motion,type,build,actual}.log。尚未完成：原作箭头形状/消退与战役层级聚合、海军进攻箭头、地图背景/字体/河流/80k、真机与用户视觉门。下一批按Claude顺序继续原作生成界面与地图体验，同时保留箭头这些差距。
