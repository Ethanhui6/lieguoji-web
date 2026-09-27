# Preview 20 原生成器兼容基线

状态：**实际源码已冻结，待下一批历史兼容接线**。本目录没有修改生产 `generation-history.ts`、测试或已归档证据，也没有提前把 preview 20 身份加入新版本的存储允许列表。

## 身份与来源

- 实际提交：`4b387f95f5e890f20915a9ab5de4a93c058e5a62`，包版本 `0.5.0-preview.20`。
- 原构建 `build.json` SHA256：`71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018`。
- **原构建的 commit 为 `ef52727aa984a2c22ac6b622475427da61cccaed`，完整保留。** 它是构建时的 Git 基底；后来的 `4b387f9` 提交才收纳已检查的 preview 20 源码，二者不能互换。
- 原权威检查：`docs/evidence/ph06-fine-world-relief-2026-09-28/unified/density-repair`。
- 原归档清单 SHA256：`d196c2e948d6224e0296c7d0276bb1daa77de64cc851bb165576007e11de7e9b`。

`capture.mjs` 只从固定提交的 Git 对象读取源码、工具、包版本与已归档证据。工作区状态另列于 provenance：捕获时 source commit 正是 HEAD；生产源、脚本、测试及包文件没有未提交修改，但 `docs/AUTO_HANDOFF.md` 有主任务的独立文档修改，因此不声称整个工作区干净。

## 已做的冻结自检

从固定提交提取并用原工具重算全部 11 个生成器源码闭包，共 42 个唯一源码文件；另保留 engine 的 5 个源码文件。47 个文件的原始 SHA256 **全部等于**最终 `source-after.json`，没有 CRLF 例外或内容规范化。11 个身份、文件列表和 engine 指纹均与实际构建及原 identity verification 相同，再从冻结副本重读核验一致。

- engine：`65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5`。
- 本包源码行记录摘要：`16ff262496d366845b5d93059321d3d6ad28d822b25713574afda966a042362e`。
- 本包证据 inventory：`2ba5c53382fe7853ffb4c00877a90d6b086cea5b41a29fd0be3c4ec57b33d0d0`。
- 冻结证据 84 个文件；`self-check.json` 是本次只读字节/闭包检查，**不是新一轮产品测试**。

本次没有执行生成器、单元测试、生产构建或浏览器，没有提交或云端写入。Node 仅载入已冻结的指纹工具，对提供的源码字符串解析、哈希，不运行生成算法。

## 原始检查与限制

保留最终轮的 15 个原始记录，包括 `pre-run-build.json` 和 `prior-build.json`；它们的旧版本、commit、内容均原样保留。最终轮原检查为计划、lint、类型、137/137 单元测试（20 文件）、构建及 dist 审计通过。本次仅验证原记录的身份绑定，没有重跑这些检查。

原 `unified/first` 12 个文件独立保留：该轮 unit 进程退出 1，总计 136 项、130 passed、0 failed assertions、6 pending，未产出新构建。不能把 6 pending 写成 6 个失败断言，也不能把后续成功覆盖到首轮 metadata。

桌面、手机和平板原流程分别通过，耗时 202385.316、204460.4001、296415.0902 ms。provenance 为各轮记录原 verification、build 绑定及归档内全部浏览器产物的路径/hash；**不重复复制图片或 trace，不声称重跑或真机验收**。这些耗时仅是该功能场景记录，不是性能门通过。

原 `visual-review.json` 按字节保留：自然山体观感、用户视觉、真机、性能及整 PH 验收仍为 false。光滑 S 形山带和弱支脊等已记录问题并未因为这次兼容冻结而解决。

## 后继使用

`evidence/preview20/provenance.json` 给出 11 个真实 namespace 与 SHA，`frozen-source/` 和 `frozen-tool/` 提供对应原件。后续只能在独立授权批次中据此增加各自 namespace 的历史存储允许身份，并配套原样 roundtrip、旧配方执行拒绝及跨 namespace 拒绝检查；本冻结不授权旧算法执行，不更改任何指纹。

`capture.mjs` 拒绝覆盖已存在的 evidence；`verify.mjs` 可只读复核冻结副本。`ready-manifest.json` 将脚本、README、报告、provenance 和 inventory 绑定为本次交接入口。
