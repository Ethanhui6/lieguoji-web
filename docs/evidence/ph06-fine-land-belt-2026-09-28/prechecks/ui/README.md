# 地图工具界面候选：待主代理审阅，未提升

状态：**STAGING / 未测试 / 未构建 / 未运行浏览器 / 未生成地图**。
本目录不在生产入口，不是已通过的视觉稿，也不代表 PH06 或其他阶段完成。

## 基线与文件责任

- 工作目录：`D:/游戏/架空地图模拟器`。
- 基线 HEAD：`72fd76591d1258515b72f5b50058bb142c6e1520`。
- 基线分支：`codex/ph06-world-generation`。
- 以捕获时文件实际内容为准，两个原文件未列于当时 Git 脏文件；精确 SHA-256 见 `baseline.json`。
- `baseline/src/editor/AtlasStudio.tsx`、`baseline/src/editor/atlas-studio.css`：只读原始镜像。
- `candidate/src/editor/AtlasStudio.tsx`、`candidate/src/editor/atlas-studio.css`：候选镜像。
- 候选仅涉及上述两文件的布局标记与限定 CSS。生产 `src`、`tests`、`dist`、renderer、地理规则、Worker、存档、依赖和版本均未写入。
- 不包含自动覆盖脚本。提升前由主代理比对精确基线，并把最小差异接到最新文件；不要整文件覆盖已经继续演进的 AtlasStudio。

## 实际看过的输入

- `.autopilot/ph06/coast-scale-checks/mobile-first/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-mobile-chromium/two-continents-restored.png`
- `.autopilot/ph06/coast-scale-checks/desktop-first/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-desktop-chromium/two-continents-restored.png`
- `AGENTS.md`、`docs/DESIGN_V4.md`、当前 AtlasStudio 和全局壳层 CSS。
- 已读 `C:/Users/Administrator/.codex/skills/apple-design/SKILL.md`。采用清楚分组、直接操控、轻量层级、平台字体及辅助偏好；没有引入品牌图标、专有字体、弹簧库或新的触控识别。

## 观察与候选方向

当前手机图中，两排独立大圆角工具面、宽保存横条以及较重的页头/底栏，形成数条强横向分隔；实际方形世界因此更像嵌入页面的小预览。桌面也有同样的工具分裂与过宽状态面。

本候选只整理界面，不改相机或世界尺寸：

1. **一个工具架、两个真实分组。** 将缩放组与浏览/画大陆/网格组装进 `.atlas-tool-shelf`，桌面横排、窄屏自然两行，统一一个近实色材质和边界。所有按钮始终存在，没有“更多”菜单或只靠手势进入的功能。增大文字时允许自然换行和原生滚动，不缩字、不裁切按钮。
2. **普通状态按内容取宽。** 保存成功仍常驻、仍用原有真实状态文本和 `role=status`，不再默认铺满 560px。异常保留明显边界与错误色，恢复、忙碌、取消仍完整呈现；长信息可滚动，没有定时淡出、遮住错误或点透可见反馈。
3. **轻量页头与导航。** 默认页头最小高度从 72px 候选为 64px；底栏/侧栏只减少冗余间距与过大圆角。窄屏把撤销/工坊原文本保留在图标下，保留模式说明。采用既有可缩放字体 token；没有通过变小字或隐藏目的地换空间。
4. **地图渲染原样。** 不修改 Canvas 的 DOM 身份、挂载节点、绝对铺满样式，也不添加 CSS transform 放大、裁掉海岸或改相机 fit。页头占用减少会通过既有 ResizeObserver 改善实际可用视口，具体面积仍需实测。

世界外框、方形世界的全图适配、实际海陆尺度和画面质感仍由当前 renderer 决定。它们不是本候选已解决的事项，不把工具整理宣传成“大世界已经变大”。

## 最小接线清单

TSX 仅增加：

- 根节点 `data-chrome="map-first-staging"`，隔离全部候选样式。
- 包裹两组既有按钮的 `.atlas-tool-shelf.atlas-toolbar`，`role=group` 和分组名称。
- 缩放组附加 `.atlas-zoom-controls`；原创作组附加 `.atlas-toolbar`。
- 浮动状态附加 `data-feedback=alert|recovery|busy|selection|status`，只选择样式，不改变流程。

CSS 在完整镜像末尾标记 `STAGING ONLY`，集中为候选根作用域的覆盖；主代理可独立审阅、移除或整理。

外层工具架保留 `.atlas-toolbar` 很重要：现有标签避让观察的是实际 toolbar。外层从初次挂载就存在，即使异步恢复后才出现创作工具，原观察器也能感知内部变化和整个实际边界；不要求修改 renderer 或标签观察器。

## 保留的行为合同

- 所有既有用户可读文本、按钮 `aria-label`、`data-testid`、禁用条件、事件处理器与命令参数原样保留。
- 浏览/绘制/范围选择状态机、单指/双指、取消、确认、撤销、持久提交与只读备份语义不动。
- 现有四个导航目的地与 ContextInspector 的单正文滚动、半高/阅读、关闭、Escape 和焦点恢复原样使用。
- 原生 ModalDialog 不改，不增加国家、城市、家族、信仰等未实现入口。
- 控件最小 44×44 CSS px；普通状态文本本身不冒充按钮。缩放与导航焦点轮廓明确，按钮按下反馈不依赖 hover。
- 深色使用既有语义变量。候选工具架用实底，减少透明度无需牺牲可读性；高对比及 forced-colors 有边界，减少动态不增加动画。
- 工具架最大高度有界并允许原生滚动；没有全局 preventDefault，也没有改地图触控命中方式。

## READY 清单与尚未验证事项

- [x] 指定两端截图已实际查看，问题和设计动机已记录。
- [x] 精确基线、两个原文件镜像和候选文件已准备。
- [x] 只修改 staging，生产入口保持冻结；不需要新依赖。
- [x] 不触及地理、renderer、Worker、存档和规则，不声称生成器/地图比例已改善。
- [ ] TypeScript、lint、构建：按主代理指令未运行。
- [ ] 360px / Pixel 7 / iPad / 桌面真实浏览器截图与操作：未运行。
- [ ] 工具架实际高度、地图无遮挡面积、真实 44px 命中区与对比度：未测。
- [ ] 大字/浏览器 200%、深色、forced-colors、减少动态/透明度：已写候选约束，未验收。
- [ ] 键盘焦点、读屏分组、短横屏及工具架原生滚动：未验收。
- [ ] 全部原工具、预览确认取消、绘制、恢复、报错长文、标签避让及遮挡：须主代理提升后统一验收。

准备进入主代理设计审阅；不是可直接上传的发行物。主代理可在地貌批次之后决定是否提升，再使用正常门禁验证。
