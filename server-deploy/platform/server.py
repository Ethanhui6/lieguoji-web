#!/usr/bin/env python3
"""
列国纪 · 云端行宫平台服务器 v5.0（中国大陆满速多源镜像 · 8 路多节点并发分块 · DB/FD/内存全链路加固 · 管理员中枢）
零第三方依赖（纯 Python 3.12 标准库 + SQLite WAL）：
1. 启动版本检测 + 中国大陆实测高速多镜像调度（cdn.gh-proxy.org / EdgeOne / gh-proxy / ghfast）+ 实时版本更新志 + 免换包热更资源包
2. 完整账号系统（注册/登录/游客/转正/御印/scrypt/90天令牌）+ ethanhui 专属管理员 RBAC
3. 游戏内管理员控制台 API（公告/跑马灯/热更参数/版本发布/全服邮件/用户管理/维护模式/主机监控）
4. 账号绑定高速云存档库（流式读取 + 原子临时文件清理）+ 每日签到品秩 + 天下史榜 + 无侵入式计算服健康探针
5. 极简安全公开官网（国内高速主线优先 + 多镜像一键切换 · 零内部运维泄露）+ 防暴力破解 IP 封锁 + 限流内存定时裁剪 + 30s 套接字超时 + 优雅停机闭库
"""

from __future__ import annotations

import atexit
import gzip
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import shutil
import signal
import socket
import sqlite3
import struct
import threading
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PORT = int(os.environ.get("LGJ_PLATFORM_PORT", "8080"))
DATA_DIR = Path(os.environ.get("LGJ_PLATFORM_DATA", "/data"))
DB_PATH = DATA_DIR / "lieguoji.db"
SAVES_DIR = DATA_DIR / "saves"
DOWNLOADS_DIR = DATA_DIR / "downloads"
HOTPACK_DIR = DATA_DIR / "hotpack"
WORKSHOP_DIR = DATA_DIR / "workshop_maps"
SECRET_PATH = DATA_DIR / "admin_secret.txt"

PUBLIC_HOST = os.environ.get("LGJ_PUBLIC_HOST", "111.230.153.235")
COMPUTE_HOST = os.environ.get("LGJ_COMPUTE_HOST", f"{PUBLIC_HOST}:8765")
COMPUTE_PROBE_HOST = os.environ.get("LGJ_COMPUTE_PROBE_HOST", "172.17.0.1")
COMPUTE_PROBE_PORT = int(os.environ.get("LGJ_COMPUTE_PROBE_PORT", "8765"))
SERVER_NAME = os.environ.get("LGJ_SERVER_NAME", "九州一区")
SERVER_REGION = os.environ.get("LGJ_SERVER_REGION", "中国大陆直连")
ADMIN_USERNAMES = {u.strip().lower() for u in os.environ.get("LGJ_ADMIN_USERS", "ethanhui").split(",") if u.strip()}

MAX_SAVE_BYTES = 24 * 1024 * 1024
MAX_WORKSHOP_BODY_BYTES = int(2.5 * 1024 * 1024)
MAX_SAVES_PER_USER = 20
TOKEN_TTL_SECONDS = 90 * 24 * 3600
SHANGHAI_TZ = timezone(timedelta(hours=8))
START_TIME = time.time()

