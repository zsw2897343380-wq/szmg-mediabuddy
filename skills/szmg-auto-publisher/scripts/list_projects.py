#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
list_projects.py
获取用户的 GitLab 项目组和项目列表。

用法:
  # 列出所有项目组
  python list_projects.py --username USER --token TOKEN

  # 列出指定项目组下的所有项目
  python list_projects.py --username USER --token TOKEN --group group_path

  # 列出用户有权限的所有项目（不含 group 过滤）
  python list_projects.py --username USER --token TOKEN --all-projects

  # JSON 格式输出（方便程序解析）
  python list_projects.py --username USER --token TOKEN --group group_path --json

参数:
  --gitlab-url       GitLab 地址（默认：https://git.sztv.com.cn）
  --username          GitLab 用户名
  --token             GitLab Token（Personal Access Token）
  --group             项目组路径或 ID，指定后列出该项目组下的项目
  --all-projects      列出用户有权限的所有项目（忽略 group）
  --json              以 JSON 格式输出结果
  --page-size         每页数量（默认 50）
"""

import argparse
import sys
import urllib.request
import urllib.parse
import urllib.error
import json
import base64


GITLAB_URL = "https://git.sztv.com.cn"


def get_auth_headers(gitlab_url: str, username: str, token: str) -> dict:
    """构造认证请求头"""
    if token.startswith("glpat-") or len(token) >= 20:
        return {"PRIVATE-TOKEN": token, "Content-Type": "application/json"}
    else:
        creds = base64.b64encode(f"{username}:{token}".encode()).decode()
        return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}


def gitlab_api_request(gitlab_url: str, username: str, token: str,
                       endpoint: str, method: str = "GET", data: dict = None,
                       params: dict = None, per_page: int = 50) -> dict:
    """发送 GitLab API 请求，自动处理分页（合并所有页）"""
    headers = get_auth_headers(gitlab_url, username, token)
    all_items = []

    page = 1
    while True:
        real_params = dict(params) if params else {}
        real_params["page"] = page
        real_params["per_page"] = per_page

        query = urllib.parse.urlencode(real_params, doseq=True)
        url = f"{gitlab_url}{endpoint}?{query}"
        req = urllib.request.Request(url, method=method)
        for k, v in headers.items():
            req.add_header(k, v)
        if data and method in ("POST", "PUT", "DELETE"):
            req.data = json.dumps(data).encode("utf-8")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                items = json.loads(resp.read().decode("utf-8"))
                if isinstance(items, list):
                    all_items.extend(items)
                    # 用 X-Next-Page 判断是否还有更多页（比 X-Total-Pages 更可靠）
                    next_page = resp.headers.get("X-Next-Page")
                    if not next_page or next_page == "":
                        break
                    page = int(next_page)
                else:
                    return items
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] API 请求失败 (HTTP {e.code}): {endpoint}", file=sys.stderr)
            print(f"        响应: {body[:300]}", file=sys.stderr)
            sys.exit(1)
        except Exception as ex:
            print(f"[ERROR] 网络请求异常: {ex}", file=sys.stderr)
            sys.exit(1)

    return all_items


def list_groups(gitlab_url: str, username: str, token: str, per_page: int = 50) -> list:
    """获取用户有权访问的项目组列表"""
    print("正在获取项目组列表...", file=sys.stderr)
    return gitlab_api_request(
        gitlab_url, username, token,
        "/api/v4/groups",
        params={"all_available": "false", "order_by": "name", "sort": "asc"},
        per_page=per_page
    )


def list_group_projects(gitlab_url: str, username: str, token: str,
                        group_path: str, per_page: int = 50) -> list:
    """获取指定项目组下的项目列表"""
    encoded = urllib.parse.quote(group_path, safe="")
    print(f"正在获取项目组 '{group_path}' 下的项目列表...", file=sys.stderr)
    return gitlab_api_request(
        gitlab_url, username, token,
        f"/api/v4/groups/{encoded}/projects",
        params={"order_by": "name", "sort": "asc", "archived": "false"},
        per_page=per_page
    )


def list_all_projects(gitlab_url: str, username: str, token: str, per_page: int = 50) -> list:
    """获取用户有权限的所有项目列表"""
    print("正在获取所有项目列表...", file=sys.stderr)
    return gitlab_api_request(
        gitlab_url, username, token,
        "/api/v4/projects",
        params={
            "membership": "true",
            "order_by": "name",
            "sort": "asc",
            "archived": "false",
            "min_access_level": 20,  # Reporter 及以上
        },
        per_page=per_page
    )


def print_groups_table(groups: list):
    """以表格形式打印项目组列表"""
    if not groups:
        print("\n未找到任何项目组。")
        return

    print(f"\n找到 {len(groups)} 个项目组：\n")
    print(f"{'ID':<8} {'路径':<30} {'名称':<30} {'描述'}")
    print("-" * 100)
    for g in groups:
        gid = g.get("id", "")
        path = g.get("path", "")
        name = g.get("name", "")
        desc = (g.get("description") or "")[:40]
        print(f"{gid:<8} {path:<30} {name:<30} {desc}")


def print_projects_table(projects: list):
    """以表格形式打印项目列表"""
    if not projects:
        print("\n未找到任何项目。")
        return

    print(f"\n找到 {len(projects)} 个项目：\n")
    print(f"{'ID':<8} {'项目路径':<40} {'名称':<25} {'默认分支':<12} {'可见性'}")
    print("-" * 110)
    for p in projects:
        pid = p.get("id", "")
        path = p.get("path_with_namespace", p.get("path", ""))
        name = p.get("name", "")
        branch = p.get("default_branch") or "-"
        visibility = p.get("visibility", "")
        print(f"{pid:<8} {path:<40} {name:<25} {branch:<12} {visibility}")


def main():
    parser = argparse.ArgumentParser(
        description="获取 GitLab 项目组和项目列表",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 列出所有项目组
  python list_projects.py --username john --token glpat-xxxx

  # 列出指定项目组下的项目
  python list_projects.py --username john --token glpat-xxxx --group mygroup

  # 列出用户有权限的所有项目
  python list_projects.py --username john --token glpat-xxxx --all-projects

  # JSON 格式输出
  python list_projects.py --username john --token glpat-xxxx --group mygroup --json
        """
    )
    parser.add_argument("--gitlab-url", default=GITLAB_URL,
                        help="GitLab 地址（默认：https://git.sztv.com.cn）")
    parser.add_argument("--username", required=True, help="GitLab 用户名")
    parser.add_argument("--token", required=True,
                        help="GitLab Token（Personal Access Token）")
    parser.add_argument("--group",
                        help="项目组路径或 ID，指定后列出该项目组下的项目")
    parser.add_argument("--all-projects", action="store_true",
                        help="列出用户有权限的所有项目（忽略 --group）")
    parser.add_argument("--json", action="store_true",
                        help="以 JSON 格式输出结果")
    parser.add_argument("--page-size", type=int, default=50,
                        help="每页数量（默认 50）")

    args = parser.parse_args()
    gitlab_url = args.gitlab_url.rstrip("/")
    per_page = args.page_size

    # JSON 输出模式：直接输出 JSON，不包含 stderr 进度信息
    if args.json:
        if args.all_projects:
            projects = list_all_projects(gitlab_url, args.username, args.token, per_page)
            print(json.dumps(projects, ensure_ascii=False, indent=2))
        elif args.group:
            projects = list_group_projects(gitlab_url, args.username, args.token, args.group, per_page)
            print(json.dumps(projects, ensure_ascii=False, indent=2))
        else:
            groups = list_groups(gitlab_url, args.username, args.token, per_page)
            print(json.dumps(groups, ensure_ascii=False, indent=2))
        return

    # 表格输出模式
    if args.all_projects:
        projects = list_all_projects(gitlab_url, args.username, args.token, per_page)
        print_projects_table(projects)
    elif args.group:
        projects = list_group_projects(gitlab_url, args.username, args.token, args.group, per_page)
        print_projects_table(projects)
    else:
        groups = list_groups(gitlab_url, args.username, args.token, per_page)
        print_groups_table(groups)
        print(f"\n提示：使用 --group <路径> 查看项目组下的项目，如 --group {groups[0].get('path', 'xxx') if groups else 'mygroup'}")


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
