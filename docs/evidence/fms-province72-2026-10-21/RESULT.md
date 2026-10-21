# 第10步（第一批）：行省信息面板（2026-10-21）

## 原作依据（只读反汇编）
- `PlayerController.LeftClickLogic` 普通点击地图调用 `ProvinceInfoUI.Display`；面板“国家”行点击进入国家面板（OnStateClicked）。
- `ProvinceInfoUI.UpdateBasicInfoSection` 行：人口“{0}/{1}”、国家、总督（空缺）、区域、核心省份 是/否、城市类型、文化、家庭、宗教、城市防御力、主场作战效率。
- `UpdateCampaignInfoSection`：交战国“A vs B”、战役持续时间“{n} 天”、占领进度“{0:P2}”、包围或突出部 是/否，无战役时“没有正在进行的战役”。
- `Province.GetProvinceCityType`：圣地（宗教视图）→ 首都（城市=国家 capitalBurgID）→ 港口 → 手动设置（isMannulSetFortress）时按 isMannulFortreess 取要塞/普通城市 → 否则地形 IsMountainous 为要塞，其余普通城市。
- 行省操作：`OnSetAsCapitalButtonClicked`（非空白国家时 state.capitalBurgID=本省城市，只刷新图标，无史书）、`OnSetAsFortressButtonClicked`（两个手动标志=真/真）、`OnSetAsCityButtonClicked`（真/假）。按钮文字“要塞化/去要塞化”取自 localization 的 Fortification/Defortification（场景绑定为推断）。

## 网页实现
- `CultureProvince47.tsx`：点击行省（非城市图标）打开“行省详情”；城市图标仍打开国家面板并定位城市。
- 新世界命令 `province`（`civilization47-province-edit.ts`）：设为首都、要塞化、去要塞化，带政治戳由 Worker 重验，写入日志可回放；要塞标志即已有的原生防御输入 manualSet/manualFortress（要塞时主场作战效率=3）。
- 未还原并标明：宗教、总督、城市防御力行；煽动叛乱（第12步）、自定义人口/防御、设为区域中心、圣地类型、翻译。

## 同批修复
- `geography-content47` 自第6步提速后，已收养地形缓冲区的比较缓存在窗口外仍生效，外部改写会被判为未变化（全量单测1项失败）。改为缓存只在窗口内生效、复用前对照私有原样副本。固定基准世界哈希仍为 6994eae1…，33 ms/日。
- `fms-culture47-land-camera` 仍用已移除的“生成大陆”流程，改为当前整图流程；原作整图多为陆地，全图/陆地视角断言相应放宽。

## 验证
- 冻结 5582 引擎；新引擎 87f05077…；发布审计通过。
- 单元：province-edit72（3）、geography-content47（6）通过；全量 3482/3483（失败项即上述已修复项）。
- 浏览器：fms-province72 桌面/手机/平板 3/3；回归 actions65、annex66、layout63、territory64、vassal67、land-camera 桌面+手机通过；mobile-sheet 桌面为既有竖屏专用失败。
