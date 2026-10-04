# 原作高度编辑配色切片，2026-10-04

仍为 WEB-PH02 / WEB-02-01 in_progress。按用户的安装包移植流程：已建元数据/RVA/资源索引 → 两个只读代理分别恢复活动材质和原生输入/菜单函数 → root 独占网页适配 → 数值与实际浏览器验收。Windows PE / Unity2021.3.36f1 / IL2CPP29；不是 ELF/DWARF，未假称使用不存在的 hk4e-mcp。没有运行原游戏、GameAssembly 或恢复逻辑；没有原进程联调。

## 实际活动链

`level0 World#44231 raw@0x3C0 PPtr(2,11)`，external2 指向 sharedassets0；`sharedassets0 Material11 VertexUnlitColor → Shader189 Custom/HeightColorDisplay`。Material仅 `_DisplayMode` 被shader消费；保存的 `_Color20/_Color50/_Color100/_UseHeightMapBackground` 不在绑定/指令中，不能替代真实公式。无纹理、采样器、噪声读取，没有导入无消费者的图片。

- World.GetOrCreateDrawProvinceMaterial **0x6B6C30**：实例化 World+0x5B8 provinceBiomHeightMaterial，缓存到+0x310。不是复制defaultLandMaterial的另一个biome材质函数。
- GetDrawProvinceMeshVertices **0x6B55B0**：0x6B5CC0读取CellData.Elevation[cell]整数，float除100；每个cell所有mesh顶点写`Color(r,g,b,h/100)`。UV直接复用cells.UVs[cell]，不编码高度。最终ProvinceObject.SetMesh0x472320调用Mesh.SetColors(List<Color>)，不是Color32。
- GenerateDrawProvinceMesh **0x6AE170**：跳过h<20的cell，合并position/UV/color后SetMeshData。
- SetDrawProvinceMode **0x6C2760**：每个drawProvince sharedMaterial.SetFloat("_DisplayMode",mode)。
- EditPanelUI.GetCurrentDrawProvinceMode **0x8DE1F0**：面板active且EditBiomPanel active为0；否则EditHeightPanel active为2；余下DisplaySettings.GetCurrentDrawProvinceMode **0x89A790**：UseHeightMapBackground==1时1，否则0。EnsureTerrainOverlayReady **0x8DA8E0**先确保drawProvince visuals再写mode。因此mode2是原作高度编辑的实际调用路径。

## 编译着色器公式

VS传COLOR，PS取alpha a。`gray=1-a; h=clamp(100-gray*100,20,100); d=h-20`。

- d<=40：`c=(.9679999947547913,1,.9129999876022339)+d*(.0008000001544132829,-.007850000634789467,-.010075000114738941)`。
- d>40：`q=d*.012500000186264515-.5; c=(1,.6859999895095825,.5099999904632568)+q*(-.38600003719329834,-.9559999704360962,-1.0199999809265137)`。
- mode2输出linear RGB：`c*(c*(.30530601739883423*c+.682171106338501)+.012522878125309944)`，alpha1。
- mode<.5输出原COLOR.rgb，mode<1.5输出gray；均不通过该三次式。

真实色阶约为20浅黄绿→60浅橙→100橙红。全部系数取编译binary32实际值；部分与短小十进制名重新舍入相差1 ULP。DXBC含mad，JS double/不同GPU中间舍入不保证逐bit相等；测试容差不是原GPU实测。

Shader LZ4解包1864B；VS DXBC offset210 length636，PS offset994 length860。UnityPy/LZ4与系统D3DDisassemble只作静态解析。

## 网页实现及保形合同

默认“原作高度配色”，折叠设置与候选预览内均可切换“起伏与阴影”。height-palette.ts恢复上式，renderer按既有连续插值vHeight着色，不叠加网页山体shade；河湖、海岸抗锯齿/描边和保护层仍保留网页适配。起伏模式保留旧网页配色/阴影用于对照，不称原作biome。

切换只改一个uniform并重绘；不调用setDocument，不改points/triangles/elevations/terrainLocks/history/存档，不重算水系或距离纹理。候选保留，取消/确认语义不变；新网格沿用选定显示方式。模式仅会话内保存，刷新恢复默认高度配色；实际地图存档保持原格式。

