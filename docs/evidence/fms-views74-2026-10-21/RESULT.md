# 第11步：地图视图切换（2026-10-21）

## 原作依据
- `ViewManager.ColorViewMode`：Normal、Alliance、Religion、Culture、Family、District；名称 StateView 国家视图、AllianceView 联盟视图、ReligionView 宗教视图、CultureView 文化视图、FamilyView 家族视图、DistrictView 区域视图。
- `PlayerController.DebugViewModeSwitch`：数字键 1 国家、2 联盟、3 文化、4 家族、5 宗教、6 区域；切换时显示视图名（SetColorViewMode→MajorEventMessageUI）。

## 网页实现
- 数字键1—6与左下“地图视图”选择框；原作网格世界与旧网格世界都按视图重新着色。
- 国家视图=国家色；联盟视图=同盟成员同色，未结盟保持国家色；文化视图=行省城市文化；家族视图=家族封地；宗教视图=所属国家宗教。
- 差异（明示）：配色为网页调色板；宗教按国家而非逐行省（网页无行省宗教）；区域视图禁用（无区域系统）；原作各视图的文化/宗教/家族/联盟名称标签与边界线尚未还原，仍显示国名。原有“政区/地形”切换保留。

## 验证
- 冻结 ddc4；新引擎 41ba900a…；发布审计通过。
- 单元 views74 2/2；浏览器 fms-views74 桌面/手机/平板 3/3，菜单71与行省72回归 12/12。
