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

## 后续闭合：ISO 日期适配与普通建国生日

独立 `iso-calendar.ts` 已实现前推 Gregorian 算法的 ISO 日期适配；这是网页实现，按原第三方调用合同验证，没有移植其二进制或声称恢复完整 NodaTime。

- 三参 LocalDate 19E5210：19E5260 校验 Gregorian 日期、19E5277 传 CalendarOrdinal=0；元数据 Iso=0，Gregorian=1。范围 -9998…9999，包含年 0。1A42DB0 校验实际月长度，1A42CD0 的闰年规则为整除 4 且非整除 100 或整除 400。
- PlusDays 19E4440 → FixedLengthDatePeriodField.Add 1A409D0；连续日加减，越界抛出，外层 TimeManager 才夹限。网页实现使用整数累计日、二分年份与实际月长，不依赖 JS Date 或本机时区。
- Period.Between 19F0DC0 的单 Years 路径 19F1137、单 Months 路径 19F10C4，分别直接调用 UnitsBetween。年差 1A56F70、月差 1A4D940：先算年/月数量差，再把起日加相应数量、日截到目标月末；正向越过终点减 1，反向越过终点加 1。因此 2012-02-29→2013-02-28 年差 1，反向 0；1 月 31 日至非闰年 2 月 28 日月差 1，反向 0。
- 普通建国 GenerateLeaderForState 88E1A0：88E3A8 先完成文化人物生成，非 null 才 88E3E8 调整数 Range(35,55)，写 age 后 88E422 算生日，float 扩 double 写 birthTime，最后 AppointLeader(initial)。没有立即 UpdateAge。`leader-birth.ts` 只恢复这个后置赋值切片，不冒充完整继承或家族创建。
- GenerateLeadersForAllStates 88E600 仅在国家有效且 leaderId<=0 时调用；已有正 ID 跳过，不在该入口重抽生日。HandleDynastyChange 8633A0 选择现有家族人物，本体没有创建成人或抽生日，不能套用普通建国年龄。

新增日期适配与建国年龄核，加上已有日期/生命周期测试：`iso-calendar-first.json` **87 项/4 文件通过**；4 个新增文件 ESLint、完整 TypeScript 检查通过。日期适配另由只读代理对上述 PE 合同核查，无实质偏差。覆盖跨年 0、闰日、月末正反向差、400 年周期、范围夹限、空生成不抽随机、生日赋值次序和失败路径。没有生产调用，当前 v21 和存档不变。

第三方主源参考：[YearsPeriodField](https://github.com/nodatime/nodatime/blob/main/src/NodaTime/Fields/YearsPeriodField.cs)、[RegularYearMonthDayCalculator](https://github.com/nodatime/nodatime/blob/main/src/NodaTime/Calendars/RegularYearMonthDayCalculator.cs)。查询的官方当前源仅作为语义参考，不据此推断安装包版本；直接合同来自原包 PE。

下一批先接独立持久生日、按真实 ISO 月初更新的年龄与人物显示；旧 `recordedDay` 仍不是生日，旧副本和来源未闭合的新人物保持未知。自然死亡、真实家族继承与历史清理继续独立待接，不用空亲属数组补假历史。
