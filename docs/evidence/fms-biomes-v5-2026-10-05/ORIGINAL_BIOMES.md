# 原包气候、生物群系与陆地材质：本批恢复合同

2026-10-05；用户授权安装目录只读。按「索引 → 单函数/材质复核 → 网页可玩切片 → 实测」推进。Windows PE / Unity2021.3.36f1 / IL2CPP29，无 ELF/DWARF/hk4e-mcp，不运行完整原作、DLL 或恢复脚本。根执行器独占写入；三个分析助手只读。安装包、dump、原始存档均不进入 Git/dist。

## 本批可玩的范围

独立绘图页新增可切换的“气候地貌（试算）”，设置面板和候选卡均可使用。采用恢复的气温、高程降温、风向降水、5×26 分类表和13色；真实河流流量链尚未恢复，因此明确 **暂不计原作河流增湿**，不是完整原作生物群系等价。默认高度配色保留。

气候是派生显示，不给 v1/v2 文档新增字段，不迁移存档，不改点、三角面、高程、玩家锁、历史或可见 h20 海岸。显示模式仅本次会话。CPU 最多缓存三个不可变快照，GPU 使用当前网格新增的 RGB 顶点缓冲；不导入不被 shader 消费的噪声贴图。

## 已定位源及数值

- 授权 TextAsset main#398 已有恢复文本 `.autopilot/fms-audit/binary/recovered/main.mjs`，SHA256 `df79b44e9a22fb2860ab0b9f8ae48df265594f6cdb2e3f7cd693290de619771d`。只读2584–2795温度/降水、3638–3752生物群系、7546–7618参数桥接、7779–7807调用顺序，没有执行文件。
- 赤道/两极初值 `27/-20/-20 + TemperatureModify`；热带纬界北16°/南20°、热带每度0.15°C，其外到极地线性；h≥20高程降温 `round((h-18)^2/1000*6.5)`；最后 clamp[-128,127]、Int8截断。
- 降水修正 `4^.25 * PrecInput/100`，风向 `[225,45,225,315,135,315]`；海面取水、迎岸降水、迎风坡失水与>85屏障依安装源恢复。逐次 Uint8 截断/回绕保留；数值单位未证为毫米，不冒称真实降雨量。
- 源分类先判海洋、<-5°C冰川，再判高温干旱沙漠，其余查5×26表。湿地分支在原JS中注释，矩阵也没有12；自动分类不会凭空增加湿地。
- 原湿润度为 round(4 + 自身及陆地邻接降水均值)，自身有河流时加 `max(flux/10,2)`。原 flux 依赖其网格整形、洼地与河道链；网页现有 drainage.accumulation 是汇水面积，**不拿面积冒充 flux**。本批 hasRiver=false。
- `BiomeResource.json` 是资源分布配置，不是分类器；两个命名体系有 Grassland/Steppe 等差异，本批不接资源经济，不复制整份 JSON/本地化表。

场景初始参数经 World#44231 序列化顺序、对齐和邻近 PPtr 锚点核准：raw0x16C double mapSizeOutput=1；0x174 double LatitudeOutput=50；0x1D8 float PrecInput=80；0x1DC float TemperatureModify=0。`World.CalculateMapCoordinates` RVA0x6A3AB0 恢复公式 latT=round(size/100*180,1)、latN=round(90-(180-latT)*shift/100,1)、latS=round(latN-latT,1)，得到 **north=.9°，south=-.9°**。50是位移百分比而非纬度。构造器降水100被场景80覆盖；源JS defineMapSize 的66/27不进入当前 FromWorld 链。以上仅初始场景，不称原作运行中/存档默认最终值。网页固定气候种子1337是网页选择，不称原作 randomInt 或 scene randomSeed78。

## 明示的网页适配和精度边界

