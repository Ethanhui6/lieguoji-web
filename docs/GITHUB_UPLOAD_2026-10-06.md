# 本次 GitHub＋Pages 试玩预览授权

## 2026-10-22 用户持续授权：每次更新完上传

用户直接要求：“能不能上传到GitHub 连接上我的Cloudflare我想在手机上测试 以后每次更新完版本都上传”，并说明“GitHub连接了我的Cloudflare 每次更新完上传 我就能直接在手机端体验”。据此：每完成一个经本地检查的版本，即以同一开发分支 codex/ph06-world-generation 的快进推送触发既有 Pages 原生 Git 预览，用户在手机上打开固定分支预览网址体验；main 正式站不更新，不建第二部署链。每次仍须完成新增历史隐私审查、本地构建/核心浏览器检查、源码指纹重新绑定独立 preview20261006（新有效期）并通过 pre-push，不绕过 hook。

官方 Pages 构建限时20分钟，全量单测已超过该时长（10-19 推送的 Pages 构建失败），因此本次起 `build:cf` 不再包含全量单测，全量单测改由 GitHub Actions 的 `check:full` 对同一提交运行（见 docs/DEPLOY_CLOUDFLARE.md）。Pages 部署成功与全量测试结果分别报告。此授权不解除完整PH／真机／视觉门，也不授权合并 main。

## 2026-10-08 用户再次明确授权

用户直接要求：“我上面这些功能做完上传到cloudflare 我要在手机上实际操作”。沿用此处唯一既有 Git 原生 Pages 预览链、同一开发分支及 main 正式站保护；本次候选包括中文真实文化名称、两种命名的480城容量、重要历史、实际外交和海陆军令，以及旧规则继续入口。交付范围和仍未完成事项见 docs/evidence/fms-chinese-culture-release-2026-10-08/CONTRACT.md。必须以本批最终源码与真实检查重新绑定独立 preview20261006；旧截止时间已过期，不能用于本次上传。没有取消完整PH／真机／视觉门，也不授权合并main或部署其他资源。

以下历史授权与保护继续保留：

用户直接要求：“继续 做完上传到GitHub”，随后明确选择：“GitHub＋Pages预览，保留正式站”。本次只对经过检查的开发分支试玩候选建立有界例外，不改写历史 PH、真机或用户视觉状态。

- 目标为已核实的个人私有仓库 Ethanhui6/lieguoji-web，同一开发分支 codex/ph06-world-generation；只允许干净 HEAD 的正常快进，不更新 main/tag，不建第二仓库。
- 本次包含新局与自定义、手动跨海运输、持续海战、战役分层/国别比较、授权原作动画的有限切片和工程证据；自动跨海远征、封锁、完整政体/家族/信仰未完成。
- 上传前用户继续要求原作陆战与动员，因此同一候选补入v9：道路交锋、实际伤亡、地区抵抗与可切换空城接管、常备月征、紧急动员、人工布兵和统一内部粮需。各项依然必须通过检查；不据此扩展正式站或宣称全原作移植完成。
- 用户随后继续要求完善战争。本次续接为同一开发分支的 v10 有界切片：先冻结已发布 v9，再接原作击溃返乡重编、连续补员、独立存档与明确复制。沿用上述 GitHub＋Pages 试玩授权，保持 main，逐次绑定实际源码和真实检查；金币费用、完整原作等价及真机视觉没有自动通过。
- 用户进一步要求细地块、一块一城、分裂领土分别显示国名、灭国取消首都标记、顶部记史。本轮 v11 在冻结 v10 后实现上述有限切片及真实传位/地方起义/和平独立/覆亡历史；复用授权原作中文人名两列，已核实任次与消息时长。依然是同一分支的经检查预览，完整家族/附庸/原作政治公式与全部正式验收不包含；具体来源和缺口见本轮 NATIVE_EVIDENCE。
- v11 的实际 Pages 构建在细辖区日结性能检查失败。用户完成官方登录后已取得日志；v12 是同一试玩候选的性能修复，保留 4000ms 上限与 722 辖区/480 军规模，并冻结已可能产生本地存档的 v11。仍只允许本条既有开发预览范围，不增加部署类型、正式站或额外权限。
- 本次包括唯一现有 Pages 原生 Git 链的开发分支预览。main正式站保留；只上线dist游戏产物，不另建 Direct Upload 或 Actions 部署链。GitHub Actions 与 Pages 全部执行，不使用跳过词或停用检查。
- 独立 `preview20261006` 合同必须绑定本文件、同分支、有效 UTC 期限、完整候选源码指纹和真实 localBuild/coreBrowser/sourcePrivacy 证据。任何源码、证据或历史风险内容变化都要求重算并复核。源码专用 `githubUpload` 路径保留为未启用的独立安全选项，不用于这次已授权预览。
- `releasePolicy.state=locked`、`cloudWritesAllowed=false`、正式十项 readiness、9月24日旧授权全部保留。此次上传不代表完整发行或原作等价验收。
- pre-push 继续核实仓库、单 ref、HEAD、快进、候选清单、历史内容及检查；不绕过 hook。

官方机制：[Cloudflare 原生 Git 集成](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)；[GitHub Actions 跳过规则](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)。两者是不同机制。本项目远端旧提交曾出现 Pages success 而 Actions 浏览器失败，不把原生 Git 部署当作依赖 Actions 的发布链；推送前跑真实本地全检查，推送后两项分别核验。本次仅预览，不合并生产。

实际推送 SHA、同提交云端 CI 和 Pages 观察结果在上传后写续接记录。没有实际结果之前不记为通过。
