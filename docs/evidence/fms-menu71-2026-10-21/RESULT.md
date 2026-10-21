# 第8—9步：菜单选项与存档管理（2026-10-21）

## 原作依据（GameAssembly.dll 反汇编，只读）
- 原作 Steam 版没有标题主菜单；“新的对局 NewGame”只用于抖音直播的 RoundResultPanel。游戏内入口是 `SettingsUIInfo`（菜单选项）：加载游戏、保存游戏、导出、退出游戏、其他设置、语言、分辨率、屏幕模式、音量、镜头缩放速度。
- `LoadSaveDataUI`：保存模式第一个按钮固定写 “New Save”（未翻译）；点已有存档弹出 `OverwriteSaveConfirm`“是否覆盖该存档？存档：{0}”（是/否）；加载模式点存档进入“加载或删除存档”。`DeleteCurrentSave` 删除后回到列表。
- `NewSaveSlot.OnOpen` 默认名 `yyyyMMddHHmmss`；`SaveSystem.SanitizeSaveName`：空名用时间戳、去“.save”、去非法字符与控制字符、Windows 保留名加“_save”、截到80字。
- `SaveSystem.GetAllSaves` 按保存时间排序（新在前）。
- `AutoSaveManager`：默认关闭（GameConfig.isEnableAutoSave 未置位），间隔默认10分钟、5—60；仅 `isGameStarted` 后按真实秒计时；剩余1—5秒显示“<红>{0}秒</红>后将自动保存，按 ESC 取消”；ESC 重新计满间隔；到时显示“正在自动保存”，存为 `autosave`。
- 导出：`SelectExportType`“请选择需要导出的内容”→导出图片/导出历史记录。`HistoryManager.ExportHistoryEvents` 写 HistoryEvents.txt：按年升序“========== {0}年 ==========”，每行“月.日 文本”（去富文本标签），年后空行；紧急动员默认不含。

## 网页实现
- `culture47-library.ts`：独立 IndexedDB 存档库（每条含完整日志与开局地图、SHA-256 摘要，写前回放校验；未知格式锁定不覆盖）。原“继续文化世界”槽位保持不变；加载存档后快速保存写入其所属槽位并读取当前版本号。
- `CultureMenu47.tsx`：菜单选项、存档管理、新存档、覆盖/删除确认、自动保存设置、导出（当前视图图片、历史记录）。开始界面增加“加载游戏”。
- `culture47-config.ts`：自动保存开关与间隔按浏览器保存。
- 网页差异（明示）：退出游戏=返回地图编辑；屏幕模式=浏览器全屏；语言仅简体中文；加载前若有未保存进度会额外确认；截图仅“当前视图”，其余地图类型、分辨率、音量、镜头缩放速度、其他设置标“尚未还原”。

## 验证
- 冻结上一引擎 d217a4bd…（engine-d217.js）；新构建引擎 558225d6…，`check-menu71-dist` 发布审计通过。
- 单元：save-library71（6项）、culture47-verification、frame-length70 通过；类型检查与 ESLint 通过。
- 浏览器 fms-menu71：桌面/手机/平板 6/6 通过（命名保存、覆盖确认、加载恢复日期、删除、导出历史与 PNG、自动保存默认值、倒计时+ESC+autosave 出现在列表）。
- 截图：menu-mobile.png、save-mobile.png（模拟器，非真机）。
