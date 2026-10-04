# V5 原作海洋公式移植切片，2026-10-04

本批沿真实活动场景恢复并接入网页：`level0 World#8915 / MeshRenderer#10199 → sharedassets0 Material#9 NoiseColor → Shader#191 Custom/UnlitWorldSpaceTilingWithNoise`。仍为 WEB-PH02 / WEB-02-01；不代表整个原作、首份体验门或最终海洋视觉已通过。

## 截图流程如何实际执行

使用已有 IL2CPP 类型/RVA/资源索引，按小函数与 Shader 分工只读恢复，由 root 独占适配源码。实际对象是 Windows PE、Unity2021.3.36f1、IL2CPP29；没有假称 DWARF/ELF/hk4e-mcp。UnityPy、LZ4、系统 D3DDisassemble 和 Capstone 用于静态解析；未运行游戏、原生 DLL 逻辑或恢复脚本，未作原进程联调。只读指定安装目录，未读认证、SDK配置、envs.log、个人存档。

## 已恢复原函数、材质和公式

- Shader191 顶点直接传递 mesh UV，编译片元**没有噪声、平铺公式或噪声图采样**。名称不能证明效果。
- `_BorderDark>0`：`d=max(-texture(_MainTex,uv).r,0); t=clamp(d/_EdgeIntensity,0,1); rgb=mix(_DeepColor,_ShallowColor,t*t*(3-2*t)); alpha=_Transparency`。关闭时直接用 `_Color`。
- `SetDeepWaterColor(0x6C23F0)` / `SetShallowWaterColor(0x6C3700)` 均将同 GO 的 SDF 输出赋给 `_MainTex`，`_DeepColor=shallowColor`、`_ShallowColor=deepParchmentColor`，并设置 Transparency=1、BorderDark=1。属性名反向属实际指令，不自行纠正。
- `SetShallowSeaWidth(0x6C3670)` 直接写 EdgeIntensity；`SetResolution(0x6C2FF0)` 写 `.02/scale`，World.Start 可见 scale=1 初始化调用。网页当前采用 scale=1 宽度，不把相机缩放当作 scale 参数。
- `UpdateQuadUV(0x6C9EB0)`：逻辑坐标 p 从边界偏移/尺寸映射而来；`M=max(Width,Height)`，`uv=((p.x-Width/2)/M+.5,(p.y-Height/2)/M+.5)`。与原 square RT 合并后，连续距离按最大地图维度归一化。
- 原场景 World#44231 记录972字节，9个Color尾部区间已用字段尾部对齐核对：deepParchmentColor@0x30C=(.0784313753247261,.529411792755127,1,1)，shallowColor@0x35C=(.23584888875484467,.6113743782043457,.9999999403953552,1)。这是 **level0 场景序列化配色**；构造器、主题和用户设置可能不同。deepColor 不进入上述海洋链。
- Material9初始_MainTex为 **sharedassets0#78 AL-Noise-06 512²**，区别于resources#78；它被SDF替换。本批没有导入不被活动代码消费的噪声图。

## 原 SDF 生成与刷新

`SDFTextureGenerator.Update` RVA0x6EEBA0，函数体延续到0x6EF545；第一unwind范围到0x6EEC88不是函数终点。source实际宽高分别按None/Half/Quater做整数除1/2/4；只有源保持1024²、Half时输出才是512²。16位输出R16_SFloat，32位R32_SFloat，JFA是R32G32B32A32_SInt。

resources ComputeShader#419 SDFTextureGeneratorCompute：

1. Seed在`(id.x/W,id.y/H)`（**无半texel偏移**）采样源alpha。低于threshold进入lowseed，否则highseed；有效位置储存`id+1`，0代表缺失。
2. Flood从NextPowerOfTwo(max(W,H))到1逐半步，3×3候选分别取两类最近seed。无效平方距离为9999999；反汇编某些movc把该整数位型显示成0.000000，已核DWORD。**同一个globally-coherent UAV原地读写**，不是双纹理ping-pong的逐点等价算法。
3. Dist=`length((low-id-1)/H)-length((high-id-1)/H)`；两个轴都除输出高度；缺失seed的贡献是0。lowalpha为负，highalpha为正；相机到底怎样绘制海陆alpha尚未全恢复。
4. 全源单一alpha分类时缺失另类贡献0、自身距离0，SDF为0。网页全空海取深海色是明确适配。

Example.Update(0x6EE9F0)仅isNeedUpdate时调用并清零；UpdateTexture(0x6EE9A0)直接刷新；两条正常路径showSource=false。SDF仅尺寸/精度变化重建，JFA仅尺寸变化重建。原Release(0x6EEB10)只释放SDF，未看到JFA/Compute清理；网页没有照抄资源遗漏。

