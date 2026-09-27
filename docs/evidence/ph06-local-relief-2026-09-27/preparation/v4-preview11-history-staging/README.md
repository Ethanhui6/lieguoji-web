# preview.11 实际生成器历史候选（尚未提升）

本目录只做当前构建的来源捕获与下一次合同变更前的存档兼容候选，没有修改生产、正式归档、执行单元/静态检查、构建或浏览器。

实际 `dist/build.json`：`0.5.0-preview.11`，原字节SHA256 `eaf3025970c2d241a285ecec9f3ab1c1427176410f276262a03e4db6a64222e7`。其构建元数据base为 `cc3dbf64e545328d2d4ed852e20128668fd2be4a`。捕获期间root已完成本地提交，实际HEAD为 `f49da8377985ef041a56dde7f995b2c8af018b3b`，产品源码状态为空；provenance分别记录这两个身份，不把构建base当作完整源码身份。37个闭包来源也与捕获时HEAD逐一相同（比较时只归一化CRLF）。

当前十个生成器都用生产fingerprint工具逐闭包计算，与真实build中的hash及完整文件列表相同。37个实际源码原字节及fingerprint工具已完整冻结，再从冻结字节重算十个闭包均匹配。sourceSnapshot SHA256为 `d57059774d14255bd85921935f5326288a9fc05dcd4b7f690ff129eb0114355c`。同时核对25个实际dist文件的字节hash与已验preview.11归档一致，只保存元数据，不复制dist产物。十个生成器与engine仍等于preview.10。

- `evidence/preview11/`：真实build、provenance、37文件冻结来源、冻结工具及inventory。拟正式目标 `docs/evidence/ph06-preview11-generator-history-2026-09-27/`，尚未创建或复制到该目标。
- `src/world/generation-history.ts`：在实际生产baseline上向十个对应命名空间各追加一个真实身份。原v1键与自然配方的 `id@2` 键独立，不给旧配方执行权。
- `src/world/detail-preview11-history.test.ts`：4项候选测试。核原字节和十闭包；十类合成存档封套读写不改身份、storage允许而execute拒绝；v1/@2与首片/追加隔离；拒绝错指纹、错id、未知字段和未来版本。不是读取用户存档。
- `baseline-manifest.json` / `ready-manifest.json`：生产baseline、两个候选文件SHA、新测试路径不存在证明与证据清单。

先正式归档原始证据并保留 `-text` 字节属性，再受控提升history及测试，才可执行相关测试。候选测试引用的是上面的拟正式目录，当前不能把它记为已运行通过；history改动本身会改变后续生成器闭包，下一真实构建应产生新身份。旧preview.11身份仅在storage历史中保留，不能用尚未构建的新候选fingerprint替代。
