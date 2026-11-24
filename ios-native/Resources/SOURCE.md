# ios-native/Resources 来源说明

- Catalog/traits.json、noble-cultures.json、World/cultures.json：由网页目录导出（catalog-export.test.ts）。
- Fonts/TW-Kai.ttf：全字库正楷体 TW-Kai，© 2018 台湾国家发展委员会，政府资料开放授权第 1 版；GB2312 全部汉字 + 名称目录用字的子集。
- Catalog/biome-resources.json：网页 native-economy/biome-resources.json（原作资源配置，已获授权复用）按 13 种地貌解析后的表，供新世界创建的省份资源抽取使用。
- App/NationSheet.swift 中 `TraitText.effect`：27 条特质效果描述，取自原作 `StreamingAssets/Base/Traits/CharacterTraits/localization.csv` 的 `CharacterTraitDesc_*` 中文列，仅复制这 27 条字符串；未复制 localization.csv 本身或其他语言。
- World/unit-Infantry.png、unit-Cavalry.png、unit-Archer.png、unit-Shield.png、unit-Elite.png、unit-Fleet.png、unit-Warship.png、unit-Merchant.png、caravan-*.png、battle-sword.png、sea-wave.png、peace-bird.png、war-claim.png、paper-detail.jpg：原作兵种/水师战船/商队线条图标、40 帧双剑交锋序列帧、64 帧海浪序列帧及宣纸纤维无缝局部采样纹理（均已获授权复用）。
- Music/*.m4a：原作 RandomMusicPlayer 的五首曲目（sharedassets0 AudioClips，AAC 96 kb/s，与网页版同一份已审核文件，已获授权复用）。
- World/unit-Port.png：本项目绘制的海港铁锚线条图标（白色描边，运行时按国色着色）。
- Art/*.png、Video/*.mp4：本项目生成的古舆图线雕地貌印章、四季天象画卷元素、36 帧高密度特效序列帧图集及 60fps H.264 历史画卷动画短视频。
