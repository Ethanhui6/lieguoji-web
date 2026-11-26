#!/usr/bin/env python3
"""
列国纪 · 云端行宫平台服务器 (Lieguoji Platform Server v1.0)
零第三方依赖（纯 Python 3.12 标准库 + SQLite WAL），提供：
1. 启动版本检测与双层云更新（热更配置包自动同步 + 客户端新版检测/国内直链 IPA 分发）
2. 完整账号系统（注册/登录/游客入世/游客转正绑定/御印与个人名帖/scrypt 加盐密码/90天令牌）
3. 账号绑定云端存档库（支持跨设备高速上传/下载/列表/删除）
4. 每日临朝签到与史官品秩晋升体系
5. 公告驿报、系统信匣、天下史榜全服排行榜、实时在线人数与计算服健康探活
6. 移动端宣纸古风下载落地页（/ 与 /download）
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import socket
import sqlite3
import struct
import threading
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
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
SECRET_PATH = DATA_DIR / "admin_secret.txt"
PUBLIC_HOST = os.environ.get("LGJ_PUBLIC_HOST", "111.230.153.235")
COMPUTE_HOST = os.environ.get("LGJ_COMPUTE_HOST", f"{PUBLIC_HOST}:8765")
COMPUTE_PROBE_HOST = os.environ.get("LGJ_COMPUTE_PROBE_HOST", "127.0.0.1")
COMPUTE_PROBE_PORT = int(os.environ.get("LGJ_COMPUTE_PROBE_PORT", "8765"))
SERVER_NAME = os.environ.get("LGJ_SERVER_NAME", "九州一区 · 腾讯云专属服")
SERVER_REGION = os.environ.get("LGJ_SERVER_REGION", "中国大陆直连")

MAX_SAVE_BYTES = 24 * 1024 * 1024  # 24 MB compressed
MAX_SAVES_PER_USER = 20
TOKEN_TTL_SECONDS = 90 * 24 * 3600
SHANGHAI_TZ = timezone(timedelta(hours=8))
START_TIME = time.time()

DATA_DIR.mkdir(parents=True, exist_ok=True)
SAVES_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


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

DEFAULT_HOTPATCH_CONFIG: dict[str, Any] = {
    "version": 7,
    "notice": "腾讯云专属服已正式开服 · 全双工直连推流 30ms 丝滑体验",
    "computeHost": COMPUTE_HOST,
    "pace": {"1": 3, "2": 6, "4": 12, "8": 24, "16": 40},
    "tuning": {
        "lethality": 2,
        "siege": 6,
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


DEFAULT_RELEASE: dict[str, Any] = {
    "latestVersion": "5.3.0",
    "latestBuild": 183,
    "minSupportedBuild": 175,
    "forceUpdate": False,
    "releaseDate": "2026-11-26",
    "ipaSizeMB": 86.2,
    "downloadUrl": "https://github.com/Ethanhui6/lieguoji-web/releases/latest",
    "directIpaUrl": "",
    "webDownloadUrl": f"http://{PUBLIC_HOST}/download",
    "releaseNotes": [
        "【云端行宫 · 完整账号系统】上线全新古籍风格「列国登临阁」登录/注册与游客一键入世，支持自定义篆刻御印（十枚古篆 + 三色印泥）与无损转正绑定。",
        "【自动云更新检测 × 毫秒级热更】每次进入游戏自动检测客户端新版本与云端热更配置包，支持国内专属服务器极速直连下载与参数免重启热加载。",
        "【账号专属云端存档 × 每日临朝签到 × 天下史榜】云存档与账号绑定跨设备极速同步（国内直传 < 1 秒），新增每日签到晋升史官品秩、驿报公告信匣与全服天下史榜。",
        "【默认直连腾讯云专属服】开机自动接入 24 小时专属全双工推流计算服（v6 + LZ4 压缩），免手工填 IP 畅享真网游级丝滑推演。",
    ],
    "hotpatch": {
        "patchVersion": 7,
        "updatedAt": int(time.time() * 1000),
        "summary": "专属云服默认节点就绪 · 平衡参数与推演节拍云端热加载",
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
# Password & Token Crypto (stdlib scrypt + sha256)
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


# ---------------------------------------------------------------------------
# Rate Limiter (in-memory sliding window)
# ---------------------------------------------------------------------------

_rate_lock = threading.Lock()
_rate_buckets: dict[str, list[float]] = {}


def check_rate_limit(key: str, limit: int, window_sec: float) -> bool:
    now = time.monotonic()
    with _rate_lock:
        arr = _rate_buckets.get(key, [])
        arr = [t for t in arr if now - t < window_sec]
        if len(arr) >= limit:
            _rate_buckets[key] = arr
            return False
        arr.append(now)
        _rate_buckets[key] = arr
        return True


# ---------------------------------------------------------------------------
# Database Layer
# ---------------------------------------------------------------------------

_db_lock = threading.RLock()


def open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


DB = open_db()


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
            """
        )

        # Seed UID counter starting at 10000
        DB.execute("INSERT OR IGNORE INTO meta_seq(name, val) VALUES ('uid', 10000)")

        # Seed default release metadata if absent
        row = DB.execute("SELECT v FROM kv_store WHERE k = 'release'").fetchone()
        if not row:
            DB.execute(
                "INSERT INTO kv_store(k, v, updated_at) VALUES ('release', ?, ?)",
                (json.dumps(DEFAULT_RELEASE, ensure_ascii=False), now_ms()),
            )

        # Seed opening announcements if table is empty
        cnt = DB.execute("SELECT COUNT(*) AS c FROM announcements").fetchone()["c"]
        if cnt == 0:
            ts = now_ms()
            DB.executemany(
                "INSERT INTO announcements(badge, title, content, pinned, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                [
                    (
                        "置顶",
                        "九州一区 · 腾讯云专属服务器正式开服",
                        "欢迎各位史官登临《列国纪》专属云服务器！\n\n"
                        "• 全双工主动推流（EngineWire v6 + LZ4 压缩）：国内实测延迟 20–40 ms，千军万马 60fps 丝滑推演，手机几乎零发热。\n"
                        "• 账号云端存档：登录账号后上传世界卷宗，更换设备随时秒级下载接续霸业。\n"
                        "• 每日临朝签到与天下史榜现已开启，铭刻你的盛世皇朝留名青史！",
                        1,
                        ts,
                    ),
                    (
                        "更新",
                        "云端自动检测更新与热更系统上线",
                        "即日起每次进入游戏均会自动检测最新客户端版本与云端热更配置包：\n"
                        "1. 平衡参数、推演节拍与公告支持自动热加载，无需重装立即生效；\n"
                        "2. 新版本发布后将在启动时呈递「天诏更新卷」，支持一键从国内专属服务器极速下载更新。",
                        0,
                        ts - 60_000,
                    ),
                ],
            )

        # Seed global broadcast welcome mail if absent
        mcnt = DB.execute("SELECT COUNT(*) AS c FROM mail WHERE user_id = '*'").fetchone()["c"]
        if mcnt == 0:
            DB.execute(
                "INSERT INTO mail(user_id, sender, title, content, created_at) VALUES ('*', ?, ?, ?, ?)",
                (
                    "兰台太史院",
                    "恭迎登临《列国纪》云端行宫",
                    "史官钧鉴：\n\n"
                    "《列国纪》专属云服务器已全面贯通。你现在可以：\n"
                    "一、在「名帖」中定制专属篆刻御印，每日临朝签到晋升品秩；\n"
                    "二、在「世界卷宗」中将心仪江山一键备份至账号云库，永不丢失；\n"
                    "三、随时将辉煌霸业铭刻入「天下史榜」，与四海同好共赏山河兴衰。\n\n"
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


def get_release_config() -> dict[str, Any]:
    with _db_lock:
        row = DB.execute("SELECT v FROM kv_store WHERE k = 'release'").fetchone()
    cfg = json.loads(row["v"]) if row else json.loads(json.dumps(DEFAULT_RELEASE))
    # Auto-detect locally hosted latest IPA if present in /data/downloads/
    latest_ipa = DOWNLOADS_DIR / "lieguoji-latest.ipa"
    if latest_ipa.exists() and latest_ipa.stat().st_size > 1_000_000:
        cfg["directIpaUrl"] = f"http://{PUBLIC_HOST}/downloads/lieguoji-latest.ipa"
        cfg["ipaSizeMB"] = round(latest_ipa.stat().st_size / (1024 * 1024), 1)
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
# Live Compute Server Health Probe (real EngineWire v6 TCP ping)
# ---------------------------------------------------------------------------

_probe_lock = threading.Lock()
_compute_state = {"online": False, "rttMs": None, "greeting": "", "checkedAt": 0}


def probe_compute_once() -> None:
    targets = [
        (COMPUTE_PROBE_HOST, COMPUTE_PROBE_PORT),
        ("172.17.0.1", COMPUTE_PROBE_PORT),
        (PUBLIC_HOST, COMPUTE_PROBE_PORT),
    ]
    for host, port in targets:
        try:
            t0 = time.perf_counter()
            with socket.create_connection((host, port), timeout=2.0) as s:
                s.settimeout(2.0)
                hdr = json.dumps({"call": "ping", "args": {"v": 6}}).encode("utf-8")
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
                with _probe_lock:
                    _compute_state["online"] = bool(obj.get("ok"))
                    _compute_state["rttMs"] = rtt
                    _compute_state["greeting"] = str(obj.get("reason", ""))
                    _compute_state["checkedAt"] = now_ms()
                return
        except Exception:
            continue
    with _probe_lock:
        _compute_state["online"] = False
        _compute_state["rttMs"] = None
        _compute_state["checkedAt"] = now_ms()


def start_probe_thread() -> None:
    def loop() -> None:
        while True:
            probe_compute_once()
            time.sleep(15)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def get_server_snapshot() -> dict[str, Any]:
    cutoff = now_ms() - 5 * 60 * 1000
    with _db_lock:
        online_users = DB.execute("SELECT COUNT(*) AS c FROM users WHERE last_seen_at >= ?", (cutoff,)).fetchone()["c"]
        total_users = DB.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        total_saves = DB.execute("SELECT COUNT(*) AS c FROM cloud_saves").fetchone()["c"]
    with _probe_lock:
        c_online = _compute_state["online"]
        c_greeting = _compute_state["greeting"]
    return {
        "name": SERVER_NAME,
        "region": SERVER_REGION,
        "publicHost": PUBLIC_HOST,
        "computeHost": COMPUTE_HOST,
        "computeOnline": c_online,
        "computeGreeting": c_greeting,
        "onlineCount": max(1, int(online_users)),
        "totalUsers": int(total_users),
        "totalSaves": int(total_saves),
        "uptimeSeconds": int(time.time() - START_TIME),
        "serverTimeMs": now_ms(),
    }


# ---------------------------------------------------------------------------
# User Serialization & Auth Helpers
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
    return {
        "id": uid,
        "username": row["username"] or "",
        "nickname": row["nickname"],
        "bio": row["bio"],
        "sealChar": row["seal_char"],
        "sealStyle": row["seal_style"],
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
            WHERE s.token_hash = ? AND s.expires_at > ?
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
        return "账号名须为 3–20 位字母、数字或下划线"
    if not re.match(r"^[A-Za-z0-9_\u4e00-\u9fff]+$", u):
        return "账号名仅支持中文、字母、数字或下划线"
    return None


def sanitize_seal_char(ch: str) -> str:
    ch = ch.strip()
    if not ch:
        return "龙"
    return ch[0]


def sanitize_seal_style(style: str) -> str:
    return style if style in ("cinnabar", "jade", "gold") else "cinnabar"


def compare_version(cur_ver: str, cur_build: int, latest_ver: str, latest_build: int) -> bool:
    if latest_build > 0 and cur_build > 0:
        if latest_build != cur_build:
            return latest_build > cur_build
    def parse(v: str) -> tuple[int, ...]:
        nums = re.findall(r"\d+", v)
        return tuple(int(x) for x in nums) if nums else (0,)
    return parse(latest_ver) > parse(cur_ver)


# ---------------------------------------------------------------------------
# Mobile Antique Parchment Landing / Download Page
# ---------------------------------------------------------------------------

def render_download_page() -> str:
    rel = get_release_config()
    srv = get_server_snapshot()
    ver = html.escape(str(rel.get("latestVersion", "5.3.0")))
    build = int(rel.get("latestBuild", 183))
    size_mb = rel.get("ipaSizeMB", 86.2)
    rel_date = html.escape(str(rel.get("releaseDate", "")))
    direct_url = str(rel.get("directIpaUrl") or "")
    gh_url = str(rel.get("downloadUrl") or "https://github.com/Ethanhui6/lieguoji-web/releases/latest")
    primary_url = html.escape(direct_url if direct_url else gh_url)
    primary_label = "国内服务器极速下载 IPA" if direct_url else "前往发布页下载最新 IPA"
    notes_html = "".join(f"<li>{html.escape(str(n))}</li>" for n in rel.get("releaseNotes", []))
    online_badge = "在线运行中" if srv["computeOnline"] else "启动中"
    uptime_h = round(srv["uptimeSeconds"] / 3600.0, 1)
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>列国纪 · 云端行宫与客户端更新</title>
<style>
  :root {{
    --paper: #F5F0E6; --paper2: #FAF7F0; --ink: #241D17; --ink2: #5E564E;
    --seal: #A83226; --jade: #3F5549; --gold: #B08D57; --line: rgba(36,29,23,0.13);
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 24px 16px 48px; background: var(--paper); color: var(--ink);
    font-family: "Kaiti SC", "STKaiti", "Songti SC", "PingFang SC", serif;
    line-height: 1.7;
  }}
  .wrap {{ max-width: 560px; margin: 0 auto; }}
  .card {{
    background: var(--paper2); border: 1px solid var(--line); border-radius: 14px;
    padding: 24px 20px; margin-bottom: 16px;
  }}
  .head {{ display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 16px; margin-bottom: 16px; }}
  .title {{ font-size: 28px; letter-spacing: 6px; margin: 0; }}
  .sub {{ font-size: 13px; color: var(--ink2); margin-top: 4px; }}
  .seal {{
    width: 44px; height: 44px; border: 2px solid var(--seal); border-radius: 7px;
    color: var(--seal); display: flex; align-items: center; justify-content: center;
    font-size: 22px; transform: rotate(-4deg); flex-shrink: 0;
  }}
  .meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; font-size: 13px; }}
  .chip {{ padding: 4px 10px; border-radius: 999px; background: rgba(36,29,23,0.05); color: var(--ink2); }}
  .chip.ok {{ background: rgba(63,85,73,0.12); color: var(--jade); }}
  .chip.ver {{ background: rgba(168,50,38,0.10); color: var(--seal); }}
  .btn {{
    display: block; width: 100%; text-align: center; text-decoration: none;
    background: var(--seal); color: #FAF7F0; padding: 14px 18px; border-radius: 10px;
    font-size: 17px; letter-spacing: 2px; margin-top: 12px;
  }}
  .btn.sec {{ background: transparent; color: var(--ink); border: 1px solid var(--line); font-size: 14px; padding: 11px; }}
  ul {{ padding-left: 18px; margin: 8px 0 0; color: var(--ink2); font-size: 14px; }}
  li {{ margin-bottom: 8px; }}
  .foot {{ text-align: center; font-size: 12px; color: var(--ink2); margin-top: 20px; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div>
          <h1 class="title">列國紀</h1>
          <div class="sub">云端行宫 · iOS 原生客户端与热更中心</div>
        </div>
        <div class="seal">龙</div>
      </div>
      <div class="meta">
        <span class="chip ver">最新版 v{ver}（构建 {build}）</span>
        <span class="chip">{size_mb} MB · {rel_date}</span>
        <span class="chip ok">专属云服 {online_badge} · {srv['onlineCount']} 人在线</span>
      </div>
      <a class="btn" href="{primary_url}">{primary_label}</a>
      {"<a class='btn sec' href='" + html.escape(gh_url) + "'>备用线路：GitHub Release 仓库</a>" if direct_url else ""}
    </div>
    <div class="card">
      <div style="font-size:16px;letter-spacing:2px;margin-bottom:6px;">本版天诏更新志</div>
      <ul>{notes_html}</ul>
    </div>
    <div class="card" style="font-size:13px;color:var(--ink2);">
      <div style="font-size:15px;color:var(--ink);margin-bottom:6px;">专属计算服直连信息</div>
      服务器：{html.escape(srv['name'])}<br/>
      推流地址：<code>{html.escape(srv['computeHost'])}</code>（v6 全双工主动推流 + LZ4）<br/>
      已注册史官：{srv['totalUsers']} 位 · 云端卷宗：{srv['totalSaves']} 卷 · 连续运行 {uptime_h} 小时
    </div>
    <div class="foot">列国纪 · 九州一区专属云端行宫</div>
  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# HTTP Request Handler
# ---------------------------------------------------------------------------

class PlatformHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    _body_consumed = False

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

    def log_message(self, fmt: str, *args: Any) -> None:
        # Compact structured log to stdout
        print(f"[{datetime.now(SHANGHAI_TZ).strftime('%H:%M:%S')}] {self.client_address[0]} {fmt % args}", flush=True)

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        self._drain_unread_body()
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def send_html(self, body: str, status: int = 200) -> None:
        self._drain_unread_body()
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(raw)

    def read_json_body(self, max_bytes: int = 512 * 1024) -> Optional[dict[str, Any]]:
        self._body_consumed = True
        cl = int(self.headers.get("Content-Length", "0") or "0")
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

    def require_admin(self) -> bool:
        key = (self.headers.get("X-Admin-Key") or "").strip()
        if not key or not hmac.compare_digest(key, ADMIN_SECRET):
            self.send_json({"ok": False, "error": "无权操作"}, 403)
            return False
        return True

    def do_HEAD(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path.startswith("/downloads/"):
            rel_name = path[len("/downloads/"):]
            safe = Path(rel_name).name
            target = DOWNLOADS_DIR / safe
            if safe and safe == rel_name and target.exists() and target.is_file():
                self.send_response(200)
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
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Admin-Key,X-Save-Encoding,X-Save-Title,X-Save-Date,X-Save-Nations,X-Save-Provinces,X-Save-Day,X-Save-Device")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ----------------------------- GET -----------------------------

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = urllib.parse.parse_qs(parsed.query)

        if path in ("/", "/download"):
            self.send_html(render_download_page())
            return

        if path.startswith("/downloads/"):
            self.handle_download_file(path[len("/downloads/"):])
            return

        if path == "/api/v1/ping":
            self.send_json({"ok": True, "server": "lieguoji-platform", "ts": now_ms()})
            return

        if path == "/api/v1/server/status":
            self.send_json({"ok": True, "server": get_server_snapshot()})
            return

        if path in ("/api/v1/bootstrap", "/api/v1/version"):
            self.handle_bootstrap(qs)
            return

        if path == "/api/v1/hotpatch":
            rel = get_release_config()
            self.send_json({"ok": True, "hotpatch": rel.get("hotpatch", {})})
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

        self.send_json({"ok": False, "error": "未知接口路径"}, 404)

    # ----------------------------- POST -----------------------------

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

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
        if path == "/api/v1/admin/release":
            self.handle_admin_release()
            return
        if path == "/api/v1/admin/announcement":
            self.handle_admin_announcement()
            return

        self.send_json({"ok": False, "error": "未知接口路径"}, 404)

    # ----------------------------- PATCH / PUT / DELETE -----------------------------

    def do_PATCH(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path == "/api/v1/auth/profile":
            self.handle_update_profile()
            return
        self.send_json({"ok": False, "error": "未知接口路径"}, 404)

    def do_PUT(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path.startswith("/api/v1/saves/"):
            auth = self.require_auth()
            if not auth:
                return
            save_id = urllib.parse.unquote(path[len("/api/v1/saves/"):])
            self.handle_save_upload(auth[0]["id"], save_id)
            return
        self.send_json({"ok": False, "error": "未知接口路径"}, 404)

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path.startswith("/api/v1/saves/"):
            auth = self.require_auth()
            if not auth:
                return
            save_id = urllib.parse.unquote(path[len("/api/v1/saves/"):])
            self.handle_save_delete(auth[0]["id"], save_id)
            return
        self.send_json({"ok": False, "error": "未知接口路径"}, 404)

    # ----------------------------- Handlers -----------------------------

    def handle_download_file(self, rel_name: str) -> None:
        safe = Path(rel_name).name
        if not safe or safe != rel_name or safe.startswith("."):
            self.send_json({"ok": False, "error": "非法文件名"}, 400)
            return
        target = DOWNLOADS_DIR / safe
        if not target.exists() or not target.is_file():
            self.send_json({"ok": False, "error": "安装包尚未上传至此节点"}, 404)
            return
        size = target.stat().st_size
        start = 0
        end = size - 1
        status = 200
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            try:
                spec = rng[6:].split(",")[0].strip()
                s_str, e_str = spec.split("-", 1)
                if s_str:
                    start = int(s_str)
                if e_str:
                    end = min(size - 1, int(e_str))
                if 0 <= start <= end < size:
                    status = 206
            except Exception:
                start, end, status = 0, size - 1, 200
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{safe}"')
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with target.open("rb") as f:
            f.seek(start)
            rem = length
            while rem > 0:
                chunk = f.read(min(256 * 1024, rem))
                if not chunk:
                    break
                self.wfile.write(chunk)
                rem -= len(chunk)

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
        latest_ver = str(rel.get("latestVersion", "5.3.0"))
        latest_build = int(rel.get("latestBuild", 183))
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
                    "ipaSizeMB": rel.get("ipaSizeMB", 86.0),
                    "downloadUrl": rel.get("downloadUrl", ""),
                    "directIpaUrl": rel.get("directIpaUrl", ""),
                    "webDownloadUrl": rel.get("webDownloadUrl", f"http://{PUBLIC_HOST}/download"),
                    "releaseNotes": rel.get("releaseNotes", []),
                },
                "hotpatch": {
                    "hasPatchUpdate": has_patch,
                    "patchVersion": patch_ver,
                    "summary": hp.get("summary", ""),
                    "updatedAt": int(hp.get("updatedAt", 0)),
                    "sha256": hp.get("sha256", ""),
                    "config": hp.get("config", {}) if (has_patch or cur_patch == 0) else None,
                },
                "server": get_server_snapshot(),
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
        if not check_rate_limit(f"reg:{self.client_address[0]}", 12, 300):
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
        if len(nickname) > 16:
            nickname = nickname[:16]

        uid = next_uid()
        ts = now_ms()
        pw_hash = hash_password(password)
        try:
            with _db_lock:
                DB.execute(
                    """
                    INSERT INTO users(id, username, password_hash, nickname, seal_char, seal_style, is_guest, exp, created_at, last_login_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 20, ?, ?, ?)
                    """,
                    (uid, username, pw_hash, nickname, seal_char, seal_style, ts, ts, ts),
                )
                DB.commit()
                user_row = DB.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        except sqlite3.IntegrityError:
            self.send_json({"ok": False, "error": "此账号名已有史官占用，请另择雅号"}, 409)
            return

        token = create_session(uid, device_name, app_version)
        self.send_json({"ok": True, "token": token, "user": serialize_user(user_row)}, 201)

    def handle_login(self) -> None:
        if not check_rate_limit(f"login:{self.client_address[0]}", 20, 300):
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
            self.send_json({"ok": False, "error": "账号或密令有误，请核对后重试"}, 401)
            return
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
                user_row = DB.execute("SELECT * FROM users WHERE device_id = ? AND is_guest = 1", (device_id,)).fetchone()
        if user_row is None:
            uid = next_uid()
            ts = now_ms()
            suffix = uid[-4:]
            nickname = f"游历史官·{suffix}"
            with _db_lock:
                DB.execute(
                    """
                    INSERT INTO users(id, username, password_hash, nickname, seal_char, seal_style, is_guest, device_id, exp, created_at, last_login_at, last_seen_at)
                    VALUES (?, NULL, ?, ?, '史', 'jade', 1, ?, 10, ?, ?, ?)
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
        try:
            with _db_lock:
                DB.execute(
                    "UPDATE users SET username = ?, password_hash = ?, nickname = ?, is_guest = 0, exp = exp + 20 WHERE id = ?",
                    (username, hash_password(password), nickname[:16], user_row["id"]),
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
            _, token_h = auth
            with _db_lock:
                DB.execute("DELETE FROM sessions WHERE token_hash = ?", (token_h,))
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
        bonus = min(10, (streak - 1) * 2)
        gained = 15 + bonus
        with _db_lock:
            DB.execute(
                "UPDATE users SET checkin_streak = ?, total_checkins = total_checkins + 1, last_checkin_date = ?, exp = exp + ? WHERE id = ?",
                (streak, today, gained, user_row["id"]),
            )
            DB.commit()
            fresh = DB.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
        msg = f"临朝落印成礼！连签 {streak} 日，获史馆功勋 +{gained}"
        self.send_json({"ok": True, "already": False, "gainedExp": gained, "message": msg, "user": serialize_user(fresh)})

    def handle_heartbeat(self) -> None:
        auth = authenticate_token(self.headers.get("Authorization"))
        snap = get_server_snapshot()
        self.send_json({"ok": True, "authenticated": auth is not None, "server": snap})

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
                    SELECT u.id AS user_id, u.nickname, u.seal_char, u.seal_style, u.exp, u.checkin_streak,
                           COALESCE(l.world_title, '') AS world_title,
                           COALESCE(l.top_nation, '') AS top_nation,
                           COALESCE(l.provinces_held, 0) AS provinces_held,
                           COALESCE(l.years_elapsed, 0) AS years_elapsed,
                           COALESCE(l.wonders_count, 0) AS wonders_count
                    FROM users u
                    LEFT JOIN leaderboard l ON l.user_id = u.id
                    ORDER BY u.exp DESC, u.total_checkins DESC
                    LIMIT 30
                    """
                ).fetchall()
            else:
                order_col = "l.years_elapsed DESC, l.provinces_held DESC" if category == "years" else "l.provinces_held DESC, l.years_elapsed DESC"
                rows = DB.execute(
                    f"""
                    SELECT u.id AS user_id, u.nickname, u.seal_char, u.seal_style, u.exp, u.checkin_streak,
                           l.world_title, l.top_nation, l.provinces_held, l.years_elapsed, l.wonders_count
                    FROM leaderboard l
                    JOIN users u ON u.id = l.user_id
                    ORDER BY {order_col}
                    LIMIT 30
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
        provinces_held = max(0, min(5000, int(body.get("provincesHeld", 0) or 0)))
        total_days = max(0, min(10_000_000, int(body.get("totalDays", 0) or 0)))
        years_elapsed = max(0, min(50_000, int(body.get("yearsElapsed", total_days // 365) or 0)))
        nations_count = max(0, min(500, int(body.get("nationsCount", 0) or 0)))
        wars_count = max(0, min(100_000, int(body.get("warsCount", 0) or 0)))
        wonders_count = max(0, min(50, int(body.get("wondersCount", 0) or 0)))

        ts = now_ms()
        with _db_lock:
            existed = DB.execute("SELECT 1 FROM leaderboard WHERE user_id = ?", (user_row["id"],)).fetchone()
            DB.execute(
                """
                INSERT INTO leaderboard(user_id, world_title, top_nation, provinces_held, total_days, years_elapsed, nations_count, wars_count, wonders_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    world_title=excluded.world_title,
                    top_nation=excluded.top_nation,
                    provinces_held=excluded.provinces_held,
                    total_days=excluded.total_days,
                    years_elapsed=excluded.years_elapsed,
                    nations_count=excluded.nations_count,
                    wars_count=excluded.wars_count,
                    wonders_count=excluded.wonders_count,
                    updated_at=excluded.updated_at
                """,
                (user_row["id"], world_title, top_nation, provinces_held, total_days, years_elapsed, nations_count, wars_count, wonders_count, ts),
            )
            if not existed:
                DB.execute("UPDATE users SET exp = exp + 20 WHERE id = ?", (user_row["id"],))
            DB.commit()
            fresh = DB.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
        self.send_json({"ok": True, "user": serialize_user(fresh)})

    # ----------------------------- Account Cloud Saves -----------------------------

    def handle_saves_list(self, user_id: str) -> None:
        with _db_lock:
            rows = DB.execute(
                "SELECT id, title, date_text, nations, provinces, day, size_bytes, encoding, device, updated_at "
                "FROM cloud_saves WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
        saves = [
            {
                "id": r["id"],
                "title": r["title"],
                "date": r["date_text"],
                "nations": int(r["nations"]),
                "provinces": int(r["provinces"]),
                "day": int(r["day"]),
                "sizeBytes": int(r["size_bytes"]),
                "updatedAt": float(r["updated_at"]),
                "device": r["device"],
                "encoding": r["encoding"],
            }
            for r in rows
        ]
        self.send_json({"ok": True, "saves": saves})

    def handle_save_upload(self, user_id: str, save_id: str) -> None:
        safe_id = re.sub(r"[^A-Za-z0-9_\-]", "", save_id)[:64]
        if not safe_id:
            self.send_json({"ok": False, "reason": "存档编号无效"}, 400)
            return
        cl = int(self.headers.get("Content-Length", "0") or "0")
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
        user_dir = SAVES_DIR / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        fpath = user_dir / f"{safe_id}.bin"
        tmp = user_dir / f"{safe_id}.tmp"
        tmp.write_bytes(payload)
        tmp.replace(fpath)

        def hdr(name: str, default: str = "") -> str:
            v = self.headers.get(name, default)
            return urllib.parse.unquote(v) if v else default

        title = hdr("X-Save-Title", "当前世界")[:40]
        date_text = hdr("X-Save-Date", "")[:32]
        nations = int(hdr("X-Save-Nations", "0") or "0")
        provinces = int(hdr("X-Save-Provinces", "0") or "0")
        day = int(hdr("X-Save-Day", "0") or "0")
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

        card = {
            "id": safe_id,
            "title": title,
            "date": date_text,
            "nations": nations,
            "provinces": provinces,
            "day": day,
            "sizeBytes": len(payload),
            "updatedAt": float(ts),
            "device": device,
            "encoding": encoding,
        }
        self.send_json({"ok": True, "save": card})

    def handle_save_download(self, user_id: str, save_id: str) -> None:
        safe_id = re.sub(r"[^A-Za-z0-9_\-]", "", save_id)[:64]
        with _db_lock:
            row = DB.execute("SELECT file_path, encoding FROM cloud_saves WHERE user_id = ? AND id = ?", (user_id, safe_id)).fetchone()
        if not row:
            self.send_json({"ok": False, "error": "云端存档不存在"}, 404)
            return
        fpath = Path(row["file_path"])
        if not fpath.exists():
            self.send_json({"ok": False, "error": "存档文件已缺失"}, 404)
            return
        data = fpath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("X-Save-Encoding", row["encoding"])
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

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

    # ----------------------------- Admin Endpoints -----------------------------

    def handle_admin_release(self) -> None:
        if not self.require_admin():
            return
        body = self.read_json_body()
        if body is None:
            return
        cur = get_release_config()
        for k in ("latestVersion", "latestBuild", "minSupportedBuild", "forceUpdate", "releaseDate", "ipaSizeMB", "downloadUrl", "directIpaUrl", "webDownloadUrl", "releaseNotes"):
            if k in body:
                cur[k] = body[k]
        if "hotpatch" in body and isinstance(body["hotpatch"], dict):
            hp = cur.get("hotpatch", {})
            hp.update(body["hotpatch"])
            if "config" in hp and isinstance(hp["config"], dict):
                hp["sha256"] = compute_hotpatch_sha(hp["config"])
            hp["updatedAt"] = now_ms()
            cur["hotpatch"] = hp
        save_release_config(cur)
        self.send_json({"ok": True, "release": get_release_config()})

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


def main() -> None:
    init_db()
    probe_compute_once()
    start_probe_thread()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), PlatformHandler)
    server.daemon_threads = True
    print(f"列国纪云端行宫平台服务器 v1.0 已启动：http://0.0.0.0:{PORT}（公网 http://{PUBLIC_HOST}）", flush=True)
    print(f"绑定计算节点：{COMPUTE_HOST} · 数据目录：{DATA_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
