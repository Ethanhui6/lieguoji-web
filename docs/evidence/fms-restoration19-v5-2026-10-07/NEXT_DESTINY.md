# 下一批已恢复：国运初始化、月度衰减与读档区别

只读代理在用户授权原安装包及现有分析材料中窄核；根记录。没有运行原作、恢复脚本或读取SDK/认证/个人存档。以下尚未进入v19生产，不重复从头恢复。

## RandomDestiny(init) 5D4560–4660

init=true先int Range(2,5)写maniFestDestinyCount。若IsManifestDestiny且count>0，count减一、destiny=int Range(70,90)，早退，不改下降率也不清近期紧急动员队列。否则count减一、destiny=int Range(10,90)、destinyDecrease=float Range(f32(.043),f32(.28))，清recent3EmergencyMobilize。false允许count变负；原Unity全局RNG顺序未复现。网页应注入明确RNG，持久保存而非加载重抽。

## UpdateDestinyValue 5DD5E0–5DD840

所有F表示Math.fround，操作顺序保留：

```ts
const F = Math.fround;
const populationRatio = F(F(totalPopulation) / F(totalMaxPopulation));
const base = F(destinyDecrease * F(0.3333));
const raw = F(F(base + F(populationRatio * base)) + F(base * (gold < 0 ? F(0.5) : F(0))));
if (destiny < F(30)) {
  destiny = F(destiny - F(randomFloat(F(0.083), F(0.24)) * F(0.5)));
} else {
  const skill = leaderExists ? clamp(currentAdministrativeSkillGetter(), 0, 100) : F(50);
  const ratio = clamp(F(skill / F(100)), 0, 1);
  destiny = F(destiny - F(F(F(1.5) - ratio) * raw));
}
const threshold = maniFestDestinyCount > 0
  ? F(F(Math.trunc(F(F(maniFestDestinyCount) * F(1.5)))) + F(10))
  : F(10);
if (destiny < threshold) randomDestiny(true);
```

人口比为本国省人口总和/本国最大人口总和，不是全球比例。5DD627–680基础项；5DD6CC–6DB严格<30；5DD6E1–788默认能力50和真实83DF70 getter；5DD792–7BB低国运随机量；5DD7C3–80D严格阈值。没有最后clamp，没有while；重抽后仍低于新阈值也不再抽。月衰减自身不改count/decrease，除非触底。低值分支虽然不用人口结果改变扣减，原函数仍先调用人口helper。领袖判定只要求对象存在，不在此再次检查alive；上游先ValidateLeaderStatus。人口分母0异常有日志/清国深层副作用，尚未闭合，不可默默替换成任意比例。

## 调度合同

TimeManager.AdvanceOneDay5215E0在每月1日的521780调用StateManager.AssignRandomUpdateDays508270，清validStatesForNextMonth，给非null/i非0且IsAlive国家抽int Range(1,daysInMonth+1)写updateDayOfMonth+2A0。IsAlive5D15D0只检查!isDead。每日522034调用UpdateStates50D980；月名单中IsValid且当日等于分配日，50DA68才AdvanceOneMonth。

State.AdvanceOneMonth5BF120再排除i0/dead/不可征服/空白国家，顺序：领袖校验→国家数据→军队→外交联盟→近期叛乱队列→5BF29A国运→紧急动员→后续叛乱/宗教/任命。AdvanceOneYear5BF500没有再扣一次。UpdateSuperRebel5E1570的5E15F9也调用此函数，但本次PE直接call/jmp引用为0，间接调用未证明，不能额外调一次。月中建国不据此假定立即补月结。网页30日统一结算如沿用必须标明调度适配。

## 构造、改特性、读档不能混用

- 两State构造器5E2510/5E2F20分别在5E2AC7–ACC、5E34E8–4ED抽float Range(.083,.24)设下降率；5E2CD7/5E36F8设count=3；Manifest初始false。与普通RandomDestiny(.043,.28)范围不同。
- 原StreamingAssets/Base/Traits/StateTraits/traits.json:27真实ManifestDestiny特性将IsManifestDestiny布尔置true，value1，无weight字段。
- State.ApplyTraitEffect5BFFA0先重置派生布尔（5BFFFC含+328），按trait投影；最后5C012D–148若Manifest为true，int Range(2,5)重抽count但不减。移除其他特性后Manifest仍在也会重抽；移除Manifest本身不把count归零。
- **纠正旧STATE_BASE_RECOVERY.md中“刷新入口”的宽泛说法**：PostLoadSaveData5D3B50的5D3ECC调用单条Trait.ApplyEffect528750，不是State.ApplyTraitEffect5BFFA0。读档恢复Manifest布尔不触发count重抽。新实现不可在load调用完整特性刷新。
- destinyDecrease是无可见JSON注解的私有字段；count公开；Manifest属性JsonIgnore。全局Json.NET resolver设置未闭合，未证明原档全部往返行为。网页显式存运行值，读档不抽随机，避免丢档/漂移。

补核精确边界：阈值5DD7DF为cvttss2si，溢出在通常屏蔽无效浮点异常时得到INT_MIN，不是JS Math.trunc/取模/饱和；原MXCSR未检查。两个计数递减5D45BB/5D45ED为dec dword，INT_MIN回绕INT_MAX。两构造器未写destiny+1E4，初值0。有限输入也可在月计算中溢出到-Infinity，原5DD784→5DD7FC→5DD80D仍触底重抽；内部重抽不能再次拒绝马上会被覆盖的旧destiny。独立核已按此修复并补测试，结果单列，不回写此前23项报告。

下一批先独立可测内核，核float32、边界30/threshold、负金币、真实行政getter、抽数顺序与Manifest早退；再冻结已交付v19，确定持久国运状态和统一月结适配，新版本接真实Worker。紧急动员/内战/改革也可改国运，尚未全部恢复；不要将自然衰减叫完整国运生命周期。完整人物年龄/家族仍独立后续。
