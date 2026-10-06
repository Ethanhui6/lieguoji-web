# 本次源码和新增历史审查

固定审查范围：90cdabc6fa1c0cd0d3f8d4037b93870b63421db5..297f1e30531c4adfc0ac85463579915e24e0b4ea，118提交。后续本批代码/证据另以最终源码指纹绑定。只读取本项目Git对象，没有读取浏览器认证、CLI凭据或原作SDK配置。

风险路径610条/320blob：562工程检查日志、24 Playwright trace ZIP、24嵌套.autopilot工程源码快照。逐路径/blob清单见plan/reviewed-history-2026-10-06.json，确定摘要d37739b4d8bec71ee32eefe63a3f16b9f9599f5f7288094036397f666c9c9c41。无通配授权；任何路径或字节变化重新阻断。

24 ZIP共510588989B，最大76900415B。内存检查中央目录、成员路径/加密/压缩/长度/CRC，无穿越、重复、symlink、加密或未知二进制。包含341文本、16119JPEG帧、15PNG附件。636网络记录仅GET 127.0.0.1:4173/4175，查询键atlas/atlas-format/country；无Cookie/Authorization/Set-Cookie/API-key/POST/storageState/httpCredentials/proxy。637份不同文本扫描私钥、GitHub/AWS/Slack token、JWT、URL凭据、Bearer/Basic及密码秘密赋值无命中。抽看五类游戏失败截图，不是逐帧人工审查。

其余新增历史6795 path/blob记录、6016路径、4179blob，共312578274B；3550文本+1解压GPU JSON扫描无凭据命中。递归1704JSON/380369节点，无完整玩家存档envelope、账号凭据对象或原始IL2CPP类型/方法dump。5JSONL仅模块加载/hash。75合成地形.bin和2诊断.lgab与既有生成器清单大小/SHA256一致；PNG410/JPEG141。普通历史摘要2ec2e35e6fbcc8b24583b8f13432ccd081833c4ce8780a580c6a74117c19fa3b，前缀lieguoji-reviewed-ordinary-history-v1 NUL、ASCII按path/blob排序，每条path NUL gitBlob NUL bytes NUL sha256 NUL。

825历史版本不是当前tip；其中46条已删除的vite-cache/deps路径仍会上传，共8669241B，来自React/PixiJS/d3等14npm包预打包JS/source map/元数据，含669份第三方源码映射和版权标记。已经检查其历史，不宣称tip删除即可不上传，不重写历史。上述是秘密与来源审查，不冒充所有第三方许可与图像逐帧验收。

本轮只增加网页适配源码、完整旧规则.source归档、测试、审核清单和证据，不加入原安装包、原始dump、真实玩家完整存档。最终dist仍由check-dist逐项核验；只允许游戏产物进Pages。

本轮增量独立只读复核快照：68文件（27已跟踪修改、41新增）、1254324B，其中66文本凭据模式扫描无命中，4JSON共8913节点未发现完整世界存档或认证对象。26份compat/transport1/.source与297f1e3对应网页源码换行归一后逐字相同，manifest全部匹配。browser.json仅有限舰队/路径/战损/校验值和布局观察，不能恢复完整世界。两张截图仅游戏地图与海军UI，JPEG/JFIF且无EXIF/XMP/COM；已修正.jpg后缀。原作报告是授权三函数摘要，没有完整反编译dump。此为过程中快照，后续报告/重命名和最终候选另由最终清单与源码指纹绑定。

最终显示增量只读复核快照（2026-10-06 12:30:06.708香港时间）：123文件（32修改、91新增）、2302618B，118文本/1PNG/4JPEG。摘要f27b4adee8dea6a19881481358080370394c9ab1d4a25b87dfd2b89a9e402fbb，前缀lieguoji-worktree-review-v1 NUL，JS默认路径排序后path NUL bytes NUL sha256 NUL。JSON1631节点无完整run/world或凭据对象；凭据扫描仅本地授权常量误报。56份兼容.source逐份与manifest及网页源版本匹配。授权BattleSword图集SHA仍12b0852354a1975fa927cb9f5191665741cc87d262810a54d21f8b1d3f21b3b3，PNG仅IHDR/IDAT/IEND；4JPEG逐图查看均游戏界面、无EXIF/XMP/COM。没有新增第三方依赖。后续证据和测试的改动由最终候选清单及发布指纹另行绑定，不能把这份时点审核称为覆盖后续所有字节。

最终待绑定增量补查（2026-10-06 13:04香港时间）：order-motion/测试、map、FmsGame、动画浏览器测试与CAPITAL_CRISIS.md六文件经只读复核，无凭据/完整存档/raw dump；born时间与诊断只涉及显示，政治文档是限定公式和未知项。之后测试改用MutationObserver读取真实绘制并以实际UI逐日推进到沉没，未注入模拟数据。新增war-desktop-production.png及war-mobile-production.png均为自建双岛测试世界的战况面板，本任务已逐图查看，没有其他网页/账号界面。最终文档、报告与这些图像统一收入source-candidate.json和完整发布指纹；只有最终清单才代表待上传字节。

v9增量只读复核（2026-10-06 14:30前后）：20重点文件210380B，无安装二进制、raw dump、凭据或完整玩家存档。30份v8归档及live源码逐项匹配，原指纹不变。原作动员说明中的公开方法/月检公式归属已按复核纠正。后续两张v9图片已逐图查看，均现场创建的测试世界；生产浏览器报告只保留用例结果、错误、有限交锋/兵力/校验值与动画采样，不附完整run或原始trace。新版脚本修复只是改用revision键轮询，实际完整保存/刷新/重新保存的比较保留。最终候选由source-candidate.json重新逐文件绑定，不拿本段时点统计冒充最终清单。

云端修复增量复核（2026-10-06）：新改动仅7个测试文件、计划/续接、3份限定原作小函数摘要和部署/修复回执。运行代码、UI、Worker、依赖和美术与已上传26296d5逐路径比较不变；v9指纹仍eade9f19e7b2bfecef9b59b688bd53c29ee95c13af1eb5e3f440b20fc5ed4dad。新增摘要没有raw dump/安装二进制，回执没有完整存档/账号凭据。GitHub失败构建日志只保留本地.autopilot原件及回执中的SHA/实际运行URL，不提交控制台登录页面或认证信息。新增源和回执重新纳入最终candidate清单，不把旧清单冒充这一增量审查。

历史续接：26296d5中155候选与实际Git字节逐份一致，另审清单自身及readiness两项。普通已审截止延伸至这个已审提交；610风险条目/摘要不变，后续未知历史仍拦截，24项发布门回归通过。见fms-tactics-v5-2026-10-06/HISTORY_DELTA_PRIVACY.md。
