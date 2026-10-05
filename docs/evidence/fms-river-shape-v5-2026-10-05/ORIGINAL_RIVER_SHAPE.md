# 原河道绘制规则的网页切片

2026-10-05。本地源码 518913a29630c1a9c8d0d493395427c667576232；WEB-02-01仍进行中。本记录是静态恢复与网页工程证据，不是原作进程联调、iPhone验收或用户视觉认可。

## 实际来源与方法

只读授权安装目录的GameAssembly.dll：SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。
此前提取的main.mjs：SHA256 `df79b44e9a22fb2860ab0b9f8ae48df265594f6cdb2e3f7cd693290de619771d`。未运行原作、DLL或恢复脚本；没有读取认证、SDK配置或个人存档。

沿现有IL2CPP方法/地址索引，使用自写Capstone只读脚本分析6个目标方法；脚本和反汇编留在ignored `.autopilot/fms-audit/binary/river-shape-static/`。没有重新拆包，没有把用户图片中的ELF/DWARF当作本包格式。只有选定规则的TypeScript适配进入游戏构建。

| 调用边界 | 静态事实 | 本次使用 |
| --- | --- | --- |
| JS addMeandering 3230–3288 | 陆地源step从10开始；长路径的距离平方≤25跳过插点；否则垂直偏移`.5+1/step+max(.5-step/100,0)` | 确定性内陆控制点；没有新增随机流路 |
| JS getRiverPoints 3290附近 | 原海口取Voronoi共享边中点；-1是出图边界 | 网页改取自身Float32三角面h20交点；不绘制出图段 |
| JS drawRivers 3597–3615、桥8039–8051 | 只调用addMeandering，把xy写入World.riverline；flux没有传给Unity | 不把未被调用的JS getRiverPath多边形或getOffset宽度当作当前原生画面 |
| World.DrawRiver 0x6aa6d0 / BorderDataProcessor.GetLineVertices 0x36c1d0 | 转换坐标后进入StateLineRenderer.SetRiverLines | 保留调用链事实；World.VoronoiTransformPoint及Prefab总尺度未恢复 |
| StateLineRenderer.BuildRiverPath 0x4e5840 | 中间点切线为normalize(next-prev)，控制柄长度取相邻段长度×curveAmount；首/末柄落在端点 | 恢复该曲线规则，使用.ctor 0x4fe690中的默认curveAmount=.5；场景序列化覆盖未核实 |
| CalculateInterpolationPoints 0x4e5ff0 | round(segmentLength+6)，限制6–12，原舍入使用Math.Round | 网页在地图坐标中用Math.round并同样限制6–12；单位和恰好半数舍入为明确差异 |
| DrawSingleRiver 0x4e97b0 | 对最终PolylinePath点设置`(.7+i*.7/N)*1.5`厚度，随后设riverColor | 按Float32算术恢复从1.05到小于2.1的加宽；网页一地图单位映射一宽度单位，颜色保留网页原值 |

没有复制或导入第三方Shapes库代码；只复用用户授权作品的调用规则。选定JS算法继续保留Azgaar系列MIT notice；精确上游版本未宣称确定。

## 显示合同与适配边界

- 输入仍是降水计算接受的有序真实河流路径。flux、receiver、riverIds、增湿和地貌分类不变；新曲线不是新水文数据。
- 内陆使用原弯曲点＋原生切线规则＋下游渐宽。海岸混合三角面的一环内冻结曲率、沿真实边直达h20河口，保证窄陆桥不会被装饰弯曲切断。
- 在Worker里将完整河带三角形与原网格中对应陆地多边形相交，包含两岸宽度，而非仅检查中心线。数据海岸、保护区高程、历史及存档不被修改。
- 裁剪按Float32地形坐标及线性h20边界计算，最后上传Float32顶点。浮点边界存在舍入；测试几何容差为重心坐标2e-5、高度2e-4。没有把数学边界容差表述为像素级零误差。
- 单个非索引Mesh绘制该派生几何，透明叠加不会加深合流。只有气候视图使用本批曲线；高度/阴影视图保留面积汇水模型。
- 第9个派生TypedArray通过Worker转移；历史输入数组不转移。沿用取消终止、迟到请求拒绝和3份缓存。每份河带≤3,000,000浮点数（12MB），另受每输入点768浮点数及8,000,000候选裁剪预算约束；超限沿用高度降级，可重试。
- 本次未修改存储结构、没有保存测试改动。当前存档与启用保护前归档通过只读整包摘要对照；未把它说成新存档写入验收。

## 实测范围

- 31文件496测试通过；新增6个形状/海岸案例＋4个Worker输出异常案例。几何oracle独立验证每个输出河带三角形完整落在一个真实陆地面中，包括21→0小岛与亚单位宽细颈；细颈逐截面检查无断点。
- 首次typecheck发现可空shader，已加安全销毁处理；仅重新运行lint/typecheck。tests记录保留首次真实时间，没有伪称496测试再次运行。
- 最终生产构建通过，40项允许产物；build.json绑定本次源码。完整包、分析dump、原素材及存档均不进入dist。
- 开发40789点：518条河、2595河点、406处增湿分类变化与旧值相同；显示4028曲段、308245个裁剪三角形、7,397,880字节河带。一次Worker435.3ms为桌面采样。
- 同一生产地图与2.7×相机对照：37550点，192条河、740河点、25处增湿变化不变；旧逐边粗直线换为渐宽曲线。新河带83074三角形、1,993,776字节，一次Worker264ms。见before/after-production.png。

仍有密集细支流、靠海直段、湖岸折角、原总尺度/场景curveAmount、最终Biom/海洋捕获及GPU/手机性能待处理；一份数值切片不能替代完整原作视觉等价。WEB-PH02与首份真机/视觉门不变，云端发布锁不变。
