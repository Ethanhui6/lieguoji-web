仅对first实际图中的轴向格纹做一次窄修，已运行gradient-repair-1，现冻结。first原runtime和3张实际图已冻结在checks/first/source与output/first。

terrain-massif.ts用自写三角格梯度核替换同轴value noiseQ12。每点三个角、固定八个单位梯度、紧支撑四次衰减；输出用连续有界映射，避免硬截断。两次512-world低频查询各自扰动高程起伏域的X/Y，偏移每轴严格小于64world。山体中心/方向/范围、真实海陆查询、16-world谷网、切低/展宽/三次重建完全保持，因此只能将本次差异归于实际高程噪声输入变化；无法先行断言cut网格自身不再露纹。

原sampleTerms=15body+16cut taps仍最大31，现单独公开noiseCallsPerSample=5及noiseCornersPerSample=15。这些是独立固定运算，不加入或扩大旧4096支撑/192候选/262144引用/131072探测限额，也不把31说成包含全部标量运算。region源区还保留原990735上界。新增自检草稿两项：seed确定且有实际变化；跨三角分界与格点的数值/一阶导连续。它们只有types/lint可检查，未执行就不记通过。

新label gradient-repair-1只运行types、lint和一次候选owner-node三图，旧baseline不重复生成。没有GPU/产品构建/保存编解码/视觉验收。

实际结果：types 3.590秒、lint 1.848秒、候选真实写入/3图11.740秒通过，来源前后稳定；专属2项梯度及2项面积单测均未执行。物理采样仍606760个persistedFineNodes、0个legacyLandFallbackNodes、180697个seaFallbackNodes。新runtime terrain-massif SHA256=e80d68fa77cb15ac3362416ac9d6213a1952cbc69dd50f7c32a20ec91373cc82；另两个runtime未改。

已用view_image实际看完整3图。成片圆角方块与水平阶状褶皱显著减弱，全图宽山地/低地仍保留；近景却成为细密交错锐褶，依旧有均匀满铺小纹的感觉，宽主谷与大小递进的支脊缺乏，少数块状/斜向痕迹未消除。**局部改善成立，整体自然视觉未通过，不提升生产。** 24-world高频高程仍作为16-world谷网输入，后者不能解析该高频全部结构；这是可解释剩余现象的源码尺度事实，尚未经独立消融归因。此轮停止，不自启下一路线。
