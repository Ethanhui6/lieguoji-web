# Atlas v1 在 PH06 改动之前的静态字节

这些文件从 `.autopilot/ph06-legacy-baseline` 原样复制，采集时源码为 PH05 本地提交 `f07e574eeaff3838d063fb194154ed2e73f06bbd`。
采集时间、原始源码摘要、固定创建参数与每个文件的 SHA-256 均在 `baseline.json`。
fixture 只包含明确创建的合成草稿，没有读取玩家 IndexedDB、真实存档、认证文件或网络数据。

`manifest-v1.bin` 与四层 `*-v1.bin` 固定创建时编码；`edited-*.bin` 固定手改高程、目录和 membership 后的编码。
该编辑样本是私有内存候选，没有进行持久提交，因此其 manifest revision 仍是 0。
fixture 不得根据新 codec 重新生成；测试同时核对被冻结文件的独立 SHA-256 和当前 codec 的确切输出。