原作每cell全顶点同一高度；网页共享三角网连续插值。这是明确的几何适配，不是原作逐像素相等。继续按实际Float32 h20交线控制海陆，不改变海岸合同。当前没有biome/气候字段，不虚构高度→森林/草原/沙漠映射。原材质无图片需求，本批复用原数值/算法，不拷完整包或dump。

## Linear颜色链

先前已核PlayerSettings为Linear，Shader191 `_DeepColor/_ShallowColor`为普通Color属性、flags0。Unity2021.3官方[运行时材质属性与色彩](https://docs.unity3d.com/2021.3/Documentation/Manual/SL-PropertiesInPrograms.html)和[Material.SetVector](https://docs.unity3d.com/2021.3/Documentation/ScriptReference/Material.SetVector.html)明确Color上传shader为linear。公开[Material.cs](https://github.com/Unity-Technologies/UnityCsReference/blob/2021.3/Runtime/Export/Shaders/Material.cs#L100-L103)虽然只转发native SetColorImpl，不能据此否定转换。

标准非HDR Linear输出有sRGB framebuffer转换，见[GL.sRGBWrite](https://docs.unity3d.com/2021.3/Documentation/ScriptReference/GL-sRGBWrite.html)及[Gamma textures](https://docs.unity3d.com/2021.3/Documentation/Manual/LinearRendering-GammaTextures.html)。网页据此明确模拟正常输出：海洋场景sRGB端点解码→linear混合→sRGB编码；高度shader三次式输出linear→sRGB编码。端点不被二次抬亮。海洋t=.5理论结果约(.176299039,.572268804,1)，不是原进程测量。

原作最终Camera/RT/后处理/额外blit/覆盖仍未完整恢复，本次是官方标准输出语义的网页适配；不宣称原作最终屏幕色完全一致。

## 来源指纹和未通过项

| 对象/范围（右端不含） | SHA256 |
|---|---|
| sharedassets0.assets | a755bed22f68a01809c9c9e233a73dff02b0267eb3639c13a4b167d5cf9cd39c |
| Material11 raw | 6f85944750087f68272b61c0941351b027fe54284510f37c3268a58fecc3a974 |
| Shader189 raw | 379732468d930dd559af5b78ec59fa64e24a12771b0791b4b625b03c5670293e |
| World44231 raw | d5e19e8ebcfeea6a1ae9228278a7855f6d709f261684fcacd7c2c10270f9c237 |
| VS DXBC | e78e3dff6aa7fb59c3fcea8ab4d84e8c71561e90bf2db50eeeca9505d537dc6e |
| PS DXBC | 2a4ed65e01b274bcbf1f77a333bcb2177613efe2073793294b50748e41f2a600 |
| GetDrawProvinceMeshVertices 0x6B55B0..0x6B5F10 | 93f923b64e6ba53395a09ff98ba3441bd1eab631bafd2e79a71d24a97b4ec802 |
| GenerateDrawProvinceMesh 0x6AE170..0x6AE6D0 | 43241531708f6380cc7528faee84d267b0d30c5ae4b7db1cdc71d12c9877edfd |
| SetDrawProvinceMode 0x6C2760..0x6C2950 | ab3c77edb487b80d0420b00e89a6c5d0c3456df640721c0f6da68551493b33ff |
| GetOrCreateDrawProvinceMaterial 0x6B6C30..0x6B6CF0 | 3de1d1cec7cac30542361423d690e8cbb17b893cb5bfd4e7900f651e9904d161 |
| EditPanelUI mode 0x8DE1F0..0x8DE280 | d102e948a03d0b8e86cc8a526e24964586a83be97a141e37d2203ff2e001b27b |
| DisplaySettings mode 0x89A790..0x89A800 | d90aec025b7294ef8ea3cffee1b8ebdd11ee7990c703b36c5c48f39cb9a61f8c |

仅只读用户授权安装目录；未读SDK/认证/envs.log/个人存档。来源记用户授权安装包内Shader/函数，独立第三方署名未确认；无完整原文件进入Git/dist。真机触控、iPhone Safari/Chrome、用户视觉与原作并排实机等价均未通过。国家等后续门及全部发布锁保留。
