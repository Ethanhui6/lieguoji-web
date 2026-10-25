# 地图字体：全字库正楷体（TW-Kai）

- 来源：原作 Fantasy Map Simulator 地图名称标签预制体（LabelName → "TW-Kai-98_1 SDF"）所用字体 TW-Kai，Version 103.1。
- 版权与许可：© 2018 National Development Council（台湾国家发展委员会），依「政府资料开放授权条款 第1版」（Open Government Data License, version 1.0，https://data.gov.tw/license）提供，可再利用，须注明来源。
- 网页只发布子集 `src/fms/play/assets/tw-kai-subset.woff2`：包含网页源码中名称目录用到的全部汉字（2477 个）及基本拉丁字符与常用标点，约 1.2MB。构建白名单（scripts/check-dist.mjs）按大小与 SHA-256 核对。
- 子集外的字（如玩家自定义名称里的生僻字）回退到系统楷体（KaiTi / STKaiti / Kaiti SC）。
- 重新生成：用 fontTools 从原作资源导出的 TW-Kai-98_1.ttf 按 `src` 中出现的汉字做 woff2 子集（中间产物只放在 .autopilot/fms-audit）。
