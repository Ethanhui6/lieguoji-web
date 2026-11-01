# ios-native/Resources 来源说明

- Catalog/traits.json、noble-cultures.json、World/cultures.json：由网页目录导出（catalog-export.test.ts）。
- Fonts/TW-Kai.ttf：全字库正楷体 TW-Kai，© 2018 台湾国家发展委员会，政府资料开放授权第 1 版；GB2312 全部汉字 + 名称目录用字的子集。
- Catalog/biome-resources.json：网页 native-economy/biome-resources.json（原作资源配置，已获授权复用）按 13 种地貌解析后的表，供新世界创建的省份资源抽取使用。
- App/NationSheet.swift 中 `TraitText.effect`：27 条特质效果描述，取自原作 `StreamingAssets/Base/Traits/CharacterTraits/localization.csv` 的 `CharacterTraitDesc_*` 中文列，仅复制这 27 条字符串；未复制 localization.csv 本身或其他语言。
- World/unit-Fleet.png、unit-Port.png：本项目用 Python/PIL 绘制的帆船与锚线条图标（白色描边，运行时按国色着色），非原作素材。
