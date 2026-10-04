# 本批原函数与活动海洋材料恢复

2026-10-04，WEB-02-01，root独占写入，三个只读窄范围审计。只读用户授权安装目录及本项目ignored分析产物，不执行原作/恢复脚本，不读认证/SDK/个人存档。

## 已接入的实际绘图功能

顶部“原作地形”及折叠设置中的“原作局部地形”接入 pangea（原点击默认）/highIsland 原模板。落点选nearest site，边缘距离决定float32尺度；实际算法见 src/world/recovered-terrain/click-engine.md。两模板来自已经审阅的许可代码，不是新造随机噪声。

流程：点击/拖动最后落点 → 独立Worker从零跑原模板 → max合并 → 后置玩家锁/可选海岸固定 → 对照或取消 → 单步确认/撤销/保存恢复。闭合轮廓、原生Hill、海陆笔刷、保形自然化保留。旧历史引擎未改。

源入口函数证据：ClickToGenerateMap 0x6A6A70–0x6A6DA5，InitMapGenerationSettings 0x6BAB00–0x6BACDC，默认pangea写入0x6BAC9E；centerPoint写入0x6A6B0C/0x6A6B1F。源码精确行与网页适配边界在click-engine.md中。完整鼠标UI到OnClickMapToGenerateMap的所有分支尚未逐一证明。

## 海洋：纠正候选资源与活动链的混淆

只读场景解析得到：level0 World GO#8915 → enabled MeshRenderer#10199 → **sharedassets0.assets Material#9 NoiseColor → Shader#191 Custom/UnlitWorldSpaceTilingWithNoise**。World组件#44231的OceanMat也指向同材质。

resources.assets Map prefab World#7843另指向sharedassets0 Material#10 Ocean / Shader#178 Unlit/Color。resources.assets Material#9 Custom_BlurOcean和sharedassets0 Material#9 NoiseColor绝不是同一对象。

World.SetDeepWaterColor RVA0x6C23F0与SetShallowWaterColor RVA0x6C3700，均从同GO SDFTextureGeneratorExample._generator._sdfTexture赋到Renderer.material._MainTex，并把 **_DeepColor=World.shallowColor(+0x528)，_ShallowColor=World.deepParchmentColor(+0x4D8)**。属性和字段名字相反是实际指令，不按意图反转。SetTexture具体调用0x6C257D/0x6C389D，颜色0x6C25B3/0x6C25E9及0x6C38D3/0x6C3909。

level0 SDF Camera#10195 → sharedassets0 RT#205 SDFLine 1024×1024，sRGB=false、filter1、wrap1。World同GO SDFTextureGeneratorExample#38723（enabled）sourceTexture同RT，threshold0.5/downSampling Half/precision16。动态SDF替换原静态_MainTex#78；输出最终尺寸、生成/刷新时序、相机绘制内容还未知，不能由Half直接宣称始终512×512。

原候选StencilBlurPostProcess.OnRenderImage RVA0x51BF50中，material非空直接Blit(src,dest,material)，_ScreenSize(Screen.width,Screen.height,0,0)却在相反分支，不能凭意图改写。resources/sharedassets0/level0的22360个MonoBehaviour脚本引用未找到此组件实例。OceanUnlit._Color活动调用者和StencilRef2活动消费者仍未知。**本批没有把候选海洋Shader/纹理冒充已接入网页。**

下一窄恢复：sharedassets0 Shader#191的SDF采样规则、SDFTextureGenerator.Update RVA0x6EEBA0和SDF相机输入。沿实际活动链推进，不重新反复索引全包。

## 指纹

- GameAssembly.dll d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b
- script.json 907eb47a0d4a175e393a3497a2b1d4e67f57c2d4d9e0dfeecb53799ce21acf7f
- level0 a9aba2ef74f52869124f894388e944054aa13faabefde5a9cfba7558a6a9e294
- sharedassets0.assets a755bed22f68a01809c9c9e233a73dff02b0267eb3639c13a4b167d5cf9cd39c
- OnRenderImage 0x51BF50–0x51C0A0字节SHA e231be2d62b1f5f642e4db92d958e32f4473f32b0cb6edbbeab24c7c6b235aa3
- SetDeepWaterColor 0x6C23F0–0x6C2760字节SHA 2c7af724969d8fe515a9037fd65888135cb0a2e9d08d43798c7dc7855fa68239
- SetShallowWaterColor 0x6C3700–0x6C3AF0字节SHA ee021cdd4bebdab7565103427d261afaa5207d0c51b939e7a24f86882b6653f4

字节范围按相邻函数索引含末尾int3。raw/dump不提交/dist。第三方许可沿用已登记MIT/BSD文件。
