#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_update.py
检查 szmg-auto-publisher Skill 是否有新版本。

通过 GET 请求 SkillHub API 获取远端最新版本号，
与本地安装版本号对比，判断是否需要更新。

用法:
  python check_update.py

退出码:
  0  — 当前已是最新版本
  1  — 有新版本可用（或无法判断，默认提示用户检查）
  2  — 网络错误，无法检查

缓存文件:
  .clawhub/.version-cache (与 SKILL.md 同目录)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

# ── 配置 ──────────────────────────────────────────────────
SKILLHUB_API = "https://skillhub.scms.sztv.com.cn/api/v1/skills/szmg-auto-publisher"
SKILLHUB_PAGE = "https://skillhub.scms.sztv.com.cn/space/global/szmg-auto-publisher"
REQUEST_TIMEOUT = 10  # 秒

# 获取脚本所在目录 → skill 根目录 → .clawhub/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_ROOT = os.path.dirname(SCRIPT_DIR)
CLAWHUB_DIR = os.path.join(SKILL_ROOT, ".clawhub")
ORIGIN_FILE = os.path.join(CLAWHUB_DIR, "origin.json")
CACHE_FILE = os.path.join(CLAWHUB_DIR, ".version-cache")


def _load_origin():
    """读取 origin.json 获取本地安装信息。"""
    if not os.path.isfile(ORIGIN_FILE):
        return {}
    try:
        with open(ORIGIN_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _load_cache():
    """读取本地版本缓存。"""
    if not os.path.isfile(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(data: dict):
    """写入版本缓存。"""
    os.makedirs(CLAWHUB_DIR, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _fetch_skillhub():
    """
    GET 请求 SkillHub API，返回 (remote_version, error_string)。
    成功时 error_string 为 None，remote_version 为远端最新版本号字符串。
    """
    req = urllib.request.Request(SKILLHUB_API, method="GET")
    req.add_header("User-Agent", "szmg-auto-publisher/check_update")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            version = data.get("latestVersion", {}).get("version", "")
            if version:
                return version, None
            return "", "远端返回数据中缺少 latestVersion.version"
    except urllib.error.HTTPError as e:
        return "", f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return "", f"网络错误: {e.reason}"
    except (json.JSONDecodeError, KeyError) as e:
        return "", f"解析远端响应失败: {e}"
    except Exception as e:
        return "", f"未知错误: {e}"


def main():
    origin = _load_origin()
    cache = _load_cache()
    installed_version = origin.get("installedVersion", "未知")

    # 0) 频率控制：24 小时内最多检查一次
    last_check = cache.get("last_check", 0)
    last_remote_version = cache.get("last_remote_version", "")
    if last_check:
        ago = int(time.time()) - last_check
        if ago < 86400 and last_remote_version:
            print(f"[OK] {ago // 3600} 小时前已检查过，跳过（远端版本: {last_remote_version}）")
            return 0

    print(f"[INFO] 当前安装版本: {installed_version}")
    print(f"[INFO] 检查远端: {SKILLHUB_API}")
    print()

    # 1) 获取远端最新版本号
    remote_version, error = _fetch_skillhub()

    if error:
        # 网络不可达时，用缓存判断
        if last_check and last_remote_version:
            ago = int(time.time()) - last_check
            if ago < 86400:
                print(f"[OK] 上次检查 {ago // 3600} 小时前，跳过（网络不可达: {error}）")
                return 0
        print(f"[WARN] 无法连接 SkillHub（{error}），请手动检查更新:")
        print(f"       {SKILLHUB_PAGE}")
        return 2

    # 2) 远端版本号有效性检查
    if not remote_version:
        print("[WARN] 无法从远端获取最新版本号")
        print(f"       请手动访问页面检查: {SKILLHUB_PAGE}")
        return 1

    print(f"[INFO] 远端最新版本: {remote_version}")
    print(f"[INFO] 本地安装版本: {installed_version}")
    print()

    # 3) 更新缓存
    now = int(time.time())
    cache["last_check"] = now
    cache["last_remote_version"] = remote_version
    _save_cache(cache)

    # 4) 版本对比
    if remote_version == installed_version:
        print(f"[OK] 已是最新版本（{installed_version}）")
        return 0

    # 远端版本 ≠ 本地版本 → 可能有新版本
    print(f"╔══════════════════════════════════════════════════╗")
    print(f"║  ⚠️  SkillHub 上有可用更新！                      ║")
    print(f"╠══════════════════════════════════════════════════╣")
    print(f"║  当前安装版本:  {installed_version:<34}║")
    print(f"║  远端最新版本:  {remote_version:<34}║")
    print(f"╠══════════════════════════════════════════════════╣")
    print(f"║  下载地址:                                      ║")
    print(f"║  {SKILLHUB_PAGE:<46}║")
    print(f"╠══════════════════════════════════════════════════╣")
    print(f"║  提示: 下载最新 zip 包后，重新安装即可。         ║")
    print(f"╚══════════════════════════════════════════════════╝")
    return 1


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    sys.exit(main())
