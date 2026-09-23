# 历史长列表触控补查：部分通过，稳定性待验

2026-09-23，在正式 `https://lieguoji-web.pages.dev/` 的 0.4.0 / `d60098f13087c43d4c0d6970f6450b24c8364ac3` 上，以独立 Playwright 浏览器和固定 70 输入的合成历史包补查。没有读取玩家存档，没有修改产品、跟踪测试或规则。此项不并入已通过的 60 项常规 CI / 27 项正式 HTTPS 计数，不声称真实设备通过。

## 已观测结果

- Pixel 7 Chromium 仿真可通过页面正常导入只读归档，实际 CDP 单指拖动使历史容器 `scrollTop` 从 0 到 106。
- 前两轮自写 raw CDP tap 没有展开 `summary`；第二轮记录了位置稳定超过 600 ms、目标命中且无底栏遮挡，不能仅凭位置稳定证明浏览器手势完全结束。
- 第三轮只将点击改为公开 `page.touchscreen.tap(x, y)`，保留 CDP 拖动与原断言。列表展开，真实双向拖动为 +250 / -250；随后触碰可见 #64 后，5 秒内序号仍为 70。本轮未到分支确认取消或操作后源槽核验，iPad 未执行。不能记作完整触控通过。
- 首次独立事件诊断提前停在 summary，未取得事件数组；trace 与前置条件保留。修正诊断所有退出路径的采集后，最后一次有界诊断未复现：summary 展开，#64 收到可信 `pointerdown → touchstart → pointerup → touchend → mousedown → mouseup → click`，分发前后 `defaultPrevented` 均为 false，目标可用且无 inert，序号 70→64、日期 60、alerts 为空。源归档及全库用量哈希不变，未用普通点击替代触控。
- 诊断末尾缓慢收尾并停指 150 ms 后抬起的对照也产生可信 click；当时已在 #64，不能算又一次定位成功。所有已完成轮次均无页面/控制台错误或失败请求。

结果支持“已观测到正常触控、滚动与定位通路”，不能证明连续快速滑动后的单次点选稳定，也不能把此前失败直接归因于某个浏览器机制。Chromium 的 [tap suppression 源码](https://chromium.googlesource.com/chromium/src/+/refs/tags/133.0.6925.1/components/input/tap_suppression_controller.h) 表明停止惯性滚动时可能抑制同一次 tap，但这仅是后续诊断候选，不是本次已证实原因。没有为得到通过而设置 scrollTop、调用 DOM.click、删除断言或增加产品的强制点击处理。

## 保留证据与后续验收

本地原始证据在 `.autopilot/m4-production-touch/`：首轮 `pixel7/`，第二轮 `recheck/pixel7/`，第三轮 `third/public-touch/pixel7/`，诊断 `event-diagnosis/` 与 `event-diagnosis-final/pixel7/`；均保留 result/trace，失败轮保留截图。脚本与纯合成历史来源也在忽略目录中，不能把这些文件部署到网站。

`ACCEPT-DEVICE` 保持 pending_acceptance，并明确包含这项尚未完成的补查：长列表上下连续拖动、停止后选择较后记录、分支确认取消、源记录字节不变；Pixel 7 仿真的稳定性与 iPad 完整流程未通过，真实 iPhone/Android 与移动 Safari 未测。后续应先区分原生手势终止与应用事件处理，得到可复现证据再修复相应层；不通过一次未复现宣称问题解决。已完成的常规布局仿真、规则回归和核心 HTTPS 验收仍按各自范围报告。
