#!/usr/bin/env bash
set -euo pipefail

# 列国纪 24 小时专属云服务器一键部署脚本（Ubuntu / Debian 轻量应用服务器）
echo "=== 列国纪在线计算服务器 v6 · 专属云服一键部署 ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "[1/3] 正在安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker || true
else
  echo "[1/3] 检测到 Docker 已安装。"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[2/3] 正在编译并启动列国纪在线计算服务器 v6（首次构建约 3–6 分钟）..."
docker compose up -d --build

if command -v ufw >/dev/null 2>&1; then
  ufw allow 8765/tcp >/dev/null 2>&1 || true
fi

PUBLIC_IP="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "[3/3] 部署完成！请在云服务商控制台安全组放行 TCP 8765 端口。"
echo "手机端打开《列国纪》→ 设置 → 远程计算与云端存档 → 专属云服务器直连，填入："
echo "    ${PUBLIC_IP}:8765"
echo "查看实时推流日志：docker logs -f lieguoji-server"
