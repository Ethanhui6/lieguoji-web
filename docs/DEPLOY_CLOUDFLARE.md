> **冻结段已被主计划取代（2026-10-19）。** 发布链仍是 Pages 原生 Git：私有仓库 Ethanhui6/lieguoji-web → `lieguoji-web`，main 生产，其他分支预览。不另建部署链。「当前禁止触发新部署 / 全部 PH 后才上传」不再是当前计划，见 [MASTER_PLAN.md](MASTER_PLAN.md)。配置改动归并行的 P-0。下文的已核验地址保留为历史。

# Cloudflare Pages 部署

> **当前禁止触发新部署。** 已有0.4站点保留，Pages原生Git配置不变；main生产、其他分支预览，因此冻结期连文档分支也不得push。全部PH和真机/视觉验收后才按 [V4发布规则](RELEASE_POLICY_V4.md) 统一上传；以下逐批预览／生产步骤暂不适用。

Pages 项目为 `lieguoji-web`，稳定生产入口为 https://lieguoji-web.pages.dev/。唯一生产链是 Pages 原生 Git 集成：main 自动生产，其他分支自动预览。没有 Direct Upload 项目或 Actions 生产上传链。

## 固定配置与本批验收结果

| 配置项 | 已核验结果 |
| --- | --- |
| Cloudflare 账户 | `0dccd3742e707d4f6506f2de668e516e` |
| Pages 项目 | `lieguoji-web` |
| GitHub 私有源仓库 | https://github.com/Ethanhui6/lieguoji-web |
| 生产 / 预览分支 | `main` / 所有非生产分支 |
| 根目录 | 项目根 |
| 构建系统 / Node | 版本 3 / `24.18.1` |
| 构建命令 / 输出 | `npm run build:cf` / `dist` |
| M4 功能 PR | https://github.com/Ethanhui6/lieguoji-web/pull/19 |
| 最终分支预览 | `https://0100487d.lieguoji-web.pages.dev` |
| 最终 PR CI / 测试提交 | `https://github.com/Ethanhui6/lieguoji-web/actions/runs/35868873630` / `075dce9f6b48c34bf8d0d647cb337c265b52af3b` |
| 生产功能提交 | `d60098f13087c43d4c0d6970f6450b24c8364ac3` |
| 生产部署 ID | `8b9382c7-73cc-4ce2-b2e8-cf501c64feed` |
| 固定生产部署地址 | `https://8b9382c7.lieguoji-web.pages.dev` |
| 生产 CI | `https://github.com/Ethanhui6/lieguoji-web/actions/runs/35870297239` |
| 生产 HTTPS 验收 | `27/27 首次通过，0 重试/flaky/跳过` ；范围与报告见 M4 历史验收证据 |

账号与本仓库 GitHub App 访问已经核实；无新的登录或授权需求。原生集成使用平台连接，不需要 GitHub Actions 单独部署 Secret，也不把本地网页登录当作 Actions 凭证。不读取认证配置或令牌。

## 本批已有证据

M4 功能实现 `8d716dda2c92373c62f87aef700c3d93984c4472`，测试等待修正 `f33bb991bbbddc814849d8564ca571d431a65e67`。首个真实 PR CI https://github.com/Ethanhui6/lieguoji-web/actions/runs/35867427462 为 260 单测/60 浏览器首次全过；最终修订也已通过同提交 260 单测/60 浏览器与 HTTPS 预览 15/15。

首个预览部署 `7b84ec2c-9dfe-4526-80fc-96ec4343644c`，实际地址 https://7b84ec2c.lieguoji-web.pages.dev/，首轮 23/24。唯一失败为桌面首次 canvas 就绪的 5 秒断言结束时，Pixi 动态 init 资源仍未完成；已完成 JS 为 200/正确 MIME，无控制台错误。局部首屏等待改为有界 15 秒后，定向 6/6 通过。没有跳过资源、Worker、交互和错误检查；首轮失败保留，不记为首轮 24/24。

完整本地、首轮云端失败及最终发布证据统一见 [M4 历史验收](evidence/2026-09-23-history.md)。先前 0.3.0 基线为 `a25321b17c8d4292d92646ab40d48cfb341b0405`；M3 与更早部署分别见 [经营与外交证据](evidence/2026-09-23-statecraft.md)、[早期云端证据](evidence/2026-09-23-cloud.md)，不将旧部署视为 M4 验收。

## 唯一生产流程

1. 开发分支实现一批任务，提交前审查内容，完成本地检查并创建 PR。
2. 核对当前 PR head、base、实际测试合并提交、CI 结果及 Pages 分支预览；失败、flaky 或修订变化均须解决并重新验证。
3. 同提交检查与预览通过后受控合并。免费私有仓库分支保护 API 实际返回 403，保持私有/免费，不声称服务器强制门禁，不升级套餐或公开仓库。
4. Pages 根据 main Git 事件执行 `build:cf`，只发布 `dist`。main CI 另行运行；Actions E2E 与 Pages 构建并非天然串行，不能用合并后 CI 冒充发布前门禁。
5. 通过平台返回的真实部署 ID/URL 核对 `build.json` 提交、版本和核心规则指纹，再验证实际 HTTPS 的地图交互、Worker/资源 MIME、控制台、深链接刷新、保存恢复和本批历史闭环。失败先修复，不把页面能打开当成通过。

`build:cf` 依次检查计划、lint、类型、单元测试、生产构建及产物白名单；GitHub CI 再运行真实 Playwright。工坊主线须覆盖地图编辑/生成 → 国家/城市/首都 → 推演 → 保存刷新；历史须覆盖记录副本 → 成功操作 → 回放/只读 → 分支 → 独立保存恢复/导入归档。旧战役 `/?demo=1` 与 `/campaign/test` 继续回归。

不得整包发布根目录；docs、plan、references、真实存档和认证资料不进入 `dist`。不混用部署类型，不改 DNS、购买服务或删除旧资源。手机/平板仿真与真机验收分开报告。

功能验收后的文档提交也会触发新构建。最新 HEAD、生产 SHA、CI 与部署 ID 记录于本地忽略文件 `.autopilot/checkpoint.json`；续接须重新查询线上 `build.json` 和 Pages check，不把静态文档的验收 SHA 当成永远最新。
