# 原作方法进入 V5：山丘切片与下一条素材链

2026-10-04，用户再次直接要求“运用以前素材、生成方法，全方位移植网页，按图片流程”。这是旧08:00截止后的新执行授权。本批接续V5，不重建计划、不解除发布锁。基线bfad048，最后旧功能源码fb8e821。原安装目录只读；不运行完整原作、原DLL、恢复脚本，不读SDK/认证/存档。

## 图片流程的实际对应

1. 已有PE/IL2CPP类型、地址、资源索引继续使用。不是ELF/DWARF；当前无hk4e-mcp，不能宣称已调用。
2. 三个只读子任务分别核对一个坐标函数、生成器接线、海洋资源；root独占代码/证据写入。
3. 原GetHeightMap数值恢复已完成，本批不再重复反编译，直接接V5可玩工具。
4. 代码检查、原数值夹具、Worker和当前网页操作验证分别记录；没有原进程联调或真机等价声明。

## 找到并修正的接线断点

V5“生成地形”一直调用网页自研fms-shape-preserving-relief-v4；已恢复JS HeightmapGenerator仅在旧Atlas SeedTerrainPanel中使用。原生Hill传播函数也一直没有V5调用者。本批新增“绘图设置 → 山丘 → 放置山丘”，点击/拖动到一个落点，松手计算候选，原图对照/取消/确认，确认后整步撤销、保存。

真实计算：`generateFmsHillContributions`（原HeightMapGenerator.GetHeightMap）→`applyFmsHillBrush(max)`。原数值证据继承fms-hill-recovery、fms-brush-numeric目录。本批不加入自研噪声替代原传播。不是原JS `isClickToGen` 模板；后者是零高程完整模板生成后 `max(hJsGen,old)`，centerPoint/sizeFactor影响生成范围和指数，尚未接V5。

网页适配边界：

- 圆与网页Voronoi相交选择，中心Delaunay近点；传播使用文档存储邻接顺序。不是原Physics.Raycast/OverlapSphere Collider逐点等价。
- 网页Alea(seed)替代Unity随机流；一般Math.pow不声称原powf逐位一致。
- 首批单次落点、Max合成。拖动仅调整落点，没有恢复原作连续事件频率。网页参数25—100、decay0.8—0.98、默认85/.96，不假称来自原活动UI默认值；无静默clamp。
- 完整传播后冻结海点、h20、所有混合海陆面顶点和玩家锁。固定的是插值几何海岸，不只是mask；光照/河流可以变化。主体保形策略是明确网页合同。
- Worker无数据库/提交；请求/响应绑定world、revision、requestId，取消/失败terminate；主端校验保护、范围、输出、面积水文，但不重跑整个原Hill证明逐点等价。确认才commit，复用CAS、beforeProtection和版本隔离。
- 未接入原作完整地形模板、原BasicMap拓扑、材质/国家等全系统；当前工作不能称全移植完成。

## 本批静态恢复：坐标与查询

`World.InverseVoronoiTransformPoint`：RVA0x6BADC0，raw0x6B93C0；PE unwind[0x6BADC0,0x6BAE29)，105字节，SHA256 `0f28c36869dc103046382e24ccfcc9806998fdc41f4e5865c3fd2b7451522ead`。

每一步float32：x=((point.x+BoundOffsetX)/BoundWidth)*float32(Width)，y同式。字段0x128/12C=BoundWidth/Height，0x130/134=OffsetX/Y，0x138/13C=int32 Width/Height。z未读；无clamp、取整或y翻转。0x6D5D50双float构造体原样写回。网页已经在地图坐标域，不重复套变换。原报告0x43A1D9为调用点，不是真入口。

`World.GetCellIndex(float x,float y)`：RVA0x6B4E30，raw0x6B3430；PE unwind[0x6B4E30,0x6B50A4)，628字节。索引到下一方法0x6B50B0的640字节并不全是本体。有限输入要求0≤x≤Width、0≤y≤Height，越界-1；线程局部KDQuery(2048)、List<int>(1)，清列表后对World+0x400的KDTree查询(x,y,0)，调ClosestPoint@0x787B50；有结果取第一个，否则-1。尚未恢复KDTree构造、相等距离顺序。它是绘图早期范围检查，实际山丘中心还由Collider Raycast确定。原报告0x43A29F为调用点。

仅有界静态解析产物留ignored `.autopilot/fms-audit/binary/cell-query-static`，sourceUnchangedAfterRead=true；不提交整个dump。

## 海洋素材的真实结果

