# Preview16 实际生成器历史冻结候选

仅 staging 捕获与兼容候选；未提升、未跑测试/build/browser、未修改生产/docs/tests/dist。其他工作者继续独立维护浏览器检查与下一批候选。

实际 `0.5.0-preview.16` 构建 SHA：`967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499`。捕获 HEAD/构建 base：`72fd76591d1258515b72f5b50058bb142c6e1520`。实际源含未提交的海岸尺度参数、法线覆盖回归与 preview15 存储历史，`sourceIsHead=false`、`closureSourceMatchesHead=false`；HEAD 不能代替完整源码身份。

捕获时间为 `2026-09-27T18:10:10.167Z`。实际冻结 **11 个生成器闭包、41 份原始源码、53 份归档文件**（inventory 列出其余 52 项）。从当前源和冻结原件分别重算全部闭包，与真实 build 逐项一致。源码快照 SHA：`03bed455185d324988bcbc86284cf5a108d291aa63e563892730839fb2174562`。

局部技术证据继承 `.autopilot/ph06/coast-scale-checks/first/`：10 文件 **53/53**、六项全局/相关检查通过、25 个产物，源码前后稳定。归档保存实际 verification、identity-verification、源码前后快照、build、scope 和 unit 原件，本次不重跑。对照冻结 preview15 独立重算得到 9 项仅历史依赖变化、2 项其他运行源码变化，未预设变化数量，模拟引擎保持一致。

捕获时桌面 `desktop-first` 尚无终态 verification，记录为 **pending**；手机与平板为 **not-started**。不复制运行中的目录，不把稍后产生的结果补写进已冻结 provenance。后续终态结果应进入本轮正式产品检查归档。自然视觉、用户、真机、性能、PH 与浏览器整体验收均未接受。

preview15 的首轮 51/52 失败继续保存在 `docs/evidence/ph06-asymmetric-coast-2026-09-28/raw/root/first/`，本批只引用，不复制旧归档、不冒称 preview16 发生该失败。

目标归档为 `docs/evidence/ph06-preview16-generator-history-2026-09-28/`。准备了 `generation-history.ts` 镜像和 `detail-preview16-history.test.ts` 新兼容回归镜像；**5 项测试已写未执行**，覆盖全部真实闭包与原字节、当前身份报告、11 种历史配方存储往返与禁执行、命名空间隔离、伪造/未来字段拒绝及 v4 局部地貌语义。原 recipe 只允许原样读回，不允许执行旧代码或静默迁移。

下次地貌变更前由 root 核对 ready 基线与全量原字节，先提升历史归档，再提升两个镜像；下一版本须取得自己的检查和构建证据。冻结期间浏览器状态只是捕获时的观察，不是最终三端结论。
