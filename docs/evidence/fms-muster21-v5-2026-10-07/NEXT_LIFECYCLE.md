# 下一人物生命周期依赖：实际月序与年龄

沿用[court16既有死亡/日期核证据](../fms-court16-v5-2026-10-07/NEXT_RECOVERY.md)与`native-economy/character-lifecycle.ts`，不重做死亡概率、取样或保留纯核。既有GetDateByDayCount522CC0已补核，不能再次登记为新增恢复。

本轮只读原Windows IL2CPP函数，未执行原作/恢复脚本，未读SDK/认证/个人存档。新增闭合：

## TimeManager.AdvanceOneDay5215E0

521683–52168B：只有currentDate.Day==1进入月初块，否则转521E8A。月初先分配省52174D/国家521780更新日；刷新人口中位数52186A，外交月处理521954，战争期限521A29，V2下首都危机/议和等521A81–521B54。521C29调用CharacterManager.AdvanceMonth836DC0；521D17分配家族更新日853C30，521D31调用FamilyManager.MonthlyUpdate865750。

随后每天依次UpdateProvinces521F46、UpdateStates522034（50D980）、UpdateFamilies522122（8710E0）。因此人物月初年龄/自然死亡先于当天任何国家随机月结。不能把人物挂在各国月结之后并重复处理。12月31日另有国家年回调52242F、家族年回调522514，无另一个人物年度死亡入口。

## Character.UpdateAge83DD30–83DDA0

已死人83DD55–59直接返回、保持年龄；存活时83DD7C读取double birthTime(+58)，83DD87调用GetYearSince523680，83DD8C写int age(+28)。不读旧年龄累加、不抽随机、不调用死亡、不改生日/死亡时间。GetYearSince使用GetDate(birthTime)和GetDate(double(gameTime float))做NodaTime完整年差，月初回调的currentDate与年龄计算的gameTime不可混为一个来源。

## 接线需要的实际数据

当前CourtPerson的recordedDay是被观察日期，不能当生日。新规则需要独立人物birthTime/age缓存与来源/未知标志，世界startDate、secondsPerDay、当前时刻与月处理游标。启用死亡还需要deathTime、随机流、当月处理标记。Die政治后果需要真实角色与历史角色、familyId、配偶/父母/子女；姓氏字符串不是家族实体。禁止用默认false/0/[]补未知历史后运行清理。

原字段索引dump.cs:84527：age+28、birthTime+58、deathTime+60、isAlive+68、familyId+6C、spouse/father/mother+88/+8C/+90、childrenIds+98、roles/pastRoles+A8/+B0、historicallyImportant+B8。旧档副本生日保留未知，不能静默重新生成成年生日。

下一窄批待核日期初始化TimeManager实例构造524430/静态构造524020、GetBirthTimeFromAge522C80及一般新君主的年龄输入；随后再接持久生命历程与完整死亡/继承事务。此文记录依赖，不代表已在v21发生原自然死亡。
