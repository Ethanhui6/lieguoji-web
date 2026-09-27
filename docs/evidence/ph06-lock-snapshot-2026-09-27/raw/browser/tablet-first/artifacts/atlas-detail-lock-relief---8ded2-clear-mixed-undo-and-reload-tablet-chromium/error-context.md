# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-detail-lock-relief.spec.ts >> [detail-v4-lock-relief] native nonzero coast/elevation/both locks, allowed relief, single-bit clear, mixed undo and reload
- Location: tests\atlas-detail-lock-relief.spec.ts:268:1

# Error details

```
Test timeout of 450000ms exceeded.
```

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByTestId('atlas-studio')
Expected: "ready"
Received: "busy"

Call log:
  - Expect "toHaveAttribute" getByTestId('atlas-studio') with timeout 120000ms
  - waiting for getByTestId('atlas-studio')
    5 × locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" data-atlas-progress-stage="" data-atlas-progress-total="" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-completed="" data-atlas-request-bytes="67057" data-atlas-response-bytes="5…>…</main>
      - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-progress-total="256" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-completed="64" data-atlas-response-bytes="5088869" data-atlas-progr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-progress-total="996" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-completed="996" data-atlas-response-bytes="5088869" data-atlas-prog…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-progress-total="256" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-completed="160" data-atlas-response-bytes="5088869" data-atlas-prog…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="384" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-completed="1152" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="432" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-completed="1136" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="496" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="800" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="592" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="656" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="432" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="464" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="304" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="320" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="524" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="272" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1260" data-atlas-request-bytes="67057" data-atlas-progress-completed="428" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-completed="1136" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-completed="1232" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-completed="1024" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-completed="1104" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="736" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="976" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="560" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="640" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="272" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="992" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="288" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="960" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="128" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="912" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" data-atlas-progress-total="1" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-completed="1" data-atlas-response-bytes="5088869" data-atlas-progress…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1261" data-atlas-request-bytes="67057" data-atlas-response-bytes="5088869" data-atlas-progress-stage="比对持久引用原像" data-atlas-pr…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="896" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="112" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-progress-total="1253" data-atlas-request-bytes="67057" data-atlas-progress-completed="928" data-atlas-response-bytes="5088869" data-atlas-pro…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" data-atlas-progress-total="1" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-completed="1" data-atlas-response-bytes="5088869" data-atlas-progress…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-progress-total="996" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-stage="传输真实细海岸" data-atlas-progress-completed="160" data-atlas-resp…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-progress-total="996" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-stage="传输真实细海岸" data-atlas-progress-completed="768" data-atlas-resp…>…</main>
    - unexpected value "busy"
    - locator resolved to <main data-mode="atlas" data-atlas-format="4" data-atlas-gpu="ready" data-atlas-revision="6" data-atlas-state="busy" data-atlas-tool="browse" data-selectedcell="28487" data-testid="atlas-studio" class="atlas-studio workbench" data-atlas-display="committed" data-atlas-commit-ms="39556.5" data-atlas-selectedcell="28487" data-atlas-repainted-blocks="4" data-atlas-request-bytes="67057" data-atlas-progress-total="66049" data-atlas-response-bytes="5088869" data-atlas-progress-completed="45056" data-atlas-…>…</main>
    - unexpected value "busy"
  - Test timeout of 450000ms exceeded.

```

```yaml
- main:
  - heading "区域保护 · 真实锁与山地" [level=1]
  - text: 地理创作
  - button "撤销大世界编辑" [disabled]: 撤销
  - button "返回原世界工坊" [disabled]: 工坊
  - button "放大大世界地图" [disabled]: ＋
  - button "缩小大世界地图" [disabled]: −
  - button "全图" [disabled]
  - text: 203%
  - toolbar "地图创作工具"
  - region "保护区域"
  - navigation "大世界草稿工具"
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { audit, metrics, saved, type SavedSnapshot } from './helpers/atlas-shape-readonly';
  3   | import type { AtlasRenderer } from '../src/world/renderer';
  4   | 
  5   | // Staged for tests/atlas-detail-lock-relief.spec.ts. Actual UI input and read-only
  6   | // durable bytes only. No production generator, geometry or state setter imports.
  7   | const studio = (p: Page) => p.getByTestId('atlas-studio');
