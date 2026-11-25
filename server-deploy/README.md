# 列国纪在线计算服务器 v6 · 部署与畅玩指南

《列国纪》v5.2.2 已升级为 **v6 真·网游级主动推流架构**（全双工多路复用 TCP + LZ4 二进制压缩 + 精简推流帧 5–10 KB/帧 + 客户端抖动缓冲平滑插值 + 彻底移除推演期 30 秒卡顿）。提供两种畅玩方案：

---

## 方案 A：零成本用自己的 Windows 电脑（推荐同 Wi-Fi 下使用）
1. 在 GitHub Release 下载 `lieguoji-server-v5.2.2-windows.zip` 并解压，双击运行 `LieguojiServer.exe`（允许防火墙「专用网络」放行）。
2. **同一 Wi-Fi 下（2–6 ms，真·丝滑满帧）**：手机打开《列国纪》通过 UDP 局域网发现 10 ms 秒连电脑，自动切入 v6 全双工主动推流。
3. **外出 4G/5G 下**：电脑通过 `https://lieguoji-edge.pages.dev/api/relay` 单向推流至手机 WebSocket，省去整趟请求往返延迟；若跨境节点仍有延迟，升级至方案 B 即可彻底达到商业网游 15–35 ms 体验。

---

## 方案 B：国内轻量云服务器 24 小时专属服（强烈推荐，15–35 ms，电脑关机也能玩）
只需一台 **中国大陆 2 核 2G/4G 轻量应用服务器**（腾讯云 / 阿里云 / 华为云新客约 ¥30–99/年，Ubuntu 22.04）：

```bash
git clone https://github.com/Ethanhui6/lieguoji-web.git
cd lieguoji-web/server-deploy
chmod +x install-linux.sh
./install-linux.sh
```

1. 在云控制台防火墙/安全组放行 **TCP 8765**。
2. 手机打开《列国纪》→ **设置 → 远程计算与云端存档 → 专属云服务器 / 局域网直连**，填入 `<你的云服务器公网IP>:8765` 点 **直连**。
3. 地址会永久记住：以后无论在 Wi-Fi 还是 5G 下打开游戏、切后台再切回，均为 **15–35 ms 国内直连主动推流**，手机零算力发热、大地图 60fps 丝滑如本地商业网游。
