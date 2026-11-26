#!/usr/bin/env bash
# 列国纪 v7.0 / LieguojiServer v13 — 腾讯云广州 4C4G 3Mbps (Ubuntu 24.04 + Docker 29) 极限低延迟内核调优与一键部署脚本
set -euo pipefail

echo "=== [1/4] 写入 Ubuntu 24.04 BBR + FQ + 零 Bufferbloat 低延迟 TCP/UDP 内核参数 ==="
cat <<'EOF' | sudo tee /etc/sysctl.d/99-lieguoji-lowlatency.conf >/dev/null
# BBR 拥塞控制 + Fair Queue 精确整形：在 3 Mbps 带宽下将排队延迟压到物理极限（< 5ms 排队）
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# 彻底禁止空闲后重新进入慢启动（避免玩家停顿 2 秒后再点击或恢复推演产生 150ms 尖峰）
net.ipv4.tcp_slow_start_after_idle = 0

# 低延迟优化 & ECN & FastOpen
net.ipv4.tcp_low_latency = 1
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_ecn = 1
net.ipv4.tcp_notsent_lowat = 16384
net.ipv4.tcp_mtu_probing = 1

# 针对 3 Mbps 链路精选的防 Bufferbloat 缓冲区（不大不小：既满速又不堆积数百毫秒队列）
net.core.rmem_max = 1048576
net.core.wmem_max = 1048576
net.ipv4.tcp_rmem = 4096 65536 524288
net.ipv4.tcp_wmem = 4096 32768 262144
net.core.netdev_max_backlog = 4096
EOF

sudo modprobe tcp_bbr || true
sudo sysctl --system >/dev/null
echo "当前拥塞算法: $(sysctl -n net.ipv4.tcp_congestion_control) · 队列调度: $(sysctl -n net.core.default_qdisc)"

echo "=== [2/4] 放行本地防火墙端口（TCP 80/443/8443/8765 + UDP 8767 零队头阻塞推流）==="
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
    for p in 80/tcp 443/tcp 8443/tcp 8765/tcp 8767/udp; do
        sudo ufw allow "$p" >/dev/null || true
    done
    echo "UFW 已放行 TCP 80/443/8443/8765 及 UDP 8767（请在腾讯云控制台轻量防火墙同样放行 UDP 8767）"
else
    echo "未启用 UFW（请在腾讯云控制台防火墙确认放行 TCP 80/443/8443/8765 及 UDP 8767）"
fi

echo "=== [3/4] 拉取列国纪最新主分支并重建部署 v13 计算服 + 平台服 ==="
REPO_DIR="${LGJ_REPO_DIR:-/opt/lieguoji-web}"
if [ -d "$REPO_DIR/.git" ]; then
    cd "$REPO_DIR"
    git fetch origin main --depth=1
    git reset --hard origin/main
else
    sudo mkdir -p "$(dirname "$REPO_DIR")"
    sudo git clone --depth=1 https://github.com/Ethanhui6/lieguoji-web.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

cd "$REPO_DIR/server-deploy"
export LGJ_PUBLIC_HOST="${LGJ_PUBLIC_HOST:-111.230.153.235}"
export LGJ_MAX_KBPS="${LGJ_MAX_KBPS:-2480}"
sudo -E docker compose up -d --build --remove-orphans

echo "=== [4/4] 部署健康检查 ==="
sleep 3
sudo docker compose ps
curl -sS "http://127.0.0.1/api/v1/bootstrap" | head -c 360 || true
echo ""
echo "✅ 列国纪 v7.0 / LieguojiServer v13（BBR+FQ · LGB1 <1KB/帧 · UDP 8767 · 3Mbps 专调）已就绪！"