> 8   | const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
      |                                                               ^ Error: expect(locator).toHaveAttribute(expected) failed
  9   | const click = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
  10  | const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
  11  | const preview = (p: Page) => p.getByRole('region', { name: '山地生成预览' });
  12  | type XY = { x: number; y: number };
  13  | const contour = [[860, 1050], [1260, 810], [2020, 980], [2440, 1300], [2890, 1460], [3070, 1890], [2620, 2260], [2240, 2050], [1990, 2420], [1460, 2580], [1210, 2020], [780, 1840], [650, 1480]].map(([x, y]) => ({ x, y }));
  14  | 
  15  | async function frameReady(p: Page) {
  16  |   await expect.poll(async () => {
  17  |     const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>;
  18  |     return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready';
  19  |   }, { timeout: 120000 }).toBe(true);
  20  | }
  21  | async function screen(p: Page, points: XY[]) {
  22  |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, m = await metrics(p);
  23  |   return points.map(q => ({ x: box.x + m.camera.x + q.x * m.camera.scale, y: box.y + m.camera.y + q.y * m.camera.scale }));
  24  | }
  25  | async function assertCanvasPoints(p: Page, points: XY[]) {
  26  |   expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
  27  | }
  28  | async function gesture(p: Page, points: XY[], touch: boolean) {
  29  |   await assertCanvasPoints(p, points);
  30  |   if (touch) {
  31  |     const cdp = await p.context().newCDPSession(p);
  32  |     try {
  33  |       await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
  34  |       for (const q of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 1 }] });
  35  |       await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  36  |     } finally { await cdp.detach(); }
  37  |   } else {
  38  |     await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
  39  |     try { for (const q of points.slice(1)) await p.mouse.move(q.x, q.y); } finally { await p.mouse.up(); }
  40  |   }
  41  | }
  42  | 
  43  | /** Every current coarse/lock/fine record is fetched from actual readonly IDB
  44  |  * and checked against its content address. Coverage is canonicalized across
  45  |  * missing sea/uniform land/materialized samples, so a representation change
  46  |  * cannot hide a changed coverage value or create a false coverage mismatch. */
  47  | type FixedWitness = { probe: { x: number; y: number; cellId: number; rank: number }; regions: { mask: number; cellId: number; column: number; row: number }[] };
  48  | async function durableField(p: Page, id: string, witness?: FixedWitness) {
  49  |   return p.evaluate(async ({ id, witness }) => {
  50  |     type Ref = { bx: number; by: number; hash: string };
  51  |     type Manifest = { version: number; spec: { columns: number; rows: number }; blockRefs: { key: string; hash: string }[]; constraints: { lockRefs: Ref[] }; detailCoast: { refs: Ref[] } };
  52  |     type Row = { kind: 'coarse' | 'lock' | 'fine'; key?: string; bx?: number; by?: number; hash: string; bytes: Uint8Array };
  53  |     const { manifest, records, manifestBytes, manifestHash } = await new Promise<{ manifest: Manifest; records: Row[]; manifestBytes: Uint8Array; manifestHash: string }>((resolve, reject) => {
  54  |       const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
  55  |       request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
  56  |       request.onsuccess = () => {
  57  |         const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
  58  |         let manifest: Manifest, manifestBytes: Uint8Array, manifestHash: string; const records: Row[] = [];
  59  |         const root = tx.objectStore('roots').get(id);
  60  |         root.onsuccess = () => {
  61  |           if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
  62  |           manifestHash = JSON.parse(new TextDecoder().decode(root.result)).currentManifest;
  63  |           const read = tx.objectStore('manifests').get(manifestHash);
  64  |           read.onsuccess = () => {
  65  |             if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
  66  |             manifestBytes = read.result.bytes; manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  67  |             if (manifest.version !== 4 || !manifest.detailCoast || !manifest.constraints) { tx.abort(); return; }
  68  |             const refs = [...manifest.blockRefs.map(ref => ({ ...ref, kind: 'coarse' as const })), ...manifest.constraints.lockRefs.map(ref => ({ ...ref, kind: 'lock' as const })), ...manifest.detailCoast.refs.map(ref => ({ ...ref, kind: 'fine' as const }))];
  69  |             for (const ref of refs) {
  70  |               const block = tx.objectStore('blocks').get(ref.hash);
  71  |               block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); };
  72  |             }
  73  |           };
  74  |         };
  75  |         tx.oncomplete = () => { db.close(); resolve({ manifest, records, manifestBytes, manifestHash }); };
  76  |         tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual v4 durable record')); };
  77  |       };
  78  |     });
  79  |     const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
  80  |     const textDigest = (value: unknown) => digest(new TextEncoder().encode(JSON.stringify(value)));
  81  |     if (await digest(manifestBytes) !== manifestHash) throw new Error('Manifest bytes differ from durable root hash');
  82  |     const tiles = new Map<string, { bx: number; by: number; mode: number; coverage: number[]; heights: number[]; coverageIdentity: string; heightHash: string; hash: string }>();
  83  |     const coarse: { key: string; hash: string }[] = [], locks: Ref[] = [];
  84  |     const vertices = new Map<number, { x: number; y: number }>();
  85  |     for (const r of records) {
  86  |       if (await digest(r.bytes) !== r.hash) throw new Error(`Content hash mismatch in ${r.kind}`);
  87  |       if (r.kind === 'coarse') {
  88  |         coarse.push({ key: r.key!, hash: r.hash });
  89  |         if (r.key!.startsWith('geometry:')) {
  90  |           const parts = r.key!.split(':'), bx = Number(parts[1]), by = Number(parts[2]), b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  91  |           if ([76, 71, 65, 66].some((x, i) => b[i] !== x) || v.getUint16(4, true) !== 1 || b[6] !== 0 || b[7] !== 2 || v.getUint16(8, true) !== bx || v.getUint16(10, true) !== by || v.getUint32(12, true)) throw new Error('Invalid actual geometry header');
  92  |           let offset = 16; const columns: number[][] = [];
  93  |           for (let column = 0; column < 2; column++) {
  94  |             const count = v.getUint32(offset + 4, true), bytes = v.getUint32(offset + 8, true);
  95  |             if (b[offset] !== column + 1 || b.slice(offset + 1, offset + 4).some(Boolean) || bytes !== count * 4 || offset + 12 + bytes > b.length) throw new Error('Invalid actual geometry column');
  96  |             offset += 12; const values: number[] = [];
  97  |             for (let i = 0; i < count; i++, offset += 4) values.push(column ? v.getInt32(offset, true) : v.getUint32(offset, true));
  98  |             columns.push(values);
  99  |           }
  100 |           const firstX = bx * 32 + Number(bx !== 0), firstY = by * 32 + Number(by !== 0), endX = (bx + 1) * 32, endY = (by + 1) * 32;
  101 |           if (offset !== b.length || columns[0].length !== (endX - firstX + 1) * (endY - firstY + 1) || columns[1].length !== columns[0].length * 2) throw new Error('Invalid actual geometry owner size');
  102 |           let slot = 0;
  103 |           for (let row = firstY; row <= endY; row++) for (let col = firstX; col <= endX; col++, slot++) {
  104 |             const id = row * (manifest.spec.columns + 1) + col;
  105 |             if (columns[0][slot] !== id || vertices.has(id)) throw new Error('Duplicate or incorrect actual vertex owner');
  106 |             vertices.set(id, { x: columns[1][slot * 2], y: columns[1][slot * 2 + 1] });
  107 |           }
  108 |         }
```