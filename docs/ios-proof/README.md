# 0.5.45 验证补记（2026-10-28）

当前四张截图已更新为 0.5.45 WebKit 横竖屏，工具网格为主动展开状态，日常默认折叠。两个 iPhone 布局流程均通过，包括生成、地图像素检查、面板操作、保存及重载。测试使用 Windows Playwright WebKit，不是原生 capacitor:// WKWebView，也不是真机帧率验收。

本地全量检查单测 216 文件 / 1954 项通过、1 项跳过；浏览器全量首次被旧外交断言阻断；断言已修正，外交单独回归通过，全量重跑中，未标全量通过。手机行军连续性与暂停命中通过，三尺寸 20 界面旅程通过。Windows Chromium 默认 GPU 路径出现截图残影，软件路径和 WebKit 对照未出现；视觉旅程使用软件渲染，因此不能据其评价硬件帧率。

新的手动 IPA 工作流记录 macOS WebKit 检查结果，再继续生成未签名 arm64 包。高刷新率仅解除应用层限制，真机 120fps 待测。

---

# 0.5.44 iOS 地图回归证据

本目录是 Playwright WebKit 的浏览器证据，**不是 iPhone / WKWebView 真机验收**。用户提供的 IPA 真机截图显示：编辑器白色地图矩形、羊皮纸缺失、顶部按钮重叠；进入世界后报 `capacitor://assets/parchment-DcvfQmoH.jpg` 加载失败，世界空白。

## 根因与源码核对

- `node_modules/pixi.js/lib/utils/path.mjs`：`isUrl()` 只识别 HTTP(S)，`rootname()` 对 `capacitor://localhost/` 仅返回 `capacitor://`；`toAbsolute('/assets/parchment.jpg', 'capacitor://localhost/')` 实际输出 `capacitor://assets/parchment.jpg`。
- `node_modules/pixi.js/lib/assets/loader/Loader.mjs` 再次调用 `path.toAbsolute`；因此只给 `Assets.load` 传绝对 URL 并不足以彻底绕过该解析器。
- `loadTextures.mjs` 默认 `preferWorkers=true`、`preferCreateImageBitmap=true`、`crossOrigin='anonymous'`。两个羊皮纸入口改用共享的 `loadLocalTexture`（浏览器 `new URL` + 无 crossOrigin 的 `Image`），失败进入显示错误处理并可重试。
- `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift` 仅在 live reload 分支添加 CORS 头；`CAPInstanceDescriptor.swift` 会把 WKWebView 自己处理的 HTTP(S) scheme 重置为默认 scheme；`CAPBridgeViewController.swift` 为本地 scheme 注册 `WKURLSchemeHandler`。没有找到能修复 Pixi URL 且保留 origin 的公开配置，未添加私有 WebKit 开关或修改 node_modules。
- 保持 `capacitor://localhost`、Capacitor 配置和 IndexedDB/localStorage key 不变，无存档迁移或清理。

## 资源路径审计

| 路径 | 处理 |
| --- | --- |
| 两个原作渲染器的羊皮纸 | 移除全部业务 `Assets.load` 调用；浏览器 URL 解析和原生图片加载 |
| 战争效果、战斗图集、单位图标 | 已使用 `Image`，无 crossOrigin；Vite 导入地址交由浏览器解析 |
| 楷体 WOFF2 | `fetch(new URL(...), {mode:'same-origin'})` 读取二进制后构造 FontFace，避开 URL 字体加载器的隐式匿名 CORS |
| 地形、海岸、气候、文化 Worker | 保留 Vite `new URL(..., import.meta.url)` 及经典 Worker；不经过 Pixi 拼接 |
| HTML / CSS / 动态模块 | 保留 HTML crossorigin 清理，关闭模块预加载并合并 CSS，避免 Vite 动态预加载创建 crossorigin link；未发现业务 CSS url() 资源路径 |
| 音乐 | 原生 Audio、Vite 导入的 m4a 地址，无 crossOrigin；测试服务器提供 audio/mp4 MIME |
| `/api/cloud/` | 后端 API，不是包内资源；原生壳无本地云服务，未擅自把用户认证请求转发到外站；本次只验本地保存 |

## 复现方法与边界

使用项目 Node 24.18.1，安装依赖与对应 Playwright 浏览器后：

```sh
npm run check:full
npx playwright test --config=playwright.ios.config.ts
```

专用配置以 `/ios-proof/` 为 base 构建到忽略目录 `.autopilot/ios-proof-dist`，用 `scripts/ios-proof-server.mjs` 静态服务。根目录资源一律 404，无 CORS 响应头，无 Vite 开发中间件或请求 mock。正式构建 base、Cloudflare 配置、iOS 手动工作流不变。

使用 iPhone 13 设备配置，视口指定为 393×852 / 852×393，注入壳标志及 47/34px 竖屏、47px 左右和 21px 底部横屏安全区。操作使用 Playwright 正常点击，不以 DOM click 替代。覆盖生成、保存、刷新、进入世界、地图像素、菜单、世界保存刷新；任意 console error、pageerror、requestfailed、HTTP 4xx/5xx 均失败。JPEG 为 CSS 像素尺寸的小图；完整 PNG 和执行日志在 `/workspace/lj-codex-shots/`。

HTTP WebKit 无法忠实复现 WKURLSchemeHandler 的协议/CORS 行为。错误主机由安装的 Pixi 源码直接执行复现，并由 URL 单测覆盖修复；自定义协议下的字体、纹理、Worker、音频和 GPU 上传仍需重新打 IPA 真机确认。

## 本轮结果

- `npm run check:full`：通过，216 文件，1953 项通过 / 1 项跳过，约 390 秒；构建及 38 项产物白名单通过。
- 最终新增缓存/失败重试断言后，`local-texture.test.ts` 单独 5/5 通过；lint、typecheck 再次通过。面板 CSS 最后修正后，正式生产构建及白名单再次通过。
- `npx playwright test --config=playwright.ios.config.ts`：最终 2/2 通过，约 1.4 分钟；横竖屏均无 console error、pageerror、requestfailed 或 HTTP 错误。实际检查 FontFace 已加载，并点击国家、军事、大事记、统计、AI、编辑国家、生成地图（取消），以及图层和菜单。
- `npx playwright test tests/fms-editor59.spec.ts tests/fms-culture47-land-camera.spec.ts --project=desktop-chromium --project=mobile-chromium`：4/4 通过。
- 扩展测试曾发现编辑国家的 column flex 继承 wrap，且说明文字 flex-basis 为 100%，使完成按钮排到可见区域外。手机端改为 nowrap 并重置 flex-basis，修正后横竖屏测试通过。
- 未运行全量 e2e；用户指出的既有 fms-actions 失败未在本轮修复或重新验证。未构建/安装新 IPA，未进行真机复测。

小图（均为浏览器模拟）：

| 方向 | 编辑器 | 世界 |
| --- | --- | --- |
| 393×852 | [编辑器](ios-portrait-editor.jpg) | [世界](ios-portrait-world.jpg) |
| 852×393 | [编辑器](ios-landscape-editor.jpg) | [世界](ios-landscape-world.jpg) |
