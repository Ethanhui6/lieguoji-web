# PH04 局部存储计量定向检查

本目录保存命令执行时直接捕获的合并 stdout/stderr，非回忆转写。每个 `.log` 对应同名 `.json`，记录实际命令、UTC 起止及退出码。

## 实际结果

| 轮次 | 定向单测 | 三文件 ESLint | 全项目 TypeScript |
| --- | --- | --- | --- |
| first | 8/9，exit 1 | exit 0 | exit 2 |
| second | 9/9，exit 0 | exit 0 | exit 0 |

首轮单测失败：事务最终写入时同步取消，原有存储错误路径随后抛 InvalidState；计量误分类为 `failed`。修正仅诊断分类，依据实际 IDB `onabort` 与已取消 signal 标记 `cancelled`，未改变抛出的原错误或事务处理。首轮 TypeScript 失败：测试中的 WebCrypto mock `this` 未标型，已补 `SubtleCrypto`。

第二轮单测运行 UTC 2026-09-23T20:44:28.9463775Z 至 20:44:37.3460864Z；全部检查结束于 20:44:39.6228062Z。测试使用 `-t 'PH04 storage timing diagnostics'` 选择新 9 项。原有 41 项业务/故障测试未删改断言，此轮未选择；不将本次结果冒充全套 50 项已运行。

## 验证范围

- 受控单调时钟只验证分段归属，不产生或宣称真实性能数值。对 WebCrypto elapsed、主动 yield、事务入队、最终校验/写入、进度回调、事务等待残差和提交后核验逐段断言；最终校验为回调子集，不重复相加。
- 真正 IndexedDB 事务与实际原像/配额逻辑照常执行；计量不写入根、回执、块或容量账。
- observer 抛错或修改报告，不改变成功回执、私有 head 或下一次提交。
- fallback、事务前取消、yield 取消、事务内配额/嵌套取消、回执重放、提交后核验失败均报告 partial；未到阶段为 null。
- 实际 complete 之后的迟到取消仍报告 committed/complete；已提交后核验失败报告 committed-error，不伪称回滚。

`preflightWallMs` 包含 WebCrypto 等待及单列的 `preflightYieldWallMs`；事务等待残差不解释成物理磁盘时间；所有字段均是观察到的 elapsed time，不能声称精准 CPU 时间。完整准备/分批暂存路径不输出虚构 local timing。性能门需根执行真实生产采样，本单测不签收 p95。

## 冻结时实际文件摘要

在第二轮结束后直接读取工作文件得到，非测量源码聚合摘要：

- `src/world/storage.ts`: `e0402736c102cf13e1e8dd89c67fee35f9aa54cdc5ae18eb49ded893ac995e7f`
- `src/world/storage-types.ts`: `974f95a82f042a526200c2b16ec4462ab6c147c56d45c72ed4152230d53fda2e`
- `src/world/storage.test.ts`: `1d3ced3ae9cb4ac35ee1340efd68421ceb410c1d635640ad23fdd0bf96425840`

仅修改以上三个源码文件以及本证据目录。未运行构建、浏览器、部署或远程操作。