1. 原循环依赖规则网格；网页经海岸加密已非规则。用当前渲染同样 Float32 顶点/三角形，插值到最长边192的规则气候格；高程截断并限制0..100。每次最多400万采样访问。单独切换视图失败时保留原显示；撤销、重做、取消或候选展示遇到气候预算错误时，统一切回高度配色、重绘真正的目标文档并提示原因，防止历史与画面分离。非气候错误不吞掉。气候格不作为显示几何。
2. **最终顶点温度按实际顶点高程和纬度计算**，只把降水从规则格回采到顶点。避免细小高峰落在格心间隙，误用附近海温变成热带森林。相应小岛高峰回归：网格全未采到陆地，h100顶点仍为-17°C、冰川。
3. 小于采样格的细部对风场/降水的影响尚未完整表达。邻接湿润度使用真实绘图邻接；这不等于原40000格的全部流体行为。
4. 修复源中 row0 的 `if(first[0])` 元组误判；风到本行/列边界即停止，避免跨行和 off-map undefined 引发尾格暴雨。保留风场纬度 y/rows 与温度格心纬度的区别。
5. 原13色转线性RGB后，本顶点权重10、陆地邻点权重1，再用现有连续网格插值。海顶点仅借邻陆颜色支撑插值，海洋覆盖仍完全由真实h20和原海洋SDF控制。这是网页混色，未冒称原RT4096模糊等价。

## 实际陆地材质链（静态已闭合）

World.Awake RVA0x6A3300，0x6A3573 Resources.Load("Materials/LandMaterial") → defaultLandMaterial+0x300；ResourceManager#13 `materials/landmaterial` PPtr(4,10) → resources.assets Material10 → Shader322 Unlit/LandShader。RenderBiomByProvince0x6BE8E0克隆该材质，从+0x3E0取biomTexture写入_MainTex并赋给provinceObjects。

World44231 raw0x2B8 PPtr(2,204) → sharedassets0 RT204 Biom：4096²、sRGB、bilinear/clamp、无mip。Camera10198/HeightBiomCamera目标该RT，正交120、透明黑、cullingMask512(layer9)。组件37454 GaussianBlurPostProcessing → Shader183 Hidden/GaussianBlur，blurSize1。

Shader322只采_MainTex；可选灰度为 clamp((1-alpha)*.75+.2,.2,.8)。Material10保存的noise-rgb512² DXT1不被实际字节码读取，本批不提取、不导入。Shader183是单次81 tap 9×9：RGB加权，alpha强制1，未归一化；权重binary32为 .22702699899673462 / .194594606757164 / .12162160128355026 / .05405399948358536 / .01621600054204464。

GaussianBlur.Start0x3894F0创建材质后SetActive(false)；CaptureImage0x389370取得同GO的Camera并调用Camera.Render；OnRenderImage0x389400设_BlurSize后Graphics.Blit。按需捕获链成立，但所有编辑事件的触发时机未完整查明。blur后的alpha=1，不能声称其仍保留高度alpha。网页本批未复制4096捕获/blur链，未做原GPU读回或原进程联调。

主要静态指纹：

| 对象 | SHA256 |
| --- | --- |
| World44231 raw | d5e19e8ebcfeea6a1ae9228278a7855f6d709f261684fcacd7c2c10270f9c237 |
| ResourceManager13 raw | acc35b81b9e6cf80fe12f01c0b5a3514606a436ed0c035e900c169327a9db96c |
| Material10 raw | 1e56e5d18468637a3019f0c9d2b1d59ca67a8a5d4345a192eda77c24199c2e31 |
| Shader322 DXBC fragment | 387b4b72f0676b587ef3fbf17febf51ad5d29b7895766118cbc3459fa900d56c |
| Biom RT204 raw | e3a1e476aa895e83b06fbed2b443fc15d8443bb3f539ed55e49082f73e2a784a |
| Camera10198 raw | cdfe3adf69fe7a1f6aae64e5ce6bc6f828af92fd0bcbee668a513dadb12fb7c2 |
| Blur component37454 raw | 7192edca69f2b1a9ce9ba84266e25d999feef3e46ff041e83c592b3576b2fe22 |
| Shader183 DXBC fragment | 3f392f9354b0c9a378b778be298dd93e1f6e9f56762f2bcc44db230accb02b57 |
| World.CalculateMapCoordinates bytes[6A3AB0,6A3D30) | d383eb7ad34c14da5be31fe8ed68476eb2f6c7eea869732344313a16c38a5eb2 |

第三方范围：选定气候与分类算法属于现有 Azgaar Fantasy Map Generator 家族，保留 MIT notice；Alea现有notice保留。未确认安装源精确上游commit，不猜测版本；原生材质第三方署名仍未证实。本批只增加选定规则/数值/配色的网页模块，公开license文本扩充范围说明。

单元/浏览器结果见同目录检查证据。桌面Chromium及竖屏尺寸不等于iPhone/Safari/真实触控验收；WEB-PH02与全部发布锁不变。