## 网页实现与精度合同

`src/fms/ocean-coast.ts` 从实际上传的Float32坐标、高度提取三角网h20交线，包括exact20边与孤立接触点；不以点mask或Voronoi格界替代。Float32上传后面积为0的面被排除，避免不可见面制造浅海。全h20面不虚构内部轮廓/地图外框。BVH计算texel中心的最近解析线段距离。

这替代原相机alpha栅格与GPU原地Flood，**不是恢复原SDF逐texel等价**。512最大边、按地图长宽比例生成；texel中心采样与原Seed无半texel偏移不同。距离cap=`.02*max(width,height)`，RG16打包进RGBA8，B=0/A=255；线性过滤后`dot(rg,(256/257,1/257))`解码仍线性。没有浮点过滤扩展依赖、sRGB纹理、mipmap或新增图片。

只有sea RGB使用距离；原height/fwidth/h20海陆混合、陆地、湖泊、河流、玩家锁数据均保留。几何和存档不写。纹理不是海陆mask，即使小岛小于texel也保留真实高度轮廓。**纹理中心之间仍是近似**：当前使用保守误差上界“一texel对角线+cap/131070”，1536²地图/512²场约4.242875地图单位；这不是海岸几何位移或原SDF误差界。高倍颜色可能软化，不能称完整像素保持不变。

CPU字段最多3份、各至多1MiB；一个GPU source由renderer持有，更新同尺寸数据，销毁shader解除绑定后才释放source。完整失效键包括高程、points、triangles、宽高；锁改动与平移/缩放不重建。原surfaces缓存也补齐triangles/宽高依赖。context lost/destroy后不继续装载。

## 明确未恢复、未验收

- 原PlayerSettings#1 `m_ActiveColorSpace=1(Linear)`。Shader内部直接混RGB，**Unity材质颜色上传及最终帧缓冲转换尚未恢复**。目前复用配色数字与公式，不声称原作最终屏幕颜色一致；没有猜测加gamma。
- 原SDF相机绘制对象/alpha、完整主题设置、原地GPU Flood竞争/量化/过滤/输出色彩链尚未逐点联调。
- 原包这些Shader/SDF记录未提供明确第三方署名，只能记“用户授权安装包内组件，第三方来源标签未知”；没有将整个包或dump加入源码/dist。
- 本地桌面Chromium尺寸检查不是iPhone、Safari/WebKit、实际触控或用户视觉验收。完整国家/行政/家族/信仰及云端发布仍受原门约束。

## 静态来源指纹

| 对象 | SHA256 |
|---|---|
| GameAssembly.dll | d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b |
| resources.assets | 44023b196a5c2499174f1d3dbf612e37c5aeb9fd4f12f30df99a7258e4233e77 |
| sharedassets0.assets | a755bed22f68a01809c9c9e233a73dff02b0267eb3639c13a4b167d5cf9cd39c |
| level0 | a9aba2ef74f52869124f894388e944054aa13faabefde5a9cfba7558a6a9e294 |
| Shader191 raw | 57f847405e39454fb382f8b061be2cbc4ae170a3949e5a7fccf00fa7cf3538eb |
| Material9 raw | e68e3fa3823485bde167c2d5a199322ed89fa384e60952b3117345aeb213b517 |
| World44231 raw | d5e19e8ebcfeea6a1ae9228278a7855f6d709f261684fcacd7c2c10270f9c237 |
| vertex DXBC | 00fa9f706d1a32b2798d4cd59f59a0ed18623df0ef65a4f0259cbd49b6696c56 |
| fragment DXBC | cbcaba1c4fb1152569b66cb44fb81595ff850a16e2072b21adc2d321ae3118ed |
| SDF Update bytes | 29eb6c37dda45714cfb7be31e2e4137d9a1179da1e19d6e689cb9e1d7faacac7 |
| Seed DXBC | 44ebf6ec0742d39cbf3b81ea1ff6975be113fc045b2fd45d3242cf9ae5a8b6aa |
| Flood DXBC | db45d08e86ad90de266eb898fddce17870a1e50e0cdaa2471734692266d5b25b |
| Dist DXBC | 145fd3ab6708578ecdb5f1992a5e62974f9a808e3ddbbb63217c6d787ce48621 |
| globalgamemanagers | f981f2b649a7b6265562eb6d3d4d596ebdae2cc5f225b54de2006d43326a617d |
| PlayerSettings1 raw | a8a711d5f88c9ebd75f8054889b7f4dc6c34445bf5afc0f54308cd6011e87864 |
