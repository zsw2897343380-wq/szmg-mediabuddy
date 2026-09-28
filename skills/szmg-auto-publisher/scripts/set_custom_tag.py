#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
set_custom_tag.py
通过 GitLab API 设置项目环境变量 CUSTOM_TAG 的值。

用法:
  python set_custom_tag.py --gitlab-url https://git.sztv.com.cn
                            --gitlab-project group/repo
                            --username your_username
                            --token your_token
                            --tag-value prod-1.0.0

功能:
  - 自动检测 CUSTOM_TAG 是否存在（GET）
  - 不存在（404）→ 自动创建（POST）
  - 已存在 → 自动更新为指定值（PUT）
  - 支持自定义变量属性（protected、masked、variable_type）
"""

import argparse
import sys
import json
import urllib.request
import urllib.parse
import urllib.error


def get_auth_headers(gitlab_url: str, username: str, token: str) -> dict:
    """获取认证 Header（PRIVATE-TOKEN 或 Basic Auth）"""
    headers = {"Content-Type": "application/json"}
    if token.startswith("glpat-") or len(token) >= 20:
        headers["PRIVATE-TOKEN"] = token
    else:
        import base64
        creds = base64.b64encode(f"{username}:{token}".encode()).decode()
        headers["Authorization"] = f"Basic {creds}"
    return headers


def set_custom_tag(gitlab_url: str, gitlab_project: str,
                   username: str, token: str, tag_value: str,
                   protected: bool = False, masked: bool = False) -> bool:
    """
    设置 CUSTOM_TAG 变量的值为 tag_value。
    不存在则创建，已存在则更新。
    返回 True/False。
    """
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    base_url = f"{gitlab_url}/api/v4/projects/{encoded_path}/variables"
    headers = get_auth_headers(gitlab_url, username, token)

    print(f"[INFO] 目标变量: CUSTOM_TAG")
    print(f"[INFO] 目标值:   {tag_value}")

    # ── 第1步：尝试 GET，检查变量是否已存在 ──
    check_req = urllib.request.Request(f"{base_url}/CUSTOM_TAG", method="GET")
    for key, val in headers.items():
        check_req.add_header(key, val)

    try:
        with urllib.request.urlopen(check_req, timeout=15) as resp:
            # ── 已存在：使用 PUT 更新值 ──
            existing = json.loads(resp.read().decode("utf-8"))
            existing_value = existing.get("value", "")
            print(f"[INFO] CUSTOM_TAG 已存在，当前值: {existing_value}")

            if existing_value == tag_value:
                print(f"[OK] CUSTOM_TAG 值已是最新: {tag_value}")
                return True

            print(f"[INFO] 正在更新 CUSTOM_TAG: {existing_value} -> {tag_value}")
            update_req = urllib.request.Request(f"{base_url}/CUSTOM_TAG", method="PUT")
            for key, val in headers.items():
                update_req.add_header(key, val)
            update_req.data = json.dumps({"value": tag_value}).encode("utf-8")

            with urllib.request.urlopen(update_req, timeout=15) as up_resp:
                if up_resp.status in (200, 201):
                    print(f"[OK] CUSTOM_TAG 已更新: {existing_value} -> {tag_value}")
                    return True
                else:
                    body = up_resp.read().decode("utf-8", errors="replace")
                    print(f"[ERROR] 更新 CUSTOM_TAG 失败 (HTTP {up_resp.status}): {body}")
                    return False

    except urllib.error.HTTPError as e:
        if e.code == 404:
            # ── 不存在：使用 POST 创建 ──
            print(f"[INFO] CUSTOM_TAG 不存在，正在创建（值: {tag_value}）...")
            create_req = urllib.request.Request(base_url, method="POST")
            for key, val in headers.items():
                create_req.add_header(key, val)
            create_req.data = json.dumps({
                "key": "CUSTOM_TAG",
                "value": tag_value,
                "variable_type": "env_var",
                "protected": protected,
                "masked": masked,
            }).encode("utf-8")

            try:
                with urllib.request.urlopen(create_req, timeout=15) as cr:
                    if cr.status in (200, 201):
                        print(f"[OK] CUSTOM_TAG 已创建，值: {tag_value}")
                        return True
                    else:
                        body = cr.read().decode("utf-8", errors="replace")
                        print(f"[ERROR] 创建 CUSTOM_TAG 失败 (HTTP {cr.status}): {body}")
                        return False
            except urllib.error.HTTPError as ce:
                body = ce.read().decode("utf-8", errors="replace")
                print(f"[ERROR] 创建 CUSTOM_TAG 失败 (HTTP {ce.code}): {body}")
                return False

        else:
            body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] 检查 CUSTOM_TAG 失败 (HTTP {e.code}): {body}")
            return False

    except Exception as ex:
        print(f"[ERROR] 操作 CUSTOM_TAG 时发生异常: {ex}")
        return False


def main():
    parser = argparse.ArgumentParser(description="通过 GitLab API 设置 CUSTOM_TAG 变量")
    parser.add_argument("--gitlab-url", default="https://git.sztv.com.cn", help="GitLab 地址")
    parser.add_argument("--gitlab-project", required=True, help="GitLab 项目路径，如 group/repo")
    parser.add_argument("--username", required=True, help="GitLab 用户名")
    parser.add_argument("--token", required=True, help="GitLab Token（Personal Access Token）")
    parser.add_argument("--tag-value", required=True, help="CUSTOM_TAG 的值（完整 tag 名，如 prod-1.0.0）")
    parser.add_argument("--protected", action="store_true", help="设置变量为 Protected")
    parser.add_argument("--masked", action="store_true", help="设置变量为 Masked")
    args = parser.parse_args()

    print(f"[INFO] GitLab URL:  {args.gitlab_url}")
    print(f"[INFO] 项目:        {args.gitlab_project}")
    print(f"[INFO] 变量:        CUSTOM_TAG")
    print(f"[INFO] 目标值:      {args.tag_value}")
    print()

    success = set_custom_tag(
        args.gitlab_url, args.gitlab_project,
        args.username, args.token, args.tag_value,
        args.protected, args.masked
    )

    if success:
        print(f"\n[SUCCESS] CUSTOM_TAG 已设置为: {args.tag_value}")
        sys.exit(0)
    else:
        print(f"\n[ERROR] CUSTOM_TAG 设置失败", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
