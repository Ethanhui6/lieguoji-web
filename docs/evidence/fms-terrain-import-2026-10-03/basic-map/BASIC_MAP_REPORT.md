# 随包 BasicMap 的只读恢复结果

本报告只覆盖 `D:/steam/steamapps/common/FantasyMapSimulator/FantasyMapSimulator_Data/StreamingAssets/BasicMap/{1,2,4,8}.save`。它们来自用户明确授权的安装包，不是个人存档。安装目录没有写入；没有运行原 EXE、GameAssembly、Puerts 或完整 recovered main。完整根 JSON、中立坐标数据、封装分析脚本和常量文件只留在本文件所在的 ignored scratch 中，不进入 dist、Git 提交或云端。本摘要报告、数量、结构与哈希证据可按白名单归档提交；这不授权发布原始数据或解除云端发布门。

## 实际恢复结果

四份随包文件均成功解封装，并输出中立坐标数据。关键发现：**四份文件的高程均为 0，国家、省份、城市、军队、文化实体集合全部为空**。它们含有可复用的真实原始采样点和绘图分组，但不是四张已完成的大陆或可玩世界。

| 文件 | 点数 | x 范围 | y 范围 | 高程 | 绘图分组数 |
|---|---:|---|---|---|---:|
| 1.save | 19,928 | 0.44–1595.62 | 0.47–899.5 | 全 0 | 510 |
| 2.save | 30,030 | 0.38–1600 | 0.35–900 | 全 0 | 777 |
| 4.save | 40,050 | 0.32–1600 | 0.31–899.67 | 全 0 | 1,032 |
| 8.save | 79,924 | 0.22–1598.24 | 0.23–898.66 | 全 0 | 2,040 |

所有坐标有限、没有重复点；每个存档的 20 个数值单元字段长度均与 CellCount 一致。保存版本为 CellDataVersion `1.0`、LogicDataVersion `3.0`。气候、高度、人口等字段是统一初始化值；River 和 Biom 为 -1，BattleScore 为 20。DrawProvince 是保存的绘图分组编号，不等于有行政实体的省份，也不应直接升级为国家/省/州/县。

## 精确解封装链与证据

仅通过现有 IL2CPP 索引和 Capstone 静态查看四个函数：

| 函数 | RVA | 观察 |
|---|---|---|
| SaveSystem.DecryptString | 0x4AD8F0 | Base64、AES、UTF-8、零 IV 字节数组、解密流 |
| SaveSystem.DecompressString | 0x4AD620 | Base64、GZipStream、UTF-8 |
| SaveSystem.LoadGameData | 0x4B2090 | 明确按 decrypt → decompress → deserialize 调用；另有二进制新格式路径，本批四个文件不走该路径 |
| SaveSystem.DeserializeRootWithCompatibility | 0x4AE5F0 | 检查新格式后兼容 JSON 字典 |

实际四文件链：

```text
Base64 → AES-256-CBC / PKCS7 / 零 IV → UTF-8 Base64 → GZip → UTF-8 legacy JSON
```

解密后 JSON 的 WorldData 是另一个 JSON 字符串。GZip 解压设置每文件 64 MiB 上限，源文件设置 2 MiB 上限；四个根 JSON 实际大小约 1.86 / 2.75 / 3.74 / 7.36 MB。常量只在限定函数的本地 private 分析中使用，没有打印到可见输出，也不写入中立几何或本报告。

四份文件均完成 AES 密文逐字节往返验证、GZip 完整解压及 JSON 解析。输出坐标、高程、绘图分组与解封装数据逐值一致。证据：`decode-manifest.json`、`geometry-manifest.json`、`validation.json`。

## 没有恢复出的内容

四份 JSON 均不包含 `Neighbor`、`Vertices`、`Triangles` 或 `MeshVertices`，也没有显式世界 Width/Height/矩形边界。输出中的这些值保持 null。不能把坐标最大值当作原始裁切边界；1600×900 若作为网页重建窗口，只能标记为网页研究设置，不是已读出的原始世界尺寸。

海平面 20 的依据来自已恢复 `main.mjs` 的第 2915 行 `h[i] >= 20` 和第 3620 行 `MIN_LAND_HEIGHT = 20`，该文件 SHA-256 为 `df79b44e9a22fb2860ab0b9f8ae48df265594f6cdb2e3f7cd693290de619771d`。四份 BasicMap 自身没有保存海平面标量，因此中立输出 `seaLevel: null`。原值全 0 不能变成假造的海陆。

WorldData 中还留有 Riverline（306 / 293 / 596 / 833 条）与 OceanRoutes（220 / 111 / 562 / 190 条）。所有河流点有限，所有航线单元引用在范围内，但它们与全零高程的当前一致性无法成立为已验证地理。没有将这些残留线条导入中立几何，也不用于恢复海岸线。

## 中立接口

每个 `map-{id}-geometry.json` 为独立数据，不依赖 Unity 类型，不导入 Atlas：

```text
{
  format: 'fms-package-geometry', version: 1,
  source: { package, path, sha256, rootSha256, cellVersion, logicVersion },
  count,
  coordinates: {
    space: 'SerializablePos source units',
    bounds: { minX, minY, maxX, maxY },
    declaredWorldBounds: null
  },
  points: [[x, y], ...],
  elevation: [0, ...],
  seaLevel: null,
  elevationState: 'constant-zero',
  neighbors: null, vertices: null, triangles: null,
  sourceDrawProvinceIds: [integer, ...]
}
```

坐标与高程保留原值，没有自行归一化、缩放或补三角。推荐后续转换明确区分三种来源：原随包点坐标、网页重建 Delaunay/Voronoi、新生成的高程。不得把三者合称原作完整地图。现有纯高度适配器要求逻辑 cellsX/cellsY，这四个文件没有保存该显式字段；如以排列规律推断，必须另立转换证据，而不能冒称字段直接恢复。

1.save 中立文件：434,505 字节，SHA-256 `5042edaf74ab1379005a07524c845c4de662c448ff6be2814f5b9f336ccf1280`。其余中立文件 SHA/大小列在 `geometry-manifest.json`。完整根 JSON 与中立坐标都仅留在 ignored scratch；可提交的续接记录应只使用报告、范围、数量和哈希，不包含完整原存档或常量文件。

## 源文件不变与复跑

本批继承上批的 32 个明确来源文件摘要框架，总计 425,588,894 字节，不额外扫描目录。`source-before.json` 与 `source-after.json` 均核对全部 32 项 SHA-256，全部一致。本批四份 BasicMap 已在这 32 项中，没有读取个人目录或认证/SDK配置。

- `disassemble-basic-map.py`：限定四个 SaveSystem 函数的只读分析。
- `decode-packaged-maps.cjs`：固定四文件、容量上限、严格 Base64/GZip/JSON 解包。
- `export-neutral-geometry.cjs`：字段完整性与中立值输出。
- `verify-basic-map.cjs`：源/输出哈希、原值一致性、AES 往返、缺失字段 null、32 源文件未变化。

脚本首次复制时出现一次 Python StopIteration，原因是 JavaScript replacement 中的 `$$` 被折叠为 `$`；修正目标方法名后四函数静态索引成功。未通过尝试不计为恢复证据，以上结论来自修正后的验证结果。本批没有更改产品、docs/plan 或任一发布门。
