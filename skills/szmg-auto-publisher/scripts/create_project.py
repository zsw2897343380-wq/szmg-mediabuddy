#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
create_project.py
在 GitLab 上新建项目（远程仓库）。

用法:
  python create_project.py --gitlab-url https://git.sztv.com.cn
                            --username your_username
                            --token your_token
                            --gitlab-project my-project
                            [--namespace mygroup]
                            [--visibility private|internal|public]
                            [--description "项目描述"]
                            [--initialize-with-readme]

参数:
  --gitlab-url            GitLab 地址（默认：https://git.sztv.com.cn）
  --username               GitLab 用户名
  --token                  GitLab Token（Personal Access Token）
  --gitlab-project        项目名称（必填，仅支持英文、数字、-、_）
  --namespace              命名空间/组（可选，如 mygroup；不填则创建在个人命名空间下）
  --visibility             可见性：private（默认）、internal、public
  --description             项目描述（可选）
  --initialize-with-readme  初始化时生成 README.md
"""

import argparse
import json
import re
import sys
import urllib.request
import urllib.parse
import urllib.error
import base64


GITLAB_URL = "https://git.sztv.com.cn"

# 项目名合法字符：英文、数字、-、_
PROJECT_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9\-_]*$")


def make_headers(token: str, username: str = None) -> dict:
    """构造认证请求头"""
    if token.startswith("glpat-") or len(token) >= 20:
        return {"PRIVATE-TOKEN": token, "Content-Type": "application/json"}
    else:
        creds = base64.b64encode(f"{username}:{token}".encode()).decode()
        return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}


def api_request(url: str, method: str = "GET", data: dict = None, headers: dict = None):
    """发送 GitLab API 请求，返回 (data, status_code)"""
    req = urllib.request.Request(url, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if data:
        req.data = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body), e.code
        except Exception:
            return {"error": body}, e.code
    except urllib.error.URLError as e:
        return {"error": str(e)}, 0


def validate_project_name(name: str) -> tuple:
    """校验项目名，返回 (合法, 错误信息)"""
    if not name:
        return False, "项目名称不能为空"
    if len(name) > 255:
        return False, "项目名称不能超过 255 个字符"
    if not PROJECT_NAME_RE.match(name):
        return False, "项目名称只能包含英文字母、数字、- 和 _，且必须以字母或数字开头"
    return True, ""


def get_namespace_id(gitlab_url: str, namespace: str, headers: dict) -> tuple:
    """
    根据命名空间名称查找其 ID。
    返回 (namespace_id, error_msg)。error_msg 非空表示失败。
    """
    encoded_ns = urllib.parse.quote(namespace, safe="")
    url = f"{gitlab_url}/api/v4/namespaces?search={encoded_ns}"
    data, status = api_request(url, headers=headers)

    if status != 200 or not isinstance(data, list):
        return None, f"查询命名空间失败 (HTTP {status})"

    # 精确匹配
    for ns in data:
        if ns.get("full_path", "") == namespace or ns.get("name", "") == namespace:
            return ns["id"], ""

    return None, f"未找到命名空间 '{namespace}'，请确认拼写正确，或先在 GitLab 上创建该 Group"


def create_project(gitlab_url: str, project_name: str, headers: dict,
                   namespace: str = "", visibility: str = "private",
                   description: str = "", init_readme: bool = False) -> tuple:
    """
    在 GitLab 上创建项目。
    返回 (success, project_info_or_error_msg, http_status)
    """
    url = f"{gitlab_url}/api/v4/projects"
    payload = {
        "name": project_name,
        "path": project_name,
        "visibility": visibility,
        "initialize_with_readme": init_readme,
    }

    if description:
        payload["description"] = description

    if namespace:
        ns_id, err = get_namespace_id(gitlab_url, namespace, headers)
        if err:
            return False, err, 0
        payload["namespace_id"] = ns_id

    data, status = api_request(url, method="POST", data=payload, headers=headers)

    if status in (200, 201):
        return True, data, status
    elif status == 400 and "has already been taken" in str(data.get("message", "")):
        return False, f"项目 '{project_name}' 已存在，请使用其他名称", status
    else:
        err_msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
        return False, f"创建失败 (HTTP {status}): {err_msg}", status


def check_project_exists(gitlab_url: str, gitlab_project: str, headers: dict) -> bool:
    """检查项目是否已存在"""
    encoded_path = urllib.parse.quote(gitlab_project, safe="")
    url = f"{gitlab_url}/api/v4/projects/{encoded_path}"
    _, status = api_request(url, headers=headers)
    return status == 200


def main():
    parser = argparse.ArgumentParser(description="在 GitLab 上新建项目")
    parser.add_argument("--gitlab-url", default=GITLAB_URL, help="GitLab 地址")
    parser.add_argument("--username", required=True, help="GitLab 用户名")
    parser.add_argument("--token", required=True, help="GitLab Token（Personal Access Token）")
    parser.add_argument("--gitlab-project", required=True, help="项目名称（英文，仅支持字母、数字、-、_）")
    parser.add_argument("--namespace", default="", help="命名空间/组名（如 mygroup，不填则创建在个人空间下）")
    parser.add_argument("--visibility", default="private", choices=["private", "internal", "public"], help="可见性")
    parser.add_argument("--description", default="", help="项目描述")
    parser.add_argument("--initialize-with-readme", action="store_true", help="初始化时生成 README.md")
    args = parser.parse_args()

    # ── 1. 校验项目名 ──
    valid, err_msg = validate_project_name(args.gitlab_project)
    if not valid:
        print(f"[ERROR] 项目名称不合法：{err_msg}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] 项目名称: {args.gitlab_project}")
    if args.namespace:
        print(f"[INFO] 命名空间: {args.namespace}")
        gitlab_project = f"{args.namespace}/{args.gitlab_project}"
    else:
        print(f"[INFO] 命名空间: 个人空间（{args.username}）")
        gitlab_project = f"{args.username}/{args.gitlab_project}"

    print(f"[INFO] 目标路径: {args.gitlab_url}/{gitlab_project}")

    # ── 2. 构造请求头 ──
    headers = make_headers(args.token, args.username)

    # ── 3. 检查是否已存在 ──
    if check_project_exists(args.gitlab_url, gitlab_project, headers):
        print(f"\n[WARN] 项目已存在：{args.gitlab_url}/{gitlab_project}")
        print(f"[INFO] 若需重新创建，请先在 GitLab 上删除该项目，或使用其他项目名称")
        sys.exit(1)

    # ── 4. 创建项目 ──
    print(f"\n[INFO] 正在创建项目...")
    success, result, status = create_project(
        args.gitlab_url, args.gitlab_project, headers,
        namespace=args.namespace,
        visibility=args.visibility,
        description=args.description,
        init_readme=args.initialize_with_readme
    )

    if success:
        proj = result
        print(f"\n[SUCCESS] 项目创建成功！🎉")
        print(f"  项目 ID:    {proj.get('id', '?')}")
        print(f"  项目名:     {proj.get('name', args.gitlab_project)}")
        print(f"  路径:       {proj.get('path_with_namespace', gitlab_project)}")
        print(f"  SSH URL:    {proj.get('ssh_url_to_repo', 'N/A')}")
        print(f"  HTTP URL:   {proj.get('http_url_to_repo', 'N/A')}")
        print(f"  Web URL:    {proj.get('web_url', 'N/A')}")
        print(f"  可见性:     {proj.get('visibility', args.visibility)}")
        print(f"\n  后续可推送代码：")
        print(f"  python gitlab_push.py --gitlab-project {proj.get('path_with_namespace', gitlab_project)} --username {args.username} --token <token>")
        sys.exit(0)
    else:
        print(f"\n[ERROR] {result}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    # Force UTF-8 output encoding (Windows compatibility)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