只读 `FantasyMapSimulator_Data/resources.assets` 212940424字节，SHA256 `44023b196a5c2499174f1d3dbf612e37c5aeb9fd4f12f30df99a7258e4233e77`，与既有inventory一致。UnityPy解析+Windows系统D3DDisassemble静态反汇编，没有执行游戏或GPU Shader。

| 材质 / Shader | 原程序 | 接入状态 |
|---|---|---|
| Material#12 OceanNew → Shader#298 Custom/OceanUnlit | ObjectToWorld→MatrixVP；片元直接输出_Color。Stencil Ref2/Always/Replace，参与海洋蒙版 | 原颜色运行时绑定未知；不能据白色默认值直接改网页，也不能把纯色片元等同完整海洋 |
| Material#9 Custom_BlurOcean → Shader#242 Custom/BlurOcean | _MainTex 17点十字核；dx=BlurRadius/ScreenSize.x*MainTex_TexelSize.x，dy同理 | 原RenderTexture输入、ScreenSize、采样方式、颜色空间和处理次数待核 |

模糊权重float32：中心0.227027028799057；四个距离的每个方向分别0.1945945918560028、0.12162162363529205、0.054054055362939835、0.01621621660888195。原程序不归一化，总权约1.772972979。只有D3D11平台代码，需按运算适配GLSL。

Shader#298 vertex/fragment DXBC SHA256：`e1db43b18c53b97e502c0853a8d4d6144ebec623c07db5c8a95c3a6dd7614dbb` / `d5efd6b6d5174400c5f8119a6333b578ff0c784a534478ab9823841a7b5afb5f`。

Shader#242 vertex/fragment DXBC SHA256：`00fa9f706d1a32b2798d4cd59f59a0ed18623df0ef65a4f0259cbd49b6696c56` / `f809aa03da057583986335e2ee098045e0c03fb03688a5ba53b8943485f6b2b4`。

Texture#98 Water_Cartoon_Min是64帧特效图集，非上述海洋材质；噪声/纸纹/UI图片仍需具体消费者及第三方来源核对。本批没有伪称图片已接入网页。

## 接续顺序

在WEB-02-01内优先补原JS局部模板接口与实际UI参数调用，再核海洋颜色/RenderTexture/Stencil绑定后接地图显示；复用已恢复函数，不继续堆自研噪声替代。国家、城市、行政、家族、信仰、战争仍在完整范围内，依赖首份体验门之后逐模块迁移。原作运行联调、手机与用户视觉验收仍未完成；发布冻结不变。

## 已完成验证与本地提交

功能提交 `fd9f366c565aad7a8f6ee2e2c8ca64d3d990ae37`。19文件367测试通过（本批新增22项）；整体lint/typecheck/build通过，39个允许游戏产物。plan检查、11项V5计划测试、22项发布锁测试通过。旧plan顶层非webRebuild字段与firstPlayableGate均与基线bfad048逐字段一致。

首次typecheck因联合stats赋值声明未正确收窄失败，修正后通过，checks-initial.json保留。checkpoint首次误把nextBatch写成文字而不是V5 ID，检查拒绝后修复，checkpoint-checks-before-plan-fix.json保留。没有放宽检查或删除失败测试。

实际开发入口：40789点/590锁，原生山丘237处高度改变，点/三角网一致，9942次跨海陆三角面有向边交点比例变化0，受保护高程改写0。原图对照与取消后整个存档完全相同；确认后撤销再保存与原图除revision外完全相同；重做保存刷新整个存档完全相同。最终文档v2revision38、storedRevision18，beforeProtection仍v1revision10。

实际生产构建：37550点/371锁，232处抬高，真实Worker在严格CSP下完成预览确认保存；刷新后整个存档一致，归档不变。最终v2revision12、storedRevision8，beforeProtection仍v1revision2。两入口控制台warn/error均0。生产build.json与实际源码commit一致；未上传。

浏览器只在桌面Chromium428×926用实际鼠标/键盘验证。IAB的Input.dispatchTouchEvent接口不支持，调用在派发前失败，所以没有合成双指或真机通过的声明。旧开发服务已停，原标签重载曾连接拒绝；已恢复同一5180服务并用新标签续接相同存档origin。没有改防火墙或浏览器安全设置。手机性能、触控、原作逐点等价与用户视觉仍未验收。

本批证据：[开发操作/几何](dev-browser.json)、[生产操作/CSP](production-browser.json)、[检查](checks.json)、[构建](build-check.json)、[计划与锁](checkpoint-checks.json)、[源码/产物指纹](verification.json)。可玩入口见AUTO_HANDOFF；localhost不是云端或真手机访问地址。
