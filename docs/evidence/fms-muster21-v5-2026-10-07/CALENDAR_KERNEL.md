# 原生日、年龄和日期边界内核

2026-10-07；续接 v21 源码 33db769 / 交接 9a1f960。仅独立模块 `native-economy/character-calendar.ts`，没有生产调用；现有 v21 试玩、Store23 和引擎指纹保持。不能将本记录说成游戏已经有自然死亡。

## 已恢复的原作合同

- `GetBirthTimeFromAge(float)` 522C80–522CA0：522C80 年龄乘 365.25f，522C88 读取 gameTime float，522C8D 再乘 secondsPerDay float，522C92 从当前时间减去时长，522C96 返回 float。每步单精度舍入；年龄可含小数、可负，不自行夹限。调用者再把 float 扩为 double 生日。这不是完整日历年差的精确逆函数。
- `TimeManager` 静态构造 524020：日期范围为 LocalDate(-9998,1,1) 至 LocalDate(9999,12,31)。实例构造 524430：读取 WorldSettings.dayLengthInSeconds，初始年月日各 1，prevDayCount=-1；不在构造里写活动日期。
- `Start` 523E20–523F10：从实例 startYear/month/day 构造日期，523E89 写 currentDate、523EA0 写 startDate；523EA3 清 gameTime 及计数，523EA7 设 prevDayCount=-1，523EAE 清日期偏移。日期无效则构造失败。不得在读档时调用这个清时钟入口。1/1/1 仅是未改配置的新局默认。
- `GetDate`、`GetDateByDayCount`、完整年月差和 `UpdateAge` 沿用 [NEXT_LIFECYCLE](NEXT_LIFECYCLE.md) 与 [已有日期证据](../fms-court16-v5-2026-10-07/NEXT_RECOVERY.md)。历史时间保留 double，当前时间和日间隔取 float；商向零截断；NaN 和 int 边界按原分支处理。只对已识别的范围异常夹限，其他错误抛出。死者不读生日，活人成功算完岁数后才更新缓存。

来源为用户授权 Windows IL2CPP 原包的窄函数静态检查；没有运行原作，也没有读取原作个人存档或认证配置。完整历法适配、普通新成人年龄来源、死亡和继承事务仍待接续。原秒/日参数与网页播放速度不是同一字段。

## 检查与修正

最终 `calendar-final-verified.json`：日期及既有生命周期 34 项、2 文件通过；新增两文件 ESLint 和完整 TypeScript 检查通过。此前 29/32/33 项报告保留，均为独立模块检查，不计入 v21 的 91 项或 v20 的 3127 项。

只读复核发现 JavaScript `Math.trunc(-0.9)` 会产生 -0，而原 int 转换只有 0；现已传递 int32 规范化结果，并覆盖加日端口收到正零。生日浮点次序的判别用例为 (18.1,1234.567,0.1) 得 573.4645385742188，不能合并成双精度乘法后再舍入。年龄失败不改旧缓存、死人不读生日、日期异常范围、历史 double 与当前 float、整数边界均有回归。

当前日历的整年/整月和加日仍为显式端口。下一步闭合实际 LocalDate 历法适配，再接持久生日与完整死亡事务；旧 `recordedDay` 仍不是生日，未知生日不得自动补造。
