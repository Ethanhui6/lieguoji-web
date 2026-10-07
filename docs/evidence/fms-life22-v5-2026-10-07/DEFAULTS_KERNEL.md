# 人物注册、家族默认与颜色转换内核

接续 aa87060，新增 character-registry.ts、family-defaults.ts。无参人物不抽随机，注册后带参初始化只有一轮四技能/traits；四次逐写，失败保留已注册对象和已写数据。首轮遗漏 originalFamilyId=0 已由只读审查指出并补齐，与既有 full-name.ts 输入一致。类型检查首轮出现 traits 空数组回调使泛型推为 never，已改由实际人物 C 的 traits 类型约束端口，不用 any 或跳过校验。

Family/Manager默认及独立容器按CREATION_RECOVERY实现；生成颜色包装依显式getNextColor端口，不能伪称当前已复刻palette序列。HTML转换已将既有37AC80半偶数核接上，f32(c*255)后转int再夹0..255，大写8位RGBA，无#；仅主张有限且可转int32的域。十个集合及两个当前/历史字典不共享。

首轮24项通过（family-defaults-first.json），修正字段/类型后最终33项通过（family-defaults-final.json，含既有名字查询核）；最终目标lint与完整types通过。只读复核未再发现实质问题。当前未生产调用，v22引擎和5195仍保持；不能将这些33与先前测试直接累加为全量。下一批按FAMILY_MEMBERS_RECOVERY落实际配偶/子女/旁系生成，再接新人物关系保存版本。

## 颜色算法剩余边界（只读已恢复，未完整接线）

GetNextFamilyColor8624D0–862886：静态palette null异常；空列表直接返回f32(.7)三通道与1 alpha，不推进、不RNG。非空按当前index取字符串（不预先取模）；TryParseHtmlString22F0FB0一次，false灰色替代但继续，异常不吞。随后重新读取index与Count，unchecked(index+1)后signed remainder Count，立即写新index（86268D–6A9），后续异常不回滚。

RGBToHSV22F1580后，System.Random1853880以int32(新index*1000)新建一次，NextDouble三次。不是Unity随机或持久同一随机实例：h=f32(h+f32(d1*.06d-.03d))→helper2D16C0(h,1f)，若负加1f；s/v分别f32(base+f32(d*.1d-.05d))再比较夹0..1。double乘减保持各操作，之后single相加。HSVToRGB22F11A0(h,s,v,true)，返回alpha强制1。固定palette与索引循环会重用相同seed；无去重重抽。

ToHtmlStringRGBA22F0AD0–22F0D87已恢复：RGBA逐一f32(c*255)→37AC80→整数夹0..255，格式ScriptString为{0:X2}{1:X2}{2:X2}{3:X2}。37AC80复用numeric.ts和upper14/GOLD_RECOVERY.md:15，不重复反编译。色相helper2D16C0、静态palette装载、System.Random内部、RGB/HSV与HTML解析器实现仍未展开，不用猜测或平台Math.round冒充。
