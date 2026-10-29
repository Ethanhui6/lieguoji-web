# 阶段 1 验证记录

- 分支 codex/swiftui-native，PR #29，不合并。
- 首次成功 CI：https://github.com/Ethanhui6/lieguoji-web/actions/runs/40881678572
- Linux Swift 5.10 / macOS Core 单元测试通过，XcodeGen、设备 archive、IPA artifact 均通过。
- 下载检查：arm64 Mach-O，最低 iOS 17，独立 bundle identifier com.lieguoji.native，120Hz 配置为 true，没有网页 HTML/JS 资源，没有 provisioning profile。
- 首包发现 XcodeGen 生成的 Info.plist 版本默认 1.0；现显式绑定 MARKETING_VERSION/CURRENT_PROJECT_VERSION，重新运行 CI 后交付 0.1.0。
- 当前仅空 Metal 视图、系统界面、帧时间叠层。无真实地图、无模拟、无世界存档。不是完整游戏，也不是性能验收。
- 真机待验：自签后启动、横竖屏/安全区、叠层开关、后台恢复。叠层衡量显示回调间隔，不能证明 GPU 帧耗时。120fps 未验证。
- 下一阶段：只读转换已有格网/地形数据，建立来源哈希；Core 测试坐标变换与 tile 裁剪，Metal 绘制真实地图并接通原生手势。