for _d in (DATA_DIR, SAVES_DIR, DOWNLOADS_DIR, HOTPACK_DIR, WORKSHOP_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def load_or_create_admin_secret() -> str:
    env_secret = os.environ.get("LGJ_ADMIN_SECRET", "").strip()
    if env_secret:
        return env_secret
    if SECRET_PATH.exists():
        val = SECRET_PATH.read_text(encoding="utf-8").strip()
        if val:
            return val
    val = secrets.token_urlsafe(32)
    SECRET_PATH.write_text(val + "\n", encoding="utf-8")
    try:
        os.chmod(SECRET_PATH, 0o600)
    except OSError:
        pass
    return val


ADMIN_SECRET = load_or_create_admin_secret()

# ---------------------------------------------------------------------------
# Ranks & Defaults
# ---------------------------------------------------------------------------

RANKS = [
    (0, "白衣史官", "从九品"),
    (30, "兰台令史", "正八品"),
    (80, "著作郎", "从六品"),
    (160, "起居舍人", "正六品"),
    (300, "翰林学士", "正五品"),
    (500, "太史令", "正四品"),
    (800, "国史监修", "正三品"),
    (1200, "一代史圣", "正一品"),
]

DEFAULT_LATEST_VERSION = "9.0.0"
DEFAULT_LATEST_BUILD = 193
DEFAULT_RELEASE_NOTES: list[str] = [
    "【60fps 丝滑拖屏与零卡顿战争特效 × 开局无感直连九州云服】移除拖屏主线程同步等待与离屏蒙版，引入 O(1) GPU 手势快路径；战争特效视锥裁剪与精简 2 层矢量箭头彻底根治混战掉帧；恢复开局 0ms 无感自动直连广州九州云服，新增 1 帧抖动吸收与 0.12s 阻尼惯性滑行，云端行军如本机般丝滑流畅。",
    "【158 条钢铁雄心级历史事件 × 自适应零卡顿事件窗 × 快讯不暂停】12 大剧本历史事件扩充至 158 条（覆盖欧陆 1936/1939、民国 1931、亚太 1941、一战 1914、拿破仑、冷战及古代战国/三国/盛唐/宋金/日本战国）；事件弹窗异步解码零卡顿、弹出即冻结后台 Metal、横竖屏自适应防遮挡并支持「快讯不暂停」顶部播报条。",
    "【HOI4 级 12 剧本精绘地图纠偏 × 原生不可通行「无人之地」 × 现代政体与国策】新增剧本外不可通行「无人之地」（保留真实地形但不可进出占领，日本战国 100% 纯净列岛且北海道为虾夷无人之地，欧陆四剧本北非/冰岛/西亚为无人之地）；全面重烘焙 12 剧本精确版图与沿真实大河划州；实装现代 HOI4 经济/征兵/贸易/体制法案与八大国策焦点并锁死史实路线乱翻政体。",
]

DEFAULT_HOTPATCH_CONFIG: dict[str, Any] = {
    "version": 22,
    "notice": "v9.0.0 丝滑满帧与钢铁雄心级大改版上线：60fps 零卡顿拖屏 · 云服自动秒连顺滑行军 · 158 条史实事件 · 不可通行无人之地 · 12 剧本精确地图与 HOI4 国策",
    "computeHost": COMPUTE_HOST,
    "pace": {"1": 1, "2": 1, "4": 2, "8": 4, "16": 8, "32": 16, "64": 32},
    "tuning": {
        "lethality": 2.35,
        "siege": 7.5,
        "peaceGoalMonths": 4,
        "peaceDecisiveMonths": 6,
        "wearyStart": 12,
        "wearySpan": 24,
        "warRestMonths": 2,
        "warEagerness": 3.4,
        "armiesPerProvince": 2.2,
        "armiesAtHome": 3,
        "armyCap": 900,
        "navyAttackShare": 0.6,
        "openingShips": 3,
        "rebelMinProvinces": 24,
        "calmMonths": 18,
        "unrest": 0.35,
        "smallStateGrit": 0.25,
        "frameTicks": 60,
    },
}


def compute_hotpatch_sha(cfg: dict[str, Any]) -> str:
    raw = json.dumps(cfg, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def build_default_ipa_mirrors(version: str, build: int) -> list[str]:
    v = str(version or DEFAULT_LATEST_VERSION).lstrip("v")
    b = int(build or DEFAULT_LATEST_BUILD)
    fname = f"lieguoji-{v}-build{b}-unsigned.ipa"
    return [
        f"https://gh-proxy.com/https://github.com/Ethanhui6/lieguoji-web/releases/download/v{v}/{fname}",
        f"https://cdn.gh-proxy.org/https://github.com/Ethanhui6/lieguoji-web/releases/download/v{v}/{fname}",
        f"https://edgeone.gh-proxy.com/https://github.com/Ethanhui6/lieguoji-web/releases/download/v{v}/{fname}",
        f"https://gh-proxy.org/https://github.com/Ethanhui6/lieguoji-web/releases/download/v{v}/{fname}",
        f"https://ghfast.top/https://github.com/Ethanhui6/lieguoji-web/releases/download/v{v}/{fname}",
        f"https://github.com/Ethanhui6/lieguoji-web/releases/download/v{v}/{fname}",
        f"http://{PUBLIC_HOST}/downloads/lieguoji-latest.ipa",
    ]


CHANGELOG_HISTORY: list[dict[str, Any]] = [
    {
        "version": DEFAULT_LATEST_VERSION,
        "build": DEFAULT_LATEST_BUILD,
        "date": "2026-11-27",
        "lines": list(DEFAULT_RELEASE_NOTES),
    },
    {
        "version": "8.0.0",
        "build": 192,
        "date": "2026-11-26",
        "lines": [
            "【真实山川河流 × 12 大精绘局部历史战区】实装 73 条真实 WGS-84 大江大河防线与区域禁航边界，1939 欧洲 27 国、1936 欧陆 28 国、1931 民国与 1914 欧洲重制。",
            "【真实历史事件链 × 闪电战学说与名将】开局可选史实锁盟或架空路线，实装八大军事学说与 100% 纯中文地名。",
            "【云服 v14 LGB2+UDP × 2.1GB+ 热更包 v7】LGB2 差量二进制帧直飞 UDP 8767，物理建模重制音画与 25.6K 地形瓦片。",
        ],
    },
    {
        "version": "7.0.0",
        "build": 191,
        "date": "2026-11-26",
        "lines": [
            "【HOI4/历史时代3级地图革命 × 60K/120K 超精网格 × 20K 卫星地貌 GPU 瓦片】全新支持 6 万(1,200 州)与 12 万(2,400 州) Voronoi 高精网格、7 大历史分区 20K 卫星山川与海深 GPU 瓦片金字塔与 64 国自绘工坊 3.0。",
            "【本机 0ms 64× 看海 + 广州 4C4G 云服 v13 二进制+UDP】默认切回本机 0ms 64× 推进，云服升级至 v13（LGB1 二进制帧 + TCP_QUICKACK + UDP 8767 推流）。",
            "【双元首制 × 家族派系纯净 × 真实军事代差 × 1.113 GB 热更包 v6】1943 年前严格禁核、1941 昭和天皇裕仁 + 东条英机双元首与真实日中海陆空科技代差。",
        ],
    },
    {
        "version": "6.0.1",
        "build": 190,
        "date": "2026-11-26",
        "lines": [
            "【热更新提速 50 倍 × 点击即刻秒动 × 五路 206 满速并发】正式上架 GitHub Release hotpack-v5 全量 69 项 229.37 MB 真实地理与五千年史典资产，接入 gh-proxy.com / cdn.gh-proxy.org / gh-proxy.org / EdgeOne 五路 HTTP 206 满速分片并发。",
            "【全界面同步「九州云服 v12」显示】统一行宫链路卡、设置页与管理员司礼监监控页状态文案及动态典藏总包体积显示。",
            "【全面消除界面文字错乱与挤压】优化热更新进度卡、标题页宣纸公告栏与 iPhone 竖屏排版布局。",
        ],
    },
    {
        "version": "6.0.0",
        "build": 189,
        "date": "2026-11-26",
        "lines": [
            "【九州云服 v12 满血 16 Mbps + 五路推流竞速 × 开局零设置自动秒连】计算服升级至 lieguoji-server/v12（16 Mbps 满速带宽、TCP 443/8765/8443 三端口并发竞速、28ms 超低帧间隔、动态 3 帧滑动窗口与 Linux TCP_QUICKACK）；启动即静默预热全线路，进局零设置自动秒连最快专线，轻点延迟胶囊一键诊断重连。",
            "【爽看海 32× 极速推演 × 陆海行军 1.42× 疾行 × 钢铁雄心核战与时代兵制】新增 32× 极速档（约 355 日/秒，1 秒 1 年爽看海），陆海行军全面提速 1.42×、攻城与战损节奏更利落；实装全球紧张度、时代兵制、核反应堆建造、核打击闪光与史实/自由叛乱模式。",
            "【229.37 MB 真实地理与五千年史典热更包 v5（绝不靠图凑数）】新增 Natural Earth 1:10m 全球高精地貌与水文矢量化图集、世界五千年 45 纪元真实历史国界图集（3000 BCE – 2010 CE）及全球 7,342 城双语地理志与历代名将史料全典，支持按模块勾选与多镜像流式断点续传。",
        ],
    },
    {
        "version": "5.8.0",
        "build": 188,
        "date": "2026-11-26",
        "lines": [
            "【切后台返场秒级无感重连 × 告别僵尸连接与二级菜单卡顿】接入全套 iOS 生命周期监听与 1.2 秒硬超时探活（fastProbeRTT），秒级识别后台僵尸套接字并直走 resumeWorld 零上传恢复；同步降低二级菜单后台刷新频率（1.85s）并保持点击瞬时响应。",
            "【极致流畅计算服 v11 × 65%–80% 省流差量疆域帧 × 弱网自适应】升级至 lieguoji-server/v11：新增疆域差量帧（ownersDelta）、事件去重、启动目录预热（跳过 2MB 上传）与 Linux 低延迟防缓冲膨胀 TCP 调优，弱网 4G 下依旧丝滑推进。",
            "【真实历史剧本 × 平台 v6 玩家创意工坊舆图库】上线云端创意工坊 API（上传 / 地区检索 / 点赞 / 下载开局）与本地工坊仓库，完善公元前（BCE）纪年显示，玩家可将自制历史剧本一键分享给全服史官。",
        ],
    },
    {
        "version": "5.7.0",
        "build": 187,
        "date": "2026-11-26",
        "lines": [
            "【中国大陆多源并发满速下载（5+ MB/s）】全新接入 cdn.gh-proxy.org、腾讯云 EdgeOne 专线、gh-proxy.org、gh-proxy.com 与 ghfast.top 国内实测高速镜像，8 路动态工作窃取分块同步聚合 Top 3 节点并发拉取。",
            "【256 KB 真实吞吐测速择优】根治旧版仅测 1 字节延迟（Ping）导致 3 Mbps 源站误胜高速 CDN 的问题；安装包与免换包热更均以 256 KB Range 真实吞吐（MB/s）降序排位，源站严格退居最后兜底。",
            "【免换包热更 12 路多镜像分发】热更引擎全面切换国内高速 RAW 镜像池，12 路并发跨多节点均衡拉取并自动容错切换，严格 SHA256 校验与原子临时文件清理。",
            "【平台 v5 全链路安定加固】服务端新增 SQLite 忙等待与优雅停机闭库、安全限流表定时防泄漏裁剪、30 秒套接字防挂死超时、流式云档读写及客户端 URLSession/FileHandle/DateFormatter 专项审计修复。",
        ],
    },
    {
        "version": "5.6.0",
        "build": 186,
        "date": "2026-11-26",
        "lines": [
            "【满速边缘 CDN 分发】新增 Cloudflare Pages 高速流式代理（/api/cdn/ipa 与 /api/cdn/raw），完整透传 HTTP Range 206，彻底告别 3 Mbps 源站限速。",
            "【8 路并行分块极速更新】客户端内置 8 线程 HTTP Range 分块下载器与实时节点测速择优，支持 1 键切换加速镜像、实时显示 MB/s 速率与断点容错切换。",
            "【12 路自适应热更新引擎】热更新启动前 1.5 秒并行竞速并自动剔除失效 CDN，支持 12 路并发拉取与大文件（≥3 MB）4 路 Range 分片并发校验。",
            "【旧版更新修复 × 实时版本更新志】根治停留在旧版本点击更新无响应的问题，云端实时同步多版本更新志并在客户端与下载页直览。",
        ],
    },
    {
        "version": "5.5.0",
        "build": 185,
        "date": "2026-11-26",
        "lines": [
            "【云端 v8 微步滑动窗口】全链路实行 2 帧滑动窗口背压（MUX_ACK）+ 零锁纯网延迟探针 + 50ms 微步切片，实测纯网延迟压至 25–40 ms。",
            "【军队 20Hz 丝滑滑行 · 点击开始 0ms 响应】修复 O(N²) 补给/合围计算黑洞（提速 50×），大档上传脱离主轴在后台执行，本机零延迟开推后无感热切云端。",
            "【极轻客户端（86 MB → ~40 MB）】将原声配乐与 54 卷传报画幅迁移至云端按需流式缓存，并支持一键在「云端极速推流 / 纯本机算力」间自由切换。",
        ],
    },
    {
        "version": "5.4.0",
        "build": 184,
        "date": "2026-11-26",
        "lines": [
            "【20 MB+ 免换包游戏内热更新】引入 SHA256 精确差分资源引擎，12 套精选历史剧本、典藏美术、词典与平衡规则免换包一键拉取即刻生效。",
            "【御前司礼监管理员中枢】新增游戏内管理员控制台，支持实时发布全服公告、跑马灯通告、全服邮件、平衡参数热更与主机健康监控。",
            "【安全加固】全面收口公开页内部运维信息、新增防暴力破解 IP 封锁与扫描器陷阱。",
        ],
    },
    {
        "version": "5.3.0",
        "build": 183,
        "date": "2026-11-25",
        "lines": [
            "【列国纪云端行宫上线】推出完整史官账号体系（注册 / 登录 / 游客入世 / 转正绑定 / 定制朱砂御印 / 每日临朝签到品秩 / 天下史榜）。",
            "【账号绑定高速云存档】支持单档 24 MB 压缩卷宗跨设备上传、展卷与云端管理，不再依赖临时配对码。",
            "【九州一区 24h 专属云服】国内直连 20–40 ms，自动发现并实时展示服务器健康与在线态势。",
        ],
    },
]


DEFAULT_RELEASE: dict[str, Any] = {
    "latestVersion": DEFAULT_LATEST_VERSION,
    "latestBuild": DEFAULT_LATEST_BUILD,
    "minSupportedBuild": 180,
    "forceUpdate": False,
    "maintenance": False,
    "maintenanceMessage": "九州云服正在例行修缮，稍候片刻即可重登。",
    "releaseDate": "2026-11-27",
    "ipaSizeMB": 44.5,
    "downloadUrl": f"https://github.com/Ethanhui6/lieguoji-web/releases/tag/v{DEFAULT_LATEST_VERSION}",
    "directIpaUrl": build_default_ipa_mirrors(DEFAULT_LATEST_VERSION, DEFAULT_LATEST_BUILD)[0],
    "ipaMirrors": build_default_ipa_mirrors(DEFAULT_LATEST_VERSION, DEFAULT_LATEST_BUILD),
    "webDownloadUrl": f"http://{PUBLIC_HOST}/download",
    "releaseNotes": list(DEFAULT_RELEASE_NOTES),
    "hotpatch": {
        "patchVersion": 22,
        "updatedAt": int(time.time() * 1000),
        "summary": "v9.0.0 丝滑满帧与钢铁雄心级大改版：60fps 零卡顿拖屏 · 云服自动秒连顺滑行军 · 158 条史实事件 · 不可通行无人之地 · 12 剧本精确地图与 HOI4 国策",
        "sha256": compute_hotpatch_sha(DEFAULT_HOTPATCH_CONFIG),
        "config": DEFAULT_HOTPATCH_CONFIG,
    },
}


def now_ms() -> int:
    return int(time.time() * 1000)


def today_shanghai() -> str:
    return datetime.now(SHANGHAI_TZ).strftime("%Y-%m-%d")


def yesterday_shanghai() -> str:
    return (datetime.now(SHANGHAI_TZ) - timedelta(days=1)).strftime("%Y-%m-%d")


def rank_info(exp: int) -> dict[str, Any]:
    cur_idx = 0
    for idx, (need, _, _) in enumerate(RANKS):
        if exp >= need:
            cur_idx = idx
    need, title, grade = RANKS[cur_idx]
    if cur_idx + 1 < len(RANKS):
        next_need, next_title, _ = RANKS[cur_idx + 1]
    else:
        next_need, next_title = need, ""
    return {
        "level": cur_idx + 1,
        "title": title,
        "grade": grade,
        "exp": exp,
        "levelMinExp": need,
        "nextExp": next_need,
        "nextTitle": next_title,
    }


# ---------------------------------------------------------------------------
# Crypto & Security (scrypt + rate limiter + brute-force ban + scanner trap)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    try:
        salt = bytes.fromhex(parts[1])
        expected = bytes.fromhex(parts[2])
    except ValueError:
        return False
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return hmac.compare_digest(dk, expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


_sec_lock = threading.Lock()
_rate_buckets: dict[str, list[float]] = {}
_login_failures: dict[str, list[float]] = {}
_blocked_ips: dict[str, float] = {}
_security_stats = {"blockedRequests": 0, "scannerHits": 0, "loginFailures": 0}
_last_sec_prune: float = 0.0
_SEC_PRUNE_INTERVAL = 60.0
_SEC_MAX_ENTRIES = 2000

SCANNER_PATTERNS = (
    "/.env", "/.git", "/wp-admin", "/wp-login", "/xmlrpc.php", "/phpmyadmin",
    "/pma", "/admin.php", "/actuator", "/cgi-bin", "/config.php", "/vendor/",
    "/shell", "/.htaccess", "/backup.sql", "/eval-stdin"
)


def _prune_security_maps(now: float, force: bool = False) -> None:
    """Must be called while holding _sec_lock. Evicts expired rate/failure/ban entries to prevent unbounded RAM growth."""
    global _last_sec_prune
    total_entries = len(_rate_buckets) + len(_login_failures) + len(_blocked_ips)
    if not force and (now - _last_sec_prune) < _SEC_PRUNE_INTERVAL and total_entries <= _SEC_MAX_ENTRIES:
        return
    _last_sec_prune = now

    for ip in [k for k, until in _blocked_ips.items() if now >= until]:
        _blocked_ips.pop(ip, None)

    for ip in list(_login_failures.keys()):
        fresh = [t for t in _login_failures[ip] if now - t < 300.0]
        if fresh:
            _login_failures[ip] = fresh
        else:
            _login_failures.pop(ip, None)

    for key in list(_rate_buckets.keys()):
        max_age = 600.0 if key.startswith("scan:") else (300.0 if key.startswith(("reg:", "login:", "guest:")) else 60.0)
        fresh = [t for t in _rate_buckets[key] if now - t < max_age]
        if fresh:
            _rate_buckets[key] = fresh
        else:
            _rate_buckets.pop(key, None)

    # Hard safety cap under extreme flood traffic
    hard_cap = _SEC_MAX_ENTRIES * 2
    if len(_rate_buckets) > hard_cap:
        excess = len(_rate_buckets) - _SEC_MAX_ENTRIES
        for key in sorted(_rate_buckets.keys(), key=lambda k: _rate_buckets[k][-1] if _rate_buckets[k] else 0.0)[:excess]:
            _rate_buckets.pop(key, None)
    if len(_login_failures) > hard_cap:
        excess = len(_login_failures) - _SEC_MAX_ENTRIES
        for ip in sorted(_login_failures.keys(), key=lambda k: _login_failures[k][-1] if _login_failures[k] else 0.0)[:excess]:
            _login_failures.pop(ip, None)
    if len(_blocked_ips) > hard_cap:
        excess = len(_blocked_ips) - _SEC_MAX_ENTRIES
        for ip in sorted(_blocked_ips.keys(), key=lambda k: _blocked_ips[k])[:excess]:
            _blocked_ips.pop(ip, None)


def is_ip_blocked(ip: str) -> bool:
    now = time.monotonic()
    with _sec_lock:
        _prune_security_maps(now)
        until = _blocked_ips.get(ip)
        if until is None:
            return False
        if now >= until:
            _blocked_ips.pop(ip, None)
            return False
        _security_stats["blockedRequests"] += 1
        return True


def record_login_failure(ip: str) -> None:
    now = time.monotonic()
    with _sec_lock:
        _prune_security_maps(now)
        _security_stats["loginFailures"] += 1
        arr = [t for t in _login_failures.get(ip, []) if now - t < 300]
        arr.append(now)
        if len(arr) >= 8:
            _blocked_ips[ip] = now + 600
            _login_failures.pop(ip, None)
        else:
            _login_failures[ip] = arr


def record_scanner_hit(ip: str) -> None:
    now = time.monotonic()
    with _sec_lock:
        _prune_security_maps(now)
        _security_stats["scannerHits"] += 1
        arr = [t for t in _rate_buckets.get(f"scan:{ip}", []) if now - t < 600]
        arr.append(now)
        _rate_buckets[f"scan:{ip}"] = arr
        if len(arr) >= 4:
            _blocked_ips[ip] = now + 1800


def check_rate_limit(key: str, limit: int, window_sec: float) -> bool:
    now = time.monotonic()
    with _sec_lock:
        _prune_security_maps(now)
        arr = [t for t in _rate_buckets.get(key, []) if now - t < window_sec]
        if len(arr) >= limit:
            _rate_buckets[key] = arr
            _security_stats["blockedRequests"] += 1
            return False
        arr.append(now)
        _rate_buckets[key] = arr
        return True


# ---------------------------------------------------------------------------
# Database Layer (with safe migrations, busy_timeout & graceful close)
# ---------------------------------------------------------------------------

_db_lock = threading.RLock()
_db_closed = False


def open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    return conn


DB = open_db()


def close_db() -> None:
    global _db_closed
    with _db_lock:
        if _db_closed:
            return
        _db_closed = True
        try:
            DB.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        except Exception:
            pass
        try:
            DB.close()
        except Exception:
            pass


atexit.register(close_db)


def init_db() -> None:
    with _db_lock:
        DB.executescript(
            """
            CREATE TABLE IF NOT EXISTS meta_seq (
                name TEXT PRIMARY KEY,
                val INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                nickname TEXT NOT NULL,
                bio TEXT NOT NULL DEFAULT '观天下大势，记列国兴衰',
                seal_char TEXT NOT NULL DEFAULT '龙',
                seal_style TEXT NOT NULL DEFAULT 'cinnabar',
                role TEXT NOT NULL DEFAULT 'player',
                banned INTEGER NOT NULL DEFAULT 0,
                is_guest INTEGER NOT NULL DEFAULT 0,
                device_id TEXT,
                exp INTEGER NOT NULL DEFAULT 20,
                checkin_streak INTEGER NOT NULL DEFAULT 0,
                total_checkins INTEGER NOT NULL DEFAULT 0,
                last_checkin_date TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                last_login_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_users_device ON users(device_id);
            CREATE INDEX IF NOT EXISTS idx_users_seen ON users(last_seen_at);

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT '',
                app_version TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

            CREATE TABLE IF NOT EXISTS cloud_saves (
                user_id TEXT NOT NULL,
                id TEXT NOT NULL,
                title TEXT NOT NULL,
                date_text TEXT NOT NULL DEFAULT '',
                nations INTEGER NOT NULL DEFAULT 0,
                provinces INTEGER NOT NULL DEFAULT 0,
                day INTEGER NOT NULL DEFAULT 0,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                encoding TEXT NOT NULL DEFAULT 'zlib',
                device TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS leaderboard (
                user_id TEXT PRIMARY KEY,
                world_title TEXT NOT NULL,
                top_nation TEXT NOT NULL,
                provinces_held INTEGER NOT NULL DEFAULT 0,
                total_days INTEGER NOT NULL DEFAULT 0,
                years_elapsed INTEGER NOT NULL DEFAULT 0,
                nations_count INTEGER NOT NULL DEFAULT 0,
                wars_count INTEGER NOT NULL DEFAULT 0,
                wonders_count INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge TEXT NOT NULL DEFAULT '公告',
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS mail (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                sender TEXT NOT NULL DEFAULT '太史院',
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS mail_reads (
                user_id TEXT NOT NULL,
                mail_id INTEGER NOT NULL,
                read_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, mail_id)
            );

            CREATE TABLE IF NOT EXISTS kv_store (
                k TEXT PRIMARY KEY,
                v TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workshop_maps (
                id TEXT PRIMARY KEY,
                author_user_id TEXT DEFAULT '',
                author_name TEXT NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT DEFAULT '',
                region TEXT NOT NULL,
                era_year INTEGER DEFAULT 1,
                era_name TEXT DEFAULT '',
                description TEXT DEFAULT '',
                nation_count INTEGER DEFAULT 0,
                province_count INTEGER DEFAULT 0,
                downloads INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                tags_json TEXT DEFAULT '[]',
                payload_path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_workshop_region ON workshop_maps(region);
            CREATE INDEX IF NOT EXISTS idx_workshop_created ON workshop_maps(created_at DESC);
            """
        )

        # Safe column migration for existing v1 databases
        cols = {r["name"] for r in DB.execute("PRAGMA table_info(users)").fetchall()}
        if "role" not in cols:
            DB.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'")
        if "banned" not in cols:
            DB.execute("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0")

        # Auto-grant admin role to configured admin usernames (ethanhui)
        for admin_u in ADMIN_USERNAMES:
            DB.execute("UPDATE users SET role = 'admin', banned = 0 WHERE LOWER(username) = ?", (admin_u,))

        DB.execute("INSERT OR IGNORE INTO meta_seq(name, val) VALUES ('uid', 10000)")

        row = DB.execute("SELECT v FROM kv_store WHERE k = 'release'").fetchone()
        if not row:
            DB.execute(
                "INSERT INTO kv_store(k, v, updated_at) VALUES ('release', ?, ?)",
                (json.dumps(DEFAULT_RELEASE, ensure_ascii=False), now_ms()),
            )
        else:
            # 服务端随代码发版升级时，若持久化库里的 latestBuild / patchVersion 落后于新版默认值，自动平滑升级推送，
            # 防止旧版数据库残留 6.0.1(190) 导致游戏内收不到 7.0.0(191) 更新推送。
            try:
                stored = json.loads(row["v"])
                if not isinstance(stored, dict):
                    stored = json.loads(json.dumps(DEFAULT_RELEASE))
                changed = False
                stored_build = int(stored.get("latestBuild") or 0)
                if stored_build < DEFAULT_LATEST_BUILD:
                    stored["latestVersion"] = DEFAULT_LATEST_VERSION
                    stored["latestBuild"] = DEFAULT_LATEST_BUILD
                    stored["releaseDate"] = DEFAULT_RELEASE["releaseDate"]
                    stored["ipaSizeMB"] = DEFAULT_RELEASE["ipaSizeMB"]
                    stored["downloadUrl"] = DEFAULT_RELEASE["downloadUrl"]
                    stored["ipaMirrors"] = list(DEFAULT_RELEASE["ipaMirrors"])
                    stored["directIpaUrl"] = DEFAULT_RELEASE["directIpaUrl"]
                    stored["releaseNotes"] = list(DEFAULT_RELEASE_NOTES)
                    changed = True
                stored_hp = stored.get("hotpatch") if isinstance(stored.get("hotpatch"), dict) else {}
                stored_pv = int(stored_hp.get("patchVersion") or 0)
                default_pv = int(DEFAULT_RELEASE["hotpatch"]["patchVersion"])
                if stored_pv < default_pv:
                    stored["hotpatch"] = json.loads(json.dumps(DEFAULT_RELEASE["hotpatch"]))
                    changed = True
                if changed:
                    DB.execute(
                        "UPDATE kv_store SET v = ?, updated_at = ? WHERE k = 'release'",
                        (json.dumps(stored, ensure_ascii=False), now_ms()),
                    )
                    print(
                        f"已自动将持久化发版配置升级至 v{stored['latestVersion']} (Build {stored['latestBuild']}, patch={stored['hotpatch']['patchVersion']})",
                        flush=True,
                    )
            except Exception as exc:
                print(f"升级持久化发版配置失败，保留原值: {exc}", flush=True)

        # 同步将旧版 hotpack_meta (packVersion < 8) 平滑升级至 v8（v9.0 精绘 12 剧本与无人之地热更包）
        hp_row = DB.execute("SELECT v FROM kv_store WHERE k = 'hotpack_meta'").fetchone()
        if hp_row:
            try:
                hp_meta = json.loads(hp_row["v"])
                if int(hp_meta.get("packVersion", 0)) < 8:
                    DB.execute(
                        "UPDATE kv_store SET v = ?, updated_at = ? WHERE k = 'hotpack_meta'",
                        (
                            json.dumps(
                                {
                                    "packVersion": 8,
                                    "releaseTag": "v9.0 · 2.06GB HOI4级精绘地图与无人之地典藏热更包 v8",
                                    "summary": "全量 7 大零水分实装模块：60K/120K 拓扑与 12 大精绘局部历史战区 GIS 国界（含不可通行无人之地）、25.6K z=0..5 真实山川河流 GPU 瓦片金字塔、100% 纯中文 15,000+ 城市与 6,000+ 名将大典、6 时代 84 套兵模、52 幅战史大事件卷轴、48 枚名将肖像徽章与工作室物理建模重制 24 首交响 + 49 条实感拟音",
                                },
                                ensure_ascii=False,
                            ),
                            now_ms(),
                        ),
                    )
            except Exception:
                pass

        cnt = DB.execute("SELECT COUNT(*) AS c FROM announcements").fetchone()["c"]
        if cnt == 0:
            ts = now_ms()
            DB.executemany(
                "INSERT INTO announcements(badge, title, content, pinned, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                [
                    (
                        "置顶",
                        "九州一区极速云服与免换包热更上线",
                        "欢迎各位史官登临《列国纪》云端行宫。\n\n"
                        "• 云端计算引擎已升级至 v7 极速推流架构，280 州史诗大地图推演速度大幅跃升；\n"
                        "• 现已支持 28MB+ 游戏内免换包热更新：12 套新历史剧本、典藏水墨画卷、文明词典与平衡规则均可在游戏内一键热更并立即生效。",
                        1,
                        ts,
                    ),
                ],
            )

        mcnt = DB.execute("SELECT COUNT(*) AS c FROM mail WHERE user_id = '*'").fetchone()["c"]
        if mcnt == 0:
            DB.execute(
                "INSERT INTO mail(user_id, sender, title, content, created_at) VALUES ('*', ?, ?, ?, ?)",
                (
                    "兰台太史院",
                    "恭迎登临《列国纪》云端行宫",
                    "史官钧鉴：\n\n"
                    "《列国纪》云端行宫现已贯通，可定制御印、每日临朝签到、跨端同步云端卷宗，并在游戏内直接获取最新扩展剧本与资源热更。\n\n"
                    "愿君执笔定鼎，山河永固。",
                    now_ms(),
                ),
            )
        DB.commit()


def next_uid() -> str:
    with _db_lock:
        DB.execute("UPDATE meta_seq SET val = val + 1 WHERE name = 'uid'")
        v = DB.execute("SELECT val FROM meta_seq WHERE name = 'uid'").fetchone()["val"]
        return f"LGJ{v}"


def _normalize_release_notes(raw: Any) -> list[str]:
    if isinstance(raw, list):
        out = [str(x).strip().lstrip("•·- ").strip() for x in raw if str(x).strip()]
        return out or list(DEFAULT_RELEASE["releaseNotes"])
    if isinstance(raw, str):
        lines = [ln.strip().lstrip("•·- ").strip() for ln in raw.replace("\r\n", "\n").split("\n") if ln.strip()]
        return lines or list(DEFAULT_RELEASE["releaseNotes"])
    return list(DEFAULT_RELEASE["releaseNotes"])


def get_release_config() -> dict[str, Any]:
    with _db_lock:
        row = DB.execute("SELECT v FROM kv_store WHERE k = 'release'").fetchone()
    cfg = json.loads(row["v"]) if row else json.loads(json.dumps(DEFAULT_RELEASE))
    cfg.setdefault("maintenance", False)
    cfg.setdefault("maintenanceMessage", "九州云服正在例行修缮，稍候片刻即可重登。")
    ver = str(cfg.get("latestVersion") or DEFAULT_RELEASE["latestVersion"])
    build = int(cfg.get("latestBuild") or DEFAULT_RELEASE["latestBuild"])
    cfg["latestVersion"] = ver
    cfg["latestBuild"] = build
    cfg["forceUpdate"] = bool(cfg.get("forceUpdate", False))
    cfg["releaseNotes"] = _normalize_release_notes(cfg.get("releaseNotes"))
    try:
        cfg["ipaSizeMB"] = float(cfg.get("ipaSizeMB") or DEFAULT_RELEASE["ipaSizeMB"])
    except (TypeError, ValueError):
        cfg["ipaSizeMB"] = float(DEFAULT_RELEASE["ipaSizeMB"])
    if not cfg.get("downloadUrl"):
        cfg["downloadUrl"] = f"https://github.com/Ethanhui6/lieguoji-web/releases/tag/v{ver.lstrip('v')}"
    mirrors = cfg.get("ipaMirrors")
    if not isinstance(mirrors, list) or not [m for m in mirrors if isinstance(m, str) and m.strip()]:
        mirrors = build_default_ipa_mirrors(ver, build)
    else:
        mirrors = [
            str(m).strip()
            for m in mirrors
            if isinstance(m, str) and m.strip() and "lieguoji-web.pages.dev" not in str(m).lower()
        ]
        if not mirrors:
            mirrors = build_default_ipa_mirrors(ver, build)
    local_ipa_url = f"http://{PUBLIC_HOST}/downloads/lieguoji-latest.ipa"
    latest_ipa = DOWNLOADS_DIR / "lieguoji-latest.ipa"
    if latest_ipa.exists() and latest_ipa.stat().st_size > 1_000_000:
        if local_ipa_url not in mirrors:
            mirrors.append(local_ipa_url)
        if not cfg.get("ipaSizeMB"):
            cfg["ipaSizeMB"] = round(latest_ipa.stat().st_size / (1024 * 1024), 1)
    cfg["ipaMirrors"] = mirrors
    cur_direct = str(cfg.get("directIpaUrl") or "").strip()
    if not cur_direct or cur_direct == local_ipa_url or "lieguoji-web.pages.dev" in cur_direct.lower():
        # 优先分配中国大陆实测满速主线（兼容旧版本客户端单流直下，避免 3 Mbps 源站限速与失效域名）
        cfg["directIpaUrl"] = mirrors[0] if mirrors else local_ipa_url
    if not cfg.get("webDownloadUrl"):
        cfg["webDownloadUrl"] = f"http://{PUBLIC_HOST}/download"
    return cfg


def save_release_config(cfg: dict[str, Any]) -> None:
    with _db_lock:
        DB.execute(
            "INSERT INTO kv_store(k, v, updated_at) VALUES ('release', ?, ?) "
            "ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at",
            (json.dumps(cfg, ensure_ascii=False), now_ms()),
        )
        DB.commit()


# ---------------------------------------------------------------------------
# HotPack v6 Resource Manifest Engine (1.1+ GB 100%-active HD Meshes, 14K GPU Relief Tiles, 45 Playable Eras, Era Units & Symphonic Audio)
# ---------------------------------------------------------------------------

MODULE_META = {
    "hd-meshes": ("60K / 120K 精绘拓扑与 12 剧本 GIS 国界", "6 万 / 12 万 Voronoi 高精网格、真山川河谷底图及 12 大精绘局部历史战区锁定国界"),
    "relief-tiles": ("25.6K 真实山川河流 GPU 地形瓦片", "7 大历史战区 z=0..5 超清山脉阴影、大河河谷与深海海沟 Metal 流式瓦片金字塔"),
    "encyclopedia": ("100% 纯中文 15,000+ 城市与名将大典", "零英文字母残留的 15,000+ 全球中文城市坐标志与 6,000+ 历代名将传记全典"),
    "era-units": ("6 时代高清雕漆兵模与战舰贴图", "青铜/中古/火药/一战/二战/现代 84 套 1024×1024 Retina 立体兵模与舰船棋子"),
    "event-scrolls": ("52 幅真实历史大事件战史画卷", "德奥合并、慕尼黑、九一八、七七、闪击波兰、瓜分波兰、巴巴罗萨、珍珠港、中途岛等高清古舆插画"),
    "general-portraits": ("48 位真实名将与统帅肖像徽章", "古德里安、朱可夫、山本五十六、薛岳、彭德怀、粟裕、诸葛亮、织田信长、拿破仑等 48 枚金漆圆章"),
    "audio-hd": ("v8 工作室物理建模重制交响与实感拟音", "Karplus-Strong 拨弦与温暖管弦 24 首时代交响 + 49 条有机实感拟音（5.2kHz 丝滑母带）"),
    "eras-45": ("五千年 45 纪元扩展包", "历史扩展掩码（可选旧包）"),
    "gis-basemaps-10m": ("Natural Earth 1:10m 高精地貌图集", "Natural Earth 1:10m 全球高精地貌与水文矢量化图集"),
    "gis-historical-45eras": ("世界五千年 45 纪元历史国界图集", "世界五千年 45 纪元真实历史国界图集（3000 BCE – 2010 CE）"),
    "gis-cities-encyclopedia": ("全球 7,342 城双语地理志与名将全典", "全球 7,342 城双语地理志与历代名将史料全典"),
    "content": ("剧本与史典扩展", "12 套全新历史剧本、典籍题词、列国百科与云端平衡规则"),
    "scenarios": ("历代历史剧本合集", "精选真实历史剧本与战役开局配置"),
    "lore": ("列国史料与典故志", "历代名臣传记、典籍题词与文明史典"),
    "rules": ("云端平衡规则集", "可热更战局平衡参数、时代兵制与核战规则"),
    "catalog": ("文明词典与名将谱", "全文明姓氏、贵族世家、将才特质与物产配置"),
    "world": ("世界底图与文化集", "文明文化目录与宣纸纹理资源"),
    "art": ("工笔水墨美术包", "舆图地标、御印篆章、罗盘与典藏纹样资源"),
    "video": ("传报长卷画幅包", "54 卷全文明历史大事画卷与高清动态海报"),
    "engine": ("推演内核扩展包", "热更兼容内核与脚本桥接包"),
    "audio": ("古风原声与战场音效包", "全文明环境配乐与高保真战场交互音效"),
    "music": ("古风史诗配乐包", "高音质典藏原声配乐与古风交互音效"),
}

HOTPACK_V5_RELEASE_TAG = os.environ.get("LGJ_HOTPACK_V5_RELEASE_TAG", "hotpack-v5")
HOTPACK_V7_RELEASE_TAG = os.environ.get("LGJ_HOTPACK_RELEASE_TAG", "hotpack-v7")
BUNDLED_HOTPACK_V7_MANIFEST = Path(__file__).resolve().parent / "hotpack-v7-manifest.json"
BUNDLED_HOTPACK_V6_MANIFEST = Path(__file__).resolve().parent / "hotpack-v6-manifest.json"

_hotpack_lock = threading.Lock()
_hotpack_cache: Optional[dict[str, Any]] = None


def _get_hotpack_version_meta() -> tuple[int, str, str]:
    with _db_lock:
        row = DB.execute("SELECT v FROM kv_store WHERE k = 'hotpack_meta'").fetchone()
    if row:
        try:
            d = json.loads(row["v"])
            ver = int(d.get("packVersion", 8))
            if ver >= 8:
                return ver, str(d.get("releaseTag", "v9.0 · 2.06GB HOI4级精绘地图与无人之地典藏热更包 v8")), str(d.get("summary", ""))
        except Exception:
            pass
    return (
        8,
        "v9.0 · 2.06GB HOI4级精绘地图与无人之地典藏热更包 v8",
        "全量 7 大零水分实装模块：60K/120K 拓扑与 12 大精绘局部历史战区 GIS 国界（含不可通行无人之地）、25.6K z=0..5 真实山川河流 GPU 瓦片金字塔、100% 纯中文 15,000+ 城市与 6,000+ 名将大典、6 时代 84 套兵模、52 幅战史大事件卷轴、48 枚名将肖像徽章与工作室物理建模重制 24 首交响 + 49 条实感拟音",
    )


def _save_hotpack_version_meta(ver: int, tag: str, summary: str) -> None:
    with _db_lock:
        DB.execute(
            "INSERT INTO kv_store(k, v, updated_at) VALUES ('hotpack_meta', ?, ?) "
            "ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at",
            (json.dumps({"packVersion": ver, "releaseTag": tag, "summary": summary}, ensure_ascii=False), now_ms()),
        )
        DB.commit()


def _resolve_hotpack_module(rel: str) -> str:
    top = rel.split("/", 1)[0].lower() if "/" in rel else "content"
    if top == "hdmeshes":
        return "hd-meshes"
    if top == "relieftiles":
        return "relief-tiles"
    if top == "eras45":
        return "eras-45"
    if top == "encyclopedia":
        return "encyclopedia"
    if top == "eraunits":
        return "era-units"
    if top == "eventscrolls":
        return "event-scrolls"
    if top == "generalportraits":
        return "general-portraits"
    if top == "audiohd":
        return "audio-hd"
    if top in MODULE_META:
        return top
    if top in ("historicalatlas", "atlas", "gis_basemaps", "basemaps"):
        return "gis-basemaps-10m"
    if top in ("gis_historical", "historical_45eras", "eras"):
        return "gis-historical-45eras"
    if top in ("gis_cities", "cities"):
        return "gis-cities-encyclopedia"
    if top in ("sfx", "sound"):
        return "audio"
    return "content"


def _cdn_urls_for_hotpack_rel(rel: str) -> list[str]:
    top, _, rest = rel.partition("/")
    if not rest:
        return []
    quoted_rel = urllib.parse.quote(rel, safe="/")
    direct_download_url = f"http://{PUBLIC_HOST}/api/v1/hotpack/download/{quoted_rel}"
    top_low = top.lower()

    # Hotpack v7 2.1+ GB 全生效七大典藏模块：国内实测最快五路 CDN 并发，零消耗广州 3 Mbps 源站出向带宽
    if top_low in ("hdmeshes", "relieftiles", "encyclopedia", "eraunits", "eventscrolls", "generalportraits", "audiohd"):
        flat_asset = urllib.parse.quote(rel.replace("/", "__"), safe="")
        gh_release_asset = f"https://github.com/Ethanhui6/lieguoji-web/releases/download/{HOTPACK_V7_RELEASE_TAG}/{flat_asset}"
        return [
            f"https://gh-proxy.com/{gh_release_asset}",
            f"https://cdn.gh-proxy.org/{gh_release_asset}",
            f"https://gh-proxy.org/{gh_release_asset}",
            f"https://edgeone.gh-proxy.com/{gh_release_asset}",
            f"https://lieguoji-edge.pages.dev/api/cdn/hotpack/{quoted_rel}",
            gh_release_asset,
            direct_download_url,
        ]

    # Hotpack v5 229+ MB GIS & 5000-Year Atlas modules: 实测最快国内多镜像优先（剔除超时死节点）
    if top_low in ("gis-basemaps-10m", "gis-historical-45eras", "gis-cities-encyclopedia"):
        asset_name = urllib.parse.quote(Path(rel).name, safe="")
        gh_release_asset = f"https://github.com/Ethanhui6/lieguoji-web/releases/download/{HOTPACK_V5_RELEASE_TAG}/{asset_name}"
        return [
            f"https://gh-proxy.com/{gh_release_asset}",
            f"https://cdn.gh-proxy.org/{gh_release_asset}",
            f"https://gh-proxy.org/{gh_release_asset}",
            f"https://edgeone.gh-proxy.com/{gh_release_asset}",
            f"https://lieguoji-edge.pages.dev/api/cdn/hotpack/{quoted_rel}",
            gh_release_asset,
            direct_download_url,
        ]

    if top in ("Music", "Art", "Video", "Engine", "Catalog", "World", "Audio", "HistoricalAtlas"):
        gh_path = f"ios-native/Resources/{rel}"
    elif top_low in ("content", "scenarios", "lore", "rules"):
        gh_path = f"server-deploy/platform/hotpack-content/{rest}" if top_low == "content" else f"server-deploy/platform/hotpack-content/{top_low}/{rest}"
    else:
        return [
            f"https://lieguoji-edge.pages.dev/api/cdn/hotpack/{quoted_rel}",
            direct_download_url,
        ]
    quoted = urllib.parse.quote(gh_path, safe="/")
    return [
        f"https://gh-proxy.com/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main/{quoted}",
        f"https://cdn.gh-proxy.org/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main/{quoted}",
        f"https://gh-proxy.org/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main/{quoted}",
        f"https://edgeone.gh-proxy.com/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main/{quoted}",
        f"https://gcore.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/{quoted}",
        f"https://lieguoji-edge.pages.dev/api/cdn/raw/{quoted}",
        direct_download_url,
    ]


def build_hotpack_manifest(bump_version: bool = False, tag: Optional[str] = None, summary: Optional[str] = None) -> dict[str, Any]:
    return rebuild_hotpack_manifest(bump_version=bump_version, tag=tag, summary=summary)


def rebuild_hotpack_manifest(bump_version: bool = False, tag: Optional[str] = None, summary: Optional[str] = None) -> dict[str, Any]:
    ver, cur_tag, cur_summary = _get_hotpack_version_meta()
    if bump_version:
        ver += 1
    if tag:
        cur_tag = tag
    if summary:
        cur_summary = summary
    if bump_version or tag or summary:
        _save_hotpack_version_meta(ver, cur_tag, cur_summary)

    files: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    mod_acc: dict[str, dict[str, Any]] = {}
    total_bytes = 0

    # 1) 优先载入随服务端打包的权威 2.1GB+ HotPack v7 清单（无需在 40GB/3Mbps 轻量云磁盘冗余存放大包，客户端直走国内 5 路满速 CDN）
    active_bundled_manifest = BUNDLED_HOTPACK_V7_MANIFEST if BUNDLED_HOTPACK_V7_MANIFEST.exists() else BUNDLED_HOTPACK_V6_MANIFEST
    if active_bundled_manifest.exists():
        try:
            bundled = json.loads(active_bundled_manifest.read_text(encoding="utf-8"))
            bver = int(bundled.get("packVersion", 7))
            if bver > ver:
                ver = bver
            if bundled.get("releaseTag") and bver >= 7:
                cur_tag = str(bundled["releaseTag"])
            if bundled.get("summary") and bver >= 7:
                cur_summary = str(bundled["summary"])
            for item in bundled.get("files", []):
                rel = str(item.get("path", "")).strip()
                if not rel or rel in seen_paths:
                    continue
                seen_paths.add(rel)
                mod_id = str(item.get("module") or _resolve_hotpack_module(rel))
                sz = int(item.get("size", 0))
                sha = str(item.get("sha256", ""))
                cdns = item.get("cdnUrls") or _cdn_urls_for_hotpack_rel(rel)
                entry = {"path": rel, "module": mod_id, "size": sz, "sha256": sha}
                if cdns:
                    entry["cdnUrls"] = cdns
                files.append(entry)
                total_bytes += sz
                if mod_id not in mod_acc:
                    name, detail = MODULE_META.get(mod_id, (mod_id, "游戏扩展资源"))
                    mod_acc[mod_id] = {"id": mod_id, "name": name, "detail": detail, "bytes": 0, "fileCount": 0}
                mod_acc[mod_id]["bytes"] += sz
                mod_acc[mod_id]["fileCount"] += 1
        except Exception:
            pass

    # 2) 合并磁盘 /data/hotpack 中的本地增量自定义内容（如管理员热更的 Content/scenarios.json、hot-rules.json 等；跳过旧版未生效的 v5 原始 GeoJSON 目录）
    if HOTPACK_DIR.exists():
        for fp in sorted(HOTPACK_DIR.rglob("*")):
            if not fp.is_file() or fp.name.startswith(".") or fp.suffix.lower() == ".mp4":
                continue
            rel = fp.relative_to(HOTPACK_DIR).as_posix()
            top_low = rel.split("/", 1)[0].lower() if "/" in rel else ""
            if top_low in ("gis-basemaps-10m", "gis-historical-45eras", "gis-cities-encyclopedia"):
                continue
            if rel in seen_paths:
                continue
            seen_paths.add(rel)
            mod_id = _resolve_hotpack_module(rel)
            h = hashlib.sha256()
            sz = 0
            with fp.open("rb") as f:
                while True:
                    chunk = f.read(262144)
                    if not chunk:
                        break
                    h.update(chunk)
                    sz += len(chunk)
            entry: dict[str, Any] = {"path": rel, "module": mod_id, "size": sz, "sha256": h.hexdigest()}
            cdns = _cdn_urls_for_hotpack_rel(rel)
            if cdns:
                entry["cdnUrls"] = cdns
            files.append(entry)
            total_bytes += sz
            if mod_id not in mod_acc:
                name, detail = MODULE_META.get(mod_id, (mod_id, "游戏扩展资源"))
                mod_acc[mod_id] = {"id": mod_id, "name": name, "detail": detail, "bytes": 0, "fileCount": 0}
            mod_acc[mod_id]["bytes"] += sz
            mod_acc[mod_id]["fileCount"] += 1

    order = [
        "hd-meshes",
        "relief-tiles",
        "encyclopedia",
        "era-units",
        "event-scrolls",
        "general-portraits",
        "audio-hd",
        "eras-45",
        "content",
        "scenarios",
        "lore",
        "rules",
        "catalog",
        "world",
        "art",
        "video",
        "engine",
        "audio",
        "music",
    ]
    modules = [mod_acc[k] for k in order if k in mod_acc] + [v for k, v in mod_acc.items() if k not in order]
    manifest = {
        "ok": True,
        "packVersion": ver,
        "releaseTag": cur_tag,
        "summary": cur_summary,
        "totalBytes": total_bytes,
        "updatedAt": now_ms(),
        "modules": modules,
        "files": files,
    }
    with _hotpack_lock:
        global _hotpack_cache
        _hotpack_cache = manifest
    return manifest


def get_hotpack_manifest() -> dict[str, Any]:
    with _hotpack_lock:
        if _hotpack_cache is not None:
            return _hotpack_cache
    return rebuild_hotpack_manifest(bump_version=False)


# ---------------------------------------------------------------------------
# Non-Evicting Compute Server v7 Health Probe (NEVER disconnects live phones!)
# ---------------------------------------------------------------------------

_probe_lock = threading.Lock()
_compute_state: dict[str, Any] = {
    "online": False,
    "rttMs": None,
    "playing": False,
    "stepMs": 0,
    "provinces": 0,
    "clients": 0,
    "checkedAt": 0,
}


def probe_compute_once() -> None:
    targets = [
        (COMPUTE_PROBE_HOST, COMPUTE_PROBE_PORT),
        ("127.0.0.1", COMPUTE_PROBE_PORT),
        (PUBLIC_HOST, COMPUTE_PROBE_PORT),
    ]
    for host, port in targets:
        try:
            t0 = time.perf_counter()
            with socket.create_connection((host, port), timeout=2.0) as s:
                s.settimeout(2.0)
                # CRITICAL: use non-evicting `health` call so active iPhone Mux stream is NEVER interrupted!
                hdr = json.dumps({"call": "health", "args": {"v": 6}}).encode("utf-8")
                s.sendall(struct.pack("!I", len(hdr)) + hdr + struct.pack("!I", 0))
                raw_len = b""
                while len(raw_len) < 4:
                    c = s.recv(4 - len(raw_len))
                    if not c:
                        raise EOFError
                    raw_len += c
                hlen = struct.unpack("!I", raw_len)[0]
                hbuf = b""
                while len(hbuf) < hlen:
                    c = s.recv(hlen - len(hbuf))
                    if not c:
                        raise EOFError
                    hbuf += c
                obj = json.loads(hbuf.decode("utf-8"))
                rtt = max(1, int(round((time.perf_counter() - t0) * 1000)))
                txt = str(obj.get("text", ""))
                kv = {}
                for part in txt.split("|"):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        kv[k] = v
                with _probe_lock:
                    _compute_state["online"] = bool(obj.get("ok"))
                    _compute_state["rttMs"] = rtt
                    _compute_state["playing"] = kv.get("playing") == "1"
                    _compute_state["stepMs"] = int(kv.get("stepMs", "0") or "0")
                    _compute_state["provinces"] = int(kv.get("provinces", "0") or "0")
                    _compute_state["clients"] = int(kv.get("clients", "0") or "0")
                    _compute_state["checkedAt"] = now_ms()
                return
        except Exception:
            continue
    with _probe_lock:
        _compute_state["online"] = False
        _compute_state["rttMs"] = None
        _compute_state["checkedAt"] = now_ms()


_shutdown_event = threading.Event()


def start_probe_thread() -> None:
    def loop() -> None:
        while not _shutdown_event.is_set():
            probe_compute_once()
            _shutdown_event.wait(20)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def get_host_metrics() -> dict[str, Any]:
    load1 = 0.0
    try:
        load1 = float(Path("/proc/loadavg").read_text().split()[0])
    except Exception:
        pass
    mem_total_mb, mem_avail_mb = 0, 0
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                mem_total_mb = int(line.split()[1]) // 1024
            elif line.startswith("MemAvailable:"):
                mem_avail_mb = int(line.split()[1]) // 1024
    except Exception:
        pass
    du = shutil.disk_usage(str(DATA_DIR))
    return {
        "cpuLoad1m": round(load1, 2),
        "memUsedMB": max(0, mem_total_mb - mem_avail_mb),
        "memTotalMB": mem_total_mb,
        "diskFreeGB": round(du.free / (1024 ** 3), 1),
        "diskTotalGB": round(du.total / (1024 ** 3), 1),
    }


def get_public_server_snapshot() -> dict[str, Any]:
    cutoff = now_ms() - 5 * 60 * 1000
    with _db_lock:
        online_users = DB.execute("SELECT COUNT(*) AS c FROM users WHERE last_seen_at >= ?", (cutoff,)).fetchone()["c"]
    with _probe_lock:
        c_online = _compute_state["online"]
    rel = get_release_config()
    return {
        "name": SERVER_NAME,
        "region": SERVER_REGION,
        "computeHost": COMPUTE_HOST,
        "computeOnline": c_online,
        "onlineCount": max(1, int(online_users)),
        "maintenance": bool(rel.get("maintenance", False)),
        "maintenanceMessage": str(rel.get("maintenanceMessage", "")),
        "serverTimeMs": now_ms(),
    }


def get_admin_server_overview() -> dict[str, Any]:
    cutoff = now_ms() - 5 * 60 * 1000
    with _db_lock:
        online_users = DB.execute("SELECT COUNT(*) AS c FROM users WHERE last_seen_at >= ?", (cutoff,)).fetchone()["c"]
        total_users = DB.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        total_saves = DB.execute("SELECT COUNT(*) AS c FROM cloud_saves").fetchone()["c"]
        banned_users = DB.execute("SELECT COUNT(*) AS c FROM users WHERE banned = 1").fetchone()["c"]
    with _probe_lock:
        cs = dict(_compute_state)
    with _sec_lock:
        _prune_security_maps(time.monotonic(), force=True)
        sec = dict(_security_stats)
        sec["activeBlockedIPs"] = len(_blocked_ips)
    rel = get_release_config()
    hp = get_hotpack_manifest()
    return {
        "name": SERVER_NAME,
        "region": SERVER_REGION,
        "onlineCount": max(1, int(online_users)),
        "totalUsers": int(total_users),
        "totalSaves": int(total_saves),
        "bannedUsers": int(banned_users),
        "uptimeSeconds": int(time.time() - START_TIME),
        "compute": cs,
        "host": get_host_metrics(),
        "security": sec,
        "maintenance": bool(rel.get("maintenance", False)),
        "maintenanceMessage": str(rel.get("maintenanceMessage", "")),
        "hotpackVersion": hp["packVersion"],
        "hotpackBytes": hp["totalBytes"],
        "hotpackFiles": len(hp["files"]),
        "notice": str(rel.get("hotpatch", {}).get("config", {}).get("notice", "")),
        "latestVersion": rel.get("latestVersion", DEFAULT_LATEST_VERSION),
        "latestBuild": int(rel.get("latestBuild", DEFAULT_LATEST_BUILD)),
        "forceUpdate": bool(rel.get("forceUpdate", False)),
        "tuning": rel.get("hotpatch", {}).get("config", {}).get("tuning", {}),
        "pace": rel.get("hotpatch", {}).get("config", {}).get("pace", {}),
    }


# ---------------------------------------------------------------------------
# User Serialization & Auth
# ---------------------------------------------------------------------------

def serialize_user(row: sqlite3.Row) -> dict[str, Any]:
    uid = row["id"]
    with _db_lock:
        save_count = DB.execute("SELECT COUNT(*) AS c FROM cloud_saves WHERE user_id = ?", (uid,)).fetchone()["c"]
        unread_mail = DB.execute(
            """
            SELECT COUNT(*) AS c FROM mail m
            WHERE (m.user_id = ? OR m.user_id = '*')
              AND NOT EXISTS (SELECT 1 FROM mail_reads r WHERE r.user_id = ? AND r.mail_id = m.id)
            """,
            (uid, uid),
        ).fetchone()["c"]
    today = today_shanghai()
    checked_in = row["last_checkin_date"] == today
    rk = rank_info(int(row["exp"]))
    role = str(row["role"] or "player")
    return {
        "id": uid,
        "username": row["username"] or "",
        "nickname": row["nickname"],
        "bio": row["bio"],
        "sealChar": row["seal_char"],
        "sealStyle": row["seal_style"],
        "role": role,
        "isAdmin": role == "admin",
        "isGuest": bool(row["is_guest"]),
        "exp": int(row["exp"]),
        "rank": rk,
        "checkinStreak": int(row["checkin_streak"]),
        "totalCheckins": int(row["total_checkins"]),
        "checkedInToday": checked_in,
        "cloudSaveCount": int(save_count),
        "cloudSaveQuota": MAX_SAVES_PER_USER,
        "unreadMailCount": int(unread_mail),
        "createdAt": int(row["created_at"]),
    }


def create_session(user_id: str, device_name: str, app_version: str) -> str:
    token = "lgj_" + secrets.token_urlsafe(36)
    ts = now_ms()
    with _db_lock:
        DB.execute(
            "INSERT INTO sessions(token_hash, user_id, device_name, app_version, created_at, expires_at, last_used_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (hash_token(token), user_id, device_name[:80], app_version[:32], ts, ts + TOKEN_TTL_SECONDS * 1000, ts),
        )
        DB.execute("UPDATE users SET last_login_at = ?, last_seen_at = ? WHERE id = ?", (ts, ts, user_id))
        DB.commit()
    return token


def authenticate_token(auth_header: Optional[str]) -> Optional[tuple[sqlite3.Row, str]]:
    if not auth_header:
        return None
    parts = auth_header.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    th = hash_token(token)
    ts = now_ms()
    with _db_lock:
        row = DB.execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0
            """,
            (th, ts),
        ).fetchone()
        if row:
            DB.execute("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?", (ts, th))
            DB.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (ts, row["id"]))
            DB.commit()
            return row, th
    return None


def validate_username(u: str) -> Optional[str]:
    if len(u) < 3 or len(u) > 20:
        return "账号名须为 3–20 位字母、数字或中文"
    if not re.match(r"^[A-Za-z0-9_\u4e00-\u9fff]+$", u):
        return "账号名仅支持中文、字母、数字或下划线"
    return None


def sanitize_seal_char(ch: str) -> str:
    ch = ch.strip()
    return ch[0] if ch else "龙"


def sanitize_seal_style(style: str) -> str:
    return style if style in ("cinnabar", "jade", "gold") else "cinnabar"


def compare_version(cur_ver: str, cur_build: int, latest_ver: str, latest_build: int) -> bool:
    if latest_build > 0 and cur_build > 0 and latest_build != cur_build:
        return latest_build > cur_build
    def parse(v: str) -> tuple[int, ...]:
        nums = re.findall(r"\d+", v)
        return tuple(int(x) for x in nums) if nums else (0,)
    return parse(latest_ver) > parse(cur_ver)


# ---------------------------------------------------------------------------
# Hardened Minimalist Public Landing Page (ZERO internal/ops info exposed)
# ---------------------------------------------------------------------------

def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def render_public_landing_page() -> str:
    rel = get_release_config()
    ver = str(rel.get("latestVersion", DEFAULT_LATEST_VERSION)).lstrip("v")
    build = _safe_int(rel.get("latestBuild", DEFAULT_LATEST_BUILD), DEFAULT_LATEST_BUILD)
    rel_date = html.escape(str(rel.get("releaseDate", "")))
    size_mb = rel.get("ipaSizeMB", 42.7)
    fname = f"lieguoji-{ver}-build{build}-unsigned.ipa"
    gh_asset = f"https://github.com/Ethanhui6/lieguoji-web/releases/download/v{ver}/{fname}"

    primary_url = f"https://cdn.gh-proxy.org/{gh_asset}"
    edgeone_url = f"https://edgeone.gh-proxy.com/{gh_asset}"
    mirror_b_url = f"https://gh-proxy.org/{gh_asset}"
    cf_overseas_url = f"https://lieguoji-edge.pages.dev/api/cdn/ipa/v{ver}/{fname}"
    origin_fallback_url = "/downloads/lieguoji-latest.ipa"
    gh_release_url = str(rel.get("downloadUrl") or "https://github.com/Ethanhui6/lieguoji-web/releases/latest")

    notes_html = "".join(f"<li>{html.escape(str(n))}</li>" for n in rel.get("releaseNotes", [])[:5])
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>列国纪 · 架空世界列国兴衰</title>
<style>
  :root {{
    --paper: #F5F0E6; --paper2: #FAF7F0; --ink: #241D17; --ink2: #5E564E;
    --seal: #A83226; --jade: #2E6B56; --line: rgba(36,29,23,0.11);
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 36px 20px 56px; background: var(--paper); color: var(--ink);
    font-family: "Kaiti SC", "STKaiti", "Songti SC", "PingFang SC", serif;
    line-height: 1.75; -webkit-font-smoothing: antialiased;
  }}
  .wrap {{ max-width: 540px; margin: 0 auto; }}
  .head {{ display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid var(--line); }}
  .title {{ font-size: 32px; letter-spacing: 8px; margin: 0; font-weight: 400; }}
  .sub {{ font-size: 13.5px; color: var(--ink2); letter-spacing: 2px; margin-top: 4px; }}
  .seal {{
    width: 42px; height: 42px; border: 1.8px solid var(--seal); border-radius: 6px;
    color: var(--seal); display: flex; align-items: center; justify-content: center;
    font-size: 21px; transform: rotate(-4deg); flex-shrink: 0;
  }}
  .hero {{ padding: 24px 0; border-bottom: 1px solid var(--line); }}
  .meta {{ font-size: 13px; color: var(--ink2); margin-bottom: 16px; }}
  .meta strong {{ color: var(--seal); font-weight: 400; }}
  .btn {{
    display: block; width: 100%; text-align: center; text-decoration: none;
    background: var(--seal); color: var(--paper2); padding: 14px 18px; border-radius: 8px;
    font-size: 16px; letter-spacing: 1.5px;
  }}
  .btn-sub {{ display: block; font-size: 12px; opacity: 0.9; letter-spacing: 0.5px; margin-top: 2px; }}
  .mirrors-title {{ font-size: 13px; color: var(--ink2); margin: 16px 0 8px; letter-spacing: 1px; }}
  .mirror-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
  .mirror-card {{
    display: block; text-decoration: none; background: var(--paper2); color: var(--ink);
    border: 1px solid var(--line); border-radius: 8px; padding: 11px 12px;
  }}
  .mirror-name {{ font-size: 14px; color: var(--ink); display: block; }}
  .mirror-tag {{ font-size: 11.5px; color: var(--jade); display: block; margin-top: 2px; }}
  .mirror-tag.muted {{ color: var(--ink2); }}
  .btn.sec {{
    background: var(--paper2); color: var(--ink); border: 1px solid var(--line);
    font-size: 13px; padding: 10px; margin-top: 12px; letter-spacing: 1px;
  }}
  .sec-block {{ padding: 22px 0; border-bottom: 1px solid var(--line); }}
  .sec-title {{ font-size: 16px; letter-spacing: 2px; margin: 0 0 12px; color: var(--ink); }}
  ul {{ padding-left: 18px; margin: 0; color: var(--ink2); font-size: 14px; }}
  li {{ margin-bottom: 9px; }}
  .foot {{ text-align: center; font-size: 12px; color: var(--ink2); margin-top: 26px; opacity: 0.78; letter-spacing: 1px; }}
</style>
</head>
<body>
  <main class="wrap">
    <header class="head">
      <div>
        <h1 class="title">列國紀</h1>
        <div class="sub">架空世界 · 列国兴衰</div>
      </div>
      <div class="seal" aria-hidden="true">龙</div>
    </header>
    <section class="hero">
      <div class="meta">当前版本 <strong>v{html.escape(ver)}</strong> · {size_mb} MB · {rel_date} · 国内多源 8 路并发满速下载</div>
      <a class="btn" href="{html.escape(primary_url)}">
        国内高速主线 A 满速下载（推荐）
        <span class="btn-sub">中国大陆直连实测 5+ MB/s · 支持多线程断点续传</span>
      </a>
      <div class="mirrors-title">一键切换备用加速节点</div>
      <div class="mirror-grid">
        <a class="mirror-card" href="{html.escape(edgeone_url)}">
          <span class="mirror-name">EdgeOne 专线</span>
          <span class="mirror-tag">国内高速 · 3.7+ MB/s</span>
        </a>
        <a class="mirror-card" href="{html.escape(mirror_b_url)}">
          <span class="mirror-name">极速主线 B</span>
          <span class="mirror-tag">国内直连镜像</span>
        </a>
        <a class="mirror-card" href="{html.escape(cf_overseas_url)}">
          <span class="mirror-name">Cloudflare 海外</span>
          <span class="mirror-tag muted">海外网络首选</span>
        </a>
        <a class="mirror-card" href="{html.escape(origin_fallback_url)}">
          <span class="mirror-name">源站兜底</span>
          <span class="mirror-tag muted">备用稳定直链</span>
        </a>
      </div>
      <a class="btn sec" href="{html.escape(gh_release_url)}">查看 GitHub Releases 发布页</a>
    </section>
    <section class="sec-block">
      <h2 class="sec-title">本版更新志</h2>
      <ul>{notes_html}</ul>
    </section>
    <footer class="foot">列国纪 · 安装后进入游戏自动同步最新剧本与资源</footer>
  </main>
</body>
</html>"""


# ---------------------------------------------------------------------------
# HTTP Request Handler (Hardened + Admin + HotPack)
# ---------------------------------------------------------------------------

_WORKSHOP_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{3,64}$")


def serialize_workshop_map(row: sqlite3.Row) -> dict[str, Any]:
    try:
        raw_tags = json.loads(row["tags_json"] or "[]")
        tags = [str(t).strip()[:20] for t in raw_tags if str(t).strip()][:12] if isinstance(raw_tags, list) else []
    except Exception:
        tags = []
    return {
        "id": str(row["id"]),
        "title": str(row["title"]),
        "subtitle": str(row["subtitle"] or ""),
        "authorName": str(row["author_name"]),
        "region": str(row["region"]),
        "eraYear": int(row["era_year"]),
        "eraName": str(row["era_name"] or ""),
        "description": str(row["description"] or ""),
        "nationCount": int(row["nation_count"]),
        "provinceCount": int(row["province_count"]),
        "downloads": int(row["downloads"]),
        "likes": int(row["likes"]),
        "tags": tags,
        "createdAt": int(row["created_at"]),
    }


class PlatformHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Lieguoji"
    sys_version = ""
    timeout = 30.0
    _body_consumed = False

    def setup(self) -> None:
        super().setup()
        self.request.settimeout(30.0)

    def handle_one_request(self) -> None:
        self._body_consumed = False
        super().handle_one_request()

    def _drain_unread_body(self) -> None:
        if self._body_consumed:
            return
        self._body_consumed = True
        try:
            cl = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            cl = 0
        if 0 < cl <= MAX_SAVE_BYTES + 65536:
            remaining = cl
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)

    def _security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{datetime.now(SHANGHAI_TZ).strftime('%H:%M:%S')}] {self.client_address[0]} {fmt % args}", flush=True)

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        self._drain_unread_body()
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._security_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def send_html(self, body: str, status: int = 200) -> None:
        self._drain_unread_body()
        raw = body.encode("utf-8")
        self.send_response(status)
        self._security_headers()
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(raw)

    def _precheck(self, path: str) -> bool:
        ip = self.client_address[0]
        if is_ip_blocked(ip):
            self.send_json({"ok": False, "error": "请求过于频繁，请稍后再试"}, 429)
            return False
        low = path.lower()
        if any(pat in low for pat in SCANNER_PATTERNS):
            record_scanner_hit(ip)
            self.send_json({"ok": False, "error": "Not Found"}, 404)
            return False
        if not check_rate_limit(f"req:{ip}", 900, 60):
            self.send_json({"ok": False, "error": "请求频率受限，请稍候"}, 429)
            return False
        return True

    def read_json_body(self, max_bytes: int = 512 * 1024) -> Optional[dict[str, Any]]:
        self._body_consumed = True
        try:
            cl = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self.send_json({"ok": False, "error": "无效的请求长度"}, 400)
            return None
        if cl <= 0:
            return {}
        if cl > max_bytes:
            self.send_json({"ok": False, "error": "请求体积过大"}, 413)
            return None
        raw = self.rfile.read(cl)
        try:
            obj = json.loads(raw.decode("utf-8"))
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
        self.send_json({"ok": False, "error": "请求格式无效"}, 400)
        return None

    def require_auth(self) -> Optional[tuple[sqlite3.Row, str]]:
        res = authenticate_token(self.headers.get("Authorization"))
        if not res:
            self.send_json({"ok": False, "error": "登录状态已失效，请重新登临"}, 401)
            return None
        return res

    def _is_admin_request(self) -> bool:
        key = (self.headers.get("X-Admin-Key") or "").strip()
        if key and hmac.compare_digest(key, ADMIN_SECRET):
            return True
        auth = authenticate_token(self.headers.get("Authorization"))
        if auth and str(auth[0]["role"]) == "admin" and int(auth[0]["banned"]) == 0:
            return True
        return False

    def require_admin(self) -> bool:
        if self._is_admin_request():
            return True
        self.send_json({"ok": False, "error": "需管理员权限"}, 403)
        return False

    def do_HEAD(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if not self._precheck(path):
            return
        if path.startswith("/downloads/"):
            safe = Path(path[len("/downloads/"):]).name
            target = DOWNLOADS_DIR / safe
            if safe and safe == path[len("/downloads/"):] and target.exists() and target.is_file():
                self.send_response(200)
                self._security_headers()
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f'attachment; filename="{safe}"')
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(target.stat().st_size))
                self.end_headers()
                return
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path.startswith("/api/v1/hotpack/download/"):
            rel_path = urllib.parse.unquote(path[len("/api/v1/hotpack/download/"):])
            self.handle_hotpack_file(rel_path, head_only=True)
            return
        if path.startswith("/api/v1/hotpack/file/"):
            rel_path = urllib.parse.unquote(path[len("/api/v1/hotpack/file/"):])
            self.handle_hotpack_file(rel_path, head_only=True)
            return
        self.send_response(200)
        self._security_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._security_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ----------------------------- GET -----------------------------

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if not self._precheck(path):
            return
        qs = urllib.parse.parse_qs(parsed.query)

        if path in ("/", "/download"):
            self.send_html(render_public_landing_page())
            return

        if path.startswith("/downloads/"):
            self.handle_download_file(path[len("/downloads/"):])
            return

        if path == "/api/v1/ping":
            self.send_json({"ok": True, "ts": now_ms()})
            return

        if path == "/api/v1/server/status":
            self.send_json({"ok": True, "server": get_public_server_snapshot()})
            return

        if path in ("/api/v1/bootstrap", "/api/v1/version"):
            self.handle_bootstrap(qs)
            return

        if path == "/api/v1/changelog":
            self.send_json({"ok": True, "changelog": CHANGELOG_HISTORY})
            return

        if path == "/api/v1/hotpatch":
            rel = get_release_config()
            self.send_json({"ok": True, "hotpatch": rel.get("hotpatch", {})})
            return

        if path == "/api/v1/hotpack/manifest":
            self.send_json(get_hotpack_manifest())
            return

        if path.startswith("/api/v1/hotpack/download/"):
            rel_path = urllib.parse.unquote(path[len("/api/v1/hotpack/download/"):])
            self.handle_hotpack_file(rel_path)
            return

        if path.startswith("/api/v1/hotpack/file/"):
            rel_path = urllib.parse.unquote(path[len("/api/v1/hotpack/file/"):])
            self.handle_hotpack_file(rel_path)
            return

        if path == "/api/v1/announcements":
            self.handle_announcements()
            return

        if path == "/api/v1/auth/me":
            auth = self.require_auth()
            if not auth:
                return
            self.send_json({"ok": True, "user": serialize_user(auth[0])})
            return

        if path == "/api/v1/inbox":
            auth = self.require_auth()
            if not auth:
                return
            self.handle_inbox(auth[0]["id"])
            return

        if path == "/api/v1/leaderboard":
            category = (qs.get("category", ["provinces"])[0] or "provinces").strip()
            self.handle_leaderboard(category)
            return

        if path == "/api/v1/maps":
            self.handle_workshop_list(qs)
            return

        if path.startswith("/api/v1/maps/"):
            map_id = urllib.parse.unquote(path[len("/api/v1/maps/"):])
            self.handle_workshop_get(map_id)
            return

        if path == "/api/v1/saves":
            auth = self.require_auth()
            if not auth:
                return
            self.handle_saves_list(auth[0]["id"])
            return

        if path.startswith("/api/v1/saves/"):
            auth = self.require_auth()
            if not auth:
                return
            save_id = urllib.parse.unquote(path[len("/api/v1/saves/"):])
            self.handle_save_download(auth[0]["id"], save_id)
            return

        # --- Admin GET routes (strictly require admin role or secret) ---
        if path == "/api/v1/admin/overview":
            if not self.require_admin():
                return
            self.send_json({"ok": True, "overview": get_admin_server_overview()})
            return

        if path == "/api/v1/admin/users":
            if not self.require_admin():
                return
            q = (qs.get("q", [""])[0] or "").strip()
            self.handle_admin_users(q)
            return

        if path == "/api/v1/admin/announcements":
            if not self.require_admin():
                return
            self.handle_admin_announcements_list()
            return

        self.send_json({"ok": False, "error": "Not Found"}, 404)

    # ----------------------------- POST -----------------------------

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if not self._precheck(path):
            return

        if path == "/api/v1/auth/register":
            self.handle_register()
            return
        if path == "/api/v1/auth/login":
            self.handle_login()
            return
        if path == "/api/v1/auth/guest":
            self.handle_guest()
            return
        if path == "/api/v1/auth/bind":
            self.handle_bind_guest()
            return
        if path == "/api/v1/auth/logout":
            self.handle_logout()
            return
        if path == "/api/v1/auth/profile":
            self.handle_update_profile()
            return
        if path == "/api/v1/checkin":
            self.handle_checkin()
            return
        if path == "/api/v1/heartbeat":
            self.handle_heartbeat()
            return
        if path == "/api/v1/maps/upload":
            self.handle_workshop_upload()
            return
        if path.startswith("/api/v1/maps/") and path.endswith("/like"):
            map_id = urllib.parse.unquote(path[len("/api/v1/maps/"):-len("/like")])
            self.handle_workshop_like(map_id)
            return
        if path == "/api/v1/stats/report":
            self.handle_stats_report()
            return
        if path.startswith("/api/v1/inbox/") and path.endswith("/read"):
            auth = self.require_auth()
            if not auth:
                return
            mid_str = path[len("/api/v1/inbox/"):-len("/read")]
            if mid_str.isdigit():
                with _db_lock:
                    DB.execute(
                        "INSERT OR IGNORE INTO mail_reads(user_id, mail_id, read_at) VALUES (?, ?, ?)",
                        (auth[0]["id"], int(mid_str), now_ms()),
                    )
                    DB.commit()
            self.send_json({"ok": True})
            return

        # --- Admin POST routes ---
        if path == "/api/v1/admin/release":
            self.handle_admin_release()
            return
        if path == "/api/v1/admin/notice":
            self.handle_admin_notice()
            return
        if path == "/api/v1/admin/tuning":
            self.handle_admin_tuning()
            return
        if path == "/api/v1/admin/announcement":
            self.handle_admin_announcement()
            return
        if path == "/api/v1/admin/mail":
            self.handle_admin_mail()
            return
        if path == "/api/v1/admin/hotpack/bump":
            self.handle_admin_hotpack_bump()
            return
        if path.startswith("/api/v1/admin/users/"):
            uid = urllib.parse.unquote(path[len("/api/v1/admin/users/"):])
            self.handle_admin_edit_user(uid)
            return

        self.send_json({"ok": False, "error": "Not Found"}, 404)

    # ----------------------------- PATCH / PUT / DELETE -----------------------------

    def do_PATCH(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if not self._precheck(path):
            return
        if path == "/api/v1/auth/profile":
            self.handle_update_profile()
            return
        self.send_json({"ok": False, "error": "Not Found"}, 404)

    def do_PUT(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if not self._precheck(path):
            return
        if path.startswith("/api/v1/saves/"):
            auth = self.require_auth()
            if not auth:
                return
            save_id = urllib.parse.unquote(path[len("/api/v1/saves/"):])
            self.handle_save_upload(auth[0]["id"], save_id)
            return
        self.send_json({"ok": False, "error": "Not Found"}, 404)

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if not self._precheck(path):
            return
        if path.startswith("/api/v1/maps/"):
            map_id = urllib.parse.unquote(path[len("/api/v1/maps/"):])
            self.handle_workshop_delete(map_id)
            return
        if path.startswith("/api/v1/saves/"):
            auth = self.require_auth()
            if not auth:
                return
            save_id = urllib.parse.unquote(path[len("/api/v1/saves/"):])
            self.handle_save_delete(auth[0]["id"], save_id)
            return
        if path.startswith("/api/v1/admin/announcement/"):
            if not self.require_admin():
                return
            aid = path[len("/api/v1/admin/announcement/"):]
            if aid.isdigit():
                with _db_lock:
                    DB.execute("DELETE FROM announcements WHERE id = ?", (int(aid),))
                    DB.commit()
            self.send_json({"ok": True})
            return
        self.send_json({"ok": False, "error": "Not Found"}, 404)

    # ----------------------------- File & HotPack Handlers -----------------------------

    def handle_download_file(self, rel_name: str) -> None:
        safe = Path(rel_name).name
        if not safe or safe != rel_name or safe.startswith("."):
            self.send_json({"ok": False, "error": "非法文件名"}, 400)
            return
        target = DOWNLOADS_DIR / safe
        if not target.exists() or not target.is_file():
            self.send_json({"ok": False, "error": "文件不存在"}, 404)
            return
        size = target.stat().st_size
        start, end, status = 0, max(0, size - 1), 200
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes=") and size > 0:
            try:
                s_str, e_str = rng[6:].split(",")[0].strip().split("-", 1)
                if s_str:
                    start = int(s_str)
                if e_str:
                    end = min(size - 1, int(e_str))
                if 0 <= start <= end < size:
                    status = 206
                else:
                    start, end, status = 0, size - 1, 200
            except Exception:
                start, end, status = 0, size - 1, 200
        length = (end - start + 1) if size > 0 else 0
        self.send_response(status)
        self._security_headers()
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{safe}"')
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if length <= 0:
            return
        try:
            with target.open("rb") as f:
                f.seek(start)
                rem = length
                while rem > 0:
                    chunk = f.read(min(256 * 1024, rem))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    rem -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, TimeoutError, socket.timeout):
            self.close_connection = True

    def handle_hotpack_file(self, rel_path: str, head_only: bool = False) -> None:
        if not rel_path or ".." in rel_path or rel_path.startswith("/"):
            if head_only:
                self.send_response(400)
                self._security_headers()
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self.send_json({"ok": False, "error": "非法路径"}, 400)
            return
        try:
            root = HOTPACK_DIR.resolve()
            target = (HOTPACK_DIR / rel_path).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                if head_only:
                    self.send_response(404)
                    self._security_headers()
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                else:
                    self.send_json({"ok": False, "error": "资源不存在"}, 404)
                return
        except Exception:
            if head_only:
                self.send_response(400)
                self._security_headers()
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self.send_json({"ok": False, "error": "非法路径"}, 400)
            return
        size = target.stat().st_size
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes=") and size > 0:
            try:
                spec = rng[6:].split(",")[0].strip()
                s_str, e_str = spec.split("-", 1)
                if not s_str and e_str:
                    suffix = int(e_str)
                    start = max(0, size - suffix)
                    end = size - 1
                else:
                    start = int(s_str) if s_str else 0
                    end = min(size - 1, int(e_str)) if e_str else size - 1
                if 0 <= start <= end < size:
                    length = end - start + 1
                    self.send_response(206)
                    self._security_headers()
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.send_header("Connection", "keep-alive")
                    self.end_headers()
                    if head_only:
                        return
                    try:
                        with target.open("rb") as f:
                            f.seek(start)
                            rem = length
                            while rem > 0:
                                chunk = f.read(min(256 * 1024, rem))
                                if not chunk:
                                    break
                                self.wfile.write(chunk)
                                rem -= len(chunk)
                    except (BrokenPipeError, ConnectionResetError, TimeoutError, socket.timeout):
                        self.close_connection = True
                    return
            except Exception:
                pass
        accept_enc = (self.headers.get("Accept-Encoding") or "").lower()
        compressible = target.suffix.lower() in (".json", ".geojson", ".js", ".html", ".css", ".txt", ".svg")
        use_gzip = (not head_only) and compressible and "gzip" in accept_enc and 512 <= size <= 48 * 1024 * 1024
        if use_gzip:
            with target.open("rb") as f:
                payload = gzip.compress(f.read(), compresslevel=6)
            self.send_response(200)
            self._security_headers()
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError, TimeoutError, socket.timeout):
                self.close_connection = True
            return

        self.send_response(200)
        self._security_headers()
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        if head_only:
            return
        try:
            with target.open("rb") as f:
                while True:
                    chunk = f.read(256 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, TimeoutError, socket.timeout):
            self.close_connection = True

    # ----------------------------- Public Game APIs -----------------------------

    def handle_bootstrap(self, qs: dict[str, list[str]]) -> None:
        cur_ver = (qs.get("version", ["0.0.0"])[0] or "0.0.0").strip()
        try:
            cur_build = int(qs.get("build", ["0"])[0] or "0")
        except ValueError:
            cur_build = 0
        try:
            cur_patch = int(qs.get("patch", ["0"])[0] or "0")
        except ValueError:
            cur_patch = 0

        rel = get_release_config()
        latest_ver = str(rel.get("latestVersion", DEFAULT_LATEST_VERSION))
        latest_build = int(rel.get("latestBuild", DEFAULT_LATEST_BUILD))
        min_build = int(rel.get("minSupportedBuild", 0))
        has_app_update = compare_version(cur_ver, cur_build, latest_ver, latest_build)
        force_update = bool(rel.get("forceUpdate", False)) or (cur_build > 0 and cur_build < min_build)

        hp = rel.get("hotpatch", {})
        patch_ver = int(hp.get("patchVersion", 0))
        has_patch = patch_ver > cur_patch

        with _db_lock:
            ann_rows = DB.execute(
                "SELECT id, badge, title, content, pinned, created_at FROM announcements WHERE active = 1 ORDER BY pinned DESC, created_at DESC LIMIT 12"
            ).fetchall()
        announcements = [
            {
                "id": int(r["id"]),
                "badge": r["badge"],
                "title": r["title"],
                "content": r["content"],
                "pinned": bool(r["pinned"]),
                "createdAt": int(r["created_at"]),
            }
            for r in ann_rows
        ]

        user_payload = None
        auth = authenticate_token(self.headers.get("Authorization"))
        if auth:
            user_payload = serialize_user(auth[0])

        pack = get_hotpack_manifest()
        self.send_json(
            {
                "ok": True,
                "update": {
                    "hasAppUpdate": has_app_update,
                    "forceUpdate": force_update,
                    "currentVersion": cur_ver,
                    "currentBuild": cur_build,
                    "latestVersion": latest_ver,
                    "latestBuild": latest_build,
                    "releaseDate": rel.get("releaseDate", ""),
                    "ipaSizeMB": rel.get("ipaSizeMB", 42.7),
                    "downloadUrl": rel.get("downloadUrl", ""),
                    "directIpaUrl": rel.get("directIpaUrl", ""),
                    "ipaMirrors": rel.get("ipaMirrors", []),
                    "webDownloadUrl": rel.get("webDownloadUrl", f"http://{PUBLIC_HOST}/download"),
                    "releaseNotes": rel.get("releaseNotes", []),
                },
                "changelog": CHANGELOG_HISTORY,
                "hotpatch": {
                    "hasPatchUpdate": has_patch,
                    "patchVersion": patch_ver,
                    "summary": hp.get("summary", ""),
                    "updatedAt": int(hp.get("updatedAt", 0)),
                    "sha256": hp.get("sha256", ""),
                    "config": hp.get("config", {}) if (has_patch or cur_patch == 0) else None,
                },
                "hotpack": {
                    "packVersion": pack["packVersion"],
                    "releaseTag": pack["releaseTag"],
                    "totalBytes": pack["totalBytes"],
                    "fileCount": len(pack["files"]),
                },
                "server": get_public_server_snapshot(),
                "announcements": announcements,
                "user": user_payload,
            }
        )

    def handle_announcements(self) -> None:
        with _db_lock:
            rows = DB.execute(
                "SELECT id, badge, title, content, pinned, created_at FROM announcements WHERE active = 1 ORDER BY pinned DESC, created_at DESC LIMIT 20"
            ).fetchall()
        self.send_json(
            {
                "ok": True,
                "announcements": [
                    {
                        "id": int(r["id"]),
                        "badge": r["badge"],
                        "title": r["title"],
                        "content": r["content"],
                        "pinned": bool(r["pinned"]),
                        "createdAt": int(r["created_at"]),
                    }
                    for r in rows
                ],
            }
        )

    def handle_register(self) -> None:
        if not check_rate_limit(f"reg:{self.client_address[0]}", 10, 300):
            self.send_json({"ok": False, "error": "操作过于频繁，请片刻后再试"}, 429)
            return
        body = self.read_json_body()
        if body is None:
            return
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        nickname = str(body.get("nickname", "")).strip() or username
        seal_char = sanitize_seal_char(str(body.get("sealChar", "龙")))
        seal_style = sanitize_seal_style(str(body.get("sealStyle", "cinnabar")))
        device_name = str(body.get("deviceName", "")).strip()
        app_version = str(body.get("appVersion", "")).strip()

        err = validate_username(username)
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        if len(password) < 6 or len(password) > 64:
            self.send_json({"ok": False, "error": "密令长度须为 6–64 位"}, 400)
            return

        role = "admin" if username.lower() in ADMIN_USERNAMES else "player"
        uid = next_uid()
        ts = now_ms()
        try:
            with _db_lock:
                DB.execute(
                    """
                    INSERT INTO users(id, username, password_hash, nickname, seal_char, seal_style, role, banned, is_guest, exp, created_at, last_login_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 20, ?, ?, ?)
                    """,
                    (uid, username, hash_password(password), nickname[:16], seal_char, seal_style, role, ts, ts, ts),
                )
                DB.commit()
                user_row = DB.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        except sqlite3.IntegrityError:
            self.send_json({"ok": False, "error": "此账号名已有史官占用，请另择雅号"}, 409)
            return

        token = create_session(uid, device_name, app_version)
        self.send_json({"ok": True, "token": token, "user": serialize_user(user_row)}, 201)

    def handle_login(self) -> None:
        ip = self.client_address[0]
        if not check_rate_limit(f"login:{ip}", 20, 300):
            self.send_json({"ok": False, "error": "尝试次数过多，请稍后再试"}, 429)
            return
        body = self.read_json_body()
        if body is None:
            return
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        device_name = str(body.get("deviceName", "")).strip()
        app_version = str(body.get("appVersion", "")).strip()

        if not username or not password:
            self.send_json({"ok": False, "error": "请输入账号与密令"}, 400)
            return
        with _db_lock:
            row = DB.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            record_login_failure(ip)
            self.send_json({"ok": False, "error": "账号或密令有误，请核对后重试"}, 401)
            return
        if int(row["banned"]) != 0:
            self.send_json({"ok": False, "error": "该账号已被限制登临"}, 403)
            return
        # Ensure configured admin usernames always hold admin role
        if username.lower() in ADMIN_USERNAMES and row["role"] != "admin":
            with _db_lock:
                DB.execute("UPDATE users SET role = 'admin' WHERE id = ?", (row["id"],))
                DB.commit()
        token = create_session(row["id"], device_name, app_version)
        with _db_lock:
            fresh = DB.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
        self.send_json({"ok": True, "token": token, "user": serialize_user(fresh)})

    def handle_guest(self) -> None:
        if not check_rate_limit(f"guest:{self.client_address[0]}", 20, 300):
            self.send_json({"ok": False, "error": "操作过于频繁，请片刻后再试"}, 429)
            return
        body = self.read_json_body()
        if body is None:
            return
        device_id = str(body.get("deviceId", "")).strip()[:64]
        device_name = str(body.get("deviceName", "")).strip()
        app_version = str(body.get("appVersion", "")).strip()

        user_row = None
        if device_id:
            with _db_lock:
                user_row = DB.execute("SELECT * FROM users WHERE device_id = ? AND is_guest = 1 AND banned = 0", (device_id,)).fetchone()
        if user_row is None:
            uid = next_uid()
            ts = now_ms()
            nickname = f"游历史官·{uid[-4:]}"
            with _db_lock:
                DB.execute(
                    """
                    INSERT INTO users(id, username, password_hash, nickname, seal_char, seal_style, role, banned, is_guest, device_id, exp, created_at, last_login_at, last_seen_at)
                    VALUES (?, NULL, ?, ?, '史', 'jade', 'player', 0, 1, ?, 10, ?, ?, ?)
                    """,
                    (uid, hash_password(secrets.token_urlsafe(24)), nickname, device_id or None, ts, ts, ts),
                )
                DB.commit()
                user_row = DB.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        token = create_session(user_row["id"], device_name, app_version)
        self.send_json({"ok": True, "token": token, "user": serialize_user(user_row)})

    def handle_bind_guest(self) -> None:
        auth = self.require_auth()
        if not auth:
            return
        user_row, _ = auth
        if not user_row["is_guest"]:
            self.send_json({"ok": False, "error": "当前已是正式立籍账号"}, 400)
            return
        body = self.read_json_body()
        if body is None:
            return
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        nickname = str(body.get("nickname", "")).strip() or user_row["nickname"]

        err = validate_username(username)
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        if len(password) < 6 or len(password) > 64:
            self.send_json({"ok": False, "error": "密令长度须为 6–64 位"}, 400)
            return
        role = "admin" if username.lower() in ADMIN_USERNAMES else "player"
        try:
            with _db_lock:
                DB.execute(
                    "UPDATE users SET username = ?, password_hash = ?, nickname = ?, role = ?, is_guest = 0, exp = exp + 20 WHERE id = ?",
                    (username, hash_password(password), nickname[:16], role, user_row["id"]),
                )
                DB.commit()
                fresh = DB.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
        except sqlite3.IntegrityError:
            self.send_json({"ok": False, "error": "此账号名已被占用，请另择雅号"}, 409)
            return
        self.send_json({"ok": True, "user": serialize_user(fresh)})

    def handle_logout(self) -> None:
        auth = authenticate_token(self.headers.get("Authorization"))
        if auth:
            with _db_lock:
                DB.execute("DELETE FROM sessions WHERE token_hash = ?", (auth[1],))
                DB.commit()
        self.send_json({"ok": True})

    def handle_update_profile(self) -> None:
        auth = self.require_auth()
        if not auth:
            return
        user_row, _ = auth
        body = self.read_json_body()
        if body is None:
            return
        nickname = str(body.get("nickname", user_row["nickname"])).strip()[:16] or user_row["nickname"]
        bio = str(body.get("bio", user_row["bio"])).strip()[:48] or user_row["bio"]
        seal_char = sanitize_seal_char(str(body.get("sealChar", user_row["seal_char"])))
        seal_style = sanitize_seal_style(str(body.get("sealStyle", user_row["seal_style"])))

        new_pw = body.get("newPassword")
        pw_hash = user_row["password_hash"]
        if new_pw is not None and str(new_pw) != "":
            cur_pw = str(body.get("currentPassword", ""))
            if not user_row["is_guest"] and not verify_password(cur_pw, user_row["password_hash"]):
                self.send_json({"ok": False, "error": "原密令不正确"}, 400)
                return
            if len(str(new_pw)) < 6 or len(str(new_pw)) > 64:
                self.send_json({"ok": False, "error": "新密令长度须为 6–64 位"}, 400)
                return
            pw_hash = hash_password(str(new_pw))

        with _db_lock:
            DB.execute(
                "UPDATE users SET nickname = ?, bio = ?, seal_char = ?, seal_style = ?, password_hash = ? WHERE id = ?",
                (nickname, bio, seal_char, seal_style, pw_hash, user_row["id"]),
            )
            DB.commit()
            fresh = DB.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
        self.send_json({"ok": True, "user": serialize_user(fresh)})

    def handle_checkin(self) -> None:
        auth = self.require_auth()
        if not auth:
            return
        user_row, _ = auth
        today = today_shanghai()
        if user_row["last_checkin_date"] == today:
            self.send_json({"ok": True, "already": True, "gainedExp": 0, "message": "今日已临朝落印，明日再会。", "user": serialize_user(user_row)})
            return
        yest = yesterday_shanghai()
        streak = int(user_row["checkin_streak"]) + 1 if user_row["last_checkin_date"] == yest else 1
        gained = 15 + min(10, (streak - 1) * 2)
        with _db_lock:
            DB.execute(
                "UPDATE users SET checkin_streak = ?, total_checkins = total_checkins + 1, last_checkin_date = ?, exp = exp + ? WHERE id = ?",
                (streak, today, gained, user_row["id"]),
            )
            DB.commit()
            fresh = DB.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
        self.send_json({"ok": True, "already": False, "gainedExp": gained, "message": f"临朝落印成礼，连签 {streak} 日，功勋 +{gained}", "user": serialize_user(fresh)})

    def handle_heartbeat(self) -> None:
        auth = authenticate_token(self.headers.get("Authorization"))
        self.send_json({"ok": True, "authenticated": auth is not None, "server": get_public_server_snapshot()})

    def handle_inbox(self, user_id: str) -> None:
        with _db_lock:
            rows = DB.execute(
                """
                SELECT m.id, m.sender, m.title, m.content, m.created_at,
                       CASE WHEN r.mail_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
                FROM mail m
                LEFT JOIN mail_reads r ON r.user_id = ? AND r.mail_id = m.id
                WHERE m.user_id = ? OR m.user_id = '*'
                ORDER BY m.created_at DESC LIMIT 30
                """,
                (user_id, user_id),
            ).fetchall()
        self.send_json(
            {
                "ok": True,
                "messages": [
                    {
                        "id": int(r["id"]),
                        "sender": r["sender"],
                        "title": r["title"],
                        "content": r["content"],
                        "read": bool(r["is_read"]),
                        "createdAt": int(r["created_at"]),
                    }
                    for r in rows
                ],
            }
        )

    def handle_leaderboard(self, category: str) -> None:
        with _db_lock:
            if category == "exp":
                rows = DB.execute(
                    """
                    SELECT u.id AS user_id, u.nickname, u.seal_char, u.seal_style, u.exp,
                           COALESCE(l.world_title, '') AS world_title,
                           COALESCE(l.top_nation, '') AS top_nation,
                           COALESCE(l.provinces_held, 0) AS provinces_held,
                           COALESCE(l.years_elapsed, 0) AS years_elapsed,
                           COALESCE(l.wonders_count, 0) AS wonders_count
                    FROM users u
                    LEFT JOIN leaderboard l ON l.user_id = u.id
                    WHERE u.banned = 0
                    ORDER BY u.exp DESC, u.total_checkins DESC LIMIT 30
                    """
                ).fetchall()
            else:
                order_col = "l.years_elapsed DESC, l.provinces_held DESC" if category == "years" else "l.provinces_held DESC, l.years_elapsed DESC"
                rows = DB.execute(
                    f"""
                    SELECT u.id AS user_id, u.nickname, u.seal_char, u.seal_style, u.exp,
                           l.world_title, l.top_nation, l.provinces_held, l.years_elapsed, l.wonders_count
                    FROM leaderboard l
                    JOIN users u ON u.id = l.user_id
                    WHERE u.banned = 0
                    ORDER BY {order_col} LIMIT 30
                    """
                ).fetchall()
        entries = []
        for idx, r in enumerate(rows, start=1):
            rk = rank_info(int(r["exp"]))
            entries.append(
                {
                    "rank": idx,
                    "userId": r["user_id"],
                    "nickname": r["nickname"],
                    "sealChar": r["seal_char"],
                    "sealStyle": r["seal_style"],
                    "rankTitle": rk["title"],
                    "exp": int(r["exp"]),
                    "worldTitle": r["world_title"],
                    "topNation": r["top_nation"],
                    "provincesHeld": int(r["provinces_held"]),
                    "yearsElapsed": int(r["years_elapsed"]),
                    "wondersCount": int(r["wonders_count"]),
                }
            )
        self.send_json({"ok": True, "category": category, "entries": entries})

    def handle_stats_report(self) -> None:
        auth = self.require_auth()
        if not auth:
            return
        user_row, _ = auth
        body = self.read_json_body()
        if body is None:
            return
        world_title = str(body.get("worldTitle", "")).strip()[:32] or "无名之世"
        top_nation = str(body.get("topNation", "")).strip()[:24] or "中原列国"
        provinces_held = max(0, min(5000, _safe_int(body.get("provincesHeld"), 0)))
        total_days = max(0, min(10_000_000, _safe_int(body.get("totalDays"), 0)))
        years_elapsed = max(0, min(50_000, _safe_int(body.get("yearsElapsed"), total_days // 365)))
        nations_count = max(0, min(500, _safe_int(body.get("nationsCount"), 0)))
        wars_count = max(0, min(100_000, _safe_int(body.get("warsCount"), 0)))
        wonders_count = max(0, min(50, _safe_int(body.get("wondersCount"), 0)))

        ts = now_ms()
        with _db_lock:
            existed = DB.execute("SELECT 1 FROM leaderboard WHERE user_id = ?", (user_row["id"],)).fetchone()
            DB.execute(
                """
                INSERT INTO leaderboard(user_id, world_title, top_nation, provinces_held, total_days, years_elapsed, nations_count, wars_count, wonders_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    world_title=excluded.world_title, top_nation=excluded.top_nation,
                    provinces_held=excluded.provinces_held, total_days=excluded.total_days,
                    years_elapsed=excluded.years_elapsed, nations_count=excluded.nations_count,
                    wars_count=excluded.wars_count, wonders_count=excluded.wonders_count,
                    updated_at=excluded.updated_at
                """,
                (user_row["id"], world_title, top_nation, provinces_held, total_days, years_elapsed, nations_count, wars_count, wonders_count, ts),
            )
            if not existed:
                DB.execute("UPDATE users SET exp = exp + 20 WHERE id = ?", (user_row["id"],))
            DB.commit()
            fresh = DB.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
        self.send_json({"ok": True, "user": serialize_user(fresh)})

    # ----------------------------- Cloud Map Workshop (v6) -----------------------------

    def handle_workshop_list(self, qs: dict[str, list[str]]) -> None:
        region = (qs.get("region", [""])[0] or "").strip()
        q = (qs.get("q", [""])[0] or "").strip()[:64]
        sort = (qs.get("sort", ["popular"])[0] or "popular").strip().lower()

        where_clauses: list[str] = []
        params: list[Any] = []
        if region and region.lower() != "all":
            where_clauses.append("region = ?")
            params.append(region[:32])
        if q:
            like = f"%{q}%"
            where_clauses.append("(title LIKE ? OR subtitle LIKE ? OR description LIKE ? OR author_name LIKE ? OR tags_json LIKE ?)")
            params.extend([like, like, like, like, like])

        where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        if sort == "newest":
            order_sql = "ORDER BY created_at DESC, updated_at DESC"
        else:
            order_sql = "ORDER BY (likes * 3 + downloads) DESC, created_at DESC"

        with _db_lock:
            rows = DB.execute(
                f"SELECT * FROM workshop_maps{where_sql} {order_sql} LIMIT 100",
                tuple(params),
            ).fetchall()
        self.send_json({"ok": True, "maps": [serialize_workshop_map(r) for r in rows]})

    def handle_workshop_get(self, map_id: str) -> None:
        clean_id = map_id.strip()
        if not _WORKSHOP_ID_RE.fullmatch(clean_id):
            self.send_json({"ok": False, "error": "舆图编号无效"}, 400)
            return
        with _db_lock:
            row = DB.execute("SELECT * FROM workshop_maps WHERE id = ?", (clean_id,)).fetchone()
        if not row:
            self.send_json({"ok": False, "error": "找不到该工坊舆图"}, 404)
            return
        try:
            root = WORKSHOP_DIR.resolve()
            fpath = Path(row["payload_path"]).resolve()
            if not fpath.is_relative_to(root) or not fpath.is_file():
                self.send_json({"ok": False, "error": "舆图数据文件不存在"}, 404)
                return
            payload_obj = json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            self.send_json({"ok": False, "error": "读取舆图数据失败"}, 500)
            return
        with _db_lock:
            DB.execute("UPDATE workshop_maps SET downloads = downloads + 1 WHERE id = ?", (clean_id,))
            DB.commit()
            updated = DB.execute("SELECT * FROM workshop_maps WHERE id = ?", (clean_id,)).fetchone()
        self.send_json({
            "ok": True,
            "map": serialize_workshop_map(updated or row),
            "scenario": payload_obj,
        })

    def handle_workshop_upload(self) -> None:
        ip = self.client_address[0]
        if not check_rate_limit(f"map_upload:{ip}", 15, 300):
            self.send_json({"ok": False, "error": "上传过于频繁，请片刻后再试"}, 429)
            return
        body = self.read_json_body(max_bytes=MAX_WORKSHOP_BODY_BYTES)
        if body is None:
            return
        scenario = body.get("scenario")
        if not isinstance(scenario, dict):
            self.send_json({"ok": False, "error": "缺少有效的舆图剧本数据（scenario）"}, 400)
            return

        title = str(scenario.get("title") or scenario.get("name") or "").strip()
        if not title or len(title) > 60:
            self.send_json({"ok": False, "error": "舆图标题长度须为 1–60 字"}, 400)
            return
        nations = scenario.get("nations")
        if not isinstance(nations, list) or not (2 <= len(nations) <= 24):
            self.send_json({"ok": False, "error": "舆图列国数量须在 2–24 国之间"}, 400)
            return
        region = str(scenario.get("region") or "").strip()[:32]
        if not region:
            self.send_json({"ok": False, "error": "请指定舆图所属地理区域（region）"}, 400)
            return

        auth = authenticate_token(self.headers.get("Authorization"))
        if auth:
            author_user_id = str(auth[0]["id"])
            author_name = (str(auth[0]["nickname"] or "").strip() or str(auth[0]["username"] or "").strip() or "列国制图师")[:24]
        else:
            author_user_id = ""
            raw_author = str(body.get("authorName") or scenario.get("authorName") or scenario.get("author") or "").strip()
            author_name = raw_author[:24] if raw_author else "列国制图师"

        subtitle = str(scenario.get("subtitle") or "").strip()[:80]
        raw_era_year = next(
            (scenario[k] for k in ("eraYear", "year", "startYear") if scenario.get(k) is not None),
            1,
        )
        era_year = _safe_int(raw_era_year, 1)
        era_name = str(scenario.get("eraName") or scenario.get("era") or "").strip()[:32]
        description = str(scenario.get("description") or scenario.get("summary") or "").strip()[:600]
        nation_count = len(nations)
        province_count = max(nation_count, min(480, _safe_int(scenario.get("provinceCount"), 80)))
        raw_tags = scenario.get("tags")
        tags = [str(t).strip()[:20] for t in raw_tags if str(t).strip()][:10] if isinstance(raw_tags, list) else []

        raw_sid = str(scenario.get("id") or "").strip()
        map_id = ""
        existing_row = None
        if author_user_id and raw_sid and _WORKSHOP_ID_RE.fullmatch(raw_sid):
            with _db_lock:
                cand = DB.execute("SELECT * FROM workshop_maps WHERE id = ?", (raw_sid,)).fetchone()
            if cand and str(cand["author_user_id"]) == author_user_id:
                map_id = raw_sid
                existing_row = cand
        if not map_id:
            map_id = "wm_" + secrets.token_hex(6)

        stored_scenario = dict(scenario)
        stored_scenario["id"] = map_id
        fpath = WORKSHOP_DIR / f"{map_id}.json"
        tmp = WORKSHOP_DIR / f"{map_id}.{secrets.token_hex(6)}.tmp"
        serialized = json.dumps(stored_scenario, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(serialized) > MAX_WORKSHOP_BODY_BYTES:
            self.send_json({"ok": False, "error": "舆图数据体积超出 2.5 MB 上限"}, 413)
            return
        try:
            with tmp.open("wb") as f:
                f.write(serialized)
            tmp.replace(fpath)
        except Exception:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            self.send_json({"ok": False, "error": "保存舆图文件失败"}, 500)
            return

        ts = now_ms()
        created_at = int(existing_row["created_at"]) if existing_row else ts
        tags_json = json.dumps(tags, ensure_ascii=False, separators=(",", ":"))
        with _db_lock:
            DB.execute(
                """
                INSERT INTO workshop_maps(
                    id, author_user_id, author_name, title, subtitle, region,
                    era_year, era_name, description, nation_count, province_count,
                    downloads, likes, tags_json, payload_path, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    author_name=excluded.author_name,
                    title=excluded.title,
                    subtitle=excluded.subtitle,
                    region=excluded.region,
                    era_year=excluded.era_year,
                    era_name=excluded.era_name,
                    description=excluded.description,
                    nation_count=excluded.nation_count,
                    province_count=excluded.province_count,
                    tags_json=excluded.tags_json,
                    payload_path=excluded.payload_path,
                    updated_at=excluded.updated_at
                """,
                (
                    map_id, author_user_id, author_name, title, subtitle, region,
                    era_year, era_name, description, nation_count, province_count,
                    tags_json, str(fpath), created_at, ts,
                ),
            )
            if author_user_id and existing_row is None:
                DB.execute("UPDATE users SET exp = exp + 15 WHERE id = ?", (author_user_id,))
            DB.commit()
            fresh = DB.execute("SELECT * FROM workshop_maps WHERE id = ?", (map_id,)).fetchone()
        self.send_json({"ok": True, "id": map_id, "map": serialize_workshop_map(fresh)}, 200 if existing_row else 201)

    def handle_workshop_like(self, map_id: str) -> None:
        ip = self.client_address[0]
        if not check_rate_limit(f"map_like:{ip}", 60, 60):
            self.send_json({"ok": False, "error": "点赞过于频繁，请稍后再试"}, 429)
            return
        clean_id = map_id.strip()
        if not _WORKSHOP_ID_RE.fullmatch(clean_id):
            self.send_json({"ok": False, "error": "舆图编号无效"}, 400)
            return
        with _db_lock:
            cur = DB.execute("UPDATE workshop_maps SET likes = likes + 1 WHERE id = ?", (clean_id,))
            if cur.rowcount == 0:
                self.send_json({"ok": False, "error": "找不到该工坊舆图"}, 404)
                return
            DB.commit()
            row = DB.execute("SELECT likes FROM workshop_maps WHERE id = ?", (clean_id,)).fetchone()
        self.send_json({"ok": True, "likes": int(row["likes"]) if row else 1})

    def handle_workshop_delete(self, map_id: str) -> None:
        clean_id = map_id.strip()
        if not _WORKSHOP_ID_RE.fullmatch(clean_id):
            self.send_json({"ok": False, "error": "舆图编号无效"}, 400)
            return
        with _db_lock:
            row = DB.execute("SELECT author_user_id, payload_path FROM workshop_maps WHERE id = ?", (clean_id,)).fetchone()
        if not row:
            self.send_json({"ok": False, "error": "找不到该工坊舆图"}, 404)
            return
        allowed = self._is_admin_request()
        if not allowed:
            auth = authenticate_token(self.headers.get("Authorization"))
            if auth and row["author_user_id"] and str(auth[0]["id"]) == str(row["author_user_id"]):
                allowed = True
        if not allowed:
            self.send_json({"ok": False, "error": "仅作者或管理员可删除该舆图"}, 403)
            return
        with _db_lock:
            DB.execute("DELETE FROM workshop_maps WHERE id = ?", (clean_id,))
            DB.commit()
        try:
            root = WORKSHOP_DIR.resolve()
            fpath = Path(row["payload_path"]).resolve()
            if fpath.is_relative_to(root):
                fpath.unlink(missing_ok=True)
        except OSError:
            pass
        self.send_json({"ok": True})

    # ----------------------------- Cloud Saves -----------------------------

    def handle_saves_list(self, user_id: str) -> None:
        with _db_lock:
            rows = DB.execute(
                "SELECT id, title, date_text, nations, provinces, day, size_bytes, encoding, device, updated_at "
                "FROM cloud_saves WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
        self.send_json(
            {
                "ok": True,
                "saves": [
                    {
                        "id": r["id"], "title": r["title"], "date": r["date_text"],
                        "nations": int(r["nations"]), "provinces": int(r["provinces"]),
                        "day": int(r["day"]), "sizeBytes": int(r["size_bytes"]),
                        "updatedAt": float(r["updated_at"]), "device": r["device"], "encoding": r["encoding"],
                    }
                    for r in rows
                ],
            }
        )

    def handle_save_upload(self, user_id: str, save_id: str) -> None:
        safe_id = re.sub(r"[^A-Za-z0-9_\-]", "", save_id)[:64]
        if not safe_id:
            self.send_json({"ok": False, "reason": "存档编号无效"}, 400)
            return
        try:
            cl = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self.send_json({"ok": False, "reason": "无效的存档长度"}, 400)
            return
        if cl <= 0 or cl > MAX_SAVE_BYTES:
            self.send_json({"ok": False, "reason": f"存档大小须在 1 B – {MAX_SAVE_BYTES // (1024*1024)} MB 之间"}, 413)
            return
        with _db_lock:
            cnt = DB.execute("SELECT COUNT(*) AS c FROM cloud_saves WHERE user_id = ? AND id != ?", (user_id, safe_id)).fetchone()["c"]
        if cnt >= MAX_SAVES_PER_USER:
            self.send_json({"ok": False, "reason": f"账号云端卷宗已达上限（{MAX_SAVES_PER_USER} 卷），请先清理旧卷"}, 400)
            return
        self._body_consumed = True
        payload = self.rfile.read(cl)
        if len(payload) != cl:
            self.send_json({"ok": False, "reason": "存档上传不完整，请重试"}, 400)
            return
        user_dir = SAVES_DIR / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        fpath = user_dir / f"{safe_id}.bin"
        tmp = user_dir / f"{safe_id}.{secrets.token_hex(6)}.tmp"
        try:
            with tmp.open("wb") as f:
                f.write(payload)
            tmp.replace(fpath)
        except Exception:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            raise

        def hdr(name: str, default: str = "") -> str:
            v = self.headers.get(name, default)
            return urllib.parse.unquote(v) if v else default

        title = hdr("X-Save-Title", "当前世界")[:40]
        date_text = hdr("X-Save-Date", "")[:32]
        nations = _safe_int(hdr("X-Save-Nations", "0"), 0)
        provinces = _safe_int(hdr("X-Save-Provinces", "0"), 0)
        day = _safe_int(hdr("X-Save-Day", "0"), 0)
        device = hdr("X-Save-Device", "")[:48]
        encoding = (hdr("X-Save-Encoding", "zlib") or "zlib").lower()
        ts = now_ms()
        with _db_lock:
            DB.execute(
                """
                INSERT INTO cloud_saves(user_id, id, title, date_text, nations, provinces, day, size_bytes, encoding, device, file_path, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, id) DO UPDATE SET
                    title=excluded.title, date_text=excluded.date_text, nations=excluded.nations,
                    provinces=excluded.provinces, day=excluded.day, size_bytes=excluded.size_bytes,
                    encoding=excluded.encoding, device=excluded.device, file_path=excluded.file_path,
                    updated_at=excluded.updated_at
                """,
                (user_id, safe_id, title, date_text, nations, provinces, day, len(payload), encoding, device, str(fpath), ts),
            )
            DB.execute("UPDATE users SET exp = exp + 5 WHERE id = ?", (user_id,))
            DB.commit()
        self.send_json({
            "ok": True,
            "save": {
                "id": safe_id, "title": title, "date": date_text, "nations": nations,
                "provinces": provinces, "day": day, "sizeBytes": len(payload),
                "updatedAt": float(ts), "device": device, "encoding": encoding,
            },
        })

    def handle_save_download(self, user_id: str, save_id: str) -> None:
        safe_id = re.sub(r"[^A-Za-z0-9_\-]", "", save_id)[:64]
        with _db_lock:
            row = DB.execute("SELECT file_path, encoding FROM cloud_saves WHERE user_id = ? AND id = ?", (user_id, safe_id)).fetchone()
        if not row:
            self.send_json({"ok": False, "error": "云端存档不存在"}, 404)
            return
        save_path = Path(row["file_path"])
        if not save_path.exists() or not save_path.is_file():
            self.send_json({"ok": False, "error": "云端存档不存在"}, 404)
            return
        size = save_path.stat().st_size
        self.send_response(200)
        self._security_headers()
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("X-Save-Encoding", row["encoding"])
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            with save_path.open("rb") as f:
                while True:
                    chunk = f.read(256 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, TimeoutError, socket.timeout):
            self.close_connection = True

    def handle_save_delete(self, user_id: str, save_id: str) -> None:
        safe_id = re.sub(r"[^A-Za-z0-9_\-]", "", save_id)[:64]
        with _db_lock:
            row = DB.execute("SELECT file_path FROM cloud_saves WHERE user_id = ? AND id = ?", (user_id, safe_id)).fetchone()
            DB.execute("DELETE FROM cloud_saves WHERE user_id = ? AND id = ?", (user_id, safe_id))
            DB.commit()
        if row:
            try:
                Path(row["file_path"]).unlink(missing_ok=True)
            except OSError:
                pass
        self.send_json({"ok": True})

    # ----------------------------- Admin Console Endpoints -----------------------------

    def handle_admin_users(self, q: str) -> None:
        with _db_lock:
            if q:
                like = f"%{q}%"
                rows = DB.execute(
                    "SELECT id, username, nickname, seal_char, seal_style, role, banned, is_guest, exp, checkin_streak, last_seen_at "
                    "FROM users WHERE id LIKE ? OR username LIKE ? OR nickname LIKE ? ORDER BY last_seen_at DESC LIMIT 50",
                    (like, like, like),
                ).fetchall()
            else:
                rows = DB.execute(
                    "SELECT id, username, nickname, seal_char, seal_style, role, banned, is_guest, exp, checkin_streak, last_seen_at "
                    "FROM users ORDER BY last_seen_at DESC LIMIT 50"
                ).fetchall()
        out = []
        for r in rows:
            with _db_lock:
                sc = DB.execute("SELECT COUNT(*) AS c FROM cloud_saves WHERE user_id = ?", (r["id"],)).fetchone()["c"]
            rk = rank_info(int(r["exp"]))
            out.append({
                "id": r["id"],
                "username": r["username"] or "",
                "nickname": r["nickname"],
                "sealChar": r["seal_char"],
                "sealStyle": r["seal_style"],
                "role": r["role"],
                "banned": bool(r["banned"]),
                "isGuest": bool(r["is_guest"]),
                "exp": int(r["exp"]),
                "rankTitle": rk["title"],
                "cloudSaveCount": int(sc),
                "lastSeenAt": float(r["last_seen_at"]),
            })
        self.send_json({"ok": True, "users": out})

    def handle_admin_edit_user(self, uid: str) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        with _db_lock:
            row = DB.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
            if not row:
                self.send_json({"ok": False, "error": "找不到该史官"}, 404)
                return
            if "expDelta" in body:
                delta = max(-5000, min(5000, _safe_int(body.get("expDelta"), 0)))
                DB.execute("UPDATE users SET exp = MAX(0, exp + ?) WHERE id = ?", (delta, uid))
            if "banned" in body and row["role"] != "admin":
                b = 1 if body["banned"] else 0
                DB.execute("UPDATE users SET banned = ? WHERE id = ?", (b, uid))
                if b:
                    DB.execute("DELETE FROM sessions WHERE user_id = ?", (uid,))
            if "nickname" in body and str(body["nickname"]).strip():
                DB.execute("UPDATE users SET nickname = ? WHERE id = ?", (str(body["nickname"]).strip()[:16], uid))
            if body.get("clearLeaderboard"):
                DB.execute("DELETE FROM leaderboard WHERE user_id = ?", (uid,))
            DB.commit()
        self.send_json({"ok": True})

    def handle_admin_announcements_list(self) -> None:
        with _db_lock:
            rows = DB.execute("SELECT id, badge, title, content, pinned, active, created_at FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 30").fetchall()
        self.send_json({
            "ok": True,
            "announcements": [
                {
                    "id": int(r["id"]), "badge": r["badge"], "title": r["title"],
                    "content": r["content"], "pinned": bool(r["pinned"]),
                    "active": bool(r["active"]), "createdAt": int(r["created_at"]),
                }
                for r in rows
            ],
        })

    def handle_admin_announcement(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        badge = str(body.get("badge", "公告")).strip()[:8] or "公告"
        title = str(body.get("title", "")).strip()[:64]
        content = str(body.get("content", "")).strip()[:2000]
        pinned = 1 if body.get("pinned") else 0
        if not title or not content:
            self.send_json({"ok": False, "error": "标题与正文不能为空"}, 400)
            return
        with _db_lock:
            cur = DB.execute(
                "INSERT INTO announcements(badge, title, content, pinned, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                (badge, title, content, pinned, now_ms()),
            )
            DB.commit()
            aid = cur.lastrowid
        self.send_json({"ok": True, "id": aid})

    def handle_admin_notice(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        notice = str(body.get("notice", "")).strip()[:120]
        cur = get_release_config()
        hp = cur.get("hotpatch", {})
        cfg = hp.get("config", json.loads(json.dumps(DEFAULT_HOTPATCH_CONFIG)))
        cfg["notice"] = notice
        hp["patchVersion"] = int(hp.get("patchVersion", 8)) + 1
        cfg["version"] = hp["patchVersion"]
        hp["summary"] = "管理员已更新全服跑马灯与开服通告"
        hp["updatedAt"] = now_ms()
        hp["config"] = cfg
        hp["sha256"] = compute_hotpatch_sha(cfg)
        cur["hotpatch"] = hp
        save_release_config(cur)
        self.send_json({"ok": True, "patchVersion": hp["patchVersion"], "notice": notice})

    def handle_admin_tuning(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        cur = get_release_config()
        hp = cur.get("hotpatch", {})
        cfg = hp.get("config", json.loads(json.dumps(DEFAULT_HOTPATCH_CONFIG)))
        if isinstance(body.get("tuning"), dict):
            t = cfg.get("tuning", {})
            for k, v in body["tuning"].items():
                t[k] = v
            cfg["tuning"] = t
        if isinstance(body.get("pace"), dict):
            p = cfg.get("pace", {})
            for k, v in body["pace"].items():
                p[str(k)] = max(1, min(60, _safe_int(v, 1)))
            cfg["pace"] = p
        if "notice" in body:
            cfg["notice"] = str(body["notice"]).strip()[:120]
        hp["patchVersion"] = int(hp.get("patchVersion", 8)) + 1
        cfg["version"] = hp["patchVersion"]
        hp["summary"] = str(body.get("summary", "管理员热更全服平衡数值与倍速节拍"))[:80]
        hp["updatedAt"] = now_ms()
        hp["config"] = cfg
        hp["sha256"] = compute_hotpatch_sha(cfg)
        cur["hotpatch"] = hp
        save_release_config(cur)
        # Also mirror updated hot-rules.json into hotpack atomically so new downloads stay in sync
        rules_path = HOTPACK_DIR / "Content" / "hot-rules.json"
        if rules_path.parent.exists():
            tmp_rules = rules_path.parent / f".hot-rules.{secrets.token_hex(6)}.tmp"
            try:
                with tmp_rules.open("w", encoding="utf-8") as f:
                    json.dump(cfg, f, ensure_ascii=False, indent=2)
                tmp_rules.replace(rules_path)
            except Exception:
                try:
                    tmp_rules.unlink(missing_ok=True)
                except OSError:
                    pass
                raise
            rebuild_hotpack_manifest(bump_version=True, summary=hp["summary"])
        self.send_json({"ok": True, "patchVersion": hp["patchVersion"]})

    def handle_admin_release(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        cur = get_release_config()
        prev_ver = str(cur.get("latestVersion") or DEFAULT_RELEASE["latestVersion"])
        prev_build = int(cur.get("latestBuild") or DEFAULT_RELEASE["latestBuild"])
        for k in ("latestVersion", "latestBuild", "minSupportedBuild", "forceUpdate", "maintenance", "maintenanceMessage", "releaseDate", "ipaSizeMB", "downloadUrl", "directIpaUrl", "ipaMirrors", "webDownloadUrl", "releaseNotes"):
            if k in body:
                if k == "ipaMirrors":
                    if isinstance(body[k], list):
                        cur[k] = [str(x).strip() for x in body[k] if isinstance(x, str) and str(x).strip()]
                elif k == "releaseNotes":
                    cur[k] = _normalize_release_notes(body[k])
                else:
                    cur[k] = body[k]
        new_ver = str(cur.get("latestVersion") or prev_ver)
        new_build = int(cur.get("latestBuild") or prev_build)
        if new_ver != prev_ver and "downloadUrl" not in body:
            cur["downloadUrl"] = f"https://github.com/Ethanhui6/lieguoji-web/releases/tag/v{new_ver.lstrip('v')}"
        if (new_ver != prev_ver or new_build != prev_build) and "ipaMirrors" not in body:
            cur["ipaMirrors"] = build_default_ipa_mirrors(new_ver, new_build)
            if "directIpaUrl" not in body:
                cur["directIpaUrl"] = cur["ipaMirrors"][0]
        if "hotpatch" in body and isinstance(body["hotpatch"], dict):
            hp = cur.get("hotpatch", {})
            hp.update(body["hotpatch"])
            if "config" in hp and isinstance(hp["config"], dict):
                hp["sha256"] = compute_hotpatch_sha(hp["config"])
            hp["updatedAt"] = now_ms()
            cur["hotpatch"] = hp
        save_release_config(cur)
        self.send_json({"ok": True, "release": get_release_config()})

    def handle_admin_mail(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        target = str(body.get("target", "*")).strip() or "*"
        sender = str(body.get("sender", "御前司礼监")).strip()[:20] or "御前司礼监"
        title = str(body.get("title", "")).strip()[:64]
        content = str(body.get("content", "")).strip()[:2000]
        if not title or not content:
            self.send_json({"ok": False, "error": "信件标题与正文不能为空"}, 400)
            return
        resolved_target = "*"
        if target != "*":
            with _db_lock:
                u = DB.execute("SELECT id FROM users WHERE id = ? OR LOWER(username) = LOWER(?)", (target, target)).fetchone()
            if not u:
                self.send_json({"ok": False, "error": f"找不到收件史官：{target}"}, 404)
                return
            resolved_target = u["id"]
        with _db_lock:
            DB.execute(
                "INSERT INTO mail(user_id, sender, title, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (resolved_target, sender, title, content, now_ms()),
            )
            DB.commit()
        self.send_json({"ok": True, "target": resolved_target})

    def handle_admin_hotpack_bump(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body() or {}
        tag = str(body.get("releaseTag", "")).strip() or None
        summary = str(body.get("summary", "")).strip() or None
        m = rebuild_hotpack_manifest(bump_version=True, tag=tag, summary=summary)
        self.send_json({"ok": True, "packVersion": m["packVersion"], "totalBytes": m["totalBytes"], "files": len(m["files"])})


class PlatformHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    init_db()
    rebuild_hotpack_manifest(bump_version=False)
    probe_compute_once()
    start_probe_thread()
    server = PlatformHTTPServer(("0.0.0.0", PORT), PlatformHandler)
    shutdown_started = threading.Event()

    def _request_shutdown(signum: int, _frame: Any) -> None:
        if shutdown_started.is_set():
            return
        shutdown_started.set()
        _shutdown_event.set()
        print(f"收到信号 {signum}，正在优雅关闭云端行宫平台服务器 v6.5…", flush=True)
        threading.Thread(target=server.shutdown, daemon=True).start()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _request_shutdown)
        except (ValueError, OSError):
            pass

    print(f"列国纪云端行宫平台服务器 v6.5 已启动：:{PORT}（管理员：{','.join(sorted(ADMIN_USERNAMES))}）", flush=True)
    try:
        server.serve_forever()
    finally:
        _shutdown_event.set()
        try:
            server.server_close()
        except Exception:
            pass
        close_db()
        print("列国纪云端行宫平台服务器 v6.5 已安全退出并关闭数据库。", flush=True)


if __name__ == "__main__":
    main()
