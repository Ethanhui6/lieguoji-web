# 失败与修复记录

- 最初独立build产物审核：check-dist的cwd是.autopilot/court16-preview，原脚本需要public/terrain-licenses.txt，ENOENT。首次补文件命令仍用相对项目路径，失败。随后使用明确绝对项目源与独立审核目录，原check-dist通过43文件；没有删审核、放宽白名单或整包复制项目。
- 浏览器扩展套件首次未进入测试：Node直接导入court16-people引入JSON，报needs an import attribute of type json。仅chronicle/locality合成覆亡fixture需要清当前人物引用，已在夹具里显式设置为null，移除不必要生产模块导入；保留生产完整校验及所有旧库保护断言。
- 首轮39相关单元已通过，但只读审计仍指出未知官职枚举会被当损坏备份恢复及人物身份关联检查偏弱。补future枚举双槽锁、数字leaderId、原姓名姓氏/观察日期关联并增加回归，再启动全量检查。
- 尚未验证：原作完整行为/视觉等价、iPhone13ProMax真实Safari/Chrome、年龄死亡/完整家族/朝廷AI任免及地区官职。移动Chromium仿真只记仿真。
