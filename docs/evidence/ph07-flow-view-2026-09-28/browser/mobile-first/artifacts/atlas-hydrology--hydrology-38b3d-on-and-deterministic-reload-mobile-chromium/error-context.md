# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-hydrology.spec.ts >> [hydrology-v4] native saved continent, read-only real flow, active cancellation and deterministic reload
- Location: tests\atlas-hydrology.spec.ts:125:1

# Error details

```
Error: page.evaluate: Error: The generated saved continent has no actual interior highland probe
    at eval (eval at evaluate (:311:30), <anonymous>:126:23)
    at async <anonymous>:337:30
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - heading "山河流向 · 原生只读验收" [level=1] [ref=e6]
        - generic [ref=e7]: 生成预览 · 尚未保存
      - button "撤销大世界编辑" [disabled] [ref=e8]:
        - generic [ref=e11]: 撤销
      - button "返回原世界工坊" [ref=e12] [cursor=pointer]:
        - generic [ref=e15]: 工坊
    - generic [ref=e16]:
      - generic "大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块" [ref=e18]
      - group "地图视图与创作工具" [ref=e19]:
        - generic [ref=e20]:
          - button "放大大世界地图" [ref=e21] [cursor=pointer]: ＋
          - button "缩小大世界地图" [ref=e22] [cursor=pointer]: −
          - button "全图" [ref=e23] [cursor=pointer]
          - generic [ref=e24]: 9%
        - toolbar "地图创作工具" [ref=e25]:
          - button "浏览地图" [pressed] [ref=e26] [cursor=pointer]:
            - generic [ref=e30]: 浏览
          - button "画大陆" [disabled] [ref=e31]
          - button "显示地块网格" [ref=e35] [cursor=pointer]:
            - generic [ref=e39]: 网格
      - region "大陆与地貌" [ref=e40]:
        - generic [ref=e41]:
          - generic [ref=e42]:
            - heading "大陆与地貌" [active] [level=2] [ref=e43]
            - paragraph [ref=e44]: 独立保存，不覆盖原世界
          - button "展开阅读" [ref=e45] [cursor=pointer]
          - button "关闭大世界面板" [ref=e48] [cursor=pointer]
        - region "大陆生成预览" [ref=e53]:
          - generic [ref=e54]: 尚未保存 · 生成预览
          - heading "看看这片新大陆" [level=3] [ref=e55]
          - paragraph [ref=e56]: 沿着你的轮廓生成海湾、半岛、近岸群岛和山地。可以关闭面板，放大查看海岸，再决定是否保存。
          - generic [ref=e57]:
            - generic [ref=e58]:
              - term [ref=e59]: 世界陆地面积
              - definition [ref=e60]: 2.74%
            - generic [ref=e61]:
              - term [ref=e62]: 高程范围
              - definition [ref=e63]: "-6454 至 2155 米"
          - generic [ref=e64]:
            - button "取消生成" [ref=e65] [cursor=pointer]
            - button "确认生成并保存" [ref=e66] [cursor=pointer]
        - generic "草稿操作反馈" [ref=e68]:
          - status [ref=e69]:
            - generic [ref=e70]: 正在查看生成预览，尚未保存。
    - navigation "大世界草稿工具" [ref=e71]:
      - button "地图" [ref=e72] [cursor=pointer]
      - button "创世" [pressed] [ref=e77] [cursor=pointer]
      - button "编辑" [ref=e82] [cursor=pointer]
      - button "草稿" [ref=e86] [cursor=pointer]
  - button "select to enable accessibility for this content" [ref=e91] [cursor=pointer]
```