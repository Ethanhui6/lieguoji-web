# Cloudflare Pages 状态

实际项目：lieguoji-web，查询无同项目后创建。实际URL：https://lieguoji-web.pages.dev/ 。部署方式已锁定原生Git，main自动生产与非main分支预览；无Direct Upload链。
2026-09-23 本轮官方控制台登录已成功，账户ID由当前 Workers & Pages 页面核实为 `0dccd3742e707d4f6506f2de668e516e`。没有修改已有其他项目。CLI OAuth旧状态曾过期，本轮以原生控制台集成为优先，不读取认证配置或令牌。
GitHub浏览器及CLI已验证 Ethanhui6；私有仓库 Ethanhui6/lieguoji-web 与PR#1已建立。Cloudflare现有GitHub App可读取该目标仓库，无需新增访问。初始main通过CI后已完成生产部署12758757-0b83-4f21-a99e-63029431d006；世界工坊等待分支预览、同提交CI与受控合并。未使用部署Secret。

已准备的真实构建命令：npm run build:cf；输出 dist；生产分支 main；Node 24.18.1；根目录项目根。
build:cf 顺序为计划校验、lint、类型检查、单元测试、生产构建及产物检查。GitHub CI 另跑 Playwright E2E；只有通过检查的提交才进入生产分支。

发布后必须用平台实际返回的 HTTPS URL 验证资源/Worker MIME、交互、深链接刷新、控制台、版本 SHA 和保存恢复。未完成前不标记 M0 云端验收通过。
当前0.2.0默认入口为世界工坊；线上验收应包含手画/生成→国家→首都→开始自建世界→保存刷新；旧战役入口 `/?demo=1` 继续回归。`build.json` 的 entry、scenarios、commit 对应真实构建，不能用本地URL替代HTTPS证据。
不得整包上传根目录。docs/plan/references/真实存档/认证资料不可进入 dist。不购买、不改 DNS、不重复创建项目。
