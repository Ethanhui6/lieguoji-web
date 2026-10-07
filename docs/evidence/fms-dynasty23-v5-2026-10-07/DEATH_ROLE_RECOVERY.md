# 死亡角色归档恢复证据

2026-10-07，授权安装目录只读，GameAssembly.dll SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。分3函数窄批，不运行原作/恢复脚本，不读取认证SDK或私人档。以下静态恢复不能替代实机对照。

## 三个领袖类型谓词

Die中的84F9D0–84FA50、84FA50–84FAD0、84FAD0–84FB50均为运行时 NationalLeaderRole 类型测试（包括派生类），null false；不比roleType字符串，不查holder/state/alive，不调用IsValid。

调用者83B149先Any；真时83B177重读roles并83B235取首个匹配对象；stateId取角色+38，仅正值查国家，不取人物stateId。卸任后83B42C重新查剩余领导角色，找到则83B464读Role.startTime+18并83B498算年数；没有则0。不是reignStartTime+30，也没有要求剩余角色属于之前缓存的国家。

## PastRole构造88ABF0–88ADB0

新对象引用null/数值0。role为null时，88AC52只规范化endTime，然后写endTime+30与原reason+38，正常返回。

非null按序写roleType→Normalize(role.startTime double)→startTime→Normalize(endTime)→endTime→原reason；起始规范化异常时已有type，结束规范化异常时已有type/start，无内部回滚。

运行时互斥分支：NationalLeaderRole复制title/stateId后返回；否则PatriarchRole仅familyId后返回；否则GovernmentOfficeRole依次复制StateId、OfficeId、ScopeKind、ScopeId、WarSystemKind、PoliticalSystemAtAppointment。政府角色不生成title。Spouse/Heir无专属分支，不复制其state/family/spouseOf。

无国家/家族/holder存在性校验，无枚举或时间前后校验，不把空reason改death。具体death由上游调用。网页kernel使用明确类型解析端口，不以roleType冒充真实类型；所有生产组合仍须私有候选。

## 时间规范化和比较

NormalizeTimestamp88AB60–88ABF0在88ABD4置digits2、88ABD1置mode0，88ABE5尾调用Math.Round18373C0。没有f32/正数/有限值限制。

HasSameStartTime88AB10–88AB60先规范化a再b；任一异常传播，a是NaN仍会调用b。88AB35 ucomisd /88AB39 jp /88AB3B jne，最终精确数值相等；NaN false、±0相等、同号无穷相等，不用epsilon。

## 原Round的精确数值路径

Round18373C0–1837670先无符号检digits0..15，失败ArgumentOutOfRangeException("digits")；再检mode0..1，失败ArgumentException("mode")。本角色核只需要mode0，不实现/不声称AwayFromZero分支。

仅abs(value)<1e16进入缩放，其余（含NaN/±Infinity）原值返回。Math..cctor1837940–18379F0的阈值bits4341C37937E08000；16项double表10^0..10^15来自metadata偏移0x644290，128字节SHA256 195ABC1ABB69B6BD65F20ACAFA79EED2D330BF513E25C830F24B8A78D8703446，与cctor引用字段匹配。

按double先乘表项→ToEven helper005FD0→double除表项，所有中间保留。helper非负分支modf；fraction精确+.5时按integral奇偶决定加1，否则先double(x+.5)再floor。负路fraction精确-.5时按奇偶减1，否则先double(x-.5)再ceil。

下游三个实际helper已在下一窄批闭合：

- 2D0F40–2D1003为modf；向零截整数，同号零分数，|x|>=2^53先写原整数后返回同号零，NaN另x+x。
- 2D10B0的标量2D10D0–2D116E及SSE2EC0F0(roundsd9)均floor；+0.5在2D1139 xorps明确+0。
- 2D3060的标量2D3080–2D312A及SSE2EC110(roundsd0xA)均ceil；负小数到零明确-0。|x|>=2^52有限数原样。

因此Round(-0,digits,ToEven)通过非负路径得到+0；负非零小数可能-0。大数不能加“已为整数”短路：helper(2^52+1)先+.5在double下变成2^52+2，负值对称。角色核测试保留这些实际边界。

网页Math.trunc/floor/ceil在此有限数与有符号零范围对应原数值行为；fraction为零的符号不参与±.5比较。JavaScript不保证NaN payload逐位保存，本批不做该主张；有限存档时间不依赖它。

## 工程接线状态

native-economy/role-history.ts与native-round.ts为独立核，尚未加入v23生产指纹、Worker或存档；试玩仍明确无自然死亡。后续ProcessNaturalDeath统计、LeaderDeathEvent参数和族长交接输入正按原包继续恢复，不重复已闭合家族核。
